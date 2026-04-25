-- ===================================================
-- ADD: unit_price to distribution + notifications table
-- ===================================================

-- ─── 1. ລາຄາ/ຕຸກ ໃນ distribution ──────────────────────
ALTER TABLE public.distribution
  ADD COLUMN IF NOT EXISTS unit_price numeric(10,2) DEFAULT 0;

-- ─── 2. ຕາຕະລາງ notifications ─────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  type           text        DEFAULT 'pickup'
                             CHECK (type IN ('pickup','general')),
  message        text        NOT NULL,
  assigned_to    uuid        REFERENCES auth.users(id),  -- NULL = ແຈ້ງທຸກ distributor
  status         text        DEFAULT 'pending'
                             CHECK (status IN ('pending','acknowledged')),
  created_by     uuid        REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now(),
  acknowledged_at timestamptz
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_admin_all"      ON public.notifications;
DROP POLICY IF EXISTS "notif_dist_select"    ON public.notifications;
DROP POLICY IF EXISTS "notif_dist_update"    ON public.notifications;

-- Admin: ຈັດການທັງໝົດ
CREATE POLICY "notif_admin_all" ON public.notifications
  FOR ALL   USING    (public.get_my_role() = 'admin')
  WITH CHECK         (public.get_my_role() = 'admin');

-- Distributor: ເບິ່ງ notification ທີ່ assign ຫາຕົນ ຫຼື broadcast (assigned_to IS NULL)
CREATE POLICY "notif_dist_select" ON public.notifications
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR (assigned_to IS NULL AND public.get_my_role() = 'distributor')
  );

-- Distributor: ອັບເດດ status (ຮັບຄຳສັ່ງ)
CREATE POLICY "notif_dist_update" ON public.notifications
  FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR (assigned_to IS NULL AND public.get_my_role() = 'distributor')
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR (assigned_to IS NULL AND public.get_my_role() = 'distributor')
  );

-- ─── 3. Realtime ──────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
