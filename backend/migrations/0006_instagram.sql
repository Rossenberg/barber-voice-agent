-- Instagram Direct: which Instagram professional account belongs to which business, and its access token.
CREATE TABLE instagram_accounts (
  ig_user_id TEXT PRIMARY KEY, -- the id Meta sends as entry.id in webhooks
  business_id INTEGER NOT NULL REFERENCES businesses (id),
  username TEXT,
  token TEXT NOT NULL,
  token_expires_at INTEGER, -- ms
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Meta retries webhooks: each message is answered once.
CREATE TABLE instagram_seen (
  mid TEXT PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
