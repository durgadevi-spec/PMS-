ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sender_phone text;
--> statement-breakpoint
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sender_name text;
