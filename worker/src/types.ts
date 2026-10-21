export type Env = {
  DB: D1Database;
  USER_HUB: DurableObjectNamespace;
  FILES?: R2Bucket;
  APP_ORIGIN?: string;
  SESSION_SECRET?: string;
  TICKET_SECRET?: string;
  SESSION_TTL_DAYS?: string;
  PBKDF2_ITERATIONS?: string;
  ENVIRONMENT?: string;
  /** "false" closes self-service registration for this deployment. */
  ALLOW_SIGNUP?: string;
};

export type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
};

export type ConversationRow = {
  id: string;
  title: string;
  kind: "direct" | "team" | "group";
  created_by: string;
  last_message_id: string | null;
  last_message_preview: string;
  last_message_at: string | null;
  last_message_author_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  reply_to_id: string | null;
  edited_at: string | null;
  created_at: string;
  author_name: string;
  reply_body: string | null;
  reply_author_id: string | null;
  reply_author_name: string | null;
};

export type ReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user_name: string;
};

export type ReadRow = {
  conversation_id: string;
  user_id: string;
  last_read_message_id: string | null;
  last_read_at: string;
  user_name: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export type AuthContext = {
  user: AuthUser;
  session: SessionRow;
};

export type PublicPerson = {
  id: string;
  name: string;
};

export type ApiUser = PublicPerson & {
  email?: string;
};

export type ApiConversation = {
  id: string;
  title: string;
  kind: "direct" | "team" | "group";
  participants: PublicPerson[];
  createdBy: string;
  createdAt: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  lastMessageAuthorId: string;
};

export type ApiReply = {
  id: string;
  author: PublicPerson;
  body: string;
};

export type ApiMessage = {
  id: string;
  conversationId: string;
  author: PublicPerson;
  body: string;
  createdAt: string;
  createdAtIso: string;
  editedAt?: string;
  replyTo: ApiReply | null;
  reactions: ApiReaction[];
};

export type ApiReaction = {
  id: string;
  messageId: string;
  emoji: string;
  user: PublicPerson;
  createdAtIso: string;
};

export type ApiRead = {
  id: string;
  conversationId: string;
  user: PublicPerson;
  lastReadAt: string;
  lastReadMessageId?: string;
};

export type RealtimeEvent =
  | { type: "ready"; userId: string; connectedAt: string }
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
