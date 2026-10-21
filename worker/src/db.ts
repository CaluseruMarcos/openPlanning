import { HttpError } from "./http";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  nowIso,
} from "./auth";
import type {
  ApiConversation,
  ApiMessage,
  ApiReaction,
  ApiRead,
  ConversationRow,
  Env,
  MessageRow,
  PublicPerson,
  ReactionRow,
  ReadRow,
} from "./types";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type MessageCursor = {
  createdAt: string;
  id: string;
};

function encodeCursor(cursor: MessageCursor): string {
  return bytesToBase64Url(textEncoder.encode(JSON.stringify(cursor)));
}

function decodeCursor(value: string): MessageCursor | null {
  try {
    const parsed = JSON.parse(
      textDecoder.decode(base64UrlToBytes(value)),
    ) as Partial<MessageCursor>;
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function placeholders(count: number): string {
  return new Array(count).fill("?").join(", ");
}

export function toPublicPerson(row: {
  id: string;
  name: string;
}): PublicPerson {
  return { id: row.id, name: row.name };
}

export function toApiConversation(
  row: ConversationRow,
  participants: PublicPerson[],
): ApiConversation {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    participants,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at ?? "",
    lastMessageAuthorId: row.last_message_author_id ?? "",
  };
}

export function toApiMessage(
  row: MessageRow,
  reactions: ApiReaction[] = [],
): ApiMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    author: { id: row.author_id, name: row.author_name },
    body: row.body,
    createdAt: row.created_at,
    createdAtIso: row.created_at,
    ...(row.edited_at ? { editedAt: row.edited_at } : {}),
    replyTo:
      row.reply_to_id && row.reply_body !== null
        ? {
            id: row.reply_to_id,
            author: {
              id: row.reply_author_id ?? "unknown",
              name: row.reply_author_name ?? "Member",
            },
            body: row.reply_body,
          }
        : null,
    reactions,
  };
}

export function toApiReaction(row: ReactionRow): ApiReaction {
  return {
    id: row.id,
    messageId: row.message_id,
    emoji: row.emoji,
    user: { id: row.user_id, name: row.user_name },
    createdAtIso: row.created_at,
  };
}

export function toApiRead(row: ReadRow): ApiRead {
  return {
    id: `${row.conversation_id}:${row.user_id}`,
    conversationId: row.conversation_id,
    user: { id: row.user_id, name: row.user_name },
    lastReadAt: row.last_read_at,
    ...(row.last_read_message_id
      ? { lastReadMessageId: row.last_read_message_id }
      : {}),
  };
}

export async function getConversationMemberIds(
  env: Env,
  conversationId: string,
): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT user_id FROM conversation_members WHERE conversation_id = ?",
  )
    .bind(conversationId)
    .all<{ user_id: string }>();
  return results.map((row) => row.user_id);
}

export async function getConversationMembers(
  env: Env,
  conversationId: string,
): Promise<PublicPerson[]> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.name
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = ?
     ORDER BY u.name COLLATE NOCASE ASC`,
  )
    .bind(conversationId)
    .all<PublicPerson>();
  return results.map(toPublicPerson);
}

export async function getConversationForUser(
  env: Env,
  conversationId: string,
  userId: string,
): Promise<ApiConversation | null> {
  const row = await env.DB.prepare(
    `SELECT c.*
     FROM conversations c
     JOIN conversation_members cm
       ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ?`,
  )
    .bind(userId, conversationId)
    .first<ConversationRow>();

  if (!row) return null;
  return toApiConversation(row, await getConversationMembers(env, conversationId));
}

export async function requireConversationForUser(
  env: Env,
  conversationId: string,
  userId: string,
): Promise<ApiConversation> {
  const conversation = await getConversationForUser(env, conversationId, userId);
  if (!conversation) {
    throw new HttpError(
      404,
      "conversation_not_found",
      "That conversation is no longer available.",
    );
  }
  return conversation;
}

export async function listConversations(
  env: Env,
  userId: string,
  limit: number,
  offset: number,
): Promise<ApiConversation[]> {
  const { results: rows } = await env.DB.prepare(
    `SELECT c.*
     FROM conversations c
     JOIN conversation_members cm
       ON cm.conversation_id = c.id AND cm.user_id = ?
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(userId, limit, offset)
    .all<ConversationRow>();

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const { results: memberRows } = await env.DB.prepare(
    `SELECT cm.conversation_id, u.id, u.name
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id IN (${placeholders(ids.length)})
     ORDER BY u.name COLLATE NOCASE ASC`,
  )
    .bind(...ids)
    .all<{ conversation_id: string; id: string; name: string }>();

  const participants = new Map<string, PublicPerson[]>();
  for (const member of memberRows) {
    const list = participants.get(member.conversation_id) ?? [];
    list.push({ id: member.id, name: member.name });
    participants.set(member.conversation_id, list);
  }

  return rows.map((row) =>
    toApiConversation(row, participants.get(row.id) ?? []),
  );
}

export async function listPeople(
  env: Env,
  currentUserId: string,
): Promise<PublicPerson[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, name FROM users
     WHERE id <> ?
     ORDER BY name COLLATE NOCASE ASC`,
  )
    .bind(currentUserId)
    .all<PublicPerson>();
  return results.map(toPublicPerson);
}

export async function findDirectConversation(
  env: Env,
  currentUserId: string,
  otherUserId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT c.id
     FROM conversations c
     JOIN conversation_members mine
       ON mine.conversation_id = c.id AND mine.user_id = ?
     JOIN conversation_members theirs
       ON theirs.conversation_id = c.id AND theirs.user_id = ?
     WHERE c.kind = 'direct'
       AND (SELECT COUNT(*) FROM conversation_members cm
            WHERE cm.conversation_id = c.id) = 2
     LIMIT 1`,
  )
    .bind(currentUserId, otherUserId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function searchConversationIds(
  env: Env,
  userId: string,
  needle: string,
): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT m.conversation_id
     FROM messages m
     JOIN conversation_members cm
       ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
     WHERE instr(lower(m.body), lower(?)) > 0
     LIMIT 100`,
  )
    .bind(userId, needle)
    .all<{ conversation_id: string }>();
  return results.map((row) => row.conversation_id);
}

export async function listMessageRows(
  env: Env,
  conversationId: string,
  limit: number,
  cursorValue: string | null,
): Promise<{ rows: MessageRow[]; nextCursor: string | null }> {
  const cursor = cursorValue ? decodeCursor(cursorValue) : null;
  const pageSize = Math.min(100, Math.max(1, limit));
  const where = cursor
    ? "AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))"
    : "";
  const bindings = cursor
    ? [conversationId, cursor.createdAt, cursor.createdAt, cursor.id, pageSize + 1]
    : [conversationId, pageSize + 1];

  const { results } = await env.DB.prepare(
    `SELECT
       m.*,
       u.name AS author_name,
       reply.body AS reply_body,
       reply.author_id AS reply_author_id,
       reply_author.name AS reply_author_name
     FROM messages m
     JOIN users u ON u.id = m.author_id
     LEFT JOIN messages reply ON reply.id = m.reply_to_id
     LEFT JOIN users reply_author ON reply_author.id = reply.author_id
     WHERE m.conversation_id = ?
     ${where}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT ?`,
  )
    .bind(...bindings)
    .all<MessageRow>();

  const hasMore = results.length > pageSize;
  const page = hasMore ? results.slice(0, pageSize) : results;
  const oldest = page[page.length - 1];
  const nextCursor =
    hasMore && oldest
      ? encodeCursor({ createdAt: oldest.created_at, id: oldest.id })
      : null;

  return { rows: [...page].reverse(), nextCursor };
}

export async function listReactionsForMessages(
  env: Env,
  messageIds: string[],
): Promise<Map<string, ApiReaction[]>> {
  const byMessage = new Map<string, ApiReaction[]>();
  if (messageIds.length === 0) return byMessage;

  const { results } = await env.DB.prepare(
    `SELECT r.*, u.name AS user_name
     FROM message_reactions r
     JOIN users u ON u.id = r.user_id
     WHERE r.message_id IN (${placeholders(messageIds.length)})
     ORDER BY r.created_at ASC, r.id ASC`,
  )
    .bind(...messageIds)
    .all<ReactionRow>();

  for (const row of results) {
    const list = byMessage.get(row.message_id) ?? [];
    list.push(toApiReaction(row));
    byMessage.set(row.message_id, list);
  }
  return byMessage;
}

export async function listMessages(
  env: Env,
  conversationId: string,
  limit: number,
  cursor: string | null,
): Promise<{ items: ApiMessage[]; nextCursor: string | null }> {
  const { rows, nextCursor } = await listMessageRows(
    env,
    conversationId,
    limit,
    cursor,
  );
  const reactions = await listReactionsForMessages(
    env,
    rows.map((row) => row.id),
  );
  return {
    items: rows.map((row) => toApiMessage(row, reactions.get(row.id) ?? [])),
    nextCursor,
  };
}

export async function getMessageForUser(
  env: Env,
  messageId: string,
  userId: string,
): Promise<MessageRow | null> {
  return env.DB.prepare(
    `SELECT
       m.*,
       u.name AS author_name,
       reply.body AS reply_body,
       reply.author_id AS reply_author_id,
       reply_author.name AS reply_author_name
     FROM messages m
     JOIN users u ON u.id = m.author_id
     JOIN conversation_members cm
       ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
     LEFT JOIN messages reply ON reply.id = m.reply_to_id
     LEFT JOIN users reply_author ON reply_author.id = reply.author_id
     WHERE m.id = ?`,
  )
    .bind(userId, messageId)
    .first<MessageRow>();
}

export async function getMessageById(
  env: Env,
  messageId: string,
): Promise<MessageRow | null> {
  return env.DB.prepare(
    `SELECT
       m.*,
       u.name AS author_name,
       reply.body AS reply_body,
       reply.author_id AS reply_author_id,
       reply_author.name AS reply_author_name
     FROM messages m
     JOIN users u ON u.id = m.author_id
     LEFT JOIN messages reply ON reply.id = m.reply_to_id
     LEFT JOIN users reply_author ON reply_author.id = reply.author_id
     WHERE m.id = ?`,
  )
    .bind(messageId)
    .first<MessageRow>();
}

export async function getReactionForUser(
  env: Env,
  reactionId: string,
  userId: string,
): Promise<(ReactionRow & { conversation_id: string }) | null> {
  return env.DB.prepare(
    `SELECT r.*, u.name AS user_name, m.conversation_id
     FROM message_reactions r
     JOIN users u ON u.id = r.user_id
     JOIN messages m ON m.id = r.message_id
     JOIN conversation_members cm
       ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
     WHERE r.id = ?`,
  )
    .bind(userId, reactionId)
    .first<ReactionRow & { conversation_id: string }>();
}

export async function listReads(
  env: Env,
  conversationId: string,
): Promise<ApiRead[]> {
  const { results } = await env.DB.prepare(
    `SELECT cr.*, u.name AS user_name
     FROM conversation_reads cr
     JOIN users u ON u.id = cr.user_id
     WHERE cr.conversation_id = ?
     ORDER BY cr.last_read_at DESC`,
  )
    .bind(conversationId)
    .all<ReadRow>();
  return results.map(toApiRead);
}

export async function getRead(
  env: Env,
  conversationId: string,
  userId: string,
): Promise<ReadRow | null> {
  return env.DB.prepare(
    `SELECT cr.*, u.name AS user_name
     FROM conversation_reads cr
     JOIN users u ON u.id = cr.user_id
     WHERE cr.conversation_id = ? AND cr.user_id = ?`,
  )
    .bind(conversationId, userId)
    .first<ReadRow>();
}

export async function upsertRead(
  env: Env,
  conversationId: string,
  userId: string,
  lastReadMessageId: string | null,
  lastReadAt: string,
): Promise<ReadRow> {
  await env.DB.prepare(
    `INSERT INTO conversation_reads
       (conversation_id, user_id, last_read_message_id, last_read_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(conversation_id, user_id) DO UPDATE SET
       last_read_message_id = excluded.last_read_message_id,
       last_read_at = excluded.last_read_at
     WHERE excluded.last_read_at >= conversation_reads.last_read_at`,
  )
    .bind(conversationId, userId, lastReadMessageId, lastReadAt)
    .run();

  const read = await getRead(env, conversationId, userId);
  if (!read) {
    throw new HttpError(
      500,
      "read_not_saved",
      "The read position could not be saved.",
    );
  }
  return read;
}

export async function refreshConversationSummary(
  env: Env,
  conversationId: string,
): Promise<void> {
  const latest = await env.DB.prepare(
    `SELECT id, body, created_at, author_id
     FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
  )
    .bind(conversationId)
    .first<{
      id: string;
      body: string;
      created_at: string;
      author_id: string;
    }>();

  await env.DB.prepare(
    `UPDATE conversations
     SET last_message_id = ?,
         last_message_preview = ?,
         last_message_at = ?,
         last_message_author_id = ?,
         updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      latest?.id ?? null,
      latest?.body ?? "",
      latest?.created_at ?? null,
      latest?.author_id ?? null,
      nowIso(),
      conversationId,
    )
    .run();
}
