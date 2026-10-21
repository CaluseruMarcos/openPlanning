# Open Services backend (PocketBase)

Local, self-hostable backend for the rebuild. PocketBase is MIT-licensed and ships
as a single binary with SQLite, auth, realtime, and an admin dashboard.

## Requirements

- Node.js 20+ (only for the seed script and the SDK)
- `curl` + `unzip` (only for the first download)

## Quick start

```sh
cd backend
./setup.sh                 # downloads PocketBase 0.40.5 and creates a local superuser
./start.sh                 # http://127.0.0.1:8090  (dashboard at /_/)
```

`start.sh` listens on `0.0.0.0:8090` by default so a physical phone on the same
Wi-Fi can connect. Set `PB_HOST=127.0.0.1` to keep it loopback-only, or change
`PB_PORT` if 8090 is taken.

In a second terminal:

```sh
cd backend
node seed.mjs
```

Demo accounts created by the seed:

| Email | Password | Name |
|-------|----------|------|
| `marcos@example.com` | `openservices` | Marcos |
| `sarah@example.com` | `openservices` | Sarah Chen |
| `michael@example.com` | `openservices` | Michael Johnson |

Local admin (not for production): `admin@openservices.local` / `devpassword`.
Override with `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`, or `PB_DEMO_PASSWORD`.

The seed also adds a quoted reply, reaction chips, and read receipts to the
Worship Team conversation so the Phase 1 social features are visible immediately.

Then start the app with the API URL:

```sh
# from the repository root
EXPO_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090 npm run web
```

For the Android emulator use `http://10.0.2.2:8090`; for a physical device use
your machine's LAN address.

## Schema

Created by the idempotent migrations in `pb_migrations/`:

- `users` (auth) — built-in email/password records with a required `name`.
  Signed-in users can list each other to start conversations; emails stay hidden
  unless `emailVisibility` is enabled.
- `conversations` — `title`, `kind` (`direct` | `team` | `group`),
  `created_by`, `participants` (multi-relation, including the creator), and a
  denormalised `last_message_preview` / `last_message_at` /
  `last_message_author` summary.
- `messages` — `conversation`, `author`, `body`, optional `reply_to` (a quoted
  message), and `edited_at`. Replies are quoted inline; there is no separate
  thread collection.
- `message_reactions` — `message`, `user`, `emoji`, with a unique
  `(message, user, emoji)` index so a user cannot add the same reaction twice.
- `conversation_reads` — `conversation`, `user`, optional `last_read_message`,
  and `last_read_at`, with a unique `(conversation, user)` index. Read receipts
  are derived by comparing a reader's `last_read_at` with a message's server
  creation time.
- `typing_indicators` — `conversation`, `user`, `last_seen`, with a unique
  `(conversation, user)` index. These are ephemeral heartbeats, not history.

Rules enforce that only the creator or a participant can read a conversation, its
messages, reactions, read positions, and typing rows. Messages can only be created
as the authenticated user and edited/deleted by their author while they remain a
participant. Reactions, read positions, and typing rows are owned by the
authenticated user. A hook also rejects attempts to move a message to another
conversation or change its author.

`pb_hooks/main.pb.js` updates the conversation summary after each message create,
edit, or delete without a client round trip. The hook runtime evaluates each
callback separately, so the summary lookup is inlined in each handler. A
`typing_cleanup` cron removes typing heartbeats older than two minutes every two
minutes.

## App integration

- The Expo app reads `EXPO_PUBLIC_POCKETBASE_URL` if set. Otherwise, in
  development it derives the API host from the Expo dev server's LAN address
  (`Constants.expoConfig.hostUri`), which makes physical phones work without
  configuration. Platform fallbacks are `http://10.0.2.2:8090` on Android and
  `http://127.0.0.1:8090` elsewhere. Release builds need an explicit URL at
  build time.
- Native auth tokens are stored in `expo-secure-store`; the web build uses
  AsyncStorage/localStorage. The session is refreshed on launch.
- Conversations and messages are fetched from the REST API. Realtime updates use
  SSE for messages, conversations, reactions, read positions, and typing
  indicators; React Native needs the `react-native-sse` polyfill that
  `src/api/pocketbase.ts` installs.
- Read positions are stored server-side in `conversation_reads` so receipts are
  visible to every participant. Unread badges still use AsyncStorage and remain
  approximate: one badge per unread conversation, not one per unread message.
- Typing heartbeats are sent while the composer has text (throttled to roughly
  every 2.5 seconds). The UI hides indicators after roughly 7 seconds without a
  heartbeat, and the backend cron removes abandoned rows.
- Search queries PocketBase for matching message bodies (in addition to local
  title/participant/preview matching), so older messages are searchable.

## Mobile connection troubleshooting

Login fails on a phone when it cannot reach the backend:

1. The sign-in screen shows `Server: …`. On a physical device it should show your
   computer's LAN IP (for example `http://192.168.1.50:8090`), not `127.0.0.1`
   or `10.0.2.2`.
2. Make sure `./start.sh` is running with `PB_HOST=0.0.0.0` (the default) and
   allow port 8090 through the firewall.
3. Open `http://<computer-lan-ip>:8090/api/health` in the phone's browser. It
   should return `{"message":"API is healthy.","code":200,...}`.
4. Phone and computer must be on the same Wi-Fi. Guest networks and client
   isolation can block LAN traffic. On iOS, allow Local Network access if prompted.
5. If auto-detection picks the wrong interface (VPN, Docker, multiple NICs), set
   `EXPO_PUBLIC_POCKETBASE_URL` explicitly and restart Expo with `--clear`.

Expo Go and debug builds allow HTTP for local development. Release builds should
use HTTPS; Android blocks cleartext HTTP and iOS ATS blocks non-local HTTP by
default.

## Data and reset

Everything lives in `backend/pb_data/` (gitignored). To reset:

```sh
rm -rf pb_data
./setup.sh
./start.sh
node seed.mjs
```

## Production notes

This setup is for local development. Before deploying publicly:

- set a real admin password and disable dashboard access from untrusted networks,
- configure SMTP and enable email verification / password reset,
- put PocketBase behind HTTPS and a reverse proxy,
- review the `users` list rule if you do not want authenticated users to discover
  each other by name,
- add rate limiting at the proxy and enable backups.

Planning Center OAuth linking is intentionally not implemented yet; local
email/password is the first auth path. See `REBUILD_STATUS.md`.
