-- Add department column to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS department text DEFAULT 'General';
