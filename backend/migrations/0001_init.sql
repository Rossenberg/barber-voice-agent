-- One barbershop per deployment. Settings are a single JSON row the dashboard edits.
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'main', -- main | combo | color
  name_hy TEXT NOT NULL,
  name_en TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  price_min INTEGER NOT NULL,
  price_max INTEGER, -- NULL = fixed price
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD, Yerevan time
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  client_name TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled
  source TEXT NOT NULL DEFAULT 'assistant', -- assistant | manual
  conversation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX bookings_date ON bookings (date, status);

INSERT INTO settings (id, data) VALUES (1, '{
  "enabled": true,
  "shop_name": "Blade Barbershop",
  "address": "Երևան, Կենտրոն",
  "greeting": "Բարև ձեզ, {shop}, ես {name}ն եմ։ Ինչո՞վ օգնեմ։",
  "barbers": 2,
  "hours": [[660, 1140], [600, 1260], [600, 1260], [600, 1260], [600, 1260], [600, 1260], [600, 1260]],
  "extra_instructions": ""
}');

INSERT INTO services (id, category, name_hy, name_en, duration_min, price_min, price_max, sort) VALUES
  ('haircut',          'main',  'Կտրվածք',                          'Haircut',                 30, 10000, NULL, 10),
  ('fade_cut',         'main',  'Ֆեյդ կտրվածք',                     'Fade cut',                30, 10000, NULL, 20),
  ('buzz_cut',         'main',  'Կտրվածք մեքենայով',                'Buzz cut',                30,  6000, NULL, 30),
  ('beard_trim',       'main',  'Մորուքի մշակում',                  'Beard trim',              30,  6000, NULL, 40),
  ('shave',            'main',  'Սափրում',                          'Shave',                   30,  7000, NULL, 50),
  ('head_shave',       'main',  'Գլխի սափրում',                     'Head shave',              30,  7000, NULL, 60),
  ('junior_cut',       'main',  'Երեխայի կտրվածք',                  'Junior cut',              30,  7000, NULL, 70),
  ('styling',          'main',  'Հարդարում',                        'Styling',                 30,  4000, NULL, 80),
  ('waxing',           'main',  'Մազահեռացում մեղրամոմով',          'Waxing',                  30,  2000, NULL, 90),
  ('haircut_beard',    'combo', 'Կտրվածք + մորուքի մշակում',        'Haircut + beard trim',    60, 16000, NULL, 110),
  ('fade_beard',       'combo', 'Ֆեյդ կտրվածք + մորուքի մշակում',   'Fade cut + beard trim',   60, 16000, NULL, 120),
  ('buzz_beard',       'combo', 'Կտրվածք մեքենայով + մորուքի մշակում', 'Buzz cut + beard trim', 60, 12000, NULL, 130),
  ('haircut_shave',    'combo', 'Կտրվածք + սափրում',                'Haircut + shave',         60, 17000, NULL, 140),
  ('buzz_shave',       'combo', 'Կտրվածք մեքենայով + սափրում',      'Buzz cut + shave',        60, 13000, NULL, 150),
  ('head_shave_beard', 'combo', 'Գլխի սափրում + մորուքի մշակում',   'Head shave + beard trim', 60, 13000, NULL, 160),
  ('head_shave_shave', 'combo', 'Գլխի սափրում + սափրում',           'Head shave + shave',      60, 14000, NULL, 170),
  ('beard_tint',       'color', 'Մորուքի երանգավորում',             'Beard tinting',           30,  5000, 7000, 210),
  ('hair_tint',        'color', 'Մազերի երանգավորում',              'Hair tinting',            30,  7000, 9000, 220);
