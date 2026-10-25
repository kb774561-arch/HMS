import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, BedDouble, CalendarDays, IndianRupee, MessageCircle, Pencil, Phone, PlusCircle, Receipt, Wallet } from "lucide-react";
import { Drawer } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { InlineTabs } from "@/components/ui/tabs";
import { bedOpsApi, tenantApi } from "@/services/api";
import { formatDate, initials, inr, methodLabel, monthLabel } from "@/lib/format";
import type { TenantDetail } from "@/types";

function Info({ icon: Icon, label, children }: { icon: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-fg-subtle">{label}</p>
        <div className="truncate text-sm font-semibold text-fg">{children}</div>
      </div>
    </div>
  );
}

function MiniTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-fg-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-fg-subtle uppercase">
            {head.map((h, i) => (
              <th key={h} className={`py-2 pr-3 font-semibold ${i === head.length - 1 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {r.map((c, j) => (
                <td key={j} className={`tabular py-2.5 pr-3 ${j === r.length - 1 ? "text-right" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TenantViewDrawer({
  tenantId,
  onClose,
  onEdit,
  onCollect,
  onAddCharge,
  onAllocate,
  onTransfer,
  canEdit,
  canCollect,
}: {
  tenantId: string | null;
  onClose: () => void;
  onEdit: (t: TenantDetail) => void;
  onCollect: (t: TenantDetail) => void;
  onAddCharge: (t: TenantDetail) => void;
  onAllocate: (t: TenantDetail) => void;
  onTransfer: (t: TenantDetail) => void;
  canEdit: boolean;
  canCollect: boolean;
}) {
  const [tab, setTab] = useState("rent");
  const { data: t, isLoading, error } = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => tenantApi.get(tenantId!),
    enabled: Boolean(tenantId),
  });
  const bedHistory = useQuery({
    queryKey: ["tenant", tenantId, "bed-history"],
    queryFn: () => bedOpsApi.history(tenantId!),
    enabled: Boolean(tenantId) && tab === "history",
  });

  return (
    <Drawer
      open={Boolean(tenantId)}
      onClose={onClose}
      size="lg"
      title="Tenant details"
      footer={
        t && (
          <>
            {canEdit && t.isActive && (
              <Button variant="ghost" className="mr-auto" onClick={() => onAddCharge(t)}>
                <PlusCircle className="h-4 w-4" /> Add charge
              </Button>
            )}
            {canEdit && t.accommodation === "UNALLOCATED" && (
              <Button variant="outline" onClick={() => onAllocate(t)}>
                <BedDouble className="h-4 w-4" /> Allocate bed
              </Button>
            )}
            {canEdit && t.accommodation === "RESIDING" && (
              <Button variant="outline" onClick={() => onTransfer(t)}>
                <ArrowLeftRight className="h-4 w-4" /> Transfer / Swap
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => onEdit(t)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            {canCollect && t.isActive && (
              <Button onClick={() => onCollect(t)}>
                <Wallet className="h-4 w-4" /> Collect rent
              </Button>
            )}
          </>
        )
      }
    >
      {isLoading && (
        <div className="space-y-3" role="status" aria-label="Loading">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      )}
      {error && <p className="text-sm text-danger">Couldn't load this tenant.</p>}
      {t && (
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-lg font-bold text-primary-soft-fg">
              {initials(t.tenantName)}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-extrabold text-fg">{t.tenantName}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={t.status} />
                {t.accommodation === "UNALLOCATED" && <Badge tone="warning">Unallocated</Badge>}
                {t.roomNumber && (
                  <span className="text-sm text-fg-muted">
                    {t.roomNumber} · {t.bedCode}
                  </span>
                )}
              </div>
            </div>
            {t.whatsappLink && (
              <a href={t.whatsappLink} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${t.tenantName}`}>
                <Button variant="soft" size="icon">
                  <MessageCircle className="h-4.5 w-4.5" />
                </Button>
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-fg-subtle">Rent outstanding</p>
              <p className={`tabular text-lg font-extrabold ${t.outstanding > 0 ? "text-danger" : "text-fg"}`}>{inr(t.outstanding)}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-fg-subtle">Monthly rent</p>
              <p className="tabular text-lg font-extrabold text-fg">{inr(t.monthlyRent)}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-border p-3 sm:col-span-1">
              <p className="text-xs text-fg-subtle">Deposit held</p>
              <p className="tabular text-lg font-extrabold text-fg">
                {inr(t.depositBalance)}
                {t.securityDeposit > t.depositBalance && (
                  <span className="ml-1 text-xs font-medium text-fg-subtle">of {inr(t.securityDeposit)}</span>
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-xl bg-surface-2 p-4 sm:grid-cols-2">
            <Info icon={Phone} label="WhatsApp">{t.whatsappNumber ?? "—"}</Info>
            <Info icon={Phone} label="Parent">{t.parentNumber ?? "—"}</Info>
            <Info icon={CalendarDays} label="Joined">{formatDate(t.joiningDate)}</Info>
            <Info icon={CalendarDays} label="Leaving">{formatDate(t.leavingDate)}</Info>
            <Info icon={BedDouble} label="Room / Bed">{t.roomNumber ? `${t.roomNumber} / ${t.bedCode}` : "Not assigned"}</Info>
            <Info icon={IndianRupee} label="Agreed deposit">{inr(t.securityDeposit)}</Info>
          </div>
          {t.notes && <p className="rounded-xl border border-border p-3 text-sm whitespace-pre-wrap text-fg-muted">{t.notes}</p>}

          <div>
            <InlineTabs
              label="Tenant records"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "rent", label: `Rent (${t.invoices.length})` },
                { id: "payments", label: `Payments (${t.payments.length})` },
                { id: "deposits", label: `Deposit (${t.deposits.length})` },
                { id: "history", label: "Bed history" },
              ]}
            />
            <div className="pt-3">
              {tab === "rent" && (
                <MiniTable
                  empty="No rent generated yet."
                  head={["Month", "Payable", "Paid", "Status", "Pending"]}
                  rows={t.invoices.map((i) => [
                    <span key="m">
                      {monthLabel(i.billingMonth, i.billingYear)}
                      {i.source === "MANUAL" && <span className="ml-1.5 text-xs text-fg-subtle">manual</span>}
                    </span>,
                    inr(i.totalPayable),
                    inr(i.paidAmount),
                    <StatusBadge key="s" status={i.status} />,
                    <span key="p" className={i.pendingAmount > 0 ? "font-semibold text-danger" : ""}>
                      {inr(i.pendingAmount)}
                    </span>,
                  ])}
                />
              )}
              {tab === "payments" && (
                <MiniTable
                  empty="No payments recorded yet."
                  head={["Date", "Receipt", "Method", "Amount"]}
                  rows={t.payments.map((p) => [
                    formatDate(p.paymentDate),
                    <span key="r" className="inline-flex items-center gap-1">
                      <Receipt className="h-3.5 w-3.5 text-fg-subtle" /> {p.receiptNumber ?? "—"}
                    </span>,
                    `${methodLabel(p.paymentMethod)} · ${p.account}`,
                    <strong key="a">{inr(p.amountReceived)}</strong>,
                  ])}
                />
              )}
              {tab === "deposits" && (
                <MiniTable
                  empty="No deposit transactions."
                  head={["Date", "Type", "Account", "Amount"]}
                  rows={t.deposits.map((d) => [formatDate(d.txnDate), <StatusBadge key="t" status={d.txnType} />, d.account ?? "—", inr(d.amount)])}
                />
              )}
              {tab === "history" && (
                <div className="space-y-5">
                  <div>
                    <p className="mb-1 text-xs font-bold tracking-wider text-fg-subtle uppercase">Transfers & swaps</p>
                    {bedHistory.isLoading ? (
                      <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
                    ) : (
                      <MiniTable
                        empty="No room or bed transfers."
                        head={["Date", "Type", "Previous", "New", "Reason / by"]}
                        rows={(bedHistory.data ?? []).map((x) => [
                          formatDate(x.date),
                          <span key="t">
                            <Badge tone={x.operationType === "SWAP" ? "info" : "primary"} dot={false}>
                              {x.operationType === "SWAP" ? "Swap" : "Transfer"}
                            </Badge>
                            {x.otherStudent && <span className="mt-0.5 block text-xs text-fg-subtle">with {x.otherStudent}</span>}
                          </span>,
                          `${x.previousRoom} / ${x.previousBed}`,
                          <strong key="n">
                            {x.newRoom} / {x.newBed}
                          </strong>,
                          <span key="r" className="text-xs">
                            {x.reason ?? "—"}
                            <span className="block text-fg-subtle">{x.performedBy ?? ""}</span>
                          </span>,
                        ])}
                      />
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-bold tracking-wider text-fg-subtle uppercase">All allocations</p>
                <MiniTable
                  empty="No bed history."
                  head={["Room / Bed", "From", "To", "Rent"]}
                  rows={t.allocations.map((a) => [
                    `${a.roomNumber} / ${a.bedCode}`,
                    formatDate(a.startDate),
                    a.endDate ? formatDate(a.endDate) : <StatusBadge key="c" status="ACTIVE" />,
                    inr(a.monthlyRent),
                  ])}
                />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
