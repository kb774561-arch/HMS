import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FormActions, Modal } from "@/components/ui/overlay";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { paymentApi, rentApi, settingsApi, tenantApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { inr, PAYMENT_METHODS, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Receipt } from "@/types";

const schema = z.object({
  tenantId: z.string().min(1, "Select a tenant"),
  invoiceId: z.string(),
  amountReceived: z
    .string()
    .min(1, "Enter the amount received")
    .refine((v) => Number(v) > 0, "Amount must be greater than 0"),
  paymentMethod: z.string().min(1, "Choose a payment method"),
  collectionAccountId: z.string().min(1, "Select the receiving account"),
  paymentDate: z.string().min(1, "Choose the payment date"),
  transactionReference: z.string().max(120),
  notes: z.string().max(500),
});
type Values = z.infer<typeof schema>;

/**
 * Collect rent. Opened from Monthly Rent (tenant + month preselected), Tenants, or Payments.
 * The server allocates to the chosen month first, then older dues, and keeps any excess as advance.
 */
export function CollectPaymentModal({
  open,
  onClose,
  tenantId,
  invoiceId,
  onCollected,
}: {
  open: boolean;
  onClose: () => void;
  tenantId?: string | null;
  invoiceId?: string | null;
  onCollected: (receipt: Receipt) => void;
}) {
  const refresh = useRefreshFinance();
  const idempotencyKey = useRef("");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const selectedTenant = watch("tenantId");
  const selectedInvoice = watch("invoiceId");
  const method = watch("paymentMethod");

  const tenants = useQuery({
    queryKey: ["tenants", "active-options"],
    queryFn: () => tenantApi.list({ status: "ACTIVE" }),
    enabled: open && !tenantId,
  });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: settingsApi.accounts, enabled: open });
  const outstanding = useQuery({
    queryKey: ["outstanding", selectedTenant],
    queryFn: () => rentApi.outstanding(selectedTenant),
    enabled: open && Boolean(selectedTenant),
  });

  const activeAccounts = useMemo(() => (accounts.data ?? []).filter((a) => a.isActive), [accounts.data]);
  const invoices = outstanding.data ?? [];
  const totalDue = invoices.reduce((s, i) => s + i.pendingAmount, 0);
  const chosen = invoices.find((i) => i.id === selectedInvoice);

  // Fresh form + idempotency key every time the modal opens.
  useEffect(() => {
    if (!open) return;
    idempotencyKey.current = crypto.randomUUID();
    reset({
      tenantId: tenantId ?? "",
      invoiceId: invoiceId ?? "",
      amountReceived: "",
      paymentMethod: "CASH",
      collectionAccountId: "",
      paymentDate: todayIso(),
      transactionReference: "",
      notes: "",
    });
  }, [open, tenantId, invoiceId, reset]);

  // Default the receiving account once accounts load.
  useEffect(() => {
    if (open && activeAccounts.length && !watch("collectionAccountId")) setValue("collectionAccountId", activeAccounts[0]!.id);
  }, [open, activeAccounts, setValue, watch]);

  // Pick the month and prefill its pending amount when dues load or the month changes.
  useEffect(() => {
    if (!open || !outstanding.data) return;
    const current = outstanding.data.find((i) => i.id === watch("invoiceId")) ?? outstanding.data[0];
    if (current && current.id !== watch("invoiceId")) setValue("invoiceId", current.id);
    if (current) setValue("amountReceived", String(current.pendingAmount));
  }, [open, outstanding.data, selectedInvoice, setValue, watch]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const receipt = await paymentApi.create({
        tenantId: v.tenantId,
        paymentDate: v.paymentDate,
        amountReceived: Number(v.amountReceived),
        paymentMethod: v.paymentMethod,
        collectionAccountId: v.collectionAccountId,
        transactionReference: v.transactionReference || null,
        notes: v.notes || null,
        invoiceIds: v.invoiceId ? [v.invoiceId] : [],
        idempotencyKey: idempotencyKey.current,
      });
      toast.success(`${inr(receipt.amountReceived)} received from ${receipt.tenantName}`, { description: `Receipt ${receipt.receiptNumber}` });
      await refresh();
      onCollected(receipt);
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  const amount = Number(watch("amountReceived") || 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isSubmitting}
      size="md"
      title="Collect payment"
      description="Record rent received. A receipt is generated automatically."
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel="Record payment" />}
    >
      <div className="space-y-4">
        {!tenantId && (
          <Field label="Tenant" required error={errors.tenantId?.message}>
            <Combobox
              options={(tenants.data?.items ?? []).map((t) => ({
                value: t.id,
                label: t.tenantName,
                hint: t.roomNumber ? `${t.roomNumber} / ${t.bedCode}` : "Unallocated",
              }))}
              value={selectedTenant ?? ""}
              onChange={(id) => {
                setValue("tenantId", id, { shouldValidate: true });
                setValue("invoiceId", "");
              }}
              placeholder={tenants.isLoading ? "Loading tenants…" : "Search tenant name"}
              disabled={tenants.isLoading}
            />
          </Field>
        )}

        {selectedTenant && (
          <div className="rounded-xl border border-border bg-surface-2 p-3.5">
            {outstanding.isLoading ? (
              <div className="h-10 animate-pulse rounded-lg bg-surface-3" />
            ) : invoices.length === 0 ? (
              <p className="text-sm text-fg-muted">
                No rent is outstanding for this tenant. Anything you record will be kept as an <strong className="text-fg">advance</strong>.
              </p>
            ) : (
              <div className="space-y-3">
                <Field label="Month" required>
                  <Select {...register("invoiceId")}>
                    {invoices.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.label} — {inr(i.pendingAmount)} pending
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="text-fg-muted">
                    Outstanding this month: <strong className="tabular text-fg">{inr(chosen?.pendingAmount ?? 0)}</strong>
                  </span>
                  {invoices.length > 1 && (
                    <span className="text-fg-muted">
                      All dues: <strong className="tabular text-danger">{inr(totalDue)}</strong>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <FormGrid>
          <Field
            label="Amount received"
            required
            error={errors.amountReceived?.message}
            hint={
              amount > totalDue && invoices.length
                ? `${inr(amount - totalDue)} will be kept as advance`
                : amount > 0 && chosen && amount > chosen.pendingAmount
                  ? "Extra goes to older dues first"
                  : undefined
            }
          >
            <MoneyInput {...register("amountReceived")} placeholder="0" />
          </Field>
          <Field label="Payment date" required error={errors.paymentDate?.message}>
            <Input type="date" max={todayIso()} {...register("paymentDate")} />
          </Field>
        </FormGrid>

        <Field label="Payment method" required error={errors.paymentMethod?.message}>
          <Controller
            control={control}
            name="paymentMethod"
            render={({ field }) => (
              <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={field.value === m.value}
                    onClick={() => field.onChange(m.value)}
                    className={cn(
                      "h-10 rounded-lg border text-sm font-semibold transition-colors",
                      field.value === m.value
                        ? "border-primary bg-primary-soft text-primary-soft-fg"
                        : "border-border-strong bg-surface text-fg-muted hover:text-fg",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          />
        </Field>

        <FormGrid>
          <Field label="Receiving account" required error={errors.collectionAccountId?.message}>
            <Select {...register("collectionAccountId")} disabled={accounts.isLoading}>
              <option value="">{accounts.isLoading ? "Loading…" : "Select account"}</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName}
                </option>
              ))}
            </Select>
          </Field>
          {method !== "CASH" ? (
            <Field label="Transaction reference" error={errors.transactionReference?.message}>
              <Input placeholder="UPI / UTR no." {...register("transactionReference")} />
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}
        </FormGrid>

        <Field label="Notes" error={errors.notes?.message}>
          <Textarea rows={2} {...register("notes")} />
        </Field>
      </div>
    </Modal>
  );
}
