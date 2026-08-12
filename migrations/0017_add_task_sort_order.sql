-- Migration: Add sort_order to project_tasks for drag & drop ordering
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
UPDATE project_tasks SET sort_order = 0 WHERE sort_order IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_sort_order ON project_tasks(project_id, sort_order);
