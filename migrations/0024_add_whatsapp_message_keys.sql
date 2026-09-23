ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS whatsapp_message_id text;
--> statement-breakpoint
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS whatsapp_remote_jid text;
--> statement-breakpoint
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS whatsapp_from_me boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS deleted_at timestamp;
