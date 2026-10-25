import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let openCount = 0;

/**
 * Focus trap + Escape + scroll lock. `onClose` is read through a ref so the effect
 * runs once per open — re-renders while typing never steal focus back to the top.
 */
function useOverlay(open: boolean, onClose: () => void, panel: React.RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    openCount++;
    document.body.style.overflow = "hidden";

    const node = panel.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    requestAnimationFrame(() => first?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (!node || !node.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const a = items[0]!;
      const z = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openCount--;
      if (openCount === 0) document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, panel]);
}

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Render body+footer inside a <form>; submit is prevented from reloading the page. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /** While true the overlay cannot be dismissed (e.g. a save is in flight). */
  busy?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
};

function Shell({ onSubmit, children, className }: { onSubmit?: OverlayProps["onSubmit"]; children: ReactNode; className: string }) {
  if (!onSubmit) return <div className={className}>{children}</div>;
  return (
    <form
      noValidate
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSubmit(e);
      }}
    >
      {children}
    </form>
  );
}

function Header({ id, title, description, onClose, busy }: { id: string; title: ReactNode; description?: ReactNode; onClose: () => void; busy?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-bold text-fg sm:text-lg">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
      </div>
      <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={busy} aria-label="Close" className="-mr-1.5">
        <X className="h-4.5 w-4.5" />
      </Button>
    </div>
  );
}

const drawerWidths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-3xl" };
const modalWidths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

/** Right-side drawer for add/edit/view. Full width on phones. */
export function Drawer({ open, onClose, title, description, children, footer, onSubmit, busy, size = "md" }: OverlayProps) {
  const panel = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const close = () => !busy && onClose();
  useOverlay(open, close, panel);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-overlay backdrop-blur-[2px]" onClick={close} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={cn("relative flex h-full w-full animate-drawer-in flex-col bg-surface shadow-pop sm:border-l sm:border-border", drawerWidths[size])}
      >
        <Shell onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <Header id={labelId} title={title} description={description} onClose={close} busy={busy} />
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <div className="safe-bottom flex items-center justify-end gap-2 border-t border-border bg-surface px-5 pt-3">{footer}</div>
          )}
        </Shell>
      </div>
    </div>,
    document.body,
  );
}

/** Centered dialog on desktop, bottom sheet on phones. */
export function Modal({ open, onClose, title, description, children, footer, onSubmit, busy, size = "md" }: OverlayProps) {
  const panel = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const close = () => !busy && onClose();
  useOverlay(open, close, panel);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-overlay backdrop-blur-[2px]" onClick={close} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-sheet-in flex-col rounded-t-2xl border border-border bg-surface shadow-pop sm:animate-modal-in sm:rounded-2xl",
          modalWidths[size],
        )}
      >
        <Shell onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <Header id={labelId} title={title} description={description} onClose={close} busy={busy} />
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <div className="safe-bottom flex flex-col-reverse gap-2 border-t border-border px-5 pt-3 sm:flex-row sm:items-center sm:justify-end sm:pb-4 [&>button]:w-full sm:[&>button]:w-auto">
              {footer}
            </div>
          )}
        </Shell>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "danger",
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={loading}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          {tone === "danger" && <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />}
          {title}
        </span>
      }
      onSubmit={onConfirm}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} loading={loading} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-fg-muted">
        <div>{message}</div>
        {children}
      </div>
    </Modal>
  );
}

/** Save / Cancel pair for form overlays. */
export function FormActions({ onCancel, saving, saveLabel = "Save" }: { onCancel: () => void; saving?: boolean; saveLabel?: string }) {
  return (
    <>
      <Button variant="outline" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button type="submit" loading={saving}>
        {saving ? "Saving…" : saveLabel}
      </Button>
    </>
  );
}
