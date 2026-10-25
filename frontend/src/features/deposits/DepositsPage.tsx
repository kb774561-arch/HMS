import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Download, History, Hourglass, Plus, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, StatGrid, StatTile } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable, CardField, type Column } from "@/components/ui/data-table";
import { SearchInput, Segmented, Toolbar } from "@/components/ui/toolbar";
import { useModulePermissions } from "@/features/auth/AuthProvider";
import { CollectDepositModal, DepositLedgerDrawer, RefundDepositModal } from "./DepositDialogs";
import { depositApi } from "@/services/api";
import { downloadWorkbook } from "@/lib/excel";
import { inr } from "@/lib/format";
import type { DepositRow } from "@/types";

type Filter = "held" | "due" | "all";

export function DepositsPage() {
  const perm = useModulePermissions("/deposits");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [collect, setCollect] = useState<{ row: DepositRow | null } | null>(null);
  const [refund, setRefund] = useState<DepositRow | null>(null);
  const [ledger, setLedger] = useState<DepositRow | null>(null);

  const query = useQuery({ queryKey: ["deposits"], queryFn: depositApi.summary });
  const s = query.data?.summary;

  const rows = useMemo(
    () =>
      (query.data?.items ?? []).filter(
        (r) =>
          (filter === "all" || (filter === "held" ? r.balance > 0 : r.dueToCollect > 0)) &&
          (!search || r.tenantName.toLowerCase().includes(search.toLowerCase()) || r.roomNumber?.toLowerCase().includes(search.toLowerCase())),
      ),
    [query.data, filter, search],
  );

  const columns: Column<DepositRow>[] = [
    {
      id: "tenant",
      header: "Tenant",
      sortValue: (r) => r.tenantName,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold">{r.tenantName}</p>
          <p className="text-xs text-fg-subtle">{r.roomNumber ? `${r.roomNumber} · ${r.bedCode}` : "No bed"}</p>
        </div>
      ),
    },
    { id: "agreed", header: "Agreed", align: "right", sortValue: (r) => r.agreedDeposit, cell: (r) => <span className="tabular text-fg-muted">{inr(r.agreedDeposit)}</span>, hideBelow: "lg" },
    { id: "received", header: "Received", align: "right", sortValue: (r) => r.received, cell: (r) => <span className="tabular">{inr(r.received)}</span> },
    { id: "refunded", header: "Refunded", align: "right", sortValue: (r) => r.refunded, cell: (r) => <span className="tabular">{inr(r.refunded)}</span> },
    { id: "balance", header: "Balance", align: "right", sortValue: (r) => r.balance, cell: (r) => <span className="tabular font-bold">{inr(r.balance)}</span> },
    { id: "status", header: "Tenant", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} />, hideBelow: "xl" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Deposits"
        description="Security deposits received, refunded and currently held."
        actions={
          <>
            {perm.exportData && (
              <Button
                variant="outline"
                disabled={!rows.length}
                onClick={() =>
                  downloadWorkbook(
                    [
                      {
                        name: "Deposits",
                        rows: rows.map((r) => ({
                          Tenant: r.tenantName,
                          Room: r.roomNumber ?? "",
                          Agreed: r.agreedDeposit,
                          Received: r.received,
                          Refunded: r.refunded,
                          Balance: r.balance,
                        })),
                      },
                    ],
                    `deposits-${new Date().toISOString().slice(0, 10)}`,
                  )
                }
              >
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            {perm.add && (
              <Button onClick={() => setCollect({ row: null })}>
                <Plus className="h-4 w-4" /> Collect deposit
              </Button>
            )}
          </>
        }
      />

      <StatGrid>
        <StatTile label="Deposit received" value={inr(s?.received ?? 0)} icon={ArrowDownLeft} tone="success" loading={query.isLoading} />
        <StatTile label="Total refunded" value={inr(s?.refunded ?? 0)} hint={s?.applied ? `+ ${inr(s.applied)} applied / deducted` : undefined} icon={ArrowUpRight} tone="info" loading={query.isLoading} />
        <StatTile label="Current balance" value={inr(s?.balance ?? 0)} icon={ShieldCheck} loading={query.isLoading} />
        <StatTile label="Yet to collect" value={inr(s?.dueToCollect ?? 0)} hint="vs agreed amounts" icon={Hourglass} tone="warning" loading={query.isLoading} />
      </StatGrid>

      <Card>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search tenant or room" label="Search deposits" />
          <Segmented
            label="Deposit filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "held", label: "Holding" },
              { value: "due", label: "To collect" },
            ]}
          />
        </Toolbar>
        <DataTable
          caption="Deposits"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.tenantId}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          resetKey={`${filter}|${search}`}
          initialSort={{ id: "tenant", dir: "asc" }}
          onRowClick={(r) => setLedger(r)}
          rowActions={(r) => [
            { label: "View history", icon: History, onSelect: () => setLedger(r) },
            { label: "Collect deposit", icon: ArrowDownLeft, onSelect: () => setCollect({ row: r }), hidden: !perm.add },
            { label: "Refund / deduct", icon: ArrowUpRight, onSelect: () => setRefund(r), hidden: !perm.edit || r.balance <= 0 },
          ]}
          emptyTitle={query.data?.items.length ? "No deposits match" : "No deposits yet"}
          emptyDescription={query.data?.items.length ? "Change the filter or search." : "Deposits appear here once agreed on a tenant or collected."}
          mobileCard={(r, menu) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{r.tenantName}</p>
                  <p className="text-xs text-fg-subtle">{r.roomNumber ? `${r.roomNumber} · ${r.bedCode}` : "No bed"}</p>
                </div>
                {menu}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <CardField label="Received">{inr(r.received)}</CardField>
                <CardField label="Refunded">{inr(r.refunded)}</CardField>
                <CardField label="Balance">{inr(r.balance)}</CardField>
              </div>
            </div>
          )}
        />
      </Card>

      <CollectDepositModal open={Boolean(collect)} row={collect?.row ?? null} onClose={() => setCollect(null)} />
      <RefundDepositModal row={refund} onClose={() => setRefund(null)} />
      <DepositLedgerDrawer row={ledger} onClose={() => setLedger(null)} />
    </div>
  );
}
