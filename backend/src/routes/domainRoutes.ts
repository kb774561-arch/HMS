import { Router, type NextFunction, type Request, type Response } from "express";
import type { PermissionAction } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { requirePermission, requireRoles } from "../middleware/requirePermission.js";
import { roomService } from "../services/roomService.js";
import { bedService } from "../services/bedService.js";
import { tenantService } from "../services/tenantService.js";
import { allocationService } from "../services/allocationService.js";
import { rentService } from "../services/rentService.js";
import { paymentService } from "../services/paymentService.js";
import { depositService } from "../services/depositService.js";
import { chargeService } from "../services/chargeService.js";
import { accountService } from "../services/accountService.js";
import { adminService } from "../services/adminService.js";
import { reportService } from "../services/reportService.js";
import { importService } from "../services/importService.js";
import { dashboardService } from "../services/dashboardService.js";
import { expenseService } from "../services/expenseService.js";
import { permissionService } from "../services/permissionService.js";
import { bedOperationService } from "../services/bedOperationService.js";
import * as v from "../validators/domainValidators.js";

export const domainRoutes = Router();
domainRoutes.use(authenticate);

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>, status = 200) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res)
      .then((data) => {
        if (!res.headersSent) res.status(status).json({ success: true, data });
      })
      .catch(next);
  };

const id = (req: Request) => String(req.params.id);
const q = (req: Request, key: string) => (typeof req.query[key] === "string" ? (req.query[key] as string) : undefined);
const qNum = (req: Request, key: string) => (q(req, key) ? Number(q(req, key)) : undefined);
const monthYear = (req: Request) => {
  const now = new Date();
  return v.monthYearSchema.parse({
    month: q(req, "month") ?? now.getMonth() + 1,
    year: q(req, "year") ?? now.getFullYear(),
  });
};
const can = (route: string | string[], action: PermissionAction = "VIEW") => requirePermission(route, action);

// ── Dashboard ───────────────────────────────────────────
domainRoutes.get(
  "/dashboard/overview",
  can("/dashboard"),
  handle(async (req) => {
    const { month, year } = monthYear(req);
    return dashboardService.overview(month, year);
  }),
);

// ── Rooms & Beds (room/bed lists are also read by tenant + rent forms) ──
const ROOM_READERS = ["/rooms", "/tenants", "/rent", "/dashboard"];
domainRoutes.get("/rooms", can(ROOM_READERS), handle(() => roomService.summary()));
domainRoutes.post("/rooms", can("/rooms", "ADD"), validateBody(v.roomCreateSchema), handle((req) => roomService.create(req.body), 201));
domainRoutes.patch("/rooms/:id", can("/rooms", "EDIT"), validateBody(v.roomUpdateSchema), handle((req) => roomService.update(id(req), req.body)));

domainRoutes.get(
  "/beds",
  can(ROOM_READERS),
  handle((req) => bedService.list({ roomId: q(req, "roomId"), status: q(req, "status") })),
);
domainRoutes.patch("/beds/:id", can("/rooms", "EDIT"), validateBody(v.bedUpdateSchema), handle((req) => bedService.update(id(req), req.body)));
domainRoutes.post("/allocations", can("/rooms", "ADD"), validateBody(v.allocationSchema), handle((req) => allocationService.book(req.body, req.user?.id), 201));

// ── Bed transfer & swap (one transaction per operation) ──
const BED_OPERATORS = ["/tenants", "/rooms"];
domainRoutes.get(
  "/beds/available",
  can(ROOM_READERS),
  handle((req) => bedOperationService.available(q(req, "date"), q(req, "excludeTenantId"))),
);
domainRoutes.post(
  "/bed-operations/transfer",
  can(BED_OPERATORS, "EDIT"),
  validateBody(v.bedTransferSchema),
  handle((req) => bedOperationService.transfer(req.body, req.user?.id), 201),
);
domainRoutes.post(
  "/bed-operations/swap",
  can(BED_OPERATORS, "EDIT"),
  validateBody(v.bedSwapSchema),
  handle((req) => bedOperationService.swap(req.body, req.user?.id), 201),
);
domainRoutes.get("/tenants/:id/bed-history", can(["/tenants", "/rooms"]), handle((req) => bedOperationService.history(id(req))));

// ── Tenants ─────────────────────────────────────────────
const TENANT_READERS = ["/tenants", "/rent", "/payments", "/deposits", "/rooms"];
domainRoutes.get(
  "/tenants",
  can(TENANT_READERS),
  handle((req) =>
    tenantService.list({
      search: q(req, "search"),
      status: q(req, "status"),
      accommodation: q(req, "accommodation"),
      roomId: q(req, "roomId"),
      page: qNum(req, "page"),
      pageSize: qNum(req, "pageSize"),
      sort: q(req, "sort"),
      dir: q(req, "dir"),
    }),
  ),
);
domainRoutes.get("/tenants/:id", can(TENANT_READERS), handle((req) => tenantService.get(id(req))));
domainRoutes.get("/tenants/:id/ledger", can(TENANT_READERS), handle((req) => reportService.tenantLedger(id(req))));
domainRoutes.post("/tenants", can("/tenants", "ADD"), validateBody(v.tenantCreateSchema), handle((req) => tenantService.create(req.body, req.user?.id), 201));
domainRoutes.patch("/tenants/:id", can("/tenants", "EDIT"), validateBody(v.tenantUpdateSchema), handle((req) => tenantService.update(id(req), req.body, req.user?.id)));
domainRoutes.post(
  "/tenants/:id/deactivate",
  can("/tenants", "EDIT"),
  validateBody(v.tenantDeactivateSchema),
  handle((req) => tenantService.deactivate(id(req), req.body.leavingDate, req.body.notes, req.user?.id)),
);
domainRoutes.post(
  "/tenants/:id/activate",
  can("/tenants", "EDIT"),
  validateBody(v.tenantActivateSchema),
  handle((req) => tenantService.activate(id(req), req.body, req.user?.id)),
);
domainRoutes.post(
  "/tenants/:id/allocate",
  can(["/tenants", "/rooms"], "ADD"),
  validateBody(v.tenantAllocateSchema),
  handle((req) => tenantService.allocate(id(req), req.body, req.user?.id)),
);
domainRoutes.delete("/tenants/:id", can("/tenants", "DELETE"), handle((req) => tenantService.archive(id(req), req.user?.id)));
domainRoutes.get("/tenants/:id/charges", can(TENANT_READERS), handle((req) => chargeService.listCharges(id(req))));
domainRoutes.post("/charges", can("/tenants", "EDIT"), validateBody(v.chargeCreateSchema), handle((req) => chargeService.createCharge(req.body), 201));

domainRoutes.post(
  "/imports/tenants/preview",
  can("/tenants", "ADD"),
  validateBody(z.object({ rows: z.array(z.record(z.string(), z.unknown())).max(1000) })),
  handle((req) => importService.previewTenants(req.body.rows)),
);
domainRoutes.post(
  "/imports/tenants",
  can("/tenants", "ADD"),
  validateBody(z.object({ rows: z.array(z.record(z.string(), z.unknown())).max(1000), confirm: z.boolean() })),
  handle((req) => importService.importTenants(req.body.rows, req.user?.id, req.body.confirm), 201),
);

// ── Monthly Rent ────────────────────────────────────────
domainRoutes.get(
  "/rent/overview",
  can(["/rent", "/dashboard"]),
  handle(async (req) => {
    const { month, year } = monthYear(req);
    return rentService.overview(month, year);
  }),
);
domainRoutes.post(
  "/rent/generate",
  can("/rent", "ADD"),
  validateBody(v.monthYearSchema),
  handle((req) => rentService.generate(req.body.month, req.body.year, req.user?.id)),
);
domainRoutes.get(
  "/rent/manual-preview",
  can("/rent", "ADD"),
  handle(async (req) => {
    const { month, year } = monthYear(req);
    return rentService.manualPreview({ tenantId: q(req, "tenantId") ?? "", month, year, from: q(req, "from"), to: q(req, "to") });
  }),
);
domainRoutes.post(
  "/rent/manual",
  can("/rent", "ADD"),
  validateBody(v.manualRentSchema),
  handle(async (req) => {
    // Overriding the calculated amount is an authorised action (Edit right on Monthly Rent).
    const canOverride = await permissionService.hasAny(req.user!, ["/rent"], "EDIT");
    return rentService.manualCreate(req.body, { id: req.user?.id, canOverride });
  }, 201),
);
domainRoutes.patch(
  "/rent/invoices/:id",
  can("/rent", "EDIT"),
  validateBody(v.invoiceAdjustSchema),
  handle((req) => rentService.adjustInvoice(id(req), req.body, req.user?.id)),
);
domainRoutes.get("/rent/outstanding/:id", can(["/rent", "/payments", "/tenants"]), handle((req) => rentService.outstandingForTenant(id(req))));
domainRoutes.post("/rent/adjustments", can("/rent", "EDIT"), validateBody(v.adjustmentSchema), handle((req) => rentService.adjust(req.body, req.user?.id), 201));

// ── Payments ────────────────────────────────────────────
// Collecting rent is the Payments module's ADD right, whether started from Rent or Tenants.
domainRoutes.get(
  "/payments",
  can("/payments"),
  handle((req) =>
    paymentService.list({
      from: q(req, "from"),
      to: q(req, "to"),
      tenantId: q(req, "tenantId"),
      accountId: q(req, "accountId"),
      method: q(req, "method"),
      search: q(req, "search"),
    }),
  ),
);
domainRoutes.get("/payments/:id/receipt", can(["/payments", "/rent", "/tenants"]), handle((req) => paymentService.getReceipt(id(req))));
domainRoutes.post("/payments", can(["/payments", "/rent"], "ADD"), validateBody(v.paymentCreateSchema), handle((req) => paymentService.create(req.body, req.user?.id), 201));

// ── Deposits ────────────────────────────────────────────
domainRoutes.get("/deposits", can("/deposits"), handle(() => depositService.summary()));
domainRoutes.get("/deposits/ledger", can(["/deposits", "/tenants"]), handle((req) => depositService.ledger(q(req, "tenantId"))));
domainRoutes.post("/deposits", can("/deposits", "ADD"), validateBody(v.depositCollectSchema), handle((req) => depositService.collect(req.body, req.user?.id), 201));
domainRoutes.post("/deposits/refund", can("/deposits", "EDIT"), validateBody(v.depositRefundSchema), handle((req) => depositService.refund(req.body, req.user?.id), 201));

// ── Expenditure ─────────────────────────────────────────
domainRoutes.get(
  "/expenses",
  can(["/expenditure", "/dashboard"]),
  handle((req) =>
    expenseService.list({
      from: q(req, "from"),
      to: q(req, "to"),
      categoryId: q(req, "categoryId"),
      search: q(req, "search"),
      includeVoided: q(req, "includeVoided") === "true",
    }),
  ),
);
domainRoutes.get("/expenses/:id", can("/expenditure"), handle((req) => expenseService.get(id(req))));
domainRoutes.post("/expenses", can("/expenditure", "ADD"), validateBody(v.expenseSchema), handle((req) => expenseService.create(req.body, req.user?.id), 201));
domainRoutes.patch("/expenses/:id", can("/expenditure", "EDIT"), validateBody(v.expenseSchema.partial()), handle((req) => expenseService.update(id(req), req.body, req.user?.id)));
domainRoutes.post(
  "/expenses/:id/void",
  can("/expenditure", "DELETE"),
  validateBody(v.expenseVoidSchema),
  handle((req) => expenseService.void(id(req), req.body.reason, req.user?.id)),
);
domainRoutes.get("/expense-categories", can(["/expenditure", "/dashboard"]), handle(() => expenseService.listCategories()));
domainRoutes.post("/expense-categories", requireRoles("SUPER_ADMIN"), validateBody(v.expenseCategorySchema), handle((req) => expenseService.createCategory(req.body), 201));
domainRoutes.patch(
  "/expense-categories/:id",
  requireRoles("SUPER_ADMIN"),
  validateBody(v.expenseCategorySchema.partial()),
  handle((req) => expenseService.updateCategory(id(req), req.body)),
);

// ── Shared lookups (any signed-in user; needed by collection forms) ─────
domainRoutes.get("/accounts", handle(() => accountService.list()));
domainRoutes.get("/charge-types", handle(() => chargeService.listTypes()));
domainRoutes.get("/pg", handle(() => adminService.pgProperty()));

// ── Settings: business configuration (menu permission) ─────
domainRoutes.post("/accounts", can("/settings", "ADD"), validateBody(v.accountSchema), handle((req) => accountService.create(req.body), 201));
domainRoutes.patch("/accounts/:id", can("/settings", "EDIT"), validateBody(v.accountSchema.partial()), handle((req) => accountService.update(id(req), req.body)));
domainRoutes.post("/charge-types", can("/settings", "ADD"), validateBody(v.chargeTypeSchema), handle((req) => chargeService.createType(req.body), 201));
domainRoutes.patch("/charge-types/:id", can("/settings", "EDIT"), validateBody(v.chargeTypeSchema.partial()), handle((req) => chargeService.updateType(id(req), req.body)));
domainRoutes.patch("/pg/:id", can("/settings", "EDIT"), validateBody(v.pgSchema.partial()), handle((req) => adminService.updatePg(id(req), req.body)));

// ── Settings: administration (Super Admin only) ────────
const admin = Router();
admin.use(requireRoles("SUPER_ADMIN"));
admin.get("/menus", handle(() => adminService.listMenus()));
admin.patch("/menus/:id", validateBody(v.menuUpdateSchema), handle((req) => adminService.updateMenu(id(req), req.body)));
admin.get("/roles", handle(() => adminService.listRoles()));
admin.post("/roles", validateBody(v.roleSchema), handle((req) => adminService.createRole(req.body.roleName, req.body.description), 201));
admin.patch("/roles/:id", validateBody(v.roleUpdateSchema), handle((req) => adminService.updateRole(id(req), req.body)));
admin.get("/users", handle(() => adminService.listUsers()));
admin.post("/users", validateBody(v.userCreateSchema), handle((req) => adminService.createUser(req.body), 201));
admin.patch("/users/:id", validateBody(v.userUpdateSchema), handle((req) => adminService.updateUser(id(req), req.body, req.user?.id)));
admin.get("/role-permissions/:id", handle((req) => adminService.getRolePermissions(id(req))));
admin.put(
  "/role-permissions",
  validateBody(v.rolePermissionSchema),
  handle((req) => adminService.setRolePermission(req.body.roleId, req.body.menuId, req.body.action, req.body.allowed)),
);
admin.get("/user-permissions/:id", handle((req) => adminService.getUserOverrides(id(req))));
admin.put(
  "/user-permissions",
  validateBody(v.userPermissionSchema),
  handle((req) => adminService.setUserOverride(req.body.userId, req.body.menuId, req.body.action, req.body.allowed)),
);
admin.get("/settings", handle(() => adminService.listSettings()));
admin.put("/settings", validateBody(v.settingSchema), handle((req) => adminService.upsertSetting(req.body.key, req.body.value)));
admin.get("/audit-logs", handle((req) => adminService.auditLogs(qNum(req, "limit") ?? 100)));
domainRoutes.use("/admin", admin);
