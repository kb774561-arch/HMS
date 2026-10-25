import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "./button";
import { MONTHS } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4">{children}</div>;
}

/** Debounced search box; keeps its own text so typing never lags the table. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => text !== value && onChange(text), 250);
    return () => clearTimeout(t);
  }, [text, value, onChange]);

  return (
    <div className="relative w-full sm:max-w-xs sm:flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border-strong bg-surface pr-9 pl-9 text-base text-fg placeholder:text-fg-subtle focus:border-primary focus:ring-3 focus:ring-ring/25 focus:outline-none sm:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText("");
            onChange("");
          }}
          className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-fg focus:border-primary focus:ring-3 focus:ring-ring/25 focus:outline-none sm:w-auto sm:min-w-40 sm:text-sm",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Segmented control for 2–4 status filters. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full rounded-lg bg-surface-2 p-1 sm:w-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-semibold whitespace-nowrap transition-colors sm:flex-none",
            value === o.value ? "bg-surface text-fg shadow-soft" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular text-xs font-medium text-fg-subtle">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function MonthYearPicker({
  month,
  year,
  onChange,
}: {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
}) {
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    onChange(d.getUTCMonth() + 1, d.getUTCFullYear());
  };
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - 4 + i);

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <select
        aria-label="Month"
        value={month}
        onChange={(e) => onChange(Number(e.target.value), year)}
        className="h-10 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 text-base font-semibold text-fg focus:border-primary focus:outline-none sm:w-36 sm:flex-none sm:text-sm"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label="Year"
        value={year}
        onChange={(e) => onChange(month, Number(e.target.value))}
        className="h-10 w-24 rounded-lg border border-border-strong bg-surface px-3 text-base font-semibold text-fg focus:border-primary focus:outline-none sm:text-sm"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
