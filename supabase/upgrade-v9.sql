-- upgrade-v9.sql
-- Add delivery_fee_paid column to distribution table
-- (delivery_fee was added in upgrade-v8.sql)

ALTER TABLE distribution ADD COLUMN IF NOT EXISTS delivery_fee_paid BOOLEAN NOT NULL DEFAULT FALSE;
