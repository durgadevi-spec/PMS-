import {
  users,
  employees,
  projects,
  projectTasks,
  taskMembers,
  type User,
  type Employee,
  type Project,
  type ProjectTask,
  tags,
  taskTags,
  subtaskTags,
  type Tag
} from "../shared/schema.ts";
import { db } from "./db.ts";
import { eq, inArray, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: typeof users.$inferInsert): Promise<User>;
  getEmployee(id: string): Promise<Employee | undefined>;

  getProject(id: string): Promise<Project | undefined>;
  getTaskMembers(taskId: string): Promise<string[]>;
  getTask(taskId: string): Promise<ProjectTask | undefined>;
  getAdminEmails(): Promise<string[]>;

  // Tag methods
  getTags(): Promise<Tag[]>;
  createTag(name: string): Promise<Tag>;
  updateTag(id: string, name: string): Promise<Tag | undefined>;
  deleteTag(id: string): Promise<void>;
  getTagsForTask(taskId: string): Promise<Tag[]>;
  assignTagsToTask(taskId: string, tagIds: string[]): Promise<void>;
  removeTagFromTask(taskId: string, tagId: string): Promise<void>;
  bulkAssignTags(taskIds: string[], tagIds: string[], action: "add" | "remove"): Promise<void>;

  // Subtask tag methods (mirrors task tag methods above)
  getTagsForSubtask(subtaskId: string): Promise<Tag[]>;
  assignTagsToSubtask(subtaskId: string, tagIds: string[]): Promise<void>;
  removeTagFromSubtask(subtaskId: string, tagId: string): Promise<void>;
  bulkAssignSubtaskTags(subtaskIds: string[], tagIds: string[], action: "add" | "remove"): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: typeof users.$inferInsert): Promise<User> {
    const [user] = await db.insert(users).values({
      ...insertUser,
      id: randomUUID(),
    } as any).returning();
    return user;
  }

  async getEmployee(id: string): Promise<Employee | undefined> {
    const [employee] = await db.select().from(employees).where(eq(employees.id, id));
    return employee;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getTaskMembers(taskId: string): Promise<string[]> {
    const members = await db
      .select({ employeeId: taskMembers.employeeId })
      .from(taskMembers)
      .where(eq(taskMembers.taskId, taskId));
    return members.map((m) => m.employeeId);
  }

  async getTask(id: string): Promise<ProjectTask | undefined> {
    const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, id));
    return task;
  }

  async getAdminEmails(): Promise<string[]> {
    const admins = await db
      .select({ email: employees.email })
      .from(users)
      .innerJoin(employees, eq(users.employeeId, employees.id))
      .where(eq(users.role, "ADMIN"));

    return admins
      .map((a) => a.email)
      .filter((email): email is string => !!email);
  }

  // Tag methods
  async getTags(): Promise<Tag[]> {
    return await db.select().from(tags).orderBy(tags.name);
  }

  async createTag(name: string): Promise<Tag> {
    const trimmed = name.trim();
    // Try to find it first (case-insensitive-like if needed, but unique handles it)
    const [existing] = await db.select().from(tags).where(eq(tags.name, trimmed));
    if (existing) return existing;

    const [newTag] = await db.insert(tags).values({ name: trimmed }).returning();
    return newTag;
  }

  async updateTag(id: string, name: string): Promise<Tag | undefined> {
    const trimmed = name.trim();
    const [updated] = await db.update(tags).set({ name: trimmed }).where(eq(tags.id, id)).returning();
    return updated;
  }

  async deleteTag(id: string): Promise<void> {
    await db.delete(taskTags).where(eq(taskTags.tagId, id));
    await db.delete(subtaskTags).where(eq(subtaskTags.tagId, id));
    await db.delete(tags).where(eq(tags.id, id));
  }

  async getTagsForTask(taskId: string): Promise<Tag[]> {
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        createdAt: tags.createdAt
      })
      .from(taskTags)
      .innerJoin(tags, eq(taskTags.tagId, tags.id))
      .where(eq(taskTags.taskId, taskId));
    return rows;
  }

  async assignTagsToTask(taskId: string, tagIds: string[]): Promise<void> {
    if (!tagIds || tagIds.length === 0) return;

    // Filter out already assigned to avoid unique constraint errors if there were any, 
    // but we can just use ON CONFLICT DO NOTHING if we had a unique constraint on (taskId, tagId).
    // Instead we can just delete all and insert, or fetch existing and only insert new.
    // Given the simple schema, fetching existing is safe.
    const existing = await db.select({ tagId: taskTags.tagId }).from(taskTags).where(eq(taskTags.taskId, taskId));
    const existingIds = new Set(existing.map(e => e.tagId));

    const newTags = tagIds.filter(id => !existingIds.has(id)).map(id => ({ taskId, tagId: id }));
    if (newTags.length > 0) {
      await db.insert(taskTags).values(newTags);
    }
  }

  async removeTagFromTask(taskId: string, tagId: string): Promise<void> {
    await db.delete(taskTags).where(
      and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId))
    );
  }

  async bulkAssignTags(taskIds: string[], tagIds: string[], action: "add" | "remove"): Promise<void> {
    if (!taskIds.length || !tagIds.length) return;

    if (action === "add") {
      const existingRows = await db
        .select({ taskId: taskTags.taskId, tagId: taskTags.tagId })
        .from(taskTags)
        .where(inArray(taskTags.taskId, taskIds));

      const existingMap = new Map<string, Set<string>>();
      existingRows.forEach(row => {
        if (!existingMap.has(row.taskId)) existingMap.set(row.taskId, new Set());
        existingMap.get(row.taskId)!.add(row.tagId);
      });

      const toInsert: { taskId: string; tagId: string }[] = [];
      taskIds.forEach(taskId => {
        tagIds.forEach(tagId => {
          if (!existingMap.get(taskId)?.has(tagId)) {
            toInsert.push({ taskId, tagId });
          }
        });
      });

      if (toInsert.length > 0) {
        await db.insert(taskTags).values(toInsert);
      }
    } else {
      await db.delete(taskTags).where(
        and(
          inArray(taskTags.taskId, taskIds),
          inArray(taskTags.tagId, tagIds)
        )
      );
    }
  }

  // Subtask tag methods (mirror the task tag methods above, scoped to subtask_tags)
  async getTagsForSubtask(subtaskId: string): Promise<Tag[]> {
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        createdAt: tags.createdAt
      })
      .from(subtaskTags)
      .innerJoin(tags, eq(subtaskTags.tagId, tags.id))
      .where(eq(subtaskTags.subtaskId, subtaskId));
    return rows;
  }

  async assignTagsToSubtask(subtaskId: string, tagIds: string[]): Promise<void> {
    if (!tagIds || tagIds.length === 0) return;

    const existing = await db.select({ tagId: subtaskTags.tagId }).from(subtaskTags).where(eq(subtaskTags.subtaskId, subtaskId));
    const existingIds = new Set(existing.map(e => e.tagId));

    const newTags = tagIds.filter(id => !existingIds.has(id)).map(id => ({ subtaskId, tagId: id }));
    if (newTags.length > 0) {
      await db.insert(subtaskTags).values(newTags);
    }
  }

  async removeTagFromSubtask(subtaskId: string, tagId: string): Promise<void> {
    await db.delete(subtaskTags).where(
      and(eq(subtaskTags.subtaskId, subtaskId), eq(subtaskTags.tagId, tagId))
    );
  }

  async bulkAssignSubtaskTags(subtaskIds: string[], tagIds: string[], action: "add" | "remove"): Promise<void> {
    if (!subtaskIds.length || !tagIds.length) return;

    if (action === "add") {
      const existingRows = await db
        .select({ subtaskId: subtaskTags.subtaskId, tagId: subtaskTags.tagId })
        .from(subtaskTags)
        .where(inArray(subtaskTags.subtaskId, subtaskIds));

      const existingMap = new Map<string, Set<string>>();
      existingRows.forEach(row => {
        if (!existingMap.has(row.subtaskId)) existingMap.set(row.subtaskId, new Set());
        existingMap.get(row.subtaskId)!.add(row.tagId);
      });

      const toInsert: { subtaskId: string; tagId: string }[] = [];
      subtaskIds.forEach(subtaskId => {
        tagIds.forEach(tagId => {
          if (!existingMap.get(subtaskId)?.has(tagId)) {
            toInsert.push({ subtaskId, tagId });
          }
        });
      });

      if (toInsert.length > 0) {
        await db.insert(subtaskTags).values(toInsert);
      }
    } else {
      await db.delete(subtaskTags).where(
        and(
          inArray(subtaskTags.subtaskId, subtaskIds),
          inArray(subtaskTags.tagId, tagIds)
        )
      );
    }
  }
}

export const storage = new DatabaseStorage();