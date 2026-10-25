import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BedDouble, UserPlus } from "lucide-react";
import { Drawer, FormActions } from "@/components/ui/overlay";
import { Field, FormGrid, FormSection, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { RoomBedPicker } from "@/features/rooms/RoomBedPicker";
import { tenantApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { toInputDate, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tenant } from "@/types";

const phone = z
  .string()
  .trim()
  .refine((v) => !v || /^\+?[\d\s-]{10,15}$/.test(v), "Enter a valid 10-digit number");

const schema = z
  .object({
    mode: z.enum(["register", "allocate"]),
    tenantName: z.string().trim().min(1, "Tenant name is required").max(120, "Keep it under 120 characters"),
    roomId: z.string(),
    bedId: z.string(),
    joiningDate: z.string().min(1, "Joining date is required"),
    monthlyRent: z
      .string()
      .min(1, "Monthly rent is required")
      .refine((v) => Number(v) > 0, "Rent must be greater than 0"),
    whatsappNumber: phone,
    parentNumber: phone,
    leavingDate: z.string(),
    securityDeposit: z.string().refine((v) => !v || Number(v) >= 0, "Deposit cannot be negative"),
    notes: z.string().max(1000),
  })
  .refine((v) => v.mode !== "allocate" || v.roomId, { path: ["roomId"], message: "Select a room" })
  .refine((v) => v.mode !== "allocate" || v.bedId, { path: ["bedId"], message: "Select a bed" })
  .refine((v) => !v.leavingDate || v.leavingDate >= v.joiningDate, {
    path: ["leavingDate"],
    message: "Leaving date can't be before joining date",
  });
type Values = z.infer<typeof schema>;

const empty: Values = {
  mode: "register",
  tenantName: "",
  roomId: "",
  bedId: "",
  joiningDate: todayIso(),
  monthlyRent: "",
  whatsappNumber: "",
  parentNumber: "",
  leavingDate: "",
  securityDeposit: "",
  notes: "",
};

const MODES = [
  { value: "register", label: "Register only", hint: "Allocate a bed later", icon: UserPlus },
  { value: "allocate", label: "Register & allocate bed", hint: "Pick a free bed now", icon: BedDouble },
] as const;

/**
 * Add / Edit tenant in a right-side drawer. Closes only after the server confirms
 * the save; on any error the drawer stays open with the user's input intact.
 * Room/bed changes for existing tenants go through Allocate Bed or Transfer.
 */
export function TenantFormDrawer({
  open,
  onClose,
  tenant,
  onSaved,
  presetBed,
}: {
  open: boolean;
  onClose: () => void;
  tenant?: Tenant | null;
  onSaved?: (t: Tenant) => void;
  presetBed?: { roomId: string; bedId: string } | null;
}) {
  const refresh = useRefreshFinance();
  const editing = Boolean(tenant);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    if (!open) return;
    reset(
      tenant
        ? {
            ...empty,
            tenantName: tenant.tenantName,
            joiningDate: toInputDate(tenant.joiningDate),
            monthlyRent: String(tenant.monthlyRent || ""),
            whatsappNumber: tenant.whatsappNumber ?? "",
            parentNumber: tenant.parentNumber ?? "",
            leavingDate: toInputDate(tenant.leavingDate),
            securityDeposit: tenant.securityDeposit ? String(tenant.securityDeposit) : "",
            notes: tenant.notes ?? "",
          }
        : {
            ...empty,
            joiningDate: todayIso(),
            mode: presetBed ? "allocate" : "register",
            roomId: presetBed?.roomId ?? "",
            bedId: presetBed?.bedId ?? "",
          },
    );
  }, [open, tenant, presetBed, reset]);

  const mode = watch("mode");
  const roomId = watch("roomId");
  const bedId = watch("bedId");

  const onSubmit = handleSubmit(async (v) => {
    const payload = {
      tenantName: v.tenantName,
      joiningDate: v.joiningDate,
      monthlyRent: Number(v.monthlyRent),
      whatsappNumber: v.whatsappNumber || null,
      parentNumber: v.parentNumber || null,
      leavingDate: v.leavingDate || null,
      securityDeposit: v.securityDeposit ? Number(v.securityDeposit) : 0,
      notes: v.notes || null,
      ...(!editing && v.mode === "allocate" ? { roomId: v.roomId, bedId: v.bedId } : {}),
    };
    try {
      const saved = editing ? await tenantApi.update(tenant!.id, payload) : await tenantApi.create(payload);
      toast.success(editing ? "Tenant updated" : "Tenant registered", {
        description: saved.roomNumber ? `${saved.tenantName} · ${saved.roomNumber} / ${saved.bedCode}` : `${saved.tenantName} · bed not allocated yet`,
      });
      await refresh();
      onSaved?.(saved);
      onClose();
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={isSubmitting}
      title={editing ? "Edit tenant" : "Register tenant"}
      description={editing ? tenant!.tenantName : "Register now; allocate a bed now or later."}
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel={editing ? "Save changes" : "Register tenant"} />}
    >
      <div className="space-y-7">
        {!editing && (
          <div role="radiogroup" aria-label="Registration type" className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => setValue("mode", m.value)}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                  mode === m.value ? "border-primary bg-primary-soft" : "border-border-strong hover:bg-surface-2",
                )}
              >
                <m.icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", mode === m.value ? "text-primary-soft-fg" : "text-fg-subtle")} aria-hidden />
                <span>
                  <span className={cn("block text-sm font-semibold", mode === m.value ? "text-primary-soft-fg" : "text-fg")}>{m.label}</span>
                  <span className="block text-xs text-fg-muted">{m.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <FormSection title="Tenant">
          <Field label="Tenant name" required error={errors.tenantName?.message}>
            <Input autoComplete="off" data-autofocus {...register("tenantName")} />
          </Field>
          <FormGrid>
            <Field label="WhatsApp number" error={errors.whatsappNumber?.message}>
              <Input type="tel" inputMode="tel" placeholder="10-digit mobile" {...register("whatsappNumber")} />
            </Field>
            <Field label="Parent number" error={errors.parentNumber?.message}>
              <Input type="tel" inputMode="tel" {...register("parentNumber")} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Stay">
          {!editing && mode === "allocate" && (
            <FormGrid>
              <RoomBedPicker
                roomId={roomId}
                bedId={bedId}
                onRoomChange={(id) => setValue("roomId", id, { shouldValidate: Boolean(errors.roomId), shouldDirty: true })}
                onBedChange={(id, bed, room) => {
                  setValue("bedId", id, { shouldValidate: Boolean(errors.bedId), shouldDirty: true });
                  const suggested = bed?.defaultRent || room?.defaultMonthlyRent;
                  if (suggested && !dirtyFields.monthlyRent && !getValues("monthlyRent")) setValue("monthlyRent", String(suggested));
                }}
                roomError={errors.roomId?.message}
                bedError={errors.bedId?.message}
              />
            </FormGrid>
          )}
          {editing && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-fg-muted">
              {tenant!.roomNumber ? (
                <>
                  Staying in <strong className="text-fg">{tenant!.roomNumber} / {tenant!.bedCode}</strong>. Use <strong className="text-fg">Transfer</strong> to change the bed.
                </>
              ) : (
                <>
                  No bed allocated. Use <strong className="text-fg">Allocate bed</strong> from the tenant's actions.
                </>
              )}
            </p>
          )}
          <FormGrid>
            <Field label="Joining date" required error={errors.joiningDate?.message} hint={!editing && mode === "register" ? "Actual or planned joining date" : undefined}>
              <Input type="date" {...register("joiningDate")} />
            </Field>
            <Field label="Leaving date" error={errors.leavingDate?.message} hint="Planned move-out, if known">
              <Input type="date" {...register("leavingDate")} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Money">
          <FormGrid>
            <Field label="Monthly rent" required error={errors.monthlyRent?.message}>
              <MoneyInput placeholder="0" {...register("monthlyRent")} />
            </Field>
            <Field label="Security deposit" error={errors.securityDeposit?.message} hint="Agreed amount — record receipt in Deposits">
              <MoneyInput placeholder="0" {...register("securityDeposit")} />
            </Field>
          </FormGrid>
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea rows={3} {...register("notes")} />
          </Field>
        </FormSection>
      </div>
    </Drawer>
  );
}
