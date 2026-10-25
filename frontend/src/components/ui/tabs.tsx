import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabItem = { id: string; label: string; icon?: LucideIcon };

/** Vertical nav on desktop, horizontally scrollable pills on phones. */
export function SideTabs({ tabs, value, onChange, label }: { tabs: TabItem[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} aria-orientation="vertical" className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors",
              active ? "bg-primary-soft text-primary-soft-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {t.icon && <t.icon className="h-4 w-4" aria-hidden />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function InlineTabs({ tabs, value, onChange, label }: { tabs: TabItem[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px h-10 shrink-0 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors",
            t.id === value ? "border-primary text-primary-text" : "border-transparent text-fg-muted hover:text-fg",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
