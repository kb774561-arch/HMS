import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, BedDouble, BedSingle, Building2, Ban, Download, LayoutGrid, Lock, Pencil, Percent, Plus, Unlock, UserPlus, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, Meter, StatGrid, StatTile } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { StateBox } from "@/components/ui/data-table";
import { FilterSelect, SearchInput, Segmented, Toolbar } from "@/components/ui/toolbar";
import { ActionMenu } from "@/components/ui/menu";
import { useModulePermissions } from "@/features/auth/AuthProvider";
import { TenantFormDrawer } from "@/features/tenants/TenantFormDrawer";
import { useRooms } from "./RoomBedPicker";
import { AllocateBedModal, RoomFormModal } from "./RoomDialogs";
import { BedOperationModal, type BedOperationMode } from "./BedOperationModal";
import { roomApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { downloadWorkbook } from "@/lib/excel";
import { formatDate, inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Bed, Room } from "@/types";

type Availability = "all" | "free" | "full";

const bedStyles: Record<Bed["status"], string> = {
  AVAILABLE: "border-success/40 bg-success-soft/50",
  OCCUPIED: "border-primary/30 bg-primary-soft/60",
  BLOCKED: "border-warning/40 bg-warning-soft/60",
  INACTIVE: "border-border bg-surface-2 opacity-70",
};

export function RoomsPage() {
  const perm = useModulePermissions("/rooms");
  const tenantsPerm = useModulePermissions("/tenants");
  const refresh = useRefreshFinance();
  const { data, isLoading, error, refetch } = useRooms();

  const [search, setSearch] = useState("");
  const [floor, setFloor] = useState("");
  const [availability, setAvailability] = useState<Availability>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState<{ open: boolean; room: Room | null }>({ open: false, room: null });
  const [allocate, setAllocate] = useState<{ roomId: string; bedId?: string } | null>(null);
  const [newTenantBed, setNewTenantBed] = useState<{ roomId: string; bedId: string } | null>(null);
  const [bedOp, setBedOp] = useState<{ mode: BedOperationMode; tenantId?: string } | null>(null);
  const canMove = perm.edit || tenantsPerm.edit;
  const bedPanel = useRef<HTMLDivElement>(null);

  const rooms = data?.rooms ?? [];
  const totals = data?.totals;
  const floors = useMemo(() => [...new Set(rooms.map((r) => r.floor).filter(Boolean))] as string[], [rooms]);
  const selected = rooms.find((r) => r.id === selectedId) ?? null;

  const filtered = rooms.filter(
    (r) =>
      (!search || r.roomNumber.toLowerCase().includes(search.toLowerCase())) &&
      (!floor || r.floor === floor) &&
      (availability === "all" || (availability === "free" ? r.available > 0 : r.isActive && r.available === 0)),
  );

  useEffect(() => {
    if (selectedId) bedPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  const toggleBlock = useMutation({
    mutationFn: (bed: Bed) => roomApi.updateBed(bed.id, { isBlocked: !bed.isBlocked }),
    onSuccess: async (_d, bed) => {
      toast.success(bed.isBlocked ? `Bed ${bed.bedCode} unblocked` : `Bed ${bed.bedCode} blocked`);
      await refresh();
    },
    onError: (err) => handleApiError(err),
  });

  const exportExcel = () =>
    downloadWorkbook(
      [
        {
          name: "Beds",
          rows: rooms.flatMap((r) =>
            r.beds.map((b) => ({
              Room: r.roomNumber,
              Floor: r.floor ?? "",
              Bed: b.bedCode,
              Status: b.status,
              Tenant: b.tenant?.tenantName ?? "",
              Rent: b.tenant?.monthlyRent ?? "",
            })),
          ),
        },
      ],
      `rooms-beds-${new Date().toISOString().slice(0, 10)}`,
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rooms & Beds"
        description="Live occupancy for every room. Open a room to see and manage its beds."
        actions={
          <>
            {perm.exportData && (
              <Button variant="outline" onClick={exportExcel} disabled={!rooms.length}>
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            {canMove && (
              <Button variant="outline" onClick={() => setBedOp({ mode: "transfer" })}>
                <ArrowLeftRight className="h-4 w-4" /> <span className="hidden sm:inline">Transfer / Swap bed</span>
              </Button>
            )}
            {perm.add && (
              <Button variant="outline" onClick={() => setAllocate({ roomId: "" })}>
                <UserPlus className="h-4 w-4" /> <span className="hidden sm:inline">Allocate bed</span>
              </Button>
            )}
            {perm.add && (
              <Button onClick={() => setRoomForm({ open: true, room: null })}>
                <Plus className="h-4 w-4" /> Add room
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={5}>
        <StatTile label="Rooms" value={totals?.activeRooms ?? "—"} hint={totals && totals.rooms !== totals.activeRooms ? `${totals.rooms - totals.activeRooms} inactive` : undefined} icon={Building2} loading={isLoading} />
        <StatTile label="Total beds" value={totals?.totalBeds ?? "—"} icon={BedDouble} tone="info" loading={isLoading} />
        <StatTile label="Occupied" value={totals?.occupied ?? "—"} icon={BedSingle} loading={isLoading} />
        <StatTile label="Available" value={totals?.available ?? "—"} hint={totals?.blocked ? `${totals.blocked} blocked` : undefined} icon={LayoutGrid} tone="success" loading={isLoading} />
        <StatTile label="Occupancy" value={totals ? `${totals.occupancyPercentage}%` : "—"} icon={Percent} tone="warning" loading={isLoading} />
      </StatGrid>

      {selected && (
        <div ref={bedPanel} className="scroll-mt-20">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-fg">
                  {selected.roomNumber} · beds{" "}
                  <span className="ml-1 align-middle">
                    <StatusBadge status={selected.status} />
                  </span>
                </h2>
                <p className="text-[13px] text-fg-muted">
                  {selected.occupied} of {selected.totalBeds} occupied{selected.floor ? ` · Floor ${selected.floor}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {perm.edit && (
                  <Button variant="outline" size="sm" onClick={() => setRoomForm({ open: true, room: selected })}>
                    <Pencil className="h-4 w-4" /> Edit room
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedId(null)} aria-label="Close bed view">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 xl:grid-cols-4">
              {selected.beds.map((b) => (
                <li key={b.id} className={cn("flex min-h-28 flex-col justify-between rounded-xl border p-3.5", bedStyles[b.status])}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-fg">Bed {b.bedCode}</p>
                      <div className="mt-1">
                        <StatusBadge status={b.status} />
                      </div>
                    </div>
                    <ActionMenu
                      label={`Bed ${b.bedCode} actions`}
                      actions={[
                        { label: "Allocate tenant", icon: UserPlus, onSelect: () => setAllocate({ roomId: selected.id, bedId: b.id }), hidden: !perm.add || b.status !== "AVAILABLE" || !selected.isActive },
                        { label: "Transfer to empty bed", icon: ArrowLeftRight, onSelect: () => setBedOp({ mode: "transfer", tenantId: b.tenant!.id }), hidden: !canMove || !b.tenant },
                        { label: "Swap with another bed", icon: ArrowLeftRight, onSelect: () => setBedOp({ mode: "swap", tenantId: b.tenant!.id }), hidden: !canMove || !b.tenant },
                        { label: "Block bed", icon: Lock, onSelect: () => toggleBlock.mutate(b), hidden: !perm.edit || b.status !== "AVAILABLE" },
                        { label: "Unblock bed", icon: Unlock, onSelect: () => toggleBlock.mutate(b), hidden: !perm.edit || b.status !== "BLOCKED" },
                      ]}
                    />
                  </div>
                  {b.tenant ? (
                    <div className="mt-3 min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">{b.tenant.tenantName}</p>
                      <p className="tabular text-xs text-fg-muted">
                        {inr(b.tenant.monthlyRent)}/mo{b.tenant.since ? ` · since ${formatDate(b.tenant.since)}` : ""}
                      </p>
                    </div>
                  ) : b.status === "AVAILABLE" && perm.add && selected.isActive ? (
                    <Button variant="outline" size="sm" className="mt-3 self-start" onClick={() => setAllocate({ roomId: selected.id, bedId: b.id })}>
                      <UserPlus className="h-4 w-4" /> Allocate
                    </Button>
                  ) : (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
                      {b.status === "BLOCKED" ? <Ban className="h-3.5 w-3.5" /> : null}
                      {b.status === "BLOCKED" ? "Blocked for maintenance" : b.status === "AVAILABLE" ? "Free" : "Inactive"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Card>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search room number" label="Search rooms" />
          <Segmented
            label="Availability"
            value={availability}
            onChange={setAvailability}
            options={[
              { value: "all", label: "All" },
              { value: "free", label: "Has free beds" },
              { value: "full", label: "Full" },
            ]}
          />
          {floors.length > 1 && (
            <FilterSelect label="Floor" value={floor} onChange={setFloor} options={[{ value: "", label: "All floors" }, ...floors.map((f) => ({ value: f, label: `Floor ${f}` }))]} />
          )}
        </Toolbar>

        {error ? (
          <StateBox icon={<Ban className="h-6 w-6 text-danger" />} title="Couldn't load rooms" description={(error as Error).message}>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </StateBox>
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        ) : !filtered.length ? (
          <StateBox
            icon={<Building2 className="h-6 w-6 text-fg-subtle" />}
            title={rooms.length ? "No rooms match these filters" : "No rooms yet"}
            description={rooms.length ? "Clear the search or filters to see all rooms." : "Add your first room to start allocating beds."}
          >
            {!rooms.length && perm.add && (
              <Button onClick={() => setRoomForm({ open: true, room: null })}>
                <Plus className="h-4 w-4" /> Add room
              </Button>
            )}
          </StateBox>
        ) : (
          <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "flex flex-col rounded-xl border bg-surface p-4 transition-shadow hover:shadow-card",
                  r.id === selectedId ? "border-primary ring-2 ring-primary/20" : "border-border",
                  !r.isActive && "opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-fg">{r.roomNumber}</h3>
                    <p className="text-xs text-fg-subtle">{r.floor ? `Floor ${r.floor}` : "No floor set"}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>

                <div className="mt-4 flex items-baseline justify-between">
                  <span className="tabular text-2xl font-extrabold text-fg">{r.occupancyPercentage}%</span>
                  <span className="text-xs text-fg-muted">occupied</span>
                </div>
                <Meter value={r.occupancyPercentage} label={`${r.roomNumber} occupancy`} className="mt-1.5" />

                <dl className="tabular mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Beds", r.totalBeds],
                    ["Occupied", r.occupied],
                    ["Free", r.available],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-surface-2 py-2">
                      <dd className="text-base font-bold text-fg">{v}</dd>
                      <dt className="text-[11px] text-fg-subtle">{k}</dt>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 flex gap-2">
                  <Button variant={r.id === selectedId ? "soft" : "outline"} size="sm" className="flex-1" onClick={() => setSelectedId(r.id === selectedId ? null : r.id)} aria-expanded={r.id === selectedId}>
                    <BedDouble className="h-4 w-4" /> {r.id === selectedId ? "Hide beds" : "View beds"}
                  </Button>
                  {perm.add && r.available > 0 && r.isActive && (
                    <Button size="sm" variant="secondary" onClick={() => setAllocate({ roomId: r.id })} aria-label={`Allocate a bed in ${r.roomNumber}`}>
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  )}
                  {perm.edit && (
                    <Button size="sm" variant="secondary" onClick={() => setRoomForm({ open: true, room: r })} aria-label={`Edit ${r.roomNumber}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <RoomFormModal open={roomForm.open} room={roomForm.room} onClose={() => setRoomForm({ open: false, room: null })} />
      <AllocateBedModal
        open={Boolean(allocate)}
        preset={allocate}
        onClose={() => setAllocate(null)}
        onNewTenant={(bed) => {
          setAllocate(null);
          if (tenantsPerm.add) setNewTenantBed(bed);
          else toast.error("Permission denied", { description: "You can't add tenants." });
        }}
      />
      <BedOperationModal open={Boolean(bedOp)} initialMode={bedOp?.mode} initialTenantId={bedOp?.tenantId} onClose={() => setBedOp(null)} />
      <TenantFormDrawer open={Boolean(newTenantBed)} presetBed={newTenantBed} onClose={() => setNewTenantBed(null)} />
    </div>
  );
}
