# Genius Girls PG Management System

**A Product by [Karmatechlab](https://karmatechlab.com/)**

Smart PG & Hostel Management for Genius Girls PG — React + Express + Prisma + Supabase PostgreSQL.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, TypeScript, Vite, Tailwind, TanStack Query |
| Backend | Node.js, Express, TypeScript, Prisma |
| Database | PostgreSQL — local or Supabase (`genius_pg` schema) |
| Timezone | Asia/Kolkata |
| Currency | INR (₹) |

## Quick start (local PostgreSQL)

1. In `backend/.env`, replace `YOUR_PASSWORD` in `DATABASE_URL` and `DIRECT_URL` with your local `postgres` password.
2. Create the database, tables and base data (rooms, beds, accounts, users, menus) — safe to re-run:

```bash
cd backend
npm install
npm run db:setup
npm run dev
```

3. In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173 · API: http://localhost:5000
- In pgAdmin: Servers → PostgreSQL 18 → Databases → `genius_girls_pg` → Schemas → `genius_pg` → Tables.

## Daily flow

Register girl → allocate bed (now or later) → collect deposit → generate or manually enter rent → collect payment → transfer bed → record expenses → monthly dashboard.

- **Tenants** — "Register only" (Unallocated) or "Register & allocate bed"; row actions Allocate bed / Transfer room-bed; transfer history in the tenant drawer.
- **Monthly Rent** — Generate (bills only tenants who held a bed, prorated by allocation dates) and Manual rent entry (exact period, suggested prorated amount, override needs a reason + Edit right). Existing bills are never duplicated; use Adjust rent instead. Source column shows Auto / Manual.
- **Transfer / Swap bed** — one modal on Tenants, the tenant drawer and Rooms & Beds: move a student to an empty bed, or exchange two students' beds in a single transaction. Rent, invoices, payments and deposits are untouched unless a new rent is entered. History is in `bed_transfer_history` and the tenant's Bed history tab. Tests: `TEST_DATABASE_URL=postgresql://…/ggpg_test npm run test:bedops` (uses a throwaway database).
- **Expenditure** — daily PG expenses by category and paid-from account; entries are voided, never deleted. Super Admin manages categories.
- **Dashboard** — billing-month rent (expected / collected / pending), cash in the month (rent received − expenses = net operating cash) and security deposits held are kept separate.

After pulling changes, apply database migrations with `cd backend && npx prisma migrate deploy && npm run db:menus`.

## Initial users

| Username | Password | Role |
|----------|----------|------|
| `superadmin` | `Admin@123` | SUPER_ADMIN |
| `ommaster` | `om@123` | PG_OPERATOR |

Both accounts require a password change on first login.

## Documentation

See `docs/` for BRD, database design, API docs, permissions, setup, and deployment.

## Branding

Genius Girls PG is the product identity. Karmatechlab is the software provider ([karmatechlab.com](https://karmatechlab.com/)).
