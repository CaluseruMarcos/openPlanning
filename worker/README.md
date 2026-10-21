# Cloudflare Worker backend

This directory contains the Worker API that the Expo app now targets:

- **Workers** for the HTTP API
- **D1** for users, sessions, conversations, messages, reactions, and reads
- **UserHub Durable Object** for one WebSocket per signed-in user
- **R2** binding reserved for attachments (not used by the UI yet)

The PocketBase setup under `backend/` is still in the repository as a reference
and rollback path. The client no longer imports the PocketBase SDK or the SSE
polyfill.

## Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | Worker entrypoint, CORS, cron |
| `src/router.ts` | Auth, conversation, message, reaction, read, typing, and realtime routes |
| `src/auth.ts` | PBKDF2 passwords, bearer sessions, signed WebSocket tickets |
| `src/db.ts` | D1 queries and API serializers |
| `src/realtime.ts` | `UserHub` Durable Object and fan-out |
| `migrations/0001_init.sql` | D1 schema |
| `seed.mjs` | Idempotent demo workspace seed |
| `.secrets.local` | Gitignored copy of the deployed secrets |

## Local development

```sh
# from the repository root
cp worker/.dev.vars.example worker/.dev.vars
# edit the two secrets; any long random strings are fine for local dev

npm run worker:migrate:local
npm run worker:dev
# Worker: http://127.0.0.1:8787
```

If port 8787 is already in use:

```sh
npx wrangler dev -c worker/wrangler.toml --port 8788
EXPO_PUBLIC_API_URL=http://127.0.0.1:8788 npm run web
```

Seed the demo accounts (in a second terminal):

```sh
npm run worker:seed
# or: WORKER_URL=http://127.0.0.1:8788/api node worker/seed.mjs
```

Demo accounts, password `openservices`:

- `marcos@example.com`
- `sarah@example.com`
- `michael@example.com`

Start the app:

```sh
EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 npm run web
```

`EXPO_PUBLIC_POCKETBASE_URL` is still accepted as a legacy alias, but new builds
should use `EXPO_PUBLIC_API_URL`. In development the app also derives the LAN
host from the Expo dev server, using port `8787`.

Type-check both projects:

```sh
npm run typecheck
npm run typecheck:worker
```

## What is implemented

- Email/password signup, signin, signout, session restore, and token refresh
- D1 schema and migrations with explicit membership checks on every route
- Conversation list/create/delete, direct-conversation reuse, participants
- Paginated messages with reactions and quoted-reply expansion
- Author-only message edit/delete and creator-only conversation delete
- Reaction add/remove with a unique `(message, user, emoji)` constraint
- Read receipts with server-derived timestamps
- Ephemeral typing fan-out with no D1 writes
- One WebSocket per user via `UserHub`; events for messages, conversations,
  reactions, reads, and typing
- Reconnect with backoff and a workspace refetch after reconnect
- Hourly cron deleting expired sessions

## Live deployment

The Worker is deployed and running:

| | |
|---|---|
| API URL | `https://open-services-api.snorlaxking310.workers.dev` |
| Health check | `https://open-services-api.snorlaxking310.workers.dev/api/health` |
| Account | `bb20afee367a6b13aaaa785df28ea574` (workers.dev subdomain `snorlaxking310`) |
| Worker name | `open-services-api` |
| D1 database | `open-services` — `806dc9ab-457f-4f6e-b58b-5673ade639a0` |
| Durable Object | `UserHub` (SQLite class, migration tag `v1`) |
| Cron | `17 * * * *` (deletes expired sessions) |

Point the app at it with:

```sh
EXPO_PUBLIC_API_URL=https://open-services-api.snorlaxking310.workers.dev npm run web
```

Demo accounts (password `openservices`): `marcos@example.com`,
`sarah@example.com`, `michael@example.com`. They are seeded in the production
D1 — change or delete them before this URL is shared publicly.

The current `SESSION_SECRET` / `TICKET_SECRET` are stored in the deployed
Worker and mirrored in the gitignored `worker/.secrets.local`. Rotating them
invalidates every session.

### Redeploying

`wrangler` needs a Cloudflare API token with *Workers Scripts: Edit*, *D1:
Edit*, and *Account Settings: Read*:

```sh
export CLOUDFLARE_API_TOKEN=...
npx wrangler secret put SESSION_SECRET -c worker/wrangler.toml
npx wrangler secret put TICKET_SECRET  -c worker/wrangler.toml
npm run worker:deploy
```

The schema is already applied remotely and recorded in the database's
`d1_migrations` table, so `wrangler d1 migrations apply DB --remote` is a no-op
until new migration files are added.

This first deployment was pushed through the Cloudflare API (script upload with
the D1/DO bindings, secrets and the `v1` Durable Object migration) because the
available Cloudflare OAuth credential is not accepted by `wrangler`. The
resulting Worker is identical to what `wrangler deploy` produces.

## Deployment sketch

1. Create the D1 database and put its ID in `wrangler.toml`:

   ```sh
   npx wrangler d1 create open-services
   ```

2. Set production secrets:

   ```sh
   npx wrangler secret put SESSION_SECRET -c worker/wrangler.toml
   npx wrangler secret put TICKET_SECRET -c worker/wrangler.toml
   ```

3. Change `APP_ORIGIN` in `wrangler.toml` to the deployed Pages origin. It is
   currently `*`, which allows any browser origin. Narrow it to the Pages
   origin once the web build is deployed.

4. Apply the schema and deploy:

   ```sh
   npx wrangler d1 migrations apply DB -c worker/wrangler.toml --remote
   npm run worker:deploy
   ```

5. Build the web app with the Worker URL:

   ```sh
   EXPO_PUBLIC_API_URL=https://open-services-api.snorlaxking310.workers.dev \
     npx expo export --platform web
   ```

6. Upload `dist/` to Cloudflare Pages. Native builds need the same
   `EXPO_PUBLIC_API_URL` at build time.

R2 is not bound yet: attachments are still a placeholder in the UI, so the
bucket would be dead weight. Add the `[[r2_buckets]]` block in `wrangler.toml`
and create the bucket when the upload endpoint is implemented.

## Security and free-tier notes

The full review, including the findings that are still open, is in
[`docs/security-review.md`](../docs/security-review.md). The behaviour that
matters for operating this Worker:

- `SESSION_SECRET` and `TICKET_SECRET` must be set and at least 32 characters
  long. There is no built-in default: a missing secret fails the request
  instead of falling back to a known key.
- Sign-in and sign-up are throttled per client address
  (`429` with `Retry-After`): 10 attempts per account and 50 per address per
  10 minutes for sign-in, 20 registrations per address per hour. Set
  `ALLOW_SIGNUP = "false"` to close registration entirely.
- Every response carries `Cache-Control: no-store`, `X-Content-Type-Options:
  nosniff`, `Strict-Transport-Security`, `Referrer-Policy` and
  `Content-Security-Policy: default-src 'none'`.
- Request bodies above 64 KB are rejected before they are parsed.
- The API is only served under `/api`.
- A realtime ticket is bound to the session that requested it and stops
  working when that session is signed out.

### Password hashing CPU

Passwords use PBKDF2-SHA-256 with 100,000 iterations. In a local Node benchmark
that takes roughly 40 ms, which is above the 10 ms CPU budget of the Workers
**Free** plan.

It works in practice: signup and signin on the deployed Free-plan Worker
return in roughly 0.2 s wall clock, so Web Crypto is evidently not billed
against the invocation CPU limit the way plain JavaScript is. Keep the
iteration count at 100,000 (or higher) — do not lower the work factor to fit a
limit that has not actually been hit.

The iteration count is configurable through `PBKDF2_ITERATIONS` for local
experiments.

### Other limits

- D1 Free: 5 GB/account, 500 MB/database, 5M reads/day, 100k writes/day.
- Durable Objects Free: 100k requests/day, 13,000 GB-s/day. Fan-out to a group of
  N members costs N DO calls per event.
- Workers Free: 100k requests/day, 10 ms CPU, 128 MB.
- Typing intentionally does not write to D1; it is fan-out only.
- Messages and conversations are paginated with a client cap of 10 pages
  (1,000 messages / 1,000 conversations) in this first cut.

### Not implemented yet

- A global rate limit. The in-Worker throttle is per isolate, so it slows
  scripted abuse but is not a quota. Use Cloudflare rate limiting rules (or a
  Durable Object limiter) in front of the Worker before public exposure.
- Email verification and password reset.
- Admin dashboard.
- Attachment upload/download through R2 (the bucket and binding are not created
  yet).
- PocketBase data import or bcrypt-compatible password migration. A fresh D1
  database plus `worker/seed.mjs` is the supported starting point.
- Single-use WebSocket tickets. Tickets are signed, bound to a session and
  expire after 60 seconds, but a stolen ticket can be replayed during that
  window.
- Full-text search. The message search scans a 90 day window instead of using
  D1 FTS5.
