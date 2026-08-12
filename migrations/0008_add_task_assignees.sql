-- 0008_add_task_assignees.sql
-- Add created_by_employee_id to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS created_by_employee_id uuid;

-- Create subtask_members mapping table for many-to-many assignees
CREATE TABLE IF NOT EXISTS subtask_members (
  subtask_id varchar NOT NULL,
  employee_id varchar NOT NULL,
  PRIMARY KEY (subtask_id, employee_id)
);

-- Optional: create foreign key constraints if employees and subtasks tables exist
DO $$
DECLARE
  has_subtasks_id boolean := false;
  subtasks_has_unique boolean := false;
  has_employees boolean := false;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subtasks' AND column_name = 'id') INTO has_subtasks_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees') INTO has_employees;

  -- Check whether subtasks.id is a primary key or has a unique constraint
  IF has_subtasks_id THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'subtasks' AND (tc.constraint_type = 'PRIMARY KEY' OR tc.constraint_type = 'UNIQUE') AND kcu.column_name = 'id'
    ) INTO subtasks_has_unique;
  END IF;

  IF subtasks_has_unique THEN
    BEGIN
      ALTER TABLE subtask_members
        ADD CONSTRAINT fk_subtask_members_subtask FOREIGN KEY (subtask_id) REFERENCES subtasks(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- skip if already exists
    WHEN others THEN
      RAISE NOTICE 'Skipping add fk fk_subtask_members_subtask: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'Skipping FK addition: subtasks.id missing or not unique';
  END IF;

  IF has_employees THEN
    BEGIN
      ALTER TABLE subtask_members
        ADD CONSTRAINT fk_subtask_members_employee FOREIGN KEY (employee_id) REFERENCES employees(id);
    EXCEPTION WHEN duplicate_object THEN
      -- skip
    WHEN others THEN
      RAISE NOTICE 'Skipping add fk fk_subtask_members_employee: %', SQLERRM;
    END;
  END IF;
END$$;
