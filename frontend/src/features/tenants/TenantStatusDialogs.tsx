import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FormActions, Modal } from "@/components/ui/overlay";
import { Field, FormGrid, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/field";
import { RoomBedPicker } from "@/features/rooms/RoomBedPicker";
import { settingsApi, tenantApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { inr, todayIso, toInputDate } from "@/lib/format";
import type { Tenant } from "@/types";

const deactivateSchema = z.object({
  leavingDate: z.string().min(1, "Choose the leaving date"),
  notes: z.string().max(500),
});

/** Deactivate = tenant moves out: bed is freed, rent stops after the leaving month, history is kept. */
export function DeactivateTenantModal({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof deactivateSchema>>({ resolver: zodResolver(deactivateSchema) });

  useEffect(() => {
    if (tenant) reset({ leavingDate: toInputDate(tenant.leavingDate) || todayIso(), notes: "" });
  }, [tenant, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await tenantApi.deactivate(tenant!.id, { leavingDate: v.leavingDate, notes: v.notes || undefined });
      toast.success(`${tenant!.tenantName} deactivated`, { description: tenant!.roomNumber ? `${tenant!.roomNumber} / ${tenant!.bedCode} is now free` : undefined });
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
      size="sm"
      title="Deactivate tenant"
      description={tenant?.tenantName}
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel="Deactivate" />}
    >
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          Their bed {tenant?.roomNumber ? <strong className="text-fg">{tenant.roomNumber} / {tenant.bedCode}</strong> : null} will be released. Rent and payment history is kept.
          {tenant && tenant.outstanding > 0 && (
            <span className="mt-2 block rounded-lg bg-warning-soft px-3 py-2 font-medium text-warning">{inr(tenant.outstanding)} rent is still outstanding.</span>
          )}
        </p>
        <Field label="Leaving date" required error={errors.leavingDate?.message}>
          <Input type="date" {...register("leavingDate")} />
        </Field>
        <Field label="Reason / note" error={errors.notes?.message}>
          <Textarea rows={2} {...register("notes")} />
        </Field>
      </div>
    </Modal>
  );
}

const activateSchema = z
  .object({
  withBed: z.boolean(),
  roomId: z.string(),
  bedId: z.string(),
  startDate: z.string().min(1, "Choose the start date"),
  monthlyRent: z.string().refine((v) => Number(v) > 0, "Rent must be greater than 0"),
})
  .refine((v) => !v.withBed || v.roomId, { path: ["roomId"], message: "Select a room" })
  .refine((v) => !v.withBed || v.bedId, { path: ["bedId"], message: "Select a bed" });

export function ReactivateTenantModal({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof activateSchema>>({ resolver: zodResolver(activateSchema) });

  // Suggest the bed they last used if it's still free.
  const detail = useQuery({ queryKey: ["tenant", tenant?.id], queryFn: () => tenantApi.get(tenant!.id), enabled: Boolean(tenant) });
  useEffect(() => {
    if (!tenant) return;
    const last = detail.data?.allocations[0];
    reset({ withBed: true, roomId: last?.roomId ?? "", bedId: "", startDate: todayIso(), monthlyRent: String(tenant.monthlyRent || "") });
  }, [tenant, detail.data, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await tenantApi.activate(tenant!.id, {
        roomId: v.withBed ? v.roomId : null,
        bedId: v.withBed ? v.bedId : null,
        startDate: v.startDate,
        monthlyRent: Number(v.monthlyRent),
      });
      toast.success(`${tenant!.tenantName} is active again`);
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
      size="md"
      title="Reactivate tenant"
      description={`${tenant?.tenantName ?? ""} — continue the stay with or without a bed`}
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel="Reactivate" />}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-semibold text-fg">Give a bed now</p>
            <p className="text-xs text-fg-subtle">Turn off to keep them registered and allocate later.</p>
          </div>
          <Switch checked={watch("withBed") ?? true} onChange={(v) => setValue("withBed", v)} label="Give a bed now" />
        </div>
        {watch("withBed") && (
        <FormGrid>
          <RoomBedPicker
            roomId={watch("roomId") ?? ""}
            bedId={watch("bedId") ?? ""}
            onRoomChange={(id) => setValue("roomId", id, { shouldValidate: Boolean(errors.roomId) })}
            onBedChange={(id) => setValue("bedId", id, { shouldValidate: Boolean(errors.bedId) })}
            roomError={errors.roomId?.message}
            bedError={errors.bedId?.message}
          />
        </FormGrid>
        )}
        <FormGrid>
          <Field label="Start date" required error={errors.startDate?.message}>
            <Input type="date" {...register("startDate")} />
          </Field>
          <Field label="Monthly rent" required error={errors.monthlyRent?.message}>
            <MoneyInput {...register("monthlyRent")} />
          </Field>
        </FormGrid>
      </div>
    </Modal>
  );
}

const chargeSchema = z.object({
  chargeTypeId: z.string().min(1, "Choose a charge type"),
  amount: z.string().refine((v) => Number(v) > 0, "Amount must be greater than 0"),
  chargeDate: z.string().min(1, "Choose a date"),
  description: z.string().max(300),
});

/** Extra charge (electricity, laundry…) added to that month's rent bill. */
export function AddChargeModal({ tenant, onClose }: { tenant: { id: string; tenantName: string } | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const types = useQuery({ queryKey: ["charge-types"], queryFn: settingsApi.chargeTypes, enabled: Boolean(tenant) });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof chargeSchema>>({ resolver: zodResolver(chargeSchema) });

  useEffect(() => {
    if (tenant) reset({ chargeTypeId: "", amount: "", chargeDate: todayIso(), description: "" });
  }, [tenant, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await tenantApi.addCharge({ tenantId: tenant!.id, chargeTypeId: v.chargeTypeId, amount: Number(v.amount), chargeDate: v.chargeDate, description: v.description || null });
      toast.success("Charge added", { description: "It's included in that month's rent bill." });
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
      size="sm"
      title="Add charge"
      description={tenant?.tenantName}
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel="Add charge" />}
    >
      <div className="space-y-4">
        <Field label="Charge type" required error={errors.chargeTypeId?.message}>
          <Select {...register("chargeTypeId")}>
            <option value="">{types.isLoading ? "Loading…" : "Select type"}</option>
            {(types.data ?? [])
              .filter((t) => t.isActive)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
        <FormGrid>
          <Field label="Amount" required error={errors.amount?.message}>
            <MoneyInput {...register("amount")} />
          </Field>
          <Field label="Date" required error={errors.chargeDate?.message}>
            <Input type="date" {...register("chargeDate")} />
          </Field>
        </FormGrid>
        <Field label="Description" error={errors.description?.message}>
          <Input {...register("description")} />
        </Field>
      </div>
    </Modal>
  );
}
