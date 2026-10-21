import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import PocketBase, {
  BaseAuthStore,
  ClientResponseError,
  type AuthRecord,
  type RecordModel,
} from "pocketbase";
import { Platform } from "react-native";

import type { Conversation, Message, Person } from "../types";

const AUTH_KEY = "open-services-auth";

const DEFAULT_URL =
  Platform.OS === "android" ? "http://10.0.2.2:8090" : "http://127.0.0.1:8090";

export const POCKETBASE_URL = (
  process.env.EXPO_PUBLIC_POCKETBASE_URL || DEFAULT_URL
).replace(/\/+$/, "");

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
  expand?: { author?: PBUserRecord };
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

function toMessage(record: PBMessage): Message {
  return {
    id: record.id,
    conversationId: record.conversation,
    author: toPerson(
      record.expand?.author ?? { id: record.author, name: "Member" },
    ),
    body: record.body,
    createdAt: formatTimestamp(record.created),
    createdAtIso: record.created,
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

export async function fetchMessages(
  conversationId: string,
): Promise<Message[]> {
  const records = await pb.collection("messages").getFullList<PBMessage>({
    filter: pb.filter("conversation = {:conversation}", {
      conversation: conversationId,
    }),
    sort: "created",
    expand: "author",
  });
  return records.map(toMessage);
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
): Promise<Message> {
  const record = await pb.collection("messages").create<PBMessage>(
    { conversation: conversationId, author: authorId, body },
    { expand: "author" },
  );
  return toMessage(record);
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
    { expand: "author" },
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

export function describeError(error: unknown): string {
  if (error instanceof ClientResponseError) {
    if (error.status === 0) {
      return `Can't reach the Open Services server at ${POCKETBASE_URL}. Is it running?`;
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
