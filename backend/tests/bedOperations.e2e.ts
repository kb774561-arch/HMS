/**
 * Bed transfer & swap tests against a DISPOSABLE database.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:<pw>@localhost:5432/ggpg_test npm run test:bedops
 *
 * The script creates the database, migrates and seeds it, runs the checks, then drops it.
 * It refuses to run against a database whose name doesn't contain "test".
 */
import { execSync } from "child_process";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  console.error("Set TEST_DATABASE_URL to a database whose name contains 'test'. Refusing to touch real data.");
  process.exit(1);
}
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
delete process.env.SUPABASE_DATABASE_URL;

const dbName = new URL(url).pathname.slice(1);
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";

const { PrismaClient } = await import("@prisma/client");
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
execSync("npx prisma migrate deploy", { stdio: "ignore", env });
execSync("npx tsx prisma/seed.ts", { stdio: "ignore", env });

const { prisma } = await import("../src/config/database.js");
const { tenantService } = await import("../src/services/tenantService.js");
const { bedOperationService } = await import("../src/services/bedOperationService.js");
const { rentService } = await import("../src/services/rentService.js");
const { paymentService } = await import("../src/services/paymentService.js");
const { depositService } = await import("../src/services/depositService.js");
const { roomService } = await import("../src/services/roomService.js");

let pass = 0;
let fail = 0;
const ok = (cond: boolean, name: string, detail?: unknown) => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, field: string) => {
  try {
    await fn();
    return false;
  } catch (e) {
    const fe = (e as { details?: { fieldErrors?: Record<string, string> } }).details?.fieldErrors ?? {};
    return field in fe;
  }
};

try {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [y, m] = today.split("-").map(Number) as [number, number];
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const { rooms } = await roomService.summary();
  const bed = (room: number, code: string) => {
    const r = rooms.find((x) => x.roomNumber === `Room ${room}`)!;
    return { roomId: r.id, bedId: r.beds.find((b) => b.bedCode === code)!.id };
  };
  const register = (name: string, room: number, code: string) =>
    tenantService.create({ tenantName: name, joiningDate: monthStart, monthlyRent: 8000, ...bed(room, code) });
  const where = async (id: string) => {
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id }, include: { room: true, bed: true } });
    return `${t.room?.roomNumber}/${t.bed?.bedCode}`;
  };
  const occupied = async () => (await roomService.summary()).totals.occupied;

  const asha = await register("Test Asha", 1, "B3");
  const bina = await register("Test Bina", 5, "B2");
  const chitra = await register("Test Chitra", 1, "B4");
  const diya = await register("Test Diya", 2, "B1");

  // Money records that must stay untouched by bed moves.
  await rentService.generate(m, y);
  const account = await prisma.collectionAccount.findFirstOrThrow();
  await paymentService.create({ tenantId: asha.id, paymentDate: today, amountReceived: 3000, paymentMethod: "CASH", collectionAccountId: account.id });
  await depositService.collect({ tenantId: asha.id, amount: 5000, txnDate: today, collectionAccountId: account.id, paymentMethod: "CASH" });
  const snapshot = async () =>
    JSON.stringify(
      await Promise.all([
        prisma.rentInvoice.findMany({ orderBy: { id: "asc" }, select: { id: true, totalPayable: true, paidAmount: true, pendingAmount: true, baseRent: true } }),
        prisma.payment.findMany({ orderBy: { id: "asc" }, select: { id: true, amountReceived: true, allocatedAmount: true } }),
        prisma.paymentReceipt.findMany({ orderBy: { id: "asc" }, select: { id: true, receiptNumber: true } }),
        prisma.securityDepositTransaction.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true } }),
      ]),
    );
  const moneyBefore = await snapshot();
  const occ0 = await occupied();

  // 1. Transfer within the same room
  await bedOperationService.transfer({ tenantId: asha.id, toBedId: bed(1, "B5").bedId, effectiveDate: today });
  const b3 = await prisma.bedAllocation.count({ where: { bedId: bed(1, "B3").bedId, status: "ACTIVE" } });
  ok((await where(asha.id)) === "Room 1/B5" && b3 === 0, "1. Transfer to empty bed in same room; old bed becomes available");

  // 2. Transfer to another room
  await bedOperationService.transfer({ tenantId: asha.id, toBedId: bed(5, "B1").bedId, effectiveDate: today, reason: "test" });
  ok((await where(asha.id)) === "Room 5/B1", "2. Transfer to empty bed in another room");
  ok((await occupied()) === occ0, "9. Occupancy total unchanged after transfers (one bed freed, one taken)");

  // 3. Swap within the same room (Asha 5/B1 ↔ Bina 5/B2)
  await bedOperationService.swap({ tenantAId: asha.id, tenantBId: bina.id, effectiveDate: today });
  ok((await where(asha.id)) === "Room 5/B2" && (await where(bina.id)) === "Room 5/B1", "3. Swap two students in the same room");

  // 4. Swap across rooms (Asha 5/B2 ↔ Chitra 1/B4)
  const occBeforeSwap = await occupied();
  await bedOperationService.swap({ tenantAId: asha.id, tenantBId: chitra.id, effectiveDate: today, reason: "friends" });
  ok((await where(asha.id)) === "Room 1/B4" && (await where(chitra.id)) === "Room 5/B2", "4. Swap two students in different rooms");
  ok((await occupied()) === occBeforeSwap, "10. Occupancy unchanged after swap");

  // 5. Same student twice
  ok(await rejects(() => bedOperationService.swap({ tenantAId: diya.id, tenantBId: diya.id, effectiveDate: today }), "tenantBId"), "5. Rejects the same student twice");

  // 6. Unavailable bed (occupied by Neha)
  ok(await rejects(() => bedOperationService.transfer({ tenantId: bina.id, toBedId: bed(2, "B1").bedId, effectiveDate: today }), "toBedId"), "6. Rejects transfer to an occupied bed");

  // 7. Reservation conflict
  await prisma.bedReservation.create({ data: { roomId: bed(3, "B1").roomId, bedId: bed(3, "B1").bedId, fromDate: new Date(`${today}T00:00:00Z`), notes: "held" } });
  ok(await rejects(() => bedOperationService.transfer({ tenantId: bina.id, toBedId: bed(3, "B1").bedId, effectiveDate: today }), "toBedId"), "7. Rejects transfer to a reserved bed");
  const available = await bedOperationService.available(today, bina.id);
  ok(!available.some((b) => b.id === bed(3, "B1").bedId), "7b. Reserved bed is not offered as available");

  // 8. History intact
  const allocs = await prisma.bedAllocation.findMany({ where: { tenantId: asha.id } });
  const history = await bedOperationService.history(asha.id);
  ok(allocs.length === 5 && allocs.filter((a) => a.status === "ACTIVE").length === 1, "8. All previous allocations kept, exactly one active", allocs.map((a) => a.status));
  ok(history.length === 4 && history.filter((h) => h.operationType === "SWAP").length === 2 && history[0]!.otherStudent === "Test Chitra", "8b. Bed history lists transfers and swaps with the other student");

  // 11-12. Money untouched
  ok((await snapshot()) === moneyBefore, "11-12. Invoices, payments, receipts and deposits unchanged");

  // 13. Rollback — force a failure on the final history insert after allocations were written.
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION genius_pg.fail_test() RETURNS trigger AS $$
    BEGIN IF NEW.reason = 'FAIL_TEST' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_test BEFORE INSERT ON genius_pg.bed_transfer_history FOR EACH ROW EXECUTE FUNCTION genius_pg.fail_test()`);
  const beforeRollback = [await where(asha.id), await where(diya.id), await prisma.bedAllocation.count()];
  await bedOperationService.swap({ tenantAId: asha.id, tenantBId: diya.id, effectiveDate: today, reason: "FAIL_TEST" }).catch(() => undefined);
  const afterRollback = [await where(asha.id), await where(diya.id), await prisma.bedAllocation.count()];
  ok(JSON.stringify(beforeRollback) === JSON.stringify(afterRollback), "13. Failed swap rolls back both students completely", { beforeRollback, afterRollback });
  await prisma.$executeRawUnsafe(`DROP TRIGGER fail_test ON genius_pg.bed_transfer_history`);

  // 14. Concurrency — two students race for the same empty bed.
  const target = bed(4, "B1").bedId;
  const results = await Promise.allSettled([
    bedOperationService.transfer({ tenantId: bina.id, toBedId: target, effectiveDate: today }),
    bedOperationService.transfer({ tenantId: diya.id, toBedId: target, effectiveDate: today }),
  ]);
  const activeOnTarget = await prisma.bedAllocation.count({ where: { bedId: target, status: "ACTIVE" } });
  const binaBeds = await prisma.bedAllocation.count({ where: { tenantId: bina.id, status: "ACTIVE" } });
  const diyaBeds = await prisma.bedAllocation.count({ where: { tenantId: diya.id, status: "ACTIVE" } });
  ok(
    results.filter((r) => r.status === "fulfilled").length === 1 && activeOnTarget === 1 && binaBeds === 1 && diyaBeds === 1,
    "14. Concurrent transfers to one bed: one wins, loser keeps her original bed",
    { results: results.map((r) => r.status), activeOnTarget, binaBeds, diyaBeds },
  );
} catch (e) {
  fail++;
  console.error("ERROR", e);
} finally {
  await prisma.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
