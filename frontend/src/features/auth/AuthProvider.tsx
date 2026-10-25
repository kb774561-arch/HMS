import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, SESSION_EXPIRED_EVENT, session } from "@/lib/api";
import { authApi } from "@/services/api";
import type { AuthUser, PermissionAction } from "@/types";

type AuthContextValue = {
  user: AuthUser | null;
  /** True only while we have no cached user and are asking the server who we are. */
  checking: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (route: string, action?: PermissionAction) => boolean;
  isSuperAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(() => (session.token() ? session.cachedUser<AuthUser>() : null));
  const [checking, setChecking] = useState(() => Boolean(session.token()) && !session.cachedUser());

  const applyUser = useCallback((u: AuthUser | null) => {
    setUser(u);
    if (u) session.cacheUser(u);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!session.token()) {
      setUser(null);
      setChecking(false);
      return;
    }
    try {
      applyUser(await authApi.me());
    } catch (err) {
      // Session-ended 401s are handled by the event below. A network blip or a 5xx
      // keeps the cached user signed in — an outage must never look like a logout.
      if (!(err instanceof ApiError && err.status === 401)) {
        toast.warning("Working offline", { description: "Couldn't verify your session with the server." });
      }
    } finally {
      setChecking(false);
    }
  }, [applyUser]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const onExpired = (e: Event) => {
      const message = (e as CustomEvent<{ message?: string }>).detail?.message;
      toast.error("Signed out", {
        id: "session-expired",
        description: message ?? "Your session has ended. Please sign in again.",
      });
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await authApi.login(username, password);
      session.save(data.token, data.expiresAt);
      applyUser(data.user);
      return data.user;
    },
    [applyUser],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* already signed out server-side */
    }
    session.clear();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const can = useCallback(
    (route: string, action: PermissionAction = "VIEW") =>
      user?.role === "SUPER_ADMIN" || Boolean(user?.permissions?.[route]?.includes(action)),
    [user],
  );

  const value = useMemo(
    () => ({ user, checking, login, logout, refreshUser, can, isSuperAdmin: user?.role === "SUPER_ADMIN" }),
    [user, checking, login, logout, refreshUser, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Permission helper for a module screen: `const can = useModulePermissions("/tenants")`. */
export function useModulePermissions(route: string) {
  const { can } = useAuth();
  return {
    view: can(route, "VIEW"),
    add: can(route, "ADD"),
    edit: can(route, "EDIT"),
    remove: can(route, "DELETE"),
    exportData: can(route, "EXPORT"),
    print: can(route, "PRINT"),
  };
}
