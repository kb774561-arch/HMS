import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus, Power } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable, CardField, type Column } from "@/components/ui/data-table";
import { Field, FormGrid, Input, Select } from "@/components/ui/field";
import { FormActions, Modal } from "@/components/ui/overlay";
import { useModulePermissions } from "@/features/auth/AuthProvider";
import { settingsApi } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import type { CollectionAccount } from "@/types";

const schema = z.object({
  accountName: z.string().trim().min(1, "Account name is required").max(80),
  accountType: z.string(),
  accountHolder: z.string().max(120),
  bankName: z.string().max(120),
  accountReference: z.string().max(120),
  upiId: z.string().max(120),
});
type Values = z.infer<typeof schema>;

function AccountModal({ open, account, onClose }: { open: boolean; account: CollectionAccount | null; onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open)
      reset({
        accountName: account?.accountName ?? "",
        accountType: account?.accountType ?? "Receiving",
        accountHolder: account?.accountHolder ?? "",
        bankName: account?.bankName ?? "",
        accountReference: account?.accountReference ?? "",
        upiId: account?.upiId ?? "",
      });
  }, [open, account, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const body = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val || null]));
    try {
      if (account) await settingsApi.updateAccount(account.id, body);
      else await settingsApi.createAccount(body);
      toast.success(account ? "Account updated" : "Account added");
      await qc.invalidateQueries({ queryKey: ["accounts"] });
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
      title={account ? "Edit account" : "Add collection account"}
      description="Where rent and deposits are received — a person, bank account or UPI."
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} />}
    >
      <div className="space-y-4">
        <FormGrid>
          <Field label="Account name" required error={errors.accountName?.message}>
            <Input data-autofocus {...register("accountName")} />
          </Field>
          <Field label="Type">
            <Select {...register("accountType")}>
              {["Receiving", "Cash", "Bank", "UPI"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Account holder" error={errors.accountHolder?.message}>
            <Input {...register("accountHolder")} />
          </Field>
          <Field label="Bank name" error={errors.bankName?.message}>
            <Input {...register("bankName")} />
          </Field>
          <Field label="Account no. / reference" error={errors.accountReference?.message}>
            <Input {...register("accountReference")} />
          </Field>
          <Field label="UPI ID" error={errors.upiId?.message}>
            <Input {...register("upiId")} />
          </Field>
        </FormGrid>
      </div>
    </Modal>
  );
}

export function AccountsTab() {
  const perm = useModulePermissions("/settings");
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; account: CollectionAccount | null }>({ open: false, account: null });
  const query = useQuery({ queryKey: ["accounts"], queryFn: settingsApi.accounts });

  const toggle = useMutation({
    mutationFn: (a: CollectionAccount) => settingsApi.updateAccount(a.id, { isActive: !a.isActive }),
    onSuccess: async (_d, a) => {
      toast.success(a.isActive ? `${a.accountName} deactivated` : `${a.accountName} activated`);
      await qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => handleApiError(e),
  });

  const columns: Column<CollectionAccount>[] = [
    { id: "name", header: "Account", sortValue: (a) => a.accountName, cell: (a) => <span className="font-semibold">{a.accountName}</span> },
    { id: "type", header: "Type", cell: (a) => a.accountType ?? "—" },
    { id: "details", header: "Details", cell: (a) => <span className="text-fg-muted">{[a.bankName, a.accountReference, a.upiId].filter(Boolean).join(" · ") || "—"}</span>, hideBelow: "lg" },
    { id: "used", header: "Payments", align: "right", sortValue: (a) => a.paymentCount, cell: (a) => <span className="tabular">{a.paymentCount}</span> },
    { id: "status", header: "Status", cell: (a) => <StatusBadge status={a.isActive ? "ACTIVE" : "INACTIVE"} /> },
  ];

  return (
    <Card>
      <CardHeader
        title="Collection accounts"
        description="Choose one of these every time money is received."
        action={
          perm.add && (
            <Button size="sm" onClick={() => setModal({ open: true, account: null })}>
              <Plus className="h-4 w-4" /> Add account
            </Button>
          )
        }
      />
      <DataTable
        caption="Collection accounts"
        columns={columns}
        rows={query.data ?? []}
        getRowId={(a) => a.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        rowActions={(a) => [
          { label: "Edit", icon: Pencil, onSelect: () => setModal({ open: true, account: a }), hidden: !perm.edit },
          { label: a.isActive ? "Deactivate" : "Activate", icon: Power, onSelect: () => toggle.mutate(a), hidden: !perm.edit },
        ]}
        emptyTitle="No collection accounts"
        emptyDescription="Add at least one account before collecting rent."
        mobileCard={(a, menu) => (
          <div className="flex items-start justify-between gap-3">
            <div className="grid flex-1 grid-cols-2 gap-3">
              <CardField label="Account">{a.accountName}</CardField>
              <CardField label="Status">
                <StatusBadge status={a.isActive ? "ACTIVE" : "INACTIVE"} />
              </CardField>
            </div>
            {menu}
          </div>
        )}
      />
      <AccountModal open={modal.open} account={modal.account} onClose={() => setModal({ open: false, account: null })} />
    </Card>
  );
}
