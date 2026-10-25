# Supabase CLI Setup (Genius Girls PG / HMS)

## One-time

```bash
cd C:\Projects\GeniusGirlsPG
npm install --save-dev supabase
npx supabase init          # already done
npx supabase login         # opens browser / access token
npx supabase link --project-ref fqmzhcourqgtqbryxojl
```

Enter the database password when prompted (never commit it).

## Create a new migration

```bash
npx supabase migration new describe_your_change
# edit supabase/migrations/<timestamp>_describe_your_change.sql
```

## Apply to remote (after review)

```bash
npx supabase db push
```

Or with connection string from `backend/.env`:

```bash
npx supabase db push --db-url "%DATABASE_URL%"
```

## Verify in Supabase Dashboard

1. Table Editor → schema `genius_pg`  
2. Or SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'genius_pg'
ORDER BY table_name;
```

## Security

- Never put `DATABASE_URL`, service role key, or DB password in frontend env  
- Keep secrets in `backend/.env` only  
