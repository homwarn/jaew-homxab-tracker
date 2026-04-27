-- ============================================================
-- upgrade-v4.sql  —  ຕິດຕາມແຈ່ວຫອມແຊບ  v4
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. FIX: profiles — allow cashier role ───────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('producer', 'distributor', 'seller', 'admin', 'cashier'));

-- ── 2. FIX: notifications — acknowledged_at column ──────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

-- ── 3. FIX: notifications RLS — rebuild simpler policies ────
-- Drop old policies
DROP POLICY IF EXISTS "notif_admin_all"   ON notifications;
DROP POLICY IF EXISTS "notif_dist_select" ON notifications;
DROP POLICY IF EXISTS "notif_dist_update" ON notifications;

-- Admin: full access
CREATE POLICY "notif_admin_all" ON notifications
  FOR ALL
  USING    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Distributor SELECT: see notifications assigned to me OR broadcast
CREATE POLICY "notif_dist_select" ON notifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'distributor')
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  );

-- Distributor UPDATE: acknowledge / mark delivered
CREATE POLICY "notif_dist_update" ON notifications
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'distributor')
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'distributor')
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  );

-- ── 4. invoices table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_no     text        NOT NULL UNIQUE,
  store_id       uuid        REFERENCES stores(id) ON DELETE SET NULL,
  store_name     text        NOT NULL,
  notification_id uuid       REFERENCES notifications(id) ON DELETE SET NULL,
  distributor_id uuid        REFERENCES auth.users(id),
  items          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  subtotal       numeric(12,2) DEFAULT 0,
  total_amount   numeric(12,2) DEFAULT 0,
  payment_method text        DEFAULT 'cash' CHECK (payment_method IN ('cash','transfer')),
  is_paid        boolean     NOT NULL DEFAULT false,
  receiver_name  text,
  notes          text,
  created_by     uuid        REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_admin_all"  ON invoices;
DROP POLICY IF EXISTS "inv_dist_own"   ON invoices;

CREATE POLICY "inv_admin_all" ON invoices FOR ALL
  USING    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "inv_dist_own"  ON invoices FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','distributor'))
  );

CREATE POLICY "inv_dist_insert" ON invoices FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','distributor'))
  );

ALTER PUBLICATION supabase_realtime ADD TABLE invoices;

-- ── 5. material_categories ────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_categories (
  id         uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text  NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE material_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matcat_select" ON material_categories;
DROP POLICY IF EXISTS "matcat_admin"  ON material_categories;
DROP POLICY IF EXISTS "matcat_cashier" ON material_categories;

CREATE POLICY "matcat_select"  ON material_categories FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')));
CREATE POLICY "matcat_cashier" ON material_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')));

-- ── 6. raw_materials ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS raw_materials (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  name              text          NOT NULL,
  category_id       uuid          REFERENCES material_categories(id) ON DELETE SET NULL,
  unit              text          NOT NULL DEFAULT 'kg',
  quantity_in_stock numeric(12,3) NOT NULL DEFAULT 0,
  unit_cost         numeric(10,2) NOT NULL DEFAULT 0,
  notes             text,
  created_by        uuid          REFERENCES auth.users(id),
  created_at        timestamptz   DEFAULT now()
);

ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mat_select"  ON raw_materials;
DROP POLICY IF EXISTS "mat_cashier" ON raw_materials;

CREATE POLICY "mat_select"  ON raw_materials FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')));
CREATE POLICY "mat_cashier" ON raw_materials FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')));

ALTER PUBLICATION supabase_realtime ADD TABLE raw_materials;

-- ── 7. material_purchases ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_purchases (
  id          uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id uuid          NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  quantity    numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price  numeric(10,2) NOT NULL DEFAULT 0,
  total_cost  numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  supplier    text,
  notes       text,
  created_by  uuid          REFERENCES auth.users(id),
  created_at  timestamptz   DEFAULT now()
);

ALTER TABLE material_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matpur_select"  ON material_purchases;
DROP POLICY IF EXISTS "matpur_cashier" ON material_purchases;

CREATE POLICY "matpur_select"  ON material_purchases FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')));
CREATE POLICY "matpur_cashier" ON material_purchases FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')));

ALTER PUBLICATION supabase_realtime ADD TABLE material_purchases;

-- ── 8. material_usage (production batches) ────────────────────
CREATE TABLE IF NOT EXISTS material_usage (
  id           uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_name   text          NOT NULL,  -- ຊື່ຫມໍ້ / ຄັ້ງທີ
  batch_date   date          NOT NULL DEFAULT CURRENT_DATE,
  items        jsonb         NOT NULL DEFAULT '[]'::jsonb,
  -- items format: [{material_id, material_name, unit, quantity_used, unit_cost, subtotal}]
  total_cost   numeric(12,2) NOT NULL DEFAULT 0,
  notes        text,
  created_by   uuid          REFERENCES auth.users(id),
  created_at   timestamptz   DEFAULT now()
);

ALTER TABLE material_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matuse_select"  ON material_usage;
DROP POLICY IF EXISTS "matuse_cashier" ON material_usage;

CREATE POLICY "matuse_select"  ON material_usage FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')));
CREATE POLICY "matuse_cashier" ON material_usage FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','cashier')));

ALTER PUBLICATION supabase_realtime ADD TABLE material_usage;

-- ── 9. distribution: add is_paid if not exists (v3 may have done it) ─
ALTER TABLE distribution ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false;

-- ── Done ─────────────────────────────────────────────────────
-- 1. git push origin main  (ຈາກ Windows)
-- 2. Netlify will auto-deploy
-- ─────────────────────────────────────────────────────────────
