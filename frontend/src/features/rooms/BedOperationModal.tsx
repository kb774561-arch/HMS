import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDown, ArrowLeftRight, ArrowRight, BedDouble, MoveRight } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FormGrid, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/field";
import { bedOpsApi, tenantApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { inr, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tenant } from "@/types";

export type BedOperationMode = "transfer" | "swap";

const money = z.string().refine((v) => !v || Number(v) > 0, "Rent must be greater than 0");

const schema = z
  .object({
    mode: z.enum(["transfer", "swap"]),
    tenantId: z.string(),
    toRoomId: z.string(),
    toBedId: z.string(),
    tenantAId: z.string(),
    tenantBId: z.string(),
    effectiveDate: z.string().min(1, "Choose the effective date"),
    changeRent: z.boolean(),
    newMonthlyRent: money,
    newMonthlyRentA: money,
    newMonthlyRentB: money,
    reason: z.string().max(300),
    notes: z.string().max(500),
  })
  .superRefine((v, ctx) => {
    const need = (path: string, ok: unknown, message: string) => !ok && ctx.addIssue({ code: "custom", path: [path], message });
    if (v.mode === "transfer") {
      need("tenantId", v.tenantId, "Select a student");
      need("toRoomId", v.toRoomId, "Select the destination room");
      need("toBedId", v.toBedId, "Select an available bed");
    } else {
      need("tenantAId", v.tenantAId, "Select student A");
      need("tenantBId", v.tenantBId, "Select student B");
      if (v.tenantAId && v.tenantAId === v.tenantBId) need("tenantBId", false, "Choose two different students");
    }
    if (v.effectiveDate > todayIso()) need("effectiveDate", false, "The effective date can't be in the future");
  });
type Values = z.infer<typeof schema>;

function BedCard({ label, tenant, tone = "neutral" }: { label: string; tenant?: Tenant; tone?: "neutral" | "primary" }) {
  return (
    <div className={cn("min-w-0 rounded-xl border p-3", tone === "primary" ? "border-primary/30 bg-primary-soft/50" : "border-border bg-surface-2")}>
      <p className="text-xs text-fg-subtle">{label}</p>
      {tenant ? (
        <>
          <p className="truncate font-bold text-fg">
            {tenant.roomNumber} / {tenant.bedCode}
          </p>
          <p className="tabular text-xs text-fg-muted">{inr(tenant.monthlyRent)} / month</p>
        </>
      ) : (
        <p className="text-sm text-fg-subtle">—</p>
      )}
    </div>
  );
}

function PreviewRow({ name, from, to }: { name: string; from: string; to: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_minmax(0,1fr)]">
      <span className="truncate font-semibold text-fg">{name}</span>
      <span className="hidden truncate text-fg-muted sm:block">{from}</span>
      <MoveRight className="hidden h-4 w-4 text-primary-text sm:block" aria-hidden />
      <span className="truncate text-right font-semibold text-primary-text sm:text-left">
        <span className="text-fg-muted sm:hidden">{from} → </span>
        {to}
      </span>
    </li>
  );
}

/**
 * Transfer to an empty bed, or swap two occupied beds — one modal, one API call,
 * one database transaction on the server.
 */
export function BedOperationModal({
  open,
  onClose,
  initialMode = "transfer",
  initialTenantId,
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: BedOperationMode;
  initialTenantId?: string | null;
}) {
  const refresh = useRefreshFinance();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  const v = watch();

  useEffect(() => {
    if (!open) return;
    reset({
      mode: initialMode,
      tenantId: initialMode === "transfer" ? (initialTenantId ?? "") : "",
      toRoomId: "",
      toBedId: "",
      tenantAId: initialMode === "swap" ? (initialTenantId ?? "") : "",
      tenantBId: "",
      effectiveDate: todayIso(),
      changeRent: false,
      newMonthlyRent: "",
      newMonthlyRentA: "",
      newMonthlyRentB: "",
      reason: "",
      notes: "",
    });
  }, [open, initialMode, initialTenantId, reset]);

  const residents = useQuery({
    queryKey: ["tenants", "residing-options"],
    queryFn: () => tenantApi.list({ status: "ACTIVE", accommodation: "RESIDING" }),
    enabled: open,
  });
  const byId = useMemo(() => new Map((residents.data?.items ?? []).map((t) => [t.id, t])), [residents.data]);
  const options = (exclude?: string) =>
    (residents.data?.items ?? [])
      .filter((t) => t.id !== exclude)
      .map((t) => ({ value: t.id, label: t.tenantName, hint: `${t.roomNumber} / ${t.bedCode}` }));

  const mode = v.mode ?? initialMode;
  const student = byId.get(v.tenantId ?? "");
  const a = byId.get(v.tenantAId ?? "");
  const b = byId.get(v.tenantBId ?? "");

  // Beds free on the chosen date (the student's own bed excluded from conflicts).
  const available = useQuery({
    queryKey: ["beds", "available", v.effectiveDate, v.tenantId],
    queryFn: () => bedOpsApi.available(v.effectiveDate, v.tenantId || undefined),
    enabled: open && mode === "transfer" && Boolean(v.effectiveDate),
  });
  const freeBeds = (available.data ?? []).filter((bed) => bed.id !== student?.bedId);
  const rooms = useMemo(() => {
    const map = new Map<string, { id: string; roomNumber: string; floor: string | null; count: number }>();
    for (const bed of freeBeds) {
      const r = map.get(bed.roomId) ?? { id: bed.roomId, roomNumber: bed.roomNumber, floor: bed.floor, count: 0 };
      r.count++;
      map.set(bed.roomId, r);
    }
    return [...map.values()];
  }, [freeBeds]);
  const bedsInRoom = freeBeds.filter((bed) => bed.roomId === v.toRoomId);
  const target = freeBeds.find((bed) => bed.id === v.toBedId);

  // Selected bed vanished after a date change → clear it.
  useEffect(() => {
    if (v.toBedId && available.data && !freeBeds.some((bed) => bed.id === v.toBedId)) setValue("toBedId", "");
  }, [available.data, freeBeds, v.toBedId, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (values.mode === "transfer") {
        const res = await bedOpsApi.transfer({
          tenantId: values.tenantId,
          toBedId: values.toBedId,
          effectiveDate: values.effectiveDate,
          newMonthlyRent: values.changeRent && values.newMonthlyRent ? Number(values.newMonthlyRent) : undefined,
          reason: values.reason || null,
          notes: values.notes || null,
        });
        toast.success(`${res.studentA.name} transferred`, { description: `${res.studentA.from} → ${res.studentA.to}. The old bed is now available.` });
      } else {
        const res = await bedOpsApi.swap({
          tenantAId: values.tenantAId,
          tenantBId: values.tenantBId,
          effectiveDate: values.effectiveDate,
          newMonthlyRentA: values.changeRent && values.newMonthlyRentA ? Number(values.newMonthlyRentA) : undefined,
          newMonthlyRentB: values.changeRent && values.newMonthlyRentB ? Number(values.newMonthlyRentB) : undefined,
          reason: values.reason || null,
          notes: values.notes || null,
        });
        toast.success("Beds swapped", {
          description: `${res.studentA.name} → ${res.studentA.to} · ${res.studentB?.name} → ${res.studentB?.to}`,
        });
      }
      await refresh();
      onClose();
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  const switchMode = (m: BedOperationMode) => {
    setValue("mode", m);
    if (m === "swap" && !v.tenantAId && v.tenantId) setValue("tenantAId", v.tenantId);
    if (m === "transfer" && !v.tenantId && v.tenantAId) setValue("tenantId", v.tenantAId);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isSubmitting}
      size="lg"
      title="Transfer / Swap bed"
      description="Move a student to an empty bed, or exchange two students' beds."
      onSubmit={onSubmit}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {mode === "transfer" ? "Confirm transfer" : "Confirm swap"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div role="radiogroup" aria-label="Operation" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {(
            [
              ["transfer", "Transfer to empty bed", BedDouble],
              ["swap", "Swap two beds", ArrowLeftRight],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => switchMode(value)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
                mode === value ? "bg-surface text-primary-text shadow-soft" : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {mode === "transfer" ? (
          <>
            <Field label="Student" required error={errors.tenantId?.message}>
              <Combobox
                options={options()}
                value={v.tenantId ?? ""}
                onChange={(id) => {
                  setValue("tenantId", id, { shouldValidate: true });
                  setValue("toBedId", "");
                }}
                placeholder={residents.isLoading ? "Loading students…" : "Search student"}
                disabled={residents.isLoading}
              />
            </Field>
            <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <BedCard label="Current room / bed" tenant={student} />
              <ArrowRight className="mx-auto hidden h-5 w-5 text-fg-subtle sm:block" aria-hidden />
              <ArrowDown className="mx-auto h-5 w-5 text-fg-subtle sm:hidden" aria-hidden />
              <div className="min-w-0 rounded-xl border border-primary/30 bg-primary-soft/50 p-3">
                <p className="text-xs text-fg-subtle">New room / bed</p>
                <p className="truncate font-bold text-primary-text">{target ? `${target.roomNumber} / ${target.bedCode}` : "Choose below"}</p>
                <p className="text-xs text-fg-muted">{student ? "Old bed becomes available" : " "}</p>
              </div>
            </div>
            <FormGrid>
              <Field label="Effective date" required error={errors.effectiveDate?.message} hint="Beds shown are free on this date">
                <Input type="date" max={todayIso()} {...register("effectiveDate")} />
              </Field>
              <div className="hidden sm:block" />
              <Field label="Destination room" required error={errors.toRoomId?.message}>
                <Select
                  value={v.toRoomId ?? ""}
                  disabled={!v.tenantId || available.isLoading}
                  onChange={(e) => {
                    setValue("toRoomId", e.target.value, { shouldValidate: Boolean(errors.toRoomId) });
                    setValue("toBedId", "");
                  }}
                >
                  <option value="">{!v.tenantId ? "Select a student first" : available.isLoading ? "Checking beds…" : rooms.length ? "Select room" : "No free beds on this date"}</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roomNumber}
                      {r.id === student?.roomId ? " (same room)" : ""} — {r.count} free
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Available bed" required error={errors.toBedId?.message}>
                <Select value={v.toBedId ?? ""} disabled={!v.toRoomId} onChange={(e) => setValue("toBedId", e.target.value, { shouldValidate: Boolean(errors.toBedId) })}>
                  <option value="">{v.toRoomId ? "Select bed" : "Choose a room first"}</option>
                  {bedsInRoom.map((bed) => (
                    <option key={bed.id} value={bed.id}>
                      {bed.bedCode}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormGrid>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Field label="Student A" required error={errors.tenantAId?.message}>
                  <Combobox
                    options={options(v.tenantBId)}
                    value={v.tenantAId ?? ""}
                    onChange={(id) => setValue("tenantAId", id, { shouldValidate: true })}
                    placeholder={residents.isLoading ? "Loading…" : "Search student A"}
                    disabled={residents.isLoading}
                  />
                </Field>
                <BedCard label="Current room / bed A" tenant={a} />
              </div>
              <div className="space-y-2">
                <Field label="Student B" required error={errors.tenantBId?.message}>
                  <Combobox
                    options={options(v.tenantAId)}
                    value={v.tenantBId ?? ""}
                    onChange={(id) => setValue("tenantBId", id, { shouldValidate: true })}
                    placeholder={residents.isLoading ? "Loading…" : "Search student B"}
                    disabled={residents.isLoading}
                  />
                </Field>
                <BedCard label="Current room / bed B" tenant={b} />
              </div>
            </div>
            {a && b && (
              <div className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wider text-fg-subtle uppercase">Before</p>
                  <ul className="space-y-1.5">
                    <li className="flex justify-between gap-2">
                      <span className="truncate font-semibold text-fg">{a.tenantName}</span>
                      <span className="text-fg-muted">
                        {a.roomNumber} / {a.bedCode}
                      </span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="truncate font-semibold text-fg">{b.tenantName}</span>
                      <span className="text-fg-muted">
                        {b.roomNumber} / {b.bedCode}
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="sm:border-l sm:border-border sm:pl-3">
                  <p className="mb-2 text-xs font-bold tracking-wider text-primary-text uppercase">After</p>
                  <ul className="space-y-1.5">
                    <PreviewRow name={a.tenantName} from={`${a.roomNumber} / ${a.bedCode}`} to={`${b.roomNumber} / ${b.bedCode}`} />
                    <PreviewRow name={b.tenantName} from={`${b.roomNumber} / ${b.bedCode}`} to={`${a.roomNumber} / ${a.bedCode}`} />
                  </ul>
                  <p className="mt-2 text-xs text-fg-subtle">Both beds stay occupied — occupancy doesn't change.</p>
                </div>
              </div>
            )}
            <FormGrid>
              <Field label="Swap effective date" required error={errors.effectiveDate?.message}>
                <Input type="date" max={todayIso()} {...register("effectiveDate")} />
              </Field>
            </FormGrid>
          </>
        )}

        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-fg">Change monthly rent</p>
              <p className="text-xs text-fg-subtle">Off by default — rent, invoices and payments stay as they are.</p>
            </div>
            <Switch checked={v.changeRent ?? false} onChange={(on) => setValue("changeRent", on)} label="Change monthly rent" />
          </div>
          {v.changeRent && (
            <FormGrid>
              {mode === "transfer" ? (
                <Field label="New monthly rent" error={errors.newMonthlyRent?.message} hint={`Current ${inr(student?.monthlyRent ?? 0)} · applies from the effective date`}>
                  <MoneyInput {...register("newMonthlyRent")} placeholder={String(target?.defaultRent || student?.monthlyRent || "")} />
                </Field>
              ) : (
                <>
                  <Field label={`New rent — ${a?.tenantName ?? "student A"}`} error={errors.newMonthlyRentA?.message} hint={a ? `Current ${inr(a.monthlyRent)}` : undefined}>
                    <MoneyInput {...register("newMonthlyRentA")} />
                  </Field>
                  <Field label={`New rent — ${b?.tenantName ?? "student B"}`} error={errors.newMonthlyRentB?.message} hint={b ? `Current ${inr(b.monthlyRent)}` : undefined}>
                    <MoneyInput {...register("newMonthlyRentB")} />
                  </Field>
                </>
              )}
            </FormGrid>
          )}
        </div>

        <Field label="Reason" error={errors.reason?.message}>
          <Input placeholder={mode === "transfer" ? "e.g. requested a quieter room" : "e.g. friends wanted the same room"} {...register("reason")} />
        </Field>
        <Field label="Notes" error={errors.notes?.message}>
          <Textarea rows={2} {...register("notes")} />
        </Field>
      </div>
    </Modal>
  );
}
