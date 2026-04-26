-- ============================================================
-- upgrade-v3.sql  —  ຕິດຕາມແຈ່ວຫອມແຊບ  v3 schema upgrade
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. stores: add location fields
-- ─────────────────────────────────────────────────────────────
ALTER TABLE stores ADD COLUMN IF NOT EXISTS maps_url  text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS latitude  numeric(10,7);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS longitude numeric(10,7);

-- 2. notifications: add store context + items JSONB
-- ─────────────────────────────────────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS store_id      uuid REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS store_name    text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS store_maps_url text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS items         jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. notifications: extend status to include 'delivered'
-- ─────────────────────────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('pending', 'acknowledged', 'delivered'));

-- 4. distribution: link back to the notification that triggered it
-- ─────────────────────────────────────────────────────────────
ALTER TABLE distribution ADD COLUMN IF NOT EXISTS notification_id uuid REFERENCES notifications(id) ON DELETE SET NULL;
ALTER TABLE distribution ADD COLUMN IF NOT EXISTS is_paid         boolean NOT NULL DEFAULT false;

-- 5. store_prices: per-store unit price per product
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_prices (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id    uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_price  numeric(10,2) NOT NULL DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (store_id, product_id)
);

-- RLS for store_prices
ALTER TABLE store_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sp_select"    ON store_prices;
DROP POLICY IF EXISTS "sp_admin_all" ON store_prices;

CREATE POLICY "sp_select"    ON store_prices FOR SELECT
  USING (get_my_role() IN ('admin', 'distributor'));

CREATE POLICY "sp_admin_all" ON store_prices FOR ALL
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- Realtime for store_prices
ALTER PUBLICATION supabase_realtime ADD TABLE store_prices;

-- ── Done ──────────────────────────────────────────────────────
-- After running this SQL:
--   1. git push origin main  (ຈາກ Windows)
--   2. Netlify will auto-deploy
-- ─────────────────────────────────────────────────────────────
