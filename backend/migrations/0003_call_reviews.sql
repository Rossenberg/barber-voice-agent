-- After each call or chat a stronger model checks what the assistant said (Armenian, logic) and the
-- findings go to the owner's Telegram; Claude reads them here to fix the phrasebook and the code.
CREATE TABLE call_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  verdict TEXT NOT NULL, -- ok | minor | serious | error
  issues TEXT NOT NULL DEFAULT '[]', -- JSON: [{severity, type, quote, problem, fix}]
  cost_usd REAL,
  notified INTEGER NOT NULL DEFAULT 0,
  fixed INTEGER NOT NULL DEFAULT 0, -- set once the fix is deployed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
