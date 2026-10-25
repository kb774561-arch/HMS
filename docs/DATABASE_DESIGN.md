# Database Design — Genius Girls PG

**Schema:** `genius_pg` (isolated application schema on existing Supabase PostgreSQL)  
**Provider:** Do not modify `auth`, `storage`, or other Supabase-managed schemas.  
**Money:** `NUMERIC(12,2)` / Prisma `Decimal`  
**Timezone:** Application uses Asia/Kolkata; store timestamps in UTC via PostgreSQL/`timestamptz` defaults.

## Connection

- Host: `db.fqmzhcourqgtqbryxojl.supabase.co`
- Port: `5432`
- Database: `postgres`
- User: `postgres`
- SSL: required
- Credentials: backend `.env` only (`DATABASE_URL`, `DIRECT_URL`)

## Domains

### Authentication & permissions
`roles`, `users`, `menus`, `role_permissions`, `user_permission_overrides`, `sessions`, `audit_logs`, `system_settings`

### Masters
`pg_properties`, `rooms`, `beds`, `collection_accounts`, `charge_types`

### Tenants & allocation
`tenants`, `tenant_contacts`, `bed_reservations`, `bed_allocations`, `tenant_rent_history`, `tenant_documents`

### Finance
`rent_invoices`, `rent_invoice_items`, `payments`, `payment_allocations`, `payment_receipts`, `payment_reversals`, `financial_adjustments`, `security_deposit_transactions`, `additional_charges`, `receipt_sequences`

### Import
`import_batches`, `import_rows`, `import_errors`

## Integrity rules

| Rule | Implementation |
|------|----------------|
| Unique username | `users.username` unique |
| Unique invoice per tenant/period | `(tenant_id, billing_month, billing_year)` |
| Unique receipt numbers | `payment_receipts.receipt_number` |
| Payment idempotency | `payments.idempotency_key` unique |
| One active allocation per bed | Partial unique index on `bed_allocations(bed_id) WHERE status = 'ACTIVE'` |
| Soft delete | `deleted_at` on users, rooms, beds, tenants |

## Seeded capacity

Rooms 1–12 with capacities `7,4,5,2,5,5,3,5,6,2,5,5` → **54 beds**.  
Tenant identities are **not** fabricated; occupancy KPIs use live allocations only.
