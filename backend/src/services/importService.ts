import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/errors.js";

type TenantRow = {
  TenantName?: string;
  tenantName?: string;
  MobileNumber?: string;
  WhatsAppNumber?: string;
  ParentName?: string;
  ParentNumber?: string;
  Email?: string;
  Address?: string;
  RoomNumber?: string;
  BedCode?: string;
  JoiningDate?: string | Date;
  MonthlyRent?: number | string;
  SecurityDeposit?: number | string;
  Notes?: string;
};

function pickName(row: TenantRow) {
  return (row.TenantName ?? row.tenantName ?? "").toString().trim();
}

function parseDate(value: string | Date | undefined): Date {
  if (!value) throw new AppError("JoiningDate is required", 400);
  if (value instanceof Date) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid date: ${value}`, 400);
  return d;
}

function validateAll(rows: TenantRow[]) {
  const errors: { row: number; message: string }[] = [];
  const valid: { row: number; data: Record<string, unknown> }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const name = pickName(row);
    if (!name) {
      errors.push({ row: i + 2, message: "TenantName is required" });
      continue;
    }
    try {
      const joiningDate = parseDate(row.JoiningDate);
      const monthlyRent = Number(row.MonthlyRent ?? 0);
      if (Number.isNaN(monthlyRent) || monthlyRent < 0) {
        errors.push({ row: i + 2, message: "MonthlyRent must be a number" });
        continue;
      }
      valid.push({
        row: i + 2,
        data: {
          tenantName: name,
          mobileNumber: row.MobileNumber?.toString() || null,
          whatsappNumber: row.WhatsAppNumber?.toString() || null,
          parentName: row.ParentName?.toString() || null,
          parentNumber: row.ParentNumber?.toString() || null,
          email: row.Email?.toString() || null,
          address: row.Address?.toString() || null,
          roomNumber: row.RoomNumber?.toString() || null,
          bedCode: row.BedCode?.toString() || null,
          joiningDate: joiningDate.toISOString().slice(0, 10),
          monthlyRent,
          securityDeposit: Number(row.SecurityDeposit ?? 0) || 0,
          notes: row.Notes?.toString() || null,
        },
      });
    } catch (e) {
      errors.push({ row: i + 2, message: e instanceof Error ? e.message : "Invalid row" });
    }
  }

  return { valid, errors, validCount: valid.length, errorCount: errors.length, totalRows: rows.length };
}

export const importService = {
  async previewTenants(rows: TenantRow[]) {
    const result = validateAll(rows);
    return {
      ...result,
      errors: result.errors.slice(0, 50),
      preview: result.valid.slice(0, 20).map((v) => v.data),
      mapping: [
        { excel: "TenantName", table: "tenants", column: "tenant_name" },
        { excel: "MobileNumber", table: "tenants", column: "mobile_number" },
        { excel: "WhatsAppNumber", table: "tenants", column: "whatsapp_number" },
        { excel: "RoomNumber", table: "rooms", column: "room_number" },
        { excel: "BedCode", table: "beds", column: "bed_code" },
        { excel: "JoiningDate", table: "tenants", column: "joining_date" },
        { excel: "MonthlyRent", table: "tenants", column: "monthly_rent" },
        { excel: "SecurityDeposit", table: "tenants", column: "security_deposit" },
      ],
    };
  },

  async importTenants(rows: TenantRow[], actorId?: string, confirm = false) {
    if (!confirm) throw new AppError("Import requires confirm=true", 400);

    const { valid, errors } = validateAll(rows);
    if (valid.length === 0) {
      throw new AppError("No valid rows to import", 400, "IMPORT_INVALID", errors);
    }

    const batch = await prisma.importBatch.create({
      data: {
        fileName: "excel-tenant-import",
        status: "IMPORTED",
        uploadedById: actorId,
        notes: `Importing ${valid.length} tenant rows`,
      },
    });

    let created = 0;
    let skipped = 0;
    const importErrors = [...errors];

    for (const item of valid) {
      const data = item.data;
      try {
        const existing = await prisma.tenant.findFirst({
          where: {
            tenantName: data.tenantName as string,
            deletedAt: null,
            status: { in: ["ACTIVE", "NOTICE"] },
          },
        });
        if (existing) {
          skipped++;
          importErrors.push({
            row: item.row,
            message: "Active tenant with same name exists — skipped",
          });
          continue;
        }

        let roomId: string | null = null;
        let bedId: string | null = null;
        if (data.roomNumber && data.bedCode) {
          const room = await prisma.room.findFirst({
            where: { roomNumber: data.roomNumber as string, deletedAt: null },
          });
          if (!room) {
            importErrors.push({ row: item.row, message: `Room not found: ${data.roomNumber}` });
            continue;
          }
          const bed = await prisma.bed.findFirst({
            where: { roomId: room.id, bedCode: data.bedCode as string, deletedAt: null },
          });
          if (!bed) {
            importErrors.push({ row: item.row, message: `Bed not found: ${data.bedCode}` });
            continue;
          }
          const occupied = await prisma.bedAllocation.findFirst({
            where: { bedId: bed.id, status: "ACTIVE" },
          });
          if (occupied) {
            importErrors.push({
              row: item.row,
              message: `Bed already occupied: ${data.roomNumber}/${data.bedCode}`,
            });
            continue;
          }
          roomId = room.id;
          bedId = bed.id;
        }

        await prisma.$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: {
              tenantName: data.tenantName as string,
              mobileNumber: (data.mobileNumber as string) || null,
              whatsappNumber: (data.whatsappNumber as string) || null,
              parentName: (data.parentName as string) || null,
              parentNumber: (data.parentNumber as string) || null,
              email: (data.email as string) || null,
              address: (data.address as string) || null,
              joiningDate: new Date(data.joiningDate as string),
              monthlyRent: data.monthlyRent as number,
              securityDeposit: data.securityDeposit as number,
              notes: (data.notes as string) || null,
              roomId,
              bedId,
              status: "ACTIVE",
            },
          });
          await tx.tenantRentHistory.create({
            data: {
              tenantId: tenant.id,
              monthlyRent: data.monthlyRent as number,
              effectiveFrom: new Date(data.joiningDate as string),
              reason: "Excel import",
            },
          });
          if (roomId && bedId) {
            await tx.bedAllocation.create({
              data: {
                tenantId: tenant.id,
                roomId,
                bedId,
                startDate: new Date(data.joiningDate as string),
                status: "ACTIVE",
                monthlyRent: data.monthlyRent as number,
                notes: "Excel import",
              },
            });
          }
          await tx.importRow.create({
            data: {
              batchId: batch.id,
              sheetName: "Tenants",
              rowNumber: item.row,
              rawData: data as Prisma.InputJsonValue,
              mappedData: data as Prisma.InputJsonValue,
              status: "IMPORTED",
            },
          });
        });
        created++;
      } catch (e) {
        skipped++;
        importErrors.push({
          row: item.row,
          message: e instanceof Error ? e.message : "Import failed",
        });
      }
    }

    for (const err of importErrors) {
      await prisma.importError.create({
        data: {
          batchId: batch.id,
          sheetName: "Tenants",
          rowNumber: err.row,
          message: err.message,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId,
        action: "EXCEL_IMPORT_TENANTS",
        entityType: "import_batch",
        entityId: batch.id,
        metadata: { created, skipped, errors: importErrors.length },
      },
    });

    return {
      batchId: batch.id,
      created,
      skipped,
      errorCount: importErrors.length,
      errors: importErrors.slice(0, 50),
    };
  },
};
