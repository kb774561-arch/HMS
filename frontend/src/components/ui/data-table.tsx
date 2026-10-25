import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox, RefreshCw } from "lucide-react";
import { Button } from "./button";
import { ActionMenu, type MenuAction } from "./menu";
import { cn } from "@/lib/utils";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number | null;
  align?: "left" | "right" | "center";
  className?: string;
  /** Hide on narrower desktop widths to avoid horizontal scroll. */
  hideBelow?: "lg" | "xl";
};

type SortState = { id: string; dir: "asc" | "desc" } | null;

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  error,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  rowActions,
  mobileCard,
  onRowClick,
  initialSort = null,
  pageSize: initialPageSize = 10,
  resetKey,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  rowActions?: (row: T) => MenuAction[];
  /** Card layout for phones; tables become cards below the md breakpoint. */
  mobileCard: (row: T, actions: ReactNode) => ReactNode;
  onRowClick?: (row: T) => void;
  initialSort?: SortState;
  pageSize?: number;
  /** When this changes (e.g. filters), jump back to page 1. */
  resetKey?: string;
  caption: string;
}) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => setPage(1), [resetKey]);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const factor = sort!.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = col.sortValue!(a);
      const y = col.sortValue!(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y))) * factor;
    });
  }, [rows, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, totalPages);
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize);
  const from = sorted.length ? (current - 1) * pageSize + 1 : 0;
  const to = Math.min(current * pageSize, sorted.length);

  const toggleSort = (id: string) =>
    setSort((s) => (s?.id !== id ? { id, dir: "asc" } : s.dir === "asc" ? { id, dir: "desc" } : null));

  const hide = (c: Column<T>) => (c.hideBelow === "lg" ? "hidden lg:table-cell" : c.hideBelow === "xl" ? "hidden xl:table-cell" : "");
  const align = (c: Column<T>) => (c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left");

  if (error && !loading) {
    return (
      <StateBox icon={<AlertCircle className="h-6 w-6 text-danger" />} title="Couldn't load data" description={error instanceof Error ? error.message : "Please try again."}>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        )}
      </StateBox>
    );
  }

  if (!loading && rows.length === 0) {
    return <StateBox icon={<Inbox className="h-6 w-6 text-fg-subtle" />} title={emptyTitle} description={emptyDescription}>{emptyAction}</StateBox>;
  }

  const actionsFor = (row: T) => (rowActions ? <ActionMenu actions={rowActions(row)} /> : null);

  return (
    <div>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2/60">
              {columns.map((c) => {
                const active = sort?.id === c.id;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("px-4 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-fg-muted uppercase", align(c), hide(c))}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn("inline-flex items-center gap-1 rounded uppercase hover:text-fg", c.align === "right" && "flex-row-reverse")}
                      >
                        {c.header}
                        {active ? (
                          sort!.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions && (
                <th scope="col" className="w-14 px-2 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {columns.map((c) => (
                      <td key={c.id} className={cn("px-4 py-3.5", hide(c))}>
                        <div className="h-4 w-3/4 animate-pulse rounded bg-surface-3" />
                      </td>
                    ))}
                    {rowActions && <td />}
                  </tr>
                ))
              : visible.map((row) => (
                  <tr
                    key={getRowId(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn("border-b border-border transition-colors last:border-0 hover:bg-surface-2/70", onRowClick && "cursor-pointer")}
                  >
                    {columns.map((c) => (
                      <td key={c.id} className={cn("px-4 py-3 align-middle text-fg", align(c), hide(c), c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {actionsFor(row)}
                      </td>
                    )}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Phone cards */}
      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="space-y-2 p-4">
                <div className="h-4 w-1/2 animate-pulse rounded bg-surface-3" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-surface-3" />
              </li>
            ))
          : visible.map((row) => (
              <li
                key={getRowId(row)}
                className={cn("p-4", onRowClick && "cursor-pointer active:bg-surface-2")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {mobileCard(row, <div onClick={(e) => e.stopPropagation()}>{actionsFor(row)}</div>)}
              </li>
            ))}
      </ul>

      {!loading && sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-fg-muted">
          <p className="tabular">
            Showing <span className="font-semibold text-fg">{from}</span>–<span className="font-semibold text-fg">{to}</span> of{" "}
            <span className="font-semibold text-fg">{sorted.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 sm:flex">
              Rows
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 rounded-lg border border-border-strong bg-surface px-2 text-[13px] text-fg"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(current - 1)} disabled={current <= 1} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular min-w-16 text-center">
              {current} / {totalPages}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(current + 1)} disabled={current >= totalPages} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StateBox({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2">{icon}</div>
      <p className="font-semibold text-fg">{title}</p>
      {description && <p className="max-w-sm text-sm text-fg-muted">{description}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Label/value pair used inside mobile cards. */
export function CardField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{label}</p>
      <div className="tabular truncate text-sm font-medium text-fg">{children}</div>
    </div>
  );
}
