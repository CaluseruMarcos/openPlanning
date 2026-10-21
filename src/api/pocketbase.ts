import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type {
  Conversation,
  ConversationRead,
  Message,
  Person,
  Reaction,
  TypingIndicator,
} from "../types";

const AUTH_KEY = "open-services-auth-v2";
const API_PORT = 8787;

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

const configuredUrl =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  process.env.EXPO_PUBLIC_POCKETBASE_URL?.trim();

/**
 * The API origin is public build configuration, but the session token that the
 * app stores is a long-lived credential. It must never be sent to a host that
 * did not issue it, so the origin is validated and the stored token is bound
 * to it.
 *
 * A misconfigured build does not crash the app here. The problem is reported
 * on the first request instead, so the user sees a message instead of a blank
 * screen.
 */
let apiUrlError: string | null = null;

function resolveApiUrl(): string {
  const raw = configuredUrl || developmentApiUrl() || DEFAULT_URL;

  let url: URL;
  try {
    url = new URL(normalizeBaseUrl(raw));
  } catch {
    apiUrlError = "The API URL is not a valid address.";
    return normalizeBaseUrl(raw);
  }

  if (url.username || url.password) {
    apiUrlError = "The API URL must not contain credentials.";
  } else if (url.protocol !== "https:" && !__DEV__) {
    // Release builds talk to the API over TLS only. Local development is
    // allowed to use plain HTTP on loopback and LAN addresses.
    apiUrlError = "The API URL must use https outside development builds.";
  }

  return normalizeBaseUrl(raw);
}

export const API_URL = resolveApiUrl();

/**
 * Compatibility alias. The app used to point this at PocketBase; screens still
 * display the resolved server URL under this name.
 */
export const POCKETBASE_URL = API_URL;

/** WebSocket origin derived from the validated API URL. */
export const REALTIME_URL = (() => {
  const url = new URL(API_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString().replace(/\/+$/, "");
})();

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

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

type StoredAuth = {
  /** API origin that issued the token. A token is never sent elsewhere. */
  origin: string;
  token: string;
  user: SessionUser;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

let authToken: string | null = null;
let authUser: SessionUser | null = null;
let hydratePromise: Promise<void> | null = null;
let hydrated = false;

/**
 * The server rejected the session. The UI has to leave the signed-in state,
 * otherwise the app keeps showing a workspace that no longer works.
 */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    try {
      listener();
    } catch {
      // A failing listener must not break the request that reported the error.
    }
  }
}

async function hydrateAuth(): Promise<void> {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const serialized = await authStorage.getItem(AUTH_KEY);
        if (!serialized) return;
        const parsed = JSON.parse(serialized) as Partial<StoredAuth>;
        if (
          typeof parsed.token === "string" &&
          parsed.user &&
          typeof parsed.user.id === "string" &&
          typeof parsed.user.name === "string" &&
          typeof parsed.user.email === "string"
        ) {
          // A token issued by a different API origin is never reused. Without
          // this check, pointing the build at another host would hand that host
          // the stored credential.
          if (parsed.origin && parsed.origin !== API_URL) {
            await authStorage.removeItem(AUTH_KEY).catch(() => undefined);
            return;
          }
          authToken = parsed.token;
          authUser = parsed.user;
        }
      } catch {
        // A corrupt or unreadable token behaves like a signed-out session.
      } finally {
        hydrated = true;
      }
    })();
  }
  await hydratePromise;
}

async function saveAuth(token: string, user: SessionUser): Promise<void> {
  authToken = token;
  authUser = user;
  hydrated = true;
  await authStorage
    .setItem(AUTH_KEY, JSON.stringify({ origin: API_URL, token, user }))
    .catch(() => undefined);
}

async function clearAuth(): Promise<void> {
  authToken = null;
  authUser = null;
  hydrated = true;
  // A failed removal would leave the credential on disk, so the failure is
  // reported instead of being swallowed.
  await authStorage.removeItem(AUTH_KEY);
}

type ApiOptions = RequestInit & { auth?: boolean };

/** Every response this API produces is far below these limits. */
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

type ErrorBody = {
  error?: { code?: string; message?: string };
  message?: string;
};

async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  if (apiUrlError) {
    // Refuse to send the session token to an unverified destination.
    throw new ApiError(0, "invalid_api_url", apiUrlError);
  }

  await hydrateAuth();

  const { auth = true, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (auth && authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(
        0,
        "timeout",
        "The server took too long to answer. Please try again.",
      );
    }
    throw new ApiError(
      0,
      "network_error",
      `Can't reach the Open Services server at ${API_URL}.`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new ApiError(
      0,
      "response_too_large",
      "The server sent an unexpectedly large response.",
    );
  }
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const body = (parsed ?? {}) as ErrorBody;
    const message =
      body.error?.message ||
      body.message ||
      (response.status === 401
        ? "Your session expired. Please sign in again."
        : "Something went wrong.");
    const code = body.error?.code ?? "http_error";

    if (response.status === 401 && auth) {
      realtime.close();
      void clearAuth();
      notifyUnauthorized();
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204 || !text) {
    return undefined as T;
  }
  return parsed as T;
}

type ApiPerson = {
  id: string;
  name: string;
};

type ApiConversation = {
  id: string;
  title: string;
  kind: "direct" | "team" | "group";
  participants: ApiPerson[];
  createdBy: string;
  createdAt: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  lastMessageAuthorId: string;
};

type ApiReply = {
  id: string;
  author: ApiPerson;
  body: string;
};

type ApiReaction = {
  id: string;
  messageId: string;
  emoji: string;
  user: ApiPerson;
  createdAtIso: string;
};

type ApiMessage = {
  id: string;
  conversationId: string;
  author: ApiPerson;
  body: string;
  createdAt: string;
  createdAtIso: string;
  editedAt?: string;
  replyTo: ApiReply | null;
  reactions: ApiReaction[];
};

type ApiRead = {
  id: string;
  conversationId: string;
  user: ApiPerson;
  lastReadAt: string;
  lastReadMessageId?: string;
};

type ApiUser = {
  id: string;
  name: string;
  email: string;
};

type ServerEvent =
  | { type: "ready"; userId: string; connectedAt: string }
  | { type: "pong" }
  | { type: "message.created"; conversationId: string; message: ApiMessage }
  | { type: "message.updated"; conversationId: string; message: ApiMessage }
  | { type: "message.deleted"; conversationId: string; messageId: string }
  | { type: "conversation.created"; conversation: ApiConversation }
  | { type: "conversation.updated"; conversation: ApiConversation }
  | { type: "conversation.deleted"; conversationId: string }
  | { type: "reaction.added"; reaction: ApiReaction }
  | {
      type: "reaction.removed";
      reactionId: string;
      messageId: string;
      conversationId: string;
    }
  | { type: "read.updated"; read: ApiRead }
  | {
      type: "typing.updated";
      conversationId: string;
      userId: string;
      expiresAt: string;
    }
  | { type: "typing.stopped"; conversationId: string; userId: string }
  | { type: "error"; code: string; message: string };

type RealtimeStatus = "connecting" | "connected" | "disconnected";

const MAX_REALTIME_FRAME_BYTES = 512 * 1024;

const SERVER_EVENT_TYPES = new Set([
  "ready",
  "pong",
  "message.created",
  "message.updated",
  "message.deleted",
  "conversation.created",
  "conversation.updated",
  "conversation.deleted",
  "reaction.added",
  "reaction.removed",
  "read.updated",
  "typing.updated",
  "typing.stopped",
  "error",
]);

/** Frames that are not a known event are dropped instead of dispatched. */
function isServerEvent(value: unknown): value is ServerEvent {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && SERVER_EVENT_TYPES.has(type);
}

type RealtimeListener = (event: ServerEvent) => void;
type StatusListener = (status: RealtimeStatus) => void;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<RealtimeListener>();
  private statusListeners = new Set<StatusListener>();
  private attempt = 0;
  private manuallyClosed = false;

  ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connecting) return this.connecting;

    this.manuallyClosed = false;
    this.setStatus("connecting");

    this.connecting = (async () => {
      const token = await hydrateAuth().then(() => authToken);
      if (!token) {
        throw new ApiError(401, "missing_session", "Sign in to continue.");
      }

      const { ticket } = await apiFetch<{ ticket: string }>(
        "/api/realtime/ticket",
        { method: "POST" },
      );

      const websocketUrl = `${REALTIME_URL}/api/realtime?ticket=${encodeURIComponent(ticket)}`;
      const socket = new WebSocket(websocketUrl);
      this.socket = socket;

      socket.onopen = () => {
        this.attempt = 0;
        this.setStatus("connected");
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 30_000);
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        if (event.data.length > MAX_REALTIME_FRAME_BYTES) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        // A frame without a known type is ignored instead of being dispatched
        // into the state handlers.
        if (!isServerEvent(parsed)) return;

        if (parsed.type === "ready") {
          this.setStatus("connected");
        } else if (parsed.type !== "pong") {
          for (const listener of this.listeners) {
            try {
              listener(parsed);
            } catch {
              // One failing handler must not stop the other subscribers.
            }
          }
        }
      };

      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
        this.connecting = null;
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        this.setStatus("disconnected");
        if (!this.manuallyClosed && this.listeners.size > 0) {
          this.scheduleReconnect();
        }
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          // The close handler does the cleanup.
        }
      };
    })()
      .catch((error) => {
        this.connecting = null;
        this.setStatus("disconnected");
        const unauthorized =
          error instanceof ApiError && error.status === 401;
        if (unauthorized) {
          this.manuallyClosed = true;
        } else if (!this.manuallyClosed && this.listeners.size > 0) {
          this.scheduleReconnect();
        }
        throw error;
      })
      .finally(() => {
        this.connecting = null;
      });

    return this.connecting;
  }

  on(prefix: string, listener: RealtimeListener): () => void {
    const wrapped: RealtimeListener = (event) => {
      if (event.type === prefix || event.type.startsWith(`${prefix}.`)) {
        listener(event);
      }
    };
    this.listeners.add(wrapped);
    void this.ensureConnected().catch(() => undefined);
    return () => {
      this.listeners.delete(wrapped);
    };
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.connecting = null;
    try {
      socket?.close();
    } catch {
      // The socket is already closed.
    }
    this.setStatus("disconnected");
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manuallyClosed) return;
    const delay =
      Math.min(30_000, 1_000 * 2 ** this.attempt) +
      Math.floor(Math.random() * 500);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected().catch(() => undefined);
    }, delay);
  }

  private setStatus(status: RealtimeStatus): void {
    for (const listener of this.statusListeners) listener(status);
  }
}

const realtime = new RealtimeClient();

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

function toMessage(record: ApiMessage): Message {
  return {
    id: record.id,
    conversationId: record.conversationId,
    author: toPerson(record.author),
    body: record.body,
    createdAt: formatTimestamp(record.createdAtIso),
    createdAtIso: record.createdAtIso,
    editedAt: record.editedAt || undefined,
    replyTo: record.replyTo
      ? {
          id: record.replyTo.id,
          author: toPerson(record.replyTo.author),
          body: record.replyTo.body,
        }
      : null,
    reactions: (record.reactions ?? []).map(toReaction),
  };
}

function toReaction(record: ApiReaction): Reaction {
  return {
    id: record.id,
    messageId: record.messageId,
    emoji: record.emoji,
    user: toPerson(record.user),
    createdAtIso: record.createdAtIso,
  };
}

function toConversationRead(record: ApiRead): ConversationRead {
  return {
    id: record.id,
    conversationId: record.conversationId,
    user: toPerson(record.user),
    lastReadAt: record.lastReadAt,
    lastReadMessageId: record.lastReadMessageId || undefined,
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
  record: ApiConversation,
  currentUserId: string,
): Conversation {
  const participants = dedupePeople(
    (record.participants ?? []).map((user) => toPerson(user)),
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
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    lastMessagePreview: record.lastMessagePreview ?? "",
    lastMessageAt: record.lastMessageAt ?? "",
    lastMessageAuthorId: record.lastMessageAuthorId ?? "",
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
  await hydrateAuth();

  if (!authToken) return null;

  try {
    // Rotating the token on every start keeps a stolen token from staying
    // valid for the full session lifetime.
    const data = await apiFetch<{ token: string; user: ApiUser }>(
      "/api/auth/refresh",
      { method: "POST" },
    );
    const user: SessionUser = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
    };
    await saveAuth(data.token, user);
    return user;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 0 || error.status >= 500) {
        // The server could not be reached or failed. Keep the cached identity
        // so the app can start offline instead of dropping the user.
        return authUser;
      }
      await clearAuth();
      return null;
    }
    // An unexpected failure must not be turned into a signed-in state.
    return null;
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<SessionUser> {
  const data = await apiFetch<{ token: string; user: ApiUser }>(
    "/api/auth/signin",
    {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: email.trim(), password }),
    },
  );
  const user: SessionUser = {
    id: data.user.id,
    name: data.user.name,
    email: data.user.email,
  };
  await saveAuth(data.token, user);
  return user;
}

export async function signUp(
  name: string,
  email: string,
  password: string,
  inviteCode: string,
): Promise<SessionUser> {
  const data = await apiFetch<{ token: string; user: ApiUser }>(
    "/api/auth/signup",
    {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        password,
        inviteCode: inviteCode.trim(),
      }),
    },
  );
  const user: SessionUser = {
    id: data.user.id,
    name: data.user.name,
    email: data.user.email,
  };
  await saveAuth(data.token, user);
  return user;
}

export async function signOut(): Promise<void> {
  await hydrateAuth();
  try {
    if (authToken) {
      await apiFetch<void>("/api/auth/signout", { method: "POST" });
    }
  } catch {
    // Local sign-out must succeed even if the server is unreachable.
  }
  realtime.close();
  try {
    await clearAuth();
  } catch {
    // The server side session is already revoked, so a token that could not
    // be removed from the device is worthless. The sign-out still stands.
  }
}

export async function fetchConversations(
  currentUserId: string,
): Promise<Conversation[]> {
  const all: ApiConversation[] = [];
  let offset = 0;

  for (let page = 0; page < 10; page += 1) {
    const data = await apiFetch<{
      items: ApiConversation[];
      nextOffset: number | null;
    }>(`/api/conversations?limit=100&offset=${offset}`);
    all.push(...data.items);
    if (data.nextOffset === null) break;
    offset = data.nextOffset;
  }

  return sortConversations(
    all.map((record) => toConversation(record, currentUserId)),
  );
}

export async function fetchPeople(
  currentUserId: string,
): Promise<Person[]> {
  const records = await apiFetch<ApiPerson[]>("/api/people");
  return records
    .filter((record) => record.id !== currentUserId)
    .map((record) => toPerson(record));
}

export async function fetchMessages(
  conversationId: string,
): Promise<Message[]> {
  const pages: ApiMessage[][] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const data = await apiFetch<{
      items: ApiMessage[];
      nextCursor: string | null;
    }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    );
    pages.unshift(data.items);
    cursor = data.nextCursor;
    if (!cursor) break;
  }

  return pages.flat().map(toMessage);
}

export async function searchMessageConversations(
  needle: string,
): Promise<string[]> {
  const params = new URLSearchParams({ q: needle });
  return apiFetch<string[]>(`/api/search/messages?${params.toString()}`);
}

export async function createMessage(
  conversationId: string,
  _authorId: string,
  body: string,
  replyToId?: string,
): Promise<Message> {
  const record = await apiFetch<ApiMessage>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        body,
        ...(replyToId ? { replyToId } : {}),
      }),
    },
  );
  return toMessage(record);
}

export async function editMessage(
  messageId: string,
  body: string,
): Promise<Message> {
  const record = await apiFetch<ApiMessage>(
    `/api/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ body }),
    },
  );
  return toMessage(record);
}

export async function deleteMessage(messageId: string): Promise<void> {
  await apiFetch<void>(`/api/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
}

export async function addReaction(
  messageId: string,
  _userId: string,
  emoji: string,
): Promise<Reaction> {
  const record = await apiFetch<ApiReaction>(
    `/api/messages/${encodeURIComponent(messageId)}/reactions`,
    {
      method: "POST",
      body: JSON.stringify({ emoji }),
    },
  );
  return toReaction(record);
}

export async function removeReaction(reactionId: string): Promise<void> {
  await apiFetch<void>(`/api/reactions/${encodeURIComponent(reactionId)}`, {
    method: "DELETE",
  });
}

export async function createDirectConversation(
  person: Person,
  currentUser: Person,
): Promise<Conversation> {
  const record = await apiFetch<ApiConversation>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title: person.name,
      kind: "direct",
      participantIds: [person.id],
    }),
  });

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
  await apiFetch<void>(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
    { method: "DELETE" },
  );
}

export async function fetchConversationReads(
  conversationId: string,
): Promise<ConversationRead[]> {
  const records = await apiFetch<ApiRead[]>(
    `/api/conversations/${encodeURIComponent(conversationId)}/reads`,
  );
  return records.map(toConversationRead);
}

/**
 * Upsert the caller's read position. The server derives the timestamp from the
 * referenced message (or uses its own clock for a null target), so a client
 * cannot forge a future read time.
 */
export async function markConversationRead(
  conversationId: string,
  _userId: string,
  lastReadMessageId: string | null,
  _readAtIso: string,
): Promise<ConversationRead | null> {
  const record = await apiFetch<ApiRead>(
    `/api/conversations/${encodeURIComponent(conversationId)}/read`,
    {
      method: "PUT",
      body: JSON.stringify({ lastReadMessageId }),
    },
  );
  return toConversationRead(record);
}

export async function fetchTypingIndicators(
  _conversationId: string,
): Promise<TypingIndicator[]> {
  // Typing is ephemeral and delivered over the realtime stream. There is no
  // durable snapshot to fetch when opening a conversation.
  return [];
}

export async function heartbeatTyping(
  conversationId: string,
  _userId: string,
): Promise<void> {
  await apiFetch<void>(
    `/api/conversations/${encodeURIComponent(conversationId)}/typing`,
    { method: "POST" },
  );
}

export async function clearTypingIndicator(
  conversationId: string,
  _userId: string,
): Promise<void> {
  await apiFetch<void>(
    `/api/conversations/${encodeURIComponent(conversationId)}/typing`,
    { method: "DELETE" },
  );
}

export type MessageSubscriptionEvent = {
  action: string;
  record: { id?: string; conversation?: string };
  message?: Message;
};

export type ConversationSubscriptionEvent = {
  action: string;
  record: { id?: string };
};

export type ReactionSubscriptionEvent = {
  action: string;
  record: { id?: string; message?: string; user?: string };
  reaction?: Reaction;
};

export type ConversationReadSubscriptionEvent = {
  action: string;
  record: { conversation?: string; user?: string };
  read?: ConversationRead;
};

export type TypingSubscriptionEvent = {
  action: string;
  record: { conversation?: string; user?: string };
  typing?: TypingIndicator;
};

export async function subscribeToMessages(
  onEvent: (event: MessageSubscriptionEvent) => void,
): Promise<() => Promise<void>> {
  const unsubscribe = realtime.on("message", (event) => {
    if (event.type === "message.created" || event.type === "message.updated") {
      const message = toMessage(event.message);
      onEvent({
        action: event.type === "message.created" ? "create" : "update",
        record: { id: message.id, conversation: message.conversationId },
        message,
      });
      return;
    }
    if (event.type === "message.deleted") {
      onEvent({
        action: "delete",
        record: {
          id: event.messageId,
          conversation: event.conversationId,
        },
      });
    }
  });
  return async () => unsubscribe();
}

export async function subscribeToConversations(
  onEvent: (event: ConversationSubscriptionEvent) => void,
): Promise<() => Promise<void>> {
  const unsubscribe = realtime.on("conversation", (event) => {
    if (event.type === "conversation.created" || event.type === "conversation.updated") {
      onEvent({
        action: event.type === "conversation.created" ? "create" : "update",
        record: { id: event.conversation.id },
      });
      return;
    }
    if (event.type === "conversation.deleted") {
      onEvent({
        action: "delete",
        record: { id: event.conversationId },
      });
    }
  });
  return async () => unsubscribe();
}

export async function subscribeToReactions(
  onEvent: (event: ReactionSubscriptionEvent) => void,
): Promise<() => Promise<void>> {
  const unsubscribe = realtime.on("reaction", (event) => {
    if (event.type === "reaction.added") {
      onEvent({
        action: "create",
        record: {
          id: event.reaction.id,
          message: event.reaction.messageId,
          user: event.reaction.user.id,
        },
        reaction: toReaction(event.reaction),
      });
      return;
    }
    if (event.type === "reaction.removed") {
      onEvent({
        action: "delete",
        record: { id: event.reactionId, message: event.messageId },
      });
    }
  });
  return async () => unsubscribe();
}

export async function subscribeToConversationReads(
  onEvent: (event: ConversationReadSubscriptionEvent) => void,
): Promise<() => Promise<void>> {
  const unsubscribe = realtime.on("read", (event) => {
    if (event.type !== "read.updated") return;
    onEvent({
      action: "update",
      record: {
        conversation: event.read.conversationId,
        user: event.read.user.id,
      },
      read: toConversationRead(event.read),
    });
  });
  return async () => unsubscribe();
}

export async function subscribeToTypingIndicators(
  onEvent: (event: TypingSubscriptionEvent) => void,
): Promise<() => Promise<void>> {
  const unsubscribe = realtime.on("typing", (event) => {
    if (event.type === "typing.updated") {
      const lastSeenIso = new Date().toISOString();
      onEvent({
        action: "update",
        record: {
          conversation: event.conversationId,
          user: event.userId,
        },
        typing: {
          conversationId: event.conversationId,
          userId: event.userId,
          lastSeenIso,
        },
      });
      return;
    }
    if (event.type === "typing.stopped") {
      onEvent({
        action: "delete",
        record: {
          conversation: event.conversationId,
          user: event.userId,
        },
      });
    }
  });
  return async () => unsubscribe();
}

export async function subscribeToRealtimeStatus(
  onStatus: (status: RealtimeStatus) => void,
): Promise<() => Promise<void>> {
  const unsubscribe = realtime.onStatus(onStatus);
  return async () => unsubscribe();
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return `Can't reach the Open Services server at ${API_URL}. Check that the backend is running and, on a phone, that the device and computer are on the same Wi-Fi network.`;
    }
    if (error.status === 401 || error.status === 403) {
      return error.message || "Your session expired. Please sign in again.";
    }
    if (error.status === 404) {
      return "That item is no longer available.";
    }
    return error.message || "Something went wrong.";
  }

  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
