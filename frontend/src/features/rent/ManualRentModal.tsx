import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, Calculator } from "lucide-react";
import { FormActions, Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/badge";
import { rentApi, tenantApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { formatDate, inr, MONTHS, monthLabel } from "@/lib/format";
import type { ManualRentPreview } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

const schema = z
  .object({
    tenantId: z.string().min(1, "Select a tenant"),
    month: z.string(),
    year: z.string(),
    periodFrom: z.string().min(1, "Choose the start date"),
    periodTo: z.string().min(1, "Choose the end date"),
    amount: z
      .string()
      .min(1, "Enter the final rent amount")
      .refine((v) => Number(v) > 0, "Amount must be greater than 0"),
    dueDate: z.string(),
    reason: z.string().max(300),
    notes: z.string().max(500),
  })
  .refine((v) => v.periodTo >= v.periodFrom, { path: ["periodTo"], message: "End can't be before start" });
type Values = z.infer<typeof schema>;

export function ManualRentModal({
  open,
  onClose,
  month,
  year,
  onAdjustExisting,
  onCollect,
}: {
  open: boolean;
  onClose: () => void;
  month: number;
  year: number;
  /** Existing invoice found → hand over to the Adjust flow instead of duplicating. */
  onAdjustExisting: (invoiceId: string, tenantName: string) => void;
  onCollect: (tenantId: string, invoiceId: string) => void;
}) {
  const refresh = useRefreshFinance();
  const [preview, setPreview] = useState<ManualRentPreview | null>(null);

  const tenants = useQuery({ queryKey: ["tenants", "all-options"], queryFn: () => tenantApi.list({}), enabled: open });
  const options = useMemo(
    () =>
      (tenants.data?.items ?? []).map((t) => ({
        value: t.id,
        label: t.tenantName,
        hint: t.roomNumber ? `${t.roomNumber} / ${t.bedCode}` : t.isActive ? "Unallocated" : "Inactive",
      })),
    [tenants.data],
  );

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
  const m = Number(v.month || month);
  const y = Number(v.year || year);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    reset({ tenantId: "", month: String(month), year: String(year), periodFrom: "", periodTo: "", amount: "", dueDate: `${year}-${pad(month)}-10`, reason: "", notes: "" });
  }, [open, month, year, reset]);

  // Load the tenant context and default period whenever tenant or billing month changes.
  useEffect(() => {
    if (!open || !v.tenantId) return;
    let cancelled = false;
    rentApi
      .manualPreview({ tenantId: v.tenantId, month: m, year: y })
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setValue("periodFrom", p.defaultFrom);
        setValue("periodTo", p.defaultTo);
        setValue("amount", String(p.suggestedAmount));
        setValue("dueDate", `${y}-${pad(m)}-10`);
      })
      .catch((e) => handleApiError(e));
    return () => {
      cancelled = true;
    };
  }, [open, v.tenantId, m, y, setValue]);

  // Recalculate the suggestion when the period changes.
  useEffect(() => {
    if (!open || !v.tenantId || !v.periodFrom || !v.periodTo || !preview) return;
    if (v.periodFrom === preview.periodFrom && v.periodTo === preview.periodTo) return;
    const t = setTimeout(() => {
      rentApi
        .manualPreview({ tenantId: v.tenantId, month: m, year: y, from: v.periodFrom, to: v.periodTo })
        .then((p) => {
          setPreview(p);
          setValue("amount", String(p.suggestedAmount));
        })
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [open, v.tenantId, v.periodFrom, v.periodTo, m, y, preview, setValue]);

  const overridden = preview && v.amount !== "" && Math.abs(Number(v.amount) - preview.suggestedAmount) >= 0.01;
  const minDate = `${y}-${pad(m)}-01`;
  const maxDate = `${y}-${pad(m)}-${pad(lastDay(y, m))}`;

  const onSubmit = handleSubmit(async (values) => {
    if (overridden && !values.reason.trim()) {
      setError("reason", { message: "Give a reason for changing the calculated amount" }, { shouldFocus: true });
      return;
    }
    try {
      const res = await rentApi.manualCreate({
        tenantId: values.tenantId,
        month: m,
        year: y,
        periodFrom: values.periodFrom,
        periodTo: values.periodTo,
        amount: Number(values.amount),
        dueDate: values.dueDate || null,
        reason: values.reason || null,
        notes: values.notes || null,
      });
      toast.success("Manual rent saved", {
        description: `${preview?.tenant.tenantName} · ${monthLabel(m, y)} · ${inr(res.totalPayable)}`,
        action: { label: "Collect now", onClick: () => onCollect(res.tenantId, res.id) },
      });
      await refresh();
      onClose();
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  const existing = preview?.existingInvoice;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isSubmitting}
      size="lg"
      title="Manual rent entry"
      description="Bill a tenant for an exact period — e.g. registered late, joined mid-month."
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel="Save manual rent" />}
    >
      <div className="space-y-5">
        <FormGrid>
          <Field label="Tenant" required error={errors.tenantId?.message}>
            <Combobox
              options={options}
              value={v.tenantId ?? ""}
              onChange={(id) => setValue("tenantId", id, { shouldValidate: true })}
              placeholder={tenants.isLoading ? "Loading tenants…" : "Search tenant name"}
              disabled={tenants.isLoading}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Billing month" required>
              <Select {...register("month")}>
                {MONTHS.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Billing year" required>
              <Select {...register("year")}>
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 4 + i).map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </FormGrid>

        {preview && (
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-fg-subtle">Room / Bed</dt>
              <dd className="font-semibold text-fg">
                {preview.allocation ? `${preview.allocation.roomNumber} / ${preview.allocation.bedCode}` : "Unallocated"}
                {preview.allocation && !preview.allocation.current && <span className="block text-xs font-normal text-fg-subtle">historical</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">Actual joining date</dt>
              <dd className="font-semibold text-fg">{formatDate(preview.tenant.joiningDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">Standard monthly rent</dt>
              <dd className="tabular font-semibold text-fg">{inr(preview.tenant.monthlyRent)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">Chargeable days</dt>
              <dd className="tabular font-semibold text-fg">
                {preview.chargeableDays} / {preview.daysInMonth}
              </dd>
            </div>
          </dl>
        )}

        {existing ? (
          <div role="alert" className="space-y-3 rounded-xl border border-warning/40 bg-warning-soft p-4">
            <p className="flex items-start gap-2 text-sm font-semibold text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {preview?.tenant.tenantName} already has rent for {monthLabel(m, y)} — a second invoice isn't allowed.
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-fg">
              <span>
                Source: <strong>{existing.source === "MANUAL" ? "Manual" : "Auto"}</strong>
              </span>
              <span className="tabular">
                Rent: <strong>{inr(existing.baseRent)}</strong>
              </span>
              <span className="tabular">
                Paid: <strong>{inr(existing.paidAmount)}</strong>
              </span>
              <StatusBadge status={existing.status} />
            </div>
            <Button variant="outline" size="sm" onClick={() => onAdjustExisting(existing.id, preview!.tenant.tenantName)}>
              Adjust existing invoice
            </Button>
          </div>
        ) : (
          v.tenantId && (
            <>
              <FormGrid>
                <Field label="Rent period from" required error={errors.periodFrom?.message}>
                  <Input type="date" min={minDate} max={maxDate} {...register("periodFrom")} />
                </Field>
                <Field label="Rent period to" required error={errors.periodTo?.message}>
                  <Input type="date" min={minDate} max={maxDate} {...register("periodTo")} />
                </Field>
              </FormGrid>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary-soft px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-primary-soft-fg">
                  <Calculator className="h-4 w-4" /> Calculated {preview && preview.chargeableDays < preview.daysInMonth ? "prorated" : "full-month"} rent
                </span>
                <span className="tabular text-lg font-extrabold text-primary-soft-fg">{inr(preview?.suggestedAmount ?? 0)}</span>
              </div>
              <FormGrid>
                <Field
                  label="Final rent amount"
                  required
                  error={errors.amount?.message}
                  hint={overridden ? `Differs from calculated ${inr(preview!.suggestedAmount)} — reason required` : "Edit to override the calculated amount"}
                >
                  <MoneyInput {...register("amount")} />
                </Field>
                <Field label="Due date" error={errors.dueDate?.message}>
                  <Input type="date" {...register("dueDate")} />
                </Field>
              </FormGrid>
              <Field label="Adjustment reason" required={Boolean(overridden)} error={errors.reason?.message}>
                <Input placeholder="e.g. Joined on 5th, agreed to bill from 10th" {...register("reason")} />
              </Field>
              <Field label="Notes" error={errors.notes?.message}>
                <Textarea rows={2} {...register("notes")} />
              </Field>
            </>
          )
        )}
      </div>
    </Modal>
  );
}

const adjustSchema = z.object({
  amount: z
    .string()
    .min(1, "Enter the rent amount")
    .refine((v) => Number(v) >= 0, "Amount can't be negative"),
  reason: z.string().trim().min(3, "Give a reason for the adjustment"),
});

/** Authorised change to an invoice's rent. Payments stay as they are; the original amount is kept. */
export function AdjustInvoiceModal({
  invoice,
  onClose,
}: {
  invoice: { id: string; tenantName: string; baseRent: number; paidAmount: number; label: string; originalAmount?: number | null } | null;
  onClose: () => void;
}) {
  const refresh = useRefreshFinance();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof adjustSchema>>({ resolver: zodResolver(adjustSchema) });

  useEffect(() => {
    if (invoice) reset({ amount: String(invoice.baseRent), reason: "" });
  }, [invoice, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const res = await rentApi.adjustInvoice(invoice!.id, { amount: Number(v.amount), reason: v.reason });
      toast.success("Rent adjusted", { description: `New balance ${inr(res.pendingAmount)}` });
      await refresh();
      onClose();
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  return (
    <Modal
      open={Boolean(invoice)}
      onClose={onClose}
      busy={isSubmitting}
      size="sm"
      title="Adjust rent"
      description={invoice ? `${invoice.tenantName} · ${invoice.label}` : undefined}
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel="Save adjustment" />}
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3 text-sm">
          <div>
            <dt className="text-xs text-fg-subtle">Current rent</dt>
            <dd className="tabular font-semibold text-fg">{inr(invoice?.baseRent ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Already paid</dt>
            <dd className="tabular font-semibold text-fg">{inr(invoice?.paidAmount ?? 0)}</dd>
          </div>
          {invoice?.originalAmount != null && invoice.originalAmount !== invoice.baseRent && (
            <div className="col-span-2">
              <dt className="text-xs text-fg-subtle">Originally calculated</dt>
              <dd className="tabular font-semibold text-fg">{inr(invoice.originalAmount)}</dd>
            </div>
          )}
        </dl>
        <Field label="New rent amount" required error={errors.amount?.message} hint="Extra charges on the bill are kept as they are">
          <MoneyInput {...register("amount")} />
        </Field>
        <Field label="Reason" required error={errors.reason?.message}>
          <Input placeholder="e.g. Moved to a cheaper bed on 20th" {...register("reason")} />
        </Field>
      </div>
    </Modal>
  );
}
