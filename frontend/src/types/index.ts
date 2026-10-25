export type PermissionAction = "VIEW" | "ADD" | "EDIT" | "DELETE" | "EXPORT" | "PRINT" | "APPROVE";

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  role: string;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  permissions: Record<string, PermissionAction[]>;
};

export type MenuNode = {
  id: string;
  menuName: string;
  routePath: string | null;
  icon: string | null;
  displayOrder: number;
  children: MenuNode[];
};

export type TenantStatus = "ACTIVE" | "NOTICE" | "VACATED" | "BLOCKED";

export type Tenant = {
  id: string;
  tenantName: string;
  mobileNumber: string | null;
  whatsappNumber: string | null;
  whatsappLink: string | null;
  parentName: string | null;
  parentNumber: string | null;
  email: string | null;
  address: string | null;
  roomId: string | null;
  bedId: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  joiningDate: string;
  leavingDate: string | null;
  status: TenantStatus;
  isActive: boolean;
  accommodation: "RESIDING" | "UNALLOCATED" | "LEFT";
  monthlyRent: number;
  securityDeposit: number;
  notes: string | null;
  outstanding: number;
  createdAt: string;
};

export type BedHistoryEntry = {
  id: string;
  date: string;
  operationType: "TRANSFER" | "SWAP";
  previousRoom: string;
  previousBed: string;
  newRoom: string;
  newBed: string;
  otherStudent: string | null;
  reason: string | null;
  notes: string | null;
  performedBy: string | null;
  recordedAt: string;
};

export type AvailableBed = { id: string; bedCode: string; roomId: string; roomNumber: string; floor: string | null; defaultRent: number };

export type BedOperationResult = {
  id: string;
  operationType: "TRANSFER" | "SWAP";
  effectiveDate: string;
  studentA: { name: string; from: string | null; to: string | null };
  studentB: { name: string; from: string | null; to: string | null } | null;
};

export type TenantDetail = Tenant & {
  depositBalance: number;
  allocations: {
    id: string;
    roomNumber: string;
    bedCode: string;
    roomId: string;
    bedId: string;
    startDate: string;
    endDate: string | null;
    status: string;
    monthlyRent: number;
    reason: string | null;
  }[];
  invoices: (Invoice & { source: RentSource })[];
  payments: {
    id: string;
    paymentDate: string;
    amountReceived: number;
    paymentMethod: string;
    account: string;
    receiptNumber: string | null;
  }[];
  deposits: { id: string; txnType: string; txnDate: string; amount: number; account: string | null; notes: string | null }[];
  additionalCharges: {
    id: string;
    chargeType: string;
    chargeDate: string;
    amount: number;
    description: string | null;
  }[];
};

export type TenantList = {
  items: Tenant[];
  total: number;
  summary: { total: number; registered: number; residing: number; unallocated: number; inactive: number; active: number };
};

export type BedStatus = "AVAILABLE" | "OCCUPIED" | "BLOCKED" | "INACTIVE";

export type Bed = {
  id: string;
  bedCode: string;
  bedType: string | null;
  defaultRent: number;
  isActive: boolean;
  isBlocked: boolean;
  status: BedStatus;
  tenant: { id: string; tenantName: string; monthlyRent: number; since?: string } | null;
};

export type BedOption = Bed & { roomId: string; roomNumber: string; roomActive: boolean };

export type Room = {
  id: string;
  roomNumber: string;
  floor: string | null;
  capacity: number;
  defaultMonthlyRent: number;
  description: string | null;
  isActive: boolean;
  totalBeds: number;
  occupied: number;
  available: number;
  blocked: number;
  occupancyPercentage: number;
  status: "FULL" | "AVAILABLE" | "VACANT" | "INACTIVE";
  beds: Bed[];
};

export type RoomSummary = {
  rooms: Room[];
  totals: {
    rooms: number;
    activeRooms: number;
    totalBeds: number;
    occupied: number;
    available: number;
    blocked: number;
    occupancyPercentage: number;
  };
};

export type InvoiceStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOIDED";

export type Invoice = {
  id: string;
  billingMonth: number;
  billingYear: number;
  totalPayable: number;
  paidAmount: number;
  pendingAmount: number;
  status: InvoiceStatus;
};

export type RentSource = "AUTO" | "MANUAL";

export type RentRow = Invoice & {
  tenantId: string;
  tenantName: string;
  tenantStatus: TenantStatus;
  whatsappNumber: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  monthlyRent: number;
  baseRent: number;
  additionalCharges: number;
  discount: number;
  dueDate: string;
  source: RentSource;
  periodFrom: string | null;
  periodTo: string | null;
  rentRate: number | null;
  originalAmount: number | null;
  adjustmentReason: string | null;
  notes: string | null;
  createdBy: string | null;
  adjustedBy: string | null;
  adjustedAt: string | null;
};

export type ManualRentPreview = {
  tenant: {
    id: string;
    tenantName: string;
    joiningDate: string;
    leavingDate: string | null;
    monthlyRent: number;
    accommodation: "RESIDING" | "UNALLOCATED";
  };
  allocation: { roomNumber: string; bedCode: string; startDate: string; endDate: string | null; current: boolean } | null;
  defaultFrom: string;
  defaultTo: string;
  periodFrom: string;
  periodTo: string;
  chargeableDays: number;
  daysInMonth: number;
  suggestedAmount: number;
  existingInvoice: {
    id: string;
    source: RentSource;
    baseRent: number;
    totalPayable: number;
    paidAmount: number;
    pendingAmount: number;
    status: InvoiceStatus;
  } | null;
};

export type RentOverview = {
  month: number;
  year: number;
  items: RentRow[];
  notGenerated: number;
  unallocatedWithoutInvoice: number;
  rentNotSet: { id: string; tenantName: string }[];
  summary: {
    totalDue: number;
    collected: number;
    pending: number;
    paidTenants: number;
    pendingTenants: number;
    invoices: number;
    manual: number;
  };
};

export type OutstandingInvoice = Invoice & { label: string };

export type PaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "OTHER";

export type Payment = {
  id: string;
  paymentDate: string;
  createdAt: string;
  tenantName: string;
  tenantId: string;
  roomNumber: string | null;
  bedCode: string | null;
  amountReceived: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  paymentMethod: PaymentMethod;
  accountId: string;
  account: string;
  transactionReference: string | null;
  notes: string | null;
  receiptNumber: string | null;
  recordedBy: string | null;
};

export type PaymentList = {
  items: Payment[];
  summary: { total: number; count: number; cash: number; online: number; accounts: { account: string; amount: number }[] };
};

export type Receipt = {
  id: string;
  tenantId: string;
  tenantName: string;
  roomNumber: string | null;
  bedCode: string | null;
  whatsappNumber: string | null;
  paymentDate: string;
  amountReceived: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  paymentMethod: PaymentMethod;
  account: string;
  transactionReference: string | null;
  notes: string | null;
  recordedBy: string | null;
  receiptNumber: string;
  receiptDate: string;
  months: { label: string; amount: number }[];
  outstandingAfter: number;
  pg: { name: string; address: string | null; phone: string | null };
  whatsappLink: string | null;
  whatsappText: string;
};

export type CollectionAccount = {
  id: string;
  accountName: string;
  accountType: string | null;
  accountHolder: string | null;
  bankName: string | null;
  accountReference: string | null;
  upiId: string | null;
  isActive: boolean;
  paymentCount: number;
};

export type DepositRow = {
  tenantId: string;
  tenantName: string;
  roomNumber: string | null;
  bedCode: string | null;
  status: TenantStatus;
  agreedDeposit: number;
  received: number;
  refunded: number;
  balance: number;
  dueToCollect: number;
  applied: number;
  transactions: number;
  lastTxnDate: string | null;
};

export type DepositSummary = {
  items: DepositRow[];
  summary: { received: number; refunded: number; applied: number; balance: number; dueToCollect: number };
};

export type DepositTxn = {
  id: string;
  tenantName: string;
  tenantId: string;
  txnType: "COLLECTION" | "REFUND" | "DEDUCTION" | "ADJUSTMENT_TO_RENT";
  txnDate: string;
  amount: number;
  account: string | null;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
};

export type DashboardOverview = {
  period: { month: number; year: number; asOf: string };
  tenants: { registered: number; residing: number; unallocated: number };
  occupancy: { totalBeds: number; occupiedBeds: number; availableBeds: number; blockedBeds: number; occupancyPercentage: number };
  rent: { expected: number; collected: number; pending: number; invoices: number; pendingTenants: number; collectedPercentage: number };
  cash: {
    rentReceived: number;
    paymentCount: number;
    expenditure: number;
    expenseCount: number;
    netOperatingCash: number;
    depositsReceived: number;
    depositsRefunded: number;
  };
  deposits: { held: number; received: number; refunded: number; applied: number };
  expenseByCategory: { category: string; amount: number }[];
  trend: { month: number; year: number; label: string; rentCollected: number; expenditure: number; net: number }[];
};

export type ExpenseCategory = { id: string; name: string; description: string | null; isActive: boolean };

export type Expense = {
  id: string;
  expenseDate: string;
  categoryId: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  collectionAccountId: string;
  account: string;
  transactionReference: string | null;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
};

export type ExpenseList = {
  items: Expense[];
  summary: { total: number; count: number; voided: number; byCategory: { category: string; amount: number }[] };
};

export type ChargeType = { id: string; name: string; description: string | null; isActive: boolean };

export type PgProperty = { id: string; name: string; address: string | null; phone: string | null };

export type AdminUser = {
  id: string;
  username: string;
  fullName: string;
  roleId: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

export type Role = { id: string; roleName: string; description: string | null; isActive: boolean; userCount: number; isSystem: boolean };

export type AdminMenu = { id: string; menuName: string; routePath: string | null; icon: string | null; displayOrder: number; isActive: boolean };

export type RolePermissionRow = { menuId: string; menuName: string; routePath: string | null; actions: Record<PermissionAction, boolean> };

export type UserOverride = { id: string; menuId: string; menuName: string; action: PermissionAction; allowed: boolean };

export type SystemSetting = { id: string; key: string; value: string };

export type AuditLog = { id: string; action: string; entityType: string; entityId: string | null; actor: string; createdAt: string };
