import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2, ShieldOff } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";

export function ProtectedRoute() {
  const { user, checking } = useAuth();
  const location = useLocation();

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg" role="status" aria-label="Loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary-text" />
      </div>
    );
  }

  if (!user) {
    // Remember where the user was so sign-in can return them there.
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

/** Module-level guard: shows a friendly "no access" page instead of redirecting. */
export function RequireModule({ route, children }: { route: string; children: ReactNode }) {
  const { can } = useAuth();
  if (can(route, "VIEW")) return <>{children}</>;
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2">
        <ShieldOff className="h-7 w-7 text-fg-subtle" aria-hidden />
      </div>
      <h1 className="text-lg font-bold text-fg">You don't have access to this module</h1>
      <p className="max-w-sm text-sm text-fg-muted">Ask a Super Admin to grant the View permission in Settings → Permissions.</p>
      <Link to="/dashboard">
        <Button variant="outline">Back to dashboard</Button>
      </Link>
    </div>
  );
}
