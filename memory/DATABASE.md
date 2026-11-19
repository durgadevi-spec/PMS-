# Database Schema & Models: PMS

## Connection Details
- **Provider**: Supabase PostgreSQL
- **Host**: `aws-0-ap-southeast-2.pooler.supabase.com:5432`
- **ORM**: Drizzle ORM (`shared/schema.ts`)

## Core Schema Tables
1. **`users`**: System users, auth credentials (hashed passwords), roles (`ADMIN` / `EMPLOYEE`), preferences.
2. **`employees`**: Employee directory, employee code, department, email, designation.
3. **`departments`**: Master department definitions.
4. **`projects`**: Project details, client names, start/end dates, status, budget, priority.
5. **`project_tasks`**: Tasks tied to projects with milestones, assignees, dates, estimated hours, priority.
6. **`task_members`**: Task-employee mapping table.
7. **`leaves`**: Leave management and time-off tracking.
8. **`attendance` / `timestrap`**: Integrated attendance clock-in/out records.
9. **`task_date_extension_requests`**: Per-task overdue date change requests, preserving original/requested start and end dates, employee reason, and pending/approved/rejected review metadata. Defined in `shared/schema.ts`; migration: `0025_add_task_date_extension_approvals.sql`.

10. **`project_tasks.initial_setup_expires_at`**: Nullable UTC deadline used to calculate the two-day Initial Setup phase for newly created tasks. Existing tasks remain `NULL` and retain prior date-change behavior. Migration: `0026_add_task_initial_setup_grace_period.sql`.
