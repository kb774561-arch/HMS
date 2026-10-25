# Local Setup

## Prerequisites

- Node.js 20+
- Access to existing Supabase project `fqmzhcourqgtqbryxojl`
- Database password (never commit)

## Steps

1. Create `backend/.env` from `backend/.env.example`.
2. Set `DATABASE_PASSWORD`, URL-encode it into `DATABASE_URL` and `DIRECT_URL`.
3. Generate a strong `JWT_SECRET`.
4. Create `frontend/.env` from `frontend/.env.example`.

```bash
cd C:\Projects\GeniusGirlsPG\backend
npm install
npm run db:test
npx prisma migrate deploy
npm run prisma:seed
npm run dev
```

```bash
cd C:\Projects\GeniusGirlsPG\frontend
npm install
npm run dev
```

- App: http://localhost:5173  
- API: http://localhost:5000  

## Initial logins

| User | Password | Role |
|------|----------|------|
| superadmin | Admin@123 | SUPER_ADMIN |
| ommaster | om@123 | PG_OPERATOR |

Both require password change on first login.

## Notes

- Do not run destructive Prisma reset against the shared Supabase database.
- If direct DB host is unreachable (IPv6/network), use Supabase Session Pooler credentials supplied by the project — do not invent pooler hosts.
