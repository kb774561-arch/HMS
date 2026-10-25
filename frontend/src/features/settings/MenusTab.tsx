import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/field";
import { adminApi } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import type { AdminMenu } from "@/types";

/** Sidebar entries come from this table — rename, reorder or hide modules without a deploy. */
export function MenusTab() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "menus"], queryFn: adminApi.menus });
  const [editing, setEditing] = useState<{ id: string; menuName: string; displayOrder: string } | null>(null);

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<AdminMenu> }) => adminApi.updateMenu(id, body),
    onSuccess: async () => {
      toast.success("Menu updated");
      setEditing(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin", "menus"] }), qc.invalidateQueries({ queryKey: ["menus"] })]);
    },
    onError: (e) => handleApiError(e),
  });

  const menus = query.data ?? [];

  return (
    <Card>
      <CardHeader title="Menus" description="One entry per module. Hidden menus disappear from everyone's sidebar." />
      {query.isLoading ? (
        <div className="m-5 h-40 animate-pulse rounded-lg bg-surface-2" />
      ) : (
        <ul className="divide-y divide-border">
          {menus.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              {editing?.id === m.id ? (
                <form
                  className="flex flex-1 flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!editing.menuName.trim()) return toast.error("Menu name is required");
                    save.mutate({ id: m.id, body: { menuName: editing.menuName.trim(), displayOrder: Number(editing.displayOrder) || 0 } });
                  }}
                >
                  <Input aria-label="Menu name" value={editing.menuName} onChange={(e) => setEditing({ ...editing, menuName: e.target.value })} className="min-w-40 flex-1" autoFocus />
                  <Input aria-label="Order" type="number" value={editing.displayOrder} onChange={(e) => setEditing({ ...editing, displayOrder: e.target.value })} className="w-24" />
                  <Button type="submit" size="icon" loading={save.isPending} aria-label="Save">
                    {!save.isPending && <Check className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(null)} aria-label="Cancel">
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-fg">{m.menuName}</p>
                    <p className="text-xs text-fg-subtle">
                      {m.routePath} · order {m.displayOrder}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ id: m.id, menuName: m.menuName, displayOrder: String(m.displayOrder) })} aria-label={`Edit ${m.menuName}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Switch
                    label={`Show ${m.menuName}`}
                    checked={m.isActive}
                    disabled={m.routePath === "/settings" || save.isPending}
                    onChange={(v) => save.mutate({ id: m.id, body: { isActive: v } })}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
