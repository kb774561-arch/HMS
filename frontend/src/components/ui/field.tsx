import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-lg border border-border-strong bg-surface text-base text-fg shadow-soft transition-colors duration-150 placeholder:text-fg-subtle hover:border-fg-subtle focus:border-primary focus:outline-none focus:ring-3 focus:ring-ring/25 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70 aria-invalid:border-danger aria-invalid:focus:ring-danger/20 sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, "h-10 px-3", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(control, "min-h-20 px-3 py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(control, "h-10 appearance-none pr-9 pl-3", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  ),
);
Select.displayName = "Select";

/** Money input with a ₹ prefix. */
export const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <div className="relative">
    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-fg-subtle">₹</span>
    <input ref={ref} type="number" inputMode="decimal" min={0} step="any" className={cn(control, "tabular h-10 pr-3 pl-7", className)} {...props} />
  </div>
));
MoneyInput.displayName = "MoneyInput";

/**
 * Label + control + hint/error. The single child control receives id,
 * aria-invalid and aria-describedby automatically. When the control is nested
 * inside a wrapper, pass `htmlFor` and wire the inner input yourself.
 */
export function Field({
  label,
  error,
  hint,
  required,
  className,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  htmlFor?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const control = htmlFor
    ? children
    : isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string) ?? id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required || undefined,
      })
    : children;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor ?? (children.props.id as string) ?? id} className="text-[13px] font-semibold text-fg">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-fg-subtle">optional</span>
        )}
      </label>
      {control}
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-center gap-1 text-xs font-medium text-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-xs font-bold tracking-wider text-fg-subtle uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>{children}</div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-50",
        checked ? "bg-primary" : "bg-surface-3 ring-1 ring-border-strong ring-inset",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-150",
          checked ? "translate-x-5.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
