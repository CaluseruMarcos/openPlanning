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
- `messages` — `conversation`, `author`, `body`.

Rules enforce that only the creator or a participant can read a conversation and
its messages, and that messages can only be created as the authenticated user.

`pb_hooks/main.pb.js` updates the conversation summary after each message without
a client round trip. It also recomputes the summary when a message is deleted.

## App integration

- The Expo app reads `EXPO_PUBLIC_POCKETBASE_URL` (see the root `.env.example`).
  It defaults to `http://127.0.0.1:8090` on web/iOS and `http://10.0.2.2:8090`
  on Android (emulator loopback).
- Native auth tokens are stored in `expo-secure-store`; the web build uses
  AsyncStorage/localStorage. The session is refreshed on launch.
- Conversations and messages are fetched from the REST API. Realtime updates use
  SSE; React Native needs the `react-native-sse` polyfill that
  `src/api/pocketbase.ts` installs.
- Local read, mute, and notification preferences live in AsyncStorage. Unread
  badges are per device and approximate: one badge per unread conversation, not
  one per unread message.
- Search queries PocketBase for matching message bodies (in addition to local
  title/participant/preview matching), so older messages are searchable.

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
