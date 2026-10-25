# Business Requirements — Genius Girls PG

**Product:** Genius Girls PG Management System  
**Provider:** Karmatechlab (https://karmatechlab.com/)  
**Category:** PG / Hostel / Accommodation Management  

## Goals

Operate a real working system on Supabase PostgreSQL for:

- Authentication, dynamic menus, RBAC
- Tenant, room, and bed management
- Monthly rent, payments, receipts, deposits, additional charges
- Multi-account collections and reporting
- WhatsApp deep links (no auto-send without approved integration)
- Excel historical import (when workbook is provided)

## Non-goals (Phase 1)

- Fabricating historical tenant identities
- Automatic WhatsApp message sending
- Creating a new Supabase project

## Success criteria (Phase 1)

- Supabase connection verified
- `genius_pg` schema migrated and seeded
- SuperAdmin and Operator login with forced password change
- Dynamic sidebar from permissions
- Live dashboard KPIs from database
- Karmatechlab branding on login, sidebar, footer, About pages
