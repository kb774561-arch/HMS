import { cn } from "@/lib/utils";

export function BrandMark({ tone = "auto", size = "md", collapsed }: { tone?: "auto" | "dark"; size?: "md" | "lg"; collapsed?: boolean }) {
  return (
    <div className="relative flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-700 font-extrabold text-white shadow-[0_6px_18px_-4px_rgba(124,58,237,.6)]",
          size === "lg" ? "h-11 w-11 text-base" : "h-9 w-9 text-sm",
        )}
        aria-hidden
      >
        GG
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className={cn("block truncate font-extrabold tracking-tight", size === "lg" ? "text-lg" : "text-[15px]", tone === "dark" ? "text-white" : "text-fg")}>
            Genius Girls PG
          </span>
          <span className={cn("block truncate text-[11px] font-medium", tone === "dark" ? "text-sidebar-fg" : "text-fg-subtle")}>
            Powered by Karmatechlab
          </span>
        </span>
      )}
    </div>
  );
}
