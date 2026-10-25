import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable, CardField, type Column } from "@/components/ui/data-table";
import { Field, FormGrid, Input } from "@/components/ui/field";
import { useModulePermissions } from "@/features/auth/AuthProvider";
import { useRooms } from "@/features/rooms/RoomBedPicker";
import { RoomFormModal } from "@/features/rooms/RoomDialogs";
import { settingsApi } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import { inr } from "@/lib/format";
import type { Room } from "@/types";

const pgSchema = z.object({
  name: z.string().trim().min(1, "PG name is required").max(120),
  address: z.string().max(500),
  phone: z
    .string()
    .trim()
    .refine((v) => !v || /^\+?[\d\s-]{10,15}$/.test(v), "Enter a valid phone number"),
});
type PgValues = z.infer<typeof pgSchema>;

function PgDetails() {
  const perm = useModulePermissions("/settings");
  const qc = useQueryClient();
  const pg = useQuery({ queryKey: ["pg"], queryFn: settingsApi.pg });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PgValues>({ resolver: zodResolver(pgSchema) });

  useEffect(() => {
    if (pg.data) reset({ name: pg.data.name, address: pg.data.address ?? "", phone: pg.data.phone ?? "" });
  }, [pg.data, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await settingsApi.updatePg(pg.data!.id, { name: v.name, address: v.address || null, phone: v.phone || null });
      toast.success("PG details saved", { description: "Shown on every receipt." });
      await qc.invalidateQueries({ queryKey: ["pg"] });
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  return (
    <Card>
      <CardHeader title="PG details" description="Printed on receipts." />
      <form className="space-y-4 p-4 sm:p-5" onSubmit={onSubmit} noValidate>
        <FormGrid>
          <Field label="PG name" required error={errors.name?.message}>
            <Input disabled={!perm.edit} {...register("name")} />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <Input type="tel" disabled={!perm.edit} {...register("phone")} />
          </Field>
        </FormGrid>
        <Field label="Address" error={errors.address?.message}>
          <Input disabled={!perm.edit} {...register("address")} />
        </Field>
        {perm.edit && (
          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              Save details
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

export function RoomConfigTab() {
  const perm = useModulePermissions("/rooms");
  const { data, isLoading, error, refetch } = useRooms();
  const [modal, setModal] = useState<{ open: boolean; room: Room | null }>({ open: false, room: null });

  const columns: Column<Room>[] = [
    { id: "room", header: "Room", sortValue: (r) => r.roomNumber, cell: (r) => <span className="font-semibold">{r.roomNumber}</span> },
    { id: "floor", header: "Floor", sortValue: (r) => r.floor, cell: (r) => r.floor ?? "—" },
    { id: "beds", header: "Beds", align: "right", sortValue: (r) => r.totalBeds, cell: (r) => <span className="tabular">{r.totalBeds}</span> },
    { id: "rent", header: "Default rent", align: "right", sortValue: (r) => r.defaultMonthlyRent, cell: (r) => <span className="tabular">{r.defaultMonthlyRent ? inr(r.defaultMonthlyRent) : "—"}</span> },
    { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} /> },
  ];

  return (
    <div className="space-y-5">
      <PgDetails />
      <Card>
        <CardHeader
          title="Rooms"
          description="Bed count, default rent and availability. Occupancy is managed on Rooms & Beds."
          action={
            perm.add && (
              <Button size="sm" onClick={() => setModal({ open: true, room: null })}>
                <Plus className="h-4 w-4" /> Add room
              </Button>
            )
          }
        />
        <DataTable
          caption="Room configuration"
          columns={columns}
          rows={data?.rooms ?? []}
          getRowId={(r) => r.id}
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          initialSort={{ id: "room", dir: "asc" }}
          rowActions={(r) => [{ label: "Edit room", icon: Pencil, onSelect: () => setModal({ open: true, room: r }), hidden: !perm.edit }]}
          emptyTitle="No rooms yet"
          mobileCard={(r, menu) => (
            <div className="flex items-start justify-between gap-3">
              <div className="grid flex-1 grid-cols-3 gap-3">
                <CardField label="Room">{r.roomNumber}</CardField>
                <CardField label="Beds">{r.totalBeds}</CardField>
                <CardField label="Rent">{r.defaultMonthlyRent ? inr(r.defaultMonthlyRent) : "—"}</CardField>
              </div>
              {menu}
            </div>
          )}
        />
      </Card>
      <RoomFormModal open={modal.open} room={modal.room} onClose={() => setModal({ open: false, room: null })} />
    </div>
  );
}
