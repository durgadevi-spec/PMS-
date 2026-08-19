ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS custom_repeat_interval integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS custom_repeat_unit text DEFAULT 'weekly';