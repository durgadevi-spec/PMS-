-- Migration: Add departments master table and seed it from existing data
CREATE TABLE IF NOT EXISTS departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);
--> statement-breakpoint
-- Seed from existing distinct employee.department values so nothing is lost
INSERT INTO departments (name)
SELECT DISTINCT TRIM(department)
FROM employees
WHERE department IS NOT NULL AND TRIM(department) != ''
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
-- Seed from existing distinct project_departments values as well (some may
-- have been used on projects but never assigned to any employee)
INSERT INTO departments (name)
SELECT DISTINCT TRIM(department)
FROM project_departments
WHERE department IS NOT NULL AND TRIM(department) != ''
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
-- Make sure the standard defaults referenced across the app always exist
INSERT INTO departments (name) VALUES
  ('HR'),
  ('Operations'),
  ('Software Developers'),
  ('Finance'),
  ('Purchase'),
  ('Presales'),
  ('IT Support'),
  ('Sales')
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
