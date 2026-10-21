PRAGMA foreign_keys = ON;

-- Invite codes replace open self-service registration. The code is shown once
-- and only its hash is stored.
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  email TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX invites_expires_at_idx ON invites(expires_at);
