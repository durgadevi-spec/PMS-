CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);

CREATE TABLE "task_tags" (
	"task_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);

ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "project_tasks"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "task_tags_task_id_idx" ON "task_tags" ("task_id");
CREATE INDEX "task_tags_tag_id_idx" ON "task_tags" ("tag_id");
