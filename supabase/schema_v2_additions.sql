-- ===================================================
-- ຕິດຕາມແຈ່ວຫອມແຊບ - Schema v2 Additions
-- ===================================================
-- Run this AFTER the original schema.sql, in Supabase SQL Editor
-- Aligns DB with what the React app expects.

-- ===================================================
-- 1. PRODUCTS — add unit_price (₭ per bottle)
-- ===================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0;

-- Seed prices ຕົວຢ່າງ (ປັບໄດ້)
UPDATE public.products SET unit_price = 25000 WHERE size = '550ml' AND COALESCE(unit_price,0) = 0;
UPDATE public.products SET unit_price = 15000 WHERE size = '250ml' AND COALESCE(unit_price,0) = 0;

-- ===================================================
-- 2. PRODUCTION — paid status + price snapshot
-- ===================================================
ALTER TABLE public.production
  ADD COLUMN IF NOT EXISTS is_paid    BOOLEAN       DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0;

-- ===================================================
-- 3. DISTRIBUTION — paid status, phone, unit_price (for revenue)
-- ===================================================
ALTER TABLE public.distribution
  ADD COLUMN IF NOT EXISTS is_paid    BOOLEAN       DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone      TEXT,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0;

-- Auto-fill unit_price from product on insert (so revenue calc works)
CREATE OR REPLACE FUNCTION public.fill_distribution_price()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unit_price IS NULL OR NEW.unit_price = 0 THEN
    SELECT unit_price INTO NEW.unit_price FROM public.products WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS distribution_fill_price ON public.distribution;
CREATE TRIGGER distribution_fill_price
  BEFORE INSERT ON public.distribution
  FOR EACH ROW EXECUTE FUNCTION public.fill_distribution_price();

-- Backfill existing rows
UPDATE public.distribution d
   SET unit_price = p.unit_price
  FROM public.products p
 WHERE d.product_id = p.id
   AND COALESCE(d.unit_price,0) = 0;

-- ===================================================
-- 4. SALES — paid status (optional, for parity)
-- ===================================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0;

-- ===================================================
-- 5. ORDERS TABLE (Seller → Admin → Distributor pipeline)
-- ===================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id  UUID REFERENCES public.products(id) NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','confirmed','delivered')),
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_all_auth" ON public.orders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "orders_insert_auth" ON public.orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND created_by = auth.uid());

CREATE POLICY "orders_update_admin_or_owner" ON public.orders
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','distributor'))
  );

CREATE POLICY "orders_delete_admin" ON public.orders
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===================================================
-- 6. NOTIFICATIONS TABLE (Admin → Distributor pickup alerts)
-- ===================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type         TEXT NOT NULL DEFAULT 'pickup',
  message      TEXT NOT NULL,
  assigned_to  UUID REFERENCES auth.users(id),  -- NULL = broadcast ທຸກ Distributor
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','acknowledged','cancelled')),
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Distributors see notifications assigned to them OR broadcast (assigned_to IS NULL)
-- Admin sees all
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR assigned_to IS NULL
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "notifications_insert_admin" ON public.notifications
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Distributor can acknowledge (update status only)
CREATE POLICY "notifications_update_distributor" ON public.notifications
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('distributor','admin'))
  );

CREATE POLICY "notifications_delete_admin" ON public.notifications
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===================================================
-- 7. INDEXES (dashboard query performance)
-- ===================================================
CREATE INDEX IF NOT EXISTS idx_distribution_created_at ON public.distribution(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_distribution_store      ON public.distribution(store_name);
CREATE INDEX IF NOT EXISTS idx_distribution_paid       ON public.distribution(is_paid);
CREATE INDEX IF NOT EXISTS idx_orders_status           ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_assigned  ON public.notifications(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_notifications_status    ON public.notifications(status, created_at DESC);

-- ===================================================
-- 8. updated_at trigger for orders
-- ===================================================
DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
