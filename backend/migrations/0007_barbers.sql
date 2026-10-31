-- Named barbers, each with their own hours (NULL = the shop's hours). Bookings and closed hours can belong to one.
CREATE TABLE barbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  hours TEXT, -- JSON like settings.hours, or NULL
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX barbers_biz ON barbers (business_id, active);
ALTER TABLE bookings ADD COLUMN barber_id INTEGER;
ALTER TABLE blocks ADD COLUMN barber_id INTEGER;
