import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound, Pencil, Plus, Power } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DataTable, CardField, type Column } from "@/components/ui/data-table";
import { Field, FormGrid, Input, Select } from "@/components/ui/field";
import { FormActions, Modal } from "@/components/ui/overlay";
import { useAuth } from "@/features/auth/AuthProvider";
import { adminApi } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import type { AdminUser } from "@/types";

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash or underscore"),
  fullName: z.string().trim().min(1, "Full name is required"),
  roleId: z.string().min(1, "Select a role"),
  password: z.string().min(6, "At least 6 characters"),
});
const editSchema = createSchema.omit({ username: true }).extend({
  password: z.string().refine((v) => !v || v.length >= 6, "At least 6 characters"),
});
type Values = z.infer<typeof createSchema>;

function UserModal({ open, user, onClose }: { open: boolean; user: AdminUser | null; onClose: () => void }) {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["admin", "roles"], queryFn: adminApi.roles, enabled: open });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(user ? (editSchema as unknown as typeof createSchema) : createSchema) });

  useEffect(() => {
    if (open) reset({ username: user?.username ?? "", fullName: user?.fullName ?? "", roleId: user?.roleId ?? "", password: "" });
  }, [open, user, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      if (user) await adminApi.updateUser(user.id, { fullName: v.fullName, roleId: v.roleId, password: v.password || undefined });
      else await adminApi.createUser(v);
      toast.success(user ? "User updated" : "User created", { description: user ? undefined : "They'll be asked to set a new password on first sign-in." });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
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
      title={user ? `Edit ${user.username}` : "Add user"}
      onSubmit={onSubmit}
      footer={<FormActions onCancel={onClose} saving={isSubmitting} />}
    >
      <FormGrid>
        {!user && (
          <Field label="Username" required error={errors.username?.message}>
            <Input autoCapitalize="none" autoComplete="off" data-autofocus {...register("username")} />
          </Field>
        )}
        <Field label="Full name" required error={errors.fullName?.message}>
          <Input {...register("fullName")} />
        </Field>
        <Field label="Role" required error={errors.roleId?.message}>
          <Select {...register("roleId")}>
            <option value="">Select role</option>
            {(roles.data ?? [])
              .filter((r) => r.isActive)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roleName}
                </option>
              ))}
          </Select>
        </Field>
        <Field
          label={user ? "Reset password" : "Temporary password"}
          required={!user}
          error={errors.password?.message}
          hint={user ? "Leave blank to keep the current password" : "User must change it at first sign-in"}
        >
          <Input type="password" autoComplete="new-password" {...register("password")} />
        </Field>
      </FormGrid>
    </Modal>
  );
}

export function UsersTab() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [modal, setModal] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const query = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users });

  const toggle = useMutation({
    mutationFn: (u: AdminUser) => adminApi.updateUser(u.id, { isActive: !u.isActive }),
    onSuccess: async (_d, u) => {
      toast.success(u.isActive ? `${u.username} deactivated` : `${u.username} activated`);
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) => handleApiError(e),
  });

  const columns: Column<AdminUser>[] = [
    {
      id: "user",
      header: "User",
      sortValue: (u) => u.username,
      cell: (u) => (
        <div>
          <p className="font-semibold">
            {u.fullName} {u.id === me?.id && <span className="text-xs font-medium text-fg-subtle">(you)</span>}
          </p>
          <p className="text-xs text-fg-subtle">@{u.username}</p>
        </div>
      ),
    },
    { id: "role", header: "Role", sortValue: (u) => u.role, cell: (u) => <Badge tone={u.role === "SUPER_ADMIN" ? "primary" : "neutral"} dot={false}>{u.role}</Badge> },
    { id: "last", header: "Last sign-in", sortValue: (u) => u.lastLoginAt, cell: (u) => <span className="text-fg-muted">{formatDateTime(u.lastLoginAt)}</span>, hideBelow: "lg" },
    { id: "status", header: "Status", cell: (u) => <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} /> },
  ];

  return (
    <Card>
      <CardHeader
        title="Users"
        description="People who can sign in to this system."
        action={
          <Button size="sm" onClick={() => setModal({ open: true, user: null })}>
            <Plus className="h-4 w-4" /> Add user
          </Button>
        }
      />
      <DataTable
        caption="Users"
        columns={columns}
        rows={query.data ?? []}
        getRowId={(u) => u.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        rowActions={(u) => [
          { label: "Edit", icon: Pencil, onSelect: () => setModal({ open: true, user: u }) },
          { label: "Reset password", icon: KeyRound, onSelect: () => setModal({ open: true, user: u }) },
          { label: u.isActive ? "Deactivate" : "Activate", icon: Power, onSelect: () => toggle.mutate(u), hidden: u.id === me?.id, tone: u.isActive ? "danger" : "default" },
        ]}
        mobileCard={(u, menu) => (
          <div className="flex items-start justify-between gap-3">
            <div className="grid flex-1 grid-cols-2 gap-3">
              <CardField label="User">{u.fullName}</CardField>
              <CardField label="Role">{u.role}</CardField>
            </div>
            {menu}
          </div>
        )}
      />
      <UserModal open={modal.open} user={modal.user} onClose={() => setModal({ open: false, user: null })} />
    </Card>
  );
}
