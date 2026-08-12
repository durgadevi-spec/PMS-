import { db } from "./db.ts";
import { projectTasks, taskMembers, employees, projects, users } from "../shared/schema.ts";
import { eq, and, sql, or, inArray } from "drizzle-orm";
import { sendTaskAssignmentEmail } from "./email.ts";

// Default reminder timings (can be moved to a config table later)
const REMINDER_HOURS = [9, 13, 17, 21]; // 9 AM, 1 PM, 5 PM, 9 PM

export async function processReminders() {
  const now = new Date();
  const currentHour = now.getHours();

  // Basic check: we only send reminders at these specific hours
  if (!REMINDER_HOURS.includes(currentHour)) {
    return;
  }

  console.log(`[REMINDERS] Checking for tasks to notify at ${currentHour}:00`);

  try {
    const todayStr = now.toISOString().split('T')[0];
    
    // OPTIMIZATION: Step 1 - Get all tasks that are not completed (1 query)
    const pendingTasks = await db.select({
      id: projectTasks.id,
      taskName: projectTasks.taskName,
      status: projectTasks.status,
      priority: projectTasks.priority,
      startDate: projectTasks.startDate,
      endDate: projectTasks.endDate,
      taskPeriod: projectTasks.taskPeriod,
      reminderFrequency: projectTasks.reminderFrequency,
      projectId: projectTasks.projectId,
      assignerId: projectTasks.assignerId,
      lastNotifiedAt: projectTasks.lastNotifiedAt,
      createdAt: projectTasks.createdAt,
    })
    .from(projectTasks)
    .where(
      and(
        sql`LOWER(${projectTasks.status}) != 'completed'`,
        or(
          sql`${projectTasks.lastNotifiedAt} IS NULL`,
          and(
            sql`DATE(${projectTasks.lastNotifiedAt}) < ${todayStr}::DATE`,
            sql`${currentHour} = ${currentHour}`
          ),
          and(
            sql`DATE(${projectTasks.lastNotifiedAt}) = ${todayStr}::DATE`,
            sql`EXTRACT(HOUR FROM ${projectTasks.lastNotifiedAt}) != ${currentHour}`
          )
        )
      )
    );

    console.log(`[REMINDERS] Found ${pendingTasks.length} pending tasks. Filtering by frequency...`);

    // OPTIMIZATION: Step 2 - Filter by frequency in JavaScript (no DB calls)
    const tasksToNotify = [];
    for (const task of pendingTasks) {
      const freq = (task.reminderFrequency || "1 time").toLowerCase();
      let shouldNotify = false;

      if (freq === "1 time" || freq === "daily") {
        shouldNotify = currentHour === 9;
      } else if (freq === "2 times") {
        shouldNotify = (currentHour === 9 || currentHour === 17);
      } else if (freq === "4 times") {
        shouldNotify = REMINDER_HOURS.includes(currentHour);
      } else if (freq === "weekly") {
        const createdDate = task.createdAt ? new Date(task.createdAt) : new Date();
        shouldNotify = (currentHour === 9 && now.getDay() === createdDate.getDay());
      } else if (freq === "monthly") {
        const createdDate = task.createdAt ? new Date(task.createdAt) : new Date();
        shouldNotify = (currentHour === 9 && now.getDate() === createdDate.getDate());
      } else {
        shouldNotify = REMINDER_HOURS.includes(currentHour);
      }

      if (shouldNotify) {
        tasksToNotify.push(task);
      }
    }

    if (tasksToNotify.length === 0) {
      console.log(`[REMINDERS] No tasks matched frequency filters for hour ${currentHour}`);
      return;
    }

    console.log(`[REMINDERS] ${tasksToNotify.length} tasks match frequency - proceeding with bulk fetch...`);

    // OPTIMIZATION: Step 3 - Bulk fetch all data needed (instead of per-task queries)
    const taskIds = tasksToNotify.map(t => t.id);
    const projectIds = tasksToNotify.map(t => t.projectId);
    const assignerIds = tasksToNotify.map(t => t.assignerId).filter((id): id is string => Boolean(id));

    // Fetch 1: All members for all tasks (1 query instead of N queries)
    const allMembers = await db.select({
      taskId: taskMembers.taskId,
      employeeId: taskMembers.employeeId,
      empId: employees.id,
      name: employees.name,
      email: employees.email,
      empCode: employees.empCode,
    })
    .from(taskMembers)
    .leftJoin(employees, eq(taskMembers.employeeId, employees.id))
    .where(inArray(taskMembers.taskId, taskIds));

    // Fetch 2: All projects (1 query instead of N queries)
    const allProjects = await db.select()
      .from(projects)
      .where(inArray(projects.id, projectIds));

    // Fetch 3: All assigners (1 query instead of N queries)
    const allAssigners = assignerIds.length > 0
      ? await db.select().from(employees).where(inArray(employees.id, assignerIds))
      : [];

    // Fetch 4: All users for members (1 query instead of M*N queries)
    const memberEmployeeIds = Array.from(
      new Set(allMembers.map(m => m.empId).filter((id): id is string => Boolean(id)))
    );
    
    const allUsers = memberEmployeeIds.length > 0
      ? await db.select().from(users).where(inArray(users.employeeId, memberEmployeeIds))
      : [];

    // OPTIMIZATION: Step 4 - Build lookup maps in JavaScript (zero DB calls)
    const projectMap = new Map(allProjects.map(p => [p.id, p]));
    const assignerMap = new Map(allAssigners.map(a => [a.id, a]));
    const userMap = new Map(allUsers.map(u => [u.employeeId, u]));
    const membersByTask = new Map<string, typeof allMembers>();
    
    for (const member of allMembers) {
      if (!membersByTask.has(member.taskId)) {
        membersByTask.set(member.taskId, []);
      }
      membersByTask.get(member.taskId)!.push(member);
    }

    // OPTIMIZATION: Step 5 - Send emails and collect updates (no DB calls yet)
    const tasksToUpdate: string[] = [];
    let emailsSent = 0;

    for (const task of tasksToNotify) {
      const members = membersByTask.get(task.id) || [];
      
      if (members.length === 0) {
        console.log(`[REMINDERS] No assignees for task: ${task.taskName}, skipping notification.`);
        continue;
      }

      const project = projectMap.get(task.projectId);
      const assigner = assignerMap.get(task.assignerId || '');
      const periodLabel = task.taskPeriod && task.taskPeriod !== "custom" ? task.taskPeriod : "Active";
      const freq = (task.reminderFrequency || "1 time").toLowerCase();

      for (const member of members) {
        if (member && member.email) {
          const userRow = userMap.get(member.empId as string);
          const role = userRow?.role?.toLowerCase() as 'employee' | 'hr' | 'admin' || 'employee';

          console.log(`[REMINDERS] Sending reminder (${freq}) to ${member.email} for task: ${task.taskName}`);

          await sendTaskAssignmentEmail(
            member.email,
            {
              name: member.name || 'Unknown',
              code: member.empCode || 'N/A',
              project: project?.title || 'Unknown Project',
              assigner: assigner?.name || 'System',
              dueDate: task.endDate || 'Not Set',
            },
            {
              name: `REMINDER: ${task.taskName} (${periodLabel})`,
              priority: task.priority || 'medium',
              startDate: task.startDate || 'N/A',
              endDate: task.endDate || 'N/A',
              status: task.status || 'pending',
            },
            role,
            `TASK REMINDER (${periodLabel}) - Frequency: ${task.reminderFrequency || 'Standard'}`
          );
          emailsSent++;
        }
      }

      tasksToUpdate.push(task.id);
    }

    // OPTIMIZATION: Step 6 - Batch update all lastNotifiedAt (1 query instead of N queries)
    if (tasksToUpdate.length > 0) {
      await db.update(projectTasks)
        .set({ lastNotifiedAt: new Date() })
        .where(inArray(projectTasks.id, tasksToUpdate));
      
      console.log(`[REMINDERS] Updated ${tasksToUpdate.length} tasks and sent ${emailsSent} emails`);
    }

    console.log(`[REMINDERS] Reminder processing complete: ${emailsSent} emails sent in ${tasksToNotify.length} tasks`);
  } catch (err) {
    console.error("[REMINDERS-ERROR] Failed to process reminders:", err);
  }
}

// Start the reminder check interval (every 30 minutes)
export function startReminderService() {
  console.log("[REMINDERS] Starting reminder service...");
  // Run once immediately on start
  processReminders();
  
  // Check every 30 minutes
  setInterval(processReminders, 30 * 60 * 1000);
}
