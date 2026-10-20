# Rebuild status — Open Services

Updated 2026-10-20. This tracks the local Expo rebuild in this repository (not the
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
| New message | Participant picker (`New message`) instead of a blind placeholder thread; opens an existing DM instead of duplicating it |
| Sending | Messages append to the real conversation state, including newly created threads; previews, timestamps, and badges update |
| List | Controlled search (title, participants, message bodies), Unread and Teams filters, clear button, empty states |
| Read state | Opening a conversation marks it read; `Mark all read`; `Mark as unread`; unread badges on rows and the Chat tab |
| Details | Participant list, mute switch, delete with confirmation |
| Menu | `⋯` sheet: view details, mute/unmute, mark unread, delete |
| Attachments | Sheet with placeholder photo/file messages (explicitly labelled local demo) |
| Profile | Stats, notification preference, About sheet, sign out |
| Auth gate | Sign-in screen with display name; `signedIn` is now actually enforced |
| Persistence | Session **and** conversations in AsyncStorage (`open-services-session`, `open-services-conversations-v1`); sign-in/out and messages survive reload |
| Safe area | `react-native-safe-area-context` (`SafeAreaProvider` + insets) for status bar, tab bar, composer, and sheets |
| Web | Added `react-dom` and `react-native-web`; `npm run web` now serves the app |

Main file: `App.tsx`. Persistence: `src/storage/sessionStore.ts`. Mock data:
`src/data/mockData.ts`.

## Verification performed

- `npx tsc --noEmit` — clean
- `npx expo-doctor` — 21/21 checks passed
- `npx expo export --platform web` — succeeds
- `npx expo export --platform android` — succeeds (1.5 MB Hermes bundle)
- `npm run web` — dev server responds `HTTP 200`
- Playwright smoke run (mobile viewport, 26 assertions, no console/page errors):
  search, unread filter, mark-all-read, send, preview update, details, mute toggle,
  participant picker, new-thread send, attachment placeholder, Activity, Profile,
  preference selection, About sheet, sign out, sign in, delete with confirmation
- Reload test: sent message, signed-out state, and signed-in state all persist

**Not verified:** real Android/iOS hardware or emulator (none available) and Expo Go
launch. Web and bundle-level verification only.

## Remaining work

Priority order:

1. **Backend and auth.** Replace `src/data/mockData.ts` with the real Planning
   Center API. Implement OAuth 2.0 Authorization Code + PKCE (and DPoP if the server
   supports it), and store tokens in `expo-secure-store` (Keystore/Keychain) — do not
   reproduce the report's F-02 plaintext-SharedPreferences pattern.
2. **Persist preferences.** Mute state and notification preference are in memory only;
   store them, and validate/migrate stored conversation JSON before use.
3. **Real attachments.** Replace the placeholder sheet with
   `expo-image-picker`/`expo-document-picker` and the upload API
   (`upload.planningcenteronline.com`, version `2025-05-16`).
4. **Chat parity.** Reactions, read receipts, typing indicators, GIF search,
   message reporting, age gates, group/team filters, server-side search and
   pagination. Current search is local substring matching over loaded data.
5. **Notifications and links.** FCM/APNs, notification routing, deep links
   (scheduling accept/decline, signup sheets), and unread synchronisation.
6. **Other product surfaces.** Plans/scheduling, live plan, songs/arrangements,
   media playback, metronome with Ableton Link, widgets, Android Auto. None are in
   this rebuild yet.
7. **Theming.** Light-only; no system dark mode. Extract colour tokens before adding
   a dark theme.
8. **Architecture.** `App.tsx` is now ~1,100 lines. Split screens/components into
   modules and adopt `expo-router`/React Navigation if URL and deep-link support are
   needed.
9. **Tests.** The smoke run was ad hoc and lives outside the repo. Commit an e2e
   suite and add a `test` script.
10. **Accessibility and devices.** Dynamic type, screen-reader review, focus order,
    and testing on real Android/iOS hardware.
