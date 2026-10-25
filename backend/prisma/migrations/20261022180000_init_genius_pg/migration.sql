-- Create application schema (do not touch auth/storage)
CREATE SCHEMA IF NOT EXISTS "genius_pg";

-- CreateEnum
CREATE TYPE "genius_pg"."PermissionAction" AS ENUM ('VIEW', 'ADD', 'EDIT', 'DELETE', 'EXPORT', 'PRINT', 'APPROVE');
CREATE TYPE "genius_pg"."TenantStatus" AS ENUM ('ACTIVE', 'NOTICE', 'VACATED', 'BLOCKED');
CREATE TYPE "genius_pg"."BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'BLOCKED');
CREATE TYPE "genius_pg"."AllocationStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'VACATED', 'CANCELLED');
CREATE TYPE "genius_pg"."InvoiceStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOIDED');
CREATE TYPE "genius_pg"."PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE "genius_pg"."PaymentStatus" AS ENUM ('RECORDED', 'REVERSED', 'VOIDED');
CREATE TYPE "genius_pg"."DepositTxnType" AS ENUM ('COLLECTION', 'REFUND', 'DEDUCTION', 'ADJUSTMENT_TO_RENT');
CREATE TYPE "genius_pg"."ImportBatchStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'IMPORTED', 'FAILED', 'CANCELLED');

-- Roles
CREATE TABLE "genius_pg"."roles" (
    "id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_role_name_key" ON "genius_pg"."roles"("role_name");

-- Users
CREATE TABLE "genius_pg"."users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_username_key" ON "genius_pg"."users"("username");
CREATE INDEX "users_role_id_idx" ON "genius_pg"."users"("role_id");

-- Menus
CREATE TABLE "genius_pg"."menus" (
    "id" TEXT NOT NULL,
    "menu_name" TEXT NOT NULL,
    "parent_menu_id" TEXT,
    "route_path" TEXT,
    "icon" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "menus_parent_menu_id_idx" ON "genius_pg"."menus"("parent_menu_id");
CREATE INDEX "menus_display_order_idx" ON "genius_pg"."menus"("display_order");

-- Role permissions
CREATE TABLE "genius_pg"."role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "menu_id" TEXT NOT NULL,
    "action" "genius_pg"."PermissionAction" NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "role_permissions_role_id_menu_id_action_key" ON "genius_pg"."role_permissions"("role_id", "menu_id", "action");

-- User permission overrides
CREATE TABLE "genius_pg"."user_permission_overrides" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "menu_id" TEXT NOT NULL,
    "action" "genius_pg"."PermissionAction" NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_permission_overrides_user_id_menu_id_action_key" ON "genius_pg"."user_permission_overrides"("user_id", "menu_id", "action");

-- Sessions
CREATE TABLE "genius_pg"."sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sessions_user_id_idx" ON "genius_pg"."sessions"("user_id");
CREATE INDEX "sessions_token_hash_idx" ON "genius_pg"."sessions"("token_hash");

-- Audit logs
CREATE TABLE "genius_pg"."audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "genius_pg"."audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_created_at_idx" ON "genius_pg"."audit_logs"("created_at");

-- System settings
CREATE TABLE "genius_pg"."system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "system_settings_key_key" ON "genius_pg"."system_settings"("key");

-- PG properties
CREATE TABLE "genius_pg"."pg_properties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pg_properties_pkey" PRIMARY KEY ("id")
);

-- Rooms
CREATE TABLE "genius_pg"."rooms" (
    "id" TEXT NOT NULL,
    "pg_property_id" TEXT NOT NULL,
    "room_number" TEXT NOT NULL,
    "floor" TEXT,
    "capacity" INTEGER NOT NULL,
    "default_monthly_rent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rooms_pg_property_id_room_number_key" ON "genius_pg"."rooms"("pg_property_id", "room_number");

-- Beds
CREATE TABLE "genius_pg"."beds" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "bed_code" TEXT NOT NULL,
    "bed_type" TEXT,
    "default_rent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "beds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "beds_room_id_bed_code_key" ON "genius_pg"."beds"("room_id", "bed_code");

-- Collection accounts
CREATE TABLE "genius_pg"."collection_accounts" (
    "id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_type" TEXT,
    "account_holder" TEXT,
    "bank_name" TEXT,
    "account_reference" TEXT,
    "upi_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "collection_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collection_accounts_account_name_key" ON "genius_pg"."collection_accounts"("account_name");

-- Charge types
CREATE TABLE "genius_pg"."charge_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "charge_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "charge_types_name_key" ON "genius_pg"."charge_types"("name");

-- Tenants
CREATE TABLE "genius_pg"."tenants" (
    "id" TEXT NOT NULL,
    "tenant_name" TEXT NOT NULL,
    "mobile_number" TEXT,
    "whatsapp_number" TEXT,
    "parent_name" TEXT,
    "parent_number" TEXT,
    "email" TEXT,
    "address" TEXT,
    "emergency_contact" TEXT,
    "room_id" TEXT,
    "bed_id" TEXT,
    "joining_date" DATE NOT NULL,
    "leaving_date" DATE,
    "status" "genius_pg"."TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthly_rent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "security_deposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tenants_status_idx" ON "genius_pg"."tenants"("status");
CREATE INDEX "tenants_tenant_name_idx" ON "genius_pg"."tenants"("tenant_name");
CREATE INDEX "tenants_room_id_bed_id_idx" ON "genius_pg"."tenants"("room_id", "bed_id");

CREATE TABLE "genius_pg"."tenant_contacts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phone_number" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "genius_pg"."bed_reservations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "room_id" TEXT NOT NULL,
    "bed_id" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bed_reservations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bed_reservations_bed_id_from_date_idx" ON "genius_pg"."bed_reservations"("bed_id", "from_date");

CREATE TABLE "genius_pg"."bed_allocations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "bed_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "genius_pg"."AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthly_rent" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bed_allocations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bed_allocations_tenant_id_idx" ON "genius_pg"."bed_allocations"("tenant_id");
CREATE INDEX "bed_allocations_bed_id_status_idx" ON "genius_pg"."bed_allocations"("bed_id", "status");
-- Partial unique: one ACTIVE allocation per bed
CREATE UNIQUE INDEX "bed_allocations_one_active_per_bed" ON "genius_pg"."bed_allocations"("bed_id") WHERE status = 'ACTIVE';

CREATE TABLE "genius_pg"."tenant_rent_history" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "monthly_rent" DECIMAL(12,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_rent_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "genius_pg"."tenant_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "genius_pg"."rent_invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "billing_month" INTEGER NOT NULL,
    "billing_year" INTEGER NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "base_rent" DECIMAL(12,2) NOT NULL,
    "additional_charges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_payable" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pending_amount" DECIMAL(12,2) NOT NULL,
    "status" "genius_pg"."InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rent_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rent_invoices_tenant_id_billing_month_billing_year_key" ON "genius_pg"."rent_invoices"("tenant_id", "billing_month", "billing_year");
CREATE INDEX "rent_invoices_billing_year_billing_month_idx" ON "genius_pg"."rent_invoices"("billing_year", "billing_month");
CREATE INDEX "rent_invoices_status_idx" ON "genius_pg"."rent_invoices"("status");

CREATE TABLE "genius_pg"."rent_invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "item_type" TEXT NOT NULL,
    CONSTRAINT "rent_invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "genius_pg"."payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount_received" DECIMAL(12,2) NOT NULL,
    "allocated_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unallocated_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_method" "genius_pg"."PaymentMethod" NOT NULL,
    "collection_account_id" TEXT NOT NULL,
    "transaction_reference" TEXT,
    "notes" TEXT,
    "status" "genius_pg"."PaymentStatus" NOT NULL DEFAULT 'RECORDED',
    "idempotency_key" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "genius_pg"."payments"("idempotency_key");
CREATE INDEX "payments_payment_date_idx" ON "genius_pg"."payments"("payment_date");
CREATE INDEX "payments_tenant_id_idx" ON "genius_pg"."payments"("tenant_id");
CREATE INDEX "payments_collection_account_id_idx" ON "genius_pg"."payments"("collection_account_id");

CREATE TABLE "genius_pg"."payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "genius_pg"."payment_allocations"("payment_id", "invoice_id");

CREATE TABLE "genius_pg"."payment_receipts" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "receipt_date" DATE NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_voided" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_receipts_payment_id_key" ON "genius_pg"."payment_receipts"("payment_id");
CREATE UNIQUE INDEX "payment_receipts_receipt_number_key" ON "genius_pg"."payment_receipts"("receipt_number");

CREATE TABLE "genius_pg"."payment_reversals" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reversed_amount" DECIMAL(12,2) NOT NULL,
    "reversed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "genius_pg"."financial_adjustments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "adjustment_type" TEXT NOT NULL,
    "reason" TEXT,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "genius_pg"."security_deposit_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "txn_type" "genius_pg"."DepositTxnType" NOT NULL,
    "txn_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "collection_account_id" TEXT,
    "payment_method" "genius_pg"."PaymentMethod",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_deposit_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "security_deposit_transactions_tenant_id_idx" ON "genius_pg"."security_deposit_transactions"("tenant_id");

CREATE TABLE "genius_pg"."additional_charges" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "charge_type_id" TEXT NOT NULL,
    "charge_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pending_amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "billing_month" INTEGER,
    "billing_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "additional_charges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "additional_charges_tenant_id_idx" ON "genius_pg"."additional_charges"("tenant_id");

CREATE TABLE "genius_pg"."import_batches" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "genius_pg"."ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploaded_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "genius_pg"."import_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "mapped_data" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "genius_pg"."import_errors" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "sheet_name" TEXT,
    "row_number" INTEGER,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "genius_pg"."receipt_sequences" (
    "id" TEXT NOT NULL,
    "date_key" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "receipt_sequences_date_key_key" ON "genius_pg"."receipt_sequences"("date_key");

-- Foreign keys
ALTER TABLE "genius_pg"."users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "genius_pg"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."menus" ADD CONSTRAINT "menus_parent_menu_id_fkey" FOREIGN KEY ("parent_menu_id") REFERENCES "genius_pg"."menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "genius_pg"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."role_permissions" ADD CONSTRAINT "role_permissions_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "genius_pg"."menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "genius_pg"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "genius_pg"."menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "genius_pg"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "genius_pg"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."rooms" ADD CONSTRAINT "rooms_pg_property_id_fkey" FOREIGN KEY ("pg_property_id") REFERENCES "genius_pg"."pg_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."beds" ADD CONSTRAINT "beds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "genius_pg"."rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."tenants" ADD CONSTRAINT "tenants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "genius_pg"."rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."tenants" ADD CONSTRAINT "tenants_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "genius_pg"."beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."tenant_contacts" ADD CONSTRAINT "tenant_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."bed_reservations" ADD CONSTRAINT "bed_reservations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."bed_reservations" ADD CONSTRAINT "bed_reservations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "genius_pg"."rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."bed_reservations" ADD CONSTRAINT "bed_reservations_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "genius_pg"."beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."bed_allocations" ADD CONSTRAINT "bed_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."bed_allocations" ADD CONSTRAINT "bed_allocations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "genius_pg"."rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."bed_allocations" ADD CONSTRAINT "bed_allocations_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "genius_pg"."beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."tenant_rent_history" ADD CONSTRAINT "tenant_rent_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."tenant_documents" ADD CONSTRAINT "tenant_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."rent_invoices" ADD CONSTRAINT "rent_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."rent_invoice_items" ADD CONSTRAINT "rent_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "genius_pg"."rent_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."payments" ADD CONSTRAINT "payments_collection_account_id_fkey" FOREIGN KEY ("collection_account_id") REFERENCES "genius_pg"."collection_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "genius_pg"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "genius_pg"."payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "genius_pg"."rent_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."payment_receipts" ADD CONSTRAINT "payment_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "genius_pg"."payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."payment_reversals" ADD CONSTRAINT "payment_reversals_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "genius_pg"."payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."financial_adjustments" ADD CONSTRAINT "financial_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."security_deposit_transactions" ADD CONSTRAINT "security_deposit_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."security_deposit_transactions" ADD CONSTRAINT "security_deposit_transactions_collection_account_id_fkey" FOREIGN KEY ("collection_account_id") REFERENCES "genius_pg"."collection_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."additional_charges" ADD CONSTRAINT "additional_charges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."additional_charges" ADD CONSTRAINT "additional_charges_charge_type_id_fkey" FOREIGN KEY ("charge_type_id") REFERENCES "genius_pg"."charge_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."import_batches" ADD CONSTRAINT "import_batches_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "genius_pg"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "genius_pg"."import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_pg"."import_errors" ADD CONSTRAINT "import_errors_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "genius_pg"."import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
