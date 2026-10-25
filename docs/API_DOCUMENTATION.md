# API Documentation — Phase 1

Base URL: `http://localhost:5000/api`

All authenticated routes require `Authorization: Bearer <token>`.

## Health

`GET /health` — DB connectivity and `genius_pg` schema presence (no secrets).

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | No | `{ username, password }` → token + user |
| GET | `/auth/me` | Yes | Current user |
| POST | `/auth/change-password` | Yes | `{ currentPassword, newPassword }` |
| POST | `/auth/logout` | Yes | Revoke session |

## Navigation

`GET /navigation/my-menus` — nested menu tree filtered by effective VIEW permissions.

## Dashboard

`GET /dashboard/overview?month=&year=` — occupancy + rent/collection KPIs from DB.

## Administration (SUPER_ADMIN)

| Method | Path |
|--------|------|
| GET | `/menus` |
| GET | `/roles` |
| GET | `/users` |

## Response shape

```json
{ "success": true, "data": {} }
```

Errors:

```json
{ "success": false, "code": "UNAUTHORIZED", "message": "..." }
```

## Planned modules (Phases 2–5)

Rooms, beds, tenants, allocations, rent generate/collect, payments/receipts, deposits, charges, reports, Excel import — routes follow `/api/<module>` with repository → service → controller layering.
