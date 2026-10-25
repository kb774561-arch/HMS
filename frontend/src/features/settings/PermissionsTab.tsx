import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { FilterSelect } from "@/components/ui/toolbar";
import { InlineTabs } from "@/components/ui/tabs";
import { adminApi } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { PermissionAction } from "@/types";

const ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: "VIEW", label: "View" },
  { key: "ADD", label: "Add" },
  { key: "EDIT", label: "Edit" },
  { key: "DELETE", label: "Delete" },
  { key: "EXPORT", label: "Export" },
  { key: "PRINT", label: "Print" },
];

function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-5 w-5 cursor-pointer rounded accent-[var(--primary)] disabled:cursor-not-allowed"
    />
  );
}

function RoleMatrix() {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["admin", "roles"], queryFn: adminApi.roles });
  const editable = (roles.data ?? []).filter((r) => r.roleName !== "SUPER_ADMIN");
  const [roleId, setRoleId] = useState("");
  useEffect(() => {
    if (!roleId && editable[0]) setRoleId(editable[0].id);
  }, [editable, roleId]);

  const matrix = useQuery({ queryKey: ["admin", "role-perms", roleId], queryFn: () => adminApi.rolePermissions(roleId), enabled: Boolean(roleId) });
  const set = useMutation({
    mutationFn: adminApi.setRolePermission,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "role-perms", roleId] }),
    onError: (e) => handleApiError(e),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect label="Role" value={roleId} onChange={setRoleId} options={editable.map((r) => ({ value: r.id, label: r.roleName }))} />
        <p className="flex items-center gap-1.5 text-[13px] text-fg-muted">
          <ShieldCheck className="h-4 w-4 text-success" /> SUPER_ADMIN always has full access.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Permissions for the selected role</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-xs text-fg-muted uppercase">
              <th scope="col" className="px-4 py-2.5 text-left font-semibold">
                Module
              </th>
              {ACTIONS.map((a) => (
                <th key={a.key} scope="col" className="px-2 py-2.5 text-center font-semibold">
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(matrix.data ?? []).map((row) => (
              <tr key={row.menuId} className={cn("border-b border-border last:border-0", set.isPending && "opacity-70")}>
                <th scope="row" className="px-4 py-2.5 text-left font-semibold text-fg">
                  {row.menuName}
                </th>
                {ACTIONS.map((a) => (
                  <td key={a.key} className="px-2 py-2.5 text-center">
                    <Check
                      label={`${row.menuName} ${a.label}`}
                      checked={row.actions[a.key]}
                      disabled={set.isPending || (a.key !== "VIEW" && !row.actions.VIEW)}
                      onChange={(allowed) => {
                        set.mutate({ roleId, menuId: row.menuId, action: a.key, allowed });
                        // Removing View hides the module, so its other rights go too.
                        if (a.key === "VIEW" && !allowed)
                          ACTIONS.filter((x) => x.key !== "VIEW" && row.actions[x.key]).forEach((x) =>
                            set.mutate({ roleId, menuId: row.menuId, action: x.key, allowed: false }),
                          );
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {matrix.isLoading && <div className="m-4 h-32 animate-pulse rounded-lg bg-surface-2" />}
      </div>
      <p className="text-xs text-fg-subtle">Changes save instantly and apply on the user's next page load.</p>
    </div>
  );
}

type OverrideState = "inherit" | "allow" | "deny";

function UserOverrides() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users });
  const menus = useQuery({ queryKey: ["admin", "menus"], queryFn: adminApi.menus });
  const editable = (users.data ?? []).filter((u) => u.role !== "SUPER_ADMIN");
  const [userId, setUserId] = useState("");
  useEffect(() => {
    if (!userId && editable[0]) setUserId(editable[0].id);
  }, [editable, userId]);

  const overrides = useQuery({ queryKey: ["admin", "user-perms", userId], queryFn: () => adminApi.userOverrides(userId), enabled: Boolean(userId) });
  const set = useMutation({
    mutationFn: adminApi.setUserOverride,
    onSuccess: () => {
      toast.success("Override saved");
      return qc.invalidateQueries({ queryKey: ["admin", "user-perms", userId] });
    },
    onError: (e) => handleApiError(e),
  });

  const stateOf = (menuId: string, action: PermissionAction): OverrideState => {
    const o = overrides.data?.find((x) => x.menuId === menuId && x.action === action);
    return !o ? "inherit" : o.allowed ? "allow" : "deny";
  };

  if (!editable.length && !users.isLoading) return <p className="text-sm text-fg-muted">No non-admin users to override.</p>;

  return (
    <div className="space-y-4">
      <FilterSelect label="User" value={userId} onChange={setUserId} options={editable.map((u) => ({ value: u.id, label: `${u.fullName} (${u.role})` }))} />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Per-user permission overrides</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-xs text-fg-muted uppercase">
              <th scope="col" className="px-4 py-2.5 text-left font-semibold">
                Module
              </th>
              {ACTIONS.map((a) => (
                <th key={a.key} scope="col" className="px-2 py-2.5 text-center font-semibold">
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(menus.data ?? [])
              .filter((m) => m.isActive)
              .map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-semibold text-fg">
                    {m.menuName}
                  </th>
                  {ACTIONS.map((a) => {
                    const value = stateOf(m.id, a.key);
                    return (
                      <td key={a.key} className="px-1.5 py-2 text-center">
                        <select
                          aria-label={`${m.menuName} ${a.label} override`}
                          value={value}
                          disabled={set.isPending}
                          onChange={(e) => {
                            const v = e.target.value as OverrideState;
                            set.mutate({ userId, menuId: m.id, action: a.key, allowed: v === "inherit" ? null : v === "allow" });
                          }}
                          className={cn(
                            "h-8 rounded-md border border-border-strong bg-surface px-1 text-xs font-semibold",
                            value === "allow" && "text-success",
                            value === "deny" && "text-danger",
                            value === "inherit" && "text-fg-subtle",
                          )}
                        >
                          <option value="inherit">Role</option>
                          <option value="allow">Allow</option>
                          <option value="deny">Deny</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-subtle">“Role” follows the user's role. Allow / Deny overrides it for this user only.</p>
    </div>
  );
}

export function PermissionsTab() {
  const [tab, setTab] = useState("roles");
  return (
    <Card>
      <CardHeader title="Permissions" description="Control what each role — or a single user — can see and do in every module." />
      <div className="px-4 sm:px-5">
        <InlineTabs
          label="Permission scope"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "roles", label: "By role" },
            { id: "users", label: "User overrides" },
          ]}
        />
      </div>
      <div className="p-4 sm:p-5">{tab === "roles" ? <RoleMatrix /> : <UserOverrides />}</div>
    </Card>
  );
}
