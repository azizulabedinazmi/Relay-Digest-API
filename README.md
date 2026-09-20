[![DevConnect](https://devconnectplatform.com/api/badge/azizulabedin)](https://devconnectplatform.com/u/azizulabedin?ref=badge)

# relay/digest

Relay/digest is a Vercel-ready service for queueing CSV imports. `POST /api/imports` validates the caller, stores the payload, and returns `202 Accepted` without doing the slow work. Vercel Cron calls the worker later at `/api/cron/process`.

## Run locally

Requirements: Node.js 20+ and PostgreSQL.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set `DATABASE_URL`, `AUTH_TOKEN`, and `CRON_SECRET` in `.env.local`. The schema is created on the first API request. No secret is stored in this repository.

## API

All import routes require `Authorization: Bearer <AUTH_TOKEN>`. Missing or invalid credentials return `401` with a `WWW-Authenticate` header. Import reads always include the authenticated `account_id`, so one account cannot read another account's rows.

```bash
curl -X POST http://localhost:3000/api/imports \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"idempotencyKey":"nightly-2026-09-20","csvText":"email,name\nada@example.com,Ada"}'
```

The idempotency key is unique per account. Retrying the same request returns the original import instead of creating a second job. The worker inserts digest rows with a unique `(import_id, email)` constraint, so running it twice produces the same outcome.

## Worker failure behavior

The worker claims one queued import inside a transaction and records `attempts`, `locked_at`, `status`, and `last_error`. If it fails, the import becomes `failed` and the error is visible through `GET /api/imports` and the dashboard; nobody has to infer what happened. If the worker dies after claiming but before completion, the five-minute lease expires. The next worker run returns that job to `queued` and tries again. Duplicate rows are ignored by the database constraint, so a retry is safe.

## Deploy to Vercel

1. Push this repository to GitHub and import it into Vercel.
2. Add a hosted PostgreSQL `DATABASE_URL` plus random values for `AUTH_TOKEN` and `CRON_SECRET` as Vercel environment variables. Never commit them.
3. Deploy. `vercel.json` schedules the nightly worker at 02:00 UTC. Vercel Cron sends `CRON_SECRET` as a Bearer token when configured.
4. The public URL is the deployment URL shown by Vercel. Link it back to this repository in the Vercel project settings.

Test the protected route after deployment:

```bash
curl -i https://YOUR-APP.vercel.app/api/imports
```

Expected result: `401 Unauthorized`.

## Scripts

`npm run dev` starts development, `npm run lint` checks the source, and `npm run build` verifies the production bundle.
