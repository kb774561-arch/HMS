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
import { Field, Input } from "@/components/ui/field";
import { FormActions, Modal } from "@/components/ui/overlay";
import { adminApi } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import type { Role } from "@/types";

const schema = z.object({
  roleName: z.string().trim().min(2, "Role name is required").max(40),
  description: z.string().max(200),
});

function RoleModal({ open, role, onClose }: { open: boolean; role: Role | null; onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) reset({ roleName: role?.roleName ?? "", description: role?.description ?? "" });
  }, [open, role, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      if (role) await adminApi.updateRole(role.id, { description: v.description || null });
      else await adminApi.createRole({ roleName: v.roleName, description: v.description || null });
      toast.success(role ? "Role updated" : "Role created", { description: role ? undefined : "Grant its access in Permissions." });
      await qc.invalidateQueries({ queryKey: ["admin", "roles"] });
      onClose();
    } catch (err) {
      handleApiError(err, setError);
    }
  });

  return (
    <Modal open={open} onClose={onClose} busy={isSubmitting} size="sm" title={role ? `Edit ${role.roleName}` : "Add role"} onSubmit={onSubmit} footer={<FormActions onCancel={onClose} saving={isSubmitting} />}>
      <div className="space-y-4">
        <Field label="Role name" required error={errors.roleName?.message} hint={role ? "Role names can't be changed" : "Saved in CAPITALS, e.g. ACCOUNTANT"}>
          <Input disabled={Boolean(role)} data-autofocus {...register("roleName")} />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <Input {...register("description")} />
        </Field>
      </div>
    </Modal>
  );
}

export function RolesTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; role: Role | null }>({ open: false, role: null });
  const query = useQuery({ queryKey: ["admin", "roles"], queryFn: adminApi.roles });

  const toggle = useMutation({
    mutationFn: (r: Role) => adminApi.updateRole(r.id, { isActive: !r.isActive }),
    onSuccess: async () => {
      toast.success("Role updated");
      await qc.invalidateQueries({ queryKey: ["admin", "roles"] });
    },
    onError: (e) => handleApiError(e),
  });

  const columns: Column<Role>[] = [
    { id: "name", header: "Role", sortValue: (r) => r.roleName, cell: (r) => <span className="font-semibold">{r.roleName}</span> },
    { id: "desc", header: "Description", cell: (r) => <span className="text-fg-muted">{r.description ?? "—"}</span> },
    { id: "users", header: "Users", align: "right", sortValue: (r) => r.userCount, cell: (r) => <span className="tabular">{r.userCount}</span> },
    { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} /> },
  ];

  return (
    <Card>
      <CardHeader
        title="Roles"
        description="Group users by job. What each role can do is set under Permissions."
        action={
          <Button size="sm" onClick={() => setModal({ open: true, role: null })}>
            <Plus className="h-4 w-4" /> Add role
          </Button>
        }
      />
      <DataTable
        caption="Roles"
        columns={columns}
        rows={query.data ?? []}
        getRowId={(r) => r.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        rowActions={(r) => [
          { label: "Edit", icon: Pencil, onSelect: () => setModal({ open: true, role: r }) },
          { label: r.isActive ? "Deactivate" : "Activate", icon: Power, onSelect: () => toggle.mutate(r), hidden: r.isSystem },
        ]}
        mobileCard={(r, menu) => (
          <div className="flex items-start justify-between gap-3">
            <div className="grid flex-1 grid-cols-2 gap-3">
              <CardField label="Role">{r.roleName}</CardField>
              <CardField label="Users">{r.userCount}</CardField>
            </div>
            {menu}
          </div>
        )}
      />
      <RoleModal open={modal.open} role={modal.role} onClose={() => setModal({ open: false, role: null })} />
    </Card>
  );
}
