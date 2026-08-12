import { pgTable, varchar, date, numeric, timestamp, uuid, text, integer, primaryKey, boolean, bigint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const employees = pgTable("Employees", {
	empCode: varchar("emp_code").primaryKey().notNull(),
	employeeName: varchar("employee_name").default(').notNull(),
	designation: varchar().default('),
	dateOfBirth: date("date_of_birth").notNull(),
	contactNumber: numeric("contact_number"),
	currentAddress: varchar("current_address").default('),
	email: varchar().default('),
	teamLeadCode: varchar("team_lead_code").default('),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const projectTeamMembers = pgTable("project_team_members", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectCode: text("project_code").notNull(),
	empCode: text("emp_code").notNull(),
	assignedAt: timestamp("assigned_at", { mode: 'string' }).defaultNow(),
});

export const projects = pgTable("Projects", {
	projectCode: varchar("project_code").default(').primaryKey().notNull(),
	projectName: varchar("project_name").default(').notNull(),
	description: text().default('),
	status: text().default('),
	startDate: date("start_date"),
	endDate: date("end_date"),
	createdByEmpCode: varchar("created_by_emp_code").default('),
	progressPercentage: integer("progress_percentage"),
});

export const projectVendors = pgTable("project_vendors", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectCode: text("project_code").notNull(),
	vendorName: text("vendor_name").notNull(),
	assignedAt: timestamp("assigned_at", { mode: 'string' }).defaultNow(),
});

export const keySteps = pgTable("key_steps", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	parentKeyStepId: uuid("parent_key_step_id"),
	header: text(),
	title: text().notNull(),
	description: text(),
	requirements: text(),
	phase: integer().notNull(),
	status: text().notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const projectFiles = pgTable("project_files", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: text("project_id").notNull(),
	fileName: text("file_name").notNull(),
	fileType: text("file_type"),
	fileSize: integer("file_size"),
	filePath: text("file_path"),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow(),
	fileUrl: text("file_url"),
	uploadedBy: text("uploaded_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const subtasks = pgTable("Subtasks", {
	projectCode: varchar("project_code").notNull(),
	taskName: varchar("task_name").notNull(),
	subtaskName: varchar("subtask_name").notNull(),
	isCompleted: boolean("is_completed"),
	assignedToEmpCode: varchar("assigned_to_emp_code"),
}, (table) => [
	primaryKey({ columns: [table.projectCode, table.taskName, table.subtaskName], name: "assigned_to_emp_code_pkey"}),
]);

export const tasks = pgTable("Tasks", {
	projectCode: varchar("project_code").notNull(),
	taskName: varchar("task_name").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	phaseNumber: bigint("phase_number", { mode: "number" }),
	description: varchar(),
	priority: text(),
	status: text(),
	startDate: date("start_date"),
	endDate: date("end_date"),
	assignedToEmpCode: varchar("assigned_to_emp_code"),
}, (table) => [
	primaryKey({ columns: [table.projectCode, table.taskName], name: "Tasks_pkey"}),
]);
