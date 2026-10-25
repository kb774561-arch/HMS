import type { Receipt } from "@/types";
import { formatDate, methodLabel } from "./format";

const rupees = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Builds an A5 PDF receipt in the browser. jsPDF is loaded only when needed. */
export async function downloadReceiptPdf(r: Receipt) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;

  doc.setFillColor(17, 14, 28);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(r.pg.name, M, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text([r.pg.address, r.pg.phone].filter(Boolean).join("  ·  ") || "Payment receipt", M, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PAYMENT RECEIPT", W - M, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(r.receiptNumber, W - M, 20, { align: "right" });

  doc.setTextColor(30, 27, 40);
  let y = 42;
  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 105, 130);
    doc.text(label, M, y);
    doc.setTextColor(30, 27, 40);
    doc.setFont("helvetica", "bold");
    doc.text(value, W - M, y, { align: "right" });
    y += 7;
  };
  doc.setFontSize(9.5);
  row("Receipt date", formatDate(r.receiptDate));
  row("Tenant", r.tenantName);
  row("Room / Bed", [r.roomNumber, r.bedCode].filter(Boolean).join(" / ") || "—");
  row("Payment method", methodLabel(r.paymentMethod));
  row("Received in", r.account);
  if (r.transactionReference) row("Reference", r.transactionReference);

  y += 2;
  doc.setDrawColor(225, 220, 238);
  doc.line(M, y, W - M, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(110, 105, 130);
  doc.setFontSize(8);
  doc.text("APPLIED TO", M, y);
  doc.text("AMOUNT", W - M, y, { align: "right" });
  y += 6;
  doc.setFontSize(9.5);
  const lines = r.months.length ? r.months : [];
  for (const m of lines) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 27, 40);
    doc.text(`Rent — ${m.label}`, M, y);
    doc.text(rupees(m.amount), W - M, y, { align: "right" });
    y += 6.5;
  }
  if (r.unallocatedAmount > 0) {
    doc.text("Advance (unallocated)", M, y);
    doc.text(rupees(r.unallocatedAmount), W - M, y, { align: "right" });
    y += 6.5;
  }

  y += 2;
  doc.setFillColor(243, 240, 252);
  doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(91, 33, 182);
  doc.text("Total received", M + 4, y + 9);
  doc.text(rupees(r.amountReceived), W - M - 4, y + 9, { align: "right" });
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30, 27, 40);
  doc.text(r.outstandingAfter > 0 ? `Balance still due: ${rupees(r.outstandingAfter)}` : "No rent is pending. Thank you!", M, y);
  if (r.notes) {
    y += 6;
    doc.setTextColor(110, 105, 130);
    doc.text(doc.splitTextToSize(`Note: ${r.notes}`, W - 2 * M), M, y);
  }

  const H = doc.internal.pageSize.getHeight();
  doc.setFontSize(7.5);
  doc.setTextColor(140, 135, 160);
  doc.text("This is a computer-generated receipt.  Genius Girls PG — Powered by Karmatechlab", W / 2, H - 8, { align: "center" });

  doc.save(`${r.receiptNumber}.pdf`);
}
