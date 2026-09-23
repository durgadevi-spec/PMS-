-- Migration: add location column to projects
ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS location text;

-- Backfill nothing; column is optional
