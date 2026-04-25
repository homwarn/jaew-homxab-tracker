-- ===================================================
-- ADD FEATURES: is_paid, orders table, nullable quantity
-- ===================================================

-- ─── 1. ຕາຕະລາງ distribution: ເພີ່ມ is_paid ──────────
ALTER TABLE public.distribution
  ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;

-- ─── 2. ຕາຕະລາງ production: ເພີ່ມ is_paid ───────────
ALTER TABLE public.production
  ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;

-- ─── 3. ຕາຕະລາງ sales: quantity ສາມາດ NULL ──────────
ALTER TABLE public.sales
  ALTER COLUMN quantity DROP NOT NULL;

-- ─── 4. ສ້າງ orders table ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id  uuid        REFERENCES public.products(id),
  quantity    integer     NOT NULL DEFAULT 1,
  notes       text,
  status      text        DEFAULT 'pending'
                          CHECK (status IN ('pending', 'confirmed', 'delivered')),
  store_name  text,
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

-- ─── 5. RLS ສຳລັບ orders ──────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_seller_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_seller_select" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_all"     ON public.orders;

-- ຜູ້ຂາຍ: ສ້າງ order ຂອງຕົນເອງ
CREATE POLICY "orders_seller_insert" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = created_by AND public.get_my_role() = 'seller');

-- ຜູ້ຂາຍ: ເບິ່ງ order ຂອງຕົນເອງ / Admin ເບິ່ງທັງໝົດ
CREATE POLICY "orders_seller_select" ON public.orders
  FOR SELECT USING (created_by = auth.uid() OR public.get_my_role() = 'admin');

-- Admin: ຈັດການທັງໝົດ (UPDATE status, DELETE)
CREATE POLICY "orders_admin_all" ON public.orders
  FOR ALL USING    (public.get_my_role() = 'admin')
  WITH CHECK       (public.get_my_role() = 'admin');

-- ─── 6. Realtime ──────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
