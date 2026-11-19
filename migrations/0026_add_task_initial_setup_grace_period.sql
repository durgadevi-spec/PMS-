ALTER TABLE project_tasks
ADD COLUMN IF NOT EXISTS initial_setup_expires_at timestamp with time zone;
