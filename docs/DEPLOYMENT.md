# Deployment Preparation

## Frontend (Vercel)

- Build: `cd frontend && npm run build`
- Output: `frontend/dist`
- Env: `VITE_API_URL` pointing to production API (never include DB password)

## Backend

Long-running Express is ideal on a Node host (Railway, Render, Fly, VPS).  
For Vercel serverless, wrap handlers or migrate to an adapter — do not assume Express `listen` works unchanged on Vercel.

Required env:

- `DATABASE_URL` (pooler for serverless)
- `DIRECT_URL` (migrations / session)
- `JWT_SECRET`
- `FRONTEND_URL`
- `APP_TIMEZONE=Asia/Kolkata`

## Database

- Existing Supabase project only
- Apply migrations with `prisma migrate deploy`
- Backup before production migrations
- Health check: `GET /api/health`

## Security

- SSL required
- CORS limited to frontend origin
- No privileged Supabase keys in frontend
