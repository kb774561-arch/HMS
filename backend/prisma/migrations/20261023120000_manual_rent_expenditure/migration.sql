-- Manual rent entry, billing periods, audit columns and PG expenditure (additive only).

-- CreateEnum
CREATE TYPE "genius_pg"."RentSource" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "genius_pg"."bed_allocations" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "genius_pg"."rent_invoices" ADD COLUMN     "adjusted_at" TIMESTAMP(3),
ADD COLUMN     "adjusted_by_id" TEXT,
ADD COLUMN     "adjustment_reason" TEXT,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "original_amount" DECIMAL(12,2),
ADD COLUMN     "period_from" DATE,
ADD COLUMN     "period_to" DATE,
ADD COLUMN     "rent_rate" DECIMAL(12,2),
ADD COLUMN     "source" "genius_pg"."RentSource" NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "genius_pg"."security_deposit_transactions" ADD COLUMN     "created_by_id" TEXT;

-- CreateTable
CREATE TABLE "genius_pg"."expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genius_pg"."expenses" (
    "id" TEXT NOT NULL,
    "expense_date" DATE NOT NULL,
    "category_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "genius_pg"."PaymentMethod" NOT NULL,
    "collection_account_id" TEXT NOT NULL,
    "transaction_reference" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "genius_pg"."expense_categories"("name");

-- CreateIndex
CREATE INDEX "expenses_expense_date_idx" ON "genius_pg"."expenses"("expense_date");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "genius_pg"."expenses"("category_id");

-- AddForeignKey
ALTER TABLE "genius_pg"."rent_invoices" ADD CONSTRAINT "rent_invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "genius_pg"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."rent_invoices" ADD CONSTRAINT "rent_invoices_adjusted_by_id_fkey" FOREIGN KEY ("adjusted_by_id") REFERENCES "genius_pg"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "genius_pg"."expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."expenses" ADD CONSTRAINT "expenses_collection_account_id_fkey" FOREIGN KEY ("collection_account_id") REFERENCES "genius_pg"."collection_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "genius_pg"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."expenses" ADD CONSTRAINT "expenses_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "genius_pg"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill billing period / rent rate on existing invoices (all existing invoices were auto-generated).
UPDATE "genius_pg"."rent_invoices" i
SET period_from = make_date(i.billing_year, i.billing_month, 1),
    period_to   = (make_date(i.billing_year, i.billing_month, 1) + INTERVAL '1 month - 1 day')::date,
    rent_rate   = t.monthly_rent,
    original_amount = i.base_rent
FROM "genius_pg"."tenants" t
WHERE t.id = i.tenant_id AND i.period_from IS NULL;

-- Starter expense categories.
INSERT INTO "genius_pg"."expense_categories" (id, name, is_active, created_at, updated_at)
SELECT gen_random_uuid()::text, c, true, now(), now()
FROM unnest(ARRAY['Food','Milk','Electricity','Water','Gas','Maintenance','Cleaning','Internet','Staff Salary','Other']) AS c
ON CONFLICT (name) DO NOTHING;
