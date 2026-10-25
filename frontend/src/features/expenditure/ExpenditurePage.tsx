import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Download, Eye, HandCoins, Layers, Pencil, Plus, Receipt, Tags } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Meter, StatGrid, StatTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, CardField, type Column } from "@/components/ui/data-table";
import { FilterSelect, MonthYearPicker, SearchInput, Toolbar } from "@/components/ui/toolbar";
import { Switch } from "@/components/ui/field";
import { useAuth, useModulePermissions } from "@/features/auth/AuthProvider";
import { CategoryManagerModal, ExpenseFormModal, ExpenseViewModal, useExpenseCategories, VoidExpenseDialog } from "./ExpenseDialogs";
import { expenseApi } from "@/services/api";
import { downloadWorkbook } from "@/lib/excel";
import { currentMonthYear, formatDate, inr, methodLabel, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Expense } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

export function ExpenditurePage() {
  const perm = useModulePermissions("/expenditure");
  const { isSuperAdmin } = useAuth();
  const [{ month, year }, setPeriod] = useState(currentMonthYear);
  const [day, setDay] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [showVoided, setShowVoided] = useState(false);

  const [form, setForm] = useState<{ open: boolean; expense: Expense | null }>({ open: false, expense: null });
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const from = day || `${year}-${pad(month)}-01`;
  const to = day || `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
  const params = { from, to, categoryId: categoryId || undefined, search: search || undefined, includeVoided: showVoided };
  const query = useQuery({ queryKey: ["expenses", params], queryFn: () => expenseApi.list(params), placeholderData: (p) => p });
  const categories = useExpenseCategories();

  const items = query.data?.items ?? [];
  const s = query.data?.summary;
  const maxCat = useMemo(() => Math.max(1, ...(s?.byCategory ?? []).map((c) => c.amount)), [s]);
  const period = day ? formatDate(day) : monthLabel(month, year);

  const columns: Column<Expense>[] = [
    { id: "date", header: "Date", sortValue: (e) => `${e.expenseDate}${e.createdAt}`, cell: (e) => <span className="whitespace-nowrap">{formatDate(e.expenseDate)}</span> },
    { id: "category", header: "Category", sortValue: (e) => e.category, cell: (e) => <Badge tone="primary" dot={false}>{e.category}</Badge> },
    {
      id: "description",
      header: "Description",
      sortValue: (e) => e.description,
      cell: (e) => (
        <div className="min-w-0">
          <p className={cn("truncate font-medium", e.voidedAt && "text-fg-subtle line-through")}>{e.description}</p>
          {e.voidedAt && <p className="text-xs text-danger">Voided — {e.voidReason}</p>}
        </div>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortValue: (e) => e.amount,
      cell: (e) => <span className={cn("tabular font-bold", e.voidedAt && "text-fg-subtle line-through")}>{inr(e.amount)}</span>,
    },
    { id: "account", header: "Paid from", sortValue: (e) => e.account, cell: (e) => e.account, hideBelow: "lg" },
    { id: "method", header: "Method", sortValue: (e) => e.paymentMethod, cell: (e) => methodLabel(e.paymentMethod), hideBelow: "lg" },
    { id: "notes", header: "Notes", cell: (e) => <span className="block max-w-48 truncate text-fg-muted">{e.notes ?? "—"}</span>, hideBelow: "xl" },
  ];

  const exportExcel = () =>
    downloadWorkbook(
      [
        {
          name: "Expenditure",
          rows: items
            .filter((e) => !e.voidedAt)
            .map((e) => ({
              Date: e.expenseDate.slice(0, 10),
              Category: e.category,
              Description: e.description,
              Amount: e.amount,
              PaymentMethod: methodLabel(e.paymentMethod),
              PaidFrom: e.account,
              Reference: e.transactionReference ?? "",
              Notes: e.notes ?? "",
              CreatedBy: e.createdBy ?? "",
            })),
        },
      ],
      `expenditure-${from}-${to}`,
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expenditure"
        description="Daily PG running costs — food, milk, electricity, salaries and more."
        actions={
          <>
            <MonthYearPicker
              month={month}
              year={year}
              onChange={(m, y) => {
                setPeriod({ month: m, year: y });
                setDay("");
              }}
            />
            {isSuperAdmin && (
              <Button variant="outline" size="icon" onClick={() => setCategoriesOpen(true)} aria-label="Manage categories" title="Manage categories">
                <Tags className="h-4 w-4" />
              </Button>
            )}
            {perm.exportData && (
              <Button variant="outline" size="icon" onClick={exportExcel} disabled={!items.length} aria-label="Export to Excel" title="Export to Excel">
                <Download className="h-4 w-4" />
              </Button>
            )}
            {perm.add && (
              <Button onClick={() => setForm({ open: true, expense: null })}>
                <Plus className="h-4 w-4" /> Add expenditure
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
        <StatGrid cols={3}>
          <StatTile label={`Total — ${period}`} value={inr(s?.total ?? 0)} icon={HandCoins} tone="danger" loading={query.isLoading} />
          <StatTile label="Entries" value={s?.count ?? 0} hint={s?.voided ? `${s.voided} voided shown` : undefined} icon={Receipt} tone="neutral" loading={query.isLoading} />
          <StatTile label="Categories used" value={s?.byCategory.length ?? 0} icon={Layers} tone="info" loading={query.isLoading} />
        </StatGrid>
        <Card>
          <CardHeader title="By category" description={period} className="py-3" />
          <ul className="grid gap-x-6 gap-y-2.5 px-4 py-3 sm:grid-cols-2 sm:px-5">
            {!s?.byCategory.length ? (
              <li className="text-sm text-fg-muted">No expenditure recorded for this period.</li>
            ) : (
              s.byCategory.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="font-medium text-fg">{c.category}</span>
                    <span className="tabular font-semibold text-fg">{inr(c.amount)}</span>
                  </div>
                  <Meter value={(c.amount / maxCat) * 100} label={`${c.category} spend`} />
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      <Card>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search description, notes or ref." label="Search expenditure" />
          <FilterSelect
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            options={[{ value: "", label: "All categories" }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <input
            type="date"
            aria-label="Single day"
            value={day}
            min={`${year}-${pad(month)}-01`}
            max={`${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`}
            onChange={(e) => setDay(e.target.value)}
            className="h-10 rounded-lg border border-border-strong bg-surface px-3 text-base text-fg focus:border-primary focus:outline-none sm:text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-fg-muted sm:ml-auto">
            <Switch checked={showVoided} onChange={setShowVoided} label="Show voided entries" />
            Show voided
          </label>
        </Toolbar>
        <DataTable
          caption={`Expenditure — ${period}`}
          columns={columns}
          rows={items}
          getRowId={(e) => e.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          resetKey={JSON.stringify(params)}
          initialSort={{ id: "date", dir: "desc" }}
          onRowClick={(e) => setViewing(e)}
          rowActions={(e) => [
            { label: "View", icon: Eye, onSelect: () => setViewing(e) },
            { label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, expense: e }), hidden: !perm.edit || Boolean(e.voidedAt) },
            { label: "Void", icon: Ban, tone: "danger", onSelect: () => setVoiding(e), hidden: !perm.remove || Boolean(e.voidedAt), separatorBefore: true },
          ]}
          emptyTitle={search || categoryId || day ? "No expenditure matches" : `No expenditure for ${period}`}
          emptyDescription={search || categoryId || day ? "Clear the filters to see everything for the month." : "Record the first expense of the month."}
          emptyAction={
            perm.add && !search && !categoryId && !day ? (
              <Button onClick={() => setForm({ open: true, expense: null })}>
                <Plus className="h-4 w-4" /> Add expenditure
              </Button>
            ) : undefined
          }
          mobileCard={(e, menu) => (
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("truncate font-semibold text-fg", e.voidedAt && "line-through")}>{e.description}</p>
                  <p className="text-xs text-fg-subtle">
                    {formatDate(e.expenseDate)} · {e.category}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className={cn("tabular text-base font-bold text-fg", e.voidedAt && "text-fg-subtle line-through")}>{inr(e.amount)}</span>
                  {menu}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CardField label="Paid from">{e.account}</CardField>
                <CardField label="Method">{methodLabel(e.paymentMethod)}</CardField>
              </div>
            </div>
          )}
        />
      </Card>

      <ExpenseFormModal open={form.open} expense={form.expense} onClose={() => setForm({ open: false, expense: null })} />
      <ExpenseViewModal
        expense={viewing}
        canEdit={perm.edit}
        onClose={() => setViewing(null)}
        onEdit={(e) => {
          setViewing(null);
          setForm({ open: true, expense: e });
        }}
      />
      <VoidExpenseDialog expense={voiding} onClose={() => setVoiding(null)} />
      {isSuperAdmin && <CategoryManagerModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />}
    </div>
  );
}
