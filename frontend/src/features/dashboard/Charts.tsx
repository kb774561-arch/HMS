import { useState } from "react";
import { compactInr, inr } from "@/lib/format";

const SERIES = [
  { key: "rentCollected", label: "Rent collected", color: "var(--series-1)" },
  { key: "expenditure", label: "Expenditure", color: "var(--series-2)" },
  { key: "net", label: "Net operating cash", color: "var(--series-3)" },
] as const;

type TrendPoint = { label: string; rentCollected: number; expenditure: number; net: number };

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted" aria-label="Legend">
      {SERIES.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Expected vs collected vs pending for the billing month — one 100% bar with labelled parts. */
export function RentCollectionBar({ expected, collected, pending }: { expected: number; collected: number; pending: number }) {
  const pct = expected > 0 ? Math.min(100, (collected / expected) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="tabular text-3xl font-extrabold text-fg">{Math.round(pct)}%</span>
        <span className="text-sm text-fg-muted">of expected rent collected</span>
      </div>
      <div
        className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full bg-meter-track"
        role="img"
        aria-label={`Collected ${inr(collected)} of ${inr(expected)}; pending ${inr(pending)}`}
      >
        {collected > 0 && <div className="h-full rounded-l-full bg-series-1" style={{ width: `${pct}%` }} title={`Collected ${inr(collected)}`} />}
        {pending > 0 && <div className="h-full flex-1 rounded-r-full bg-danger/70" title={`Pending ${inr(pending)}`} />}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {[
          ["Expected", expected, "bg-fg-subtle"],
          ["Collected", collected, "bg-series-1"],
          ["Pending", pending, "bg-danger/70"],
        ].map(([k, v, dot]) => (
          <div key={k as string}>
            <dt className="flex items-center gap-1.5 text-xs text-fg-subtle">
              <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
              {k}
            </dt>
            <dd className="tabular font-bold text-fg">{inr(v as number)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Month-wise grouped bars: rent collected (by payment date), expenditure, net operating cash. */
export function TrendChart({ data, selectedIndex }: { data: TrendPoint[]; selectedIndex: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 46 };
  const values = data.flatMap((d) => [d.rentCollected, d.expenditure, d.net]);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const plotH = H - pad.top - pad.bottom;
  const y = (v: number) => pad.top + ((max - v) / (max - min)) * plotH;
  const groupW = (W - pad.left - pad.right) / Math.max(data.length, 1);
  const barW = Math.min(18, (groupW - 16) / 3);
  const ticks = Array.from({ length: 4 }, (_, i) => min + ((max - min) * i) / 3);
  const active = hover ?? null;

  return (
    <div className="space-y-3">
      <Legend />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Six-month trend of rent collected, expenditure and net operating cash">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" className="fill-fg-subtle text-[10px]">
                {compactInr(Math.round(t))}
              </text>
            </g>
          ))}
          <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth={1} />
          {data.map((d, i) => {
            const gx = pad.left + i * groupW;
            const start = gx + (groupW - (barW * 3 + 4)) / 2;
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={gx} y={pad.top} width={groupW} height={plotH} fill={active === i ? "var(--surface-2)" : "transparent"} />
                {SERIES.map((s, j) => {
                  const v = d[s.key];
                  const top = y(Math.max(v, 0));
                  const h = Math.max(Math.abs(y(v) - y(0)), v === 0 ? 0 : 1.5);
                  return <rect key={s.key} x={start + j * (barW + 2)} y={top} width={barW} height={h} rx={3} fill={s.color} />;
                })}
                <text
                  x={gx + groupW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className={i === selectedIndex ? "fill-fg text-[11px] font-bold" : "fill-fg-subtle text-[11px]"}
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
        {active !== null && data[active] && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-48 rounded-xl border border-border bg-surface p-3 text-xs shadow-pop"
            style={{ left: `clamp(0px, calc(${((pad.left + (active + 0.5) * groupW) / W) * 100}% - 96px), calc(100% - 192px))` }}
          >
            <p className="mb-1.5 font-bold text-fg">{data[active].label}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-2 text-fg-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tabular font-semibold text-fg">{inr(data[active][s.key])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      {/* Table view — exact values for every month (also the accessible fallback for the chart). */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <caption className="sr-only">Monthly trend values</caption>
          <thead>
            <tr className="text-fg-subtle">
              <th scope="col" className="py-1 pr-2 text-left font-semibold">
                Month
              </th>
              {SERIES.map((s) => (
                <th key={s.key} scope="col" className="py-1 pl-2 text-right font-semibold">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.label} className={i === selectedIndex ? "font-bold text-fg" : "text-fg-muted"}>
                <th scope="row" className="py-1 pr-2 text-left font-medium">
                  {d.label}
                </th>
                <td className="tabular py-1 pl-2 text-right">{inr(d.rentCollected)}</td>
                <td className="tabular py-1 pl-2 text-right">{inr(d.expenditure)}</td>
                <td className={`tabular py-1 pl-2 text-right ${d.net < 0 ? "text-danger" : ""}`}>{inr(d.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Expense category breakdown as compact bars (single hue — categories are labelled directly). */
export function CategoryBars({ data }: { data: { category: string; amount: number }[] }) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  const max = Math.max(1, ...data.map((d) => d.amount));
  if (!data.length) return <p className="text-sm text-fg-muted">No expenditure recorded this month.</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.category} title={`${d.category}: ${inr(d.amount)} (${Math.round((d.amount / total) * 100)}%)`}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="font-medium text-fg">{d.category}</span>
            <span className="tabular text-fg-muted">
              <strong className="text-fg">{inr(d.amount)}</strong> · {Math.round((d.amount / total) * 100)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-meter-track">
            <div className="h-full rounded-full bg-series-2" style={{ width: `${(d.amount / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
