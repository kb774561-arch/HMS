import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FormActions, Modal } from "@/components/ui/overlay";
import { Field, FormGrid, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { RoomBedPicker } from "@/features/rooms/RoomBedPicker";
import { tenantApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { todayIso, toInputDate } from "@/lib/format";
import type { Tenant } from "@/types";

const rent = z.string().refine((v) => !v || Number(v) > 0, "Rent must be greater than 0");

const allocateSchema = z.object({
  roomId: z.string().min(1, "Select a room"),
  bedId: z.string().min(1, "Select a bed"),
  startDate: z.string().min(1, "Choose the allocation date"),
  monthlyRent: rent,
  notes: z.string().max(500),
});

/** Allocate Bed Later — for a registered tenant who has no bed. */
export function AllocateTenantBedModal({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof allocateSchema>>({ resolver: zodResolver(allocateSchema) });

  useEffect(() => {
    if (!tenant) return;
    const joined = toInputDate(tenant.joiningDate);
    reset({ roomId: "", bedId: "", startDate: joined > todayIso() ? joined : todayIso(), monthlyRent: String(tenant.monthlyRent || ""), notes: "" });
  }, [tenant, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const saved = await tenantApi.allocate(tenant!.id, {
        roomId: v.roomId,
        bedId: v.bedId,
        startDate: v.startDate,
        monthlyRent: v.monthlyRent ? Number(v.monthlyRent) : undefined,
        notes: v.notes || null,
      });
      toast.success("Bed allocated", { description: `${saved.tenantName} · ${saved.roomNumber} / ${saved.bedCode}` });
      await refresh();
      onClose();
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  return (
    <Modal
      open={Boolean(tenant)}
      onClose={onClose}
      busy={isSubmitting}
      title="Allocate bed"
      description="Assign a free bed to this registered tenant."
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel="Allocate bed" />}
    >
      <div className="space-y-4">
        <Field label="Tenant" required>
          <Input value={tenant?.tenantName ?? ""} readOnly disabled />
        </Field>
        <FormGrid>
          <RoomBedPicker
            roomId={watch("roomId") ?? ""}
            bedId={watch("bedId") ?? ""}
            onRoomChange={(id) => setValue("roomId", id, { shouldValidate: Boolean(errors.roomId) })}
            onBedChange={(id) => setValue("bedId", id, { shouldValidate: Boolean(errors.bedId) })}
            roomError={errors.roomId?.message}
            bedError={errors.bedId?.message}
          />
          <Field label="Allocation date" required error={errors.startDate?.message}>
            <Input type="date" {...register("startDate")} />
          </Field>
          <Field label="Monthly rent" required error={errors.monthlyRent?.message}>
            <MoneyInput {...register("monthlyRent")} />
          </Field>
        </FormGrid>
        <Field label="Notes" error={errors.notes?.message}>
          <Textarea rows={2} {...register("notes")} />
        </Field>
      </div>
    </Modal>
  );
}
