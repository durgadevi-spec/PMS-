CREATE TABLE IF NOT EXISTS task_date_extension_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  original_start_date date,
  original_end_date date,
  requested_start_date date,
  requested_end_date date,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'Pending',
  requested_at timestamp NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_task_date_extension_requests_status ON task_date_extension_requests(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_task_date_extension_requests_task_id ON task_date_extension_requests(task_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_task_date_extension_requests_project_id ON task_date_extension_requests(project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_task_date_extension_requests_requested_at ON task_date_extension_requests(requested_at);
