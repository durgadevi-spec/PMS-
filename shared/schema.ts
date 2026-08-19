import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
  uuid,
  bigint,
  index,
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { z } from "zod";

/* ===============================
   USERS
================================ */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  // Link to employee record (optional)
  employeeId: uuid("employee_id").references(() => employees.id),
  // Role: 'ADMIN' or 'EMPLOYEE'
  role: text("role").default("EMPLOYEE"),
  // Persistent filter preferences
  filterSettings: jsonb("filter_settings").default({}),
}, (table) => [
  index("idx_users_employee_id").on(table.employeeId),
]);

/* ===============================
   DEPARTMENTS (master table)
================================ */
export const departments = pgTable("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
   EMPLOYEES
================================ */
export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  empCode: text("emp_code").unique(),
  name: text("name").notNull(),
  designation: text("designation"),
  department: text("department"),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_employees_department").on(table.department),
]);

/* ===============================
   PROJECTS  ✅ NEON DATABASE
================================ */
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),

  title: text("title").notNull(),
  projectCode: text("project_code").notNull(),

  description: text("description"),

  clientName: text("client_name"),
  company: text("company"),
  // Optional physical/location field near client
  location: text("location"),
  holdReason: text("hold_reason"),

  status: text("status").notNull().default("Planned"),
  progress: integer("progress").notNull().default(0),

  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  // Track which employee created the project (optional)
  createdByEmployeeId: uuid("created_by_employee_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_projects_status").on(table.status),
  index("idx_projects_created_at").on(table.createdAt),
]);

/* add location to insert schema */

/* ===============================
   PROJECT DEPARTMENTS
================================ */
export const projectDepartments = pgTable("project_departments", {
  projectId: uuid("project_id").notNull(),
  department: text("department").notNull(),
}, (table) => [
  index("idx_project_departments_project_id").on(table.projectId),
  index("idx_project_departments_department").on(table.department),
]);

/* ===============================
   PROJECT TEAM MEMBERS
================================ */
export const projectTeamMembers = pgTable("project_team_members", {
  projectId: uuid("project_id").notNull(),
  employeeId: uuid("employee_id").notNull(),
}, (table) => [
  index("idx_project_team_members_project_id").on(table.projectId),
  index("idx_project_team_members_employee_id").on(table.employeeId),
  index("idx_project_team_members_project_employee").on(table.projectId, table.employeeId),
]);

/* ===============================
   PROJECT VENDORS
================================ */
export const projectVendors = pgTable("project_vendors", {
  projectId: uuid("project_id").notNull(),
  vendorName: text("vendor_name").notNull(),
}, (table) => [
  index("idx_project_vendors_project_id").on(table.projectId),
]);

/* ===============================
   KEY STEPS (with nesting support)
================================ */
export const keySteps = pgTable("key_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  parentKeyStepId: uuid("parent_key_step_id"), // For nested key steps

  header: varchar("header", { length: 255 }),
  title: varchar("title", { length: 255 }).notNull(),

  description: text("description"),
  requirements: text("requirements"),

  phase: integer("phase").notNull(),
  status: varchar("status", { length: 20 }).default("pending"),

  startDate: date("start_date"),
  endDate: date("end_date"),

  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  progress: integer("progress").default(0).notNull(),
  sortOrder: integer("sort_order"),
}, (table) => [
  index("idx_key_steps_project_id").on(table.projectId),
  index("idx_key_steps_status").on(table.status),
  index("idx_key_steps_created_at").on(table.createdAt),
  index("idx_key_steps_sort_order").on(table.sortOrder),
]);

/* ===============================
   KEY STEP TEMPLATES
================================ */
export const keyStepTemplates = pgTable("key_step_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const keyStepTemplateItems = pgTable("key_step_template_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: uuid("template_id").notNull().references(() => keyStepTemplates.id, { onDelete: "cascade" }),
  header: varchar("header", { length: 255 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  requirements: text("requirements"),
  phase: integer("phase").notNull(),
});


/* ===============================
   PROJECT TASKS
================================ */
export const projectTasks = pgTable("project_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),

  projectId: uuid("project_id").notNull(),
  keyStepId: uuid("key_step_id"),

  taskName: text("task_name").notNull(),
  description: text("description"),

  status: text("status").default("pending"),
  priority: text("priority").default("medium"),

  startDate: date("start_date"),
  endDate: date("end_date"),
  // Number of days from Start Date used to auto-calculate End Date
  // (e.g. Start Date + durationDays = End Date). Kept in sync server-side.
  durationDays: integer("duration_days"),

  assignerId: uuid("assigner_id").notNull(),
  taskPeriod: text("task_period").default("custom"), // Today, 1 Week, Fortnight, 1 Month, Quarterly, Half Yearly, Annual, custom
  reminderFrequency: text("reminder_frequency").default("1 Time"), // 1 Time, 2 Times, 4 Times, Daily, Weekly, Monthly, Custom
  lastNotifiedAt: timestamp("last_notified_at"),

  // Ownership & Performance
  taskOwnerId: uuid("task_owner_id").references(() => employees.id),
  performancePoints: integer("performance_points").default(0),
  gracePeriodDays: integer("grace_period_days").default(2),

  // Ordering
  sortOrder: integer("sort_order").default(0),

  // Flags
  isAddon: boolean("is_addon").default(false),
  isIssue: boolean("is_issue").default(false),
  parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => projectTasks.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  completionDate: date("completion_date"),
  progress: integer("progress").default(0).notNull(),
  ticketId: uuid("ticket_id"),
}, (table) => [
  index("idx_project_tasks_project_id").on(table.projectId),
  index("idx_project_tasks_status").on(table.status),
  index("idx_project_tasks_assigner_id").on(table.assignerId),
  index("idx_project_tasks_task_owner_id").on(table.taskOwnerId),
  index("idx_project_tasks_last_notified_at").on(table.lastNotifiedAt),
  index("idx_project_tasks_created_at").on(table.createdAt),
  index("idx_project_tasks_sort_order").on(table.projectId, table.sortOrder),
]);

/* ===============================
   TASK MEMBERS
================================ */
export const taskMembers = pgTable("task_members", {
  taskId: uuid("task_id").notNull(),
  employeeId: uuid("employee_id").notNull(),
}, (table) => [
  index("idx_task_members_task_id").on(table.taskId),
  index("idx_task_members_employee_id").on(table.employeeId),
  index("idx_task_members_task_id_employee_id").on(table.taskId, table.employeeId),
]);

/* ===============================
   TASK CC MEMBERS
================================ */
export const taskCcMembers = pgTable("task_cc_members", {
  taskId: uuid("task_id").notNull(),
  employeeId: uuid("employee_id").notNull(),
}, (table) => [
  index("idx_task_cc_members_task_id").on(table.taskId),
  index("idx_task_cc_members_employee_id").on(table.employeeId),
]);

/* ===============================
   SUBTASK MEMBERS (many-to-many)
================================ */
export const subtaskMembers = pgTable("subtask_members", {
  subtaskId: uuid("subtask_id").notNull().references(() => subtasks.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull(),
}, (table) => [
  index("idx_subtask_members_subtask_id").on(table.subtaskId),
  index("idx_subtask_members_employee_id").on(table.employeeId),
]);

/* ===============================
   TAGS
================================ */
export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
   TASK TAGS (many-to-many)
================================ */
export const taskTags = pgTable("task_tags", {
  taskId: uuid("task_id").notNull().references(() => projectTasks.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => [
  index("idx_task_tags_task_id").on(table.taskId),
  index("idx_task_tags_tag_id").on(table.tagId),
]);

/* ===============================
   TASK TEMPLATES
   Saved presets of the fields that tend to repeat across similar tasks
   (Project, Key Step, Assigned By, Task Owner, Assignees, Tags, Priority,
   Task Period, Reminder Frequency) so Add Task can be pre-filled from one
   instead of re-picking the same dropdowns every time.
================================ */
export const taskTemplates = pgTable("task_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),

  projectId: uuid("project_id"),
  keyStepId: uuid("key_step_id"),
  assignerId: uuid("assigner_id"),
  taskOwnerId: uuid("task_owner_id"),
  taskMembers: jsonb("task_members").$type<string[]>().default([]),
  tagIds: jsonb("tag_ids").$type<string[]>().default([]),

  priority: text("priority").default("medium"),
  taskPeriod: text("task_period").default("custom"),
  reminderFrequency: text("reminder_frequency").default("1 Time"),

  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_task_templates_project_id").on(table.projectId),
  index("idx_task_templates_created_by").on(table.createdBy),
]);

/* ===============================
   SUBTASKS
================================ */
export const subtasks = pgTable("subtasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => projectTasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").default(""),
  isCompleted: boolean("is_completed").default(false),
  assignedTo: uuid("assigned_to").references(() => employees.id),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  progress: integer("progress").default(0).notNull(),

  // Flags (mirrors project_tasks)
  isAddon: boolean("is_addon").default(false),
  isIssue: boolean("is_issue").default(false),

  // Ownership, priority & status (mirrors project_tasks so subtasks can be
  // inline-edited with the same fields as their parent task)
  taskOwnerId: uuid("task_owner_id").references(() => employees.id),
  priority: text("priority").default("medium"),
  status: text("status").default("Not Started"),
  // Array of employee IDs cc'd on this subtask. Kept as a simple JSON array
  // (unlike task_cc_members, which uses a join table) to avoid touching every
  // bulk-fetch query path for a lightweight, subtask-only feature.
  ccMembers: jsonb("cc_members").default([]),

  // Full field-parity with project_tasks (added so subtask rows can be
  // inline-edited exactly like task rows — Key Step, Period, Frequency,
  // Assigned By, Duration, Completion Date). Tags use a separate join
  // table (subtask_tags), same pattern as task_tags.
  keyStepId: uuid("key_step_id"),
  taskPeriod: text("task_period").default("custom"),
  reminderFrequency: text("reminder_frequency").default("1 Time"),
  assignerId: uuid("assigner_id"),
  durationDays: integer("duration_days"),
  completionDate: date("completion_date"),
}, (table) => [
  index("idx_subtasks_task_id").on(table.taskId),
  index("idx_subtasks_task_owner_id").on(table.taskOwnerId),
  index("idx_subtasks_key_step_id").on(table.keyStepId),
  index("idx_subtasks_assigner_id").on(table.assignerId),
]);

/* ===============================
   SUBTASK TAGS (many-to-many, mirrors task_tags)
================================ */
export const subtaskTags = pgTable("subtask_tags", {
  subtaskId: uuid("subtask_id").notNull().references(() => subtasks.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => [
  index("idx_subtask_tags_subtask_id").on(table.subtaskId),
  index("idx_subtask_tags_tag_id").on(table.tagId),
]);

/* ===============================
   PROJECT FILES  ✅ NEON
================================ */
export const projectFiles = pgTable("project_files", {
  id: uuid("id").defaultRandom().primaryKey(),

  projectId: uuid("project_id").notNull(),

  fileName: text("file_name").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  mimeType: text("mime_type"),
  storageUrl: text("storage_url"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_project_files_project_id").on(table.projectId),
]);

/* ===============================
   SESSIONS (server-side tokens)
================================ */
export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: text("token").notNull().unique(),
  userId: uuid("user_id").references(() => users.id),
  employeeId: uuid("employee_id").references(() => employees.id),
  empCode: text("emp_code"),
  role: text("role"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_sessions_user_id").on(table.userId),
  index("idx_sessions_employee_id").on(table.employeeId),
]);

/* ===============================
   VENDORS
================================ */
export const vendors = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
   PROGRESS LOGS
================================ */
export const progressLogs = pgTable("progress_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id"),
  keyStepId: uuid("key_step_id"),
  taskId: uuid("task_id"),
  subtaskId: uuid("subtask_id"),
  percentage: integer("percentage").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: uuid("updated_by"),
}, (table) => [
  index("idx_progress_logs_project_updated").on(table.projectId, table.updatedAt),
]);

/* ===============================
   DISCUSSIONS
================================ */
export const discussions = pgTable("discussions", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdBy: uuid("created_by").notNull().references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_discussions_created_by").on(table.createdBy),
  index("idx_discussions_created_at").on(table.createdAt),
]);

/* ===============================
   DISCUSSION REPLIES
================================ */
export const discussionReplies = pgTable("discussion_replies", {
  id: uuid("id").defaultRandom().primaryKey(),
  discussionId: uuid("discussion_id").notNull().references(() => discussions.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdBy: uuid("created_by").notNull().references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_discussion_replies_discussion_id").on(table.discussionId),
]);

/* ===============================
   DISCUSSION PARTICIPANTS
================================ */
export const discussionParticipants = pgTable("discussion_participants", {
  discussionId: uuid("discussion_id").notNull().references(() => discussions.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
}, (table) => [
  index("idx_discussion_participants_discussion_id").on(table.discussionId),
  index("idx_discussion_participants_employee_id").on(table.employeeId),
]);

/* ===============================
   DISCUSSION ATTACHMENTS
================================ */
export const discussionAttachments = pgTable("discussion_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  discussionId: uuid("discussion_id").references(() => discussions.id, { onDelete: "cascade" }),
  replyId: uuid("reply_id").references(() => discussionReplies.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  mimeType: text("mime_type"),
  storageUrl: text("storage_url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
/* ===============================
   SITE REPORTS
================================ */
export const siteReports = pgTable("site_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => projectTasks.id, { onDelete: "set null" }),
  subtaskId: uuid("subtask_id").references(() => subtasks.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull().references(() => employees.id),
  clientEmail: text("client_email"),
  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
   SITE REPORT ATTACHMENTS
================================ */
export const siteReportAttachments = pgTable("site_report_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id").notNull().references(() => siteReports.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  mimeType: text("mime_type"),
  storageUrl: text("storage_url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
   TICKETS
================================ */
export const tickets = pgTable("tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketCode: text("ticket_code").notNull().unique(), // Auto-generated ID like TKT-001
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  priority: text("priority").notNull().default("Medium"), // Critical, High, Medium, Low
  department: text("department").notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  status: text("status").notNull().default("Open"), // Open, In Progress, Resolved, Closed, Pending Closure
  createdBy: uuid("created_by").notNull().references(() => employees.id),
  assignedTo: uuid("assigned_to").references(() => employees.id),
  manualProject: text("manual_project"),
  companyName: text("company_name"),
  participants: jsonb("participants").default([]),
  completedLines: jsonb("completed_lines").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  taskId: uuid("task_id"),
  closeReason: text("close_reason"),
  closeRequestedBy: uuid("close_requested_by").references(() => employees.id),
}, (table) => [
  index("idx_tickets_project_id").on(table.projectId),
  index("idx_tickets_status").on(table.status),
  index("idx_tickets_created_at").on(table.createdAt),
  index("idx_tickets_participants_gin").using("gin", table.participants),
]);

/* ===============================
   TICKET COMMENTS
================================ */
export const ticketComments = pgTable("ticket_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdBy: uuid("created_by").notNull().references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ticket_comments_ticket_id").on(table.ticketId),
]);

/* ===============================
   TICKET ATTACHMENTS
================================ */
export const ticketAttachments = pgTable("ticket_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  mimeType: text("mime_type"),
  storageUrl: text("storage_url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ticket_attachments_ticket_id").on(table.ticketId),
]);

/* ===============================
   EMAIL GROUPS
================================ */
export const emailGroups = pgTable("email_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  emails: text("emails").notNull(), // Comma-separated emails
  createdBy: uuid("created_by").notNull().references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/* ===============================
   TASK COMMENTS
================================ */
export const taskComments = pgTable("task_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => projectTasks.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdBy: uuid("created_by").notNull().references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_task_comments_task_id").on(table.taskId),
]);

/* ===============================
   DELAY REASONS
================================ */
export const delayReasons = pgTable("delay_reasons", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => projectTasks.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull(),
  reason: text("reason").notNull(),
  delayDate: date("delay_date").notNull(),
  recordedBy: uuid("recorded_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_delay_reasons_task_id").on(table.taskId),
  index("idx_delay_reasons_project_id").on(table.projectId),
  index("idx_delay_reasons_delay_date").on(table.delayDate),
]);

/* ===============================================================
   TASK DEPENDENCIES  (Enterprise Scheduling Module — NEW FEATURE)
   -----------------------------------------------------------------
   Purely additive tables. Existing tasks/projects are completely
   unaffected unless a dependency row is explicitly created for them.
================================================================= */
export const taskDependencies = pgTable("task_dependencies", {
  id: uuid("id").defaultRandom().primaryKey(),

  // The project both tasks must belong to (denormalized for fast
  // "same project only" validation + project-level queries/history).
  projectId: uuid("project_id").notNull(),

  // The "upstream" task that drives the schedule.
  predecessorId: uuid("predecessor_id").notNull().references(() => projectTasks.id, { onDelete: "cascade" }),
  // The "downstream" task whose dates automatically shift.
  successorId: uuid("successor_id").notNull().references(() => projectTasks.id, { onDelete: "cascade" }),

  // FS (Finish-to-Start), SS (Start-to-Start), FF (Finish-to-Finish), SF (Start-to-Finish)
  type: text("type").notNull().default("FS"),

  // Optional lag/lead in days (positive = lag, negative = lead). Defaults to 0.
  lagDays: integer("lag_days").notNull().default(0),

  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_task_dependencies_project_id").on(table.projectId),
  index("idx_task_dependencies_predecessor_id").on(table.predecessorId),
  index("idx_task_dependencies_successor_id").on(table.successorId),
]);

/* ===============================================================
   TASK SCHEDULE HISTORY  (Enterprise Scheduling Module — NEW FEATURE)
   -----------------------------------------------------------------
   Append-only audit log of every start/end/duration change, whether
   made manually by a user or automatically via dependency cascade.
================================================================= */
export const taskScheduleHistory = pgTable("task_schedule_history", {
  id: uuid("id").defaultRandom().primaryKey(),

  taskId: uuid("task_id").notNull().references(() => projectTasks.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull(),

  previousStartDate: date("previous_start_date"),
  newStartDate: date("new_start_date"),
  previousEndDate: date("previous_end_date"),
  newEndDate: date("new_end_date"),
  previousDuration: integer("previous_duration"),
  newDuration: integer("new_duration"),

  reason: text("reason"),
  // 'Manual' | 'Dependency Cascade' | 'System'
  changeType: text("change_type").notNull().default("Manual"),

  // When this row was produced as a cascade effect of another task's
  // change, this points at the task that triggered it (for the
  // "Parent Task" / "Shifted by" display in the History screen).
  triggeredByTaskId: uuid("triggered_by_task_id"),
  shiftedByDays: integer("shifted_by_days"),

  changedBy: uuid("changed_by"),
  changedAt: timestamp("changed_at").defaultNow(),
}, (table) => [
  index("idx_task_schedule_history_task_id").on(table.taskId),
  index("idx_task_schedule_history_project_id").on(table.projectId),
  index("idx_task_schedule_history_changed_at").on(table.changedAt),
]);

export type TaskDependency = typeof taskDependencies.$inferSelect;
export type TaskScheduleHistory = typeof taskScheduleHistory.$inferSelect;

/* ===============================
   ZOD SCHEMAS
================================ */

export const dependencyTypeEnum = z.enum(["FS", "SS", "FF", "SF"]);

export const insertTaskDependencySchema = z.object({
  projectId: z.string().uuid(),
  predecessorId: z.string().uuid(),
  successorId: z.string().uuid(),
  type: dependencyTypeEnum.default("FS"),
  lagDays: z.number().int().default(0),
});

export const scheduleChangePayloadSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  durationDays: z.number().int().positive().optional(),
  // Mandatory for manual changes; omitted/ignored for system cascades.
  reason: z.string().min(1).optional(),
  reasonCategory: z.string().optional(),
});
export const insertProjectSchema = z.object({
  title: z.string().min(1),
  projectCode: z.string().optional(),
  department: z.array(z.string()).optional(),
  description: z.string().optional(),

  clientName: z.string().optional(), // ✅ REQUIRED FOR UI
  location: z.string().optional(),

  status: z.string().optional(),
  progress: z.number().optional(),

  startDate: z.string().optional(),
  endDate: z.string().optional(),

  assignerId: z.string().uuid().optional(),

  vendors: z.array(z.string()).optional(),
});

export const insertTicketSchema = z.object({
  title: z.string().optional().default("No Title"),
  description: z.string().optional().default(""),
  category: z.string().optional().default("Other"),
  priority: z.string().default("Medium"),
  department: z.string().optional().default("General"),
  projectId: z.string().uuid().optional().nullable(),
  manualProject: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  participants: z.array(z.string()).optional().default([]),
  assignedTo: z.string().uuid().optional().nullable(),
});

export const insertKeyStepTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
});

export const insertKeyStepTemplateItemSchema = z.object({
  templateId: z.string().uuid(),
  header: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  requirements: z.string().optional(),
  phase: z.number().int(),
});

export const insertTagSchema = z.object({
  name: z.string().min(1, "Tag name is required").trim(),
});

/* ===============================
   TYPES
================================ */
export type User = typeof users.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type KeyStep = typeof keySteps.$inferSelect;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type TaskMember = typeof taskMembers.$inferSelect;
export type Subtask = typeof subtasks.$inferSelect & {
  startDate?: string;
  endDate?: string;
  isCompleted: boolean;
};
export type ProjectFile = typeof projectFiles.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type ProgressLog = typeof progressLogs.$inferSelect;
export type Discussion = typeof discussions.$inferSelect;
export type DiscussionReply = typeof discussionReplies.$inferSelect;
export type DiscussionParticipant = typeof discussionParticipants.$inferSelect;
export type DiscussionAttachment = typeof discussionAttachments.$inferSelect;

export type Ticket = typeof tickets.$inferSelect;
export type TicketComment = typeof ticketComments.$inferSelect;
export type TicketAttachment = typeof ticketAttachments.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;

export type KeyStepTemplate = typeof keyStepTemplates.$inferSelect;
export type KeyStepTemplateItem = typeof keyStepTemplateItems.$inferSelect;
export type TaskCcMember = typeof taskCcMembers.$inferSelect;
export type DelayReason = typeof delayReasons.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type TaskTag = typeof taskTags.$inferSelect;

/* ===============================
   CALENDAR EVENTS
================================ */
export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  videoLink: text("video_link"),

  allDay: boolean("all_day").default(false).notNull(),
  date: text("date").notNull(),
  endDate: text("end_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),

  calendarType: text("calendar_type").notNull().default('meeting'),
  colorKey: text("color_key").notNull().default('peacock'),

  projectId: uuid("project_id"),
  projectTitle: text("project_title"),
  taskId: uuid("task_id"),
  taskTitle: text("task_title"),

  repeat: text("repeat").notNull().default('none'),
  customRepeatInterval: integer("custom_repeat_interval").default(1),
  customRepeatUnit: text("custom_repeat_unit").default('weekly'),
  repeatUntil: text("repeat_until"), // yyyy-MM-dd; null = repeats indefinitely
  reminders: jsonb("reminders").default([]),

  visibility: text("visibility").notNull().default('default'),
  busy: boolean("busy").default(true).notNull(),

  guestsCanModify: boolean("guests_can_modify").default(false),
  guestsCanInvite: boolean("guests_can_invite").default(true),
  guestsCanSeeGuestList: boolean("guests_can_see_guest_list").default(true),

  guests: jsonb("guests").default([]),

  // Guest RSVP (Accept / Decline / Propose new time), Google-Calendar style.
  // On a guest's own linked copy row (isOrganizer=false), these describe
  // *that guest's* response. Ignored on an organizer's own row — the
  // organizer's authoritative per-guest status/proposal instead lives inside
  // each entry of the `guests` jsonb array above (works for external guests
  // too, who have no row of their own).
  responseStatus: text("response_status").notNull().default('needsAction'), // needsAction | accepted | declined | proposed
  proposedDate: text("proposed_date"),
  proposedStartTime: text("proposed_start_time"),
  proposedEndTime: text("proposed_end_time"),
  proposedNote: text("proposed_note"),
  respondedAt: timestamp("responded_at"),

  // Internal guest sync: when an internal (logged-in) employee is added as a
  // guest, we insert a linked copy of the event into their own calendar so
  // it shows up there automatically, like Google Calendar does. sourceEventId
  // points back at the organizer's original row; isOrganizer is false on
  // those linked guest copies.
  sourceEventId: uuid("source_event_id"),
  isOrganizer: boolean("is_organizer").notNull().default(true),
  organizerName: text("organizer_name"),
  organizerEmail: text("organizer_email"),

  // Google Calendar two-way sync
  googleEventId: text("google_event_id"),
  source: text("source").notNull().default('app'), // 'app' | 'google'
  googleUpdatedAt: timestamp("google_updated_at"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_calendar_events_user_id").on(table.userId),
  index("idx_calendar_events_google_event_id").on(table.googleEventId),
  index("idx_calendar_events_source_event_id").on(table.sourceEventId),
]);

export type CalendarEventModel = typeof calendarEvents.$inferSelect;

/* ===============================
   GOOGLE CALENDAR ACCOUNTS (OAuth tokens per user)
================================ */
export const googleCalendarAccounts = pgTable("google_calendar_accounts", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  googleEmail: text("google_email").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry").notNull(),
  calendarId: text("calendar_id").notNull().default('primary'),
  syncToken: text("sync_token"),
  lastSyncedAt: timestamp("last_synced_at"),
  connectedAt: timestamp("connected_at").defaultNow(),
});

export type GoogleCalendarAccountModel = typeof googleCalendarAccounts.$inferSelect;