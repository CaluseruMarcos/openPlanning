PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('direct', 'team', 'group')),
  created_by TEXT NOT NULL REFERENCES users(id),
  last_message_id TEXT,
  last_message_preview TEXT NOT NULL DEFAULT '',
  last_message_at TEXT,
  last_message_author_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX conversations_recent_idx
  ON conversations(COALESCE(last_message_at, created_at) DESC);

CREATE TABLE conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_members_user_idx
  ON conversation_members(user_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  edited_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX messages_conversation_created_idx
  ON messages(conversation_id, created_at, id);

CREATE INDEX messages_author_idx ON messages(author_id);
CREATE INDEX messages_reply_to_idx ON messages(reply_to_id);

CREATE TABLE message_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX message_reactions_message_idx
  ON message_reactions(message_id);

CREATE TABLE conversation_reads (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_reads_user_idx
  ON conversation_reads(user_id);
