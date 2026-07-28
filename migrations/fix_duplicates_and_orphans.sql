-- Remove duplicate department entries for the same project
DELETE FROM project_departments a
USING project_departments b
WHERE a.ctid < b.ctid
  AND a.project_id = b.project_id
  AND a.department = b.department;

-- Remove task_members rows where task_id does not exist in tasks
delete from task_members
where task_id not in (select id from tasks);
