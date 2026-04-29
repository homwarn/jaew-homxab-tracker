-- ─── Upgrade v5 ── QR code per store ──────────────────────────────────────
-- Run this once in Supabase SQL Editor

-- Add qr_code_url column to stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS qr_code_url TEXT;

-- No additional RLS changes needed — existing stores policies cover this column
