-- Many businesses: each has its own settings, services, bookings and closed hours, and owner accounts.
-- The demo Blade Barbershop becomes business 1 (slug "blade"); everything that existed belongs to it.

CREATE TABLE businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE, -- used in links: /api/public/config?biz=<slug>
  category TEXT NOT NULL DEFAULT 'barber', -- barber | dental | callcenter | office | food | other
  settings TEXT NOT NULL, -- JSON, same shape as the old single settings row
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO businesses (id, slug, category, settings) SELECT 1, 'blade', 'barber', data FROM settings WHERE id = 1;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE, -- lower-cased
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL, -- pbkdf2$<iterations>$<salt b64>$<hash b64>
  email_verified_at TEXT,
  business_id INTEGER NOT NULL REFERENCES businesses (id),
  lang TEXT NOT NULL DEFAULT 'ru',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Email confirmation and password reset links; only the SHA-256 of the token is stored.
CREATE TABLE auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL, -- verify | reset
  expires_at INTEGER NOT NULL, -- ms
  used_at TEXT
);

-- Services were keyed by id alone; now by (business, id).
CREATE TABLE services_new (
  business_id INTEGER NOT NULL DEFAULT 1,
  id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'main',
  name_hy TEXT NOT NULL,
  name_en TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  price_min INTEGER NOT NULL,
  price_max INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, id)
);
INSERT INTO services_new (business_id, id, category, name_hy, name_en, duration_min, price_min, price_max, active, sort)
  SELECT 1, id, category, name_hy, name_en, duration_min, price_min, price_max, active, sort FROM services;
DROP TABLE services;
ALTER TABLE services_new RENAME TO services;

ALTER TABLE bookings ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX bookings_biz_date ON bookings (business_id, date, status);

-- Hours the owner closed (a break, a day off): nobody can be booked then.
CREATE TABLE blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX blocks_biz_date ON blocks (business_id, date);

ALTER TABLE realtime_log ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1;
