import { http, qs } from "@/lib/api";
import type {
  AdminMenu,
  AdminUser,
  AuditLog,
  AuthUser,
  AvailableBed,
  BedHistoryEntry,
  BedOperationResult,
  BedOption,
  ChargeType,
  CollectionAccount,
  DashboardOverview,
  DepositSummary,
  DepositTxn,
  Expense,
  ExpenseCategory,
  ExpenseList,
  ManualRentPreview,
  MenuNode,
  OutstandingInvoice,
  PaymentList,
  PermissionAction,
  PgProperty,
  Receipt,
  RentOverview,
  Role,
  RolePermissionRow,
  RoomSummary,
  SystemSetting,
  TenantDetail,
  TenantList,
  UserOverride,
} from "@/types";

export const authApi = {
  login: (username: string, password: string) =>
    http.post<{ token: string; expiresAt: string; user: AuthUser }>("/auth/login", { username, password }),
  me: () => http.get<AuthUser>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    http.post<{ success: boolean }>("/auth/change-password", { currentPassword, newPassword }),
  logout: () => http.post<{ success: boolean }>("/auth/logout"),
  menus: () => http.get<MenuNode[]>("/navigation/my-menus"),
};

export const dashboardApi = {
  overview: (month: number, year: number) => http.get<DashboardOverview>(`/dashboard/overview${qs({ month, year })}`),
};

export const tenantApi = {
  list: (params: { search?: string; status?: string; accommodation?: string; roomId?: string } = {}) =>
    http.get<TenantList>(`/tenants${qs({ ...params, pageSize: 500, sort: "name" })}`),
  get: (id: string) => http.get<TenantDetail>(`/tenants/${id}`),
  create: (body: unknown) => http.post<TenantDetail>("/tenants", body),
  update: (id: string, body: unknown) => http.patch<TenantDetail>(`/tenants/${id}`, body),
  deactivate: (id: string, body: { leavingDate: string; notes?: string }) =>
    http.post<TenantDetail>(`/tenants/${id}/deactivate`, body),
  activate: (id: string, body: { roomId?: string | null; bedId?: string | null; startDate: string; monthlyRent?: number }) =>
    http.post<TenantDetail>(`/tenants/${id}/activate`, body),
  allocate: (id: string, body: { roomId: string; bedId: string; startDate: string; monthlyRent?: number; notes?: string | null }) =>
    http.post<TenantDetail>(`/tenants/${id}/allocate`, body),
  archive: (id: string) => http.delete<{ id: string }>(`/tenants/${id}`),
  addCharge: (body: unknown) => http.post("/charges", body),
  importPreview: (rows: Record<string, unknown>[]) =>
    http.post<{ validCount: number; errorCount: number; totalRows: number; errors: { row: number; message: string }[] }>(
      "/imports/tenants/preview",
      { rows },
    ),
  import: (rows: Record<string, unknown>[]) =>
    http.post<{ created: number; skipped: number; errorCount: number; errors: { row: number; message: string }[] }>(
      "/imports/tenants",
      { rows, confirm: true },
    ),
};

export const roomApi = {
  summary: () => http.get<RoomSummary>("/rooms"),
  create: (body: unknown) => http.post("/rooms", body),
  update: (id: string, body: unknown) => http.patch(`/rooms/${id}`, body),
  beds: (params: { roomId?: string; status?: string } = {}) => http.get<BedOption[]>(`/beds${qs(params)}`),
  updateBed: (id: string, body: unknown) => http.patch(`/beds/${id}`, body),
  allocate: (body: unknown) => http.post("/allocations", body),
};

export const bedOpsApi = {
  available: (date: string, excludeTenantId?: string) => http.get<AvailableBed[]>(`/beds/available${qs({ date, excludeTenantId })}`),
  transfer: (body: {
    tenantId: string;
    toBedId: string;
    effectiveDate: string;
    newMonthlyRent?: number;
    reason?: string | null;
    notes?: string | null;
  }) => http.post<BedOperationResult>("/bed-operations/transfer", body),
  swap: (body: {
    tenantAId: string;
    tenantBId: string;
    effectiveDate: string;
    newMonthlyRentA?: number;
    newMonthlyRentB?: number;
    reason?: string | null;
    notes?: string | null;
  }) => http.post<BedOperationResult>("/bed-operations/swap", body),
  history: (tenantId: string) => http.get<BedHistoryEntry[]>(`/tenants/${tenantId}/bed-history`),
};

export const rentApi = {
  overview: (month: number, year: number) => http.get<RentOverview>(`/rent/overview${qs({ month, year })}`),
  generate: (month: number, year: number) =>
    http.post<{ created: number; skipped: number }>("/rent/generate", { month, year }),
  outstanding: (tenantId: string) => http.get<OutstandingInvoice[]>(`/rent/outstanding/${tenantId}`),
  manualPreview: (p: { tenantId: string; month: number; year: number; from?: string; to?: string }) =>
    http.get<ManualRentPreview>(`/rent/manual-preview${qs(p)}`),
  manualCreate: (body: unknown) => http.post<{ id: string; tenantId: string; totalPayable: number }>("/rent/manual", body),
  adjustInvoice: (id: string, body: { amount: number; reason: string }) =>
    http.patch<{ id: string; totalPayable: number; pendingAmount: number }>(`/rent/invoices/${id}`, body),
};

export const paymentApi = {
  list: (params: { from?: string; to?: string; accountId?: string; method?: string; search?: string }) =>
    http.get<PaymentList>(`/payments${qs(params)}`),
  create: (body: unknown) => http.post<Receipt>("/payments", body),
  receipt: (paymentId: string) => http.get<Receipt>(`/payments/${paymentId}/receipt`),
};

export const depositApi = {
  summary: () => http.get<DepositSummary>("/deposits"),
  ledger: (tenantId?: string) => http.get<DepositTxn[]>(`/deposits/ledger${qs({ tenantId })}`),
  collect: (body: unknown) => http.post<{ depositBalance: number; whatsappLink: string | null }>("/deposits", body),
  refund: (body: unknown) => http.post<{ depositBalance: number }>("/deposits/refund", body),
};

export const expenseApi = {
  list: (params: { from?: string; to?: string; categoryId?: string; search?: string; includeVoided?: boolean }) =>
    http.get<ExpenseList>(`/expenses${qs({ ...params, includeVoided: params.includeVoided ? "true" : undefined })}`),
  create: (body: unknown) => http.post<Expense>("/expenses", body),
  update: (id: string, body: unknown) => http.patch<Expense>(`/expenses/${id}`, body),
  void: (id: string, reason: string) => http.post<{ id: string }>(`/expenses/${id}/void`, { reason }),
  categories: () => http.get<ExpenseCategory[]>("/expense-categories"),
  createCategory: (body: unknown) => http.post<ExpenseCategory>("/expense-categories", body),
  updateCategory: (id: string, body: unknown) => http.patch<ExpenseCategory>(`/expense-categories/${id}`, body),
};

export const settingsApi = {
  accounts: () => http.get<CollectionAccount[]>("/accounts"),
  createAccount: (body: unknown) => http.post("/accounts", body),
  updateAccount: (id: string, body: unknown) => http.patch(`/accounts/${id}`, body),
  chargeTypes: () => http.get<ChargeType[]>("/charge-types"),
  createChargeType: (body: unknown) => http.post("/charge-types", body),
  updateChargeType: (id: string, body: unknown) => http.patch(`/charge-types/${id}`, body),
  pg: () => http.get<PgProperty>("/pg"),
  updatePg: (id: string, body: unknown) => http.patch(`/pg/${id}`, body),
};

export const adminApi = {
  users: () => http.get<AdminUser[]>("/admin/users"),
  createUser: (body: unknown) => http.post("/admin/users", body),
  updateUser: (id: string, body: unknown) => http.patch(`/admin/users/${id}`, body),
  roles: () => http.get<Role[]>("/admin/roles"),
  createRole: (body: unknown) => http.post("/admin/roles", body),
  updateRole: (id: string, body: unknown) => http.patch(`/admin/roles/${id}`, body),
  menus: () => http.get<AdminMenu[]>("/admin/menus"),
  updateMenu: (id: string, body: unknown) => http.patch(`/admin/menus/${id}`, body),
  rolePermissions: (roleId: string) => http.get<RolePermissionRow[]>(`/admin/role-permissions/${roleId}`),
  setRolePermission: (body: { roleId: string; menuId: string; action: PermissionAction; allowed: boolean }) =>
    http.put("/admin/role-permissions", body),
  userOverrides: (userId: string) => http.get<UserOverride[]>(`/admin/user-permissions/${userId}`),
  setUserOverride: (body: { userId: string; menuId: string; action: PermissionAction; allowed: boolean | null }) =>
    http.put("/admin/user-permissions", body),
  settings: () => http.get<SystemSetting[]>("/admin/settings"),
  saveSetting: (key: string, value: string) => http.put("/admin/settings", { key, value }),
  auditLogs: () => http.get<AuditLog[]>("/admin/audit-logs?limit=100"),
};
