# Feature gap — original Planning Center Services vs. this rebuild

**Original:** Planning Center "Services" 6.10.8 (versionCode `21060823`), Android APK
(`com.ministrycentered.PlanningCenter`). Native Kotlin/Compose host with an embedded
React Native/Expo chat module, `@planningcenter/chat-react-native` 4.2.0.

**This rebuild:** `open-services-rebuild` — a pure Expo/TypeScript app (SDK 57, RN 0.86)
talking to a self-hosted PocketBase backend.

**Research date:** 2026-10-21. **Sources:** `analysis/REPORT.md`,
`analysis/api-and-feature-audit.md`, `analysis/chat-bundle.md`, plus direct greps of
`extracted/index.android.decompiled.js` (shipped Hermes bundle, 35.6 MB) and the
decompiled Java under `decompiled/sources/`.

**Legend:** ✅ implemented · 🟡 partial / placeholder · ❌ missing · ⛔ out of scope for a
JS rebuild (native-only in the original)

---

## 1. Executive summary

The original is a **planning app** with chat as one of five top-level surfaces. The
rebuild is a **chat app**. So the gap splits into two very different buckets:

| Area | Original | Rebuild | Coverage |
|------|----------|---------|----------|
| Chat module screens | 33 named screens | 7 screens + 4 sheets | ~20% |
| Chat message capabilities | text, reply, edit, delete, reactions, read receipts, typing, 4 media types, GIFs, links | text, quoted replies, edit, delete, copy, reactions, read receipts, typing; no media/GIFs/links | medium-high |
| Native app surfaces (plans, songs, media, metronome, people, widgets, Auto) | 6+ top-level tabs | none | 0% |
| Platform integrations (OAuth, push, deep links, Android Auto, share-in) | full | local email/password only | ~10% |

**Biggest single risk:** the rebuild is a chat client without the *context* the original
chat lives in. In the original, a conversation is attached to a **team, a plan, a
service type, and an organization**. In the rebuild, a conversation is a flat list of
email identities. That is why the original's conversation creation flow is a
multi-step wizard (§2.2) and ours is a one-tap picker.

---

## 2. Chat module gap (primary comparison)

The original chat is `@planningcenter/chat-react-native` 4.2.0. Screens were
recovered from the shipped bundle and re-verified by grepping
`extracted/index.android.decompiled.js`.

### 2.1 Screens

| Original screen | Purpose | Rebuild |
|-----------------|---------|---------|
| `TabsScreen` | Chat tab container (Conversation / Group / Team tabs) | ⛔ no tabs inside chat; single list |
| `ConversationsScreen` | Conversation list, per-viewer badges, `perPage=20`, filters | ✅ `ConversationList` (unread/teams filters) |
| `ConversationScreen` | Message thread, replies, reactions, typing, read receipts | 🟡 `ConversationView` (text, quoted replies, reactions, receipts, typing; no attachments/report/pagination) |
| `ConversationNewScreen` | Start-a-conversation entry | 🟡 `NewConversationView` (single picker) |
| `ConversationNewEntryScreen` | New-conversation options (DM / group / team) | ❌ |
| `ConversationSelectTypeScreen` | Choose conversation type | ❌ |
| `ConversationSelectDirectMessageRecipientsScreen` | Pick DM recipients | 🟡 `NewConversationView` (one person, no multi-select) |
| `ConversationSelectGroupRecipientsScreen` | Pick group recipients | ❌ |
| `ConversationSelectTeamsILeadRecipientsScreen` | Pick teams you lead | ❌ |
| `ConversationDetailsScreen` | Members, abilities, avatar, membership | 🟡 `DetailsView` (participants, mute, delete) |
| `ConversationFiltersScreen` | Filter chips for the list | 🟡 2 filters (All / Unread / Teams) |
| `ConversationFilterRecipientsScreen` | Filter by recipients | ❌ |
| `ConversationNotificationLevelSelectScreen` | Per-conversation notification level | 🟡 mute on/off only |
| `GroupNotificationSettingsScreen` | Notification settings for a group | ❌ |
| `GroupNotificationLevelSelectScreen` | Group notification level | ❌ |
| `NotificationSettingsScreen` | Chat-wide notification preferences | 🟡 single "All / Mentions / Muted" local setting |
| `SettingsScreen` | Chat settings | ❌ |
| `MessageActionsScreen` | Reply / Copy / Edit / Delete / Report | 🟡 action sheet: reply, copy, edit, delete, read-by; no report |
| `MessageReadReceiptsScreen` | Who read a message | ✅ read-by sheet |
| `MessageReportScreen` | Report a message (harassment, spam…) | ❌ |
| `ReactionsScreen` | Pick a reaction | ✅ five-emoji picker in the action sheet |
| `SendGiphyScreen` | Giphy search | ❌ |
| `AttachmentActionsScreen` | Attachment options (open, copy, remove) | 🟡 sheet sends a placeholder text message |
| `SystemMessagePeopleScreen` | People referenced by a system message | ❌ |
| `AvatarPickerScreen` | Custom conversation avatar | ❌ (initials + hashed color only) |
| `AvatarPickerCreateScreen` | Create a custom avatar | ❌ |
| `BugReportScreen` | Report a bug with attachments | ❌ |
| `GetHelpScreen` | Help links | 🟡 static "About" sheet |
| `DesignSystemScreen` | Component gallery | ❌ |
| `PreferredAppSelectionScreen` | Preferred app per chat type (Services ↔ Church Center) | ❌ |
| `AgeCheckRequiredScreen` | Stated-date age gate | ❌ |
| `AgeCheckUnderageScreen` | Underage state | ❌ |
| `TeamConversationScreen` | Team-scoped conversation view | ❌ |

### 2.2 Message capabilities

| Capability | Original (evidence) | Rebuild |
|------------|--------------------|---------|
| Send text | `POST /me/conversations/<id>/messages` | ✅ |
| Optimistic send + `idempotent_key` | 8 occurrences in bundle | ❌ (waits for server round trip) |
| Edit message | `PATCH .../messages/<mid>`, `text_edited_at` | ✅ author-only edit with an `edited` marker |
| Delete message | `PATCH .../messages/<mid>` + `deleted_at` | 🟡 hard delete; original keeps a soft-deleted row |
| Reply / thread | `reply_root`, `/messages/<rootId>/replies` (43 occurrences) | 🟡 quoted `reply_to` snippet; no thread UI |
| Reactions | `react` / `unreact`, `reaction_counts`, `ReactionsScreen` | ✅ five emoji, participant-owned, unique per user/message/emoji |
| Read receipts | `GET .../read_receipts`, `MessageReadReceiptsScreen` | ✅ server `conversation_reads`; derived per-message readers |
| Typing indicator | `POST .../broadcast_typing_status` | ✅ heartbeat collection + realtime; 7s client expiry, 2-minute cleanup |
| Copy message text | `MessageActionsScreen` | ✅ `expo-clipboard` from the action sheet |
| Report message | `POST .../report`, 4 reasons | ❌ |
| Image attachment | Image Picker, 10 MB guard, `X-PCO-Moderate-Image` | ❌ |
| Video attachment | Expo Video + `X-PCO-Moderate-Video` (flagged) | ❌ |
| Audio attachment / record | `useAudioRecorder`, `RecordingPresets` | ❌ |
| Document attachment | `getDocumentAsync`, extension allowlist | ❌ |
| Clipboard paste | `ExpoClipboard` (`onClipboardChanged`) | ❌ |
| GIF (Giphy) | `api.giphy.com/v1/gifs/search`, 96 occurrences | ❌ |
| Link preview / expanded link | `remove_expanded_link`, `expanded_link` | ❌ |
| Attachment moderation | `attachment.flagged` event → removes media | ❌ |
| Drafts per conversation | `chat_message_drafts`, thread drafts | ❌ (draft lost on navigation) |
| Message pagination | `perPage=25` + `meta.total_count/prev/next` | ❌ (full history loaded) |
| Conversation pagination | `perPage=20` + `links` | ❌ (full list loaded) |
| Unread counts | `unread_count` per conversation, badge fields | 🟡 local badges, 1 per conversation; server read positions now exist but badges do not use them yet |
| Mark all read | `POST /me/mark_all_read` (server-side) | 🟡 clears local badges and writes read positions for loaded conversations |
| Mute | `muted` + `notification_level` (`nothing`) | 🟡 local boolean |
| Member abilities | `MemberAbility`: `can_update`, `can_delete`, `leader`, `can_reply`, `can_delete_non_authored_messages` | ❌ (delete allowed for creator only) |
| Group membership | `GroupMembership`, `notification_level_options` | ❌ |
| Team conversations | `TeamConversationScreen`, `/chat` service endpoint with `team_id`/`plan_id` | ❌ |
| Gender-specific groups | `gender_id`, `where[gender]=male\|female` | ❌ |
| Age qualification | `age_qualification_status`, `under_18`, `POST /me/age_checks` | ❌ |
| Minors safety lock | `conversation_safety_lock` (2 adults required) | ❌ |
| Leader-only messaging | `Only leaders can send messages in this conversation.` | ❌ |
| Direct-message enable/disable | `POST /me/enable|disable_direct_messages` | ❌ |
| DM candidates / affiliations | `direct_message_candidates`, `direct_message_affiliations` | 🟡 plain user list |
| System messages | `message_type`, `system_text_parts`, `person_ids_for_system_event` | ❌ |
| Custom conversation avatar | `custom_avatar_{type,key,color,image_url}` | ❌ |
| Feature flags / rollouts | 8 `ROLLOUT_*` keys from `GET /me/features` | ❌ |
| Realtime transport | Jolt WebSocket (`jolt_authorize` → `jolt_subscribe` → `wssUrl`) | 🟡 PocketBase SSE; same events, different transport |
| Realtime events | `message.*`, `reaction.*`, `conversation.*`, `attachment.flagged` | 🟡 message/conversation create+delete only |
| Cross-account switch | `switchChatAccount` bridge | ❌ single-org model |
| Config limits | `/me/chat_configuration` (extensions, max size, max attachments) | ❌ |
| Product analytics / metrics | `chat.mobile.conversations.index.opened`, roundtrip-time metrics | ❌ |
| Crash reporting | Sentry (JS-only), `chat.scope` / `chat.screen` tags | ❌ |

### 2.3 Realtime event parity

| Event | Original | Rebuild |
|-------|----------|---------|
| `message.created` | ✅ | ✅ |
| `message.updated` (edit) | ✅ | ✅ |
| `message.destroyed` | ✅ | ✅ (delete) |
| `reaction.created` / `reaction.destroyed` | ✅ | ✅ |
| `conversation.created` / `updated` / `destroyed` | ✅ | ✅ / ✅ / ✅ |
| `conversation.read` | ✅ | 🟡 `conversation_reads` create/update/delete events |
| Typing status | ✅ | ✅ `typing_indicators` create/update/delete events |
| `attachment.flagged` | ✅ | ❌ |
| `STREAM_USER_UPDATED` | ✅ | ❌ |

---

## 3. Native app surfaces (not in the rebuild)

These are the original's other top-level tabs and platform features. The original
implements them in **native Kotlin/Compose**, not in the chat module, so the rebuild
does not inherit any of them. Package evidence in
`decompiled/sources/com/ministrycentered/`.

| Original surface | Evidence | Rebuild |
|------------------|----------|---------|
| My Schedule (tab 0) | `plans/MyScheduleParentFragment`, `/me/schedules` | ❌ |
| Plans (tab 1) | `plans/PlansParentFragment`, 156 services paths | ❌ |
| Order-of-service editing | `EditPlanItemActivity`, `item_reorder`, `item_times`, `item_notes` | ❌ |
| Plan templates / import / reports | `plan_templates`, `plans/import`, `generate_standard_report` | ❌ |
| Live plan view (Pusher) | `plans/live/PlanLiveFragment`, `presence-live-*` channels | ❌ |
| Songs (tab 2) | `songs/SongsParentFragment`, arrangements, keys, tags | ❌ |
| Praise Charts import / transpose | `praise_charts_search`, `praise_charts_import`, `chord_chart_transpose` | ❌ |
| Rehearsal mix / community songs | `rehearsal_mix_*`, `community_songs` | ❌ |
| Media (tab 3) | `media/MediaParentFragment`, folders, media schedules | ❌ |
| Audio playback service | `audioplayer/`, Media3/ExoPlayer, `MediaPlayerAudioPlayerService` | ❌ |
| Metronome | `com/ministrycentered/metronome/*`, JNI `libmetronome-lib.so`, 14 PCM samples | ❌ |
| Metronome Sync (Ableton Link) | `metronome/link`, `LinkHelper`, 15 JNI methods | ❌ |
| People (tab 4) | `people/PeopleParentFragment`, profiles, contact data | ❌ |
| Household members | `household_members` (29 paths) | ❌ |
| Blockouts | `BlockoutDateActivity`, `blockouts/*`, conflict detection | ❌ |
| Signup sheets | `SignupSheetsActivity`, `available_signups`, `accept` | ❌ |
| Scheduling requests | accept / decline / partial accept / pick-and-choose | ❌ |
| Legacy people messages | `messaging/`, `MessageContentActivity`, `view_html` | ❌ |
| Team management | teams, positions, assignments, tags, team options | ❌ |
| Push notifications | `pushnotifications/fcm/`, `ServicesFcmListenerService` | ❌ |
| Notification settings | `TeamAndScheduleSettingsActivity`, `ChatNotificationSettingsActivity` | 🟡 local only |
| Widgets | `appwidgets/` (next-up, scheduler, rehearse), `schedulewidget/` | ❌ |
| Android Auto | `pco/androidauto`, `MediaBrowserService`, `automotive_app_desc` | ❌ |
| Deep links | `AppLinkingActivity` (9 path patterns, verified HTTPS) | ❌ |
| Share-into-app | `AddToServicesActivity` (`SEND`, `*/*`) | ❌ |
| Calendar subscription | `webcal://…/ical/pnb/<code>` + Google Calendar | ❌ |
| Help & helpdesk | `help/HelpActivity`, `HelpDeskActivity`, `/helpdesk/v2/tickets` | ❌ |
| What's New | `whatsnew/WhatsNewActivity` (remote changelog WebView) | ❌ |
| Settings | `settings/SettingsActivity` (theme, staging toggle, cached audio, licenses) | 🟡 small subset |
| Account switching | `linked_accounts`, `switchChatAccount` | ❌ |
| Permissions / roles | `pco/permission/PermissionHelper` | ❌ |
| Shortcuts | `planningcenteronline/shortcut` | ❌ |
| App modernisation prompts | `settings`, `DisableStagingWorker` | ❌ |

---

## 4. Platform and infrastructure gap

| Concern | Original | Rebuild |
|---------|----------|---------|
| Auth model | OAuth 2.0 Authorization Code + **PKCE** + DPoP, per-organization accounts, account switching | Local email/password on PocketBase; single workspace |
| Token storage | Plaintext JSON in SharedPreferences (finding **F-02**) | `expo-secure-store` (Keychain / Keystore) — better than the original |
| API surface | 186 path templates across services / people / chat / notifications / helpdesk + OAuth, JSON:API | 3 app collections (users, conversations, messages) |
| Realtime | Jolt WebSocket with token authorize/subscribe handshake | PocketBase SSE (no handshake) |
| File uploads | `upload.planningcenteronline.com/v2/files`, multipart, moderation headers | ❌ (PocketBase file fields would be the analogue) |
| Push | FCM, per-entity notification settings, delivery preferences | ❌ |
| Analytics | Firebase, Pendo, Datadog, product-analytics tokens | ❌ |
| Crash reporting | Sentry (chat), Crashlytics (native) | ❌ |
| Offline cache | 69-table legacy SQLite + 2 Room DBs + KMP read model | ❌ (in-memory + AsyncStorage prefs) |
| Background work | WorkManager jobs, live-plan notification registration | ❌ |
| Age / safety gating | age checks, minors lock, moderation | ❌ |
| Local drafts | per-conversation and per-thread drafts | ❌ |

---

## 5. Parity gaps inside the features we did implement

These are the "honest 80%" items — the rebuild looks complete but is thinner than the
original in ways that show up in normal use.

1. **Unread badges are still device-local.** Read positions now live in
   `conversation_reads` and receipts sync across participants, but unread badges
   still use AsyncStorage and show 1 per conversation. They do not yet derive from
   the server read position, so reading on a phone does not clear a tablet badge.
2. **Realtime covers the social layer, not attachments.** Message
   create/update/delete, reactions, read positions, typing, and conversation
   updates stream. Attachment moderation and system-person events do not.
3. **No pagination.** Every conversation and every message is fetched in full — fine
   for 3 seeded conversations, not for a real workspace.
4. **Attachments are fake.** The sheet posts a text placeholder instead of uploading.
5. **Message lifecycle is partial.** Edit, delete, reply, copy, reactions, read
   receipts, and typing exist. Report, soft-delete tombstones, and system messages
   do not.
6. **Threads are quoted replies only.** `reply_to` stores a quoted snippet; there is
   no `reply_root` thread UI or per-thread drafts.
7. **Conversation creation is direct-only.** Team and group records render, but the
   create flow only starts 1:1 DMs. The original supports DM, group, team, and
   gender-specific conversations, each with its own creation wizard.
8. **Search scope.** The rebuild searches titles, participants, previews, and full
   message history through the API. The original's search is scoped to DM
   recipients (`ROLLOUT_MOBILE_dm_search_clear_fix`) — different semantics, similar
   surface.
9. **Deletion rights are author-only.** The rebuild lets the creator delete a
   conversation and authors delete their messages. The original's `MemberAbility`
   model also distinguishes leader/moderator rights and non-authored deletion.
10. **Session handling.** No token refresh race, no account switching, no
    organization context.

---

## 6. Recommended order of work

Ordered by value per unit of effort, given the rebuild is a chat client.

**Phase 1 — make chat real (highest value)**
1. ✅ Message actions: edit, delete, copy, quoted reply (no thread UI yet).
2. ✅ Reactions (five-emoji picker; participant-owned and unique).
3. ✅ Read receipts + typing indicators, with server read positions and realtime.
4. Real attachments (image / document / video) on PocketBase file fields, with the
   `/me/chat_configuration` equivalent (max size, max count) enforced server-side.
5. Pagination for conversations and messages.

**Phase 2 — correct state**
6. Derive exact unread counts from `conversation_reads` so badges are cross-device;
   move mute/preferences to the server if they need to sync.
7. Server-side unread counts and mark-all-read.
8. Per-conversation notification levels (all / mentions / nothing) and per-group
   settings.

**Phase 3 — conversation types**
9. Group and team conversations, with the create wizard and team/plan context.
10. Conversation membership, roles (leader/member), and ability-based permissions.

**Phase 4 — platform**
11. Deep links (`/plans/{id}`, scheduling requests, signup sheets) via Expo Router
    or `expo-linking`.
12. Push notifications (Expo Notifications → PocketBase or FCM).
13. Share-into-app target.

**Phase 5 — domain features (largest effort, only if the product direction calls
for it)**
14. Plans / order of service / live plan.
15. Songs, keys, media library, audio playback.
16. People, blockouts, signups.
17. Metronome (+ Ableton Link) and Android Auto — these are native-only in the
    original and would need custom native modules, not Expo packages.

**Explicitly not planned**
- Replicating the original's security weaknesses: plaintext token storage (**F-02**),
  the embedded legacy OAuth client secret (**F-01**), and the broad exported-component
  surface (**F-03**). The rebuild should keep SecureStore storage and a
  PKCE-style public client if Planning Center OAuth is ever added.

---

## 7. Evidence index

| Claim source | Path |
|--------------|------|
| Original feature map, API surface, security findings | `analysis/REPORT.md` |
| Endpoint tables, navigation graph, local stores | `analysis/api-and-feature-audit.md` |
| Chat screens, models, Jolt realtime, Giphy, Sentry | `analysis/chat-bundle.md` |
| Chat JS endpoint list | `analysis/chat-endpoints.txt` |
| Shipped chat bundle (grep source for chat claims) | `extracted/index.android.decompiled.js` |
| Decompiled native sources (package inventory) | `decompiled/sources/com/ministrycentered/` |
| Component/permission inventory | `analysis/manifest-components.txt` |
| Security re-verification | `analysis/security-verification.md` |
