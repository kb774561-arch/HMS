import { useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { tenantApi } from "@/services/api";
import { useRefreshFinance } from "@/hooks/useRefreshFinance";
import { handleApiError } from "@/lib/errors";
import { downloadWorkbook, readFirstSheet, TENANT_TEMPLATE_ROWS } from "@/lib/excel";

type Preview = Awaited<ReturnType<typeof tenantApi.importPreview>>;

export function ImportTenantsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setRows(null);
    setPreview(null);
    setFileName("");
    onClose();
  };

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = await readFirstSheet(file);
      if (!data.length) {
        toast.error("That sheet has no rows");
        return;
      }
      setRows(data);
      setFileName(file.name);
      setPreview(await tenantApi.importPreview(data));
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runImport = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const res = await tenantApi.import(rows);
      toast.success(`${res.created} tenant${res.created === 1 ? "" : "s"} imported`, {
        description: res.errorCount ? `${res.errorCount} row(s) skipped — see details` : undefined,
      });
      await refresh();
      if (res.errorCount) setPreview((p) => (p ? { ...p, errors: res.errors, validCount: 0 } : p));
      else close();
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      busy={busy}
      size="md"
      title="Import tenants from Excel"
      description="Each row needs TenantName, RoomNumber, BedCode, JoiningDate and MonthlyRent."
      footer={
        <>
          <Button variant="ghost" className="sm:mr-auto" onClick={() => downloadWorkbook([{ name: "Tenants", rows: TENANT_TEMPLATE_ROWS }], "tenant-import-template")}>
            <FileSpreadsheet className="h-4 w-4" /> Template
          </Button>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={runImport} disabled={!preview?.validCount} loading={busy && Boolean(rows)}>
            Import {preview?.validCount ? `${preview.validCount} rows` : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" id="tenant-import-file" onChange={(e) => void pick(e.target.files?.[0])} />
        <label
          htmlFor="tenant-import-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong px-4 py-8 text-center hover:border-primary hover:bg-primary-soft/40"
        >
          <Upload className="h-6 w-6 text-primary-text" aria-hidden />
          <span className="text-sm font-semibold text-fg">{fileName || "Choose an Excel file"}</span>
          <span className="text-xs text-fg-subtle">.xlsx, .xls or .csv — first sheet is read</span>
        </label>

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Rows", preview.totalRows],
                ["Ready", preview.validCount],
                ["Problems", preview.errors.length],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface-2 py-2">
                  <p className="tabular text-lg font-bold text-fg">{v}</p>
                  <p className="text-xs text-fg-subtle">{k}</p>
                </div>
              ))}
            </div>
            {preview.errors.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-danger/30 bg-danger-soft p-3 text-[13px] text-danger">
                {preview.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
