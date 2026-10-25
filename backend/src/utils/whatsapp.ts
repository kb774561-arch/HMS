/** Build a wa.me link. Indian numbers default to +91 when 10 digits. */
export function buildWhatsAppLink(raw?: string | null, message?: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let phone = digits;
  if (digits.length === 10) {
    phone = `91${digits}`;
  } else if (digits.startsWith("0") && digits.length === 11) {
    phone = `91${digits.slice(1)}`;
  }

  const base = `https://wa.me/${phone}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
