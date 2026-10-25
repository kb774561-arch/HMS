import { z } from "zod";

const isoDate = z
  .string({ error: "Date is required" })
  .regex(/^\d{4}-\d{2}-\d{2}/, "Enter a valid date");

/** Empty strings from forms become null so optional columns are cleared, not set to "". */
const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalPhone = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\+?[\d\s-]{10,15}$/.test(v), "Enter a valid phone number (10–13 digits)");

const money = (label: string) =>
  z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(10_000_000);

const positiveMoney = (label: string) =>
  z.coerce.number({ error: `${label} must be a number` }).positive(`${label} must be greater than 0`).max(10_000_000);

const paymentMethod = z.enum(["CASH", "UPI", "BANK_TRANSFER", "OTHER"], { error: "Choose a payment method" });

// ── Tenants ───────────────────────────────────────────────
const optionalId = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null));

/** Register only (no room/bed) or register and allocate a bed in one step. */
export const tenantCreateSchema = z
  .object({
    tenantName: z.string().trim().min(1, "Tenant name is required").max(120),
    joiningDate: isoDate,
    monthlyRent: positiveMoney("Monthly rent"),
    roomId: optionalId,
    bedId: optionalId,
    whatsappNumber: optionalPhone,
    mobileNumber: optionalPhone,
    parentNumber: optionalPhone,
    parentName: optionalText(120),
    email: optionalText(160),
    address: optionalText(500),
    leavingDate: isoDate.nullish().or(z.literal("")).transform((v) => v || null),
    securityDeposit: money("Deposit").optional().default(0),
    notes: optionalText(1000),
  })
  .refine((d) => !d.roomId || d.bedId, { path: ["bedId"], message: "Select a bed" })
  .refine((d) => !d.bedId || d.roomId, { path: ["roomId"], message: "Select a room" })
  .refine((d) => !d.leavingDate || d.leavingDate >= d.joiningDate, {
    path: ["leavingDate"],
    message: "Leaving date cannot be before joining date",
  });

/** Profile and rent only — room/bed changes go through Allocate Bed or Transfer. */
export const tenantUpdateSchema = z
  .object({
    tenantName: z.string().trim().min(1, "Tenant name is required").max(120),
    joiningDate: isoDate,
    monthlyRent: positiveMoney("Monthly rent"),
    whatsappNumber: optionalPhone,
    mobileNumber: optionalPhone,
    parentNumber: optionalPhone,
    parentName: optionalText(120),
    email: optionalText(160),
    address: optionalText(500),
    leavingDate: isoDate.nullish().or(z.literal("")).transform((v) => v || null),
    securityDeposit: money("Deposit"),
    notes: optionalText(1000),
  })
  .partial()
  .refine((d) => !d.leavingDate || !d.joiningDate || d.leavingDate >= d.joiningDate, {
    path: ["leavingDate"],
    message: "Leaving date cannot be before joining date",
  });

export const tenantAllocateSchema = z.object({
  roomId: z.string().min(1, "Select a room"),
  bedId: z.string().min(1, "Select a bed"),
  startDate: isoDate,
  monthlyRent: positiveMoney("Monthly rent").optional(),
  notes: optionalText(500),
});

export const bedTransferSchema = z.object({
  tenantId: z.string({ error: "Select a student" }).min(1, "Select a student"),
  toBedId: z.string({ error: "Select the new bed" }).min(1, "Select the new bed"),
  effectiveDate: isoDate,
  newMonthlyRent: positiveMoney("New monthly rent").optional(),
  reason: optionalText(300),
  notes: optionalText(500),
});

export const bedSwapSchema = z
  .object({
    tenantAId: z.string({ error: "Select student A" }).min(1, "Select student A"),
    tenantBId: z.string({ error: "Select student B" }).min(1, "Select student B"),
    effectiveDate: isoDate,
    newMonthlyRentA: positiveMoney("New monthly rent").optional(),
    newMonthlyRentB: positiveMoney("New monthly rent").optional(),
    reason: optionalText(300),
    notes: optionalText(500),
  })
  .refine((d) => d.tenantAId !== d.tenantBId, { path: ["tenantBId"], message: "Choose two different students" });

export const tenantDeactivateSchema = z.object({
  leavingDate: isoDate,
  notes: optionalText(500),
});

export const tenantActivateSchema = z
  .object({
  roomId: optionalId,
  bedId: optionalId,
  startDate: isoDate,
  monthlyRent: positiveMoney("Monthly rent").optional(),
})
  .refine((d) => !d.roomId || d.bedId, { path: ["bedId"], message: "Select a bed" });

// ── Rooms & Beds ──────────────────────────────────────────
export const roomCreateSchema = z.object({
  roomNumber: z.string().trim().min(1, "Room number is required").max(40),
  floor: optionalText(20),
  capacity: z.coerce.number().int("Beds must be a whole number").min(1, "At least 1 bed").max(20, "At most 20 beds"),
  defaultMonthlyRent: money("Default rent").optional().default(0),
  description: optionalText(500),
});

export const roomUpdateSchema = roomCreateSchema.partial().extend({ isActive: z.boolean().optional() });

export const bedUpdateSchema = z.object({
  bedCode: z.string().trim().min(1).max(20).optional(),
  bedType: optionalText(40).optional(),
  defaultRent: money("Default rent").optional(),
  isActive: z.boolean().optional(),
  isBlocked: z.boolean().optional(),
});

export const allocationSchema = z.object({
  tenantId: z.string().min(1, "Select a tenant"),
  bedId: z.string().min(1, "Select a bed"),
  startDate: isoDate,
  monthlyRent: positiveMoney("Monthly rent").optional(),
  notes: optionalText(500),
});

// ── Rent & Payments ───────────────────────────────────────
export const monthYearSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const paymentCreateSchema = z.object({
  tenantId: z.string().min(1, "Select a tenant"),
  paymentDate: isoDate,
  amountReceived: positiveMoney("Amount received"),
  paymentMethod,
  collectionAccountId: z.string({ error: "Select a receiving account" }).min(1, "Select a receiving account"),
  transactionReference: optionalText(120),
  notes: optionalText(500),
  invoiceIds: z.array(z.string()).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export const manualRentSchema = z
  .object({
    tenantId: z.string({ error: "Select a tenant" }).min(1, "Select a tenant"),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    periodFrom: isoDate,
    periodTo: isoDate,
    amount: positiveMoney("Final rent amount"),
    dueDate: isoDate.nullish().or(z.literal("")).transform((v) => v || null),
    reason: optionalText(300),
    notes: optionalText(500),
  })
  .refine((d) => d.periodTo >= d.periodFrom, { path: ["periodTo"], message: "Period end cannot be before period start" })
  .refine(
    (d) => {
      const prefix = `${d.year}-${String(d.month).padStart(2, "0")}`;
      return d.periodFrom.startsWith(prefix) && d.periodTo.startsWith(prefix);
    },
    { path: ["periodFrom"], message: "The rent period must fall inside the billing month" },
  );

export const invoiceAdjustSchema = z.object({
  amount: money("Rent amount"),
  reason: z.string().trim().min(3, "Give a reason for the adjustment").max(300),
});

// ── Expenditure ───────────────────────────────────────────
export const expenseSchema = z.object({
  expenseDate: isoDate,
  categoryId: z.string({ error: "Choose a category" }).min(1, "Choose a category"),
  description: z.string().trim().min(1, "Description is required").max(200),
  amount: positiveMoney("Amount"),
  paymentMethod,
  collectionAccountId: z.string({ error: "Select the account it was paid from" }).min(1, "Select the account it was paid from"),
  transactionReference: optionalText(120),
  notes: optionalText(500),
});

export const expenseVoidSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  description: optionalText(200),
  isActive: z.boolean().optional(),
});

export const adjustmentSchema = z.object({
  tenantId: z.string().min(1),
  amount: z.coerce.number(),
  adjustmentType: z.string().min(1),
  reason: optionalText(500),
  effectiveDate: isoDate,
  invoiceId: z.string().optional(),
});

// ── Deposits ──────────────────────────────────────────────
export const depositCollectSchema = z.object({
  tenantId: z.string().min(1, "Select a tenant"),
  amount: positiveMoney("Amount"),
  txnDate: isoDate,
  collectionAccountId: z.string({ error: "Select a receiving account" }).min(1, "Select a receiving account"),
  paymentMethod,
  notes: optionalText(500),
});

export const depositRefundSchema = z.object({
  tenantId: z.string().min(1, "Select a tenant"),
  amount: positiveMoney("Amount"),
  txnDate: isoDate,
  txnType: z.enum(["REFUND", "DEDUCTION", "ADJUSTMENT_TO_RENT"]).optional().default("REFUND"),
  paymentMethod: paymentMethod.optional(),
  collectionAccountId: z.string().optional().nullable(),
  notes: optionalText(500),
});

// ── Charges ───────────────────────────────────────────────
export const chargeTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: optionalText(300),
  isActive: z.boolean().optional(),
});

export const chargeCreateSchema = z.object({
  tenantId: z.string().min(1, "Select a tenant"),
  chargeTypeId: z.string().min(1, "Select a charge type"),
  chargeDate: isoDate,
  amount: positiveMoney("Amount"),
  description: optionalText(300),
  billingMonth: z.coerce.number().int().min(1).max(12).optional(),
  billingYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

// ── Settings ──────────────────────────────────────────────
export const accountSchema = z.object({
  accountName: z.string().trim().min(1, "Account name is required").max(80),
  accountType: optionalText(40),
  accountHolder: optionalText(120),
  bankName: optionalText(120),
  accountReference: optionalText(120),
  upiId: optionalText(120),
  isActive: z.boolean().optional(),
});

export const pgSchema = z.object({
  name: z.string().trim().min(1, "PG name is required").max(120),
  address: optionalText(500),
  phone: optionalPhone,
});

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dot, dash or underscore"),
  fullName: z.string().trim().min(1, "Full name is required").max(120),
  roleId: z.string().min(1, "Select a role"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const userUpdateSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(120).optional(),
  roleId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  password: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || v.length >= 6, "Password must be at least 6 characters"),
});

export const roleSchema = z.object({
  roleName: z
    .string()
    .trim()
    .min(2, "Role name is required")
    .max(40)
    .transform((v) => v.toUpperCase().replace(/\s+/g, "_")),
  description: optionalText(200),
});

export const roleUpdateSchema = z.object({
  description: optionalText(200),
  isActive: z.boolean().optional(),
});

export const menuUpdateSchema = z.object({
  menuName: z.string().trim().min(1).max(60).optional(),
  icon: optionalText(40).optional(),
  displayOrder: z.coerce.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

const permissionAction = z.enum(["VIEW", "ADD", "EDIT", "DELETE", "EXPORT", "PRINT", "APPROVE"]);

export const rolePermissionSchema = z.object({
  roleId: z.string(),
  menuId: z.string(),
  action: permissionAction,
  allowed: z.boolean(),
});

export const userPermissionSchema = z.object({
  userId: z.string(),
  menuId: z.string(),
  action: permissionAction,
  allowed: z.boolean().nullable(),
});

export const settingSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, "Use UPPER_SNAKE_CASE"),
  value: z.string().max(1000),
});
