import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; hint?: string; disabled?: boolean };

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
};

/**
 * Searchable single-select (WAI-ARIA combobox). Type to filter, arrows to move,
 * Enter to pick, Escape to close. id / aria-* props land on the input, so it works
 * inside <Field> like any other control.
 */
export function Combobox({ options, value, onChange, placeholder = "Search…", emptyText = "No matches", disabled, className, ...inputProps }: Props) {
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => setActive(0), [query, open]);

  const pick = (o: ComboOption) => {
    if (o.disabled) return;
    onChange(o.value);
    setQuery("");
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + filtered.length) % Math.max(filtered.length, 1));
    } else if (e.key === "Enter") {
      if (open && filtered[active]) {
        e.preventDefault();
        pick(filtered[active]!);
      }
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={wrap} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <input
        ref={input}
        {...inputProps}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={open ? query : (selected?.label ?? "")}
        placeholder={selected ? selected.label : placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKey}
        className={cn(
          "h-10 w-full rounded-lg border border-border-strong bg-surface pr-9 pl-9 text-base text-fg shadow-soft transition-colors placeholder:text-fg-subtle hover:border-fg-subtle focus:border-primary focus:ring-3 focus:ring-ring/25 focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70 aria-invalid:border-danger sm:text-sm",
          className,
        )}
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="scrollbar-thin absolute z-[70] mt-1 max-h-64 w-full animate-fade-in overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-fg-muted">{emptyText}</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  i === active && "bg-surface-2",
                  o.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-fg-subtle">{o.hint}</span>}
                </span>
                {o.value === value && <Check className="h-4 w-4 shrink-0 text-primary-text" aria-hidden />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
