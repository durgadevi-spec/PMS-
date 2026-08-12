CREATE TABLE "employees" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emp_code" text,
	"designation" text,
	"email" text,
	"phone" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "key_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"phase" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_url" text,
	"file_size" integer,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"progress" integer DEFAULT 0,
	"start_date" timestamp,
	"end_date" timestamp,
	"team_members" jsonb DEFAULT '[]',
	"vendors" jsonb DEFAULT '[]',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar NOT NULL,
	"title" text NOT NULL,
	"is_completed" boolean DEFAULT false,
	"assigned_member" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium',
	"assigned_members" jsonb DEFAULT '[]',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"created_at" timestamp DEFAULT now()
);
