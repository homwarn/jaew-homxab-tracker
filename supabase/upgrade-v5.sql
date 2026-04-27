-- ============================================================
-- upgrade-v5.sql  —  ຕິດຕາມແຈ່ວຫອມແຊບ  v5
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
-- Fixes:
--   1. Notification RLS — drop ALL old policies, recreate clean set
--   2. orders.updated_at column + trigger fix
-- ============================================================

-- ── 1. NOTIFICATIONS: drop every policy (old + new names) ───
DROP POLICY IF EXISTS "notifications_select"              ON notifications;
DROP POLICY IF EXISTS "notifications_insert_admin"        ON notifications;
DROP POLICY IF EXISTS "notifications_update_distributor"  ON notifications;
DROP POLICY IF EXISTS "notifications_delete_admin"        ON notifications;
DROP POLICY IF EXISTS "notif_admin_all"                   ON notifications;
DROP POLICY IF EXISTS "notif_dist_select"                 ON notifications;
DROP POLICY IF EXISTS "notif_dist_update"                 ON notifications;

-- Admin: full access
CREATE POLICY "notif_admin_all" ON notifications
  FOR ALL
  USING    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Distributor SELECT: see notifications assigned to me OR broadcast (assigned_to IS NULL)
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

-- ── 2. ORDERS: add updated_at column if missing, fix trigger ─
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Re-create trigger so it references the now-guaranteed column
DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Done ─────────────────────────────────────────────────────
-- 1. git push origin main  (to deploy create-user.js cashier fix)
-- 2. Run this file in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────
