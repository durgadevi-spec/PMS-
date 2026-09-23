-- Migration: add start_date and end_date to subtasks
ALTER TABLE IF EXISTS subtasks
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE;

-- Backfill: leave NULL for existing rows

-- NOTE: After running migrations, server routes are updated to read/write these columns.