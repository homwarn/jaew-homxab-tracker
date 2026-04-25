-- ===================================================
-- FIX RLS POLICIES — ໃຊ້ get_my_role() ທຸກ table
-- ແກ້ infinite recursion + cross-user visibility
-- ===================================================

-- ─── PRODUCTION ───────────────────────────────────
DROP POLICY IF EXISTS "production_insert_producer" ON public.production;
DROP POLICY IF EXISTS "production_manage_admin"    ON public.production;

CREATE POLICY "production_insert_producer" ON public.production
  FOR INSERT WITH CHECK (public.get_my_role() IN ('producer', 'admin'));

CREATE POLICY "production_manage_admin" ON public.production
  FOR ALL USING    (public.get_my_role() = 'admin')
  WITH CHECK       (public.get_my_role() = 'admin');

-- ─── DISTRIBUTION ─────────────────────────────────
DROP POLICY IF EXISTS "distribution_insert_distributor" ON public.distribution;
DROP POLICY IF EXISTS "distribution_manage_admin"       ON public.distribution;

CREATE POLICY "distribution_insert_distributor" ON public.distribution
  FOR INSERT WITH CHECK (public.get_my_role() IN ('distributor', 'admin'));

CREATE POLICY "distribution_manage_admin" ON public.distribution
  FOR ALL USING    (public.get_my_role() = 'admin')
  WITH CHECK       (public.get_my_role() = 'admin');

-- ─── SALES ────────────────────────────────────────
DROP POLICY IF EXISTS "sales_insert_seller"  ON public.sales;
DROP POLICY IF EXISTS "sales_manage_admin"   ON public.sales;

CREATE POLICY "sales_insert_seller" ON public.sales
  FOR INSERT WITH CHECK (public.get_my_role() IN ('seller', 'admin'));

CREATE POLICY "sales_manage_admin" ON public.sales
  FOR ALL USING    (public.get_my_role() = 'admin')
  WITH CHECK       (public.get_my_role() = 'admin');

-- ─── STORES ───────────────────────────────────────
DROP POLICY IF EXISTS "stores_insert_distributor" ON public.stores;
DROP POLICY IF EXISTS "stores_manage_admin"       ON public.stores;

CREATE POLICY "stores_insert_distributor" ON public.stores
  FOR INSERT WITH CHECK (public.get_my_role() IN ('distributor', 'admin'));

CREATE POLICY "stores_manage_admin" ON public.stores
  FOR ALL USING    (public.get_my_role() = 'admin')
  WITH CHECK       (public.get_my_role() = 'admin');

-- ─── ENABLE REALTIME ──────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.production;
ALTER PUBLICATION supabase_realtime ADD TABLE public.distribution;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
