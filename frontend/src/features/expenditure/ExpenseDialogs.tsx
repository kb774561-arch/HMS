import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Pencil, Plus, Power, X } from "lucide-react";
import { ConfirmDialog, FormActions, Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { expenseApi, settingsApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { formatDate, formatDateTime, inr, methodLabel, PAYMENT_METHODS, todayIso, toInputDate } from "@/lib/format";
import type { Expense } from "@/types";

const schema = z.object({
  expenseDate: z.string().min(1, "Choose the expense date"),
  categoryId: z.string().min(1, "Choose a category"),
  description: z.string().trim().min(1, "Description is required").max(200),
  amount: z
    .string()
    .min(1, "Enter the amount")
    .refine((v) => Number(v) > 0, "Amount must be greater than 0"),
  paymentMethod: z.string().min(1, "Choose how it was paid"),
  collectionAccountId: z.string().min(1, "Select the account it was paid from"),
  transactionReference: z.string().max(120),
  notes: z.string().max(500),
});
type Values = z.infer<typeof schema>;

export function useExpenseCategories(enabled = true) {
  return useQuery({ queryKey: ["expense-categories"], queryFn: expenseApi.categories, enabled });
}

/** Add / Edit expenditure. Backdated dates are allowed; amounts must be positive. */
export function ExpenseFormModal({ open, expense, onClose }: { open: boolean; expense: Expense | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const categories = useExpenseCategories(open);
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: settingsApi.accounts, enabled: open });
  const activeAccounts = (accounts.data ?? []).filter((a) => a.isActive || a.id === expense?.collectionAccountId);
  const activeCategories = (categories.data ?? []).filter((c) => c.isActive || c.id === expense?.categoryId);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset(
      expense
        ? {
            expenseDate: toInputDate(expense.expenseDate),
            categoryId: expense.categoryId,
            description: expense.description,
            amount: String(expense.amount),
            paymentMethod: expense.paymentMethod,
            collectionAccountId: expense.collectionAccountId,
            transactionReference: expense.transactionReference ?? "",
            notes: expense.notes ?? "",
          }
        : { expenseDate: todayIso(), categoryId: "", description: "", amount: "", paymentMethod: "CASH", collectionAccountId: "", transactionReference: "", notes: "" },
    );
  }, [open, expense, reset]);

  useEffect(() => {
    if (open && !expense && activeAccounts.length && !getValues("collectionAccountId")) setValue("collectionAccountId", activeAccounts[0]!.id);
  }, [open, expense, activeAccounts, getValues, setValue]);

  const onSubmit = handleSubmit(async (v) => {
    const body = { ...v, amount: Number(v.amount), transactionReference: v.transactionReference || null, notes: v.notes || null };
    try {
      if (expense) await expenseApi.update(expense.id, body);
      else await expenseApi.create(body);
      toast.success(expense ? "Expenditure updated" : "Expenditure saved", { description: `${v.description} · ${inr(Number(v.amount))}` });
      await refresh("expenses");
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
      title={expense ? "Edit expenditure" : "Add expenditure"}
      description="Record a PG operating expense. Deposits and rent are kept separately."
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} saveLabel={expense ? "Save changes" : "Save expenditure"} />}
    >
      <div className="space-y-4">
        <FormGrid>
          <Field label="Expense date" required error={errors.expenseDate?.message}>
            <Input type="date" max={todayIso()} data-autofocus {...register("expenseDate")} />
          </Field>
          <Field label="Category" required error={errors.categoryId?.message}>
            <Select {...register("categoryId")} disabled={categories.isLoading}>
              <option value="">{categories.isLoading ? "Loading…" : "Select category"}</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <Field label="Description" required error={errors.description?.message}>
          <Input placeholder="e.g. Daily milk purchase" {...register("description")} />
        </Field>
        <FormGrid>
          <Field label="Amount" required error={errors.amount?.message}>
            <MoneyInput placeholder="0" {...register("amount")} />
          </Field>
          <Field label="Payment method" required error={errors.paymentMethod?.message}>
            <Select {...register("paymentMethod")}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paid from account" required error={errors.collectionAccountId?.message}>
            <Select {...register("collectionAccountId")} disabled={accounts.isLoading}>
              <option value="">{accounts.isLoading ? "Loading…" : "Select account"}</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference number" error={errors.transactionReference?.message}>
            <Input placeholder="Bill / UPI ref." {...register("transactionReference")} />
          </Field>
        </FormGrid>
        <Field label="Notes" error={errors.notes?.message}>
          <Textarea rows={2} {...register("notes")} />
        </Field>
      </div>
    </Modal>
  );
}

export function ExpenseViewModal({ expense, onClose, onEdit, canEdit }: { expense: Expense | null; onClose: () => void; onEdit: (e: Expense) => void; canEdit: boolean }) {
  const e = expense;
  return (
    <Modal
      open={Boolean(e)}
      onClose={onClose}
      title="Expenditure details"
      description={e ? `${e.category} · ${formatDate(e.expenseDate)}` : undefined}
      footer={
        e &&
        canEdit &&
        !e.voidedAt && (
          <Button variant="outline" onClick={() => onEdit(e)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )
      }
    >
      {e && (
        <div className="space-y-4">
          {e.voidedAt && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              Voided on {formatDateTime(e.voidedAt)} — {e.voidReason}
            </p>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-base font-semibold text-fg">{e.description}</p>
            <p className={`tabular text-2xl font-extrabold ${e.voidedAt ? "text-fg-subtle line-through" : "text-fg"}`}>{inr(e.amount)}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-4 text-sm">
            {[
              ["Expense date", formatDate(e.expenseDate)],
              ["Category", e.category],
              ["Payment method", methodLabel(e.paymentMethod)],
              ["Paid from", e.account],
              ["Reference", e.transactionReference || "—"],
              ["Created by", `${e.createdBy ?? "—"} · ${formatDateTime(e.createdAt)}`],
              ["Last updated by", `${e.updatedBy ?? "—"} · ${formatDateTime(e.updatedAt)}`],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-fg-subtle">{k}</dt>
                <dd className="truncate font-semibold text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          {e.notes && <p className="text-sm whitespace-pre-wrap text-fg-muted">{e.notes}</p>}
        </div>
      )}
    </Modal>
  );
}

/** Void instead of delete — the entry stays in history but leaves every total. */
export function VoidExpenseDialog({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setReason("");
    setError(null);
  }, [expense]);

  const mutation = useMutation({
    mutationFn: () => expenseApi.void(expense!.id, reason.trim()),
    onSuccess: async () => {
      toast.success("Expenditure voided", { description: "It stays in history but no longer counts in totals." });
      await refresh("expenses");
      onClose();
    },
    onError: (e) => {
      const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fe?.reason) setError(fe.reason);
      else handleApiError(e);
    },
  });

  return (
    <ConfirmDialog
      open={Boolean(expense)}
      onClose={onClose}
      onConfirm={() => (reason.trim().length < 3 ? setError("Give a reason") : mutation.mutate())}
      loading={mutation.isPending}
      title="Void expenditure?"
      confirmLabel="Void"
      message={
        <>
          <strong className="text-fg">{expense?.description}</strong> ({inr(expense?.amount ?? 0)}) will be removed from totals. It is kept on record and can't be edited afterwards.
        </>
      }
    >
      <Field label="Reason" required error={error ?? undefined}>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" />
      </Field>
    </ConfirmDialog>
  );
}

/** Super Admin: add, rename, activate or deactivate expense categories. */
export function CategoryManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const categories = useExpenseCategories(open);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["expense-categories"] });

  const create = useMutation({
    mutationFn: () => expenseApi.createCategory({ name: name.trim() }),
    onSuccess: async () => {
      toast.success("Category added");
      setName("");
      await invalidate();
    },
    onError: (e) => {
      const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fe?.name) setNameError(fe.name);
      else handleApiError(e);
    },
  });
  const update = useMutation({
    mutationFn: (p: { id: string; body: { name?: string; isActive?: boolean } }) => expenseApi.updateCategory(p.id, p.body),
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
    },
    onError: (e) => handleApiError(e),
  });

  return (
    <Modal open={open} onClose={onClose} title="Expense categories" description="Inactive categories stay on old entries but can't be chosen for new ones.">
      <div className="space-y-4">
        <form
          className="flex gap-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setNameError(null);
            if (!name.trim()) return setNameError("Enter a name");
            create.mutate();
          }}
        >
          <div className="flex-1">
            <Input aria-label="New category" aria-invalid={Boolean(nameError)} placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
            {nameError && <p className="mt-1 text-xs font-medium text-danger">{nameError}</p>}
          </div>
          <Button type="submit" loading={create.isPending}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {(categories.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              {editing?.id === c.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editing.name.trim()) update.mutate({ id: c.id, body: { name: editing.name.trim() } });
                  }}
                >
                  <Input aria-label="Category name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus className="flex-1" />
                  <Button type="submit" size="icon-sm" aria-label="Save" loading={update.isPending}>
                    {!update.isPending && <Check className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-fg">{c.name}</span>
                  <StatusBadge status={c.isActive ? "ACTIVE" : "INACTIVE"} />
                  <Button variant="ghost" size="icon-sm" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={c.isActive ? `Deactivate ${c.name}` : `Activate ${c.name}`}
                    onClick={() => update.mutate({ id: c.id, body: { isActive: !c.isActive } })}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
