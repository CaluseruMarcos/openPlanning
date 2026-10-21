import {
  authenticate,
  createRealtimeTicket,
  createSession,
  deleteSession,
  findUserByEmail,
  findUserById,
  hashPassword,
  isEmail,
  newId,
  normalizeEmail,
  nowIso,
  refreshSession,
  verifyPassword,
  verifyRealtimeTicket,
} from "./auth";
import {
  findDirectConversation,
  getConversationForUser,
  getConversationMemberIds,
  getMessageById,
  getMessageForUser,
  getReactionForUser,
  listConversations,
  listMessages,
  listPeople,
  listReads,
  refreshConversationSummary,
  requireConversationForUser,
  searchConversationIds,
  toApiMessage,
  toApiReaction,
  toApiRead,
  upsertRead,
} from "./db";
import {
  HttpError,
  jsonResponse,
  noContent,
  optionalStringField,
  readJson,
  stringField,
} from "./http";
import { publishToUsers } from "./realtime";
import type { AuthContext, Env } from "./types";

const MAX_PAGE_SIZE = 100;

function pageLimit(url: URL, fallback = 50): number {
  const raw = Number(url.searchParams.get("limit"));
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(raw)));
}

function pageOffset(url: URL): number {
  const raw = Number(url.searchParams.get("offset"));
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

function decodePathId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "invalid_id", "The item id is invalid.");
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return /unique constraint/i.test(String(error));
}

function parseParticipantIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new HttpError(
      400,
      "invalid_request",
      "participantIds must be an array.",
    );
  }
  const ids = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  const unique = [...new Set(ids.map((id) => id.trim()))];
  if (unique.length < 1 || unique.length > 100) {
    throw new HttpError(
      400,
      "invalid_request",
      "Add between 1 and 100 participants.",
    );
  }
  return unique;
}

async function signup(request: Request, env: Env): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(request);
  const name = stringField(body, "name", { min: 1, max: 80 });
  const email = normalizeEmail(
    stringField(body, "email", { min: 3, max: 254 }),
  );
  const password = stringField(body, "password", {
    min: 8,
    max: 200,
    trim: false,
  });

  if (!isEmail(email)) {
    throw new HttpError(400, "invalid_email", "Enter a valid email address.");
  }

  if (await findUserByEmail(env, email)) {
    throw new HttpError(
      409,
      "email_taken",
      "An account with that email already exists.",
    );
  }

  const userId = newId();
  const now = nowIso();
  try {
    await env.DB.prepare(
      `INSERT INTO users
        (id, email, name, password_hash, email_verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    )
      .bind(userId, email, name, await hashPassword(password, env), now, now)
      .run();
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new HttpError(
        409,
        "email_taken",
        "An account with that email already exists.",
      );
    }
    throw error;
  }

  const { token } = await createSession(env, userId, request);
  return jsonResponse(
    { token, user: { id: userId, name, email } },
    201,
  );
}

async function signin(request: Request, env: Env): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(request);
  const email = normalizeEmail(
    stringField(body, "email", { min: 3, max: 254 }),
  );
  const password = stringField(body, "password", {
    min: 1,
    max: 200,
    trim: false,
  });

  const user = await findUserByEmail(env, email);
  if (!user) {
    // Spend the same password-derivation work as a real account so a missing
    // email is not distinguishable by response timing.
    await hashPassword(password, env);
    throw new HttpError(
      401,
      "invalid_credentials",
      "Invalid email or password.",
    );
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(
      401,
      "invalid_credentials",
      "Invalid email or password.",
    );
  }

  const { token } = await createSession(env, user.id, request);
  return jsonResponse({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
}

async function createConversation(
  request: Request,
  env: Env,
  auth: AuthContext,
): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(request);
  const kind = body.kind;
  if (kind !== "direct" && kind !== "team" && kind !== "group") {
    throw new HttpError(
      400,
      "invalid_kind",
      "kind must be direct, team, or group.",
    );
  }

  const participantIds = parseParticipantIds(body.participantIds).filter(
    (id) => id !== auth.user.id,
  );
  if (participantIds.length === 0) {
    throw new HttpError(
      400,
      "invalid_participants",
      "Choose at least one other participant.",
    );
  }
  if (kind === "direct" && participantIds.length !== 1) {
    throw new HttpError(
      400,
      "invalid_participants",
      "A direct conversation needs exactly one other participant.",
    );
  }

  const placeholders = participantIds.map(() => "?").join(", ");
  const { results: participants } = await env.DB.prepare(
    `SELECT id, name FROM users WHERE id IN (${placeholders})`,
  )
    .bind(...participantIds)
    .all<{ id: string; name: string }>();

  if (participants.length !== participantIds.length) {
    throw new HttpError(
      400,
      "invalid_participants",
      "One or more participants do not exist.",
    );
  }

  if (kind === "direct") {
    const existingId = await findDirectConversation(
      env,
      auth.user.id,
      participantIds[0],
    );

    if (existingId) {
      const existing = await getConversationForUser(
        env,
        existingId,
        auth.user.id,
      );
      if (!existing) {
        throw new HttpError(
          500,
          "conversation_missing",
          "The existing conversation could not be loaded.",
        );
      }
      return jsonResponse(existing);
    }
  }

  const requestedTitle =
    optionalStringField(body, "title", 120) ??
    (kind === "direct" ? participants[0].name : "New conversation");
  const conversationId = newId();
  const now = nowIso();
  const memberIds = [auth.user.id, ...participantIds];

  const statements = [
    env.DB.prepare(
      `INSERT INTO conversations
        (id, title, kind, created_by, last_message_id, last_message_preview,
         last_message_at, last_message_author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, '', NULL, NULL, ?, ?)`,
    ).bind(conversationId, requestedTitle, kind, auth.user.id, now, now),
    ...memberIds.map((userId) =>
      env.DB.prepare(
        `INSERT INTO conversation_members
          (conversation_id, user_id, joined_at)
         VALUES (?, ?, ?)`,
      ).bind(conversationId, userId, now),
    ),
  ];

  await env.DB.batch(statements);

  const conversation = await getConversationForUser(
    env,
    conversationId,
    auth.user.id,
  );
  if (!conversation) {
    throw new HttpError(
      500,
      "conversation_missing",
      "The conversation could not be loaded.",
    );
  }

  await publishToUsers(env, memberIds, {
    type: "conversation.created",
    conversation,
  });

  return jsonResponse(conversation, 201);
}

async function deleteConversation(
  env: Env,
  auth: AuthContext,
  conversationId: string,
): Promise<Response> {
  const conversation = await requireConversationForUser(
    env,
    conversationId,
    auth.user.id,
  );
  if (conversation.createdBy !== auth.user.id) {
    throw new HttpError(
      403,
      "not_creator",
      "Only the conversation creator can delete it.",
    );
  }

  const memberIds = await getConversationMemberIds(env, conversationId);
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM message_reactions
       WHERE message_id IN (
         SELECT id FROM messages WHERE conversation_id = ?
       )`,
    ).bind(conversationId),
    env.DB.prepare(
      "DELETE FROM conversation_reads WHERE conversation_id = ?",
    ).bind(conversationId),
    env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(
      conversationId,
    ),
    env.DB.prepare(
      "DELETE FROM conversation_members WHERE conversation_id = ?",
    ).bind(conversationId),
    env.DB.prepare("DELETE FROM conversations WHERE id = ?").bind(
      conversationId,
    ),
  ]);

  await publishToUsers(env, memberIds, {
    type: "conversation.deleted",
    conversationId,
  });
  return noContent();
}

async function createMessage(
  request: Request,
  env: Env,
  auth: AuthContext,
  conversationId: string,
): Promise<Response> {
  const conversation = await requireConversationForUser(
    env,
    conversationId,
    auth.user.id,
  );
  const body = await readJson<Record<string, unknown>>(request);
  const messageBody = stringField(body, "body", { min: 1, max: 4000 });
  const replyToId = optionalStringField(body, "replyToId", 100);

  if (replyToId) {
    const reply = await getMessageForUser(env, replyToId, auth.user.id);
    if (!reply || reply.conversation_id !== conversationId) {
      throw new HttpError(
        400,
        "invalid_reply",
        "The message you are replying to is not in this conversation.",
      );
    }
  }

  const messageId = newId();
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO messages
      (id, conversation_id, author_id, body, reply_to_id, edited_at, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  )
    .bind(
      messageId,
      conversationId,
      auth.user.id,
      messageBody,
      replyToId,
      now,
    )
    .run();

  await refreshConversationSummary(env, conversationId);

  const row = await getMessageById(env, messageId);
  if (!row) {
    throw new HttpError(
      500,
      "message_missing",
      "The message could not be loaded after saving.",
    );
  }

  const message = toApiMessage(row);
  await publishToUsers(
    env,
    await getConversationMemberIds(env, conversationId),
    { type: "message.created", conversationId, message },
  );

  return jsonResponse(message, 201);
}

async function updateMessage(
  request: Request,
  env: Env,
  auth: AuthContext,
  messageId: string,
): Promise<Response> {
  const existing = await getMessageForUser(env, messageId, auth.user.id);
  if (!existing) {
    throw new HttpError(404, "message_not_found", "That message is no longer available.");
  }
  if (existing.author_id !== auth.user.id) {
    throw new HttpError(
      403,
      "not_author",
      "Only the author can edit this message.",
    );
  }

  const body = await readJson<Record<string, unknown>>(request);
  const messageBody = stringField(body, "body", { min: 1, max: 4000 });
  await env.DB.prepare(
    "UPDATE messages SET body = ?, edited_at = ? WHERE id = ?",
  )
    .bind(messageBody, nowIso(), messageId)
    .run();

  await refreshConversationSummary(env, existing.conversation_id);

  const row = await getMessageById(env, messageId);
  if (!row) {
    throw new HttpError(404, "message_not_found", "That message is no longer available.");
  }

  const message = toApiMessage(row);
  await publishToUsers(
    env,
    await getConversationMemberIds(env, existing.conversation_id),
    {
      type: "message.updated",
      conversationId: existing.conversation_id,
      message,
    },
  );
  return jsonResponse(message);
}

async function removeMessage(
  env: Env,
  auth: AuthContext,
  messageId: string,
): Promise<Response> {
  const existing = await getMessageForUser(env, messageId, auth.user.id);
  if (!existing) {
    throw new HttpError(404, "message_not_found", "That message is no longer available.");
  }
  if (existing.author_id !== auth.user.id) {
    throw new HttpError(
      403,
      "not_author",
      "Only the author can delete this message.",
    );
  }

  const memberIds = await getConversationMemberIds(
    env,
    existing.conversation_id,
  );
  await env.DB.batch([
    env.DB.prepare("DELETE FROM message_reactions WHERE message_id = ?").bind(
      messageId,
    ),
    env.DB.prepare(
      "UPDATE conversation_reads SET last_read_message_id = NULL WHERE last_read_message_id = ?",
    ).bind(messageId),
    env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(messageId),
  ]);
  await refreshConversationSummary(env, existing.conversation_id);

  await publishToUsers(env, memberIds, {
    type: "message.deleted",
    conversationId: existing.conversation_id,
    messageId,
  });
  return noContent();
}

async function addReaction(
  request: Request,
  env: Env,
  auth: AuthContext,
  messageId: string,
): Promise<Response> {
  const message = await getMessageForUser(env, messageId, auth.user.id);
  if (!message) {
    throw new HttpError(404, "message_not_found", "That message is no longer available.");
  }

  const body = await readJson<Record<string, unknown>>(request);
  const emoji = stringField(body, "emoji", { min: 1, max: 16 });
  const reactionId = newId();
  const now = nowIso();

  try {
    await env.DB.prepare(
      `INSERT INTO message_reactions
        (id, message_id, user_id, emoji, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(reactionId, messageId, auth.user.id, emoji, now)
      .run();
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const existing = await env.DB.prepare(
        `SELECT r.*, u.name AS user_name
         FROM message_reactions r
         JOIN users u ON u.id = r.user_id
         WHERE r.message_id = ? AND r.user_id = ? AND r.emoji = ?`,
      )
        .bind(messageId, auth.user.id, emoji)
        .first<Parameters<typeof toApiReaction>[0]>();
      if (existing) {
        return jsonResponse(toApiReaction(existing));
      }
    }
    throw error;
  }

  const reactionRow = await env.DB.prepare(
    `SELECT r.*, u.name AS user_name
     FROM message_reactions r
     JOIN users u ON u.id = r.user_id
     WHERE r.id = ?`,
  )
    .bind(reactionId)
    .first<Parameters<typeof toApiReaction>[0]>();
  if (!reactionRow) {
    throw new HttpError(
      500,
      "reaction_missing",
      "The reaction could not be loaded after saving.",
    );
  }

  const reaction = toApiReaction(reactionRow);
  await publishToUsers(
    env,
    await getConversationMemberIds(env, message.conversation_id),
    { type: "reaction.added", reaction },
  );
  return jsonResponse(reaction, 201);
}

async function removeReaction(
  env: Env,
  auth: AuthContext,
  reactionId: string,
): Promise<Response> {
  const reaction = await getReactionForUser(env, reactionId, auth.user.id);
  if (!reaction) {
    throw new HttpError(404, "reaction_not_found", "That reaction is no longer available.");
  }
  if (reaction.user_id !== auth.user.id) {
    throw new HttpError(
      403,
      "not_owner",
      "Only the person who added a reaction can remove it.",
    );
  }

  await env.DB.prepare("DELETE FROM message_reactions WHERE id = ?")
    .bind(reactionId)
    .run();

  await publishToUsers(
    env,
    await getConversationMemberIds(env, reaction.conversation_id),
    {
      type: "reaction.removed",
      reactionId,
      messageId: reaction.message_id,
      conversationId: reaction.conversation_id,
    },
  );
  return noContent();
}

async function markRead(
  request: Request,
  env: Env,
  auth: AuthContext,
  conversationId: string,
): Promise<Response> {
  await requireConversationForUser(env, conversationId, auth.user.id);
  const body = await readJson<Record<string, unknown>>(request);
  const lastReadMessageId = optionalStringField(body, "lastReadMessageId", 100);

  let lastReadAt = nowIso();
  if (lastReadMessageId) {
    const message = await getMessageForUser(
      env,
      lastReadMessageId,
      auth.user.id,
    );
    if (!message || message.conversation_id !== conversationId) {
      throw new HttpError(
        400,
        "invalid_read_target",
        "The read message is not in this conversation.",
      );
    }
    lastReadAt = message.created_at;
  }

  const read = await upsertRead(
    env,
    conversationId,
    auth.user.id,
    lastReadMessageId,
    lastReadAt,
  );
  const apiRead = toApiRead(read);
  await publishToUsers(
    env,
    await getConversationMemberIds(env, conversationId),
    { type: "read.updated", read: apiRead },
  );
  return jsonResponse(apiRead);
}

async function typing(
  request: Request,
  env: Env,
  auth: AuthContext,
  conversationId: string,
): Promise<Response> {
  const conversation = await requireConversationForUser(
    env,
    conversationId,
    auth.user.id,
  );
  const memberIds = await getConversationMemberIds(env, conversationId);
  const recipients = memberIds.filter((id) => id !== auth.user.id);

  if (request.method === "DELETE") {
    await publishToUsers(env, recipients, {
      type: "typing.stopped",
      conversationId,
      userId: auth.user.id,
    });
    return noContent();
  }

  await publishToUsers(env, recipients, {
    type: "typing.updated",
    conversationId,
    userId: auth.user.id,
    expiresAt: new Date(Date.now() + 7_000).toISOString(),
  });
  return noContent();
}

async function realtime(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") {
    throw new HttpError(405, "method_not_allowed", "Use GET for realtime.");
  }
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    throw new HttpError(
      426,
      "upgrade_required",
      "This endpoint requires a WebSocket upgrade.",
    );
  }

  const ticket = url.searchParams.get("ticket");
  if (!ticket) {
    throw new HttpError(401, "missing_ticket", "Reconnect to continue.");
  }

  const verified = await verifyRealtimeTicket(env, ticket);
  if (!(await findUserById(env, verified.userId))) {
    throw new HttpError(401, "invalid_ticket", "Reconnect to continue.");
  }

  const headers = new Headers(request.headers);
  headers.set("X-User-Id", verified.userId);
  const forwarded = new Request(request.url, {
    method: "GET",
    headers,
  });
  return env.USER_HUB.get(env.USER_HUB.idFromName(verified.userId)).fetch(
    forwarded,
  );
}

export async function handleApiRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const method = request.method.toUpperCase();

  if (path === "/health" && method === "GET") {
    return jsonResponse({ ok: true, service: "open-services-api" });
  }

  if (path === "/auth/signup" && method === "POST") {
    return signup(request, env);
  }
  if (path === "/auth/signin" && method === "POST") {
    return signin(request, env);
  }
  if (path === "/realtime" && method === "GET") {
    return realtime(request, env, url);
  }

  const auth = await authenticate(request, env);

  if (path === "/auth/signout" && method === "POST") {
    await deleteSession(env, auth.session.id);
    return noContent();
  }
  if (path === "/auth/session" && method === "GET") {
    await env.DB.prepare(
      "UPDATE sessions SET last_seen_at = ? WHERE id = ?",
    )
      .bind(nowIso(), auth.session.id)
      .run();
    return jsonResponse({ user: auth.user });
  }
  if (path === "/auth/refresh" && method === "POST") {
    const token = await refreshSession(env, auth, request);
    return jsonResponse({ token, user: auth.user });
  }
  if (path === "/realtime/ticket" && method === "POST") {
    return jsonResponse(await createRealtimeTicket(env, auth.user.id));
  }

  if (path === "/people" && method === "GET") {
    return jsonResponse(await listPeople(env, auth.user.id));
  }

  if (path === "/search/messages" && method === "GET") {
    const needle = (url.searchParams.get("q") ?? "").trim();
    if (needle.length < 2) return jsonResponse([]);
    return jsonResponse(
      await searchConversationIds(env, auth.user.id, needle),
    );
  }

  if (path === "/conversations" && method === "GET") {
    const limit = pageLimit(url, 100);
    const offset = pageOffset(url);
    const items = await listConversations(env, auth.user.id, limit + 1, offset);
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return jsonResponse({
      items: page,
      nextOffset: hasMore ? offset + limit : null,
    });
  }

  if (path === "/conversations" && method === "POST") {
    return createConversation(request, env, auth);
  }

  const conversationMatch = /^\/conversations\/([^/]+)$/.exec(path);
  if (conversationMatch) {
    const conversationId = decodePathId(conversationMatch[1]);
    if (method === "GET") {
      return jsonResponse(
        await requireConversationForUser(env, conversationId, auth.user.id),
      );
    }
    if (method === "DELETE") {
      return deleteConversation(env, auth, conversationId);
    }
  }

  const messagesMatch = /^\/conversations\/([^/]+)\/messages$/.exec(path);
  if (messagesMatch) {
    const conversationId = decodePathId(messagesMatch[1]);
    if (method === "GET") {
      await requireConversationForUser(env, conversationId, auth.user.id);
      const limit = pageLimit(url, 50);
      const result = await listMessages(
        env,
        conversationId,
        limit,
        url.searchParams.get("cursor"),
      );
      return jsonResponse(result);
    }
    if (method === "POST") {
      return createMessage(request, env, auth, conversationId);
    }
  }

  const readsMatch = /^\/conversations\/([^/]+)\/reads$/.exec(path);
  if (readsMatch && method === "GET") {
    const conversationId = decodePathId(readsMatch[1]);
    await requireConversationForUser(env, conversationId, auth.user.id);
    return jsonResponse(await listReads(env, conversationId));
  }

  const readMatch = /^\/conversations\/([^/]+)\/read$/.exec(path);
  if (readMatch && method === "PUT") {
    return markRead(
      request,
      env,
      auth,
      decodePathId(readMatch[1]),
    );
  }

  const typingMatch = /^\/conversations\/([^/]+)\/typing$/.exec(path);
  if (typingMatch) {
    const conversationId = decodePathId(typingMatch[1]);
    if (method === "GET") {
      await requireConversationForUser(env, conversationId, auth.user.id);
      return jsonResponse([]);
    }
    if (method === "POST" || method === "DELETE") {
      return typing(request, env, auth, conversationId);
    }
  }

  const messageMatch = /^\/messages\/([^/]+)$/.exec(path);
  if (messageMatch) {
    const messageId = decodePathId(messageMatch[1]);
    if (method === "PATCH") {
      return updateMessage(request, env, auth, messageId);
    }
    if (method === "DELETE") {
      return removeMessage(env, auth, messageId);
    }
  }

  const reactionCreateMatch = /^\/messages\/([^/]+)\/reactions$/.exec(path);
  if (reactionCreateMatch && method === "POST") {
    return addReaction(
      request,
      env,
      auth,
      decodePathId(reactionCreateMatch[1]),
    );
  }

  const reactionMatch = /^\/reactions\/([^/]+)$/.exec(path);
  if (reactionMatch && method === "DELETE") {
    return removeReaction(env, auth, decodePathId(reactionMatch[1]));
  }

  throw new HttpError(404, "not_found", "That endpoint does not exist.");
}
