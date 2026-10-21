import { newId, nowIso } from "./auth";
import { HttpError } from "./http";
import type { Env } from "./types";

/**
 * Invite codes are the way to add people to a deployment. Registration is
 * closed by default, so an account only exists when an owner hands out a code.
 *
 * The code is shown once and only its hash is stored, so a leaked database
 * does not hand out working codes.
 */

/** Unambiguous characters only: no O/0, I/1, U/V. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12;
const DEFAULT_LIFETIME_HOURS = 72;
const encoder = new TextEncoder();

export type InviteRow = {
  id: string;
  code_hash: string;
  email: string | null;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
};

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (let index = 0; index < bytes.length; index += 1) {
    code += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return code;
}

export async function hashInviteCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(code));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function createInvite(
  env: Env,
  options: { email?: string | null; note?: string | null; lifetimeHours?: number },
): Promise<{ code: string; id: string; expiresAt: string; email: string | null }> {
  const code = generateInviteCode();
  const codeHash = await hashInviteCode(code);
  const id = newId();
  const hours = Math.min(
    24 * 30,
    Math.max(1, Math.floor(options.lifetimeHours ?? DEFAULT_LIFETIME_HOURS)),
  );
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO invites
      (id, code_hash, email, note, created_at, expires_at, used_at, used_by)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
  )
    .bind(
      id,
      codeHash,
      options.email ?? null,
      options.note ?? null,
      nowIso(),
      expiresAt,
    )
    .run();

  return { code, id, expiresAt, email: options.email ?? null };
}

export async function findInviteByCode(
  env: Env,
  code: string,
): Promise<InviteRow | null> {
  const codeHash = await hashInviteCode(code.trim().toUpperCase());
  return env.DB.prepare("SELECT * FROM invites WHERE code_hash = ?")
    .bind(codeHash)
    .first<InviteRow>();
}

export type InviteCheck = {
  ok: boolean;
  reason?: "unknown" | "used" | "expired" | "email_mismatch";
  invite?: InviteRow;
};

/** Validates a code without consuming it. */
export async function checkInvite(
  env: Env,
  code: string,
  email: string,
): Promise<InviteCheck> {
  const invite = await findInviteByCode(env, code);
  if (!invite) return { ok: false, reason: "unknown" };
  if (invite.used_at) return { ok: false, reason: "used", invite };
  if (Date.parse(invite.expires_at) <= Date.now()) {
    return { ok: false, reason: "expired", invite };
  }
  if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
    return { ok: false, reason: "email_mismatch", invite };
  }
  return { ok: true, invite };
}

export async function listInvites(env: Env): Promise<InviteRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM invites ORDER BY created_at DESC LIMIT 100",
  ).all<InviteRow>();
  return results;
}

/** The admin key is the only way to create invites or accounts. */
export function assertAdminKey(request: Request, env: Env): void {
  const expected = env.ADMIN_KEY;
  if (!expected || expected.length < 32) {
    throw new HttpError(
      500,
      "server_misconfigured",
      "ADMIN_KEY is not configured.",
    );
  }

  const provided = request.headers.get("X-Admin-Key") ?? "";
  if (provided.length !== expected.length) {
    throw new HttpError(401, "unauthorized", "The admin key is not valid.");
  }

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (difference !== 0) {
    throw new HttpError(401, "unauthorized", "The admin key is not valid.");
  }
}
