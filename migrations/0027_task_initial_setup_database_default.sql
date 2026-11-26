CREATE OR REPLACE FUNCTION set_task_initial_setup_expiration()
RETURNS trigger AS $$
BEGIN
  IF NEW.initial_setup_expires_at IS NULL THEN
    NEW.initial_setup_expires_at := COALESCE(NEW.created_at, CURRENT_TIMESTAMP) + INTERVAL '2 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS set_task_initial_setup_expiration ON project_tasks;
--> statement-breakpoint

CREATE TRIGGER set_task_initial_setup_expiration
BEFORE INSERT ON project_tasks
FOR EACH ROW
EXECUTE FUNCTION set_task_initial_setup_expiration();
--> statement-breakpoint

UPDATE project_tasks
SET initial_setup_expires_at = COALESCE(created_at, CURRENT_TIMESTAMP) + INTERVAL '2 days'
WHERE initial_setup_expires_at IS NULL
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '2 days'
  AND created_at <= CURRENT_TIMESTAMP;
