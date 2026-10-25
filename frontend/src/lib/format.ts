const inrFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** ₹12,500 — rounds to whole rupees unless paise matter. */
export function inr(amount: number | null | undefined) {
  const n = Number(amount ?? 0);
  return Number.isInteger(n) ? inrFormatter.format(n) : inrExact.format(n);
}

export function compactInr(amount: number) {
  if (Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(amount % 100000 ? 1 : 0)}L`;
  if (Math.abs(amount) >= 1000) return `₹${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)}k`;
  return inr(amount);
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Dates from the API are DATE columns serialised as UTC midnight — format them in UTC. */
export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
}

export function monthLabel(month: number, year: number) {
  return `${MONTHS[month - 1]} ${year}`;
}

/** Today in Asia/Kolkata as YYYY-MM-DD (for date inputs). */
export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function currentMonthYear() {
  const [y, m] = todayIso().split("-").map(Number);
  return { month: m!, year: y! };
}

/** API date (UTC midnight ISO) → YYYY-MM-DD for <input type="date">. */
export function toInputDate(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "OTHER", label: "Other" },
] as const;

export function methodLabel(method: string) {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function whatsappLink(phone?: string | null, text?: string) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) digits = `91${digits.slice(1)}`;
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
