import { HttpError } from "./http";
import type { AuthContext, Env, SessionRow, UserRow } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function passwordIterations(env: Env): number {
  const parsed = Number(env.PBKDF2_ITERATIONS);
  if (!Number.isFinite(parsed)) return 100_000;
  return Math.min(1_000_000, Math.max(10_000, Math.floor(parsed)));
}

function sessionTtlMs(env: Env): number {
  const parsed = Number(env.SESSION_TTL_DAYS);
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Secrets never fall back to a built-in constant: a known default would let
 * anyone forge session hashes and realtime tickets. Anything other than an
 * explicit development environment fails closed.
 */
function secretValue(env: Env, kind: "session" | "ticket"): string {
  const value = kind === "session" ? env.SESSION_SECRET : env.TICKET_SECRET;
  if (value && value.length >= 32) return value;

  const name = kind === "session" ? "SESSION_SECRET" : "TICKET_SECRET";
  if (env.ENVIRONMENT !== "development") {
    throw new HttpError(
      500,
      "server_misconfigured",
      `${name} is not configured.`,
    );
  }
  throw new HttpError(
    500,
    "server_misconfigured",
    `${name} must be set to at least 32 characters.`,
  );
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  env: Env,
): Promise<string> {
  const iterations = passwordIterations(env);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") {
    return false;
  }

  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  try {
    const salt = base64UrlToBytes(parts[3]);
    const expected = base64UrlToBytes(parts[4]);
    const actual = await pbkdf2(password, salt, iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  return new Uint8Array(signature);
}

export async function hashSessionToken(
  token: string,
  env: Env,
): Promise<string> {
  return bytesToHex(await hmacSha256(secretValue(env, "session"), token));
}

function newOpaqueToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(
  env: Env,
  userId: string,
  request: Request,
): Promise<{ token: string; session: SessionRow }> {
  const token = newOpaqueToken();
  const tokenHash = await hashSessionToken(token, env);
  const createdAt = nowIso();
  const session: SessionRow = {
    id: newId(),
    user_id: userId,
    token_hash: tokenHash,
    created_at: createdAt,
    last_seen_at: createdAt,
    expires_at: new Date(Date.now() + sessionTtlMs(env)).toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO sessions
      (id, user_id, token_hash, created_at, last_seen_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      session.id,
      session.user_id,
      session.token_hash,
      session.created_at,
      session.last_seen_at,
      session.expires_at,
      request.headers.get("User-Agent")?.slice(0, 300) ?? null,
    )
    .run();

  return { token, session };
}

export async function refreshSession(
  env: Env,
  context: AuthContext,
  request: Request,
): Promise<string> {
  const token = newOpaqueToken();
  const tokenHash = await hashSessionToken(token, env);
  const now = nowIso();

  await env.DB.prepare(
    `UPDATE sessions
     SET token_hash = ?, last_seen_at = ?, expires_at = ?, user_agent = ?
     WHERE id = ?`,
  )
    .bind(
      tokenHash,
      now,
      new Date(Date.now() + sessionTtlMs(env)).toISOString(),
      request.headers.get("User-Agent")?.slice(0, 300) ?? null,
      context.session.id,
    )
    .run();

  return token;
}

export async function deleteSession(
  env: Env,
  sessionId: string,
): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?")
    .bind(sessionId)
    .run();
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export async function authenticate(
  request: Request,
  env: Env,
): Promise<AuthContext> {
  const token = bearerToken(request);
  if (!token) {
    throw new HttpError(401, "missing_session", "Sign in to continue.");
  }

  const tokenHash = await hashSessionToken(token, env);
  const row = await env.DB.prepare(
    `SELECT
       s.id AS session_id,
       s.user_id,
       s.token_hash,
       s.created_at AS session_created_at,
       s.last_seen_at,
       s.expires_at,
       u.name,
       u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{
      session_id: string;
      user_id: string;
      token_hash: string;
      session_created_at: string;
      last_seen_at: string;
      expires_at: string;
      name: string;
      email: string;
    }>();

  if (!row) {
    throw new HttpError(401, "invalid_session", "Your session expired. Please sign in again.");
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    await deleteSession(env, row.session_id);
    throw new HttpError(401, "expired_session", "Your session expired. Please sign in again.");
  }

  return {
    user: { id: row.user_id, name: row.name, email: row.email },
    session: {
      id: row.session_id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      created_at: row.session_created_at,
      last_seen_at: row.last_seen_at,
      expires_at: row.expires_at,
    },
  };
}

export type RealtimeTicket = {
  userId: string;
  sessionId: string;
  expiresAt: string;
};

export async function createRealtimeTicket(
  env: Env,
  userId: string,
  sessionId: string,
): Promise<{ ticket: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const payload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        userId,
        sessionId,
        exp: Date.parse(expiresAt),
        nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(12))),
      }),
    ),
  );
  const signature = bytesToBase64Url(
    await hmacSha256(secretValue(env, "ticket"), payload),
  );
  return { ticket: `${payload}.${signature}`, expiresAt };
}

export async function verifyRealtimeTicket(
  env: Env,
  ticket: string,
): Promise<RealtimeTicket> {
  const [payload, signature] = ticket.split(".");
  if (!payload || !signature) {
    throw new HttpError(401, "invalid_ticket", "The realtime ticket is invalid.");
  }

  // A malformed ticket must never surface as a server error: an unauthenticated
  // caller could otherwise turn the endpoint into a log-flooding source.
  let actual: Uint8Array;
  try {
    actual = base64UrlToBytes(signature);
  } catch {
    throw new HttpError(401, "invalid_ticket", "The realtime ticket is invalid.");
  }

  const expected = await hmacSha256(secretValue(env, "ticket"), payload);
  if (!constantTimeEqual(expected, actual)) {
    throw new HttpError(401, "invalid_ticket", "The realtime ticket is invalid.");
  }

  let parsed: { userId?: unknown; sessionId?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(decoder.decode(base64UrlToBytes(payload))) as {
      userId?: unknown;
      sessionId?: unknown;
      exp?: unknown;
    };
  } catch {
    throw new HttpError(401, "invalid_ticket", "The realtime ticket is invalid.");
  }

  if (
    typeof parsed.userId !== "string" ||
    typeof parsed.exp !== "number" ||
    parsed.exp <= Date.now()
  ) {
    throw new HttpError(401, "expired_ticket", "The realtime ticket expired. Reconnect to continue.");
  }

  return {
    userId: parsed.userId,
    sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : "",
    expiresAt: new Date(parsed.exp).toISOString(),
  };
}

/**
 * A ticket is only usable while its session is still alive. Signing out or
 * expiring the session therefore invalidates tickets that were handed out
 * earlier.
 */
export async function isSessionActive(
  env: Env,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  if (!sessionId) return false;
  const row = await env.DB.prepare(
    "SELECT id FROM sessions WHERE id = ? AND user_id = ? AND expires_at > ?",
  )
    .bind(sessionId, userId, nowIso())
    .first<{ id: string }>();
  return row !== null;
}

export async function cleanupExpiredSessions(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?")
    .bind(nowIso())
    .run();
}

export async function findUserByEmail(
  env: Env,
  email: string,
): Promise<UserRow | null> {
  return env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(normalizeEmail(email))
    .first<UserRow>();
}

export async function findUserById(
  env: Env,
  userId: string,
): Promise<UserRow | null> {
  return env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
}
