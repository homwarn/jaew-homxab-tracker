-- ─── Upgrade v7 ──────────────────────────────────────────────────────────────
-- Run in: Supabase Dashboard → SQL Editor
-- New columns for: stores.phone, distribution.payment_period, production.is_paid

-- Add phone number field to stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add payment_period field to distribution
-- 'current'  = ຊຳລະບິນນີ້ (pay for current delivery)
-- 'previous' = ຊຳລະບິນງວດກ່ອນ (pay for previous bill)
ALTER TABLE distribution ADD COLUMN IF NOT EXISTS payment_period TEXT DEFAULT 'current';

-- Ensure production.is_paid exists (for labor/ค่าแรง payment tracking)
ALTER TABLE production ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE;
