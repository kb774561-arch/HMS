import { NavLink } from "react-router-dom";
import {
  BedDouble,
  ChevronsLeft,
  ChevronsRight,
  HandCoins,
  LayoutDashboard,
  Receipt,
  Settings,
  Shield,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { cn, KARMATECHLAB_URL } from "@/lib/utils";
import type { MenuNode } from "@/types";

const ICONS: Record<string, LucideIcon> = { LayoutDashboard, Users, BedDouble, Receipt, Wallet, Shield, HandCoins, Settings };

/** Flat list of module links; the backend menu table decides which appear and in what order. */
export function flattenMenus(menus: MenuNode[]): MenuNode[] {
  return menus.flatMap((m) => (m.routePath ? [m] : flattenMenus(m.children)));
}

export function Sidebar({
  menus,
  loading,
  collapsed,
  onToggle,
  onNavigate,
  mobile,
}: {
  menus: MenuNode[];
  loading?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const items = flattenMenus(menus);

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-fg transition-[width] duration-200",
        mobile ? "w-full" : collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-5")}>
        <BrandMark tone="dark" collapsed={collapsed} />
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
        <ul className="space-y-1">
          {loading &&
            Array.from({ length: 7 }, (_, i) => (
              <li key={i} className="h-10 animate-pulse rounded-lg bg-sidebar-2" />
            ))}
          {items.map((m) => {
            const Icon = (m.icon && ICONS[m.icon]) || LayoutDashboard;
            return (
              <li key={m.id}>
                <NavLink
                  to={m.routePath!}
                  onClick={onNavigate}
                  title={collapsed ? m.menuName : undefined}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors",
                      collapsed && "justify-center px-0",
                      isActive ? "bg-sidebar-active text-sidebar-fg-strong" : "hover:bg-sidebar-2 hover:text-sidebar-fg-strong",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-violet-400" aria-hidden />}
                      <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-violet-300" : "opacity-80")} aria-hidden />
                      {!collapsed && <span className="truncate">{m.menuName}</span>}
                      {collapsed && <span className="sr-only">{m.menuName}</span>}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {onToggle && !mobile && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-lg px-3 text-[13px] font-medium hover:bg-sidebar-2 hover:text-sidebar-fg-strong",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && "Collapse"}
          </button>
        )}
        {!collapsed && (
          <p className="mt-2 px-3 text-[11px] text-sidebar-fg/80">
            © {new Date().getFullYear()}{" "}
            <a href={KARMATECHLAB_URL} target="_blank" rel="noreferrer" className="font-semibold text-sidebar-fg-strong hover:underline">
              Karmatechlab
            </a>
          </p>
        )}
      </div>
    </aside>
  );
}
