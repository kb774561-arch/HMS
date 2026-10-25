import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  BedDouble,
  BedSingle,
  Download,
  Eye,
  IndianRupee,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UserMinus,
  Users,
  UserX,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, StatGrid, StatTile } from "@/components/ui/card";
import { DataTable, CardField, type Column } from "@/components/ui/data-table";
import { FilterSelect, SearchInput, Segmented, Toolbar } from "@/components/ui/toolbar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useModulePermissions, useAuth } from "@/features/auth/AuthProvider";
import { useRooms } from "@/features/rooms/RoomBedPicker";
import { CollectPaymentModal } from "@/features/payments/CollectPaymentModal";
import { ReceiptModal } from "@/features/payments/ReceiptModal";
import { TenantFormDrawer } from "./TenantFormDrawer";
import { TenantViewDrawer } from "./TenantViewDrawer";
import { AddChargeModal, DeactivateTenantModal, ReactivateTenantModal } from "./TenantStatusDialogs";
import { ImportTenantsModal } from "./ImportTenantsModal";
import { AllocateTenantBedModal } from "./TenantBedDialogs";
import { BedOperationModal } from "@/features/rooms/BedOperationModal";
import { tenantApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { downloadWorkbook } from "@/lib/excel";
import { formatDate, initials, inr, toInputDate } from "@/lib/format";
import type { Receipt, Tenant } from "@/types";

type StatusFilter = "ACTIVE" | "VACATED" | "ALL";

export function TenantsPage() {
  const perm = useModulePermissions("/tenants");
  const { can } = useAuth();
  const canCollect = can("/payments", "ADD") || can("/rent", "ADD");
  const refresh = useRefreshFinance();

  // Filters live here so saving/closing a drawer never resets them.
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");
  const [roomId, setRoomId] = useState("");
  const [accommodation, setAccommodation] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<Tenant | null>(null);
  const [reactivating, setReactivating] = useState<Tenant | null>(null);
  const [archiving, setArchiving] = useState<Tenant | null>(null);
  const [charging, setCharging] = useState<{ id: string; tenantName: string } | null>(null);
  const [collectFor, setCollectFor] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [allocating, setAllocating] = useState<Tenant | null>(null);
  const [bedOp, setBedOp] = useState<{ tenantId?: string } | null>(null);

  const query = useQuery({
    queryKey: ["tenants", { search, status, roomId, accommodation }],
    queryFn: () =>
      tenantApi.list({
        search,
        status: status === "ALL" ? undefined : status,
        roomId: roomId || undefined,
        accommodation: accommodation || undefined,
      }),
    placeholderData: (prev) => prev,
  });
  const rooms = useRooms();

  const archive = useMutation({
    mutationFn: (t: Tenant) => tenantApi.archive(t.id),
    onSuccess: async (_d, t) => {
      toast.success(`${t.tenantName} deleted`, { description: "Payment history is kept for reports." });
      setArchiving(null);
      await refresh();
    },
    onError: (err) => handleApiError(err),
  });

  const items = query.data?.items ?? [];
  const summary = query.data?.summary;
  const outstandingTotal = useMemo(() => items.reduce((s, t) => s + t.outstanding, 0), [items]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (t: Tenant) => {
    setViewId(null);
    setEditing(t);
    setFormOpen(true);
  };

  const exportExcel = () => {
    downloadWorkbook(
      [
        {
          name: "Tenants",
          rows: items.map((t) => ({
            Tenant: t.tenantName,
            Status: t.isActive ? "Active" : "Inactive",
            Room: t.roomNumber ?? "",
            Bed: t.bedCode ?? "",
            WhatsApp: t.whatsappNumber ?? "",
            ParentNumber: t.parentNumber ?? "",
            JoiningDate: toInputDate(t.joiningDate),
            LeavingDate: toInputDate(t.leavingDate),
            MonthlyRent: t.monthlyRent,
            Deposit: t.securityDeposit,
            Outstanding: t.outstanding,
            Notes: t.notes ?? "",
          })),
        },
      ],
      `tenants-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const actions = (t: Tenant) => [
    { label: "View", icon: Eye, onSelect: () => setViewId(t.id) },
    { label: "Edit", icon: Pencil, onSelect: () => openEdit(t), hidden: !perm.edit },
    { label: "Allocate bed", icon: BedDouble, onSelect: () => setAllocating(t), hidden: !perm.add || t.accommodation !== "UNALLOCATED" },
    { label: "Transfer / Swap bed", icon: ArrowLeftRight, onSelect: () => setBedOp({ tenantId: t.id }), hidden: !perm.edit || t.accommodation !== "RESIDING" },
    { label: "Collect rent", icon: Wallet, onSelect: () => setCollectFor(t.id), hidden: !canCollect || !t.isActive },
    {
      label: "WhatsApp",
      icon: MessageCircle,
      onSelect: () => window.open(t.whatsappLink!, "_blank", "noopener"),
      hidden: !t.whatsappLink,
    },
    { label: "Deactivate", icon: UserMinus, onSelect: () => setDeactivating(t), hidden: !perm.edit || !t.isActive, separatorBefore: true },
    { label: "Activate", icon: RotateCcw, onSelect: () => setReactivating(t), hidden: !perm.edit || t.isActive, separatorBefore: true },
    { label: "Delete", icon: Trash2, tone: "danger" as const, onSelect: () => setArchiving(t), hidden: !perm.remove },
  ];

  const columns: Column<Tenant>[] = [
    {
      id: "name",
      header: "Tenant",
      sortValue: (t) => t.tenantName,
      cell: (t) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-fg">
            {initials(t.tenantName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{t.tenantName}</p>
            <p className="truncate text-xs text-fg-subtle">{t.whatsappNumber ?? "No WhatsApp"}</p>
          </div>
        </div>
      ),
    },
    {
      id: "room",
      header: "Room / Bed",
      sortValue: (t) => (t.roomNumber ? `${t.roomNumber} ${t.bedCode}` : null),
      cell: (t) =>
        t.roomNumber ? (
          <span className="font-medium">
            {t.roomNumber} · {t.bedCode}
          </span>
        ) : t.accommodation === "UNALLOCATED" ? (
          <Badge tone="warning">Unallocated</Badge>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    { id: "joined", header: "Joined", sortValue: (t) => t.joiningDate, cell: (t) => formatDate(t.joiningDate), hideBelow: "lg" },
    { id: "rent", header: "Rent", align: "right", sortValue: (t) => t.monthlyRent, cell: (t) => <span className="tabular">{inr(t.monthlyRent)}</span> },
    {
      id: "due",
      header: "Due",
      align: "right",
      sortValue: (t) => t.outstanding,
      cell: (t) => <span className={`tabular font-semibold ${t.outstanding > 0 ? "text-danger" : "text-fg-subtle"}`}>{t.outstanding > 0 ? inr(t.outstanding) : "—"}</span>,
    },
    { id: "status", header: "Status", sortValue: (t) => t.status, cell: (t) => <StatusBadge status={t.status} /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tenants"
        description="Register girls, allocate beds now or later, and manage transfers."
        actions={
          <>
            {perm.add && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Import</span>
              </Button>
            )}
            {perm.exportData && (
              <Button variant="outline" onClick={exportExcel} disabled={!items.length}>
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            {perm.edit && (
              <Button variant="outline" onClick={() => setBedOp({})}>
                <ArrowLeftRight className="h-4 w-4" /> <span className="hidden sm:inline">Transfer / Swap bed</span>
              </Button>
            )}
            {perm.add && (
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" /> Register tenant
              </Button>
            )}
          </>
        }
      />

      <StatGrid>
        <StatTile label="Registered" value={summary?.registered ?? "—"} hint={summary ? `${summary.inactive} inactive` : undefined} icon={Users} loading={query.isLoading} />
        <StatTile label="Residing" value={summary?.residing ?? "—"} hint="Have a bed now" icon={BedSingle} tone="success" loading={query.isLoading} />
        <StatTile label="Unallocated" value={summary?.unallocated ?? "—"} hint="Registered, no bed yet" icon={UserX} tone="warning" loading={query.isLoading} />
        <StatTile label="Rent due (shown)" value={inr(outstandingTotal)} icon={IndianRupee} tone="danger" loading={query.isLoading} />
      </StatGrid>

      <Card>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone or room" label="Search tenants" />
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "ACTIVE", label: "Active", count: summary?.registered },
              { value: "VACATED", label: "Inactive", count: summary?.inactive },
              { value: "ALL", label: "All", count: summary?.total },
            ]}
          />
          <FilterSelect
            label="Accommodation"
            value={accommodation}
            onChange={setAccommodation}
            options={[
              { value: "", label: "Any accommodation" },
              { value: "RESIDING", label: "Residing (has bed)" },
              { value: "UNALLOCATED", label: "Unallocated" },
            ]}
          />
          <FilterSelect
            label="Room"
            value={roomId}
            onChange={setRoomId}
            options={[{ value: "", label: "All rooms" }, ...(rooms.data?.rooms ?? []).map((r) => ({ value: r.id, label: r.roomNumber }))]}
          />
        </Toolbar>
        <DataTable
          caption="Tenants"
          columns={columns}
          rows={items}
          getRowId={(t) => t.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          resetKey={`${search}|${status}|${roomId}|${accommodation}`}
          initialSort={{ id: "name", dir: "asc" }}
          onRowClick={(t) => setViewId(t.id)}
          rowActions={actions}
          emptyTitle={search || roomId || accommodation ? "No tenants match your filters" : status === "ACTIVE" ? "No active tenants yet" : "No tenants found"}
          emptyDescription={search || roomId ? "Try a different search or clear the filters." : "Add your first tenant to start tracking rent."}
          emptyAction={
            perm.add && !search && !roomId ? (
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" /> Add tenant
              </Button>
            ) : undefined
          }
          mobileCard={(t, menu) => (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-soft-fg">
                  {initials(t.tenantName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg">{t.tenantName}</p>
                  <div className="mt-1">
                    <StatusBadge status={t.status} />
                  </div>
                </div>
                {menu}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <CardField label="Room / Bed">
                  {t.roomNumber ? `${t.roomNumber} · ${t.bedCode}` : t.accommodation === "UNALLOCATED" ? <Badge tone="warning">Unallocated</Badge> : "—"}
                </CardField>
                <CardField label="Rent">{inr(t.monthlyRent)}</CardField>
                <CardField label="Due">
                  <span className={t.outstanding > 0 ? "text-danger" : "text-fg-subtle"}>{t.outstanding > 0 ? inr(t.outstanding) : "—"}</span>
                </CardField>
              </div>
              {(canCollect && t.isActive && t.outstanding > 0) || t.whatsappLink ? (
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {canCollect && t.isActive && t.outstanding > 0 && (
                    <Button size="sm" className="flex-1" onClick={() => setCollectFor(t.id)}>
                      <Wallet className="h-4 w-4" /> Collect
                    </Button>
                  )}
                  {t.whatsappLink && (
                    <a href={t.whatsappLink} target="_blank" rel="noreferrer" className="flex-1">
                      <Button size="sm" variant="soft" className="w-full">
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </Button>
                    </a>
                  )}
                </div>
              ) : null}
            </div>
          )}
        />
      </Card>

      <TenantFormDrawer open={formOpen} onClose={() => setFormOpen(false)} tenant={editing} />
      <TenantViewDrawer
        tenantId={viewId}
        onClose={() => setViewId(null)}
        onEdit={(t) => openEdit(t)}
        onCollect={(t) => {
          setViewId(null);
          setCollectFor(t.id);
        }}
        onAddCharge={(t) => setCharging({ id: t.id, tenantName: t.tenantName })}
        onAllocate={(t) => {
          setViewId(null);
          setAllocating(t);
        }}
        onTransfer={(t) => {
          setViewId(null);
          setBedOp({ tenantId: t.id });
        }}
        canEdit={perm.edit}
        canCollect={canCollect}
      />
      <DeactivateTenantModal tenant={deactivating} onClose={() => setDeactivating(null)} />
      <ReactivateTenantModal tenant={reactivating} onClose={() => setReactivating(null)} />
      <AddChargeModal tenant={charging} onClose={() => setCharging(null)} />
      <ImportTenantsModal open={importOpen} onClose={() => setImportOpen(false)} />
      <AllocateTenantBedModal tenant={allocating} onClose={() => setAllocating(null)} />
      <BedOperationModal open={Boolean(bedOp)} initialTenantId={bedOp?.tenantId} onClose={() => setBedOp(null)} />
      <ConfirmDialog
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && archive.mutate(archiving)}
        loading={archive.isPending}
        title="Delete tenant?"
        confirmLabel="Delete tenant"
        message={
          <>
            <strong className="text-fg">{archiving?.tenantName}</strong> will be removed from lists and their bed released. Rent, payment and
            receipt history stays in the database for reports. Tenants with rent still due can't be deleted.
          </>
        }
      />
      <CollectPaymentModal
        open={Boolean(collectFor)}
        tenantId={collectFor}
        onClose={() => setCollectFor(null)}
        onCollected={(r) => {
          setCollectFor(null);
          setReceipt(r);
        }}
      />
      <ReceiptModal open={Boolean(receipt)} receipt={receipt} justCollected onClose={() => setReceipt(null)} />
    </div>
  );
}
