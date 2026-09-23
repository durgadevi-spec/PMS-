-- Migration: Add CC Members table for tasks
CREATE TABLE IF NOT EXISTS task_cc_members (
  task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_task_cc_members_task_id ON task_cc_members(task_id);
CREATE INDEX IF NOT EXISTS idx_task_cc_members_employee_id ON task_cc_members(employee_id);
