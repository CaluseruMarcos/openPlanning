# Rebuild status — Open Services

Updated 2026-10-21. This tracks the local Expo rebuild in this repository (not the
reverse-engineering report under `analysis/`).

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
| Realtime | SSE subscriptions for messages and conversations (native uses the `react-native-sse` polyfill); incoming messages append to open chats and update the list |
| List | Controlled search (title, participants, previews, and full message history via the API), Unread and Teams filters, clear button, empty states |
| Read state | Opening a conversation marks it read; `Mark all read`; `Mark as unread`; persisted per account in AsyncStorage |
| Details | Participant list, mute switch, delete with confirmation; delete is only offered to the conversation creator |
| Menu | `⋯` sheet: view details, mute/unmute, mark unread, delete |
| Attachments | Sheet with placeholder photo/file messages (explicitly labelled as placeholders) |
| Profile | Account name/email, stats, notification preference, About sheet, sign out |
| Auth gate | Dedicated sign-in / create-account screen with validation and server errors |
| Persistence | Session token (SecureStore/AsyncStorage) and local read, mute, and notification preferences survive reload; conversations and messages live in PocketBase |
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
  `conversations` and `messages`.
- **Access rules:** only the creator or a participant can read a conversation and its
  messages; messages must be authored by the authenticated user; conversation
  deletion is limited to the creator; signed-in users can discover each other by
  name while emails stay hidden.
- **Summaries:** `pb_hooks/main.pb.js` updates `last_message_preview`,
  `last_message_at`, and `last_message_author` after message creates and deletes.
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
- Playwright (mobile viewport, separate browser contexts):
  - sign in, load seeded conversations, open a thread, send a message, reload and
    confirm session + message persistence
  - two signed-in users exchange messages in both directions without reloading
  - sign up, empty state, participant picker, new DM, realtime conversation arrival
  - mute persistence after reload, creator-only delete, realtime row removal
  - full-history message search (`DI box` matches an older message), no-match state,
    Teams filter, mark-all-read, unread-filter empty state, Activity screen
  - exported production web build: sign in, message send, reload persistence
- No console or page errors in the tested flows.

**Not verified:** real Android/iOS hardware or emulator (none available), Expo Go
launch, or the native SSE polyfill at runtime. Web and bundle-level verification
only.

## Remaining work

Priority order:

1. **Planning Center OAuth linking.** Add "Link Planning Center" once a client ID,
   secret, and callback URL are available. Keep local email/password as the fallback.
2. **Exact unread counts and read receipts.** Unread badges are local-only and show
   one per unread conversation. Move read state into a `conversation_reads`
   collection to sync across devices and count messages precisely.
3. **Real attachments.** Replace the placeholder sheet with
   `expo-image-picker`/`expo-document-picker` and PocketBase file fields (or the
   Planning Center upload API later).
4. **Chat parity.** Reactions, typing indicators, GIF search, message reporting, and
   message deletion in the UI. The backend already recomputes summaries after a
   message delete.
5. **Pagination and scale.** Fetch messages in pages instead of the full history, and
   add indexes/query limits once conversations grow.
6. **Notifications and links.** FCM/APNs, notification routing, deep links, and
   cross-device unread synchronization.
7. **Other product surfaces.** Plans/scheduling, live plan, songs/arrangements,
   media playback, metronome with Ableton Link, widgets, Android Auto. None are in
   this rebuild yet.
8. **Theming.** Light-only; extract colour tokens before adding dark mode.
9. **Architecture.** `App.tsx` is still large (~1,800 lines). Split screens and
   components into modules and adopt `expo-router`/React Navigation if URL and
   deep-link support are needed.
10. **Tests.** The Playwright checks above were run ad hoc and are not committed.
    Add a repeatable e2e suite and a `test` script.
11. **Accessibility and devices.** Dynamic type, screen-reader review, focus order,
    and testing on real Android/iOS hardware.
12. **Production hardening.** HTTPS/reverse proxy, SMTP + email verification, rate
    limiting, backups, and a non-default admin password (see `backend/README.md`).
