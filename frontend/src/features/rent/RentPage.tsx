import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock, Download, FileText, IndianRupee, MessageCircle, PenLine, Plus, Sparkles, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, StatGrid, StatTile } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DataTable, CardField, type Column } from "@/components/ui/data-table";
import { MonthYearPicker, SearchInput, Segmented, Toolbar } from "@/components/ui/toolbar";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useAuth, useModulePermissions } from "@/features/auth/AuthProvider";
import { CollectPaymentModal } from "@/features/payments/CollectPaymentModal";
import { ReceiptModal } from "@/features/payments/ReceiptModal";
import { AdjustInvoiceModal, ManualRentModal } from "./ManualRentModal";
import { rentApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { downloadWorkbook } from "@/lib/excel";
import { currentMonthYear, formatDate, inr, monthLabel, whatsappLink } from "@/lib/format";
import type { Receipt, RentRow } from "@/types";

type Filter = "all" | "pending" | "paid";

export function RentPage() {
  const perm = useModulePermissions("/rent");
  const { can } = useAuth();
  const canCollect = can("/payments", "ADD") || perm.add;
  const refresh = useRefreshFinance();

  const [{ month, year }, setPeriod] = useState(currentMonthYear);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [collect, setCollect] = useState<{ tenantId: string; invoiceId: string } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<{
    id: string;
    tenantName: string;
    baseRent: number;
    paidAmount: number;
    label: string;
    originalAmount?: number | null;
  } | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  const query = useQuery({
    queryKey: ["rent", month, year],
    queryFn: () => rentApi.overview(month, year),
    placeholderData: (prev) => prev,
  });
  const data = query.data;
  const period = monthLabel(month, year);

  const generate = useMutation({
    mutationFn: () => rentApi.generate(month, year),
    onSuccess: async (res) => {
      setConfirmGenerate(false);
      if (res.created) toast.success(`Rent generated for ${res.created} tenant${res.created === 1 ? "" : "s"}`, { description: period });
      else toast.info("Nothing new to generate", { description: `All active tenants already have rent for ${period}.` });
      await refresh();
    },
    onError: (err) => handleApiError(err),
  });

  const rows = useMemo(
    () =>
      (data?.items ?? []).filter(
        (r) =>
          (filter === "all" || (filter === "paid" ? r.pendingAmount <= 0 : r.pendingAmount > 0)) &&
          (!search || r.tenantName.toLowerCase().includes(search.toLowerCase()) || r.roomNumber?.toLowerCase().includes(search.toLowerCase())),
      ),
    [data, filter, search],
  );

  const reminder = (r: RentRow) =>
    whatsappLink(
      r.whatsappNumber,
      `Hello ${r.tenantName},\n\nThis is a reminder that your rent of ${inr(r.pendingAmount)} for ${monthLabel(r.billingMonth, r.billingYear)} is pending.\n\nThank you,\nGenius Girls PG`,
    );

  const columns: Column<RentRow>[] = [
    {
      id: "tenant",
      header: "Tenant",
      sortValue: (r) => r.tenantName,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold">{r.tenantName}</p>
          {r.periodFrom && r.periodTo && (r.baseRent !== r.monthlyRent || r.source === "MANUAL") && (
            <p className="text-xs text-fg-subtle">
              {formatDate(r.periodFrom)} – {formatDate(r.periodTo)}
            </p>
          )}
          {r.adjustmentReason && <p className="truncate text-xs text-info" title={r.adjustmentReason}>Adjusted: {r.adjustmentReason}</p>}
          {r.additionalCharges > 0 && <p className="text-xs text-fg-subtle">incl. {inr(r.additionalCharges)} charges</p>}
        </div>
      ),
    },
    {
      id: "source",
      header: "Source",
      sortValue: (r) => r.source,
      cell: (r) => (
        <Badge tone={r.source === "MANUAL" ? "info" : "neutral"} dot={false}>
          {r.source === "MANUAL" ? "Manual" : "Auto"}
        </Badge>
      ),
      hideBelow: "xl",
    },
    { id: "room", header: "Room", sortValue: (r) => r.roomNumber, cell: (r) => (r.roomNumber ? `${r.roomNumber} · ${r.bedCode}` : <span className="text-fg-subtle">Left</span>) },
    { id: "rent", header: "Rent due", align: "right", sortValue: (r) => r.totalPayable, cell: (r) => <span className="tabular">{inr(r.totalPayable)}</span> },
    { id: "paid", header: "Paid", align: "right", sortValue: (r) => r.paidAmount, cell: (r) => <span className="tabular text-success">{inr(r.paidAmount)}</span>, hideBelow: "lg" },
    {
      id: "pending",
      header: "Pending",
      align: "right",
      sortValue: (r) => r.pendingAmount,
      cell: (r) => <span className={`tabular font-semibold ${r.pendingAmount > 0 ? "text-danger" : "text-fg-subtle"}`}>{inr(r.pendingAmount)}</span>,
    },
    { id: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    {
      id: "action",
      header: "Action",
      align: "right",
      cell: (r) =>
        r.pendingAmount > 0 && canCollect ? (
          <Button size="sm" onClick={(e) => (e.stopPropagation(), setCollect({ tenantId: r.tenantId, invoiceId: r.id }))}>
            <Wallet className="h-4 w-4" /> Collect
          </Button>
        ) : r.pendingAmount <= 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" /> Settled
          </span>
        ) : null,
    },
  ];

  const exportExcel = () =>
    downloadWorkbook(
      [
        {
          name: period,
          rows: rows.map((r) => ({
            Tenant: r.tenantName,
            Room: r.roomNumber ?? "",
            Bed: r.bedCode ?? "",
            BaseRent: r.baseRent,
            Charges: r.additionalCharges,
            Discount: r.discount,
            TotalDue: r.totalPayable,
            Paid: r.paidAmount,
            Pending: r.pendingAmount,
            Status: r.status,
          })),
        },
      ],
      `rent-${year}-${String(month).padStart(2, "0")}`,
    );

  const s = data?.summary;
  const notGenerated = data?.notGenerated ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Monthly Rent"
        description="Generate the month's rent, then collect and track what's pending."
        actions={
          <>
            <MonthYearPicker month={month} year={year} onChange={(m, y) => setPeriod({ month: m, year: y })} />
            {perm.add && (
              <Button variant="outline" onClick={() => setConfirmGenerate(true)} disabled={!notGenerated} title={notGenerated ? undefined : "Everyone with a bed already has rent for this month"}>
                <FileText className="h-4 w-4" /> <span className="hidden sm:inline">Generate monthly rent</span>
              </Button>
            )}
            {perm.add && (
              <Button onClick={() => setManualOpen(true)}>
                <Plus className="h-4 w-4" /> Manual rent entry
              </Button>
            )}
            {perm.exportData && (
              <Button variant="outline" size="icon" onClick={exportExcel} disabled={!rows.length} aria-label="Export to Excel" title="Export to Excel">
                <Download className="h-4 w-4" />
              </Button>
            )}
          </>
        }
      />

      {notGenerated > 0 && perm.add && (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary-soft-fg" aria-hidden />
            <div>
              <p className="font-semibold text-primary-soft-fg">
                {notGenerated} active tenant{notGenerated === 1 ? " has" : "s have"} no rent for {period} yet
              </p>
              <p className="text-[13px] text-fg-muted">
                Only tenants with a bed are billed automatically, prorated from their allocation. Existing bills are never duplicated.
              </p>
            </div>
          </div>
          <Button onClick={() => setConfirmGenerate(true)} loading={generate.isPending}>
            <FileText className="h-4 w-4" /> Generate rent
          </Button>
        </div>
      )}

      {(data?.rentNotSet.length ?? 0) > 0 && (
        <div role="status" className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-[13px] text-fg">
          <p className="font-semibold text-warning">
            Monthly rent not set for {data!.rentNotSet.length} tenant{data!.rentNotSet.length === 1 ? "" : "s"} — they are skipped by Generate rent.
          </p>
          <p className="mt-1 text-fg-muted">
            {data!.rentNotSet.map((t) => t.tenantName).join(", ")}. Set the rent from <strong className="text-fg">Tenants → Edit</strong>.
          </p>
        </div>
      )}

      {(data?.unallocatedWithoutInvoice ?? 0) > 0 && perm.add && (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-[13px] text-fg-muted">
          <strong className="text-fg">{data!.unallocatedWithoutInvoice}</strong> registered tenant
          {data!.unallocatedWithoutInvoice === 1 ? " has" : "s have"} no bed and no rent for {period}. They aren't billed automatically — use{" "}
          <button type="button" className="font-semibold text-primary-text hover:underline" onClick={() => setManualOpen(true)}>
            Manual rent entry
          </button>{" "}
          if a billable agreement exists.
        </p>
      )}

      <StatGrid cols={5}>
        <StatTile label="Total rent due" value={inr(s?.totalDue ?? 0)} icon={IndianRupee} loading={query.isLoading} />
        <StatTile label="Collected" value={inr(s?.collected ?? 0)} icon={CheckCircle2} tone="success" loading={query.isLoading} />
        <StatTile label="Pending" value={inr(s?.pending ?? 0)} icon={AlertCircle} tone="danger" loading={query.isLoading} />
        <StatTile label="Paid tenants" value={s?.paidTenants ?? 0} hint={s ? `of ${s.invoices}` : undefined} icon={CheckCircle2} tone="success" loading={query.isLoading} />
        <StatTile label="Pending tenants" value={s?.pendingTenants ?? 0} icon={Clock} tone="warning" loading={query.isLoading} />
      </StatGrid>

      <Card>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search tenant or room" label="Search rent" />
          <Segmented
            label="Payment status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: s?.invoices },
              { value: "pending", label: "Pending", count: s?.pendingTenants },
              { value: "paid", label: "Paid", count: s?.paidTenants },
            ]}
          />
        </Toolbar>
        <DataTable
          caption={`Rent for ${period}`}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          resetKey={`${month}-${year}-${filter}-${search}`}
          initialSort={{ id: "room", dir: "asc" }}
          rowActions={(r) => [
            { label: "Collect payment", icon: Wallet, onSelect: () => setCollect({ tenantId: r.tenantId, invoiceId: r.id }), hidden: !canCollect || r.pendingAmount <= 0 },
            {
              label: "Adjust rent",
              icon: PenLine,
              onSelect: () =>
                setAdjusting({
                  id: r.id,
                  tenantName: r.tenantName,
                  baseRent: r.baseRent,
                  paidAmount: r.paidAmount,
                  label: monthLabel(r.billingMonth, r.billingYear),
                  originalAmount: r.originalAmount,
                }),
              hidden: !perm.edit,
            },
            { label: "Send reminder", icon: MessageCircle, onSelect: () => window.open(reminder(r)!, "_blank", "noopener"), hidden: !r.whatsappNumber || r.pendingAmount <= 0 },
          ]}
          emptyTitle={data?.items.length ? "No rows match" : `No rent generated for ${period}`}
          emptyDescription={
            data?.items.length
              ? "Change the filter or search."
              : notGenerated
                ? "Use Generate rent above to create this month's bills."
                : "There are no active tenants to bill for this month."
          }
          mobileCard={(r, menu) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{r.tenantName}</p>
                  <p className="text-xs text-fg-subtle">{r.roomNumber ? `${r.roomNumber} · ${r.bedCode}` : "Left"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <StatusBadge status={r.status} />
                  {menu}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <CardField label="Due">{inr(r.totalPayable)}</CardField>
                <CardField label="Paid">{inr(r.paidAmount)}</CardField>
                <CardField label="Pending">
                  <span className={r.pendingAmount > 0 ? "text-danger" : ""}>{inr(r.pendingAmount)}</span>
                </CardField>
              </div>
              {r.pendingAmount > 0 && canCollect && (
                <Button className="w-full" onClick={() => setCollect({ tenantId: r.tenantId, invoiceId: r.id })}>
                  <Wallet className="h-4 w-4" /> Collect {inr(r.pendingAmount)}
                </Button>
              )}
            </div>
          )}
        />
      </Card>

      <ConfirmDialog
        open={confirmGenerate}
        onClose={() => setConfirmGenerate(false)}
        onConfirm={() => generate.mutate()}
        loading={generate.isPending}
        tone="primary"
        title={`Generate rent for ${period}?`}
        confirmLabel="Generate"
        message={`Creates a rent bill for ${notGenerated} active tenant${notGenerated === 1 ? "" : "s"} who don't have one for ${period}. Pending extra charges for the month are included.`}
      />
      <CollectPaymentModal
        open={Boolean(collect)}
        tenantId={collect?.tenantId}
        invoiceId={collect?.invoiceId}
        onClose={() => setCollect(null)}
        onCollected={(r) => {
          setCollect(null);
          setReceipt(r);
        }}
      />
      <ManualRentModal
        open={manualOpen}
        month={month}
        year={year}
        onClose={() => setManualOpen(false)}
        onAdjustExisting={(id, tenantName) => {
          const row = data?.items.find((i) => i.id === id);
          setManualOpen(false);
          setAdjusting({
            id,
            tenantName,
            baseRent: row?.baseRent ?? 0,
            paidAmount: row?.paidAmount ?? 0,
            label: row ? monthLabel(row.billingMonth, row.billingYear) : "",
            originalAmount: row?.originalAmount,
          });
        }}
        onCollect={(tenantId, invoiceId) => setCollect({ tenantId, invoiceId })}
      />
      <AdjustInvoiceModal invoice={adjusting} onClose={() => setAdjusting(null)} />
      <ReceiptModal open={Boolean(receipt)} receipt={receipt} justCollected onClose={() => setReceipt(null)} />
    </div>
  );
}
