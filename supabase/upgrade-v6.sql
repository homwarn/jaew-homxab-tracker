-- ============================================================
-- upgrade-v6.sql  —  ຕິດຕາມແຈ່ວຫອມແຊບ  v6
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- ຈຸດປະສົງ:
--   1. ລ້າງ notifications RLS ທຸກ policy (ຈາກທຸກ version ເກົ່າ)
--   2. ສ້າງ policies ໃໝ່ clean + ຖືກຕ້ອງ
--   3. ແກ້ status CHECK constraint ໃຫ້ຮອງຮັບ 'delivered'
--   4. ກວດສອບ columns ທີ່ຈຳເປັນ
--   5. ແກ້ orders updated_at trigger
-- ============================================================

-- ── STEP 1: ຮັບປະກັນ notifications columns ຄົບ ──────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS store_id       uuid REFERENCES public.stores(id) ON DELETE SET NULL;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS store_name     text;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS store_maps_url text;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS items          jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

-- ── STEP 2: ແກ້ status CHECK constraint (drop ທຸກ version ເກົ່າ) ──
-- Drop any auto-named or manually-named status check constraints
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM   pg_constraint
    WHERE  conrelid = 'public.notifications'::regclass
    AND    contype  = 'c'
    AND    (conname ILIKE '%status%' OR conname ILIKE '%notifications_status%')
  ) LOOP
    EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('pending', 'acknowledged', 'delivered'));

-- ── STEP 3: ແກ້ type CHECK constraint ──────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM   pg_constraint
    WHERE  conrelid = 'public.notifications'::regclass
    AND    contype  = 'c'
    AND    (conname ILIKE '%type%')
  ) LOOP
    EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('pickup', 'general'));

-- ── STEP 4: ລ້າງ ALL RLS policies ທຸກ version ──────────────────
-- From schema_v2_additions.sql
DROP POLICY IF EXISTS "notifications_select"             ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_admin"       ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_distributor" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_admin"       ON public.notifications;
-- From add-store-notifications.sql
DROP POLICY IF EXISTS "notif_admin_all"                  ON public.notifications;
DROP POLICY IF EXISTS "notif_dist_select"                ON public.notifications;
DROP POLICY IF EXISTS "notif_dist_update"                ON public.notifications;

-- ── STEP 5: ສ້າງ policies ໃໝ່ clean ──────────────────────────

-- Admin: ຈັດການທຸກຢ່າງ
CREATE POLICY "notif_admin_all" ON public.notifications
  FOR ALL
  USING    (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Distributor SELECT: ເຫັນ notification ທີ່ assign ຫາຕົນ + broadcast
CREATE POLICY "notif_dist_select" ON public.notifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'distributor')
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  );

-- Distributor UPDATE: ຮັບ (acknowledged) + ສົ່ງ (delivered)
CREATE POLICY "notif_dist_update" ON public.notifications
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'distributor')
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'distributor')
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  );

-- ── STEP 6: ຮັບປະກັນ RLS ເປີດຢູ່ ───────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ── STEP 7: Realtime ─────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ── STEP 8: ແກ້ orders updated_at ────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── STEP 9: ກວດ profiles role constraint ├ add cashier ────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('producer', 'distributor', 'seller', 'admin', 'cashier'));

-- ── ສຳເລັດ ──────────────────────────────────────────────────────
-- ຫຼັງຈາກ run SQL ນີ້:
--   1. git push origin main   (deploy code fix)
-- ─────────────────────────────────────────────────────────────────
