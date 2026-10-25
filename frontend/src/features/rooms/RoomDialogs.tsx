import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { FormActions, Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/field";
import { RoomBedPicker } from "./RoomBedPicker";
import { roomApi, tenantApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { inr, todayIso } from "@/lib/format";
import type { Room } from "@/types";

const roomSchema = z.object({
  roomNumber: z.string().trim().min(1, "Room number is required").max(40),
  floor: z.string().max(20),
  capacity: z
    .string()
    .min(1, "Number of beds is required")
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 20, "Enter 1 to 20 beds"),
  defaultMonthlyRent: z.string().refine((v) => !v || Number(v) >= 0, "Rent cannot be negative"),
  description: z.string().max(500),
  isActive: z.boolean(),
});
type RoomValues = z.infer<typeof roomSchema>;

export function RoomFormModal({ open, room, onClose }: { open: boolean; room: Room | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const editing = Boolean(room);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RoomValues>({ resolver: zodResolver(roomSchema) });

  useEffect(() => {
    if (!open) return;
    reset({
      roomNumber: room?.roomNumber ?? "",
      floor: room?.floor ?? "",
      capacity: String(room?.totalBeds ?? ""),
      defaultMonthlyRent: room?.defaultMonthlyRent ? String(room.defaultMonthlyRent) : "",
      description: room?.description ?? "",
      isActive: room?.isActive ?? true,
    });
  }, [open, room, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const body = {
      roomNumber: v.roomNumber,
      floor: v.floor || null,
      capacity: Number(v.capacity),
      defaultMonthlyRent: v.defaultMonthlyRent ? Number(v.defaultMonthlyRent) : 0,
      description: v.description || null,
      ...(editing ? { isActive: v.isActive } : {}),
    };
    try {
      if (editing) await roomApi.update(room!.id, body);
      else await roomApi.create(body);
      toast.success(editing ? "Room updated" : "Room added", { description: `${v.roomNumber} · ${v.capacity} beds` });
      await refresh();
      onClose();
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isSubmitting}
      title={editing ? `Edit ${room!.roomNumber}` : "Add room"}
      description={editing ? "Changing the bed count adds beds or removes free ones." : "Beds B1, B2… are created automatically."}
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel={editing ? "Save changes" : "Add room"} />}
    >
      <div className="space-y-4">
        <FormGrid>
          <Field label="Room number" required error={errors.roomNumber?.message}>
            <Input placeholder="Room 13" data-autofocus {...register("roomNumber")} />
          </Field>
          <Field label="Floor" error={errors.floor?.message}>
            <Input {...register("floor")} />
          </Field>
          <Field
            label="Number of beds"
            required
            error={errors.capacity?.message}
            hint={editing && room!.occupied ? `${room!.occupied} occupied — minimum ${room!.occupied}` : undefined}
          >
            <Input type="number" inputMode="numeric" min={1} max={20} {...register("capacity")} />
          </Field>
          <Field label="Default rent per bed" error={errors.defaultMonthlyRent?.message} hint="Suggested when assigning a tenant">
            <MoneyInput {...register("defaultMonthlyRent")} />
          </Field>
        </FormGrid>
        <Field label="Description" error={errors.description?.message}>
          <Textarea rows={2} {...register("description")} />
        </Field>
        {editing && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-semibold text-fg">Room active</p>
              <p className="text-xs text-fg-subtle">Inactive rooms are hidden from bed selection.</p>
            </div>
            <Switch checked={watch("isActive")} onChange={(v) => setValue("isActive", v, { shouldDirty: true })} label="Room active" />
          </div>
        )}
      </div>
    </Modal>
  );
}

const allocateSchema = z.object({
  tenantId: z.string().min(1, "Select a tenant"),
  roomId: z.string().min(1, "Select a room"),
  bedId: z.string().min(1, "Select a bed"),
  startDate: z.string().min(1, "Choose the start date"),
});
type AllocateValues = z.infer<typeof allocateSchema>;

/**
 * Allocate a free bed to an active tenant who has none. For a brand-new tenant the
 * user is handed to the Add Tenant drawer with this bed preselected.
 */
export function AllocateBedModal({
  open,
  preset,
  onClose,
  onNewTenant,
}: {
  open: boolean;
  preset: { roomId: string; bedId?: string } | null;
  onClose: () => void;
  onNewTenant: (bed: { roomId: string; bedId: string }) => void;
}) {
  const refresh = useRefreshFinance();
  const tenants = useQuery({ queryKey: ["tenants", "active-options"], queryFn: () => tenantApi.list({ status: "ACTIVE" }), enabled: open });
  const unassigned = (tenants.data?.items ?? []).filter((t) => !t.bedId);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AllocateValues>({ resolver: zodResolver(allocateSchema) });

  useEffect(() => {
    if (open) reset({ tenantId: "", roomId: preset?.roomId ?? "", bedId: preset?.bedId ?? "", startDate: todayIso() });
  }, [open, preset, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await roomApi.allocate({ tenantId: v.tenantId, bedId: v.bedId, startDate: v.startDate });
      toast.success("Bed allocated");
      await refresh();
      onClose();
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  const roomId = watch("roomId") ?? "";
  const bedId = watch("bedId") ?? "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isSubmitting}
      title="Allocate bed"
      description="Assign a free bed to an active tenant."
      onSubmit={onSubmit}
      footer={
        <>
          <Button variant="ghost" className="sm:mr-auto" disabled={!roomId || !bedId} onClick={() => onNewTenant({ roomId, bedId })}>
            <UserPlus className="h-4 w-4" /> New tenant instead
          </Button>
          <FormActions onCancel={onClose} saving={isSubmitting} saveLabel="Allocate" />
        </>
      }
    >
      <div className="space-y-4">
        <FormGrid>
          <RoomBedPicker
            roomId={roomId}
            bedId={bedId}
            onRoomChange={(id) => setValue("roomId", id)}
            onBedChange={(id) => setValue("bedId", id, { shouldValidate: Boolean(errors.bedId) })}
            roomError={errors.roomId?.message}
            bedError={errors.bedId?.message}
          />
        </FormGrid>
        <Field
          label="Tenant"
          required
          error={errors.tenantId?.message}
          hint={!tenants.isLoading && !unassigned.length ? "Every active tenant already has a bed — use “New tenant instead”." : "Only active tenants without a bed are listed."}
        >
          <Select {...register("tenantId")} disabled={tenants.isLoading || !unassigned.length}>
            <option value="">{tenants.isLoading ? "Loading…" : "Select tenant"}</option>
            {unassigned.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tenantName} — {inr(t.monthlyRent)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start date" required error={errors.startDate?.message}>
          <Input type="date" {...register("startDate")} />
        </Field>
      </div>
    </Modal>
  );
}
