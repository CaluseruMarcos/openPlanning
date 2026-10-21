import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import PocketBase, {
  BaseAuthStore,
  ClientResponseError,
  type AuthRecord,
  type RecordModel,
} from "pocketbase";
import { Platform } from "react-native";

import type {
  Conversation,
  ConversationRead,
  Message,
  Person,
  Reaction,
  TypingIndicator,
} from "../types";

const AUTH_KEY = "open-services-auth";
const API_PORT = 8090;

const DEFAULT_URL =
  Platform.OS === "android"
    ? `http://10.0.2.2:${API_PORT}`
    : `http://127.0.0.1:${API_PORT}`;

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * The Expo dev server tells us which host the bundle was loaded from. On a
 * physical phone that is the development machine's LAN address, not loopback.
 * Returns null for loopback hosts so the platform default (emulator/simulator)
 * can be used instead.
 */
function lanHostFromUri(uri?: string | null): string | null {
  if (!uri) return null;

  let value = uri.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  value = value.split("/")[0];
  if (!value) return null;

  let host: string;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end < 0) return null;
    host = value.slice(0, end + 1);
  } else {
    host = value.split(":")[0];
  }

  if (
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]"
  ) {
    return null;
  }
  return host;
}

function developmentApiUrl(): string | null {
  if (!__DEV__) return null;

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const webHost = lanHostFromUri(window.location.hostname);
    if (webHost) {
      return `${window.location.protocol === "https:" ? "https" : "http"}://${webHost}:${API_PORT}`;
    }
    return null;
  }

  const expoHost = lanHostFromUri(Constants.expoConfig?.hostUri);
  if (expoHost) {
    return `http://${expoHost}:${API_PORT}`;
  }

  return null;
}

const configuredUrl = process.env.EXPO_PUBLIC_POCKETBASE_URL?.trim();

export const POCKETBASE_URL = normalizeBaseUrl(
  configuredUrl || developmentApiUrl() || DEFAULT_URL,
);

// PocketBase realtime uses the global EventSource, which React Native does not
// provide. The web build already has a native implementation.
if (
  Platform.OS !== "web" &&
  typeof (globalThis as { EventSource?: unknown }).EventSource === "undefined"
) {
  const EventSourcePolyfill = require("react-native-sse").default;
  (globalThis as { EventSource?: unknown }).EventSource = EventSourcePolyfill;
}

const authStorage = {
  getItem: (key: string) =>
    Platform.OS === "web"
      ? AsyncStorage.getItem(key)
      : SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    Platform.OS === "web"
      ? AsyncStorage.setItem(key, value)
      : SecureStore.setItemAsync(key, value),
  removeItem: (key: string) =>
    Platform.OS === "web"
      ? AsyncStorage.removeItem(key)
      : SecureStore.deleteItemAsync(key),
};

class PersistentAuthStore extends BaseAuthStore {
  private hydrating = false;

  async hydrate(): Promise<void> {
    this.hydrating = true;
    try {
      const serialized = await authStorage.getItem(AUTH_KEY);
      if (!serialized) return;
      const parsed = JSON.parse(serialized) as {
        token?: string;
        record?: AuthRecord;
      };
      if (parsed?.token) {
        super.save(parsed.token, parsed.record ?? null);
      }
    } catch {
      // A corrupt or unreadable token should behave like a signed-out session.
    } finally {
      this.hydrating = false;
    }
  }

  save(token: string, record?: AuthRecord): void {
    super.save(token, record);
    if (this.hydrating) return;
    void authStorage
      .setItem(AUTH_KEY, JSON.stringify({ token, record: record ?? null }))
      .catch(() => undefined);
  }

  clear(): void {
    super.clear();
    void authStorage.removeItem(AUTH_KEY).catch(() => undefined);
  }
}

export const authStore = new PersistentAuthStore();
export const pb = new PocketBase(POCKETBASE_URL, authStore);
// Message fetches and message searches share the same endpoint; automatic
// cancellation would make them abort each other.
pb.autoCancellation(false);

type PBUserRecord = RecordModel & { name?: string; email?: string };

type PBConversation = RecordModel & {
  title: string;
  kind: "direct" | "team" | "group";
  created_by: string;
  participants: string[];
  last_message_preview?: string;
  last_message_at?: string;
  last_message_author?: string;
  expand?: { participants?: PBUserRecord[] };
};

type PBMessage = RecordModel & {
  conversation: string;
  author: string;
  body: string;
  created: string;
  reply_to?: string;
  edited_at?: string;
  expand?: {
    author?: PBUserRecord;
    reply_to?: PBMessage;
  };
};

type PBReaction = RecordModel & {
  message: string;
  user: string;
  emoji: string;
  created: string;
  expand?: { user?: PBUserRecord };
};

type PBConversationRead = RecordModel & {
  conversation: string;
  user: string;
  last_read_message?: string;
  last_read_at: string;
  expand?: { user?: PBUserRecord };
};

type PBTypingIndicator = RecordModel & {
  conversation: string;
  user: string;
  last_seen: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export type MessageSubscriptionEvent = {
  action: string;
  record: PBMessage;
  message?: Message;
};

export type ConversationSubscriptionEvent = {
  action: string;
  record: PBConversation;
};

export type ReactionSubscriptionEvent = {
  action: string;
  record: PBReaction;
  reaction?: Reaction;
};

export type ConversationReadSubscriptionEvent = {
  action: string;
  record: PBConversationRead;
  read?: ConversationRead;
};

export type TypingSubscriptionEvent = {
  action: string;
  record: PBTypingIndicator;
  typing?: TypingIndicator;
};

const PERSON_COLORS = [
  "#5B61D6",
  "#D66B5B",
  "#3A9B7A",
  "#B77B2F",
  "#7A5BD6",
  "#C25B8E",
  "#3E7FB8",
  "#6B8E23",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function colorFor(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function toPerson(record?: {
  id?: string;
  name?: string | null;
} | null): Person {
  const id = record?.id ?? "unknown";
  const name = record?.name?.trim() || "Member";
  return {
    id,
    name,
    initials: initialsFor(name),
    color: colorFor(id),
  };
}

export function toPersonFromSession(user: SessionUser): Person {
  return toPerson({ id: user.id, name: user.name });
}

export function parsePocketBaseDate(value?: string): Date | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimestamp(value?: string): string {
  const date = parsePocketBaseDate(value);
  if (!date) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${((hours + 11) % 12) + 1}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  if (now.getTime() - date.getTime() < 6 * 24 * 60 * 60 * 1000) {
    return WEEKDAYS[date.getDay()];
  }

  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function sessionUserFromRecord(record: AuthRecord): SessionUser | null {
  if (!record?.id) return null;
  const email = typeof record.email === "string" ? record.email : "";
  const name =
    typeof record.name === "string" && record.name.trim().length > 0
      ? record.name.trim()
      : email || "Member";
  return { id: record.id, name, email };
}

function toMessage(record: PBMessage, reactions: Reaction[] = []): Message {
  const replyRecord = record.expand?.reply_to;
  const replyTo = record.reply_to
    ? {
        id: record.reply_to,
        author: toPerson(
          replyRecord?.expand?.author ?? {
            id: replyRecord?.author ?? "unknown",
            name: "Member",
          },
        ),
        body: replyRecord?.body ?? "The original message is unavailable.",
      }
    : null;

  return {
    id: record.id,
    conversationId: record.conversation,
    author: toPerson(
      record.expand?.author ?? { id: record.author, name: "Member" },
    ),
    body: record.body,
    createdAt: formatTimestamp(record.created),
    createdAtIso: record.created,
    editedAt: record.edited_at || undefined,
    replyTo,
    reactions,
  };
}

function toReaction(record: PBReaction): Reaction {
  return {
    id: record.id,
    messageId: record.message,
    emoji: record.emoji,
    user: toPerson(
      record.expand?.user ?? { id: record.user, name: "Member" },
    ),
    createdAtIso: record.created,
  };
}

function toConversationRead(record: PBConversationRead): ConversationRead {
  return {
    id: record.id,
    conversationId: record.conversation,
    user: toPerson(
      record.expand?.user ?? { id: record.user, name: "Member" },
    ),
    lastReadAt: record.last_read_at,
    lastReadMessageId: record.last_read_message || undefined,
  };
}

function dedupePeople(people: Person[]): Person[] {
  const seen = new Set<string>();
  return people.filter((person) => {
    if (seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
}

function toConversation(
  record: PBConversation,
  currentUserId: string,
): Conversation {
  const participants = dedupePeople(
    (record.expand?.participants ?? []).map((user) => toPerson(user)),
  ).filter((person) => person.id !== currentUserId);

  const title =
    record.kind === "direct" && participants.length === 1
      ? participants[0].name
      : record.title;

  return {
    id: record.id,
    title,
    kind: record.kind,
    participants,
    messages: [],
    unreadCount: 0,
    createdBy: record.created_by,
    createdAt: record.created,
    lastMessagePreview: record.last_message_preview ?? "",
    lastMessageAt: record.last_message_at ?? "",
    lastMessageAuthorId: record.last_message_author ?? "",
  };
}

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((left, right) => {
    const leftDate =
      parsePocketBaseDate(left.lastMessageAt) ??
      parsePocketBaseDate(left.createdAt);
    const rightDate =
      parsePocketBaseDate(right.lastMessageAt) ??
      parsePocketBaseDate(right.createdAt);
    return (rightDate?.getTime() ?? 0) - (leftDate?.getTime() ?? 0);
  });
}

export async function restoreSession(): Promise<SessionUser | null> {
  await authStore.hydrate();

  if (!authStore.isValid) {
    authStore.clear();
    return null;
  }

  try {
    const auth = await pb.collection("users").authRefresh();
    return sessionUserFromRecord(auth.record);
  } catch (error) {
    // Keep the stored session when the API is temporarily unreachable.
    if (error instanceof ClientResponseError && error.status === 0) {
      return sessionUserFromRecord(authStore.record);
    }
    authStore.clear();
    return null;
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<SessionUser> {
  const auth = await pb
    .collection("users")
    .authWithPassword(email.trim(), password);
  const user = sessionUserFromRecord(auth.record);
  if (!user) throw new Error("The server returned an invalid account.");
  return user;
}

export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<SessionUser> {
  await pb.collection("users").create({
    name: name.trim(),
    email: email.trim(),
    password,
    passwordConfirm: password,
    emailVisibility: false,
  });
  return signIn(email, password);
}

export async function signOut(): Promise<void> {
  try {
    await pb.realtime.unsubscribe();
  } catch {
    // Ignore a failed realtime teardown; the auth store still needs clearing.
  }
  pb.authStore.clear();
}

export async function fetchConversations(
  currentUserId: string,
): Promise<Conversation[]> {
  const records = await pb
    .collection("conversations")
    .getFullList<PBConversation>({ expand: "participants" });
  return sortConversations(
    records.map((record) => toConversation(record, currentUserId)),
  );
}

export async function fetchPeople(
  currentUserId: string,
): Promise<Person[]> {
  const records = await pb
    .collection("users")
    .getFullList<PBUserRecord>({ sort: "name" });
  return records
    .filter((record) => record.id !== currentUserId)
    .map((record) => toPerson(record));
}

async function fetchReactionRecords(
  conversationId: string,
): Promise<PBReaction[]> {
  return pb.collection("message_reactions").getFullList<PBReaction>({
    filter: pb.filter("message.conversation = {:conversation}", {
      conversation: conversationId,
    }),
    sort: "created",
    expand: "user",
  });
}

export async function fetchMessages(
  conversationId: string,
): Promise<Message[]> {
  const [records, reactionRecords] = await Promise.all([
    pb.collection("messages").getFullList<PBMessage>({
      filter: pb.filter("conversation = {:conversation}", {
        conversation: conversationId,
      }),
      sort: "created",
      expand: "author,reply_to.author",
    }),
    fetchReactionRecords(conversationId),
  ]);

  const reactionsByMessage = new Map<string, Reaction[]>();
  for (const record of reactionRecords) {
    const reaction = toReaction(record);
    const list = reactionsByMessage.get(reaction.messageId) ?? [];
    list.push(reaction);
    reactionsByMessage.set(reaction.messageId, list);
  }

  return records.map((record) =>
    toMessage(record, reactionsByMessage.get(record.id) ?? []),
  );
}

export async function searchMessageConversations(
  needle: string,
): Promise<string[]> {
  const records = await pb.collection("messages").getFullList<PBMessage>({
    filter: pb.filter("body ~ {:needle}", { needle }),
    fields: "conversation",
  });
  return [...new Set(records.map((record) => record.conversation))];
}

export async function createMessage(
  conversationId: string,
  authorId: string,
  body: string,
  replyToId?: string,
): Promise<Message> {
  const record = await pb.collection("messages").create<PBMessage>(
    {
      conversation: conversationId,
      author: authorId,
      body,
      ...(replyToId ? { reply_to: replyToId } : {}),
    },
    { expand: "author,reply_to.author" },
  );
  return toMessage(record);
}

export async function editMessage(
  messageId: string,
  body: string,
): Promise<Message> {
  const record = await pb.collection("messages").update<PBMessage>(
    messageId,
    {
      body,
      edited_at: new Date().toISOString(),
    },
    { expand: "author,reply_to.author" },
  );
  return toMessage(record);
}

export async function deleteMessage(messageId: string): Promise<void> {
  await pb.collection("messages").delete(messageId);
}

export async function addReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<Reaction> {
  const record = await pb
    .collection("message_reactions")
    .create<PBReaction>(
      { message: messageId, user: userId, emoji },
      { expand: "user" },
    );
  return toReaction(record);
}

export async function removeReaction(reactionId: string): Promise<void> {
  await pb.collection("message_reactions").delete(reactionId);
}

export async function createDirectConversation(
  person: Person,
  currentUser: Person,
): Promise<Conversation> {
  const record = await pb.collection("conversations").create<PBConversation>(
    {
      title: person.name,
      kind: "direct",
      created_by: currentUser.id,
      participants: [currentUser.id, person.id],
    },
    { expand: "participants" },
  );

  const conversation = toConversation(record, currentUser.id);
  return {
    ...conversation,
    title: person.name,
    participants:
      conversation.participants.length > 0
        ? conversation.participants
        : [person],
  };
}

export async function removeConversation(conversationId: string): Promise<void> {
  await pb.collection("conversations").delete(conversationId);
}

async function findConversationRead(
  conversationId: string,
  userId: string,
): Promise<PBConversationRead | null> {
  try {
    return await pb
      .collection("conversation_reads")
      .getFirstListItem<PBConversationRead>(
        pb.filter("conversation = {:conversation} && user = {:user}", {
          conversation: conversationId,
          user: userId,
        }),
        { expand: "user" },
      );
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchConversationReads(
  conversationId: string,
): Promise<ConversationRead[]> {
  const records = await pb
    .collection("conversation_reads")
    .getFullList<PBConversationRead>({
      filter: pb.filter("conversation = {:conversation}", {
        conversation: conversationId,
      }),
      expand: "user",
    });
  return records.map(toConversationRead);
}

/**
 * Upsert the caller's read position. `readAtIso` should be the server timestamp
 * of the newest message they have seen so receipts compare consistently.
 */
export async function markConversationRead(
  conversationId: string,
  userId: string,
  lastReadMessageId: string | null,
  readAtIso: string,
): Promise<ConversationRead | null> {
  const data = {
    last_read_message: lastReadMessageId ?? "",
    last_read_at: readAtIso,
  };
  const existing = await findConversationRead(conversationId, userId);

  if (existing) {
    const current = parsePocketBaseDate(existing.last_read_at)?.getTime() ?? 0;
    const target = parsePocketBaseDate(readAtIso)?.getTime() ?? 0;
    if (current >= target) return toConversationRead(existing);

    const updated = await pb
      .collection("conversation_reads")
      .update<PBConversationRead>(existing.id, data, { expand: "user" });
    return toConversationRead(updated);
  }

  try {
    const created = await pb
      .collection("conversation_reads")
      .create<PBConversationRead>(
        { conversation: conversationId, user: userId, ...data },
        { expand: "user" },
      );
    return toConversationRead(created);
  } catch (error) {
    // A concurrent request may have created the unique (conversation, user)
    // row between our lookup and insert.
    if (error instanceof ClientResponseError && error.status === 400) {
      const retry = await findConversationRead(conversationId, userId);
      if (retry) {
        const current = parsePocketBaseDate(retry.last_read_at)?.getTime() ?? 0;
        const target = parsePocketBaseDate(readAtIso)?.getTime() ?? 0;
        if (current >= target) return toConversationRead(retry);
        const updated = await pb
          .collection("conversation_reads")
          .update<PBConversationRead>(retry.id, data, { expand: "user" });
        return toConversationRead(updated);
      }
    }
    throw error;
  }
}

const typingRecordIds = new Map<string, string>();

function typingKey(conversationId: string, userId: string): string {
  return `${conversationId}:${userId}`;
}

export async function fetchTypingIndicators(
  conversationId: string,
): Promise<TypingIndicator[]> {
  const records = await pb
    .collection("typing_indicators")
    .getFullList<PBTypingIndicator>({
      filter: pb.filter("conversation = {:conversation}", {
        conversation: conversationId,
      }),
    });
  return records.map((record) => ({
    conversationId: record.conversation,
    userId: record.user,
    lastSeenIso: record.last_seen,
  }));
}

export async function heartbeatTyping(
  conversationId: string,
  userId: string,
): Promise<void> {
  const lastSeen = new Date().toISOString();
  const key = typingKey(conversationId, userId);
  const cachedId = typingRecordIds.get(key);

  if (cachedId) {
    try {
      await pb
        .collection("typing_indicators")
        .update(cachedId, { last_seen: lastSeen });
      return;
    } catch (error) {
      if (!(error instanceof ClientResponseError) || error.status !== 404) {
        throw error;
      }
      typingRecordIds.delete(key);
    }
  }

  let existing: PBTypingIndicator | null = null;
  try {
    existing = await pb
      .collection("typing_indicators")
      .getFirstListItem<PBTypingIndicator>(
        pb.filter("conversation = {:conversation} && user = {:user}", {
          conversation: conversationId,
          user: userId,
        }),
        { fields: "id" },
      );
  } catch (error) {
    if (!(error instanceof ClientResponseError) || error.status !== 404) {
      throw error;
    }
  }

  if (existing) {
    typingRecordIds.set(key, existing.id);
    await pb
      .collection("typing_indicators")
      .update(existing.id, { last_seen: lastSeen });
    return;
  }

  const created = await pb
    .collection("typing_indicators")
    .create<PBTypingIndicator>({
      conversation: conversationId,
      user: userId,
      last_seen: lastSeen,
    });
  typingRecordIds.set(key, created.id);
}

export async function clearTypingIndicator(
  conversationId: string,
  userId: string,
): Promise<void> {
  const key = typingKey(conversationId, userId);
  const cachedId = typingRecordIds.get(key);
  typingRecordIds.delete(key);

  if (cachedId) {
    try {
      await pb.collection("typing_indicators").delete(cachedId);
      return;
    } catch (error) {
      if (!(error instanceof ClientResponseError) || error.status !== 404) {
        throw error;
      }
    }
  }

  try {
    const existing = await pb
      .collection("typing_indicators")
      .getFirstListItem<PBTypingIndicator>(
        pb.filter("conversation = {:conversation} && user = {:user}", {
          conversation: conversationId,
          user: userId,
        }),
        { fields: "id" },
      );
    await pb.collection("typing_indicators").delete(existing.id);
  } catch (error) {
    if (!(error instanceof ClientResponseError) || error.status !== 404) {
      throw error;
    }
  }
}

export async function subscribeToMessages(
  onEvent: (event: MessageSubscriptionEvent) => void,
): Promise<() => Promise<void>> {
  return pb.collection("messages").subscribe<PBMessage>(
    "*",
    (event) => {
      onEvent({
        action: event.action,
        record: event.record,
        message: event.action === "delete" ? undefined : toMessage(event.record),
      });
    },
    { expand: "author,reply_to.author" },
  );
}

export async function subscribeToConversations(
  onEvent: (event: ConversationSubscriptionEvent) => void,
): Promise<() => Promise<void>> {
  return pb.collection("conversations").subscribe<PBConversation>(
    "*",
    (event) => {
      onEvent({ action: event.action, record: event.record });
    },
    { expand: "participants" },
  );
}

export async function subscribeToReactions(
  onEvent: (event: ReactionSubscriptionEvent) => void,
): Promise<() => Promise<void>> {
  return pb.collection("message_reactions").subscribe<PBReaction>(
    "*",
    (event) => {
      onEvent({
        action: event.action,
        record: event.record,
        reaction:
          event.action === "delete" ? undefined : toReaction(event.record),
      });
    },
    { expand: "user" },
  );
}

export async function subscribeToConversationReads(
  onEvent: (event: ConversationReadSubscriptionEvent) => void,
): Promise<() => Promise<void>> {
  return pb
    .collection("conversation_reads")
    .subscribe<PBConversationRead>(
      "*",
      (event) => {
        onEvent({
          action: event.action,
          record: event.record,
          read:
            event.action === "delete"
              ? undefined
              : toConversationRead(event.record),
        });
      },
      { expand: "user" },
    );
}

export async function subscribeToTypingIndicators(
  onEvent: (event: TypingSubscriptionEvent) => void,
): Promise<() => Promise<void>> {
  return pb
    .collection("typing_indicators")
    .subscribe<PBTypingIndicator>("*", (event) => {
      onEvent({
        action: event.action,
        record: event.record,
        typing:
          event.action === "delete"
            ? undefined
            : {
                conversationId: event.record.conversation,
                userId: event.record.user,
                lastSeenIso: event.record.last_seen,
              },
      });
    });
}

export function describeError(error: unknown): string {
  if (error instanceof ClientResponseError) {
    if (error.status === 0) {
      return `Can't reach the Open Services server at ${POCKETBASE_URL}. Check that the backend is running and, on a phone, that the device and computer are on the same Wi-Fi network.`;
    }

    const data = error.response?.data;
    if (data && typeof data === "object") {
      for (const value of Object.values(data)) {
        if (
          value &&
          typeof value === "object" &&
          typeof (value as { message?: unknown }).message === "string"
        ) {
          return (value as { message: string }).message;
        }
      }
    }

    if (error.status === 401 || error.status === 403) {
      return "Your session expired. Please sign in again.";
    }
    if (error.status === 404) {
      return "That item is no longer available.";
    }
    return error.message || "Something went wrong.";
  }

  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
