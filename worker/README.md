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

## Deployment sketch

1. Create the D1 database and put its ID in `wrangler.toml`:

   ```sh
   npx wrangler d1 create open-services
   ```

2. Create the R2 bucket, or remove the `[[r2_buckets]]` block until attachments
   are implemented:

   ```sh
   npx wrangler r2 bucket create open-services-files
   ```

3. Set production secrets:

   ```sh
   npx wrangler secret put SESSION_SECRET -c worker/wrangler.toml
   npx wrangler secret put TICKET_SECRET -c worker/wrangler.toml
   ```

4. Change `APP_ORIGIN` in `wrangler.toml` to the deployed Pages origin, and set
   `ENVIRONMENT = "production"`.

5. Apply the schema and deploy:

   ```sh
   npx wrangler d1 migrations apply DB -c worker/wrangler.toml --remote
   npm run worker:deploy
   ```

6. Build the web app with the Worker URL:

   ```sh
   EXPO_PUBLIC_API_URL=https://open-services-api.<subdomain>.workers.dev \
     npx expo export --platform web
   ```

7. Upload `dist/` to Cloudflare Pages. Native builds need the same
   `EXPO_PUBLIC_API_URL` at build time.

## Security and free-tier notes

### Password hashing CPU

Passwords use PBKDF2-SHA-256 with 100,000 iterations. In a local Node benchmark
that takes roughly 40 ms; the Workers **Free** plan has a 10 ms CPU limit per
invocation. Web Crypto may be metered differently in Workers, but this has not
been verified on a real deployment.

If it exceeds the free CPU limit, do not lower the work factor to an insecure
value. The practical options are:

- Workers Paid, or
- an external auth provider, or
- a different authentication flow that does not derive passwords in the Worker.

The iteration count is configurable through `PBKDF2_ITERATIONS` for local
experiments. Treat 100,000 as the minimum for this implementation, not a
production recommendation.

### Other limits

- D1 Free: 5 GB/account, 500 MB/database, 5M reads/day, 100k writes/day.
- Durable Objects Free: 100k requests/day, 13,000 GB-s/day. Fan-out to a group of
  N members costs N DO calls per event.
- Workers Free: 100k requests/day, 10 ms CPU, 128 MB.
- Typing intentionally does not write to D1; it is fan-out only.
- Messages and conversations are paginated with a client cap of 10 pages
  (1,000 messages / 1,000 conversations) in this first cut.

### Not implemented yet

- Rate limiting for signin/signup/typing. Add Cloudflare rate limiting or a
  small limiter before public exposure.
- Email verification and password reset.
- Admin dashboard.
- Attachment upload/download through R2.
- PocketBase data import or bcrypt-compatible password migration. A fresh D1
  database plus `worker/seed.mjs` is the supported starting point.
- Single-use WebSocket tickets. Tickets are signed and expire after 60 seconds,
  but a stolen ticket can be replayed during that window.
