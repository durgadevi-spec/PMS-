ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
--> statement-breakpoint
ALTER TABLE key_steps ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
--> statement-breakpoint
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
