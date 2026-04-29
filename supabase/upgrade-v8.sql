-- upgrade-v8.sql
-- Add delivery_fee and prev_bill_amount columns to distribution table

ALTER TABLE distribution ADD COLUMN IF NOT EXISTS delivery_fee   NUMERIC DEFAULT 0;
ALTER TABLE distribution ADD COLUMN IF NOT EXISTS prev_bill_amount NUMERIC;
