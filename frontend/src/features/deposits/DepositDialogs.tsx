import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Drawer, FormActions, Modal } from "@/components/ui/overlay";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { StatusBadge } from "@/components/ui/badge";
import { depositApi, settingsApi, tenantApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { formatDate, inr, methodLabel, PAYMENT_METHODS, todayIso } from "@/lib/format";
import type { DepositRow } from "@/types";

const collectSchema = z.object({
  tenantId: z.string().min(1, "Select a tenant"),
  amount: z.string().refine((v) => Number(v) > 0, "Amount must be greater than 0"),
  txnDate: z.string().min(1, "Choose a date"),
  paymentMethod: z.string().min(1, "Choose a method"),
  collectionAccountId: z.string().min(1, "Select the receiving account"),
  notes: z.string().max(500),
});

export function CollectDepositModal({ open, row, onClose }: { open: boolean; row: DepositRow | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const tenants = useQuery({ queryKey: ["tenants", "all-options"], queryFn: () => tenantApi.list({}), enabled: open && !row });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: settingsApi.accounts, enabled: open });
  const active = (accounts.data ?? []).filter((a) => a.isActive);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof collectSchema>>({ resolver: zodResolver(collectSchema) });

  useEffect(() => {
    if (!open) return;
    reset({
      tenantId: row?.tenantId ?? "",
      amount: row?.dueToCollect ? String(row.dueToCollect) : "",
      txnDate: todayIso(),
      paymentMethod: "CASH",
      collectionAccountId: active[0]?.id ?? "",
      notes: "",
    });
    // Reset once per open (and once accounts arrive so the first account is preselected).
  }, [open, row, reset, accounts.isSuccess]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const res = await depositApi.collect({ ...v, amount: Number(v.amount), notes: v.notes || null });
      toast.success("Deposit recorded", {
        description: `Now holding ${inr(res.depositBalance)}`,
        action: res.whatsappLink ? { label: "WhatsApp", onClick: () => window.open(res.whatsappLink!, "_blank", "noopener") } : undefined,
      });
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
      title="Collect deposit"
      description={row ? row.tenantName : "Record a security deposit received."}
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel="Record deposit" />}
    >
      <div className="space-y-4">
        {!row && (
          <Field label="Tenant" required error={errors.tenantId?.message}>
            <Combobox
              options={(tenants.data?.items ?? []).map((t) => ({
                value: t.id,
                label: t.tenantName,
                hint: t.roomNumber ? `${t.roomNumber} / ${t.bedCode}` : t.isActive ? "Unallocated" : "Inactive",
              }))}
              value={watch("tenantId") ?? ""}
              onChange={(id) => setValue("tenantId", id, { shouldValidate: true })}
              placeholder={tenants.isLoading ? "Loading…" : "Search tenant name"}
              disabled={tenants.isLoading}
            />
          </Field>
        )}
        {row && row.agreedDeposit > 0 && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-muted">
            Agreed {inr(row.agreedDeposit)} · received {inr(row.received)} · <strong className="text-fg">{inr(row.dueToCollect)} to collect</strong>
          </p>
        )}
        <FormGrid>
          <Field label="Amount" required error={errors.amount?.message}>
            <MoneyInput {...register("amount")} />
          </Field>
          <Field label="Date" required error={errors.txnDate?.message}>
            <Input type="date" max={todayIso()} {...register("txnDate")} />
          </Field>
          <Field label="Method" required error={errors.paymentMethod?.message}>
            <Select {...register("paymentMethod")}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Receiving account" required error={errors.collectionAccountId?.message}>
            <Select {...register("collectionAccountId")}>
              <option value="">Select account</option>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <Field label="Notes" error={errors.notes?.message}>
          <Textarea rows={2} {...register("notes")} />
        </Field>
      </div>
    </Modal>
  );
}

const refundSchema = z.object({
  txnType: z.enum(["REFUND", "DEDUCTION", "ADJUSTMENT_TO_RENT"]),
  amount: z.string().refine((v) => Number(v) > 0, "Amount must be greater than 0"),
  txnDate: z.string().min(1, "Choose a date"),
  paymentMethod: z.string(),
  notes: z.string().max(500),
});

export function RefundDepositModal({ row, onClose }: { row: DepositRow | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const schema = refundSchema.refine((v) => !row || Number(v.amount) <= row.balance, {
    path: ["amount"],
    message: `Can't exceed the balance of ${inr(row?.balance ?? 0)}`,
  });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof refundSchema>>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (row) reset({ txnType: "REFUND", amount: String(row.balance || ""), txnDate: todayIso(), paymentMethod: "CASH", notes: "" });
  }, [row, reset]);

  const type = watch("txnType");

  const onSubmit = handleSubmit(async (v) => {
    try {
      const res = await depositApi.refund({
        tenantId: row!.tenantId,
        txnType: v.txnType,
        amount: Number(v.amount),
        txnDate: v.txnDate,
        paymentMethod: v.txnType === "REFUND" ? v.paymentMethod : undefined,
        notes: v.notes || null,
      });
      toast.success(v.txnType === "REFUND" ? "Refund recorded" : "Deduction recorded", { description: `Balance now ${inr(res.depositBalance)}` });
      await refresh();
      onClose();
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  return (
    <Modal
      open={Boolean(row)}
      onClose={onClose}
      busy={isSubmitting}
      title="Refund or deduct deposit"
      description={row ? `${row.tenantName} · holding ${inr(row.balance)}` : undefined}
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel={type === "REFUND" ? "Record refund" : "Record deduction"} />}
    >
      <div className="space-y-4">
        <Field label="Type" required>
          <Select {...register("txnType")}>
            <option value="REFUND">Refund to tenant</option>
            <option value="DEDUCTION">Deduction (damages, dues)</option>
            <option value="ADJUSTMENT_TO_RENT">Adjust against rent</option>
          </Select>
        </Field>
        <FormGrid>
          <Field label="Amount" required error={errors.amount?.message}>
            <MoneyInput {...register("amount")} />
          </Field>
          <Field label="Date" required error={errors.txnDate?.message}>
            <Input type="date" {...register("txnDate")} />
          </Field>
        </FormGrid>
        {type === "REFUND" && (
          <Field label="Paid back by">
            <Select {...register("paymentMethod")}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notes" error={errors.notes?.message} hint={type !== "REFUND" ? "Say what was deducted and why" : undefined}>
          <Textarea rows={2} {...register("notes")} />
        </Field>
      </div>
    </Modal>
  );
}

export function DepositLedgerDrawer({ row, onClose }: { row: DepositRow | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["deposits", "ledger", row?.tenantId],
    queryFn: () => depositApi.ledger(row!.tenantId),
    enabled: Boolean(row),
  });
  return (
    <Drawer open={Boolean(row)} onClose={onClose} title="Deposit history" description={row?.tenantName}>
      {row && (
        <div className="mb-5 grid grid-cols-3 gap-2 text-center">
          {[
            ["Received", row.received],
            ["Returned", row.refunded],
            ["Holding", row.balance],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-surface-2 py-3">
              <p className="tabular font-bold text-fg">{inr(v as number)}</p>
              <p className="text-xs text-fg-subtle">{k}</p>
            </div>
          ))}
        </div>
      )}
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
      ) : !data?.length ? (
        <p className="py-10 text-center text-sm text-fg-muted">No deposit transactions yet.</p>
      ) : (
        <ol className="space-y-2">
          {data.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <StatusBadge status={d.txnType} />
                <p className="mt-1 text-xs text-fg-subtle">
                  {formatDate(d.txnDate)}
                  {d.paymentMethod ? ` · ${methodLabel(d.paymentMethod)}` : ""}
                  {d.account ? ` · ${d.account}` : ""}
                </p>
                {d.notes && <p className="mt-1 text-[13px] text-fg-muted">{d.notes}</p>}
              </div>
              <span className={`tabular font-bold ${d.txnType === "COLLECTION" ? "text-success" : "text-fg"}`}>
                {d.txnType === "COLLECTION" ? "+" : "−"}
                {inr(d.amount)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
}
