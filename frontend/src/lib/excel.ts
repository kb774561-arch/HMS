/** xlsx is ~400 kB, so it is loaded only when the user imports or exports. */
const loadXlsx = () => import("xlsx");

export async function downloadWorkbook(sheets: { name: string; rows: Record<string, unknown>[] }[], fileName: string) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows.length ? sheet.rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

/** Excel dates arrive as local-midnight Date objects; send plain YYYY-MM-DD so no day shifts. */
function normaliseCell(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return value;
}

export async function readFirstSheet(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await loadXlsx();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]!]!;
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        resolve(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), normaliseCell(v)]))));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Column headers for the import template — an empty example row, no real data. */
export const TENANT_TEMPLATE_ROWS = [
  {
    TenantName: "",
    WhatsAppNumber: "",
    ParentNumber: "",
    RoomNumber: "Room 1",
    BedCode: "B1",
    JoiningDate: "2026-01-01",
    MonthlyRent: 0,
    SecurityDeposit: 0,
    Notes: "",
  },
];
