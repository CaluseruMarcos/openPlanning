# Rebuild status — Open Services

Updated 2026-10-21. This tracks the local Expo rebuild in this repository (not the
reverse-engineering report under `analysis/`).

> **Cloudflare migration (current):** the Expo client now targets the Cloudflare
> Worker backend in `worker/` (D1 + UserHub Durable Object + WebSocket). The
> PocketBase details below describe the earlier backend and remain available
> under `backend/` as a reference/rollback path. See `worker/README.md` for the
> current setup and `docs/cloudflare-migration.md` for the design.

## What was broken

The app bundled and rendered the conversation list, but the interaction layer was
inert:

- bottom tabs (`Chat` / `Activity` / `Profile`) were plain `View`s — tapping did nothing
- search input was uncontrolled and filtered nothing
- `Unread` / `Teams` pills and `Mark all read` had no handlers
- compose created a conversation only in `selected` state, never in the list; sending
  in it mapped over a list that did not contain it, so messages vanished
- the list dereferenced `messages[last]` unconditionally, so any empty conversation
  would crash the list
- `Details ›`, the `⋯` menu, and the attachment button were no-ops
- sign-out only wrote `signedIn: false`; nothing read it, so nothing happened
- `npm run web` failed because `react-dom` / `react-native-web` were missing
- the root used RN's `SafeAreaView`, which is a no-op on Android; with SDK 57
  edge-to-edge the header and tab bar sit under the status/navigation bars

## What was fixed

| Area | Change |
|------|--------|
| Navigation | Working Chat / Activity / Profile tabs, conversation, details, and new-message screens; Android hardware-back handling |
| Backend | MIT-licensed PocketBase 0.40.5 with SQLite, migrations, access rules, and a seeded demo workspace under `backend/` |
| Auth | Email/password sign-in and sign-up against PocketBase; native tokens in SecureStore, web tokens in AsyncStorage; session refresh on launch |
| New message | Real participant picker backed by the `users` collection; opens an existing DM instead of duplicating it; creates the thread through the API |
| Sending | Messages are created through the API; previews, timestamps, and badges update locally and through realtime events |
| Realtime | SSE subscriptions for messages (create/update/delete), conversations, reactions, read positions, and typing indicators; native uses the `react-native-sse` polyfill |
| List | Controlled search (title, participants, previews, and full message history via the API), Unread and Teams filters, clear button, empty states |
| Message actions | Long-press sheet: react, reply, copy, edit, delete, and read-by; edit/delete are author-only |
| Replies | `messages.reply_to` quoted snippet rendered in the bubble; reply/edit modes in the composer |
| Reactions | `message_reactions` collection with a unique `(message, user, emoji)` index; toggleable chips and a five-emoji picker |
| Read receipts | Server `conversation_reads` positions; "Read by …" under own messages and a read-by sheet; mark-all-read writes read positions |
| Typing | `typing_indicators` heartbeats, realtime updates, a 7-second client expiry, and a 2-minute cleanup cron |
| Read state | Opening a conversation marks it read locally and writes the server read position; `Mark all read` and `Mark as unread` still drive per-device badges from AsyncStorage |
| Details | Participant list, mute switch, delete with confirmation; delete is only offered to the conversation creator |
| Menu | `⋯` sheet: view details, mute/unmute, mark unread, delete |
| Attachments | Sheet with placeholder photo/file messages (explicitly labelled as placeholders) |
| Profile | Account name/email, stats, notification preference, About sheet, sign out |
| Auth gate | Dedicated sign-in / create-account screen with validation and server errors |
| Persistence | Session token (SecureStore/AsyncStorage) and local read, mute, and notification preferences survive reload; conversations and messages live in PocketBase |
| Mobile networking | Backend listens on `0.0.0.0` by default, and the app derives the API host from the Expo dev server's LAN address, so physical phones no longer fall back to loopback/emulator URLs |
| Safe area | `react-native-safe-area-context` (`SafeAreaProvider` + insets) for status bar, tab bar, composer, and sheets |
| Web | Added `react-dom` and `react-native-web`; `npm run web` serves the app |

Main files: `App.tsx`, `src/api/pocketbase.ts`, `src/types.ts`,
`src/storage/preferencesStore.ts`. Backend: `backend/` (`pb_migrations/`,
`pb_hooks/main.pb.js`, `seed.mjs`).

## Backend and auth

- **Platform:** PocketBase 0.40.5 (MIT). A single binary plus SQLite, with a REST
  API, realtime SSE, auth, and an admin dashboard. Chosen for the simplest local
  and self-hosted story for an open-source client.
- **Collections:** built-in `users` (email/password, required `name`) plus
  `conversations`, `messages` (`reply_to`, `edited_at`), `message_reactions`,
  `conversation_reads`, and `typing_indicators`.
- **Access rules:** only the creator or a participant can read a conversation, its
  messages, reactions, read positions, and typing rows. Messages must be authored by
  the authenticated user and can only be edited/deleted by their author while they
  remain a participant. Reactions, read rows, and typing rows are owned by the
  authenticated user. A hook rejects changing a message's conversation or author;
  conversation deletion is limited to the creator; signed-in users can discover
  each other by name while emails stay hidden.
- **Summaries:** `pb_hooks/main.pb.js` updates `last_message_preview`,
  `last_message_at`, and `last_message_author` after message creates, edits, and
  deletes. A `typing_cleanup` cron removes typing heartbeats older than two minutes.
- **Demo accounts:** `marcos@example.com`, `sarah@example.com`,
  `michael@example.com` — password `openservices`.
- **Planning Center OAuth** is intentionally deferred until client credentials and a
  registered callback exist.

See `backend/README.md` for setup, reset, and production notes.

## Verification performed

- `npx tsc --noEmit` — clean
- `npx expo-doctor` — 21/21 checks passed
- `npx expo export --platform web` — succeeds
- `npx expo export --platform android` — succeeds (1.7 MB Hermes bundle)
- PocketBase API checks: seeded records, summary hook, per-viewer direct titles,
  user discovery, email privacy, and rejection of spoofed authors / non-participant
  reads and writes
- Mobile networking checks: Expo manifest advertises the machine's LAN host
  (`192.168.x.x:8081`), the app resolves `http://192.168.x.x:8090`, and the backend
  answers `/api/health` on both loopback and the LAN address
- Playwright run against the app served from the LAN address (not localhost):
  sign-in screen shows the LAN API URL, login succeeds, and conversations/messages
  load
- Playwright (mobile viewport, separate browser contexts):
  - sign in, load seeded conversations, open a thread, send a message, reload and
    confirm session + message persistence
  - two signed-in users exchange messages in both directions without reloading
  - sign up, empty state, participant picker, new DM, realtime conversation arrival
  - mute persistence after reload, creator-only delete, realtime row removal
  - full-history message search (`DI box` matches an older message), no-match state,
    Teams filter, mark-all-read, unread-filter empty state, Activity screen
  - exported production web build: sign in, message send, reload persistence
- Phase 1 backend API checks (23 assertions): edit + summary refresh, quoted-reply
  expansion, reaction create/list/uniqueness, read create/list/uniqueness, typing
  create/list/uniqueness, author and participant authorization, non-participant
  isolation, delete + summary restore.
- Phase 1 Playwright run (23 assertions, two signed-in contexts): copy to clipboard,
  read-by sheet, quoted reply, edit + edited marker, delete, reaction chip
  add/remove, typing indicator arrival and expiry, realtime send, read-receipt
  update, realtime reaction, realtime edit, and realtime delete.
- No console or page errors in the tested flows.

**Not verified:** real Android/iOS hardware or emulator (none available), Expo Go
launch, or the native SSE polyfill at runtime. The mobile networking fix was
validated through the Expo manifest and a LAN-origin browser run, not on a phone.

## Remaining work

A full, evidence-based comparison of the original app and this rebuild lives in
[`FEATURE_GAP.md`](FEATURE_GAP.md) (chat screens, message capabilities, realtime
events, native app surfaces, platform gaps, and a phased plan). Short version:
the original is a planning app with a 33-screen chat module; this rebuild is a
chat app, so chat parity and correct server-side state come first.

Priority order:

1. **Planning Center OAuth linking.** Add "Link Planning Center" once a client ID,
   secret, and callback URL are available. Keep local email/password as the fallback.
2. **Exact unread counts.** Derive badges from `conversation_reads` instead of
   AsyncStorage so they are exact and cross-device. Read receipts themselves are
   now server-side; mute/preferences are still local.
3. **Real attachments.** Replace the placeholder sheet with
   `expo-image-picker`/`expo-document-picker` and PocketBase file fields (or the
   Planning Center upload API later).
4. **Remaining chat parity.** Message reporting, GIF search/link previews, thread
   UI and per-thread drafts, soft-delete tombstones, and system messages. Reactions,
   typing, editing, deletion, quoted replies, copy, and read receipts are in.
5. **Pagination and scale.** Fetch messages in pages instead of the full history, and
   add indexes/query limits once conversations grow.
6. **Notifications and links.** FCM/APNs, notification routing, deep links, and
   cross-device unread synchronization.
7. **Other product surfaces.** Plans/scheduling, live plan, songs/arrangements,
   media playback, metronome with Ableton Link, widgets, Android Auto. None are in
   this rebuild yet.
8. **Theming.** Light-only; extract colour tokens before adding dark mode.
9. **Architecture.** `App.tsx` is still large (~3,700 lines). Split screens and
   components into modules and adopt `expo-router`/React Navigation if URL and
   deep-link support are needed.
10. **Tests.** The Playwright and API checks above were run ad hoc and are not
    committed. Add a repeatable e2e suite and a `test` script.
11. **Accessibility and devices.** Dynamic type, screen-reader review, focus order,
    and testing on real Android/iOS hardware.
12. **Production hardening.** HTTPS/reverse proxy, SMTP + email verification, rate
    limiting, backups, and a non-default admin password (see `backend/README.md`).
