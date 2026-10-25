import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil, Plus, Power, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { adminApi, settingsApi } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

function SystemSettings() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "settings"], queryFn: adminApi.settings });
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const save = useMutation({
    mutationFn: (s: { key: string; value: string }) => adminApi.saveSetting(s.key, s.value),
    onSuccess: async () => {
      toast.success("Setting saved");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (e) => handleApiError(e),
  });

  return (
    <Card>
      <CardHeader title="System settings" description="Product-wide values such as currency and receipt prefix." />
      <ul className="divide-y divide-border">
        {query.isLoading && <li className="m-5 h-24 animate-pulse rounded-lg bg-surface-2" />}
        {(query.data ?? []).map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <code className="w-48 shrink-0 text-xs font-semibold text-fg-muted">{s.key}</code>
            {editing?.key === s.key ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate(editing);
                }}
              >
                <Input aria-label={s.key} value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} autoFocus className="flex-1" />
                <Button type="submit" size="icon" aria-label="Save" loading={save.isPending}>
                  {!save.isPending && <Check className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{s.value}</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.key}`} onClick={() => setEditing({ key: s.key, value: s.value })}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ChargeTypes() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["charge-types"], queryFn: settingsApi.chargeTypes });
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["charge-types"] });

  const create = useMutation({
    mutationFn: () => settingsApi.createChargeType({ name: name.trim() }),
    onSuccess: async () => {
      toast.success("Charge type added");
      setName("");
      await invalidate();
    },
    onError: (e) => {
      const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fe?.name) setNameError(fe.name);
      else handleApiError(e);
    },
  });
  const toggle = useMutation({
    mutationFn: (t: { id: string; isActive: boolean }) => settingsApi.updateChargeType(t.id, { isActive: !t.isActive }),
    onSuccess: invalidate,
    onError: (e) => handleApiError(e),
  });

  return (
    <Card>
      <CardHeader title="Charge types" description="Extra charges you can add to a tenant's monthly bill." />
      <form
        className="flex gap-2 border-b border-border p-4 sm:px-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setNameError(null);
          if (!name.trim()) return setNameError("Enter a name");
          create.mutate();
        }}
      >
        <div className="flex-1">
          <Input aria-label="New charge type" aria-invalid={Boolean(nameError)} placeholder="e.g. Electricity" value={name} onChange={(e) => setName(e.target.value)} />
          {nameError && <p className="mt-1 text-xs font-medium text-danger">{nameError}</p>}
        </div>
        <Button type="submit" loading={create.isPending}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
      <ul className="divide-y divide-border">
        {(query.data ?? []).map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <span className="flex-1 text-sm font-medium text-fg">{t.name}</span>
            <StatusBadge status={t.isActive ? "ACTIVE" : "INACTIVE"} />
            <Button variant="ghost" size="icon-sm" aria-label={t.isActive ? `Disable ${t.name}` : `Enable ${t.name}`} onClick={() => toggle.mutate(t)}>
              <Power className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AuditLog() {
  const query = useQuery({ queryKey: ["admin", "audit"], queryFn: adminApi.auditLogs });
  return (
    <Card>
      <CardHeader title="Recent activity" description="Last 100 actions across the system." />
      <ul className="scrollbar-thin max-h-96 divide-y divide-border overflow-y-auto">
        {query.isLoading && <li className="m-5 h-24 animate-pulse rounded-lg bg-surface-2" />}
        {(query.data ?? []).map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
            <span>
              <strong className="text-fg">{l.actor}</strong> <span className="text-fg-muted">{l.action.replaceAll("_", " ").toLowerCase()}</span>
            </span>
            <span className="text-xs text-fg-subtle">{formatDateTime(l.createdAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function GeneralTab() {
  return (
    <div className="space-y-5">
      <SystemSettings />
      <ChargeTypes />
      <AuditLog />
    </div>
  );
}
