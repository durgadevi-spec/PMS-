-- Add indexes for common query patterns to improve performance

-- Employees table indexes
CREATE INDEX IF NOT EXISTS idx_employees_emp_code ON employees(emp_code);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);

-- Sessions table indexes
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_employee_id ON sessions(employee_id);

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- Project departments table indexes
CREATE INDEX IF NOT EXISTS idx_project_departments_project_id ON project_departments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_departments_department ON project_departments(department);

-- Project team members table indexes
CREATE INDEX IF NOT EXISTS idx_project_team_members_project_id ON project_team_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_team_members_employee_id ON project_team_members(employee_id);

-- Key steps table indexes
CREATE INDEX IF NOT EXISTS idx_key_steps_project_id ON key_steps(project_id);
CREATE INDEX IF NOT EXISTS idx_key_steps_status ON key_steps(status);

-- Project tasks table indexes
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);

-- Task members table indexes
CREATE INDEX IF NOT EXISTS idx_task_members_task_id ON task_members(task_id);
CREATE INDEX IF NOT EXISTS idx_task_members_employee_id ON task_members(employee_id);

-- Subtasks table indexes
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);

-- Project vendors table indexes
CREATE INDEX IF NOT EXISTS idx_project_vendors_project_id ON project_vendors(project_id);

-- Project files table indexes
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
