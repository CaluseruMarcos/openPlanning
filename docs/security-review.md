# Security review — Open Services

Date: 2026-10-21. Scope: the Cloudflare Worker backend in `worker/` and the
Expo client in `src/`, plus the live deployment at
`https://open-services-api.snorlaxking310.workers.dev`.

Method:

- **Static review** of every file in `worker/src/` and `src/`, route by route,
  with every query and every client-side trust boundary traced.
- **Active testing** against the deployed Worker: 69 automated checks covering
  authentication, BOLA/IDOR, data exposure, injection, input validation,
  response headers, CORS, abuse limits and WebSocket authorization, plus raw
  TLS WebSocket handshakes to read the real status codes.
- **Data inspection** of the production D1 to confirm how credentials are
  stored.

Status legend: **Fixed** (changed and verified), **Partial** (first layer
added, deeper fix open), **Open** (needs a decision or a bigger change),
**Accepted** (known and deliberate).

## Verified correct

- **No BOLA/IDOR.** Every conversation-scoped route checks membership; every
  message route checks membership *and* authorship. Non-members receive `404`,
  so there is no cross-conversation existence oracle. The same holds for
  replies, read receipts, reactions and typing.
- **All SQL is parameterized.** The only dynamic fragments are generated `?`
  placeholders. Injection payloads in search, message bodies, titles and
  reactions are stored verbatim as data.
- **Credentials are never stored in the clear.** Passwords are
  `pbkdf2$sha256$100000$…` with a 16-byte random salt; session tokens are
  32 CSPRNG bytes stored only as an HMAC-SHA-256 digest. Verified in the
  production D1.
- **Constant-time comparisons** for password digests and ticket signatures.
- **Sign-in does not leak account existence**: identical response for an
  unknown email and a wrong password, including the same derivation work.
- **No route returns another user's email address.** `/api/people` returns
  `id` and `name` only.
- **Realtime isolation holds**: a socket for a non-member receives no events
  for conversations it is not part of.
- **The client has no XSS sink** and renders every server-provided string as a
  text node. It also never logs anything.
- **Authorization is server-side.** The client never sends an author id, a
  user id or a read timestamp; the server derives them.

## Fixed in this round

| # | Finding | Severity | Change |
|---|---|---|---|
| 1 | Session token was not bound to the API origin. A build pointed at another host silently handed that host the stored 30-day token. | Critical | The stored session records its origin and is discarded on mismatch. Release builds refuse to talk to a non-`https` API. The WebSocket origin is parsed from the URL instead of a regex swap. (`src/api/pocketbase.ts`) |
| 2 | A malformed WebSocket ticket raised an unhandled exception and answered `500` instead of `401`. | Medium | The signature is decoded defensively; every malformed ticket is a `401`. (`worker/src/auth.ts`) |
| 3 | A ticket survived a sign-out for its full 60 second window. | Medium | The ticket is bound to the session id and is rejected once that session is gone. (`worker/src/auth.ts`, `worker/src/router.ts`) |
| 4 | The development fallback secret was a public constant, so a misconfigured environment would have allowed forging session hashes and realtime tickets. | High | Secrets always fail closed, must be at least 32 characters, and have no built-in default. (`worker/src/auth.ts`) |
| 5 | Responses carried no `Cache-Control` and no security headers. | Medium | `no-store`, `nosniff`, `Strict-Transport-Security`, `Referrer-Policy` and `Content-Security-Policy: default-src 'none'` on every response. (`worker/src/http.ts`) |
| 6 | Any request body size was accepted and parsed. | Medium | Bodies above 64 KB are rejected with `413` before parsing. (`worker/src/http.ts`) |
| 7 | `listConversations` bound up to 101 parameters, above D1's limit of 100, so a user with 101+ conversations got a `500`. | Medium | The participant lookup is chunked. Verified with 105 conversations. (`worker/src/db.ts`) |
| 8 | `pageLimit` returned 1 instead of the intended page size, because `Number(null)` is `0`. | Medium | The default is applied when the parameter is absent. (`worker/src/router.ts`) |
| 9 | The API was also served at the root (`/conversations`), duplicating the attack surface. | Low | Only `/api/*` is served. (`worker/src/router.ts`) |
| 10 | A message and the conversation summary were written in two separate statements, so a failure in between left a stale preview. | Medium | Both are written in one transactional batch. (`worker/src/router.ts`) |
| 11 | Reaction emoji accepted any 16 character string, which is broadcast to every member. | Medium | The value must contain a pictographic character and no control characters. (`worker/src/router.ts`) |
| 12 | The Durable Object broadcast whatever it was handed and accepted unlimited parallel sockets per user. | Medium | Only known event types are forwarded, and a user keeps at most 5 sockets. (`worker/src/realtime.ts`) |
| 13 | Signup answered faster for an existing email than for an unknown one. | Medium | The password is derived before the lookup, so both take the same time. (`worker/src/router.ts`) |
| 14 | Demo credentials were shown in the sign-in screen of release builds. | High | The card is now development-only. (`src/screens/SignInScreen.tsx`) |
| 15 | A `401` cleared the token but left the signed-in UI in place, so the app was stuck. | Medium | The API layer notifies the shell, which returns to the sign-in screen. (`src/api/pocketbase.ts`, `src/AppShell.tsx`) |
| 16 | The client never rotated its session token. | Medium | The session is rotated on every start via the existing `/api/auth/refresh`. (`src/api/pocketbase.ts`) |
| 17 | Read positions, mute lists and the user id survived a sign-out in plain storage. | Medium | The signed-out user's entries are removed. (`src/storage/preferencesStore.ts`) |
| 18 | A failed storage removal was swallowed, so a token could survive a sign-out. | Medium | The failure is no longer hidden, and the server session is revoked regardless. (`src/api/pocketbase.ts`) |
| 19 | Requests had no timeout and responses no size cap, so a hanging server left the app spinning. | Medium | 20 second timeout, 5 MB response cap, 512 KB realtime frame cap. (`src/api/pocketbase.ts`) |
| 20 | A malformed realtime frame threw inside the message handler and aborted the dispatch loop. | Medium | Only known event types are dispatched, and a failing handler no longer blocks the others. (`src/api/pocketbase.ts`) |
| 21 | An unexpected error during session restore silently produced a signed-in state. | Medium | Unexpected errors now fail closed. (`src/api/pocketbase.ts`) |

## Partial

| # | Finding | Severity | Done | Still open |
|---|---|---|---|---|
| 22 | No rate limiting: unlimited sign-in attempts and unlimited sign-ups. Sign-ups cost two D1 writes each, so the daily write quota (100k) can be exhausted and the API stops accepting writes for the rest of the UTC day. | High | A per-isolate throttle on `/api/auth/signin` (10 per account, 50 per IP, per 10 min) and `/api/auth/signup` (20 per IP per hour) answers `429` with `Retry-After`. `ALLOW_SIGNUP=false` closes registration. | The authoritative limit should be global: Cloudflare rate limiting rules or a Durable Object limiter. Isolate state is per location, so the current limit is a first layer, not a quota. |
| 23 | Message search is an unindexed scan over the message table. | High | The scan is limited to a 90 day window and the needle to 64 characters. | D1 FTS5 for real scale. The current cost still grows with the table. |
| 24 | A stolen session token stays valid for its whole lifetime. | Medium | The token is rotated on every start, and a WebSocket ticket dies with its session. | Shorter sessions, per-device session listing and revocation. |
| 25 | Realtime events are applied without cross-checking the sender's identity, so a hostile server could impersonate a participant. | High | Frames are validated and the socket only ever receives events for conversations the account is a member of. | Treat message events as a hint that triggers a refetch, and verify the author against the participant list. |
| 26 | The Durable Object trusts its caller and the published event shape. | Medium | Known event types only, socket limit per user. | The Durable Object could verify the ticket itself instead of trusting the forwarded header. |

## Open, needs a decision

| # | Finding | Severity | Why it is open |
|---|---|---|---|
| 27 | The demo accounts exist in the production D1 behind a public `workers.dev` URL. | Critical | Resolved for now: their password was rotated to a random one that is not published in the repository, and every session was invalidated. The accounts still exist, so delete them if the URL is shared with people who should not see the workspace. |
| 28 | `APP_ORIGIN` is `*`, so any website may call the API cross-origin. | Medium | The API authenticates with a bearer header and never sets `Access-Control-Allow-Credentials`, so a hostile page cannot act as a signed-in victim today. It becomes a full CSRF hole the moment a cookie is introduced. Narrow it to the Pages origin once the web build is deployed. |
| 29 | The bearer token lives in `localStorage` in the web build. | High | The fix is an `HttpOnly` session cookie plus a CSRF strategy, which is a redesign of the auth flow. Native builds already use `SecureStore`. |
| 30 | Any user can start a group conversation with any other user, without consent. | Medium | Needs invites with acceptance, a leave route and a block list. |
| 31 | `/api/people` lists every account. | Medium | Needs a concept of visible colleagues. |
| 32 | Fan-out costs one Durable Object call per member per event, is awaited inside the request, and drops failures silently. | High | A conversation-scoped Durable Object with an outbox would fix the cost and the delivery guarantee. That is an architecture change. |
| 33 | No email verification and no password reset. | Medium | Needs an email sender. |
| 34 | Unexpected errors are logged raw, which can include query text. | Low | Workers logs should be access-controlled and shortened. |
| 35 | The email check is loose and does not normalize unicode. | Low | Cosmetic next to the above. |

## Resolved since the review

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 36 | Open self-service registration: anyone could create an account, which also burns the daily D1 write quota. | High | Registration now requires an invite code. The owner creates codes with `npm run worker:invite`; a code works once, expires, can be bound to one address and is stored only as a hash. The endpoints that create codes need a separate admin key. |
| 37 | Signup answered `409` for an existing email, which confirmed that an address is registered. | Low | Unreachable in practice now: only someone with a valid invite code can reach the check, and the invite is bound to the address it was issued for. |

## How the checks were run

```sh
# local
npm run worker:migrate:local
npm run worker:dev
npm run typecheck && npm run typecheck:worker

# against the deployment
WORKER_URL=https://open-services-api.snorlaxking310.workers.dev/api node worker/seed.mjs
```

The active probe covered 69 checks: unauthenticated access to every route,
forged and mutated credentials, cross-conversation access for a non-member,
author/creator/owner rules, data exposure, SQL and markup payloads, malformed
pagination parameters, password policy, response headers, CORS behaviour,
registration and sign-in flooding, and WebSocket authorization including
replay, tampering and cross-account isolation.
