-- Update project department for 'Facility Management vendor change' to 'presales'
UPDATE project_departments
SET department = 'presales'
WHERE project_id = (SELECT id FROM projects WHERE title = 'Facility Management vendor change');
-- Optionally, update other projects assigned to 'Presales' or variants
UPDATE project_departments
SET department = 'presales'
WHERE department ILIKE '%presales%';
