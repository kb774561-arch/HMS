import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted ring-border",
  primary: "bg-primary-soft text-primary-soft-fg ring-primary/20",
  success: "bg-success-soft text-success ring-success/25",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-danger ring-danger/25",
  info: "bg-info-soft text-info ring-info/25",
};

export function Badge({ tone = "neutral", children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const STATUS: Record<string, [Tone, string]> = {
  ACTIVE: ["success", "Active"],
  NOTICE: ["warning", "On notice"],
  VACATED: ["neutral", "Inactive"],
  BLOCKED: ["danger", "Blocked"],
  PAID: ["success", "Paid"],
  PARTIALLY_PAID: ["warning", "Partly paid"],
  PENDING: ["danger", "Pending"],
  OVERDUE: ["danger", "Overdue"],
  VOIDED: ["neutral", "Voided"],
  AVAILABLE: ["success", "Available"],
  OCCUPIED: ["primary", "Occupied"],
  INACTIVE: ["neutral", "Inactive"],
  FULL: ["primary", "Full"],
  VACANT: ["info", "Vacant"],
  COLLECTION: ["success", "Collected"],
  REFUND: ["info", "Refunded"],
  DEDUCTION: ["warning", "Deducted"],
  ADJUSTMENT_TO_RENT: ["warning", "Adjusted to rent"],
};

/** Status always shows a text label alongside its colour. */
export function StatusBadge({ status }: { status: string }) {
  const [tone, label] = STATUS[status] ?? ["neutral", status];
  return <Badge tone={tone}>{label}</Badge>;
}
