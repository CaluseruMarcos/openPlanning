# Cloudflare Workers migration sketch

Status: **initial implementation** — the Worker API, D1 schema, UserHub Durable
Object, WebSocket protocol, and client adapter are implemented on this branch.
Deployment still requires real Cloudflare resources, secrets, and the production
checks listed below.

Branch: `cloudflare-migration` (created from `master` at `570f7da`). The design
sketch was committed first; implementation lives under `worker/` and in
`src/api/pocketbase.ts`. See [`worker/README.md`](../worker/README.md) for run and
deployment commands.

## 1. Decision summary

This document sketches a migration from the current PocketBase backend to:

- **Cloudflare Workers** for the HTTP API
- **D1** for durable relational data
- **Durable Objects** for realtime fan-out
- **R2** for uploads
- **Cloudflare Pages** for the Expo web build
- **Cron Triggers** for cleanup jobs

The reason to consider it: it is genuinely free at this project's scale, has no
cold-start server to wake, and scales without a VPS or a SQLite volume.

The cost: **it is a backend rewrite, not a hosting change**. PocketBase cannot
run on Workers. Cloudflare Containers could run PocketBase unchanged, but
Containers are not part of the Workers Free plan.

If the goal is to keep PocketBase and ship with minimal work, stay on the
Koyeb Free + Litestream + R2 setup. This document is the alternative for a
future rewrite.

## 2. Current backend surface

The current client talks to PocketBase through `src/api/pocketbase.ts` (969
lines). The UI imports the exported functions from that module, so the module is
the migration seam.

Collections and behaviour that must be replaced:

| Current collection | Purpose |
|---|---|
| `users` | email/password auth, display name |
| `conversations` | title, kind, creator, participants, last-message summary |
| `messages` | body, author, conversation, optional reply, edited timestamp |
| `message_reactions` | emoji reaction per message/user |
| `conversation_reads` | last-read message and timestamp per user/conversation |
| `typing_indicators` | ephemeral typing heartbeats (currently SQLite rows) |

Current hooks in `backend/pb_hooks/main.pb.js`:

- reject changing a message's conversation or author
- update the denormalised conversation summary after message create/update/delete
- delete typing heartbeats older than two minutes every two minutes

Current realtime behaviour uses PocketBase SSE for messages, conversations,
reactions, read positions, and typing indicators. The React Native build installs
`react-native-sse` as a polyfill in `src/api/pocketbase.ts`.

## 3. Free-tier envelope (checked October 2026)

| Product | Workers Free plan |
|---|---|
| Workers | 100,000 requests/day, 10 ms CPU per invocation, 128 MB memory |
| D1 | 5 GB per account, 500 MB per database, 5M rows read/day, 100k rows written/day, 7-day Time Travel |
| Durable Objects | SQLite-backed only, 100,000 requests/day, 13,000 GB-s/day, 5 GB storage |
| R2 | 10 GB storage, free egress |
| Pages | free static hosting/CDN |
| Cron Triggers | count as Worker requests |

Free-tier limits fail closed: once a daily limit is exceeded, further operations
fail until reset. That is good for an open-source demo because it cannot create a
surprise bill, but abuse can still make the app unavailable until midnight UTC.

`src/api/pocketbase.ts` currently uses `getFullList` for conversations and
messages. A Worker migration must paginate instead of copying that behaviour.

## 4. Target architecture

```text
Expo web ──────────────► Cloudflare Pages
                         (static Expo export)

Expo iOS/Android ──────┐
                       ├──► https://api.example.com
                       │         │
                       │    Worker API
                       │    ├─ /api/auth/*
                       │    ├─ /api/people
                       │    ├─ /api/conversations/*
                       │    ├─ /api/messages/*
                       │    ├─ /api/realtime/*
                       │    └─ /api/health
                       │         │
                       │    ┌────┴──────────────┐
                       │    │                   │
                       │   D1                UserHub DO
                       │   durable data      one per user;
                       │                     realtime fan-out
                       │
                       └──► R2 (future attachments)
```

### Why a UserHub Durable Object per user

The current client subscribes to five global streams: messages, conversations,
reactions, read positions, and typing. It expects events for conversations it
is not currently viewing, because the conversation list needs unread/preview
updates.

A Durable Object per conversation would therefore require either one socket per
conversation or a second inbox socket. A **UserHub per user** maps directly to
the current subscription model: one WebSocket per signed-in user, with event
types carrying the conversation ID.

Tradeoff: publishing an event to a group with N members costs N DO requests.
That is fine for a small open-source workspace. If groups become large, move
fan-out to Queues or a room-based fan-out design.

### WebSocket vs SSE

Use WebSocket for the realtime stream. Durable Objects support the WebSocket
Hibernation API, so an idle connection does not keep a DO running and does not
burn duration. SSE can be streamed from a Worker, but it does not have the same
hibernation story for this use case.

The client still initiates actions over HTTP. The WebSocket is primarily
server-to-client event delivery. This keeps authorization and durable writes in
one place.

## 5. D1 schema sketch

IDs are generated in the Worker with `crypto.randomUUID()` and stored as `TEXT`.
Timestamps are ISO-8601 UTC strings generated in the Worker. This keeps the API
shape close to the current `createdAtIso`, `lastReadAt`, and `lastSeenIso` fields.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('direct', 'team', 'group')),
  created_by TEXT NOT NULL REFERENCES users(id),
  last_message_id TEXT,
  last_message_preview TEXT NOT NULL DEFAULT '',
  last_message_at TEXT,
  last_message_author_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX conversations_recent_idx
  ON conversations(COALESCE(last_message_at, created_at) DESC);

CREATE TABLE conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_members_user_idx
  ON conversation_members(user_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  edited_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX messages_conversation_created_idx
  ON messages(conversation_id, created_at, id);

CREATE INDEX messages_author_idx ON messages(author_id);
CREATE INDEX messages_reply_to_idx ON messages(reply_to_id);

CREATE TABLE message_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX message_reactions_message_idx
  ON message_reactions(message_id);

CREATE TABLE conversation_reads (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_reads_user_idx
  ON conversation_reads(user_id);
```

Typing indicators are **not** stored in D1. The MVP fans out typing events with
an `expiresAt` timestamp and relies on the client's existing seven-second expiry;
the UserHub may optionally keep a short-lived in-memory map for a connect-time
snapshot, but it does not need durable storage. Either way, this avoids writing a
row every few seconds per typing user.

Optional future table for attachments:

```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX attachments_message_idx ON attachments(message_id);
```

### Authorization queries

There are no PocketBase collection rules in D1. Every route must resolve the
authenticated user from the session and check membership explicitly.

```sql
-- Can this user see this conversation?
SELECT 1
FROM conversation_members
WHERE conversation_id = ? AND user_id = ?;

-- Conversation list for one user
SELECT c.*
FROM conversations c
JOIN conversation_members m
  ON m.conversation_id = c.id
WHERE m.user_id = ?
ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
LIMIT ? OFFSET ?;

-- Messages for a conversation the user belongs to
SELECT m.*
FROM messages m
JOIN conversation_members cm
  ON cm.conversation_id = m.conversation_id
WHERE m.conversation_id = ? AND cm.user_id = ?
ORDER BY m.created_at ASC, m.id ASC
LIMIT ?;
```

Rules to preserve:

- A user can read a conversation only if they are a member.
- A user can create a message only as themselves; `author_id` comes from the
  session, never from the request body.
- A message's conversation and author cannot be changed by an update request.
- Only the author can edit or delete a message.
- A reaction belongs to the authenticated user; unique `(message, user, emoji)`.
- A user can upsert only their own read position.
- Conversation deletion is creator-only.
- `users` discovery returns only id and display name to authenticated users;
  email is returned only for the current user.

## 6. Worker routes

All routes are under `/api`. Authenticated routes require a bearer session token
for parity with the current client. A later hardening pass can move the web
client to HttpOnly cookies.

### Auth

| Method | Route | Body / result |
|---|---|---|
| POST | `/auth/signup` | `{ name, email, password }` → `{ token, user }` |
| POST | `/auth/signin` | `{ email, password }` → `{ token, user }` |
| POST | `/auth/signout` | revokes the current session → `204` |
| GET | `/auth/session` | current `{ user }`, used by `restoreSession` |
| POST | `/auth/refresh` | rotates the session token → `{ token, user }` |

Password storage: PBKDF2-SHA-256 via Web Crypto, per-user random salt, encoded in
a versioned string (for example `pbkdf2$sha256$<iterations>$<salt>$<hash>`).
Store only the encoded hash. Store only a SHA-256 hash of the session token in
D1.

Benchmark the PBKDF2 iteration count against the Workers Free 10 ms CPU limit.
If a secure iteration count does not fit, the options are Workers Paid or an
external auth service; do not fix the problem by using an insecure work factor.

### People and conversations

| Method | Route | Purpose |
|---|---|---|
| GET | `/people` | list other users as `Person` |
| GET | `/conversations` | paginated conversation summaries for the session user |
| POST | `/conversations` | create DM/group/team; creator is the session user |
| DELETE | `/conversations/:id` | creator-only delete |
| GET | `/conversations/:id/messages` | paginated messages with reactions and reply expansion |
| POST | `/conversations/:id/messages` | create message as session user |
| PATCH | `/messages/:id` | author-only body edit; sets `edited_at` |
| DELETE | `/messages/:id` | author-only delete |
| POST | `/messages/:id/reactions` | add reaction as session user |
| DELETE | `/reactions/:id` | remove own reaction |
| GET | `/conversations/:id/reads` | read receipts for members |
| PUT | `/conversations/:id/read` | upsert own read position |
| GET | `/search/messages?q=` | conversation IDs containing the query |
| POST | `/conversations/:id/typing` | typing heartbeat; fan-out only, no D1 write |
| DELETE | `/conversations/:id/typing` | clear own typing state |
| GET | `/health` | health check |

Pagination should use an explicit cursor or `before`/`limit`; do not reproduce
the current `getFullList` calls. A suggested first cut is 50 conversations and
50 messages per page, with the client loading older messages on demand.

For `PUT /conversations/:id/read`, the client sends `lastReadMessageId`. The
Worker fetches that message's `created_at` and stores it as `last_read_at`, so a
client cannot forge a future read timestamp.

### Scheduled cleanup

The hourly Cron Trigger should delete expired sessions:

```sql
DELETE FROM sessions WHERE expires_at < ?;
```

Add further jobs only when they are measurable (for example, pruning read rows
for deleted conversations or old attachments). Do not add a typing-cleanup cron;
typing is ephemeral and expires in the client.

### Realtime

| Method | Route | Purpose |
|---|---|---|
| POST | `/realtime/ticket` | short-lived signed WebSocket ticket for the session user |
| GET | `/realtime` | WebSocket upgrade, validated by ticket |

The ticket avoids putting the long-lived session token in a WebSocket query
string. The Worker verifies the ticket, upgrades the connection, and forwards the
request to the user's `UserHub` Durable Object. The DO only sees trusted
`X-User-Id` metadata from the Worker; it is not directly reachable from the
internet.

## 7. UserHub Durable Object protocol

One instance per user: `env.USER_HUB.get(env.USER_HUB.idFromName(userId))`.

### Worker → DO

`POST /publish` with a JSON event. The DO broadcasts the event to every connected
WebSocket for that user. It is an internal call from the Worker binding only.

Example events:

```json
{ "type": "message.created", "conversationId": "c1", "message": { "...": "..." } }
{ "type": "message.updated", "conversationId": "c1", "message": { "...": "..." } }
{ "type": "message.deleted", "conversationId": "c1", "messageId": "m1" }
{ "type": "conversation.updated", "conversation": { "...": "..." } }
{ "type": "conversation.deleted", "conversationId": "c1" }
{ "type": "reaction.added", "reaction": { "...": "..." } }
{ "type": "reaction.removed", "reactionId": "r1", "messageId": "m1" }
{ "type": "read.updated", "read": { "...": "..." } }
{ "type": "typing.updated", "conversationId": "c1", "userId": "u1", "expiresAt": "..." }
{ "type": "typing.stopped", "conversationId": "c1", "userId": "u1" }
```

### Server → client on connect

```json
{
  "type": "ready",
  "userId": "u1",
  "connectedAt": "2026-10-21T12:00:00.000Z"
}
```

No event replay is attempted. On reconnect the client refetches conversations,
messages, reads, and typing state through the HTTP API. This matches the current
client's best-effort realtime model and avoids storing an event log in the DO.

### Client → server

Keep the client-to-server protocol minimal:

```json
{ "type": "ping" }
```

The server replies `{"type":"pong"}`. Actions such as sending messages, reacting,
and marking reads stay on HTTP so that authorization and D1 writes have one
code path. Typing is also HTTP (`POST /conversations/:id/typing`) and is fanned
out by the Worker; it is not persisted.

If typing later moves onto the WebSocket, the protocol can add `typing.start`
and `typing.stop` frames without changing the event names delivered to the app.

### Hibernation

Use `ctx.acceptWebSocket(server)` so the DO can hibernate while sockets remain
open. Incoming publish requests or WebSocket messages wake it. This is the main
reason this architecture is friendlier to occasional use than an always-on
process.

### Fan-out

After a successful D1 write, the Worker resolves the conversation's member IDs
and publishes the event to each member's UserHub:

```ts
const members = await getConversationMemberIds(env.DB, conversationId);
await Promise.all(
  members.map((userId) =>
    env.USER_HUB.get(env.USER_HUB.idFromName(userId)).fetch(
      "https://user-hub.internal/publish",
      { method: "POST", body: JSON.stringify(event) },
    ),
  ),
);
```

For a small workspace this is fine. At larger group sizes, replace the inline
fan-out with a Queue consumer or a conversation-room fan-out design.

## 8. Client adapter plan

Keep `src/api/pocketbase.ts` as the compatibility seam for the first migration.
The file name can be renamed later; the UI should not need to change.

### Exports to preserve

Preserve the existing function signatures and the exported `POCKETBASE_URL`
name (as an alias for `API_URL`) so `src/AppShell.tsx` and the screens continue
to compile.

### Mapping

| Current export | New implementation |
|---|---|
| `restoreSession` | `GET /auth/session` |
| `signIn` | `POST /auth/signin` |
| `signUp` | `POST /auth/signup` |
| `signOut` | `POST /auth/signout`, clear store, close socket |
| `fetchConversations` | `GET /conversations` |
| `fetchPeople` | `GET /people` |
| `fetchMessages` | `GET /conversations/:id/messages` |
| `searchMessageConversations` | `GET /search/messages?q=` |
| `createMessage` | `POST /conversations/:id/messages` |
| `editMessage` | `PATCH /messages/:id` |
| `deleteMessage` | `DELETE /messages/:id` |
| `addReaction` | `POST /messages/:id/reactions` |
| `removeReaction` | `DELETE /reactions/:id` |
| `createDirectConversation` | `POST /conversations` with `kind: "direct"` |
| `removeConversation` | `DELETE /conversations/:id` |
| `fetchConversationReads` | `GET /conversations/:id/reads` |
| `markConversationRead` | `PUT /conversations/:id/read` |
| `fetchTypingIndicators` | return `[]` initially, or query a DO snapshot later |
| `heartbeatTyping` | `POST /conversations/:id/typing` |
| `clearTypingIndicator` | `DELETE /conversations/:id/typing` |
| `subscribeToMessages` | register a listener for `message.*` |
| `subscribeToConversations` | register a listener for `conversation.*` |
| `subscribeToReactions` | register a listener for `reaction.*` |
| `subscribeToConversationReads` | register a listener for `read.*` |
| `subscribeToTypingIndicators` | register a listener for `typing.*` |

`toPerson`, `toMessage`, `toConversation`, `toReaction`, `toConversationRead`,
`formatTimestamp`, `parsePocketBaseDate`, and `describeError` can largely stay.
The PB-specific record types and expand handling are replaced by API response
types.

### Realtime client

Implement one singleton `RealtimeClient` inside the adapter:

1. `connect()` calls `POST /realtime/ticket`, then opens the WebSocket.
2. Incoming JSON events are dispatched to registered listeners by event prefix.
3. `subscribeToX` registers a listener and returns an unsubscribe function.
4. Reconnect uses exponential backoff with jitter.
5. On reconnect, trigger a workspace refresh so missed events are recovered.
6. `close()` is called on sign-out and when the session expires.

The five existing subscription functions become thin wrappers over the singleton.
The hooks in `src/hooks/useWorkspace.ts` can keep their current event handlers,
with small changes to event field names if the API shapes differ.

### Auth storage

Keep the current platform split:

- native: `expo-secure-store`
- web: AsyncStorage/localStorage

Store the session token under the existing key, or a new `open-services-session`
key with a one-time migration path. `restoreSession` should validate the token
with `GET /auth/session`; a network failure should keep the local session, while
a 401 should clear it.

### Error handling

Map HTTP status codes in `describeError`:

- `401` → session expired, clear token and return to sign-in
- `403` → not allowed
- `404` → item no longer available
- `429` → too many requests, try again shortly
- network failure → cannot reach the API at `POCKETBASE_URL`

## 9. Wrangler configuration sketch

```toml
name = "open-services-api"
main = "src/index.ts"
compatibility_date = "2026-10-01"

[[d1_databases]]
binding = "DB"
database_name = "open-services"
database_id = "<d1-id>"

[[durable_objects.bindings]]
name = "USER_HUB"
class_name = "UserHub"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["UserHub"]

[[r2_buckets]]
binding = "FILES"
bucket_name = "open-services-files"

[triggers]
crons = ["17 * * * *"]
```

Secrets:

- `SESSION_SECRET` — session token signing/validation
- `TICKET_SECRET` — short-lived WebSocket ticket signing
- `APP_ORIGIN` — allowed web origin, for CORS
- `RESEND_API_KEY` — optional, only if password reset/verification is added

D1 schema changes should be managed with Wrangler D1 migrations, not applied
ad hoc in production.

## 10. Migration phases

### Phase 1 — Worker skeleton and auth

- Create D1 database, DO namespace, R2 bucket, Worker project.
- Add D1 migrations for users and sessions.
- Implement signup, signin, signout, session, refresh.
- Add integration tests for auth and session revocation.

### Phase 2 — Read APIs

- Implement `/people`, `/conversations`, `/conversations/:id/messages`,
  `/conversations/:id/reads`, and search.
- Add an authorization matrix test: member vs non-member, author vs other user,
  creator vs participant.
- Switch the client adapter's read functions to the Worker in a staging build.

### Phase 3 — Write APIs

- Implement conversation creation/deletion, message create/edit/delete, reaction
  add/remove, and read upserts.
- Preserve the message conversation/author immutability invariant.
- Update the conversation summary in the same request path as the message write.
  Use a D1 batch or explicit transaction where supported.

### Phase 4 — Realtime

- Add the `UserHub` DO and WebSocket ticket endpoint.
- Publish events after successful writes.
- Replace the SSE subscription functions in the adapter with the WebSocket
  listener.
- Add reconnect/refetch handling in `useWorkspace`.

### Phase 5 — Cutover

- Deploy the Worker on a separate `api-next` hostname first.
- Point a staging web build at it with `EXPO_PUBLIC_POCKETBASE_URL`.
- Run the full manual flows: signup, signin, create DM, send/edit/delete,
  reactions, read receipts, typing, reconnect, signout.
- Keep PocketBase and its data untouched for rollback.
- Cut the production web/native builds over by changing the env URL.
- Remove `pocketbase` and `react-native-sse` dependencies only after the new
  backend has been stable.

### Phase 6 — Cleanup

- Remove PocketBase-specific record types and expand logic from the adapter.
- Rename `src/api/pocketbase.ts` to `src/api/client.ts` if desired.
- Archive or delete `backend/` once no rollback path is needed.
- Add `docs/cloudflare-deployment.md` with the actual deployment runbook.

## 11. Data migration

If the prototype has no real users, start the D1 backend clean and seed demo data
through a staging-only script.

If real users exist, password migration is the hard part. PocketBase stores
bcrypt password hashes. Workers can verify bcrypt with a WASM implementation, but
this adds complexity. The simpler path is a forced password reset after cutover.
Do not export or copy password hashes without a clear migration plan.

Messages, conversations, reactions, and read positions can be exported from
PocketBase and imported into D1 with a one-off script, preserving IDs if the
client needs stable links. The current UI does not depend on PocketBase's
15-character ID format, so new UUIDs are acceptable for a fresh start.

## 12. Security checklist

- Derive the acting user from the session token; ignore client-supplied
  `authorId` and `userId` fields.
- Check conversation membership on every read and write.
- Enforce author-only edit/delete.
- Enforce creator-only conversation deletion.
- Hash session tokens at rest; never store raw bearer tokens in D1.
- Use a secure password work factor and per-user salt.
- Rate-limit signin, signup, and typing endpoints.
- Validate and cap message body length and reaction emoji values.
- Add CORS for the Pages origin only; native requests have no browser origin.
- Keep the admin surface out of the public Worker unless explicitly built.
- Do not run `seed.mjs` against production; it creates known demo passwords.
- Consider invite-only signup for a public open-source demo.
- Keep the D1 Time Travel window in mind; export a logical backup to R2 if the
  project needs longer retention.

## 13. Risks and open questions

- **10 ms CPU on Workers Free** may be too tight for password hashing or large
  JSON transforms. Benchmark before committing to the free plan.
- **D1 free database size is 500 MB.** Text chat is small, but uploads must go to
  R2 and old data should not be duplicated into D1.
- **100k D1 writes/day.** Keep typing and presence out of D1. Rate-limit noisy
  clients.
- **100k DO requests/day.** Fan-out to every member counts. Large groups need a
  different fan-out design.
- **No PocketBase admin dashboard.** Decide whether an admin UI is required
  before migrating.
- **WebSocket lifecycle.** Test browser backgrounding, mobile network changes,
  reconnect storms, and sign-out cleanup.
- **Vendor lock-in.** D1 and DO APIs are Cloudflare-specific. The client adapter
  is portable; the backend is not.
- **Auth migration.** Decide between bcrypt-compatible verification and forced
  password reset.
- **Attachments.** R2 is sketched but not designed in detail; signed upload and
  download URLs still need a plan.

## 14. Out of scope for this sketch

- Actual Worker/D1/DO implementation
- Attachment upload UI
- Email verification and password reset
- Admin dashboard
- Planning Center OAuth
- Multi-region or Queue-based fan-out
- Zero-downtime cutover

## 15. Recommendation

For the current goal — an occasionally used, open-source prototype with **$0**
hosting — the lowest-risk path is still:

**Koyeb Free web service + Litestream → Cloudflare R2 + Cloudflare Pages**

Do this migration only if one of these becomes true:

- the Koyeb cold start or free-tier limits become a real problem
- the project needs to scale beyond a single PocketBase node
- the maintenance cost of Litestream/restore is higher than the rewrite cost
- the project wants a fully edge-hosted, no-server architecture

If that happens, this document is the starting point for the rewrite.

## Implementation notes (current branch)

The first implementation is in place:

- `worker/migrations/0001_init.sql` — D1 schema from section 5.
- `worker/src/auth.ts` — PBKDF2 passwords, HMAC-hashed session tokens, signed
  short-lived WebSocket tickets.
- `worker/src/router.ts` — auth, people, conversation, message, reaction, read,
  typing, search, and ticket routes.
- `worker/src/db.ts` — membership-scoped queries and API serializers.
- `worker/src/realtime.ts` — `UserHub` Durable Object with WebSocket hibernation
  and fan-out.
- `worker/seed.mjs` — idempotent demo workspace for local development.
- `src/api/pocketbase.ts` — now an HTTP/WebSocket adapter; it preserves the
  existing exported function signatures and the `POCKETBASE_URL` alias.
- `src/hooks/useWorkspace.ts` — refetches conversations and the open thread after
  a realtime reconnect.

Verified locally with `wrangler dev`, D1 migrations, HTTP smoke tests, and
two WebSocket clients covering message, typing, read, reaction, edit, delete, and
conversation-delete fan-out. Both `npm run typecheck` and
`npm run typecheck:worker` pass, and the web bundle exports successfully.

Known gaps before calling the migration production-ready:

- The Workers Free 10 ms CPU limit may reject PBKDF2 password hashing. This has
  not been measured on a real Workers deployment. Do not lower the password work
  factor to fit; use Workers Paid or an external auth provider.
- No rate limiting, email verification, password reset, or admin dashboard.
- No PocketBase data import or password migration; the supported path is a fresh
  D1 database plus the seed script.
- Attachments are still a placeholder; the R2 binding is reserved but unused.
- The client caps pagination at 10 pages (1,000 messages/conversations).

## References

Checked October 2026:

- Workers pricing and limits: <https://developers.cloudflare.com/workers/platform/pricing/>
- D1 limits: <https://developers.cloudflare.com/d1/platform/limits/>
- Durable Objects pricing: <https://developers.cloudflare.com/durable-objects/platform/pricing/>
- Durable Objects limits: <https://developers.cloudflare.com/durable-objects/platform/limits/>
- Pages limits: <https://developers.cloudflare.com/pages/platform/limits/>
- R2 pricing: <https://developers.cloudflare.com/r2/pricing/>
- Containers pricing: <https://developers.cloudflare.com/containers/pricing/>
