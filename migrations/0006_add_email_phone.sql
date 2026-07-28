-- Add email and phone columns to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS phone text;
