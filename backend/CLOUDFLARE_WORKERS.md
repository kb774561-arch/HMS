# Cloudflare Workers — Genius Girls PG API

Worker name: `genius-girls-pg-api`  
Entry: `src/worker.ts`  
Config: `wrangler.jsonc`

## Cloudflare dashboard (Git)

| Setting | Value |
|---------|--------|
| Production branch | `Development` |
| Root directory | `backend` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

Do **not** configure this project as Cloudflare Pages / static assets.

## Secrets (Workers → Settings → Variables)

Set as **secrets** (never commit):

```text
DATABASE_URL
DIRECT_URL
JWT_SECRET
FRONTEND_URL
```

`FRONTEND_URL` must be your real frontend origin (CORS), e.g. `https://geniuspg.com`.

Optional non-secret vars already in `wrangler.jsonc`:

```text
NODE_ENV=production
APP_TIMEZONE=Asia/Kolkata
JWT_EXPIRES_IN=12h
CF_WORKER=1
```

CLI alternative:

```bash
cd backend
npx wrangler secret put DATABASE_URL
npx wrangler secret put DIRECT_URL
npx wrangler secret put JWT_SECRET
npx wrangler secret put FRONTEND_URL
```

## Local Worker test

```bash
cd backend
cp .dev.vars.example .dev.vars   # fill from .env
npm install
npm run build
npm run dev:worker
curl http://127.0.0.1:8787/api/health
```

## Custom domain

Preferred: `api.geniuspg.com` — add in Workers → Custom Domains only if the zone is on Cloudflare.

## Notes

- Prisma uses `engineType = "client"` + `@prisma/adapter-pg` (no Rust engine binaries).
- On Workers, each request gets its own Prisma/pg client (avoids cross-request hangs).
- Login rate limiting uses a Workers-safe Map limiter; Node still uses `express-rate-limit`.
