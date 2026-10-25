import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ProtectedRoute, RequireModule } from "@/features/auth/guards";
import { LoginPage } from "@/features/auth/LoginPage";
import { ChangePasswordPage } from "@/features/auth/ChangePasswordPage";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { TenantsPage } from "@/features/tenants/TenantsPage";
import { RoomsPage } from "@/features/rooms/RoomsPage";
import { RentPage } from "@/features/rent/RentPage";
import { PaymentsPage } from "@/features/payments/PaymentsPage";
import { DepositsPage } from "@/features/deposits/DepositsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { ExpenditurePage } from "@/features/expenditure/ExpenditurePage";

/** One route per module. Legacy sub-routes (/tenants/list, /rent/collect, …) fold into their module. */
const MODULES = [
  { path: "/dashboard", element: <DashboardPage /> },
  { path: "/tenants", element: <TenantsPage /> },
  { path: "/rooms", element: <RoomsPage /> },
  { path: "/rent", element: <RentPage /> },
  { path: "/payments", element: <PaymentsPage /> },
  { path: "/deposits", element: <DepositsPage /> },
  { path: "/expenditure", element: <ExpenditurePage /> },
  { path: "/settings", element: <SettingsPage /> },
];

const LEGACY: [string, string][] = [
  ["/beds/*", "/rooms"],
  ["/masters/*", "/settings"],
  ["/admin/*", "/settings"],
  ["/charges/*", "/settings"],
  ["/tools/*", "/tenants"],
  ["/reports/*", "/dashboard"],
  ["/about/*", "/dashboard"],
];

export function AppRouter() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            {MODULES.map((m) => (
              <Route key={m.path} path={m.path} element={<RequireModule route={m.path}>{m.element}</RequireModule>} />
            ))}
            {MODULES.map((m) => (
              <Route key={`${m.path}-sub`} path={`${m.path}/*`} element={<Navigate to={m.path} replace />} />
            ))}
            {LEGACY.map(([from, to]) => (
              <Route key={from} path={from} element={<Navigate to={to} replace />} />
            ))}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
