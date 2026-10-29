-- "Connect your business" requests from the UMNIK landing.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  industry TEXT,
  company TEXT,
  lang TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
