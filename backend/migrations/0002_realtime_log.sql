-- /realtime/ test calls: what the caller said (text + audio of each phrase) and what the assistant
-- answered, so recognition mistakes can be analysed afterwards.
CREATE TABLE realtime_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  role TEXT NOT NULL, -- user | agent | user_audio
  text TEXT,
  latency_ms INTEGER,
  audio BLOB,
  audio_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX realtime_log_call ON realtime_log (call_id, turn);
