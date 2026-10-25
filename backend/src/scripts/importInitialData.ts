import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

/**
 * Replaces ALL business data (tenants, beds allocations, rent, payments, receipts,
 * deposits, charges, expenses, bed history, audit trail) with the client's sheet in
 * data/initial-data.json. Users, roles, permissions, menus, settings, PG details,
 * expense categories and room/bed records are kept.
 *
 * Take a backup first (pg_dump). Requires --confirm.
 *
 *   npm run db:import-initial -- --confirm
 */
type Row = {
  name: string;
  mobile: string;
  whatsapp: boolean;
  parent: string;
  room: string | null;
  joining: string | null;
  rent: number | null;
};
type Data = {
  rooms: { roomNumber: string; capacity: number }[];
  accounts: { accountName: string; accountType: string }[];
  chargeTypes: string[];
  tenants: Row[];
};

if (!process.argv.includes("--confirm")) {
  console.error("This deletes all tenant and financial data. Re-run with --confirm after taking a backup.");
  process.exit(1);
}

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/initial-data.json");
const data = JSON.parse(readFileSync(file, "utf-8")) as Data;
const prisma = new PrismaClient();

const digits = (v: string) => v.replace(/\D/g, "");
const DEFAULT_JOINING = "2026-10-01";

// Child tables first; every one of these is business/test data.
const WIPE = [
  "payment_allocations",
  "payment_receipts",
  "payment_reversals",
  "payments",
  "rent_invoice_items",
  "rent_invoices",
  "security_deposit_transactions",
  "additional_charges",
  "financial_adjustments",
  "bed_transfer_history",
  "bed_allocations",
  "bed_reservations",
  "tenant_rent_history",
  "tenant_contacts",
  "tenant_documents",
  "tenants",
  "expenses",
  "import_errors",
  "import_rows",
  "import_batches",
  "receipt_sequences",
  "audit_logs",
  "charge_types",
];

async function main() {
  // Validate the sheet against room capacity before touching anything.
  const perRoom = new Map<string, number>();
  for (const t of data.tenants) if (t.room) perRoom.set(t.room, (perRoom.get(t.room) ?? 0) + 1);
  for (const [room, n] of perRoom) {
    const cap = data.rooms.find((r) => r.roomNumber === room)?.capacity;
    if (cap === undefined) throw new Error(`${room} is not in the room list`);
    if (n > cap) throw new Error(`${room} has ${n} tenants but only ${cap} beds`);
  }

  const summary = await prisma.$transaction(
    async (tx) => {
      for (const table of WIPE) await tx.$executeRawUnsafe(`DELETE FROM genius_pg."${table}"`);

      // Rooms & beds: exactly `capacity` usable beds B1..Bn per room, all unblocked.
      const pg = (await tx.pgProperty.findFirst({ where: { isActive: true } })) ?? (await tx.pgProperty.create({ data: { name: "Genius Girls PG" } }));
      const bedsByRoom = new Map<string, { id: string; roomId: string; bedCode: string }[]>();
      for (const r of data.rooms) {
        const room =
          (await tx.room.findFirst({ where: { pgPropertyId: pg.id, roomNumber: r.roomNumber } })) ??
          (await tx.room.create({ data: { pgPropertyId: pg.id, roomNumber: r.roomNumber, capacity: r.capacity } }));
        await tx.room.update({ where: { id: room.id }, data: { capacity: r.capacity, isActive: true, deletedAt: null } });
        const beds = [];
        for (let i = 1; i <= r.capacity; i++) {
          const bedCode = `B${i}`;
          const bed = await tx.bed.upsert({
            where: { roomId_bedCode: { roomId: room.id, bedCode } },
            create: { roomId: room.id, bedCode },
            update: { isActive: true, isBlocked: false, deletedAt: null },
          });
          beds.push({ id: bed.id, roomId: room.id, bedCode });
        }
        // Retire any extra beds beyond capacity (none are referenced after the wipe).
        await tx.bed.deleteMany({ where: { roomId: room.id, id: { notIn: beds.map((b) => b.id) } } });
        bedsByRoom.set(r.roomNumber, beds);
      }
      await tx.room.updateMany({ where: { roomNumber: { notIn: data.rooms.map((r) => r.roomNumber) } }, data: { isActive: false, deletedAt: new Date() } });

      // Receiving accounts.
      for (const a of data.accounts) {
        await tx.collectionAccount.upsert({
          where: { accountName: a.accountName },
          create: { accountName: a.accountName, accountType: a.accountType },
          update: { accountType: a.accountType, isActive: true },
        });
      }
      await tx.collectionAccount.updateMany({ where: { accountName: { notIn: data.accounts.map((a) => a.accountName) } }, data: { isActive: false } });

      // Additional charge types.
      await tx.chargeType.createMany({ data: data.chargeTypes.map((name) => ({ name })) });

      // Tenants: next free bed in the sheet's order.
      const nextBed = new Map<string, number>();
      let residing = 0;
      const noRent: string[] = [];
      const noRoom: string[] = [];
      for (const row of data.tenants) {
        const mobile = digits(row.mobile) || null;
        const [parent, extraParent] = row.parent.split("/").map((p) => digits(p) || null);
        const joining = new Date(`${row.joining ?? DEFAULT_JOINING}T00:00:00Z`);
        const rent = row.rent ?? 0;
        const notes = [
          row.rent == null ? "Monthly rent not provided in import — set it before generating rent." : null,
          row.joining == null ? "Joining date not provided in import (defaulted to 01-Oct-2026)." : null,
        ]
          .filter(Boolean)
          .join("\n");

        let bed: { id: string; roomId: string } | null = null;
        if (row.room) {
          const i = nextBed.get(row.room) ?? 0;
          bed = bedsByRoom.get(row.room)![i]!;
          nextBed.set(row.room, i + 1);
        }

        const tenant = await tx.tenant.create({
          data: {
            tenantName: row.name.trim(),
            mobileNumber: mobile,
            whatsappNumber: row.whatsapp ? mobile : null,
            parentNumber: parent ?? null,
            emergencyContact: extraParent ?? null,
            joiningDate: joining,
            monthlyRent: rent,
            status: "ACTIVE",
            roomId: bed?.roomId ?? null,
            bedId: bed?.id ?? null,
            notes: notes || null,
          },
        });
        await tx.tenantRentHistory.create({ data: { tenantId: tenant.id, monthlyRent: rent, effectiveFrom: joining, reason: "Initial import" } });
        if (bed) {
          await tx.bedAllocation.create({
            data: { tenantId: tenant.id, roomId: bed.roomId, bedId: bed.id, startDate: joining, status: "ACTIVE", monthlyRent: rent, reason: "Initial import" },
          });
          residing++;
        } else {
          noRoom.push(row.name);
        }
        if (row.rent == null) noRent.push(row.name);
      }

      await tx.auditLog.create({
        data: { action: "INITIAL_DATA_IMPORT", entityType: "system", metadata: { tenants: data.tenants.length, residing } },
      });
      return { tenants: data.tenants.length, residing, noRoom, noRent };
    },
    { timeout: 120_000 },
  );

  console.log(`✓ Imported ${summary.tenants} tenants (${summary.residing} with a bed, ${summary.noRoom.length} unallocated).`);
  console.log(`  Unallocated: ${summary.noRoom.join(", ") || "none"}`);
  console.log(`  Monthly rent missing (${summary.noRent.length}): ${summary.noRent.join(", ")}`);
}

main()
  .catch((e) => {
    console.error("✗ Import failed — nothing was changed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
