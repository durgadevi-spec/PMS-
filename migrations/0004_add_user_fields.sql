-- Add missing columns to users table for authentication
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employee_id" uuid;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'EMPLOYEE';
