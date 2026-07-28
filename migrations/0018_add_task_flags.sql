-- Migration: Add addon and issue tracker flags to project_tasks
ALTER TABLE project_tasks 
  ADD COLUMN IF NOT EXISTS is_addon BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_issue BOOLEAN DEFAULT FALSE;
