import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-surface shadow-soft", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const tileTones = {
  primary: "bg-primary-soft text-primary-soft-fg",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-2 text-fg-muted",
} as const;

/** KPI stat tile — the number is the hero; the icon is decoration only. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof tileTones;
  loading?: boolean;
}) {
  return (
    <Card className="flex min-w-0 items-start gap-3 p-4">
      {Icon && (
        <span className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex", tileTones[tone])} aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-fg-muted">{label}</p>
        {loading ? (
          <div className="mt-1.5 h-7 w-24 animate-pulse rounded-md bg-surface-3" />
        ) : (
          <p className="tabular mt-0.5 truncate text-xl font-bold tracking-tight text-fg sm:text-2xl">{value}</p>
        )}
        {hint && !loading && <p className="mt-0.5 truncate text-xs text-fg-subtle">{hint}</p>}
      </div>
    </Card>
  );
}

export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3",
        cols === 3 && "lg:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
        cols === 5 && "md:grid-cols-3 xl:grid-cols-5",
      )}
    >
      {children}
    </div>
  );
}

/** Single-hue magnitude bar (occupancy, share of total). Value text uses text tokens, not the fill colour. */
export function Meter({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-meter-track", className)}
    >
      <div className="h-full rounded-full bg-meter-fill transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}
