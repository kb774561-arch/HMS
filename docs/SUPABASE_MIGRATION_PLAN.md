# Supabase CLI Migration Plan — APPROVAL REQUIRED

**Project:** HMS / Genius Girls PG  
**Supabase Project ID:** `fqmzhcourqgtqbryxojl`  
**Region:** Singapore  
**Database:** `postgres`  
**App schema:** `genius_pg`  
**Status:** Plan ready — **NOT applied** until you approve  

---

## Analysis summary

| Area | Finding |
|------|---------|
| App location | `C:\Projects\GeniusGirlsPG` |
| Existing ORM migrations | Prisma in `backend/prisma/migrations` (already applied) |
| Live remote tables | **32** tables in `genius_pg` + `public._prisma_migrations` |
| Supabase-managed schemas | `auth`, `storage`, `realtime`, etc. — **untouched** |
| Seed data | Already present via Prisma seed (`SUPER_ADMIN`, `PG_OPERATOR`, menus, rooms/beds, accounts) |

### Module → table mapping

| Product module | Database object |
|----------------|-----------------|
| Student / Tenant Master | `genius_pg.tenants` (+ contacts, documents, rent history) |
| Room Master | `genius_pg.rooms` |
| Bed Master | `genius_pg.beds` |
| Bed Booking | `genius_pg.bed_allocations`, `bed_reservations` |
| Monthly Rent | `genius_pg.rent_invoices`, `rent_invoice_items` |
| Rent Collection / Payments | `genius_pg.payments`, `payment_allocations` |
| Payment History | `genius_pg.payments` |
| Receipt Management | `genius_pg.payment_receipts`, `receipt_sequences` |
| Owner / Collection Account Master | `genius_pg.collection_accounts` |
| User Master | `genius_pg.users` |
| Role Master | `genius_pg.roles` |
| Menu Master | `genius_pg.menus` |
| Role-wise Menu Permissions | `genius_pg.role_permissions` |
| User-wise overrides | `genius_pg.user_permission_overrides` |

---

## What was configured locally

1. Installed `supabase` CLI (`npm install --save-dev supabase`) — v2.121.0  
2. Ran `npx supabase init` → created `supabase/config.toml`  
3. Created migration:  
   `supabase/migrations/20261022170032_genius_pg_baseline.sql`  
4. Migration is **idempotent** (`IF NOT EXISTS` / exception handlers)  
5. **No DROP / TRUNCATE** statements  

### Blocked without your credentials UI

```text
npx supabase link --project-ref fqmzhcourqgtqbryxojl
```

Requires `npx supabase login` **or** `SUPABASE_ACCESS_TOKEN`.  
Database password alone is not enough for `link`.

After you log in once, link can be completed, then:

```bash
npx supabase db push
```

Alternatively (after approval), apply with DB URL without dashboard link:

```bash
npx supabase db push --db-url "$DATABASE_URL"
```

---

## Expected result of applying this baseline

Because the schema **already exists** on the remote DB (via Prisma):

| Object type | Expected action |
|-------------|-----------------|
| Schema `genius_pg` | Skipped (exists) |
| Enums | Skipped (exists) |
| Tables (32) | Skipped (exists) |
| Indexes | Skipped (exists) |
| Foreign keys | Skipped (exists) |
| Data / seed rows | **Unchanged** |
| `auth` / `storage` | **Not modified** |

Purpose of this migration: bring **version-controlled Supabase CLI history** in sync with the live DB so future schema changes go through `supabase/migrations`.

---

## Seed note

Initial roles/menus/users/rooms are managed by:

```bash
cd backend && npm run prisma:seed
```

Do **not** re-seed blindly in production — seed upserts roles/users/menus but should not wipe financial data.

---

## Dual migration track

| Track | Path | Use |
|-------|------|-----|
| Prisma | `backend/prisma/migrations` | App ORM generate/client |
| Supabase CLI | `supabase/migrations` | Dashboard-aligned version control / `db push` |

Going forward, prefer one source of truth for new changes (recommend: write SQL in `supabase/migrations`, then regenerate Prisma schema with `prisma db pull` if needed).

---

## Approval checklist

Reply **YES — apply Supabase migration** to proceed with:

1. `npx supabase db push --db-url <from backend/.env>`  
2. Verify table count / FKs  
3. Write final migration report  

Or reply with changes you want before apply.
