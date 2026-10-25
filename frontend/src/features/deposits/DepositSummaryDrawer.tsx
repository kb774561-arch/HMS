import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, History } from "lucide-react";
import { Drawer } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/menu";
import { useModulePermissions } from "@/features/auth/AuthProvider";
import { CollectDepositModal, DepositLedgerDrawer, RefundDepositModal } from "./DepositDialogs";
import { depositApi } from "@/services/api";
import { formatDate, inr } from "@/lib/format";
import type { DepositRow } from "@/types";

/** Dashboard pop-up: deposits are a liability, shown apart from rent and expenses. */
export function DepositSummaryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const perm = useModulePermissions("/deposits");
  const { data, isLoading } = useQuery({ queryKey: ["deposits"], queryFn: depositApi.summary, enabled: open });
  const [collect, setCollect] = useState<{ row: DepositRow | null } | null>(null);
  const [refund, setRefund] = useState<DepositRow | null>(null);
  const [ledger, setLedger] = useState<DepositRow | null>(null);
  const s = data?.summary;
  const rows = (data?.items ?? []).filter((r) => r.transactions > 0);

  return (
    <>
      <Drawer
        open={open && !collect && !refund && !ledger}
        onClose={onClose}
        size="xl"
        title="Security deposits"
        description="Held on behalf of tenants — not counted as rent or expenditure."
        footer={
          perm.add && (
            <Button onClick={() => setCollect({ row: null })}>
              <ArrowDownLeft className="h-4 w-4" /> Collect deposit
            </Button>
          )
        }
      >
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Total received", s?.received],
              ["Total refunded", s?.refunded],
              ["Applied to rent / deductions", s?.applied],
              ["Remaining balance", s?.balance],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border border-border p-3">
                <dt className="text-xs text-fg-subtle">{k}</dt>
                <dd className="tabular mt-0.5 text-lg font-extrabold text-fg">{isLoading ? "…" : inr((v as number) ?? 0)}</dd>
              </div>
            ))}
          </dl>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
          ) : !rows.length ? (
            <p className="py-10 text-center text-sm text-fg-muted">No deposits recorded yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Deposits by tenant</caption>
                <thead>
                  <tr className="border-b border-border bg-surface-2/60 text-xs text-fg-muted uppercase">
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Tenant</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Room</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Received</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Refunded</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Balance</th>
                    <th scope="col" className="hidden px-3 py-2 text-left font-semibold sm:table-cell">Last txn</th>
                    <th scope="col" className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.tenantId} className="border-b border-border last:border-0">
                      <td className="px-3 py-2.5 font-semibold text-fg">{r.tenantName}</td>
                      <td className="px-3 py-2.5 text-fg-muted">{r.roomNumber ?? "—"}</td>
                      <td className="tabular px-3 py-2.5 text-right">{inr(r.received)}</td>
                      <td className="tabular px-3 py-2.5 text-right">{inr(r.refunded)}</td>
                      <td className="tabular px-3 py-2.5 text-right font-bold">{inr(r.balance)}</td>
                      <td className="hidden px-3 py-2.5 text-fg-muted sm:table-cell">{formatDate(r.lastTxnDate)}</td>
                      <td className="px-1 py-1 text-right">
                        <ActionMenu
                          actions={[
                            { label: "View history", icon: History, onSelect: () => setLedger(r) },
                            { label: "Collect deposit", icon: ArrowDownLeft, onSelect: () => setCollect({ row: r }), hidden: !perm.add },
                            { label: "Refund deposit", icon: ArrowUpRight, onSelect: () => setRefund(r), hidden: !perm.edit || r.balance <= 0 },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Drawer>
      <CollectDepositModal open={Boolean(collect)} row={collect?.row ?? null} onClose={() => setCollect(null)} />
      <RefundDepositModal row={refund} onClose={() => setRefund(null)} />
      <DepositLedgerDrawer row={ledger} onClose={() => setLedger(null)} />
    </>
  );
}
