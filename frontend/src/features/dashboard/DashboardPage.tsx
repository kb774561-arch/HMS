import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  CheckCircle2,
  ChevronRight,
  HandCoins,
  IndianRupee,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StateBox } from "@/components/ui/data-table";
import { MonthYearPicker } from "@/components/ui/toolbar";
import { useAuth } from "@/features/auth/AuthProvider";
import { DepositSummaryDrawer } from "@/features/deposits/DepositSummaryDrawer";
import { CategoryBars, RentCollectionBar, TrendChart } from "./Charts";
import { dashboardApi } from "@/services/api";
import { currentMonthYear, formatDate, inr, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const tones = {
  primary: "bg-primary-soft text-primary-soft-fg",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
} as const;

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  loading,
  children,
  onClick,
  actionLabel,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone: keyof typeof tones;
  loading?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-fg-muted">{label}</p>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tones[tone])} aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {loading ? (
        <div className="mt-1 h-7 w-24 animate-pulse rounded-md bg-surface-3" />
      ) : (
        <p className="tabular -mt-1 truncate text-xl font-extrabold tracking-tight text-fg sm:text-2xl">{value}</p>
      )}
      {children && !loading && <div className="mt-2 text-xs text-fg-muted">{children}</div>}
      {onClick && (
        <span className="mt-2 inline-flex items-center gap-0.5 text-xs font-semibold text-primary-text">
          {actionLabel} <ChevronRight className="h-3.5 w-3.5" />
        </span>
      )}
    </>
  );
  const cls = "flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-4 text-left shadow-soft";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "transition-colors hover:border-primary/40 hover:bg-primary-soft/30")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Split({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-0.5">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-1">
          <dt>{k}</dt>
          <dd className="tabular font-semibold text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DashboardPage() {
  const { user, can } = useAuth();
  const [{ month, year }, setPeriod] = useState(currentMonthYear);
  const [depositsOpen, setDepositsOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard", month, year],
    queryFn: () => dashboardApi.overview(month, year),
    placeholderData: (p) => p,
  });

  const period = monthLabel(month, year);
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (error && !data) {
    return (
      <Card>
        <StateBox icon={<AlertCircle className="h-6 w-6 text-danger" />} title="Couldn't load the dashboard" description={(error as Error).message}>
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </StateBox>
      </Card>
    );
  }

  const t = data?.tenants;
  const o = data?.occupancy;
  const r = data?.rent;
  const c = data?.cash;
  const d = data?.deposits;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting}, ${user?.fullName.split(" ")[0] ?? ""}`}
        description={`Genius Girls PG at a glance — ${period}.`}
        actions={<MonthYearPicker month={month} year={year} onChange={(m, y) => setPeriod({ month: m, year: y })} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total girls" value={t?.registered ?? "—"} icon={Users} tone="primary" loading={isLoading}>
          <Split items={[["Residing", t?.residing ?? 0], ["Unallocated", t?.unallocated ?? 0]]} />
        </Kpi>
        <Kpi label="Room occupancy" value={o ? `${o.occupancyPercentage}%` : "—"} icon={BedDouble} tone="info" loading={isLoading}>
          <Split items={[["Beds", o?.totalBeds ?? 0], ["Occupied", o?.occupiedBeds ?? 0], ["Free", o?.availableBeds ?? 0]]} />
        </Kpi>
        <Kpi label="Expected monthly rent" value={inr(r?.expected ?? 0)} icon={IndianRupee} tone="primary" loading={isLoading}>
          {r?.invoices ? `${r.invoices} rent bills for ${period}` : `No rent generated for ${period}`}
        </Kpi>
        <Kpi label="Monthly rent collected" value={inr(r?.collected ?? 0)} icon={CheckCircle2} tone="success" loading={isLoading}>
          {r ? `${r.collectedPercentage}% of this month's rent` : null}
        </Kpi>
        <Kpi label="Monthly rent pending" value={inr(r?.pending ?? 0)} icon={AlertCircle} tone="danger" loading={isLoading}>
          {r ? `${r.pendingTenants} tenant${r.pendingTenants === 1 ? "" : "s"} yet to pay` : null}
        </Kpi>
        <Kpi label="Monthly expenditure" value={inr(c?.expenditure ?? 0)} icon={HandCoins} tone="warning" loading={isLoading}>
          {c ? `${c.expenseCount} expense entr${c.expenseCount === 1 ? "y" : "ies"}` : null}
        </Kpi>
        <Kpi
          label="Security deposit held"
          value={inr(d?.held ?? 0)}
          icon={ShieldCheck}
          tone="info"
          loading={isLoading}
          onClick={can("/deposits") ? () => setDepositsOpen(true) : undefined}
          actionLabel="View deposits"
        >
          As of {formatDate(data?.period.asOf)} · not rent income
        </Kpi>
        <Kpi label="Net operating cash" value={inr(c?.netOperatingCash ?? 0)} icon={TrendingUp} tone={(c?.netOperatingCash ?? 0) < 0 ? "danger" : "success"} loading={isLoading}>
          Rent cash received − expenses
        </Kpi>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Monthly rent collection"
            description={`Bills for ${period}`}
            action={
              can("/rent") && (
                <Link to="/rent">
                  <Button variant="ghost" size="sm">
                    Rent <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )
            }
          />
          <div className="p-4 sm:p-5">
            {isLoading ? <div className="h-28 animate-pulse rounded-lg bg-surface-2" /> : <RentCollectionBar expected={r?.expected ?? 0} collected={r?.collected ?? 0} pending={r?.pending ?? 0} />}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Monthly financial trend" description="Cash by payment / expense date — last 6 months" />
          <div className="p-4 sm:p-5">
            {isLoading ? <div className="h-56 animate-pulse rounded-lg bg-surface-2" /> : <TrendChart data={data?.trend ?? []} selectedIndex={(data?.trend.length ?? 1) - 1} />}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Expense breakdown"
            description={period}
            action={
              can("/expenditure") && (
                <Link to="/expenditure">
                  <Button variant="ghost" size="sm">
                    Expenditure <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )
            }
          />
          <div className="p-4 sm:p-5">{isLoading ? <div className="h-32 animate-pulse rounded-lg bg-surface-2" /> : <CategoryBars data={data?.expenseByCategory ?? []} />}</div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title={`Monthly financial summary — ${period}`} description="Billing-month rent, cash movement, expenses and deposits are kept separate." />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Monthly financial summary</caption>
              <tbody>
                {(
                  [
                    ["Billing month rent", null, null],
                    ["Expected monthly rent", r?.expected, "Sum of this month's rent bills"],
                    ["Rent collected for billing month", r?.collected, "Payments allocated to this month's bills"],
                    ["Rent pending", r?.pending, "Expected − collected", "danger"],
                    ["Cash in the calendar month", null, null],
                    ["Rent cash received in month", c?.rentReceived, `${c?.paymentCount ?? 0} payments by payment date (incl. arrears & advances)`],
                    ["PG operating expenses", c?.expenditure, "By expense date, voided entries excluded"],
                    ["Net operating cash", c?.netOperatingCash, "Rent cash received − operating expenses (not accounting profit)", "strong"],
                    ["Security deposits (liability)", null, null],
                    ["Deposits received in month", c?.depositsReceived, "Separate cash movement — not rent"],
                    ["Deposits refunded in month", c?.depositsRefunded, "Not an operating expense"],
                    ["Security deposit held", d?.held, `Balance as of ${formatDate(data?.period.asOf)}`, "strong"],
                  ] as [string, number | null | undefined, string | null, string?][]
                ).map(([label, amount, note, style]) =>
                  amount === null ? (
                    <tr key={label} className="bg-surface-2/60">
                      <th scope="rowgroup" colSpan={2} className="px-4 py-2 text-left text-xs font-bold tracking-wider text-fg-subtle uppercase sm:px-5">
                        {label}
                      </th>
                    </tr>
                  ) : (
                    <tr key={label} className="border-b border-border last:border-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium text-fg sm:px-5">
                        <span className={style === "strong" ? "font-bold" : ""}>{label}</span>
                        {note && <span className="block text-xs font-normal text-fg-subtle">{note}</span>}
                      </th>
                      <td
                        className={cn(
                          "tabular px-4 py-2.5 text-right whitespace-nowrap sm:px-5",
                          style === "strong" ? "text-base font-extrabold text-fg" : "font-semibold text-fg",
                          style === "danger" && (amount ?? 0) > 0 && "text-danger",
                          style === "strong" && (amount ?? 0) < 0 && "text-danger",
                        )}
                      >
                        {isLoading ? "…" : inr(amount ?? 0)}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <DepositSummaryDrawer open={depositsOpen} onClose={() => setDepositsOpen(false)} />
    </div>
  );
}
