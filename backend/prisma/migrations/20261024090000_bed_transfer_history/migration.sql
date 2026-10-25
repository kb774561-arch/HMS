-- Bed transfer & swap history (additive only).

-- CreateEnum
CREATE TYPE "genius_pg"."BedOperationType" AS ENUM ('TRANSFER', 'SWAP');

-- CreateTable
CREATE TABLE "genius_pg"."bed_transfer_history" (
    "id" TEXT NOT NULL,
    "operation_type" "genius_pg"."BedOperationType" NOT NULL,
    "student_a_id" TEXT NOT NULL,
    "student_b_id" TEXT,
    "from_bed_a_id" TEXT NOT NULL,
    "to_bed_a_id" TEXT NOT NULL,
    "from_bed_b_id" TEXT,
    "to_bed_b_id" TEXT,
    "effective_date" DATE NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "performed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bed_transfer_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bed_transfer_history_student_a_id_idx" ON "genius_pg"."bed_transfer_history"("student_a_id");

-- CreateIndex
CREATE INDEX "bed_transfer_history_student_b_id_idx" ON "genius_pg"."bed_transfer_history"("student_b_id");

-- CreateIndex
CREATE INDEX "bed_transfer_history_effective_date_idx" ON "genius_pg"."bed_transfer_history"("effective_date");

-- AddForeignKey
ALTER TABLE "genius_pg"."bed_transfer_history" ADD CONSTRAINT "bed_transfer_history_student_a_id_fkey" FOREIGN KEY ("student_a_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."bed_transfer_history" ADD CONSTRAINT "bed_transfer_history_student_b_id_fkey" FOREIGN KEY ("student_b_id") REFERENCES "genius_pg"."tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."bed_transfer_history" ADD CONSTRAINT "bed_transfer_history_from_bed_a_id_fkey" FOREIGN KEY ("from_bed_a_id") REFERENCES "genius_pg"."beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."bed_transfer_history" ADD CONSTRAINT "bed_transfer_history_to_bed_a_id_fkey" FOREIGN KEY ("to_bed_a_id") REFERENCES "genius_pg"."beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."bed_transfer_history" ADD CONSTRAINT "bed_transfer_history_from_bed_b_id_fkey" FOREIGN KEY ("from_bed_b_id") REFERENCES "genius_pg"."beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."bed_transfer_history" ADD CONSTRAINT "bed_transfer_history_to_bed_b_id_fkey" FOREIGN KEY ("to_bed_b_id") REFERENCES "genius_pg"."beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genius_pg"."bed_transfer_history" ADD CONSTRAINT "bed_transfer_history_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "genius_pg"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: every earlier transfer is an allocation that ended TRANSFERRED followed by the tenant's next allocation.
INSERT INTO "genius_pg"."bed_transfer_history"
  (id, operation_type, student_a_id, from_bed_a_id, to_bed_a_id, effective_date, reason, performed_by, created_at)
SELECT gen_random_uuid()::text, 'TRANSFER', x.tenant_id, x.bed_id, x.next_bed, x.next_start, x.next_reason, x.next_by, x.next_created
FROM (
  SELECT a.tenant_id, a.bed_id, a.status,
         LEAD(a.bed_id)      OVER w AS next_bed,
         LEAD(a.start_date)  OVER w AS next_start,
         LEAD(a.reason)      OVER w AS next_reason,
         LEAD(a.created_by_id) OVER w AS next_by,
         LEAD(a.created_at)  OVER w AS next_created
  FROM "genius_pg"."bed_allocations" a
  WINDOW w AS (PARTITION BY a.tenant_id ORDER BY a.start_date, a.created_at)
) x
WHERE x.status = 'TRANSFERRED' AND x.next_bed IS NOT NULL;
