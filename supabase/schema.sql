-- ===================================================
-- ຕິດຕາມແຈ່ວຫອມແຊບ - Supabase Database Schema
-- ===================================================
-- Run this in Supabase SQL Editor

-- 1. PROFILES TABLE (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id        UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL CHECK (role IN ('producer', 'distributor', 'seller', 'admin')),
  store_name TEXT,
  phone     TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name TEXT NOT NULL,
  size         TEXT NOT NULL,
  type         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PRODUCTION TABLE
CREATE TABLE IF NOT EXISTS public.production (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id  UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  destination TEXT NOT NULL DEFAULT 'retail' CHECK (destination IN ('retail', 'wholesale')),
  image_url   TEXT,
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DISTRIBUTION TABLE
CREATE TABLE IF NOT EXISTS public.distribution (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id       UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  store_name       TEXT NOT NULL,
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer')),
  receiver_name    TEXT,
  transfer_note    TEXT,
  bill_image_url   TEXT,
  slip_image_url   TEXT,
  delivery_image_url TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SALES TABLE
CREATE TABLE IF NOT EXISTS public.sales (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id       UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  remaining        INTEGER DEFAULT 0,
  store_name       TEXT NOT NULL,
  image_url        TEXT,
  report_image_url TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 6. STORES TABLE
CREATE TABLE IF NOT EXISTS public.stores (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  address    TEXT,
  phone      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================================================
-- ENABLE ROW LEVEL SECURITY
-- ===================================================
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores      ENABLE ROW LEVEL SECURITY;

-- ===================================================
-- PROFILES POLICIES
-- ===================================================
-- Users can view their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Admin can view all profiles
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admin can insert profiles (user creation)
CREATE POLICY "profiles_insert_admin" ON public.profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admin can update profiles
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admin can delete profiles
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===================================================
-- PRODUCTS POLICIES
-- ===================================================
CREATE POLICY "products_select_all" ON public.products
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "products_manage_admin" ON public.products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===================================================
-- PRODUCTION POLICIES
-- ===================================================
CREATE POLICY "production_select_all" ON public.production
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "production_insert_producer" ON public.production
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('producer', 'admin'))
  );

CREATE POLICY "production_manage_admin" ON public.production
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===================================================
-- DISTRIBUTION POLICIES
-- ===================================================
CREATE POLICY "distribution_select_all" ON public.distribution
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "distribution_insert_distributor" ON public.distribution
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('distributor', 'admin'))
  );

CREATE POLICY "distribution_manage_admin" ON public.distribution
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===================================================
-- SALES POLICIES
-- ===================================================
CREATE POLICY "sales_select_all" ON public.sales
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "sales_insert_seller" ON public.sales
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('seller', 'admin'))
  );

CREATE POLICY "sales_manage_admin" ON public.sales
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===================================================
-- STORES POLICIES
-- ===================================================
CREATE POLICY "stores_select_all" ON public.stores
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "stores_insert_distributor" ON public.stores
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('distributor', 'admin'))
  );

CREATE POLICY "stores_manage_admin" ON public.stores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===================================================
-- SEED DATA
-- ===================================================
-- Insert 4 product types
INSERT INTO public.products (product_name, size, type) VALUES
  ('ແຈ່ວຫອມແຊບ', '550ml', 'ເຂັ້ມຂຸ້ນ'),
  ('ແຈ່ວຫອມແຊບ', '250ml', 'ເຂັ້ມຂຸ້ນ'),
  ('ແຈ່ວຫອມແຊບ', '550ml', 'ນຸ້ມນວນ'),
  ('ແຈ່ວຫອມແຊບ', '250ml', 'ນຸ້ມນວນ')
ON CONFLICT DO NOTHING;

-- ===================================================
-- STORAGE BUCKETS (run separately in Supabase Dashboard > Storage)
-- ===================================================
-- Create these buckets manually in the Supabase Dashboard:
-- 1. production-images  (public: false)
-- 2. distribution-images (public: false)
-- 3. sales-images       (public: false)
--
-- Then add these storage policies for each bucket:
-- Allow authenticated users to upload their own files
-- Allow authenticated users to view files

-- ===================================================
-- FUNCTION: updated_at trigger
-- ===================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===================================================
-- STORAGE POLICIES (run after creating buckets)
-- ===================================================
-- production-images bucket policies:
INSERT INTO storage.buckets (id, name, public) VALUES ('production-images', 'production-images', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('distribution-images', 'distribution-images', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('sales-images', 'sales-images', false) ON CONFLICT DO NOTHING;

CREATE POLICY "auth_upload_production" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'production-images' AND auth.role() = 'authenticated');
CREATE POLICY "auth_read_production" ON storage.objects
  FOR SELECT USING (bucket_id = 'production-images' AND auth.role() = 'authenticated');

CREATE POLICY "auth_upload_distribution" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'distribution-images' AND auth.role() = 'authenticated');
CREATE POLICY "auth_read_distribution" ON storage.objects
  FOR SELECT USING (bucket_id = 'distribution-images' AND auth.role() = 'authenticated');

CREATE POLICY "auth_upload_sales" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'sales-images' AND auth.role() = 'authenticated');
CREATE POLICY "auth_read_sales" ON storage.objects
  FOR SELECT USING (bucket_id = 'sales-images' AND auth.role() = 'authenticated');
