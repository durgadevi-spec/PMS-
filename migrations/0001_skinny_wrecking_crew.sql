ALTER TABLE "key_steps" ALTER COLUMN "id" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "key_steps" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "key_steps" ALTER COLUMN "project_id" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "key_steps" ALTER COLUMN "title" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "key_steps" ALTER COLUMN "status" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "key_steps" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "key_steps" ALTER COLUMN "start_date" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "key_steps" ALTER COLUMN "start_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "key_steps" ALTER COLUMN "end_date" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "key_steps" ALTER COLUMN "end_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "key_steps" ADD COLUMN "header" varchar(255);--> statement-breakpoint
ALTER TABLE "key_steps" ADD COLUMN "requirements" text;