-- Shops (category "shop"): each catalog entry is one Instagram post with what's in it and the prices, written by the owner.
-- When a client shares that post in Direct, Meta sends its media id: media_id is looked up from the post link
-- through the connected Instagram account (Graph API /{ig-user-id}/media), matched by the link's shortcode.
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  post_url TEXT NOT NULL DEFAULT '',
  shortcode TEXT, -- the code in instagram.com/p/<code>/
  media_id TEXT, -- Instagram's id of the post, once found
  caption TEXT, -- the post's caption, once found
  description TEXT NOT NULL, -- items, prices, sizes: free text
  photo TEXT, -- a small JPEG as a data: URL (for the owner's list)
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX products_biz ON products (business_id, active);
CREATE INDEX products_media ON products (media_id);
