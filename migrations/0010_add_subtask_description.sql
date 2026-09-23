-- Migration: add description column to subtasks
ALTER TABLE IF EXISTS subtasks
  ADD COLUMN IF NOT EXISTS description text DEFAULT '';

-- Backfill nothing; column is optional
