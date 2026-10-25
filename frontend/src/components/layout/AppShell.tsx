import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { KeyRound, LogOut, Menu, Monitor, Moon, Sun, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BrandMark } from "./BrandMark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { authApi } from "@/services/api";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super Admin", PG_OPERATOR: "Operator" };

function ThemeButton() {
  const { mode, resolved, setMode } = useTheme();
  const next: Record<ThemeMode, ThemeMode> = { light: "dark", dark: "system", system: "light" };
  const Icon = mode === "system" ? Monitor : resolved === "dark" ? Moon : Sun;
  const label = mode === "system" ? "System theme" : resolved === "dark" ? "Dark theme" : "Light theme";
  return (
    <Button variant="ghost" size="icon" onClick={() => setMode(next[mode])} aria-label={`${label} — switch theme`} title={label}>
      <Icon className="h-[18px] w-[18px]" />
    </Button>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg p-1 pr-2 hover:bg-surface-2"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-fg">
          {initials(user.fullName)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-36 truncate text-[13px] font-semibold text-fg">{user.fullName}</span>
          <span className="block text-[11px] text-fg-subtle">{ROLE_LABEL[user.role] ?? user.role}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 animate-fade-in rounded-xl border border-border bg-surface p-1.5 shadow-pop">
          <div className="border-b border-border px-2.5 pt-1.5 pb-2.5 sm:hidden">
            <p className="truncate text-sm font-semibold text-fg">{user.fullName}</p>
            <p className="text-xs text-fg-subtle">{ROLE_LABEL[user.role] ?? user.role}</p>
          </div>
          <Link
            role="menuitem"
            to="/change-password"
            onClick={() => setOpen(false)}
            className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-fg hover:bg-surface-2"
          >
            <KeyRound className="h-4 w-4 opacity-80" /> Change password
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => void logout()}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-danger hover:bg-danger-soft"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MobileNav({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", key);
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Navigation" className="relative h-full w-72 max-w-[85vw] animate-drawer-left shadow-pop">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="absolute top-3.5 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-fg hover:bg-sidebar-2"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function AppShell() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("ggp_sidebar") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: menus = [], isLoading } = useQuery({ queryKey: ["menus"], queryFn: authApi.menus, staleTime: 5 * 60_000 });

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem("ggp_sidebar", collapsed ? "collapsed" : "expanded");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return (
    <div className="flex min-h-dvh bg-bg">
      <div className={cn("sticky top-0 hidden h-dvh shrink-0 lg:block")}>
        <Sidebar menus={menus} loading={isLoading} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      </div>

      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <Sidebar menus={menus} loading={isLoading} mobile onNavigate={() => setMobileOpen(false)} />
      </MobileNav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-md sm:h-16 sm:px-6">
          <Button variant="ghost" size="icon" className="-ml-1 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 lg:hidden">
            <BrandMark />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeButton />
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-7">
          <Outlet />
        </main>

        <footer className="border-t border-border px-4 py-4 text-center text-xs text-fg-subtle sm:px-6">
          Genius Girls PG — Powered by{" "}
          <a href="https://karmatechlab.com/" target="_blank" rel="noreferrer" className="font-semibold text-primary-text hover:underline">
            Karmatechlab
          </a>
        </footer>
      </div>
    </div>
  );
}
