-- Add foreign key constraint from subtasks.task_id to project_tasks.id with ON DELETE CASCADE
-- This migration is guarded: it will only add the FK if the referenced column exists and is suitable.
DO $$
BEGIN
	-- Only proceed if project_tasks table has an 'id' column
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'project_tasks' AND column_name = 'id'
	) THEN
		-- Only add constraint if it does not already exist and the FK is valid
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
			WHERE tc.table_name = 'subtasks' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'task_id'
		) THEN
			BEGIN
				-- Try to add constraint; wrap in EXCEPTION to avoid migration failure
				ALTER TABLE "subtasks" 
				ADD CONSTRAINT "subtasks_task_id_fkey" 
				FOREIGN KEY ("task_id") REFERENCES "project_tasks"("id") ON DELETE CASCADE;
			EXCEPTION WHEN others THEN
				-- If adding fails (e.g., referenced column not unique), log and skip
				RAISE NOTICE 'Skipping add foreign key subtasks.task_id -> project_tasks.id due to error';
			END;
		END IF;
	ELSE
		RAISE NOTICE 'Skipping migration: project_tasks.id does not exist';
	END IF;
END
$$;

