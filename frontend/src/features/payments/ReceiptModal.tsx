import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, Loader2, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { paymentApi } from "@/services/api";
import { downloadReceiptPdf } from "@/lib/receiptPdf";
import { formatDate, inr, methodLabel } from "@/lib/format";
import type { Receipt } from "@/types";

export function ReceiptView({ r }: { r: Receipt }) {
  return (
    <div className="print-area overflow-hidden rounded-xl border border-border">
      <div className="flex items-start justify-between gap-3 bg-sidebar px-5 py-4 text-white">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold">{r.pg.name}</p>
          <p className="truncate text-xs text-sidebar-fg">{[r.pg.address, r.pg.phone].filter(Boolean).join(" · ") || "Payment receipt"}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold tracking-wider text-violet-200 uppercase">Receipt</p>
          <p className="tabular text-sm font-semibold">{r.receiptNumber}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-sm">
        {[
          ["Date", formatDate(r.receiptDate)],
          ["Tenant", r.tenantName],
          ["Room / Bed", [r.roomNumber, r.bedCode].filter(Boolean).join(" / ") || "—"],
          ["Method", methodLabel(r.paymentMethod)],
          ["Received in", r.account],
          ["Reference", r.transactionReference || "—"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-fg-subtle">{k}</dt>
            <dd className="truncate font-semibold text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-border px-5 py-3">
        <p className="mb-2 text-xs font-bold tracking-wider text-fg-subtle uppercase">Applied to</p>
        <ul className="space-y-1.5 text-sm">
          {r.months.map((m) => (
            <li key={m.label} className="flex justify-between gap-3">
              <span className="text-fg-muted">Rent — {m.label}</span>
              <span className="tabular font-semibold text-fg">{inr(m.amount)}</span>
            </li>
          ))}
          {r.unallocatedAmount > 0 && (
            <li className="flex justify-between gap-3">
              <span className="text-fg-muted">Advance (kept on account)</span>
              <span className="tabular font-semibold text-fg">{inr(r.unallocatedAmount)}</span>
            </li>
          )}
        </ul>
      </div>
      <div className="flex items-center justify-between bg-primary-soft px-5 py-3">
        <span className="font-bold text-primary-soft-fg">Total received</span>
        <span className="tabular text-xl font-extrabold text-primary-soft-fg">{inr(r.amountReceived)}</span>
      </div>
      <p className="px-5 py-3 text-sm text-fg-muted">
        {r.outstandingAfter > 0 ? (
          <>
            Balance still due: <strong className="text-danger">{inr(r.outstandingAfter)}</strong>
          </>
        ) : (
          "No rent is pending for this tenant."
        )}
      </p>
    </div>
  );
}

/** Pass either a receipt you already have (just collected) or a paymentId to load. */
export function ReceiptModal({
  open,
  onClose,
  receipt,
  paymentId,
  justCollected,
  autoPrint,
}: {
  open: boolean;
  onClose: () => void;
  receipt?: Receipt | null;
  paymentId?: string | null;
  justCollected?: boolean;
  /** Open the browser print dialog as soon as the receipt is ready. */
  autoPrint?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["receipt", paymentId],
    queryFn: () => paymentApi.receipt(paymentId!),
    enabled: open && !receipt && Boolean(paymentId),
  });
  const r = receipt ?? data;

  useEffect(() => {
    if (!open || !autoPrint || !r) return;
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [open, autoPrint, r]);

  const download = async () => {
    if (!r) return;
    setDownloading(true);
    try {
      await downloadReceiptPdf(r);
    } catch {
      toast.error("Couldn't create the PDF. Try Print → Save as PDF instead.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        justCollected ? (
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> Payment recorded
          </span>
        ) : (
          "Receipt"
        )
      }
      description={r ? `${r.receiptNumber} · ${r.tenantName}` : undefined}
      footer={
        r && (
          <>
            {r.whatsappLink && (
              <a href={r.whatsappLink} target="_blank" rel="noreferrer" className="w-full sm:mr-auto sm:w-auto">
                <Button variant="soft" className="w-full">
                  <MessageCircle className="h-4 w-4" /> Send on WhatsApp
                </Button>
              </a>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button onClick={download} loading={downloading}>
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </>
        )
      }
    >
      {isLoading && (
        <div className="flex justify-center py-12" role="status" aria-label="Loading receipt">
          <Loader2 className="h-6 w-6 animate-spin text-primary-text" />
        </div>
      )}
      {error && <p className="text-sm text-danger">Couldn't load this receipt.</p>}
      {r && <ReceiptView r={r} />}
    </Modal>
  );
}
