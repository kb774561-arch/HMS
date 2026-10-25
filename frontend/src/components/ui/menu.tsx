import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MenuAction = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  tone?: "default" | "danger";
  hidden?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

/** Kebab menu for table rows. Rendered in a portal so table overflow never clips it. */
export function ActionMenu({ actions, label = "Row actions" }: { actions: MenuAction[]; label?: string }) {
  const visible = actions.filter((a) => !a.hidden);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    const width = 200;
    const height = visible.length * 40 + 12;
    const below = r.bottom + 4 + height < window.innerHeight;
    setPos({
      top: below ? r.bottom + 4 : Math.max(8, r.top - height - 4),
      left: Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8),
    });
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "mousedown" && (menu.current?.contains(e.target as Node) || trigger.current?.contains(e.target as Node))) return;
      setOpen(false);
      if (e.type === "keydown") trigger.current?.focus();
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  if (!visible.length) return null;

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <MoreHorizontal className="h-4.5 w-4.5" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            onKeyDown={onMenuKey}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[60] w-[200px] animate-fade-in rounded-xl border border-border bg-surface p-1.5 shadow-pop"
          >
            {visible.map((a) => (
              <div key={a.label}>
                {a.separatorBefore && <div className="my-1 h-px bg-border" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={a.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    a.onSelect();
                  }}
                  className={cn(
                    "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium transition-colors focus:outline-none disabled:opacity-50",
                    a.tone === "danger" ? "text-danger hover:bg-danger-soft focus:bg-danger-soft" : "text-fg hover:bg-surface-2 focus:bg-surface-2",
                  )}
                >
                  {a.icon && <a.icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />}
                  {a.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
