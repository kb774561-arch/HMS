/**
 * Postgres DATE columns round-trip through Prisma as UTC midnight, so all
 * calendar maths uses UTC to avoid off-by-one days when the server runs in IST.
 */
export function toDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(value);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Today's calendar date in Asia/Kolkata, as a UTC-midnight Date. */
export function todayIst(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return toDateOnly(parts);
}

export function monthStart(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Exclusive upper bound — first day of the following month. */
export function nextMonthStart(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1));
}

export function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0));
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(month: number, year: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
