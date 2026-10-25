import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg shadow-soft hover:bg-primary-hover",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3",
  outline: "border border-border-strong bg-surface text-fg hover:bg-surface-2",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger-hover dark:text-[#1a0606]",
  soft: "bg-primary-soft text-primary-soft-fg hover:brightness-95 dark:hover:brightness-125",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
  lg: "h-11 gap-2 rounded-xl px-5 text-[15px]",
  icon: "h-10 w-10 rounded-lg",
  "icon-sm": "h-8 w-8 rounded-lg",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

/** Defaults to type="button" so no button can accidentally submit (and reload) a form. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, className, type = "button", disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-semibold whitespace-nowrap transition-colors duration-150 disabled:opacity-55",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
