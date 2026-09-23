-- Migration: Add delay_reasons table for tracking overdue task reasons
CREATE TABLE IF NOT EXISTS delay_reasons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  reason TEXT NOT NULL,
  delay_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES employees(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delay_reasons_task_id ON delay_reasons(task_id);
CREATE INDEX IF NOT EXISTS idx_delay_reasons_project_id ON delay_reasons(project_id);
CREATE INDEX IF NOT EXISTS idx_delay_reasons_delay_date ON delay_reasons(delay_date);
