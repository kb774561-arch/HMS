import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, Download, Eye, FileDown, Landmark, Plus, Printer, Smartphone, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Meter, StatGrid, StatTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, CardField, type Column } from "@/components/ui/data-table";
import { FilterSelect, SearchInput, Toolbar } from "@/components/ui/toolbar";
import { useModulePermissions } from "@/features/auth/AuthProvider";
import { CollectPaymentModal } from "./CollectPaymentModal";
import { ReceiptModal } from "./ReceiptModal";
import { paymentApi, settingsApi } from "@/services/api";
import { downloadReceiptPdf } from "@/lib/receiptPdf";
import { downloadWorkbook } from "@/lib/excel";
import { handleApiError } from "@/lib/errors";
import { currentMonthYear, formatDate, inr, methodLabel, PAYMENT_METHODS, todayIso } from "@/lib/format";
import type { Payment, Receipt } from "@/types";

function monthStartIso() {
  const { month, year } = currentMonthYear();
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

const RANGES = [
  { value: "month", label: "This month" },
  { value: "last", label: "Last month" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

function rangeDates(range: string): { from?: string; to?: string } {
  const today = todayIso();
  if (range === "month") return { from: monthStartIso(), to: today };
  if (range === "last") {
    const { month, year } = currentMonthYear();
    const start = new Date(Date.UTC(year, month - 2, 1));
    const end = new Date(Date.UTC(year, month - 1, 0));
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  if (range === "90") {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 89);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  return {};
}

export function PaymentsPage() {
  const perm = useModulePermissions("/payments");
  const [range, setRange] = useState("month");
  const [custom, setCustom] = useState({ from: monthStartIso(), to: todayIso() });
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [collectOpen, setCollectOpen] = useState(false);
  const [viewing, setViewing] = useState<{ paymentId?: string; receipt?: Receipt; print?: boolean; fresh?: boolean } | null>(null);

  const dates = range === "custom" ? custom : rangeDates(range);
  const params = { ...dates, accountId: accountId || undefined, method: method || undefined, search: search || undefined };
  const query = useQuery({ queryKey: ["payments", params], queryFn: () => paymentApi.list(params), placeholderData: (p) => p });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: settingsApi.accounts });

  const items = query.data?.items ?? [];
  const s = query.data?.summary;
  const maxAccount = useMemo(() => Math.max(1, ...(s?.accounts ?? []).map((a) => a.amount)), [s]);

  const download = async (p: Payment) => {
    try {
      await downloadReceiptPdf(await paymentApi.receipt(p.id));
    } catch (err) {
      handleApiError(err);
    }
  };

  const exportExcel = () => {
    downloadWorkbook(
      [
        {
          name: "Payments",
          rows: items.map((p) => ({
            Date: p.paymentDate.slice(0, 10),
            Receipt: p.receiptNumber ?? "",
            Tenant: p.tenantName,
            Room: p.roomNumber ?? "",
            Amount: p.amountReceived,
            Method: methodLabel(p.paymentMethod),
            Account: p.account,
            Reference: p.transactionReference ?? "",
            RecordedBy: p.recordedBy ?? "",
          })),
        },
      ],
      `payments-${dates.from ?? "all"}-${dates.to ?? todayIso()}`,
    );
    toast.success("Payments exported");
  };

  const columns: Column<Payment>[] = [
    { id: "date", header: "Date", sortValue: (p) => `${p.paymentDate}${p.createdAt}`, cell: (p) => <span className="whitespace-nowrap">{formatDate(p.paymentDate)}</span> },
    { id: "tenant", header: "Tenant", sortValue: (p) => p.tenantName, cell: (p) => <span className="font-semibold">{p.tenantName}</span> },
    { id: "room", header: "Room", sortValue: (p) => p.roomNumber, cell: (p) => p.roomNumber ?? <span className="text-fg-subtle">—</span>, hideBelow: "lg" },
    { id: "amount", header: "Amount", align: "right", sortValue: (p) => p.amountReceived, cell: (p) => <span className="tabular font-bold">{inr(p.amountReceived)}</span> },
    { id: "method", header: "Method", sortValue: (p) => p.paymentMethod, cell: (p) => <Badge tone={p.paymentMethod === "CASH" ? "warning" : "info"} dot={false}>{methodLabel(p.paymentMethod)}</Badge> },
    { id: "account", header: "Account", sortValue: (p) => p.account, cell: (p) => p.account, hideBelow: "lg" },
    { id: "receipt", header: "Receipt no.", sortValue: (p) => p.receiptNumber, cell: (p) => <span className="tabular text-[13px] text-fg-muted">{p.receiptNumber ?? "—"}</span>, hideBelow: "xl" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description="Every rupee collected, by method and receiving account, with receipts."
        actions={
          <>
            {perm.exportData && (
              <Button variant="outline" onClick={exportExcel} disabled={!items.length}>
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            {perm.add && (
              <Button onClick={() => setCollectOpen(true)}>
                <Plus className="h-4 w-4" /> Collect payment
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <StatGrid cols={3}>
          <StatTile label="Total collections" value={inr(s?.total ?? 0)} hint={s ? `${s.count} payment${s.count === 1 ? "" : "s"}` : undefined} icon={Wallet} loading={query.isLoading} />
          <StatTile label="Cash" value={inr(s?.cash ?? 0)} icon={Banknote} tone="warning" loading={query.isLoading} />
          <StatTile label="Online" value={inr(s?.online ?? 0)} hint="UPI, bank & other" icon={Smartphone} tone="info" loading={query.isLoading} />
        </StatGrid>
        <Card>
          <CardHeader title="By account" className="py-3" />
          <ul className="space-y-3 px-4 py-3 sm:px-5">
            {query.isLoading ? (
              <li className="h-10 animate-pulse rounded bg-surface-2" />
            ) : !s?.accounts.length ? (
              <li className="text-sm text-fg-muted">No collections in this period.</li>
            ) : (
              s.accounts.map((a) => (
                <li key={a.account}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-fg">
                      <Landmark className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden /> {a.account}
                    </span>
                    <span className="tabular font-semibold text-fg">{inr(a.amount)}</span>
                  </div>
                  <Meter value={(a.amount / maxAccount) * 100} label={`${a.account} share`} />
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      <Card>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Tenant, receipt or reference" label="Search payments" />
          <FilterSelect label="Date range" value={range} onChange={setRange} options={RANGES} />
          {range === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="From date"
                value={custom.from}
                max={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-2 text-base text-fg sm:text-sm"
              />
              <span className="text-fg-subtle">–</span>
              <input
                type="date"
                aria-label="To date"
                value={custom.to}
                min={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-2 text-base text-fg sm:text-sm"
              />
            </div>
          )}
          <FilterSelect
            label="Account"
            value={accountId}
            onChange={setAccountId}
            options={[{ value: "", label: "All accounts" }, ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.accountName }))]}
          />
          <FilterSelect label="Method" value={method} onChange={setMethod} options={[{ value: "", label: "All methods" }, ...PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))]} />
        </Toolbar>
        <DataTable
          caption="Payments"
          columns={columns}
          rows={items}
          getRowId={(p) => p.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          resetKey={JSON.stringify(params)}
          initialSort={{ id: "date", dir: "desc" }}
          onRowClick={(p) => setViewing({ paymentId: p.id })}
          rowActions={(p) => [
            { label: "View receipt", icon: Eye, onSelect: () => setViewing({ paymentId: p.id }) },
            { label: "Download PDF", icon: FileDown, onSelect: () => void download(p) },
            { label: "Print receipt", icon: Printer, onSelect: () => setViewing({ paymentId: p.id, print: true }), hidden: !perm.print },
          ]}
          emptyTitle="No payments found"
          emptyDescription={range === "all" && !accountId && !method && !search ? "Collected rent will appear here." : "Try a wider date range or clear the filters."}
          mobileCard={(p, menu) => (
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{p.tenantName}</p>
                  <p className="text-xs text-fg-subtle">
                    {formatDate(p.paymentDate)} · {p.receiptNumber}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="tabular text-base font-bold text-fg">{inr(p.amountReceived)}</span>
                  {menu}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <CardField label="Method">{methodLabel(p.paymentMethod)}</CardField>
                <CardField label="Account">{p.account}</CardField>
                <CardField label="Room">{p.roomNumber ?? "—"}</CardField>
              </div>
            </div>
          )}
        />
      </Card>

      <CollectPaymentModal
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        onCollected={(r) => {
          setCollectOpen(false);
          setViewing({ receipt: r, fresh: true });
        }}
      />
      <ReceiptModal
        open={Boolean(viewing)}
        paymentId={viewing?.paymentId}
        receipt={viewing?.receipt}
        justCollected={viewing?.fresh}
        autoPrint={viewing?.print}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
