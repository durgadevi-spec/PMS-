import express, { type Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { eq, inArray, or, desc, aliasedTable, isNull, isNotNull, ne, notInArray } from "drizzle-orm";
import { and, sql } from "drizzle-orm";

import { db, pool } from "./db.ts";
import { getProjectTimeEntries, getTimestrapTableInfo, getTaskTimeEntries } from "./timestrap-db.ts";
import { DataValidator } from "../shared/dataValidator.ts";
import { storage as storageHelper } from "./storage.ts";
import {
  getGoogleAuthUrl,
  handleGoogleCallback,
  isGoogleConnected,
  disconnectGoogle,
  pushEventToGoogle,
  deleteEventFromGoogle,
  syncFromGoogle,
  syncToGoogle,
} from "./googleCalendar.ts";
import {
  sendTaskAssignmentEmail,
  sendSubtaskAssignmentEmail,
  sendProjectCompletionEmail,
  sendSiteReportEmail,
  sendTicketNotificationEmail,
  sendCalendarInviteEmail,
  sendCalendarRsvpNotification,
  formatEventWhen
} from "./email.ts";
import { verifyRsvpToken } from "./calendarRsvp.ts";
import fs from "fs";
import path from "path";
import {
  users,
  sessions,
  employees,
  departments,
  projects,
  projectFiles,
  projectDepartments,
  projectTeamMembers,
  projectVendors,
  keySteps,
  projectTasks,
  taskMembers,
  subtasks,
  subtaskMembers,
  progressLogs,
  discussions,
  discussionReplies,
  discussionParticipants,
  discussionAttachments,
  siteReports,
  siteReportAttachments,
  emailGroups,
  tickets,
  ticketComments,
  ticketAttachments,
  keyStepTemplates,
  keyStepTemplateItems,
  taskComments,
  taskCcMembers,
  delayReasons,
  tags,
  taskTags,
  subtaskTags,
  calendarEvents,
  taskDependencies,
  taskScheduleHistory,
} from "../shared/schema.ts";
import * as dependencyService from "./dependencyService.ts";


/* ===============================
   FILE UPLOAD CONFIG
================================ */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

/* ===============================
   DEBUG LOGGING UTILITY
================================ */
// OPTIMIZATION: Wrap all non-error console.log in DEBUG flag
// Usage: debug("[TAG] Message") - only logs if DEBUG env var is set
// Benefit: ~50-100ms reduction in production by skipping verbose logging
const debug = (message: string, data?: any) => {
  if (process.env.DEBUG === 'true' || process.env.DEBUG === '1') {
    if (data) console.log(message, data);
    else console.log(message);
  }
};

/* ===============================
   REQUEST DEBOUNCING
================================ */
// OPTIMIZATION: Debounce filter-settings PATCH to prevent excessive updates
// Map to track pending debounced requests: userId -> { timeout, body }
const pendingUpdates = new Map<string, { timeout: NodeJS.Timeout; body: any }>();

const debounceFilterSettings = (userId: string, body: any, callback: () => Promise<void>, delayMs: number = 1500) => {
  // Clear existing timeout for this user
  if (pendingUpdates.has(userId)) {
    clearTimeout(pendingUpdates.get(userId)!.timeout);
  }

  // Set new timeout to execute callback after delay
  const timeout = setTimeout(async () => {
    try {
      await callback();
      pendingUpdates.delete(userId);
      debug("[DEBOUNCE] Filter settings saved for user:", userId);
    } catch (err) {
      console.error("[DEBOUNCE] Failed to save filter settings:", err);
    }
  }, delayMs);

  pendingUpdates.set(userId, { timeout, body });
  debug("[DEBOUNCE] Queued filter settings update for user (${delayMs}ms delay):", userId);
};

/* ===============================
   REGISTER ROUTES
================================ */
const creator = aliasedTable(employees, "creator");
const assignee = aliasedTable(employees, "assignee");

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {

  // ========================================
  // AUTH TOKEN CACHE (60-second TTL)
  // ========================================
  const tokenCache = new Map<string, { data: any; expiresAt: number }>();

  function clearExpiredTokens() {
    const now = Date.now();
    for (const [token, entry] of Array.from(tokenCache.entries())) {
      if (entry.expiresAt < now) {
        tokenCache.delete(token);
      }
    }
  }

  function getCachedToken(token: string) {
    clearExpiredTokens();
    const entry = tokenCache.get(token);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      tokenCache.delete(token);
      return null;
    }
    return entry.data;
  }

  function setCachedToken(token: string, data: any) {
    const expiresAt = Date.now() + 60_000; // 60 seconds
    tokenCache.set(token, { data, expiresAt });
  }

  function clearTokenCache(token?: string) {
    if (token) {
      tokenCache.delete(token);
    } else {
      tokenCache.clear();
    }
  }

  // Serve uploads statically
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  /* ===============================
     TICKETS (Prioritized)
  ================================ */

  // Helper to generate ticket code
  async function generateTicketCode() {
    debug("[TICKETS-TRACE] Generating ticket code...");
    try {
      const lastTicket = await db.select({ ticketCode: tickets.ticketCode })
        .from(tickets)
        .where(sql`ticket_code LIKE 'TKT-%'`)
        .orderBy(desc(tickets.createdAt))
        .limit(1);

      if (lastTicket.length === 0) return "TKT-001";

      const lastCode = lastTicket[0].ticketCode;
      const parts = lastCode.split("-");

      // Look for the last part that is a number
      let lastNum = 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const val = parseInt(parts[i]);
        if (!isNaN(val)) {
          lastNum = val;
          break;
        }
      }

      const nextNum = lastNum + 1;
      return `TKT-${nextNum.toString().padStart(3, "0")}`;
    } catch (err) {
      console.error("[TICKETS-ERROR] Code generation failed:", err);
      // Fallback to a timestamp-based ID if DB query fails
      return `TKT-ALT-${Date.now().toString().slice(-6)}`;
    }
  }

  app.get("/api/tickets", requireAuth, async (req: any, res) => {
    debug("[TICKETS-TRACE] GET /api/tickets request received");
    try {
      const { status, priority, category } = req.query;
      const isAdmin = req.user?.role === "ADMIN";
      const empId = req.employee?.id;

      let conditions = [];
      if (!isAdmin) {
        conditions.push(or(
          eq(tickets.createdBy, empId),
          eq(tickets.assignedTo, empId),
          sql`${tickets.participants}::jsonb @> ${JSON.stringify([empId])}::jsonb`
        ));
      }
      if (status) conditions.push(eq(tickets.status, status as string));
      if (priority) conditions.push(eq(tickets.priority, priority as string));
      if (category) conditions.push(eq(tickets.category, category as string));

      const rows = await db
        .select({
          id: tickets.id,
          ticketCode: tickets.ticketCode,
          title: tickets.title,
          category: tickets.category,
          priority: tickets.priority,
          status: tickets.status,
          department: tickets.department,
          projectId: tickets.projectId,
          companyName: tickets.companyName,
          participants: tickets.participants,
          completedLines: tickets.completedLines,
          createdBy: tickets.createdBy,
          createdByName: creator.name,
          assignedTo: tickets.assignedTo,
          assignedToName: assignee.name,
          description: tickets.description,
          createdAt: tickets.createdAt,
          updatedAt: tickets.updatedAt,
          taskId: tickets.taskId,
          closeReason: tickets.closeReason,
          closeRequestedBy: tickets.closeRequestedBy,
        })
        .from(tickets)
        .leftJoin(creator, eq(tickets.createdBy, creator.id))
        .leftJoin(assignee, eq(tickets.assignedTo, assignee.id))
        .where(conditions.length > 0 ? and(...conditions) : sql`TRUE`)
        .orderBy(desc(tickets.createdAt));

      res.json(rows);
    } catch (err) {
      console.error("[TICKETS-ERROR] Fetch tickets failed:", err);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  app.post("/api/tickets", requireAuth, async (req: any, res) => {
    debug("[TICKETS-TRACE] POST /api/tickets request received:", JSON.stringify(req.body, null, 2));
    try {
      const {
        title,
        description,
        category,
        priority,
        department,
        projectId,
        manualProject,
        attachments,
        companyName,
        participants,
        assignedTo,
        completedLines
      } = req.body;
      const empId = req.employee?.id;
      if (!empId) {
        console.warn("[TICKETS-WARN] No employee ID found for user:", req.user?.id);
        return res.status(403).json({ error: "Employee profile required" });
      }

      debug("[TICKETS-TRACE] Generating ticket code...");
      const ticketCode = await generateTicketCode();
      debug("[TICKETS-TRACE] Generated code:", ticketCode);

      const insertData = {
        ticketCode,
        title,
        description,
        category,
        priority: priority || "Medium",
        department: department || "General",
        projectId: (projectId && projectId !== "none") ? projectId : null,
        manualProject: manualProject || null,
        companyName: companyName || null,
        participants: participants || [],
        assignedTo: assignedTo || null,
        completedLines: Array.isArray(completedLines) ? completedLines : [],
        createdBy: empId,
        status: "Open"
      };

      debug("[TICKETS-TRACE] Attempting database insert:", JSON.stringify(insertData, null, 2));
      const [ticket] = await db.insert(tickets).values(insertData).returning();

      if (!ticket) {
        console.error("[TICKETS-ERROR] Database insert returned no result");
        throw new Error("Database insert failed to return the new ticket");
      }

      debug("[TICKETS-TRACE] Ticket created successfully:", ticket.id);

      if (attachments && Array.isArray(attachments)) {
        debug(`[TICKETS-TRACE] Processing ${attachments.length} attachments`);
        const attachmentData = attachments.map((att: any) => ({
          ticketId: ticket.id,
          fileName: att.fileName,
          fileSize: Number(att.fileSize),
          mimeType: att.mimeType,
          storageUrl: att.storageUrl
        }));
        if (attachmentData.length > 0) {
          await db.insert(ticketAttachments).values(attachmentData);
          debug("[TICKETS-TRACE] Attachments inserted successfully");
        }
      }

      res.status(201).json(ticket);

      // --- SEND EMAIL NOTIFICATION (ASYNC) ---
      (async () => {
        console.log(`[TICKETS-MAIL-TRACE] Starting background email notification for ticket ${ticket.id}`);
        try {
          const detail = await db.select({
            ticketCode: tickets.ticketCode,
            title: tickets.title,
            category: tickets.category,
            priority: tickets.priority,
            status: tickets.status,
            department: tickets.department,
            projectName: projects.title,
            manualProject: tickets.manualProject,
            description: tickets.description,
            createdByName: creator.name,
            assignedToId: tickets.assignedTo,
            assignedToName: assignee.name,
            assignedToEmail: assignee.email,
            participants: tickets.participants,
          })
            .from(tickets)
            .leftJoin(projects, eq(tickets.projectId, projects.id))
            .leftJoin(creator, eq(tickets.createdBy, creator.id))
            .leftJoin(assignee, eq(tickets.assignedTo, assignee.id))
            .where(eq(tickets.id, ticket.id))
            .limit(1);

          if (detail.length > 0) {
            const data = detail[0];
            const recipientSet = new Set<string>();

            // 1. Department Users
            if (data.department) {
              const normalizedDept = data.department.trim().toLowerCase();
              const deptEmployees = await db
                .select({ email: employees.email })
                .from(employees)
                .where(sql`LOWER(TRIM(${employees.department})) = ${normalizedDept}`);

              if (deptEmployees.length === 0) {
                console.warn(`[TICKETS-MAIL-WARN] No users found for department: ${data.department}`);
              } else {
                deptEmployees.forEach(emp => {
                  if (emp.email) recipientSet.add(emp.email.trim().toLowerCase());
                });
              }
            }

            // 2. Assignee
            if (data.assignedToEmail) {
              recipientSet.add(data.assignedToEmail.trim().toLowerCase());
            }

            let ccNames = "";
            if (Array.isArray(data.participants) && data.participants.length > 0) {
              const participantEmployees = await db
                .select({ name: employees.name, email: employees.email })
                .from(employees)
                .where(inArray(employees.id, data.participants.map(String)));

              const ccNameList: string[] = [];
              participantEmployees.forEach(emp => {
                if (emp.email) {
                  recipientSet.add(emp.email.trim().toLowerCase());
                  if (emp.name) ccNameList.push(emp.name);
                }
              });
              ccNames = ccNameList.join(", ");
            }

            const recipients = Array.from(recipientSet).filter(Boolean);
            console.log(`[TICKETS-MAIL-TRACE] Final Recipient List for ${data.ticketCode}:`, recipients);

            await sendTicketNotificationEmail(recipients, {
              ...data,
              projectName: data.projectName || data.manualProject || "N/A",
              createdByName: data.createdByName || "Unknown",
              assignedToName: data.assignedToName || undefined,
              ccNames: ccNames || undefined
            }, 'created');
            console.log("[TICKETS-MAIL-TRACE] Email process completed");
          } else {
            console.warn(`[TICKETS-MAIL-WARN] No ticket details found for email notification: ${ticket.id}`);
          }
        } catch (mailErr) {
          console.error("[TICKETS-MAIL-ERROR] Creation notification failed:", mailErr);
        }
      })();
    } catch (err: any) {
      console.error("[TICKETS-ERROR] Create ticket failed. Stack trace:", err.stack);
      res.status(500).json({ error: "Failed to create ticket: " + err.message, stack: err.stack });
    }
  });



  // DELETE TICKET
  app.delete("/api/tickets/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Delete child data
      await db.delete(ticketComments).where(eq(ticketComments.ticketId, id));
      await db.delete(ticketAttachments).where(eq(ticketAttachments.ticketId, id));

      const [deleted] = await db.delete(tickets).where(eq(tickets.id, id)).returning();
      if (!deleted) return res.status(404).json({ error: "Ticket not found" });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Delete failed" });
    }
  });


  // GET MY TICKETS
  app.get("/api/tickets/my", requireAuth, async (req: any, res) => {
    try {
      const empId = req.employee?.id;
      if (!empId) return res.status(401).json({ error: "Employee info missing" });

      const creator = aliasedTable(employees, "creator");
      const assignee = aliasedTable(employees, "assignee");

      const myTickets = await db
        .select({
          id: tickets.id,
          ticketCode: tickets.ticketCode,
          title: tickets.title,
          category: tickets.category,
          priority: tickets.priority,
          status: tickets.status,
          department: tickets.department,
          projectId: tickets.projectId,
          projectName: projects.title,
          companyName: tickets.companyName,
          participants: tickets.participants,
          createdBy: tickets.createdBy,
          createdByName: creator.name,
          assignedTo: tickets.assignedTo,
          assignedToName: assignee.name,
          createdAt: tickets.createdAt,
          updatedAt: tickets.updatedAt,
          taskId: tickets.taskId,
          closeReason: tickets.closeReason,
          closeRequestedBy: tickets.closeRequestedBy,
        })
        .from(tickets)
        .leftJoin(projects, eq(tickets.projectId, projects.id))
        .leftJoin(creator, eq(tickets.createdBy, creator.id))
        .leftJoin(assignee, eq(tickets.assignedTo, assignee.id))
        .where(eq(tickets.createdBy, empId))
        .orderBy(desc(tickets.createdAt));

      res.json(myTickets);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch my tickets" });
    }
  });

  app.get("/api/tickets/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const creator = aliasedTable(employees, "creator");
      const assignee = aliasedTable(employees, "assignee");

      const [ticket] = await db
        .select({
          id: tickets.id,
          ticketCode: tickets.ticketCode,
          title: tickets.title,
          description: tickets.description,
          category: tickets.category,
          priority: tickets.priority,
          status: tickets.status,
          department: tickets.department,
          projectId: tickets.projectId,
          projectName: projects.title,
          companyName: tickets.companyName,
          participants: tickets.participants,
          completedLines: tickets.completedLines,
          createdBy: tickets.createdBy,
          createdByName: creator.name,
          assignedTo: tickets.assignedTo,
          assignedToName: assignee.name,
          createdAt: tickets.createdAt,
          updatedAt: tickets.updatedAt,
          taskId: tickets.taskId,
          closeReason: tickets.closeReason,
          closeRequestedBy: tickets.closeRequestedBy,
        })
        .from(tickets)
        .leftJoin(projects, eq(tickets.projectId, projects.id))
        .leftJoin(creator, eq(tickets.createdBy, creator.id))
        .leftJoin(assignee, eq(tickets.assignedTo, assignee.id))
        .where(eq(tickets.id, id))
        .limit(1);

      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const comments = await db
        .select({
          id: ticketComments.id,
          content: ticketComments.content,
          createdAt: ticketComments.createdAt,
          createdBy: ticketComments.createdBy,
          createdByName: employees.name,
        })
        .from(ticketComments)
        .leftJoin(employees, eq(ticketComments.createdBy, employees.id))
        .where(eq(ticketComments.ticketId, id))
        .orderBy(ticketComments.createdAt);

      const attachments = await db
        .select()
        .from(ticketAttachments)
        .where(eq(ticketAttachments.ticketId, id));

      res.json({ ...ticket, comments, attachments });
    } catch (err: any) {
      console.error("[TICKETS-ERROR] Get ticket details failed:", err);
      res.status(500).json({ error: "Failed to get ticket details" });
    }
  });

  app.post("/api/tickets/:id/comments", requireAuth, async (req: any, res) => {
    try {
      const { content } = req.body;
      const empId = req.employee?.id;
      if (!empId) return res.status(403).json({ error: "Employee profile required" });

      const [comment] = await db.insert(ticketComments).values({
        ticketId: req.params.id,
        content,
        createdBy: empId,
      }).returning();

      await db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, req.params.id));
      res.status(201).json(comment);
    } catch (err) {
      console.error("[TICKETS-ERROR] Add ticket comment failed:", err);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  app.patch("/api/tickets/:id", requireAuth, async (req: any, res) => {
    try {
      const {
        status,
        priority,
        assignedTo,
        title,
        description,
        category,
        department,
        companyName,
        participants,
        completedLines
      } = req.body;
      const isAdmin = req.user?.role === "ADMIN";

      const [currentTicket] = await db.select().from(tickets).where(eq(tickets.id, req.params.id)).limit(1);
      if (!currentTicket) return res.status(404).json({ error: "Ticket not found" });

      // Check permissions: admin OR creator OR assigned to user OR participant OR requesting closure
      const isCreator = currentTicket.createdBy && req.employee?.id && String(currentTicket.createdBy) === String(req.employee.id);
      const isAssignedToUser = currentTicket.assignedTo && req.employee?.id && String(currentTicket.assignedTo) === String(req.employee.id);
      const isParticipant = currentTicket.participants && Array.isArray(currentTicket.participants) && req.employee?.id && currentTicket.participants.includes(String(req.employee.id));
      const isRequestingClosure = status === "Pending Closure";

      if (!isAdmin && !isCreator && !isAssignedToUser && !isParticipant && !isRequestingClosure) {
        console.warn(`[TICKET-PERMISSION] Denied update for ticket ${req.params.id}: isAdmin=${isAdmin}, isCreator=${isCreator}, isAssignedToUser=${isAssignedToUser}, isParticipant=${isParticipant}, employeeId=${req.employee?.id}, createdBy=${currentTicket.createdBy}, assignedTo=${currentTicket.assignedTo}`);
        return res.status(403).json({ error: "Permission denied" });
      }

      // Block non-admins from directly setting Closed/Resolved
      if (!isAdmin && !isCreator && !isAssignedToUser && !isParticipant && (status === "Closed" || status === "Resolved")) {
        return res.status(403).json({ error: "Only admin can directly close a ticket" });
      }

      const updateData: any = { updatedAt: new Date() };
      if (status !== undefined) updateData.status = status;
      if (priority !== undefined) updateData.priority = priority;
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (category !== undefined) updateData.category = category;
      if (department !== undefined) updateData.department = department;
      if (companyName !== undefined) updateData.companyName = companyName;
      if (participants !== undefined) updateData.participants = participants;
      if (completedLines !== undefined) updateData.completedLines = completedLines;
      if (req.body.taskId !== undefined) updateData.taskId = req.body.taskId;
      if (req.body.projectId !== undefined) updateData.projectId = req.body.projectId;

      // Save close reason and requester when status is Pending Closure
      if (status === "Pending Closure") {
        updateData.closeReason = req.body.closeReason || null;
        updateData.closeRequestedBy = req.employee?.id || null;
      }

      if (status === "Resolved" || status === "Closed") {
        updateData.resolvedAt = new Date();
      }

      const [updatedTicket] = await db
        .update(tickets)
        .set(updateData)
        .where(eq(tickets.id, req.params.id))
        .returning();

      res.json(updatedTicket);

      // ASYNC EMAIL NOTIFICATION
      try {
        const ticketDetail = await db.select({
          ticketCode: tickets.ticketCode,
          title: tickets.title,
          category: tickets.category,
          priority: tickets.priority,
          status: tickets.status,
          department: tickets.department,
          projectName: projects.title,
          manualProject: tickets.manualProject,
          description: tickets.description,
          createdByName: creator.name,
          assignedToId: tickets.assignedTo,
          assignedToName: assignee.name,
          assignedToEmail: assignee.email,
          participants: tickets.participants,
        })
          .from(tickets)
          .leftJoin(projects, eq(tickets.projectId, projects.id))
          .leftJoin(creator, eq(tickets.createdBy, creator.id))
          .leftJoin(assignee, eq(tickets.assignedTo, assignee.id))
          .where(eq(tickets.id, updatedTicket.id))
          .limit(1);

        if (ticketDetail.length > 0) {
          const t = ticketDetail[0];
          const isDone = t.status === "Resolved" || t.status === "Closed";
          const recipientSet = new Set<string>();

          // 1. Department Users
          if (t.department) {
            const normalizedDept = t.department.trim().toLowerCase();
            const deptEmployees = await db
              .select({ email: employees.email })
              .from(employees)
              .where(sql`LOWER(TRIM(${employees.department})) = ${normalizedDept}`);

            if (deptEmployees.length === 0) {
              console.warn(`[TICKETS-UPDATE-MAIL-WARN] No users found for department: ${t.department}`);
            } else {
              deptEmployees.forEach(emp => {
                if (emp.email) recipientSet.add(emp.email.trim().toLowerCase());
              });
            }
          }

          // 2. Assignee
          if (t.assignedToEmail) {
            recipientSet.add(t.assignedToEmail.trim().toLowerCase());
          }

          let ccNames = "";
          if (Array.isArray(t.participants) && t.participants.length > 0) {
            const participantEmployees = await db
              .select({ name: employees.name, email: employees.email })
              .from(employees)
              .where(inArray(employees.id, t.participants.map(String)));

            const ccNameList: string[] = [];
            participantEmployees.forEach(emp => {
              if (emp.email) {
                recipientSet.add(emp.email.trim().toLowerCase());
                if (emp.name) ccNameList.push(emp.name);
              }
            });
            ccNames = ccNameList.join(", ");
          }

          // 3. Admins — always notified when a ticket is submitted for closure
          // (Pending Closure) or actually Closed, so an admin never misses one.
          if (t.status === "Pending Closure" || t.status === "Closed") {
            const adminEmployees = await db
              .select({ email: employees.email })
              .from(users)
              .innerJoin(employees, eq(users.employeeId, employees.id))
              .where(eq(users.role, "ADMIN"));

            if (adminEmployees.length === 0) {
              console.warn(`[TICKETS-UPDATE-MAIL-WARN] No admin users found to notify for ${t.ticketCode}`);
            } else {
              adminEmployees.forEach(admin => {
                if (admin.email) recipientSet.add(admin.email.trim().toLowerCase());
              });
            }
          }

          const recipients = Array.from(recipientSet).filter(Boolean);
          console.log(`[TICKETS-UPDATE-MAIL-TRACE] Final Recipient List for ${t.ticketCode}:`, recipients);

          sendTicketNotificationEmail(recipients, {
            ...t,
            projectName: t.projectName || t.manualProject || "N/A",
            createdByName: t.createdByName || "Unknown",
            assignedToName: t.assignedToName || undefined,
            ccNames: ccNames || undefined
          }, isDone ? 'completed' : 'updated').catch(e => console.error(e));
        }
      } catch (logErr) {
        console.error("[TICKETS-LOG-ERROR] Mail prep failed:", logErr);
      }
    } catch (err) {
      console.error("[TICKETS-ERROR] Update ticket failed:", err);
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });
  app.delete("/api/tickets/:id", requireAuth, async (req: any, res) => {
    try {
      const isAdmin = req.user?.role === "ADMIN";
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, req.params.id)).limit(1);

      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      if (!isAdmin && ticket.createdBy !== req.employee?.id) {
        return res.status(403).json({ error: "Permission denied" });
      }

      await db.delete(tickets).where(eq(tickets.id, req.params.id));
      res.json({ message: "Ticket deleted successfully" });
    } catch (err) {
      console.error("[TICKETS-ERROR] Delete ticket failed:", err);
      res.status(500).json({ error: "Failed to delete ticket" });
    }
  });

  app.get("/api/tickets/export", requireAuth, async (_req: any, res) => {
    try {
      const rows = await db
        .select({
          ticketCode: tickets.ticketCode,
          title: tickets.title,
          category: tickets.category,
          priority: tickets.priority,
          status: tickets.status,
          department: tickets.department,
          createdByName: employees.name,
          createdAt: tickets.createdAt,
        })
        .from(tickets)
        .leftJoin(employees, eq(tickets.createdBy, employees.id))
        .orderBy(desc(tickets.createdAt));

      let csv = "Ticket ID,Title,Category,Priority,Status,Department,Created By,Created Date\n";
      rows.forEach(r => {
        csv += `"${r.ticketCode}","${r.title}","${r.category}","${r.priority}","${r.status}","${r.department}","${r.createdByName}","${r.createdAt?.toISOString()}"\n`;
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=tickets.csv");
      res.status(200).send(csv);
    } catch (err) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  /* ===============================
     SITE ENGINEER REPORTS
  ================================ */

  // GET all site reports
  app.get("/api/site-reports", requireAuth, async (req: any, res) => {
    try {
      const { projectId } = req.query;

      const rows = await db
        .select({
          id: siteReports.id,
          notes: siteReports.notes,
          clientEmail: siteReports.clientEmail,
          createdAt: siteReports.createdAt,
          projectId: siteReports.projectId,
          projectName: projects.title,
          engineerName: employees.name,
          taskId: siteReports.taskId,
          taskName: projectTasks.taskName,
          subtaskId: siteReports.subtaskId,
          subtaskName: subtasks.title,
        })
        .from(siteReports)
        .leftJoin(projects, eq(siteReports.projectId, projects.id))
        .leftJoin(employees, eq(siteReports.createdBy, employees.id))
        .leftJoin(projectTasks, eq(siteReports.taskId, projectTasks.id))
        .leftJoin(subtasks, eq(siteReports.subtaskId, subtasks.id))
        .where(projectId ? eq(siteReports.projectId, projectId as string) : sql`TRUE`)
        .orderBy(desc(siteReports.createdAt))
        .limit(50);

      // Fetch attachments for each report
      const reportsWithAttachments = await Promise.all(
        rows.map(async (report) => {
          const attachments = await db
            .select()
            .from(siteReportAttachments)
            .where(eq(siteReportAttachments.reportId, report.id));
          return { ...report, attachments };
        })
      );

      res.json(reportsWithAttachments);
    } catch (err) {
      console.error("Fetch site reports failed:", err);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  // POST upload files for site report
  app.post("/api/site-reports/upload", requireAuth, upload.array("files"), async (req: any, res) => {
    try {
      const files = (req.files as any[]) || [];
      const uploadedFiles = files.map(file => ({
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageUrl: `/uploads/${file.filename}`,
        serverPath: file.path
      }));

      res.json(uploadedFiles);
    } catch (err) {
      console.error("Site report upload failed:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // POST create site report and send email
  app.post("/api/site-reports", requireAuth, async (req: any, res) => {
    try {
      const {
        projectId,
        taskId,
        subtaskId,
        notes,
        clientEmail,
        attachments,
        sendEmail
      } = req.body;

      const empId = req.employee?.id;
      if (!empId) return res.status(403).json({ error: "Employee profile required" });

      // 1. Save report to DB
      const [report] = await db.insert(siteReports).values({
        projectId,
        taskId: taskId || null,
        subtaskId: subtaskId || null,
        notes,
        createdBy: empId,
        clientEmail: clientEmail || null
      }).returning();

      // 2. Save attachments
      if (attachments && Array.isArray(attachments)) {
        const attachmentData = attachments.map(att => ({
          reportId: report.id,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          storageUrl: att.storageUrl
        }));
        if (attachmentData.length > 0) {
          await db.insert(siteReportAttachments).values(attachmentData);
        }
      }

      // 3. Send Email if requested
      if (sendEmail && clientEmail) {
        // Fetch names for email
        const project = await storageHelper.getProject(projectId);
        const task = taskId ? (await db.select().from(projectTasks).where(eq(projectTasks.id, taskId)))[0] : null;
        const subtask = subtaskId ? (await db.select().from(subtasks).where(eq(subtasks.id, subtaskId)))[0] : null;
        const engineer = req.employee;

        // Prepare attachments for Resend
        const emailAttachments = attachments?.map((att: any) => {
          // Extract filename from URL/path
          const fileNameOnDisk = path.basename(att.storageUrl);
          const filePath = path.join(process.cwd(), "uploads", fileNameOnDisk);

          if (fs.existsSync(filePath)) {
            return {
              filename: att.fileName,
              content: fs.readFileSync(filePath)
            };
          }
          return null;
        }).filter(Boolean) || [];

        await sendSiteReportEmail(
          clientEmail,
          {
            projectName: project?.title || "N/A",
            taskName: task?.taskName || "N/A",
            subtaskName: subtask?.title || "N/A",
            notes: notes || "",
            engineerName: engineer?.name || "Site Engineer"
          },
          emailAttachments as any
        );
      }

      res.status(201).json(report);
    } catch (err) {
      console.error("Create site report failed:", err);
      res.status(500).json({ error: "Failed to create site report" });
    }
  });


  // Helper: normalize department strings for robust matching
  function normalizeDept(input?: string | null) {
    if (!input) return "";
    // Trim, collapse multi-spaces, lowercase
    let v = String(input).trim().toLowerCase().replace(/\s+/g, " ");

    // EXCEPTION: Don't normalize 'presales' to 'presale'
    if (v === 'presales') return v;

    // Basic plural normalization: turn trailing 's' into singular (operations -> operation)
    if (v.length > 3 && v.endsWith("s")) v = v.slice(0, -1);
    return v;
  }

  // Helper: find session by token and attach user info
  async function getUserFromToken(token?: string | null) {
    if (!token) return null;

    // CHECK CACHE FIRST (eliminates 3 DB queries if hit)
    const cached = getCachedToken(token);
    if (cached) {
      debug("[AUTH-CACHE] Token found in cache (TTL: 60s)");
      return cached;
    }

    // Cache miss: query database
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token));
    if (!rows || rows.length === 0) return null;
    const sess = rows[0] as any;
    // Lookup employee (if linked) and user using raw SQL to avoid schema mismatch
    let user = null;
    let employee = null;

    if (sess.userId) {
      const [u] = await db.select().from(users).where(eq(users.id, sess.userId)).limit(1);
      if (u) user = u;
    }

    if (sess.employeeId) {
      const empRows = await pool.query('SELECT id, emp_code as "empCode", name, designation, department, email, phone FROM employees WHERE id = $1 LIMIT 1', [sess.employeeId]);
      if (empRows.rows.length > 0) employee = empRows.rows[0];
    }

    const result = { session: sess, user, employee };

    // CACHE THE RESULT (60-second TTL)
    setCachedToken(token, result);
    debug("[AUTH-CACHE] Token cached for 60 seconds");

    return result;
  }

  // Middleware to require authentication. Expects Authorization: Bearer <token>
  async function requireAuth(req: any, res: any, next: any) {
    try {
      const auth = req.headers.authorization || "";
      const parts = auth.split(" ");
      // Fallback to ?token= for routes hit via full-page browser navigation
      // (e.g. the Google OAuth connect link), which can't set an Authorization header.
      const token =
        (parts.length === 2 && parts[0] === "Bearer" ? parts[1] : null) ||
        (typeof req.query?.token === "string" ? req.query.token : null);
      const info = await getUserFromToken(token);
      if (!info) return res.status(401).json({ error: "Unauthorized" });
      req.user = info.user || null;
      req.employee = info.employee || null;
      req.session = info.session || null;
      debug("[AUTH] User info attached to request:", {
        userId: req.user?.id,
        username: req.user?.username,
        role: req.user?.role,
        employeeId: req.employee?.id,
      });
      next();
    } catch (err) {
      console.error("Auth middleware error:", err);
      res.status(500).json({ error: "Auth failed" });
    }
  }

  // Save filter settings for the logged-in user
  app.patch("/api/users/filter-settings", requireAuth, async (req: any, res) => {
    try {
      const { settings } = req.body;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      if (settings === undefined) return res.json({ success: true, message: "No settings provided" });

      // Write straight to the DB. This used to be debounced in-memory (1.5s delay),
      // but any pending debounce timer was silently lost whenever the server
      // restarted/redeployed within that window, which meant column/sort
      // preferences would randomly fail to persist. Writing immediately
      // guarantees the choice is saved the moment the user makes it.
      await db.update(users).set({ filterSettings: settings }).where(eq(users.id, userId));

      // Keep the in-memory auth/token cache in sync so a subsequent /api/me call
      // (e.g. right after a page refresh) reflects the settings we just saved,
      // rather than a stale cached copy of the user row.
      for (const [token, entry] of Array.from(tokenCache.entries())) {
        if (entry.data?.user?.id === userId) {
          entry.data = { ...entry.data, user: { ...entry.data.user, filterSettings: settings } };
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Failed to save filter settings:", err);
      res.status(500).json({ error: "Failed to save filter settings" });
    }
  });

  /* ===============================
      EMAIL GROUPS
  ================================ */
  app.get("/api/email-groups", requireAuth, async (req: any, res) => {
    try {
      if (!req.employee?.id) return res.status(403).json({ error: "Employee profile required" });
      const rows = await db
        .select()
        .from(emailGroups)
        .where(eq(emailGroups.createdBy, req.employee.id))
        .orderBy(desc(emailGroups.createdAt));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch email groups" });
    }
  });

  app.post("/api/email-groups", requireAuth, async (req: any, res) => {
    try {
      const { name, emails } = req.body;
      if (!name || !emails) return res.status(400).json({ error: "Name and emails are required" });
      if (!req.employee?.id) return res.status(403).json({ error: "Employee profile required" });

      const [group] = await db.insert(emailGroups).values({
        name,
        emails, // emails is a string (comma separated)
        createdBy: req.employee.id
      }).returning();
      res.status(201).json(group);
    } catch (err) {
      console.error("Create email group failure:", err);
      res.status(500).json({ error: "Failed to create email group" });
    }
  });

  app.delete("/api/email-groups/:id", requireAuth, async (req, res) => {
    try {
      await db.delete(emailGroups).where(eq(emailGroups.id, req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete email group" });
    }
  });

  /* ===============================
     PERCENTAGE CALCULATION HELPER
  ================================ */
  async function updateParentProgress(type: 'subtask' | 'task' | 'keystep', id: string, userId?: string) {
    debug(`[PROGRESS] Updating parent progress for ${type} ${id}`);
    try {
      if (type === 'subtask') {
        const [subtask] = await db.select().from(subtasks).where(eq(subtasks.id, id));
        if (!subtask) return;

        const taskId = subtask.taskId;
        const allSubtasks = await db.select().from(subtasks).where(eq(subtasks.taskId, taskId));

        if (allSubtasks.length > 0) {
          const avgProgress = Math.round(allSubtasks.reduce((sum, s) => sum + (s.progress || 0), 0) / allSubtasks.length);
          const taskUpdate: any = { progress: avgProgress, updatedAt: new Date() };

          const [currentTask] = await db.select().from(projectTasks).where(eq(projectTasks.id, taskId));

          if (avgProgress === 100) {
            if (currentTask?.status !== "Completed") {
              taskUpdate.status = "Completed";
              taskUpdate.completedAt = new Date();
            }
          } else {
            // If progress dropped from 100, move status back to In Progress
            if (currentTask?.status === "Completed") {
              taskUpdate.status = "In Progress";
              taskUpdate.completedAt = null;
            } else if (avgProgress > 0 && (currentTask?.status === "Planned" || currentTask?.status === "Not Started")) {
              taskUpdate.status = "In Progress";
            }
          }

          await db.update(projectTasks).set(taskUpdate).where(eq(projectTasks.id, taskId));
          await db.insert(progressLogs).values({ taskId, percentage: avgProgress, updatedAt: new Date(), updatedBy: userId });
          debug(`[PROGRESS] Task ${taskId} updated to ${avgProgress}% (Status: ${taskUpdate.status || currentTask?.status})`);
          await updateParentProgress('task', taskId, userId);
        }
      } else if (type === 'task') {
        const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, id));
        if (!task || !task.keyStepId) return;

        const keyStepId = task.keyStepId;
        const allTasks = await db.select().from(projectTasks).where(eq(projectTasks.keyStepId, keyStepId));

        if (allTasks.length > 0) {
          const avgProgress = Math.round(allTasks.reduce((sum, t) => sum + (t.progress || 0), 0) / allTasks.length);
          const ksUpdate: any = { progress: avgProgress };

          const [currentKs] = await db.select().from(keySteps).where(eq(keySteps.id, keyStepId));

          if (avgProgress === 100) {
            if (currentKs?.status !== "completed") {
              ksUpdate.status = "completed";
              ksUpdate.completedAt = new Date();
            }
          } else {
            if (currentKs?.status === "completed") {
              ksUpdate.status = "in-progress";
              ksUpdate.completedAt = null;
            }
          }
          await db.update(keySteps).set(ksUpdate).where(eq(keySteps.id, keyStepId));
          await db.insert(progressLogs).values({ keyStepId, percentage: avgProgress, updatedAt: new Date(), updatedBy: userId });
          debug(`[PROGRESS] KeyStep ${keyStepId} updated to ${avgProgress}%`);
          await updateParentProgress('keystep', keyStepId, userId);
        }
      } else if (type === 'keystep') {
        const [ks] = await db.select().from(keySteps).where(eq(keySteps.id, id));
        if (!ks) return;

        const projectId = ks.projectId;
        if (ks.parentKeyStepId) {
          const allChildren = await db.select().from(keySteps).where(eq(keySteps.parentKeyStepId, ks.parentKeyStepId));
          if (allChildren.length > 0) {
            const avgProgress = Math.round(allChildren.reduce((sum, k) => sum + (k.progress || 0), 0) / allChildren.length);
            const parentKsUpdate: any = { progress: avgProgress };
            const [currentParentKs] = await db.select().from(keySteps).where(eq(keySteps.id, ks.parentKeyStepId));
            if (avgProgress === 100) {
              if (currentParentKs?.status !== "completed") {
                parentKsUpdate.status = "completed";
                parentKsUpdate.completedAt = new Date();
              }
            } else {
              if (currentParentKs?.status === "completed") {
                parentKsUpdate.status = "in-progress";
                parentKsUpdate.completedAt = null;
              }
            }
            await db.update(keySteps).set(parentKsUpdate).where(eq(keySteps.id, ks.parentKeyStepId));
            await db.insert(progressLogs).values({ keyStepId: ks.parentKeyStepId, percentage: avgProgress, updatedAt: new Date(), updatedBy: userId });
            debug(`[PROGRESS] Parent KeyStep ${ks.parentKeyStepId} updated to ${avgProgress}%`);
            await updateParentProgress('keystep', ks.parentKeyStepId, userId);
          }
        } else {
          // Some legacy rows have parent_key_step_id stored as an empty
          // string instead of NULL. Comparing a uuid column directly to ''
          // makes Postgres try to cast '' to uuid and throw
          // "invalid input syntax for type uuid" — casting the column to
          // text first avoids that crash while still treating '' as "no
          // parent", same as NULL.
          const allRootSteps = await db.select().from(keySteps).where(and(eq(keySteps.projectId, projectId), sql`(${keySteps.parentKeyStepId} IS NULL OR ${keySteps.parentKeyStepId}::text = '')`));
          if (allRootSteps.length > 0) {
            const avgProgress = Math.round(allRootSteps.reduce((sum, k) => sum + (k.progress || 0), 0) / allRootSteps.length);
            const updateData: any = { progress: avgProgress, updatedAt: new Date() };

            const [oldProject] = await db.select().from(projects).where(eq(projects.id, projectId));
            if (avgProgress === 100) {
              if (oldProject?.status !== "Completed") {
                updateData.status = "Completed";
                updateData.completedAt = new Date();
                debug(`[PROGRESS] Project ${projectId} reached 100% and is now Completed.`);

                await db.update(projects).set(updateData).where(eq(projects.id, projectId));
                await notifyAdminsOfCompletion(projectId);
              } else {
                await db.update(projects).set(updateData).where(eq(projects.id, projectId));
              }
            } else {
              if (oldProject?.status === "Completed") {
                updateData.status = "In Progress";
                updateData.completedAt = null;
              }
              await db.update(projects).set(updateData).where(eq(projects.id, projectId));
            }
            await db.insert(progressLogs).values({ projectId, percentage: avgProgress, updatedAt: new Date(), updatedBy: userId });
            debug(`[PROGRESS] Project ${projectId} updated to ${avgProgress}%`);
          }
        }
      }
    } catch (err) {
      console.error("[PROGRESS] Update error:", err);
    }
  }

  /* ===============================
     TIMELINE (START/END DATE) CASCADE HELPER
     Whenever a Sub Task's dates change, the parent Task's Start/End Date
     should be recalculated as the earliest Start Date / latest End Date
     across all of its Sub Tasks. That change then bubbles up: a Task
     timeline change recalculates its Key Step's timeline, and a Key
     Step timeline change recalculates its Project's timeline.
  ================================ */
  function earliestDate(dates: (string | Date | null | undefined)[]): string | null {
    const valid = dates
      .filter((d): d is string | Date => !!d)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()));
    if (valid.length === 0) return null;
    return new Date(Math.min(...valid.map((d) => d.getTime()))).toISOString().split('T')[0];
  }

  function latestDate(dates: (string | Date | null | undefined)[]): string | null {
    const valid = dates
      .filter((d): d is string | Date => !!d)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()));
    if (valid.length === 0) return null;
    return new Date(Math.max(...valid.map((d) => d.getTime()))).toISOString().split('T')[0];
  }

  async function updateParentTimeline(type: 'subtask' | 'task' | 'keystep' | 'project', id: string, targetParentId?: string) {
    debug(`[TIMELINE] Updating parent timeline for ${type} ${id} (targetParentId=${targetParentId})`);
    try {
      if (type === 'subtask') {
        let taskId = targetParentId;
        if (!taskId) {
          const [subtask] = await db.select({ taskId: subtasks.taskId }).from(subtasks).where(eq(subtasks.id, id));
          if (!subtask) return;
          taskId = subtask.taskId;
        }
        if (!taskId) return;

        const allSubtasks = await db.select().from(subtasks).where(eq(subtasks.taskId, taskId));
        if (allSubtasks.length === 0) return;

        const newStart = earliestDate(allSubtasks.map((s) => s.startDate));
        const newEnd = latestDate(allSubtasks.map((s) => s.endDate));
        if (!newStart && !newEnd) return;

        const [currentTask] = await db.select().from(projectTasks).where(eq(projectTasks.id, taskId));
        if (!currentTask) return;

        const taskUpdate: any = {};
        if (newStart && newStart !== currentTask.startDate) taskUpdate.startDate = newStart;
        if (newEnd && newEnd !== currentTask.endDate) taskUpdate.endDate = newEnd;

        // Recalculate durationDays if dates changed
        const effectiveStart = taskUpdate.startDate || currentTask.startDate;
        const effectiveEnd = taskUpdate.endDate || currentTask.endDate;
        if (effectiveStart && effectiveEnd) {
          const sD = new Date(effectiveStart);
          const eD = new Date(effectiveEnd);
          if (!isNaN(sD.getTime()) && !isNaN(eD.getTime())) {
            const diffDays = Math.round((eD.getTime() - sD.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0) {
              taskUpdate.durationDays = diffDays;
            }
          }
        }

        if (Object.keys(taskUpdate).length > 0) {
          taskUpdate.updatedAt = new Date();
          await db.update(projectTasks).set(taskUpdate).where(eq(projectTasks.id, taskId));
          debug(`[TIMELINE] Task ${taskId} timeline recalculated from subtasks: ${JSON.stringify(taskUpdate)}`);
          await updateParentTimeline('task', taskId, currentTask.keyStepId || currentTask.projectId);
        }
      } else if (type === 'task') {
        let currentTask: any;
        const [tRow] = await db.select().from(projectTasks).where(eq(projectTasks.id, id));
        currentTask = tRow;

        const keyStepId = currentTask?.keyStepId || targetParentId;
        const projectId = currentTask?.projectId;

        if (keyStepId) {
          const allTasks = await db.select().from(projectTasks).where(eq(projectTasks.keyStepId, keyStepId));
          if (allTasks.length > 0) {
            const newStart = earliestDate(allTasks.map((t) => t.startDate));
            const newEnd = latestDate(allTasks.map((t) => t.endDate));

            const [currentKs] = await db.select().from(keySteps).where(eq(keySteps.id, keyStepId));
            if (currentKs && (newStart || newEnd)) {
              const ksUpdate: any = {};
              if (newStart && newStart !== currentKs.startDate) ksUpdate.startDate = newStart;
              if (newEnd && newEnd !== currentKs.endDate) ksUpdate.endDate = newEnd;

              if (Object.keys(ksUpdate).length > 0) {
                await db.update(keySteps).set(ksUpdate).where(eq(keySteps.id, keyStepId));
                debug(`[TIMELINE] Key Step ${keyStepId} timeline recalculated from tasks: ${JSON.stringify(ksUpdate)}`);
                await updateParentTimeline('keystep', keyStepId, currentKs.projectId);
              }
            }
          }
        } else if (projectId) {
          await updateParentTimeline('project', projectId);
        }
      } else if (type === 'keystep') {
        let projectId = targetParentId;
        if (!projectId) {
          const [ks] = await db.select({ projectId: keySteps.projectId }).from(keySteps).where(eq(keySteps.id, id));
          if (!ks) return;
          projectId = ks.projectId;
        }
        if (!projectId) return;

        await updateParentTimeline('project', projectId);
      } else if (type === 'project') {
        const projectId = id;
        const allKeySteps = await db.select().from(keySteps).where(eq(keySteps.projectId, projectId));

        let newStart: string | null = null;
        let newEnd: string | null = null;

        if (allKeySteps.length > 0) {
          newStart = earliestDate(allKeySteps.map((k) => k.startDate));
          newEnd = latestDate(allKeySteps.map((k) => k.endDate));
        } else {
          // If project has no key steps, roll up directly from tasks
          const allTasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));
          if (allTasks.length > 0) {
            newStart = earliestDate(allTasks.map((t) => t.startDate));
            newEnd = latestDate(allTasks.map((t) => t.endDate));
          }
        }

        if (!newStart && !newEnd) return;

        const [currentProject] = await db.select().from(projects).where(eq(projects.id, projectId));
        if (!currentProject) return;

        const projectUpdate: any = {};
        if (newStart && newStart !== currentProject.startDate) projectUpdate.startDate = newStart;
        if (newEnd && newEnd !== currentProject.endDate) projectUpdate.endDate = newEnd;

        if (Object.keys(projectUpdate).length > 0) {
          projectUpdate.updatedAt = new Date();
          await db.update(projects).set(projectUpdate).where(eq(projects.id, projectId));
          debug(`[TIMELINE] Project ${projectId} timeline recalculated: ${JSON.stringify(projectUpdate)}`);
        }
      }
    } catch (err) {
      console.error("[TIMELINE] Update error:", err);
    }
  }

  async function notifyAdminsOfCompletion(projectId: string) {
    debug(`[NOTIFY] Dispatching completion alerts for project ${projectId}`);
    try {
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) return;

      const adminEmails = await storageHelper.getAdminEmails();
      if (adminEmails.length === 0) return;

      let originalAssignerName = "System Administrator";
      if (project.createdByEmployeeId) {
        const creator = await storageHelper.getEmployee(project.createdByEmployeeId);
        if (creator) originalAssignerName = creator.name;
      }

      let firstMemberName = "Team Member";
      let firstMemberCode = "N/A";

      const dbTeamMembers = await db
        .select({ name: employees.name, code: employees.empCode })
        .from(projectTeamMembers)
        .innerJoin(employees, eq(projectTeamMembers.employeeId, employees.id))
        .where(eq(projectTeamMembers.projectId, projectId))
        .limit(1);

      if (dbTeamMembers.length > 0) {
        firstMemberName = dbTeamMembers[0].name;
        firstMemberCode = dbTeamMembers[0].code || "N/A";
      }

      for (const adminEmail of adminEmails) {
        await sendProjectCompletionEmail(adminEmail, {
          title: project.title,
          projectCode: project.projectCode,
          clientName: project.clientName || 'N/A',
          startDate: project.startDate ? new Date(project.startDate).toLocaleDateString() : 'N/A',
          endDate: project.endDate ? new Date(project.endDate).toLocaleDateString() : 'N/A',
          progress: project.progress,
          assigner: originalAssignerName,
          employeeName: firstMemberName,
          employeeCode: firstMemberCode
        });
      }
    } catch (err) {
      console.warn("[ADMIN NOTIFY] Failed to dispatch project completion alerts:", err);
    }
  }
  /* ===============================
      EMPLOYEES
  ================================ */
  app.get("/api/employees", async (req, res) => {
    try {
      const { department } = req.query;
      let conditions = [];
      if (department) {
        conditions.push(eq(employees.department, department as string));
      }

      const rows = await db
        .select({
          id: employees.id,
          empCode: employees.empCode,
          name: employees.name,
          designation: employees.designation,
          department: employees.department,
          email: employees.email,
          phone: employees.phone,
        })
        .from(employees)
        .where(conditions.length > 0 ? and(...conditions) : sql`TRUE`)
        .orderBy(employees.name);

      res.json(rows);
    } catch (err) {
      console.error("Employees fetch error:", err);
      res.status(500).json([]);
    }
  });

  // GET DEPARTMENTS — reads from the departments master table (source of truth)
  app.get("/api/departments", async (_req, res) => {
    try {
      const rows = await db
        .select({ name: departments.name })
        .from(departments)
        .orderBy(departments.name);

      res.json(rows.map(r => r.name).filter(Boolean));
    } catch (err) {
      console.error("Departments fetch error:", err);
      res.status(500).json([]);
    }
  });

  // CREATE DEPARTMENT — admin only; saves permanently to the departments table
  // independent of whether any employee is assigned to it yet.
  app.post("/api/departments", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const rawName = (req.body?.name ?? "").toString().trim();
      if (!rawName) return res.status(400).json({ error: "Department name is required" });

      const [existing] = await db
        .select({ id: departments.id, name: departments.name })
        .from(departments)
        .where(sql`LOWER(${departments.name}) = ${rawName.toLowerCase()}`)
        .limit(1);
      if (existing) {
        return res.status(409).json({ error: `Department "${existing.name}" already exists` });
      }

      const [created] = await db.insert(departments).values({ name: rawName }).returning();
      res.status(201).json(created);
    } catch (err: any) {
      console.error("Department create error:", err);
      if (err?.code === "23505") return res.status(409).json({ error: "Department already exists" });
      res.status(500).json({ error: "Failed to create department" });
    }
  });

  // LOGIN - accepts employee code + password
  app.post("/api/login", async (req, res) => {
    try {
      const { employeeCode, password } = req.body;
      debug("[LOGIN] Attempting login with employeeCode:", employeeCode);
      if (!employeeCode || !password) return res.status(400).json({ error: "employeeCode and password required" });

      // Lookup employee using raw query to avoid schema mismatch
      const empRes = await pool.query('SELECT id, emp_code as "empCode", name, designation, department, email, phone FROM employees WHERE emp_code = $1 LIMIT 1', [employeeCode]);
      const employee = empRes.rows[0];
      debug("[LOGIN] Employee lookup result:", employee ? `Found ${employee.name}` : "Not found");
      if (!employee) return res.status(401).json({ error: "Invalid credentials" });

      // Find the user row linked to this employee using raw query
      const userRes = await pool.query('SELECT * FROM users WHERE employee_id = $1 LIMIT 1', [employee.id]);
      const user = userRes.rows[0];
      debug("[LOGIN] User lookup result:", user ? `Found user ${user.username}` : "Not found");
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      // Plaintext password comparison for now (seed uses plaintext 'admin123')
      const passwordMatch = String(user.password) === String(password);
      debug("[LOGIN] Password match:", { passwordMatch, stored: user.password, provided: password });
      if (!passwordMatch) return res.status(401).json({ error: "Invalid credentials" });

      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(sessions).values({
        token,
        userId: user.id,
        employeeId: employee.id,
        empCode: employee.empCode,
        role: user.role || "EMPLOYEE",
        expiresAt: expiresAt as any,
      } as any);

      debug("Login success for employee:", { empCode: employee.empCode, userId: user.id });

      res.json({ token, user: { id: user.id, username: user.username, role: user.role, employeeId: employee.id, empCode: employee.empCode, name: employee.name, department: employee.department, designation: employee.designation, email: employee.email } });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // FORGOT PASSWORD - reset password using employee code
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { employeeCode, newPassword, confirmPassword } = req.body;
      console.log("[FORGOT-PASSWORD] Reset request for employeeCode:", employeeCode);

      if (!employeeCode || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: "All fields are required" });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match" });
      }

      // Lookup employee
      const empRes = await pool.query('SELECT * FROM employees WHERE emp_code = $1 LIMIT 1', [employeeCode]);
      const employee = empRes.rows[0];
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      // Find user
      const userRes = await pool.query('SELECT * FROM users WHERE employee_id = $1 LIMIT 1', [employee.id]);
      const user = userRes.rows[0];
      if (!user) {
        return res.status(404).json({ error: "User record not found for this employee" });
      }

      // Update password (using plaintext for consistency)
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, user.id]);

      console.log("[FORGOT-PASSWORD] Password updated successfully for employee:", employeeCode);
      res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // LOGOUT - deletes current session
  app.post("/api/logout", requireAuth, async (req: any, res) => {
    try {
      const token = req.session?.token;
      if (token) {
        await db.delete(sessions).where(eq(sessions.token, token));
        // Clear from cache too
        clearTokenCache(token);
        debug("[AUTH-CACHE] Token cleared from cache on logout");
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Logout error:", err);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // GET current user/profile
  app.get("/api/me", requireAuth, async (req: any, res) => {
    try {
      const u = req.user || {};
      const e = req.employee || {};

      const mergedUser = {
        ...u,
        employeeId: e.id,
        empCode: e.empCode,
        name: e.name,
        email: e.email,
        phone: e.phone,
        designation: e.designation,
        department: e.department
      };

      res.json({ user: mergedUser });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Health check to verify latest code is live
  app.get("/api/health-check", (_req, res) => {
    res.json({ status: "ok", version: "1.0.1", timestamp: new Date().toISOString() });
  });

  /* ===============================
      PROJECTS
  ================================ */

  // GET ALL PROJECTS (requires auth)
  app.get("/api/projects", requireAuth, async (req: any, res) => {
    try {
      console.log('[TRACE] /api/projects handler entered - req.user/employee:', { user: req.user ? { id: req.user.id, role: req.user.role, username: req.user.username } : null, employee: req.employee ? { id: req.employee.id, empCode: req.employee.empCode } : null });
      // TEMP TEST: ensure handler executes and error paths are visible
      // throw new Error('early-fail-test');
      const requestingEmployeeId = req.employee?.id || null;
      const requestingEmployeeDepartment = req.employee?.department || null;
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";

      let projectRows: any[] = [];
      let departments: any[] = [];
      let teamMembers: any[] = [];
      let vendors: any[] = [];

      // DEBUG: inspect `projects` export before querying
      console.log('[DEBUG] projects object keys:', Object.keys(projects || {}));
      console.log('[DEBUG] projects.createdAt present:', !!projects?.createdAt);

      // (Raw SQL fallback removed)


      // Load projects using Drizzle where possible
      let allProjects: any[] = [];
      const filterStatus = req.query.status ? String(req.query.status) : "active";

      try {
        let query = db.select().from(projects);
        if (filterStatus === "active") {
          allProjects = await query.where(sql`LOWER(${projects.status}) != 'completed'`);
        } else if (filterStatus === "Completed") {
          allProjects = await query.where(sql`LOWER(${projects.status}) = 'completed'`);
        } else if (filterStatus === "Cancelled") {
          allProjects = await query.where(sql`LOWER(${projects.status}) = 'cancelled'`);
        } else {
          allProjects = await query;
        }
      } catch (drizzleErr: any) {
        console.warn('[WARN] /api/projects - Drizzle select failed, falling back to minimal raw select', drizzleErr && (drizzleErr.message || drizzleErr));
        let fallbackRows: any[] = [];

        const statusCondition = filterStatus === "Completed"
          ? `WHERE LOWER(status) = 'completed'`
          : filterStatus === "Cancelled"
            ? `WHERE LOWER(status) = 'cancelled'`
            : filterStatus === "all"
              ? ``
              : `WHERE LOWER(status) != 'completed'`;

        try {
          const columnInfo = await pool.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'hold_reason' LIMIT 1`
          );
          const hasHoldReason = (columnInfo.rows || []).length > 0;
          const fallbackQuery = `SELECT id, title, project_code AS "projectCode", description, client_name AS "clientName", status, ${hasHoldReason ? 'hold_reason AS "holdReason",' : ''} progress, start_date AS "startDate", end_date AS "endDate", created_by_employee_id AS "createdByEmployeeId", created_at AS "createdAt" FROM projects ${statusCondition} ORDER BY created_at DESC`;

          const fallback = await pool.query(fallbackQuery);
          fallbackRows = fallback.rows || [];
        } catch (fallbackErr) {
          const fallbackErrMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          console.warn('[WARN] /api/projects - raw fallback failed, returning minimal project rows', fallbackErrMessage);
          const fallback2 = await pool.query(
            `SELECT id, title, project_code AS "projectCode", description, client_name AS "clientName", status, progress, start_date AS "startDate", end_date AS "endDate", created_by_employee_id AS "createdByEmployeeId", created_at AS "createdAt" FROM projects ${statusCondition} ORDER BY created_at DESC`
          );
          fallbackRows = fallback2.rows || [];
        }

        allProjects = (fallbackRows || []).map((r: any) => ({
          id: r.id,
          title: r.title,
          projectCode: r.projectCode,
          description: r.description,
          clientName: r.clientName,
          status: r.status,
          progress: r.progress,
          startDate: r.startDate,
          endDate: r.endDate,
          createdAt: r.createdAt,
          createdByEmployeeId: r.createdByEmployeeId || null,
          holdReason: r.holdReason || null,
        }));
      }

      const allProjectIds = allProjects.map((p) => p.id);
      console.log('[DEBUG] /api/projects - allProjectIds sample =', allProjectIds.slice(0, 10));

      // Fetch all related data in parallel - ONCE
      const [deptResults, teamResults, vendorResults, membershipResults, taskMembershipProjectIds] = await Promise.all([
        db.select().from(projectDepartments).where(inArray(projectDepartments.projectId, allProjectIds)),
        db.select().from(projectTeamMembers).where(inArray(projectTeamMembers.projectId, allProjectIds)),
        db.select().from(projectVendors).where(inArray(projectVendors.projectId, allProjectIds)),
        !isAdmin ? db.select({ projectId: projectTeamMembers.projectId }).from(projectTeamMembers).where(eq(projectTeamMembers.employeeId, requestingEmployeeId)) : Promise.resolve([]),
        !isAdmin ? db.select({ projectId: projectTasks.projectId })
          .from(projectTasks)
          .leftJoin(taskMembers, eq(projectTasks.id, taskMembers.taskId))
          .leftJoin(subtasks, eq(projectTasks.id, subtasks.taskId))
          .leftJoin(subtaskMembers, eq(subtasks.id, subtaskMembers.subtaskId))
          .where(or(
            eq(taskMembers.employeeId, requestingEmployeeId),
            eq(subtasks.assignedTo, requestingEmployeeId),
            eq(subtaskMembers.employeeId, requestingEmployeeId),
            eq(projectTasks.assignerId, requestingEmployeeId)
          )) : Promise.resolve([]),
      ]);

      console.log('[DEBUG] /api/projects - dept/team/vendor/membership/taskMembership lengths =',
        Array.isArray(deptResults) ? deptResults.length : typeof deptResults,
        Array.isArray(teamResults) ? teamResults.length : typeof teamResults,
        Array.isArray(vendorResults) ? vendorResults.length : typeof vendorResults,
        Array.isArray(membershipResults) ? membershipResults.length : typeof membershipResults,
        Array.isArray(taskMembershipProjectIds) ? taskMembershipProjectIds.length : typeof taskMembershipProjectIds
      );

      departments = deptResults;
      teamMembers = teamResults;
      vendors = vendorResults;

      // Build maps for O(1) lookups
      const departmentMap = new Map();
      const teamMap = new Map();
      const vendorMap = new Map();

      // Normalize and index related rows for robust comparisons
      departments.forEach((d) => {
        const pid = String(d.projectId);
        const dept = normalizeDept((d.department || "").toString());
        if (!departmentMap.has(pid)) departmentMap.set(pid, [] as string[]);
        if (dept && !departmentMap.get(pid).includes(dept)) departmentMap.get(pid).push(dept);
      });

      teamMembers.forEach((m) => {
        const pid = String(m.projectId);
        const empId = String(m.employeeId);
        if (!teamMap.has(pid)) teamMap.set(pid, [] as string[]);
        teamMap.get(pid).push(empId);
      });

      vendors.forEach((v) => {
        const pid = String(v.projectId);
        if (!vendorMap.has(pid)) vendorMap.set(pid, [] as string[]);
        vendorMap.get(pid).push(v.vendorName);
      });

      // Filter projects based on access level
      const isE0001 = req.employee?.empCode === "E0001";

      if (isAdmin || isE0001) {
        projectRows = allProjects;
      } else {
        if (!requestingEmployeeId) return res.status(403).json({ error: "Forbidden" });

        // Normalize requester's department for robust matching
        const reqDeptNorm = normalizeDept(requestingEmployeeDepartment);
        const teamProjectIds = new Set((membershipResults as any[]).map((m) => String(m.projectId)));
        const taskProjIds = new Set((taskMembershipProjectIds as any[]).map((m) => String(m.projectId)));

        projectRows = allProjects.filter((p) => {
          const pid = String(p.id);
          const isTeamMember = teamProjectIds.has(pid);
          const hasAssignedTask = taskProjIds.has(pid);

          // Department-based visibility
          const projectDepts = departmentMap.get(pid) || [];
          const isDeptMatch = projectDepts.some((d: string) => normalizeDept(d) === reqDeptNorm);

          // Also allow the creator to see it (safety fallback)
          const isCreator = p.createdByEmployeeId === requestingEmployeeId;

          const baseMatch = Boolean(isTeamMember || isCreator || isDeptMatch || hasAssignedTask);

          if (baseMatch) {
            // debug(`[ACL] Project "${p.title}" visible for ${req.employee?.name} (isDeptMatch=${isDeptMatch})`);
          }

          return baseMatch;
        });
      }

      // Sanity-check projectRows to avoid spreading null/undefined
      const falsyEntries = projectRows.filter((pr) => !pr);
      if (falsyEntries.length > 0) {
        console.warn('[WARN] /api/projects - removing falsy entries from projectRows', falsyEntries.length);
      }
      projectRows = projectRows.filter(Boolean);

      // Build response with cached data (defensive)
      try {
        const result = projectRows.map((p) => {
          try {
            const id = p && typeof p === 'object' ? p.id : undefined;
            return {
              ...(p || {}),
              department: (typeof departmentMap !== 'undefined' && departmentMap.get ? departmentMap.get(id) : []) || [],
              team: (typeof teamMap !== 'undefined' && teamMap.get ? teamMap.get(id) : []) || [],
              vendors: (typeof vendorMap !== 'undefined' && vendorMap.get ? vendorMap.get(id) : []) || [],
            };
          } catch (inner) {
            console.warn('[WARN] /api/projects - failed to map single project, returning minimal', inner);
            return { id: p && p.id ? p.id : null, title: p && p.title ? p.title : 'Unknown', department: [], team: [], vendors: [] };
          }
        });
        return res.json(result);
      } catch (mapErr: any) {
        console.error('[ERROR] /api/projects - mapping failed', mapErr && (mapErr.stack || mapErr));
        // fallback: send minimal projects so UI shows something
        const fallback = (projectRows || []).map((p: any) => ({ id: p?.id ?? null, title: p?.title ?? 'Unknown', department: [], team: [], vendors: [] }));
        return res.json(fallback);
      }
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Projects fetch error:", errorMessage, err && (err.stack || err));
      res.status(500).json({ error: "Failed to fetch projects", details: errorMessage });
    }
  });

  // GET PROJECTS FOR DROPDOWNS (Lightweight with search/pagination)
  app.get("/api/projects/dropdown", requireAuth, async (req: any, res) => {
    try {
      const { search, limit = 50, offset = 0 } = req.query;
      let conditions = [sql`LOWER(${projects.status}) != 'completed'`];
      if (search) {
        conditions.push(sql`${projects.title} ILIKE ${'%' + search + '%'}`);
      }

      const rows = await db
        .select({
          id: projects.id,
          title: projects.title,
        })
        .from(projects)
        .where(and(...conditions))
        .limit(Number(limit))
        .offset(Number(offset))
        .orderBy(desc(projects.createdAt));

      res.json(rows);
    } catch (err) {
      console.error("Projects dropdown fetch error:", err);
      res.status(500).json([]);
    }
  });

  // CREATE PROJECT (requires auth; team assignments require ADMIN)
  app.post("/api/projects", requireAuth, async (req: any, res) => {
    try {
      const {
        title,
        projectCode,
        department = [],
        description,
        clientName,
        company,
        location,
        status = "Planned",
        holdReason,
        startDate,
        endDate,
        progress = 0,
        team = [],
        vendors: vendorList = [],
      } = req.body;

      // Validate required fields using validator
      const validationErrors = DataValidator.validateProject({
        title,
        startDate,
        endDate,
        progress,
        department,
        team,
        vendors: vendorList,
      });

      if (validationErrors.length > 0) {
        console.warn("❌ Project validation failed:", validationErrors);
        return res.status(400).json({
          error: "Validation failed",
          details: validationErrors
        });
      }

      const formatDate = (date: any) => {
        const formatted = DataValidator.formatDate(date);
        if (!formatted) {
          throw new Error(`Invalid date format: ${date}`);
        }
        return formatted;
      };

      // Generate projectCode only if provided
      const titleTrimmed = title?.trim();
      let finalProjectCode = projectCode?.trim() || `P-${Date.now()}`;

      if (!titleTrimmed) {
        return res.status(400).json({ error: "Validation failed", details: ["Title is required"] });
      }

      const existingProject = await db.select().from(projects).where(or(
        eq(projects.title, titleTrimmed),
        eq(projects.projectCode, finalProjectCode)
      )).limit(1);

      if (existingProject.length > 0) {
        return res.status(409).json({ error: "Duplicate project", details: "A project with the same title or code already exists." });
      }

      // Format required dates
      const finalStartDate = formatDate(startDate);
      const finalEndDate = formatDate(endDate);

      debug("✅ Project validation passed, creating project:", { title, finalProjectCode });

      // Create the project - minimal payload for speed
      const [created] = await db
        .insert(projects)
        .values({
          title: title.trim(),
          projectCode: finalProjectCode,
          clientName: clientName?.trim() || null,
          company: company?.trim() || null,
          location: location?.trim() || null,
          description: description?.trim() || null,
          holdReason: holdReason?.trim() || null,
          status: status || "Planned",
          progress: Math.min(100, Math.max(0, Number(progress) || 0)),
          startDate: finalStartDate as any,
          endDate: finalEndDate as any,
          createdByEmployeeId: req.employee?.id || null,
        })
        .returning();

      // Batch insert all related records efficiently
      const projectId = created.id;
      const insertPromises: Promise<any>[] = [];

      // Only add if not empty
      if (Array.isArray(department) && department.length > 0) {
        insertPromises.push(
          db.insert(projectDepartments).values(
            department
              .filter(d => d?.trim())
              .map((dept: string) => ({
                projectId,
                department: normalizeDept(dept),
              }))
          )
        );
      }

      if (Array.isArray(team) && team.length > 0) {
        insertPromises.push(
          db.insert(projectTeamMembers).values(
            team.filter(t => t?.trim()).map((empId: string) => ({
              projectId,
              employeeId: empId.trim(),
            }))
          )
        );
      }

      if (Array.isArray(vendorList) && vendorList.length > 0) {
        insertPromises.push(
          db.insert(projectVendors).values(
            vendorList.filter(v => v?.trim()).map((vendor: string) => ({
              projectId,
              vendorName: vendor.trim(),
            }))
          )
        );
      }

      // Execute all batch inserts in parallel
      if (insertPromises.length > 0) {
        await Promise.all(insertPromises);
      }

      // Return minimal project data
      const result = {
        ...created,
        department: department || [],
        team: team || [],
        vendors: vendorList || [],
        holdReason: holdReason?.trim() || null,
        createdByEmployeeId: created.createdByEmployeeId || null,
      };

      debug("✅ Project created successfully:", created.id);
      res.json(result);
    } catch (err: any) {
      let errorMessage = err instanceof Error ? err.message : String(err);
      let statusCode = 500;

      // Check for duplicate projectCode error (PostgreSQL error code 23505 = unique violation)
      if (err.code === '23505' || err.constraint === 'projects_project_code_key') {
        errorMessage = `Project code already exists. Please use a different project code or leave it empty to auto-generate.`;
        statusCode = 409; // Conflict
      } else if (errorMessage.includes("validation")) {
        statusCode = 400;
      } else if (errorMessage.includes("unique")) {
        statusCode = 409;
        errorMessage = "A project with this code already exists";
      }

      console.error("❌ Project creation failed:", errorMessage);
      if (statusCode !== 409) {
        console.error("Full error:", err);
      }
      res.status(statusCode).json({ error: "Failed to create project", details: errorMessage });
    }
  });

  // UPDATE PROJECT (requires auth; any authenticated user can update)
  app.put("/api/projects/:id", requireAuth, async (req: any, res) => {
    const { id } = req.params;
    try {
      // Fetch current project state before update to detect status transitions
      const oldProject = await storageHelper.getProject(id);

      const {
        title,
        projectCode,
        department = [],
        description,
        clientName,
        company,
        location,
        status,
        holdReason,
        startDate,
        endDate,
        progress = 0,
        team = [],
        vendors: vendorList = [],
      } = req.body;

      // Validate required fields using shared validator for consistency
      const validationErrors = DataValidator.validateProject({
        title,
        startDate,
        endDate,
        progress,
        department,
        team,
        vendors: vendorList,
      });

      if (validationErrors.length > 0) {
        console.warn("❌ Project update validation failed:", validationErrors);
        return res.status(400).json({
          error: "Validation failed",
          details: validationErrors
        });
      }

      const formatDate = (date: any) => {
        const formatted = DataValidator.formatDate(date);
        if (!formatted) throw new Error(`Invalid date format: ${date}`);
        return formatted;
      };

      const updateData: any = {
        title: title.trim(),
        projectCode: projectCode?.trim() || null,
        clientName: clientName?.trim() || null,
        location: location?.trim() || null,
        description: description?.trim() || null,
        holdReason: holdReason?.trim() || null,
        status: status || "Planned",
        // Force progress to 100% when status is Completed
        progress: status === "Completed" ? 100 : Math.min(100, Math.max(0, Number(progress) || 0)),
        updatedAt: new Date(),
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
      };

      // Set completedAt when status is moved to Completed
      if (status === "Completed") {
        updateData.completedAt = oldProject?.status !== "Completed" ? new Date() : oldProject?.completedAt || new Date();
      } else {
        updateData.completedAt = null;
      }

      console.log("✅ Project update validation passed, updating project:", { id, title });

      const updated = await db.transaction(async (tx) => {
        const [updatedProj] = await tx
          .update(projects)
          .set(updateData)
          .where(eq(projects.id, id))
          .returning();

        if (!updatedProj) return null;

        // Cascade cancellation logic
        if (updateData.status === "Cancelled") {
          console.log(`[Project Cancel] Cancelling non-completed items for project: ${id}`);

          // 1. Cancel only active (non-completed) Key Steps — anything already
          // completed keeps its "completed" status untouched.
          // NOTE: decided purely by `status`. Do not also require completedAt to be
          // null — that field can be stale and would otherwise cause non-completed
          // items to be skipped.
          await tx.update(keySteps)
            .set({ status: 'cancelled' })
            .where(
              and(
                eq(keySteps.projectId, id),
                notInArray(keySteps.status, ['Completed', 'completed', 'closed', 'Closed', 'Done', 'done'])
              )
            );

          // 2. Cancel only active (non-completed) Tasks — anything already
          // completed keeps its "completed" status untouched.
          // NOTE: decided purely by `status`. Do not also require completedAt/
          // completionDate to be null — `completionDate` is a form field that gets
          // resubmitted on every task edit regardless of status, so it is often
          // non-null on active tasks and would otherwise cause them to be skipped.
          await tx.update(projectTasks)
            .set({ status: 'Cancelled' })
            .where(
              and(
                eq(projectTasks.projectId, id),
                notInArray(projectTasks.status, ['Completed', 'completed', 'closed', 'Closed', 'Done', 'done'])
              )
            );
        }

        // Update related records - ONLY if provided in the request
        const updateDepartments = req.body.department !== undefined;
        const updateTeam = req.body.team !== undefined;
        const updateVendors = req.body.vendors !== undefined;

        if (updateDepartments) {
          await tx.delete(projectDepartments).where(eq(projectDepartments.projectId, id));
          const deptArray = Array.isArray(req.body.department) ? req.body.department : [];
          if (deptArray.length > 0) {
            await tx.insert(projectDepartments).values(
              deptArray.filter((d: any) => d?.trim()).map((dept: string) => ({
                projectId: id,
                department: normalizeDept(dept),
              }))
            );
          }
        }

        if (updateTeam) {
          await tx.delete(projectTeamMembers).where(eq(projectTeamMembers.projectId, id));
          const teamArray = Array.isArray(req.body.team) ? req.body.team : [];
          if (teamArray.length > 0) {
            await tx.insert(projectTeamMembers).values(
              teamArray.filter((t: any) => t?.trim()).map((empId: string) => ({
                projectId: id,
                employeeId: empId,
              }))
            );
          }
        }

        if (updateVendors) {
          await tx.delete(projectVendors).where(eq(projectVendors.projectId, id));
          const vendorsArray = Array.isArray(req.body.vendors) ? req.body.vendors : [];
          if (vendorsArray.length > 0) {
            await tx.insert(projectVendors).values(
              vendorsArray.filter((v: any) => v?.trim()).map((vendor: string) => ({
                projectId: id,
                vendorName: vendor,
              }))
            );
          }
        }

        return updatedProj;
      });

      if (!updated) return res.status(404).json({ error: "Project not found" });

      // --- ADMIN NOTIFICATION LOGIC ---
      // Triggered only when status transitions TO 'Completed'
      if (updated && updated.status === "Completed" && oldProject?.status !== "Completed") {
        await notifyAdminsOfCompletion(id);
      }

      const result = {
        ...updated,
        department: department || [],
        team: team || [],
        vendors: vendorList || [],
        holdReason: holdReason?.trim() || null,
      };

      console.log("✅ Project updated successfully:", id);
      res.json(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("❌ Project update failed:", errorMessage);
      res.status(500).json({ error: "Failed to update project", details: errorMessage });
    }
  });

  // PATCH PROJECT (partial update)
  app.patch("/api/projects/:id", requireAuth, async (req: any, res) => {
    const { id } = req.params;
    try {
      const data = req.body;
      const updateData: any = { updatedAt: new Date() };
      let oldProject: any = null;

      if (data.status === "On Hold" && (typeof data.holdReason === 'undefined' || !String(data.holdReason || '').trim())) {
        [oldProject] = await db.select({ status: projects.status, holdReason: projects.holdReason }).from(projects).where(eq(projects.id, id));
      }

      if (typeof data.title !== 'undefined') updateData.title = data.title;

      let wasAlreadyCompleted = false;
      if (typeof data.status !== 'undefined') {
        updateData.status = data.status;
        if (data.status === "On Hold") {
          const reason = typeof data.holdReason !== 'undefined'
            ? String(data.holdReason).trim()
            : oldProject?.holdReason;
          if (!reason) {
            return res.status(400).json({ error: 'Hold reason is required when setting project to On Hold' });
          }
          updateData.holdReason = reason;
        } else if (typeof data.holdReason !== 'undefined') {
          updateData.holdReason = data.holdReason;
        }

        if (data.status === "Completed") {
          updateData.progress = 100;
          // Fetch current state to check if it was already completed
          const [currentProject] = await db.select({ status: projects.status, completedAt: projects.completedAt }).from(projects).where(eq(projects.id, id));
          wasAlreadyCompleted = currentProject?.status === "Completed";
          updateData.completedAt = wasAlreadyCompleted ? (currentProject?.completedAt || new Date()) : new Date();
        } else {
          updateData.completedAt = null;
        }
      }
      if (typeof data.progress !== 'undefined') {
        // Only allow manual progress update if status is not Completed
        if (updateData.status !== "Completed" && data.status !== "Completed") {
          updateData.progress = data.progress;
        }
      }
      if (typeof data.description !== 'undefined') updateData.description = data.description;
      if (typeof data.startDate !== 'undefined') updateData.startDate = data.startDate;
      if (typeof data.endDate !== 'undefined') updateData.endDate = data.endDate;
      if (typeof data.clientName !== 'undefined') updateData.clientName = data.clientName;
      if (typeof data.company !== 'undefined') updateData.company = data.company;
      if (typeof data.holdReason !== 'undefined' && typeof data.status === 'undefined') updateData.holdReason = data.holdReason;

      await db.transaction(async (tx) => {
        if (Object.keys(updateData).length > 1) {
          await tx.update(projects).set(updateData).where(eq(projects.id, id));
        }

        // Cascade cancellation logic
        if (updateData.status === "Cancelled") {
          console.log(`[Project Cancel] Cancelling non-completed items for project: ${id}`);

          // 1. Cancel only active (non-completed) Key Steps — anything already
          // completed keeps its "completed" status untouched.
          // NOTE: decided purely by `status`. Do not also require completedAt to be
          // null — that field can be stale and would otherwise cause non-completed
          // items to be skipped.
          await tx.update(keySteps)
            .set({ status: 'cancelled' })
            .where(
              and(
                eq(keySteps.projectId, id),
                notInArray(keySteps.status, ['Completed', 'completed', 'closed', 'Closed', 'Done', 'done'])
              )
            );

          // 2. Cancel only active (non-completed) Tasks — anything already
          // completed keeps its "completed" status untouched.
          // NOTE: decided purely by `status`. Do not also require completedAt/
          // completionDate to be null — `completionDate` is a form field that gets
          // resubmitted on every task edit regardless of status, so it is often
          // non-null on active tasks and would otherwise cause them to be skipped.
          await tx.update(projectTasks)
            .set({ status: 'Cancelled' })
            .where(
              and(
                eq(projectTasks.projectId, id),
                notInArray(projectTasks.status, ['Completed', 'completed', 'closed', 'Closed', 'Done', 'done'])
              )
            );
        }

        // Cascading reopen logic
        const isReopening = (updateData.status && updateData.status !== "Completed" && updateData.status !== "completed" && updateData.status !== "Cancelled") ||
          (typeof data.progress !== 'undefined' && data.progress < 100);

        if (isReopening) {
          console.log(`[Project Reopen] Reopening all related items for project: ${id}`);
          // 1. Reopen all Key Steps
          await tx.update(keySteps).set({ status: 'in-progress', progress: 0 }).where(eq(keySteps.projectId, id));

          // 2. Reopen all Tasks
          await tx.update(projectTasks).set({ status: 'pending', progress: 0 }).where(eq(projectTasks.projectId, id));

          // 3. Reopen all Subtasks
          const taskRows = await tx.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.projectId, id));
          if (taskRows.length > 0) {
            const tIds = taskRows.map(tr => tr.id);
            await tx.update(subtasks).set({ isCompleted: false, progress: 0 }).where(inArray(subtasks.taskId, tIds));
          }
        }

        if (typeof data.department !== 'undefined') {
          await tx.delete(projectDepartments).where(eq(projectDepartments.projectId, id));
          const departments = Array.isArray(data.department) ? data.department : [];
          if (departments.length > 0) {
            await tx.insert(projectDepartments).values(
              departments.filter((d: any) => d?.trim()).map((dept: string) => ({
                projectId: id,
                department: normalizeDept(dept),
              }))
            );
          }
        }
      });

      // Trigger admin notification if this is a fresh completion
      if (data.status === "Completed" && !wasAlreadyCompleted) {
        await notifyAdminsOfCompletion(id);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Project patch failed:", err);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  // DELETE PROJECT (requires auth; any authenticated user can delete)
  app.delete("/api/projects/:id", requireAuth, async (req: any, res) => {
    const { id } = req.params;
    try {
      // Delete related data
      await db.delete(projectDepartments).where(eq(projectDepartments.projectId, id));
      await db.delete(projectTeamMembers).where(eq(projectTeamMembers.projectId, id));
      await db.delete(projectVendors).where(eq(projectVendors.projectId, id));
      await db.delete(projectFiles).where(eq(projectFiles.projectId, id));

      // Delete the project
      await db.delete(projects).where(eq(projects.id, id));

      res.json({ success: true });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Project delete error:", errorMessage);
      res.status(500).json({ error: "Failed to delete project", details: errorMessage });
    }
  });

  /* ===============================================================
     CLONE PROJECT (deep clone — full structure & configuration)
     -----------------------------------------------------------------
     Duplicates a project and every related record (key steps incl.
     nesting, tasks, subtasks, dependencies, members, tags, comments,
     delay reasons, files, departments/team/vendors) with brand-new
     IDs while preserving every parent-child relationship. Runs inside
     a single DB transaction so the clone is all-or-nothing and never
     touches the original project's data.

     Intentionally NOT cloned:
       - ticketId on tasks (support tickets are a separate module —
         linking the clone to the original's ticket would be wrong)
       - progressLogs / taskScheduleHistory (append-only audit trails
         of what happened to the *original* project, not configuration)
       - siteReports (field visit records tied to the original site)
       - TimeStrap actual time entries (real logged work hours belong
         to the original task instance, not a fresh copy)
  ================================================================= */
  app.post("/api/projects/:id/clone", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { newTitle } = req.body || {};

      const [originalProject] = await db.select().from(projects).where(eq(projects.id, id));
      if (!originalProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      const result = await db.transaction(async (tx) => {
        const newProjectId = uuidv4();

        // Unique-ish title/code for the clone (mirrors the duplicate check
        // used on project creation, but never blocks — always finds a free one).
        const baseTitle = (newTitle?.trim()) || `${originalProject.title} (Copy)`;
        let finalTitle = baseTitle;
        let finalProjectCode = `${originalProject.projectCode}-COPY-${Date.now()}`;
        const clash = await tx.select().from(projects).where(or(
          eq(projects.title, finalTitle),
          eq(projects.projectCode, finalProjectCode)
        )).limit(1);
        if (clash.length > 0) {
          finalTitle = `${baseTitle} (${Date.now()})`;
        }

        // 1. PROJECT — Start/End dates copied exactly, per requirement.
        const [newProject] = await tx.insert(projects).values({
          id: newProjectId,
          title: finalTitle,
          projectCode: finalProjectCode,
          description: originalProject.description,
          clientName: originalProject.clientName,
          company: originalProject.company,
          location: originalProject.location,
          holdReason: originalProject.holdReason,
          status: originalProject.status,
          progress: originalProject.progress,
          startDate: originalProject.startDate,
          endDate: originalProject.endDate,
          createdByEmployeeId: req.employee?.id || originalProject.createdByEmployeeId || null,
        }).returning();

        // 2. PROJECT-LEVEL LINKED RECORDS (departments, team, vendors, files)
        const [originalDepartments, originalTeamMembers, originalVendors, originalFiles] = await Promise.all([
          tx.select().from(projectDepartments).where(eq(projectDepartments.projectId, id)),
          tx.select().from(projectTeamMembers).where(eq(projectTeamMembers.projectId, id)),
          tx.select().from(projectVendors).where(eq(projectVendors.projectId, id)),
          tx.select().from(projectFiles).where(eq(projectFiles.projectId, id)),
        ]);

        if (originalDepartments.length > 0) {
          await tx.insert(projectDepartments).values(
            originalDepartments.map(d => ({ projectId: newProjectId, department: d.department }))
          );
        }
        if (originalTeamMembers.length > 0) {
          await tx.insert(projectTeamMembers).values(
            originalTeamMembers.map(m => ({ projectId: newProjectId, employeeId: m.employeeId }))
          );
        }
        if (originalVendors.length > 0) {
          await tx.insert(projectVendors).values(
            originalVendors.map(v => ({ projectId: newProjectId, vendorName: v.vendorName }))
          );
        }
        if (originalFiles.length > 0) {
          await tx.insert(projectFiles).values(
            originalFiles.map(f => ({
              projectId: newProjectId,
              fileName: f.fileName,
              fileSize: f.fileSize,
              mimeType: f.mimeType,
              storageUrl: f.storageUrl,
            }))
          );
        }

        // 3. KEY STEPS (milestones) — preserve nesting via a full id map
        // computed up-front, so parentKeyStepId can be remapped in one pass
        // regardless of how deep the nesting goes or what order rows come back in.
        const originalKeySteps = await tx.select().from(keySteps).where(eq(keySteps.projectId, id));
        const keyStepIdMap = new Map<string, string>();
        for (const ks of originalKeySteps) keyStepIdMap.set(ks.id, uuidv4());

        if (originalKeySteps.length > 0) {
          await tx.insert(keySteps).values(originalKeySteps.map(ks => ({
            id: keyStepIdMap.get(ks.id)!,
            projectId: newProjectId,
            parentKeyStepId: ks.parentKeyStepId ? (keyStepIdMap.get(ks.parentKeyStepId) || null) : null,
            header: ks.header,
            title: ks.title,
            description: ks.description,
            requirements: ks.requirements,
            phase: ks.phase,
            status: ks.status,
            startDate: ks.startDate,
            endDate: ks.endDate,
            completedAt: ks.completedAt,
            progress: ks.progress,
            sortOrder: ks.sortOrder,
          })));
        }

        // 4. TASKS — id map computed up-front so parentTaskId (nested tasks)
        // and keyStepId can both be remapped in a single insert.
        const originalTasks = await tx.select().from(projectTasks).where(eq(projectTasks.projectId, id));
        const taskIdMap = new Map<string, string>();
        for (const t of originalTasks) taskIdMap.set(t.id, uuidv4());

        if (originalTasks.length > 0) {
          await tx.insert(projectTasks).values(originalTasks.map(t => ({
            id: taskIdMap.get(t.id)!,
            projectId: newProjectId,
            keyStepId: t.keyStepId ? (keyStepIdMap.get(t.keyStepId) || null) : null,
            taskName: t.taskName,
            description: t.description,
            status: t.status,
            priority: t.priority,
            startDate: t.startDate,
            endDate: t.endDate,
            durationDays: t.durationDays,
            assignerId: t.assignerId,
            taskPeriod: t.taskPeriod,
            reminderFrequency: t.reminderFrequency,
            taskOwnerId: t.taskOwnerId,
            performancePoints: t.performancePoints,
            gracePeriodDays: t.gracePeriodDays,
            sortOrder: t.sortOrder,
            isAddon: t.isAddon,
            isIssue: t.isIssue,
            parentTaskId: t.parentTaskId ? (taskIdMap.get(t.parentTaskId) || null) : null,
            completedAt: t.completedAt,
            completionDate: t.completionDate,
            progress: t.progress,
            ticketId: null,
          })));
        }

        const originalTaskIds = originalTasks.map(t => t.id);

        if (originalTaskIds.length > 0) {
          // 5. TASK-LEVEL LINKED RECORDS (members, cc, tags, comments, delay reasons)
          const [originalTaskMembers, originalTaskCc, originalTaskTags, originalTaskComments, originalDelayReasons] = await Promise.all([
            tx.select().from(taskMembers).where(inArray(taskMembers.taskId, originalTaskIds)),
            tx.select().from(taskCcMembers).where(inArray(taskCcMembers.taskId, originalTaskIds)),
            tx.select().from(taskTags).where(inArray(taskTags.taskId, originalTaskIds)),
            tx.select().from(taskComments).where(inArray(taskComments.taskId, originalTaskIds)),
            tx.select().from(delayReasons).where(inArray(delayReasons.taskId, originalTaskIds)),
          ]);

          if (originalTaskMembers.length > 0) {
            await tx.insert(taskMembers).values(
              originalTaskMembers.map(m => ({ taskId: taskIdMap.get(m.taskId)!, employeeId: m.employeeId }))
            );
          }
          if (originalTaskCc.length > 0) {
            await tx.insert(taskCcMembers).values(
              originalTaskCc.map(m => ({ taskId: taskIdMap.get(m.taskId)!, employeeId: m.employeeId }))
            );
          }
          if (originalTaskTags.length > 0) {
            await tx.insert(taskTags).values(
              originalTaskTags.map(tt => ({ taskId: taskIdMap.get(tt.taskId)!, tagId: tt.tagId }))
            );
          }
          if (originalTaskComments.length > 0) {
            await tx.insert(taskComments).values(
              originalTaskComments.map(c => ({
                taskId: taskIdMap.get(c.taskId)!,
                content: c.content,
                createdBy: c.createdBy,
                createdAt: c.createdAt,
              }))
            );
          }
          if (originalDelayReasons.length > 0) {
            await tx.insert(delayReasons).values(
              originalDelayReasons.map(d => ({
                taskId: taskIdMap.get(d.taskId)!,
                projectId: newProjectId,
                reason: d.reason,
                delayDate: d.delayDate,
                recordedBy: d.recordedBy,
                createdAt: d.createdAt,
              }))
            );
          }

          // 6. SUBTASKS (+ their members and tags)
          const originalSubtasks = await tx.select().from(subtasks).where(inArray(subtasks.taskId, originalTaskIds));
          const subtaskIdMap = new Map<string, string>();
          for (const s of originalSubtasks) subtaskIdMap.set(s.id, uuidv4());

          if (originalSubtasks.length > 0) {
            await tx.insert(subtasks).values(originalSubtasks.map(s => ({
              id: subtaskIdMap.get(s.id)!,
              taskId: taskIdMap.get(s.taskId)!,
              title: s.title,
              description: s.description,
              isCompleted: s.isCompleted,
              assignedTo: s.assignedTo,
              startDate: s.startDate,
              endDate: s.endDate,
              progress: s.progress,
              isAddon: s.isAddon,
              isIssue: s.isIssue,
              taskOwnerId: s.taskOwnerId,
              priority: s.priority,
              status: s.status,
              ccMembers: s.ccMembers,
              keyStepId: s.keyStepId ? (keyStepIdMap.get(s.keyStepId) || null) : null,
              taskPeriod: s.taskPeriod,
              reminderFrequency: s.reminderFrequency,
              assignerId: s.assignerId,
              durationDays: s.durationDays,
              completionDate: s.completionDate,
            })));

            const originalSubtaskIds = originalSubtasks.map(s => s.id);
            const [originalSubtaskMembers, originalSubtaskTags] = await Promise.all([
              tx.select().from(subtaskMembers).where(inArray(subtaskMembers.subtaskId, originalSubtaskIds)),
              tx.select().from(subtaskTags).where(inArray(subtaskTags.subtaskId, originalSubtaskIds)),
            ]);

            if (originalSubtaskMembers.length > 0) {
              await tx.insert(subtaskMembers).values(
                originalSubtaskMembers.map(m => ({ subtaskId: subtaskIdMap.get(m.subtaskId)!, employeeId: m.employeeId }))
              );
            }
            if (originalSubtaskTags.length > 0) {
              await tx.insert(subtaskTags).values(
                originalSubtaskTags.map(t => ({ subtaskId: subtaskIdMap.get(t.subtaskId)!, tagId: t.tagId }))
              );
            }
          }

          // 7. TASK DEPENDENCIES — remap both ends via the task id map.
          const originalDependencies = await tx.select().from(taskDependencies).where(eq(taskDependencies.projectId, id));
          const validDependencies = originalDependencies.filter(
            d => taskIdMap.has(d.predecessorId) && taskIdMap.has(d.successorId)
          );
          if (validDependencies.length > 0) {
            await tx.insert(taskDependencies).values(validDependencies.map(d => ({
              projectId: newProjectId,
              predecessorId: taskIdMap.get(d.predecessorId)!,
              successorId: taskIdMap.get(d.successorId)!,
              type: d.type,
              lagDays: d.lagDays,
              createdBy: d.createdBy,
            })));
          }
        }

        return {
          project: newProject,
          department: originalDepartments.map(d => d.department),
          team: originalTeamMembers.map(m => m.employeeId),
          vendors: originalVendors.map(v => v.vendorName),
          counts: {
            keySteps: originalKeySteps.length,
            tasks: originalTasks.length,
          },
        };
      });

      console.log(`✅ Project cloned: ${id} -> ${result.project.id}`);
      res.json({
        success: true,
        newProjectId: result.project.id,
        project: {
          ...result.project,
          department: result.department,
          team: result.team,
          vendors: result.vendors,
          holdReason: result.project.holdReason || null,
        },
        message: `Project cloned successfully as "${result.project.title}"`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Project clone error:", errorMessage);
      res.status(500).json({ error: "Clone failed", details: errorMessage });
    }
  });

  /* ===============================
      PROJECT MEMBERS
  ================================ */
  app.get("/api/projects/:projectId/members", requireAuth, async (req, res) => {
    try {
      const { projectId } = req.params;
      const members = await db
        .select({
          id: employees.id,
          name: employees.name,
          department: employees.department,
          empCode: employees.empCode,
          email: employees.email
        })
        .from(projectTeamMembers)
        .innerJoin(employees, eq(projectTeamMembers.employeeId, employees.id))
        .where(eq(projectTeamMembers.projectId, projectId));

      // If no project-specific members, return all employees as fallback
      if (members.length === 0) {
        console.log(`[API] No team members for project ${projectId}, returning all employees as fallback`);
        const allEmps = await db
          .select({
            id: employees.id,
            name: employees.name,
            department: employees.department,
            empCode: employees.empCode,
            email: employees.email
          })
          .from(employees)
          .orderBy(employees.name);
        return res.json(allEmps);
      }

      res.json(members);
    } catch (err) {
      console.error("Failed to fetch project members:", err);
      res.status(500).json({ error: "Failed to fetch project members" });
    }
  });

  /* ===============================
      PROJECT TIME TRACKING (from Timestrap DB)
  ================================ */
  app.get("/api/projects/:projectId/time-entries", requireAuth, async (req: any, res) => {
    try {
      const { projectId } = req.params;

      // Fetch project details to get project name and status
      const [project] = await db
        .select({ id: projects.id, title: projects.title, status: projects.status })
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Do not show time entries for completed projects
      if (project.status && project.status.toLowerCase() === "completed") {
        console.log(`[Time Entries] Project ${project.title} is completed - returning empty entries`);
        return res.json({
          projectId,
          projectTitle: project.title,
          totalMembers: 0,
          totalHours: 0,
          timeEntries: [],
          lastWorkedAt: null,
          note: "Time entries not shown for completed projects"
        });
      }

      console.log(`[Time Entries] Fetching for project: ${project.title} (ID: ${projectId})`);

      // Fetch time entries from timestrap database
      const timeEntriesResult = await getProjectTimeEntries(project.title);

      console.log(`[Time Entries] Retrieved ${timeEntriesResult.entries.length} entries for project: ${project.title}`);

      // Filter out entries with 0 hours or return empty array if no entries
      const validEntries = timeEntriesResult.entries.filter((e: any) => e.hoursSpent > 0);

      res.json({
        projectId,
        projectTitle: project.title,
        totalMembers: validEntries.length,
        totalHours: validEntries.reduce((sum: number, e: any) => sum + e.hoursSpent, 0),
        timeEntries: validEntries,
        lastWorkedAt: timeEntriesResult.lastEntryDate,
      });
    } catch (err: any) {
      console.error("Failed to fetch project time entries:", {
        message: err?.message || err,
        code: err?.code,
        detail: err?.detail,
        stack: err?.stack
      });
      res.status(500).json({
        error: "Failed to fetch project time entries",
        details: err?.message || "Unknown error",
      });
    }
  });

  /* ===============================
      DEBUG: Timestrap Schema Info
  ================================ */
  app.get("/api/debug/timestrap-schema", requireAuth, async (req: any, res) => {
    try {
      // Only allow admin users
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      if (!isAdmin) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const schemaInfo = await getTimestrapTableInfo();
      res.json(schemaInfo);
    } catch (err: any) {
      console.error("Failed to get timestrap schema info:", err);
      res.status(500).json({ error: "Failed to get schema info", details: err?.message });
    }
  });

  /* ===============================
      KEY STEPS
  ================================ */
  app.post("/api/key-steps", async (req, res) => {
    try {
      const {
        projectId,
        parentKeyStepId,
        header,
        title,
        description,
        requirements,
        phase,
        status,
        startDate,
        endDate,
      } = req.body;

      console.log("🔵 Backend received keystep payload:", {
        projectId,
        parentKeyStepId,
        title,
        startDate,
        endDate,
      });

      // Validate using validator
      const validationErrors = DataValidator.validateKeystep({
        projectId,
        title,
        startDate,
        endDate,
        phase,
        status,
      });

      if (validationErrors.length > 0) {
        console.warn("❌ Keystep validation failed:", validationErrors);
        return res.status(400).json({
          error: "Validation failed",
          details: validationErrors,
        });
      }

      // Format dates with validation
      const formattedStartDate = DataValidator.formatDate(startDate);
      const formattedEndDate = DataValidator.formatDate(endDate);

      if ((startDate && !formattedStartDate) || (endDate && !formattedEndDate)) {
        return res.status(400).json({
          error: "Date formatting failed",
          details: [
            { field: "startDate", message: `Cannot format date: ${startDate}` },
            { field: "endDate", message: `Cannot format date: ${endDate}` },
          ],
        });
      }

      console.log("🟢 Keystep validation passed, formatted dates:", {
        startDate: formattedStartDate,
        endDate: formattedEndDate,
      });

      let finalPhase = Number(phase) || 1;

      // Auto-increment phase for sub-keysteps
      if (parentKeyStepId) {
        const existing = await db
          .select({ maxPhase: sql<number>`MAX(${keySteps.phase})` })
          .from(keySteps)
          .where(
            and(
              eq(keySteps.projectId, projectId),
              eq(keySteps.parentKeyStepId, parentKeyStepId)
            )
          );

        finalPhase = (existing[0]?.maxPhase ?? 0) + 1;
      }

      // Build values object explicitly
      const valueObj: any = {
        projectId,
        parentKeyStepId: parentKeyStepId || null,
        header: header ?? "",
        title: title.trim(),
        description: description ?? "",
        requirements: requirements ?? "",
        phase: finalPhase,
        status: status ? String(status).toLowerCase() : "pending",
        startDate: formattedStartDate,
        endDate: formattedEndDate,
      };

      console.log("🟢 Inserting keystep values:", valueObj);

      const insertedArr = await db
        .insert(keySteps)
        .values(valueObj)
        .returning();

      console.log("✅ Keystep created successfully:", insertedArr[0].id);
      if (insertedArr[0] && (formattedStartDate || formattedEndDate)) {
        updateParentTimeline('keystep', insertedArr[0].id, projectId).catch((err) => {
          console.error("[POST /api/key-steps] Timeline update failed:", err);
        });
      }
      res.status(201).json(insertedArr[0]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("❌ Keystep creation failed:", errorMessage);
      console.error("❌ Full error:", err);
      res.status(500).json({
        error: "Failed to create keystep",
        message: errorMessage,
      });
    }
  });

  app.get("/api/projects/:projectId/key-steps", requireAuth, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const empCode = req.employee?.empCode;
      const isE0001 = empCode === "E0001";
      const requestingEmployeeId = req.employee?.id;
      const requestingEmployeeDepartment = req.employee?.department;
      const filterStatus = req.query.status ? String(req.query.status) : "active";
      let cond: any = eq(keySteps.projectId, projectId);

      if (filterStatus === "active") {
        cond = and(cond, sql`${keySteps.status} NOT IN ('completed', 'Completed')`);
      } else if (filterStatus === "Completed" || filterStatus === "completed") {
        cond = and(cond, sql`${keySteps.status} IN ('completed', 'Completed')`);
      }
      // if filterStatus is "all", we don't add status conditions

      const allSteps = await db
        .select()
        .from(keySteps)
        .where(cond);

      if (isAdmin || isE0001) {
        return res.json(allSteps);
      }

      // RELAXED VISIBILITY: If user has access to project, they see all KeySteps
      // Check project access (mimic /api/projects logic)
      const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!proj) return res.status(404).json({ error: "Project not found" });

      const [membership] = await db.select().from(projectTeamMembers).where(and(eq(projectTeamMembers.projectId, projectId), eq(projectTeamMembers.employeeId, requestingEmployeeId))).limit(1);
      const isProjectCreator = proj.createdByEmployeeId === requestingEmployeeId;

      // Department match
      const projectDepts = await db.select().from(projectDepartments).where(eq(projectDepartments.projectId, projectId));
      const reqDeptNorm = normalizeDept(requestingEmployeeDepartment);
      const isDeptMatch = projectDepts.some(d => normalizeDept(d.department) === reqDeptNorm);

      const hasAccess = isAdmin || isE0001 || !!membership || isProjectCreator || isDeptMatch;

      if (!hasAccess) {
        // If not a project member/dept match, check if they are assigned to any task in this project
        const [taskAssigned] = await db.select({ id: projectTasks.id })
          .from(projectTasks)
          .leftJoin(taskMembers, eq(projectTasks.id, taskMembers.taskId))
          .where(and(eq(projectTasks.projectId, projectId), eq(taskMembers.employeeId, requestingEmployeeId)))
          .limit(1);

        if (!taskAssigned) {
          console.log(`[ACL] Access denied to KeySteps for user ${req.user?.username} on project ${proj.title}`);
          return res.status(403).json({ error: "Access denied to project KeySteps" });
        }
      }

      // If they passed access check, return all steps
      // Sort by phase ASC, title ASC as primary, but we'll return raw for frontend to sort
      console.log(`[API /projects/${projectId}/key-steps] Returning ${allSteps.length} key steps for user ${req.user?.username}`);
      res.json(allSteps);
    } catch (err) {
      console.error("Get key steps error:", err);
      res.status(500).json({ error: "Failed to fetch key steps", details: String(err) });
    }
  });

  // Get single key step by ID
  app.get("/api/key-steps/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const [step] = await db
        .select()
        .from(keySteps)
        .where(eq(keySteps.id, id));

      if (!step) {
        return res.status(404).json({ error: "Key step not found" });
      }
      res.json(step);
    } catch (err) {
      console.error("Get key step error:", err);
      res.status(500).json({ error: "Failed to fetch key step", details: String(err) });
    }
  });

  // Get nested key steps for a parent key step
  app.get("/api/key-steps/:keyStepId/children", async (req, res) => {
    try {
      const { keyStepId } = req.params;

      // Set a timeout for the query
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), 5000)
      );

      const queryPromise = db
        .select()
        .from(keySteps)
        .where(eq(keySteps.parentKeyStepId, keyStepId));

      const children = await Promise.race([queryPromise, timeoutPromise]);
      res.json(children);
    } catch (err) {
      console.error("Get key steps children error:", err);
      res.status(500).json({ error: "Failed to fetch children", details: String(err) });
    }
  });

  // Update key step
  app.put("/api/key-steps/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        requirements,
        phase,
        status,
        startDate,
        endDate,
        header,
      } = req.body;

      const formatDate = (date: any) => {
        if (!date) return undefined;
        const d = new Date(date);
        return d.toISOString().split('T')[0];
      };

      const normalizedStatus = status ? String(status).toLowerCase() : "pending";
      const isCompleted = normalizedStatus === "completed" || normalizedStatus === "Completed".toLowerCase();

      // Get current key step for timestamp check
      const [oldStep] = await db.select().from(keySteps).where(eq(keySteps.id, id));

      const updated = await db.transaction(async (tx) => {
        const [updatedStep] = await tx
          .update(keySteps)
          .set({
            title: title?.trim(),
            description: description ?? "",
            requirements: requirements ?? "",
            header: header ?? "",
            phase: Number(phase) || 1,
            status: normalizedStatus,
            progress: isCompleted ? 100 : (typeof req.body.progress !== 'undefined' ? Number(req.body.progress) : undefined),
            startDate: startDate ? formatDate(startDate) : undefined,
            endDate: endDate ? formatDate(endDate) : undefined,
            completedAt: isCompleted ? (oldStep?.status?.toLowerCase() !== 'completed' ? new Date() : (oldStep?.completedAt || new Date())) : null,
          })
          .where(eq(keySteps.id, id))
          .returning();

        if (updatedStep && normalizedStatus === "cancelled") {
          console.log(`[KeyStep Cancel] Cancelling non-completed tasks for key step: ${id}`);

          // NOTE: decided purely by `status`. Do not also require completedAt/
          // completionDate to be null — `completionDate` is a form field that gets
          // resubmitted on every task edit regardless of status, so it is often
          // non-null on active tasks and would otherwise cause them to be skipped.
          await tx.update(projectTasks)
            .set({ status: 'Cancelled' })
            .where(
              and(
                eq(projectTasks.keyStepId, id),
                notInArray(projectTasks.status, ['Completed', 'completed', 'closed', 'Closed', 'Done', 'done'])
              )
            );
        }

        return updatedStep;
      });

      if (updated) {
        // Fire-and-forget — see the matching comment in PATCH /api/tasks/:id.
        updateParentProgress('keystep', id, req.user?.id).catch((err) => {
          console.error("[PUT /api/key-steps/:id] Background progress update failed:", err);
        });

        // Cascade Start/End Date changes up: Key Step -> Project.
        if (startDate || endDate) {
          updateParentTimeline('keystep', id).catch((err) => {
            console.error("[PUT /api/key-steps/:id] Background timeline update failed:", err);
          });
        }
      }

      if (!updated) return res.status(404).json({ message: "Key step not found" });
      res.json(updated);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Key step update error:", errorMessage);
      res.status(500).json({ message: "Update failed", details: errorMessage });
    }
  });

  // PATCH Key Step
  app.patch("/api/key-steps/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const updateData: any = {};

      // Snapshot the key step's current status/progress *before* applying the
      // update. The cascade below (reopening child tasks/subtasks) should only
      // ever run when the step is actually transitioning AWAY FROM completed/
      // cancelled — not on every ordinary status change (e.g. pending ->
      // in-progress). Without this snapshot there's no way to tell those cases
      // apart, and every single status edit ends up synchronously rewriting
      // every task and subtask under the step — which is both wrong (it wipes
      // out real progress on tasks that were never actually completed) and the
      // main reason key step status updates feel slow.
      const [priorStep] = await db
        .select({ status: keySteps.status, progress: keySteps.progress })
        .from(keySteps)
        .where(eq(keySteps.id, id))
        .limit(1);
      const wasCompletedOrCancelled =
        !!priorStep && ["completed", "cancelled"].includes(String(priorStep.status).toLowerCase());

      if (typeof data.title !== 'undefined') updateData.title = data.title;
      if (typeof data.description !== 'undefined') updateData.description = data.description;
      if (typeof data.requirements !== 'undefined') updateData.requirements = data.requirements;
      if (typeof data.header !== 'undefined') updateData.header = data.header;
      if (typeof data.phase !== 'undefined') updateData.phase = Number(data.phase);
      if (typeof data.startDate !== 'undefined') updateData.startDate = data.startDate;
      if (typeof data.endDate !== 'undefined') updateData.endDate = data.endDate;
      if (typeof data.progress !== 'undefined') updateData.progress = Number(data.progress);

      if (typeof data.status !== 'undefined') {
        updateData.status = data.status;
        const isCompleted = String(data.status).toLowerCase() === "completed";
        if (isCompleted) {
          updateData.progress = 100;
          updateData.completedAt = new Date();
        } else {
          updateData.completedAt = null;
        }
      }

      const updated = await db.transaction(async (tx) => {
        const [updatedStep] = await tx
          .update(keySteps)
          .set(updateData)
          .where(eq(keySteps.id, id))
          .returning();

        if (updatedStep) {
          if (updateData.status && String(updateData.status).toLowerCase() === "cancelled") {
            console.log(`[KeyStep Cancel] Cancelling non-completed tasks for key step: ${id}`);

            // NOTE: decided purely by `status`. Do not also require completedAt/
            // completionDate to be null — `completionDate` is a form field that gets
            // resubmitted on every task edit regardless of status, so it is often
            // non-null on active tasks and would otherwise cause them to be skipped.
            await tx.update(projectTasks)
              .set({ status: 'Cancelled' })
              .where(
                and(
                  eq(projectTasks.keyStepId, id),
                  notInArray(projectTasks.status, ['Completed', 'completed', 'closed', 'Closed', 'Done', 'done'])
                )
              );
          }

          const isReopening =
            (wasCompletedOrCancelled &&
              updateData.status &&
              String(updateData.status).toLowerCase() !== "completed" &&
              String(updateData.status).toLowerCase() !== "cancelled") ||
            (typeof updateData.progress !== 'undefined' && updateData.progress < 100 && (priorStep?.progress ?? 0) === 100);

          if (isReopening) {
            console.log(`[KeyStep Reopen] Reopening tasks and subtasks for key step: ${id}`);

            // 1. Reopen all child key steps (if any)
            await tx.update(keySteps).set({ status: 'in-progress', progress: 0 }).where(eq(keySteps.parentKeyStepId, id));

            // 2. Reopen all tasks under this key step
            await tx.update(projectTasks).set({ status: 'pending', progress: 0 }).where(eq(projectTasks.keyStepId, id));

            // 3. Reopen all subtasks for those tasks
            const taskRows = await tx.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.keyStepId, id));
            if (taskRows.length > 0) {
              const tIds = taskRows.map(tr => tr.id);
              await tx.update(subtasks).set({ isCompleted: false, progress: 0 }).where(inArray(subtasks.taskId, tIds));
            }
          }
        }
        return updatedStep;
      });

      if (updated) {
        // Fire-and-forget — see the matching comment in PATCH /api/tasks/:id.
        updateParentProgress('keystep', id, req.user?.id).catch((err) => {
          console.error("[PATCH /api/key-steps/:id] Background progress update failed:", err);
        });

        // Cascade Start/End Date changes up: Key Step -> Project.
        if (typeof data.startDate !== 'undefined' || typeof data.endDate !== 'undefined') {
          updateParentTimeline('keystep', id).catch((err) => {
            console.error("[PATCH /api/key-steps/:id] Background timeline update failed:", err);
          });
        }
      }

      if (!updated) return res.status(404).json({ message: "Key step not found" });
      res.json(updated);
    } catch (err) {
      console.error("Key step patch failed:", err);
      res.status(500).json({ message: "Update failed" });
    }
  });

  // Delete key step
  app.delete("/api/key-steps/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const [existingKs] = await db.select({ projectId: keySteps.projectId }).from(keySteps).where(eq(keySteps.id, id));
      const projectId = existingKs?.projectId;

      // Delete all child key steps
      await db.delete(keySteps).where(eq(keySteps.parentKeyStepId, id));

      // Delete the key step itself
      await db.delete(keySteps).where(eq(keySteps.id, id));

      if (projectId) {
        updateParentTimeline('keystep', id, projectId).catch((err) => {
          console.error("[DELETE /api/key-steps/:id] Timeline update failed:", err);
        });
      }

      res.json({ success: true });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Key step delete error:", errorMessage);
      res.status(500).json({ message: "Delete failed", details: errorMessage });
    }
  });

  // CLONE KEY STEP (duplicate with sub-keysteps)
  app.post("/api/key-steps/:id/clone", async (req, res) => {
    try {
      const { id } = req.params;
      const { newTitle } = req.body;

      // Get original keystep
      const [originalKeyStep] = await db
        .select()
        .from(keySteps)
        .where(eq(keySteps.id, id));

      if (!originalKeyStep) {
        return res.status(404).json({ error: "Key step not found" });
      }

      // Create new keystep with cloned data
      const newKeyStepId = uuidv4();
      await db.insert(keySteps).values({
        id: newKeyStepId,
        projectId: originalKeyStep.projectId,
        header: originalKeyStep.header,
        title: newTitle || `${originalKeyStep.title} (Copy)`,
        description: originalKeyStep.description,
        requirements: originalKeyStep.requirements,
        phase: originalKeyStep.phase,
        status: originalKeyStep.status,
        startDate: originalKeyStep.startDate,
        endDate: originalKeyStep.endDate,
        parentKeyStepId: originalKeyStep.parentKeyStepId,
      });

      // Clone child keysteps
      const originalChildren = await db
        .select()
        .from(keySteps)
        .where(eq(keySteps.parentKeyStepId, id));

      if (originalChildren.length > 0) {
        for (const originalChild of originalChildren) {
          const newChildId = uuidv4();

          await db.insert(keySteps).values({
            id: newChildId,
            projectId: originalChild.projectId,
            header: originalChild.header,
            title: originalChild.title,
            description: originalChild.description,
            requirements: originalChild.requirements,
            phase: originalChild.phase,
            status: originalChild.status,
            startDate: originalChild.startDate,
            endDate: originalChild.endDate,
            parentKeyStepId: newKeyStepId, // Point to the new parent
          });
        }
      }

      console.log(`✅ Key step cloned: ${id} -> ${newKeyStepId}`);
      res.json({
        success: true,
        newKeyStepId,
        message: `Key step cloned successfully as "${newTitle || `${originalKeyStep.title} (Copy)`}"`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Key step clone error:", errorMessage);
      res.status(500).json({ error: "Clone failed", details: errorMessage });
    }
  });

  /* ===============================
      KEY STEP TEMPLATES (Consolidated)
  ================================ */

  // Get raw list of all templates (legacy/basic)
  app.get("/api/keystep-templates", requireAuth, async (req, res) => {
    try {
      const templates = await db.select().from(keyStepTemplates).orderBy(desc(keyStepTemplates.createdAt));
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Get full template list with task/subtask counts (richer metadata)
  // MUST be before /:id wildcard
  app.get("/api/keystep-templates/list-full", requireAuth, async (_req, res) => {
    try {
      const templates = await db.select().from(keyStepTemplates).orderBy(desc(keyStepTemplates.createdAt));
      const result = templates.map(t => {
        let parsed: any = null;
        try { parsed = t.description ? JSON.parse(t.description) : null; } catch { /* plain text */ }
        return {
          id: t.id,
          name: t.name,
          createdAt: t.createdAt,
          sourceProjectName: parsed?.sourceProjectName || "",
          keystepTitle: parsed?.keystep?.title || t.name,
          taskCount: parsed?.tasks?.length ?? 0,
          subtaskCount: parsed?.tasks?.reduce((acc: number, tk: any) => acc + (tk.subtasks?.length ?? 0), 0) ?? 0,
          hasFullData: !!parsed?.tasks,
        };
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Save a single KeyStep (with all its tasks & subtasks) as a rich template
  app.post("/api/keystep-templates/from-keystep", requireAuth, async (req: any, res) => {
    try {
      const { keyStepId, templateName, sourceProjectName } = req.body;
      if (!keyStepId || !templateName) {
        return res.status(400).json({ error: "keyStepId and templateName are required" });
      }

      // 1. Fetch the source KeyStep
      const [ks] = await db.select().from(keySteps).where(eq(keySteps.id, keyStepId));
      if (!ks) return res.status(404).json({ error: "KeyStep not found" });

      // 2. Fetch all tasks linked to this KeyStep
      const tasks = await db.select().from(projectTasks).where(eq(projectTasks.keyStepId, keyStepId));

      // 3. Fetch subtasks for each task
      const taskIds = tasks.map(t => t.id);
      let allSubtasks: any[] = [];
      if (taskIds.length > 0) {
        allSubtasks = await db.select().from(subtasks).where(inArray(subtasks.taskId, taskIds));
      }

      // 4. Build rich hierarchy payload stored as JSON in description
      const templateData = {
        keystep: {
          title: ks.title,
          header: ks.header || "",
          description: ks.description || "",
          requirements: ks.requirements || "",
          phase: ks.phase,
        },
        tasks: tasks.map((t, idx) => ({
          sortOrder: idx,
          taskName: t.taskName,
          description: t.description || "",
          status: t.status || "pending",
          priority: t.priority || "medium",
          subtasks: allSubtasks
            .filter(st => st.taskId === t.id)
            .map((st, sidx) => ({
              sortOrder: sidx,
              title: st.title,
              description: st.description || "",
            })),
        })),
        sourceProjectName: sourceProjectName || "",
        savedAt: new Date().toISOString(),
      };

      // 5. Check if template name already exists to avoid unique constraint error
      const [existing] = await db.select().from(keyStepTemplates).where(eq(keyStepTemplates.name, templateName.trim()));
      if (existing) {
        return res.status(400).json({ error: `A template named "${templateName}" already exists. Please use a unique name.` });
      }

      // 6. Create template record — store JSON in description field
      const [template] = await db.insert(keyStepTemplates).values({
        name: templateName.trim(),
        description: JSON.stringify(templateData),
      }).returning();

      // 6. Also insert the root keystep as the single template item (for backward compat)
      await db.insert(keyStepTemplateItems).values({
        templateId: template.id,
        header: ks.header || "",
        title: ks.title,
        description: ks.description || "",
        requirements: ks.requirements || "",
        phase: ks.phase,
      });

      console.log(`✅ Rich template saved: ${template.id} from KeyStep ${keyStepId}`);
      res.status(201).json({
        ...template,
        taskCount: tasks.length,
        subtaskCount: allSubtasks.length,
      });
    } catch (err) {
      const errorMsg = `[TEMPLATES-ERROR] Failed to save rich template: ${err}\n${new Error().stack}\n`;
      console.error(errorMsg);
      try { fs.appendFileSync("error.log", errorMsg); } catch { /* ignore */ }
      res.status(500).json({ error: "Failed to save template", details: String(err) });
    }
  });

  // Basic POST (legacy)
  app.post("/api/keystep-templates", requireAuth, async (req, res) => {
    try {
      const { name, description, items } = req.body;
      const [template] = await db.insert(keyStepTemplates).values({ name, description }).returning();

      if (Array.isArray(items) && items.length > 0) {
        const itemValues = items.map(it => ({
          templateId: template.id,
          header: it.header || "",
          title: it.title,
          description: it.description || "",
          requirements: it.requirements || "",
          phase: Number(it.phase) || 1
        }));
        await db.insert(keyStepTemplateItems).values(itemValues);
      }

      res.status(201).json(template);
    } catch (err) {
      console.error("Failed to create template:", err);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // Get single template by ID (wildcard — MUST be after all specific routes)
  app.get("/api/keystep-templates/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const [template] = await db.select().from(keyStepTemplates).where(eq(keyStepTemplates.id, id));
      if (!template) return res.status(404).json({ error: "Template not found" });
      const items = await db.select().from(keyStepTemplateItems).where(eq(keyStepTemplateItems.templateId, id));
      res.json({ ...template, items });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  // Delete a template
  app.delete("/api/keystep-templates/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(keyStepTemplateItems).where(eq(keyStepTemplateItems.templateId, id));
      await db.delete(keyStepTemplates).where(eq(keyStepTemplates.id, id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // Apply a full rich template to a project (deep clone KeyStep + Tasks + Subtasks)
  app.post("/api/keystep-templates/:templateId/apply-full", requireAuth, async (req: any, res) => {
    try {
      const { templateId } = req.params;
      const { projectId, assignerId } = req.body;
      if (!projectId) return res.status(400).json({ error: "projectId is required" });

      const finalAssignerId = assignerId || req.employee?.id || null;

      // 1. Load template
      const [template] = await db.select().from(keyStepTemplates).where(eq(keyStepTemplates.id, templateId));
      if (!template) return res.status(404).json({ error: "Template not found" });

      let templateData: any = null;
      try { templateData = template.description ? JSON.parse(template.description) : null; } catch { /* not JSON */ }

      if (!templateData?.keystep) {
        // Fallback: apply the old-style template (keystep items only, no tasks)
        const items = await db.select().from(keyStepTemplateItems).where(eq(keyStepTemplateItems.templateId, templateId)).orderBy(keyStepTemplateItems.phase);
        if (items.length === 0) return res.status(400).json({ error: "No data in template" });
        const inserted = await db.insert(keySteps).values(items.map(it => ({
          projectId,
          header: it.header || "",
          title: it.title,
          description: it.description || "",
          requirements: it.requirements || "",
          phase: it.phase,
          status: "pending",
          progress: 0,
        }))).returning();
        return res.status(201).json({ keystep: inserted[0], tasks: [], subtasks: [] });
      }

      // 2. Create the new KeyStep
      const ksData = templateData.keystep;
      const today = new Date().toISOString().split("T")[0];
      const [newKs] = await db.insert(keySteps).values({
        projectId,
        header: ksData.header || "",
        title: ksData.title,
        description: ksData.description || "",
        requirements: ksData.requirements || "",
        phase: ksData.phase || 1,
        status: "pending",
        progress: 0,
        startDate: today,
        endDate: today,
      }).returning();

      // 3. Clone tasks & subtasks
      const createdTasks: any[] = [];
      const createdSubtasks: any[] = [];

      const taskList: any[] = templateData.tasks || [];
      // Sort by sortOrder to preserve sequence
      taskList.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      for (const taskTpl of taskList) {
        if (!taskTpl.taskName) continue;
        const [newTask] = await db.insert(projectTasks).values({
          projectId,
          keyStepId: newKs.id,
          taskName: taskTpl.taskName,
          description: taskTpl.description || null,
          status: "pending",
          priority: taskTpl.priority || "medium",
          startDate: today,
          endDate: today,
          assignerId: finalAssignerId,
          progress: 0,
        } as any).returning();
        createdTasks.push(newTask);

        // 4. Clone subtasks
        const subtaskList: any[] = taskTpl.subtasks || [];
        subtaskList.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        for (const stTpl of subtaskList) {
          if (!stTpl.title) continue;
          const [newSt] = await db.insert(subtasks).values({
            taskId: newTask.id,
            title: stTpl.title,
            description: stTpl.description || "",
            isCompleted: false,
            progress: 0,
          }).returning();
          createdSubtasks.push(newSt);
        }
      }

      console.log(`✅ Applied template ${templateId}: created 1 keystep, ${createdTasks.length} tasks, ${createdSubtasks.length} subtasks`);
      res.status(201).json({
        keystep: newKs,
        tasks: createdTasks,
        subtasks: createdSubtasks,
      });
    } catch (err) {
      console.error("Failed to apply full template:", err);
      res.status(500).json({ error: "Failed to apply template", details: String(err) });
    }
  });

  // Legacy apply route (kept for backward compat)
  app.post("/api/projects/:projectId/key-steps/apply-template", requireAuth, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const { templateId } = req.body;

      const templateItems = await db
        .select()
        .from(keyStepTemplateItems)
        .where(eq(keyStepTemplateItems.templateId, templateId))
        .orderBy(keyStepTemplateItems.phase);

      if (templateItems.length === 0) {
        return res.status(400).json({ error: "No items found in template" });
      }

      const keyStepsToInsert = templateItems.map(item => ({
        projectId,
        header: item.header || "",
        title: item.title,
        description: item.description || "",
        requirements: item.requirements || "",
        phase: item.phase,
        status: "pending",
        progress: 0,
      }));

      const inserted = await db.insert(keySteps).values(keyStepsToInsert).returning();

      res.status(201).json(inserted);
    } catch (err) {
      console.error("Failed to apply KeyStep template:", err);
      res.status(500).json({ error: "Failed to apply template" });
    }
  });




  // Delete a keystep template
  app.delete("/api/keystep-templates/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(keyStepTemplateItems).where(eq(keyStepTemplateItems.templateId, id));
      await db.delete(keyStepTemplates).where(eq(keyStepTemplates.id, id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  /* ===============================
      TASKS
================================ */

  // CREATE TASK
  app.post("/api/tasks", requireAuth, async (req: any, res) => {
    try {
      const {
        projectId,
        keyStepId,
        taskName,
        description,
        status,
        priority,
        startDate,
        endDate,
        assignerId,
        taskOwnerId,
        isAddon,
        isIssue,
        taskMembers: memberList = [],
        subtasks: incomingSubtasks = [],
        tagIds: incomingTagIds = [],
      } = req.body;

      // assignerId is optional; default to the authenticated employee if available
      const finalAssignerId = assignerId || req.employee?.id || null;

      // Validate using validator
      const validationErrors = DataValidator.validateTask({
        projectId,
        taskName,
        assignerId: finalAssignerId,
        status,
        priority,
        startDate,
        endDate,
        taskMembers: memberList,
        subtasks: incomingSubtasks,
      });

      if (validationErrors.length > 0) {
        console.warn("❌ Task validation failed:", validationErrors);
        return res.status(400).json({
          error: "Validation failed",
          details: validationErrors,
        });
      }

      if (!projectId || !taskName) {
        return res.status(400).json({
          error: "Validation failed",
          details: [
            { field: "projectId", message: "Project ID is required" },
            { field: "taskName", message: "Task name is required" },
          ]
        });
      }

      // Format dates if provided
      let formattedStartDate = null;
      let formattedEndDate = null;

      if (startDate) {
        formattedStartDate = DataValidator.formatDate(startDate);
        if (!formattedStartDate) {
          return res.status(400).json({
            error: "Invalid start date format",
            details: [{ field: "startDate", message: `Cannot parse date: ${startDate}` }],
          });
        }
      }

      if (endDate) {
        formattedEndDate = DataValidator.formatDate(endDate);
        if (!formattedEndDate) {
          return res.status(400).json({
            error: "Invalid end date format",
            details: [{ field: "endDate", message: `Cannot parse date: ${endDate}` }],
          });
        }
      }

      debug("✅ Task validation passed, creating task:", { projectId, taskName });

      // ----- Duration (Number of Days) on creation -----
      // Mirrors the auto-calc added to PATCH /api/tasks/:id: if the caller
      // sent an explicit durationDays, use it (and derive End Date from it
      // when only Start Date was given). Otherwise, if both Start and End
      // Date were provided, derive Duration from them so it's never blank
      // on a freshly created task.
      let computedDurationDays: number | null = null;
      const incomingDurationDays = req.body.durationDays;
      if (typeof incomingDurationDays !== 'undefined' && incomingDurationDays !== null && incomingDurationDays !== '') {
        const durationNum = Number(incomingDurationDays);
        if (!isNaN(durationNum)) {
          computedDurationDays = durationNum;
          if (formattedStartDate && !formattedEndDate) {
            const startD = new Date(formattedStartDate);
            if (!isNaN(startD.getTime())) {
              const newEnd = new Date(startD);
              newEnd.setDate(newEnd.getDate() + durationNum);
              formattedEndDate = newEnd.toISOString().split('T')[0];
            }
          }
        }
      } else if (formattedStartDate && formattedEndDate) {
        const sD = new Date(formattedStartDate);
        const eD = new Date(formattedEndDate);
        if (!isNaN(sD.getTime()) && !isNaN(eD.getTime())) {
          const diffDays = Math.round((eD.getTime() - sD.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0) {
            computedDurationDays = diffDays;
          }
        }
      }

      // Insert task
      const [task] = await db
        .insert(projectTasks)
        .values({
          projectId,
          keyStepId: keyStepId || null,
          taskName,
          description: description || null,
          status: status || "pending",
          priority: priority || "medium",
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          durationDays: computedDurationDays,
          assignerId: finalAssignerId,
          taskOwnerId: taskOwnerId || finalAssignerId || null,
          taskPeriod: req.body.taskPeriod || "custom",
          reminderFrequency: req.body.reminderFrequency || "1 Time",
          ticketId: req.body.ticketId || null,
          isAddon: typeof isAddon !== 'undefined' ? (isAddon === true || isAddon === 'true') : undefined,
          isIssue: typeof isIssue !== 'undefined' ? (isIssue === true || isIssue === 'true') : undefined,
        } as any)
        .returning();

      debug("✅ Task created:", task.id);

      // Insert tags
      if (Array.isArray(incomingTagIds) && incomingTagIds.length > 0) {
        await storageHelper.assignTagsToTask(task.id, incomingTagIds);
        debug("✅ Task tags inserted:", incomingTagIds.length);
      }

      // Insert members
      if (Array.isArray(memberList) && memberList.length > 0) {
        await db.insert(taskMembers).values(
          memberList.map((empId: string) => ({
            taskId: task.id,
            employeeId: empId,
          })),
        );
        debug("✅ Task members inserted:", memberList.length);
      }

      // Insert subtasks (if provided)
      if (Array.isArray(incomingSubtasks) && incomingSubtasks.length > 0) {
        const rows = incomingSubtasks.map((st: any) => ({
          taskId: task.id,
          title: st.title || null,
          description: st.description || "",
          isCompleted: !!st.isCompleted,
          assignedTo: Array.isArray(st.assignedTo) && st.assignedTo.length > 0
            ? st.assignedTo[0]
            : (typeof st.assignedTo === 'string' ? st.assignedTo : null),
          taskOwnerId: st.taskOwnerId || null,
          priority: st.priority || "medium",
          status: st.status || (st.isCompleted ? "Completed" : "Not Started"),
          ccMembers: Array.isArray(st.ccMembers) ? st.ccMembers : [],
        }));

        debug("Inserting subtasks:", rows.length);
        const inserted = await db.insert(subtasks).values(rows).returning();

        // If there are subtask members provided as arrays, insert into subtask_members mapping
        try {
          const memberInserts: any[] = [];
          inserted.forEach((ins: any, idx: number) => {
            const incoming = incomingSubtasks[idx];
            if (Array.isArray(incoming.assignedTo) && incoming.assignedTo.length > 0) {
              incoming.assignedTo.forEach((empId: string) =>
                memberInserts.push({ subtaskId: ins.id, employeeId: empId })
              );
            }
          });
          if (memberInserts.length > 0) {
            await db.insert(subtaskMembers).values(memberInserts);
            debug("✅ Subtask members inserted:", memberInserts.length);
          }
        } catch (err) {
          console.warn("Failed to insert subtask_members mapping:", err);
        }

        debug("✅ Subtasks inserted:", inserted.length);
      }

      debug("✅ Task created successfully with all related data");

      // --- EMAIL NOTIFICATION LOGIC (ASYNC - don't block response) ---
      // Queue notifications without awaiting to improve response time
      (async () => {
        try {
          const assigner = await storageHelper.getEmployee(finalAssignerId);
          const project = await storageHelper.getProject(projectId);

          if (Array.isArray(memberList) && memberList.length > 0) {
            for (const empId of memberList) {
              const employee = await storageHelper.getEmployee(empId);
              if (employee && employee.email) {
                const [userRow] = await db.select().from(users).where(eq(users.employeeId, empId));
                const role = userRow?.role || 'EMPLOYEE';

                await sendTaskAssignmentEmail(
                  employee.email,
                  {
                    name: employee.name,
                    code: employee.empCode || 'N/A',
                    project: project?.title || 'Unknown Project',
                    assigner: assigner?.name || 'Admin',
                    dueDate: formattedEndDate || 'Not Set',
                  },
                  {
                    name: taskName,
                    priority: priority || 'medium',
                    startDate: formattedStartDate || 'N/A',
                    endDate: formattedEndDate || 'N/A',
                    status: status || 'pending',
                  },
                  role.toLowerCase() as any
                );
              }
            }
          }

          // --- SUBTASK EMAIL NOTIFICATIONS ---
          if (Array.isArray(incomingSubtasks) && incomingSubtasks.length > 0) {
            for (const st of incomingSubtasks) {
              const stMembers = Array.isArray(st.assignedTo)
                ? st.assignedTo
                : (typeof st.assignedTo === 'string' ? [st.assignedTo] : []);

              if (stMembers.length > 0) {
                for (const empId of stMembers) {
                  const employee = await storageHelper.getEmployee(empId);
                  if (employee && employee.email) {
                    const [userRow] = await db.select().from(users).where(eq(users.employeeId, empId));
                    const role = userRow?.role || 'EMPLOYEE';

                    await sendSubtaskAssignmentEmail(
                      employee.email,
                      {
                        name: employee.name,
                        code: employee.empCode || 'N/A',
                        project: project?.title || 'Unknown Project',
                        assigner: assigner?.name || 'Admin',
                        dueDate: st.endDate || 'Not Set',
                      },
                      {
                        name: st.title,
                        priority: priority || 'medium',
                        startDate: st.startDate || 'N/A',
                        endDate: st.endDate || 'N/A',
                        status: 'pending',
                        parentTaskName: taskName
                      },
                      role.toLowerCase() as any
                    );
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn("[POST /api/tasks] Async notification failure:", err);
        }
      })();

      res.json(task);

      // Trigger progress recalculation for the parent keystep/project
      // and for the task itself if it has subtasks
      if (Array.isArray(incomingSubtasks) && incomingSubtasks.length > 0) {
        // We pick one subtask ID to trigger the updateParentProgress chain
        const [firstSub] = await db.select().from(subtasks).where(eq(subtasks.taskId, task.id)).limit(1);
        if (firstSub) {
          await updateParentProgress('subtask', firstSub.id, req.user?.id);
        }
      } else {
        await updateParentProgress('task', task.id, req.user?.id);
      }

      // Cascade timeline rollup: Task dates -> Key Step -> Project
      if (task.keyStepId || task.projectId) {
        updateParentTimeline('task', task.id).catch((err) => {
          console.error("[POST /api/tasks] Background timeline update failed:", err);
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("❌ Task creation failed:", errorMessage);
      console.error("❌ Full error:", err);
      res.status(500).json({
        error: "Task creation failed",
        message: errorMessage
      });
    }
  });

  // UPDATE TASK
  app.put("/api/tasks/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Fetch current members to identify newly added ones later
      const oldMemberIds = await storageHelper.getTaskMembers(id);

      const {
        taskName,
        description,
        status,
        priority,
        startDate,
        endDate,
        assignerId,
        keyStepId,
        taskOwnerId,
        isAddon,
        isIssue,
        completionDate,
        taskMembers: memberList = [],
        subtasks: incomingSubtasks = [],
        tagIds: incomingTagIds = undefined,
      } = req.body;

      // If assignerId is omitted, default to authenticated employee (if any)
      const finalAssignerId = typeof assignerId !== 'undefined' ? assignerId : req.employee?.id || null;

      // Temporary debug logs to inspect incoming payload and behavior
      console.log("[PUT /api/tasks/:id] incoming body:", JSON.stringify(req.body));

      // Format dates if provided
      const formatDate = (date: any) => {
        if (!date) return undefined;
        const d = new Date(date);
        return d.toISOString().split('T')[0];
      };

      const isCompleted = status === "Completed" || status === "completed";

      // Fetch current task state for timestamp logic
      const [oldTask] = await db.select().from(projectTasks).where(eq(projectTasks.id, id)).limit(1);

      // Auto-calculate performance points when task is completed
      let autoPerformancePoints: number | undefined = undefined;
      if (isCompleted && (!oldTask?.status || (oldTask.status !== 'Completed' && oldTask.status !== 'completed'))) {
        const now = new Date();
        const dueDate = endDate ? new Date(endDate) : (oldTask?.endDate ? new Date(oldTask.endDate) : null);
        const gracePeriodDays = oldTask?.gracePeriodDays ?? 2;
        if (dueDate) {
          const diffMs = now.getTime() - dueDate.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays < 0) autoPerformancePoints = 5;          // before due
          else if (diffDays < 1) autoPerformancePoints = 4;     // on due date
          else if (diffDays <= gracePeriodDays) autoPerformancePoints = 3; // within grace
          else if (diffDays <= 7) autoPerformancePoints = 2;    // up to 1 week late
          else autoPerformancePoints = 1;                       // more than 1 week late
        } else {
          autoPerformancePoints = 3; // no due date set, neutral
        }
      }

      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";

      // Work out completedAt: prefer an explicitly supplied completion date (e.g. from
      // the "Completion Date" field on the edit form). If none was supplied and the task
      // is only just now transitioning to completed, use "now". If it was already
      // completed, preserve the existing completedAt so it doesn't get reset on
      // unrelated edits. This ensures a task marked completed always has a completion
      // date recorded, even if its progress was left at 0.
      let resolvedCompletedAt: Date | null = null;
      if (isCompleted) {
        if (completionDate) {
          const parsedDate = new Date(completionDate);
          resolvedCompletedAt = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        } else if (oldTask?.status === 'Completed' || oldTask?.status === 'completed') {
          resolvedCompletedAt = oldTask?.completedAt || new Date();
        } else {
          resolvedCompletedAt = new Date();
        }
      }

      const updateData: any = {
        taskName,
        description: description || null,
        status: status || "pending",
        priority: priority || "medium",
        assignerId: finalAssignerId,
        updatedAt: new Date(),
        completedAt: resolvedCompletedAt,
        completionDate: isCompleted ? resolvedCompletedAt : (completionDate || null),
        progress: isCompleted ? 100 : (typeof req.body.progress !== 'undefined' ? Number(req.body.progress) : undefined),
      };
      if (typeof taskOwnerId !== 'undefined') updateData.taskOwnerId = taskOwnerId || null;
      if (autoPerformancePoints !== undefined) updateData.performancePoints = autoPerformancePoints;
      // Admin-only manual override for performancePoints
      if (isAdmin && typeof req.body.performancePoints !== 'undefined') {
        updateData.performancePoints = Number(req.body.performancePoints);
      }

      // Persist milestone (key step) changes when provided
      if (typeof keyStepId !== "undefined") {
        updateData.keyStepId = keyStepId || null;
      }

      if (typeof isAddon !== 'undefined') {
        updateData.isAddon = isAddon === true || isAddon === 'true';
      }
      if (typeof isIssue !== 'undefined') {
        updateData.isIssue = isIssue === true || isIssue === 'true';
      }

      if (typeof req.body.parentTaskId !== 'undefined') {
        updateData.parentTaskId = req.body.parentTaskId || null;
      }

      console.log("[PUT /api/tasks/:id] computed updateData:", JSON.stringify(updateData));

      if (startDate) updateData.startDate = formatDate(startDate);
      if (endDate) updateData.endDate = formatDate(endDate);
      if (typeof req.body.taskPeriod !== "undefined") updateData.taskPeriod = req.body.taskPeriod;
      if (typeof req.body.reminderFrequency !== "undefined") updateData.reminderFrequency = req.body.reminderFrequency;

      const [updated] = await db
        .update(projectTasks)
        .set(updateData)
        .where(eq(projectTasks.id, id))
        .returning();

      // NOTE: Progress update moved to after subtasks are handled below
      // so it considers newly added subtasks if any.
      /*
      if (updated) {
        await updateParentProgress('task', id, req.user?.id);
      }
      */

      console.log("[PUT /api/tasks/:id] db returned:", JSON.stringify(updated));

      if (!updated) return res.status(404).json({ message: "Task not found" });

      // --- Task Dependency & Automatic Schedule Management (new, additive) ---
      try {
        const oldDuration = oldTask?.durationDays ?? null;
        const newDuration = typeof updated.durationDays !== 'undefined' ? updated.durationDays : oldDuration;
        await dependencyService.recordManualChangeAndCascade(
          id,
          updated.projectId,
          { startDate: oldTask?.startDate ?? null, endDate: oldTask?.endDate ?? null, duration: oldDuration },
          { startDate: updated.startDate ?? null, endDate: updated.endDate ?? null, duration: newDuration },
          {
            reason: req.body.scheduleChangeReason || req.body.reasonCategory || "Not specified",
            changedBy: req.employee?.id || null,
          }
        );
      } catch (depErr) {
        console.warn("[Dependency] schedule history/cascade skipped:", depErr instanceof Error ? depErr.message : depErr);
      }

      // Update task members (for PUT, we replace the entire member list as it's a full update).
      // Previously this tried to detect an "append" vs "replace" by diffing
      // against existing rows, which could double-insert the same employeeId
      // (task_members has no unique constraint on task_id+employee_id) and
      // produce duplicate assignee tiles in the UI. Always de-duplicating and
      // fully replacing is simpler and guarantees no duplicates.
      const uniquePutMemberIds = Array.from(
        new Set((Array.isArray(memberList) ? memberList : []).filter(Boolean).map((v: any) => String(v)))
      );
      await db.delete(taskMembers).where(eq(taskMembers.taskId, id));
      if (uniquePutMemberIds.length > 0) {
        const memberInserts = uniquePutMemberIds.map((empId: string) => ({
          taskId: id,
          employeeId: empId,
        }));
        await db.insert(taskMembers).values(memberInserts);
        console.log(`[Task Members PUT] Replaced members for task ${id} with ${uniquePutMemberIds.length} member(s)`);
      } else {
        console.log(`[Task Members PUT] Cleared all members for task ${id}`);
      }

      // Update task tags if provided
      if (typeof incomingTagIds !== 'undefined' && Array.isArray(incomingTagIds)) {
        await db.delete(taskTags).where(eq(taskTags.taskId, id));
        await storageHelper.assignTagsToTask(id, incomingTagIds);
      }
      // Update subtasks: remove existing and insert incoming ones
      await db.delete(subtasks).where(eq(subtasks.taskId, id));
      if (Array.isArray(incomingSubtasks) && incomingSubtasks.length > 0) {
        const rows = incomingSubtasks.map((st: any) => ({
          taskId: id,
          title: st.title || null,
          description: st.description || "",
          isCompleted: !!st.isCompleted,
          assignedTo: Array.isArray(st.assignedTo) && st.assignedTo.length > 0 ? st.assignedTo[0] : (typeof st.assignedTo === 'string' ? st.assignedTo : null),
          startDate: st.startDate || null,
          endDate: st.endDate || null,
          taskOwnerId: st.taskOwnerId || null,
          priority: st.priority || "medium",
          status: st.status || (st.isCompleted ? "Completed" : "Not Started"),
          ccMembers: Array.isArray(st.ccMembers) ? st.ccMembers : [],
        }));
        console.log("Updating subtasks:", rows);
        const inserted = await db.insert(subtasks).values(rows).returning();

        // persist subtask members mapping
        try {
          const memberInserts: any[] = [];
          inserted.forEach((ins: any, idx: number) => {
            const incoming = incomingSubtasks[idx];
            if (Array.isArray(incoming.assignedTo) && incoming.assignedTo.length > 0) {
              incoming.assignedTo.forEach((empId: string) => memberInserts.push({ subtaskId: ins.id, employeeId: empId }));
            }
          });
          if (memberInserts.length > 0) {
            await db.insert(subtaskMembers).values(memberInserts);
          }
        } catch (err) {
          console.warn("Failed to insert subtask_members mapping:", err);
        }

        console.log("✅ Subtasks inserted:", inserted.length);

        // After subtasks are updated, recalculate task progress and status
        if (inserted.length > 0) {
          await updateParentProgress('subtask', inserted[0].id, req.user?.id);
        }
      } else {
        // If no subtasks, still trigger task-level update to keyStep/project
        await updateParentProgress('task', id, req.user?.id);
      }

      try {
        const assigner = await storageHelper.getEmployee(finalAssignerId);
        const project = await storageHelper.getProject(updateData.projectId || updated.projectId);

        // Identify newly added members
        const newMembers = (memberList || []).filter((id: string) => !oldMemberIds.includes(id));

        if (newMembers.length > 0) {

          for (const empId of newMembers) {
            const employee = await storageHelper.getEmployee(empId);
            if (employee && employee.email) {
              const [userRow] = await db.select().from(users).where(eq(users.employeeId, empId));
              const role = userRow?.role || 'EMPLOYEE';

              await sendTaskAssignmentEmail(
                employee.email,
                {
                  name: employee.name,
                  code: employee.empCode || 'N/A',
                  project: project?.title || 'Unknown Project',
                  assigner: assigner?.name || 'Admin',
                  dueDate: updateData.endDate || 'Not Set',
                },
                {
                  name: taskName,
                  priority: updateData.priority || 'medium',
                  startDate: updateData.startDate || 'N/A',
                  endDate: updateData.endDate || 'N/A',
                  status: updateData.status || 'pending',
                },
                role.toLowerCase() as any
              );
            }
          }
        }

        // --- SUBTASK EMAIL NOTIFICATIONS ---
        if (Array.isArray(incomingSubtasks) && incomingSubtasks.length > 0) {
          for (const st of incomingSubtasks) {
            const stMembers = Array.isArray(st.assignedTo)
              ? st.assignedTo
              : (typeof st.assignedTo === 'string' ? [st.assignedTo] : []);

            if (stMembers.length > 0) {
              for (const empId of stMembers) {
                const employee = await storageHelper.getEmployee(empId);
                if (employee && employee.email) {
                  const [userRow] = await db.select().from(users).where(eq(users.employeeId, empId));
                  const role = userRow?.role || 'EMPLOYEE';

                  await sendSubtaskAssignmentEmail(
                    employee.email,
                    {
                      name: employee.name,
                      code: employee.empCode || 'N/A',
                      project: project?.title || 'Unknown Project',
                      assigner: assigner?.name || 'Admin',
                      dueDate: st.endDate || 'Not Set',
                    },
                    {
                      name: st.title,
                      priority: updateData.priority || 'medium',
                      startDate: st.startDate || 'N/A',
                      endDate: st.endDate || 'N/A',
                      status: 'pending',
                      parentTaskName: taskName || updated.taskName
                    },
                    role.toLowerCase() as any
                  );
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("[PUT /api/tasks/:id] Notification failure:", err);
      }

      res.json(updated);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Task update error:", errorMessage);
      console.error("Full error:", err);
      res.status(500).json({ message: "Task update failed", details: errorMessage });
    }
  });

  // PATCH TASK (partial update)
  app.patch("/api/tasks/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const data = req.body;

      // Snapshot prior schedule so a dependency cascade + history entry can
      // be recorded if this request changes Start/End/Duration.
      const [scheduleSnapshot] = await db
        .select({ startDate: projectTasks.startDate, endDate: projectTasks.endDate, durationDays: projectTasks.durationDays, projectId: projectTasks.projectId })
        .from(projectTasks)
        .where(eq(projectTasks.id, id))
        .limit(1);

      const updateData: any = {};
      if (typeof data.taskName !== 'undefined') updateData.taskName = data.taskName;
      if (typeof data.description !== 'undefined') updateData.description = data.description || null;
      // Track whether this request is explicitly marking the task completed via the
      // "isCompleted" checkbox/flag rather than (or in addition to) the status field.
      const explicitIsCompleted = typeof data.isCompleted !== 'undefined' ? Boolean(data.isCompleted) : undefined;
      if (typeof data.status !== 'undefined' || typeof explicitIsCompleted !== 'undefined') {
        // Get current task state for timestamp logic
        const [oldTask] = await db.select().from(projectTasks).where(eq(projectTasks.id, id)).limit(1);
        const wasCompleted = oldTask?.status === 'Completed' || oldTask?.status === 'completed';

        // Determine the resulting status. If a status was explicitly provided, use it.
        // Otherwise, if only the completed flag was toggled, derive the status from it
        // (falling back to the task's previous status when un-completing).
        if (typeof data.status !== 'undefined') {
          updateData.status = data.status || "pending";
        } else if (explicitIsCompleted === true) {
          updateData.status = "Completed";
        } else if (explicitIsCompleted === false) {
          updateData.status = wasCompleted ? "pending" : (oldTask?.status || "pending");
        }

        const isCompleted = explicitIsCompleted === true || updateData.status === "Completed" || updateData.status === "completed";
        const isUncompleting = explicitIsCompleted === false || (typeof updateData.status !== 'undefined' && updateData.status !== "Completed" && updateData.status !== "completed");

        if (isCompleted) {
          // Marking as completed: progress should always read 100%, even if it was 0.
          updateData.progress = 100;

          // Prefer an explicitly supplied completion date (e.g. from the edit form's
          // "Completion Date" field). If none is supplied, and the task is only just
          // now transitioning to completed, use "now" as the completion date. If the
          // task was already completed, preserve its existing completedAt so it isn't
          // overwritten on unrelated edits.
          if (data.completionDate) {
            const parsedDate = new Date(data.completionDate);
            updateData.completedAt = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
          } else if (!wasCompleted) {
            updateData.completedAt = new Date();
          } else {
            updateData.completedAt = oldTask?.completedAt || new Date();
          }
        } else if (isUncompleting) {
          updateData.completedAt = null;
        }
      }
      if (typeof data.priority !== 'undefined') updateData.priority = data.priority || "medium";
      if (typeof data.assignerId !== 'undefined') updateData.assignerId = data.assignerId || null;
      if (typeof data.projectId !== 'undefined') updateData.projectId = data.projectId || null;
      if (typeof data.parentTaskId !== 'undefined') updateData.parentTaskId = data.parentTaskId || null;
      if (typeof data.startDate !== 'undefined') updateData.startDate = data.startDate || null;
      if (typeof data.endDate !== 'undefined') updateData.endDate = data.endDate || null;

      // ----- Duration (Number of Days) column -----
      // When durationDays is provided, recompute endDate = startDate + durationDays.
      // When only startDate changes (durationDays not sent this request) but the task
      // already has a saved durationDays, recompute endDate too so it stays in sync.
      if (typeof data.durationDays !== 'undefined') {
        const durationVal = data.durationDays === null || data.durationDays === ''
          ? null
          : Number(data.durationDays);
        updateData.durationDays = (durationVal === null || isNaN(durationVal)) ? null : durationVal;

        if (updateData.durationDays !== null) {
          let baseStart: string | null = updateData.startDate ?? null;
          if (!baseStart) {
            const [existing] = await db.select({ startDate: projectTasks.startDate }).from(projectTasks).where(eq(projectTasks.id, id)).limit(1);
            baseStart = existing?.startDate ?? null;
          }
          if (baseStart) {
            const startD = new Date(baseStart);
            if (!isNaN(startD.getTime())) {
              const newEnd = new Date(startD);
              newEnd.setDate(newEnd.getDate() + updateData.durationDays);
              updateData.endDate = newEnd.toISOString().split('T')[0];
            }
          }
        }
      } else if (typeof updateData.startDate !== 'undefined' && updateData.startDate && typeof data.endDate === 'undefined') {
        // Only auto-derive endDate from the task's saved duration when the
        // caller sent startDate WITHOUT an explicit endDate. If endDate was
        // sent explicitly (e.g. by a dependency cascade or a date-range
        // edit), it must never be silently overwritten here.
        const [existing] = await db.select({ durationDays: projectTasks.durationDays }).from(projectTasks).where(eq(projectTasks.id, id)).limit(1);
        if (typeof existing?.durationDays === 'number') {
          const startD = new Date(updateData.startDate);
          if (!isNaN(startD.getTime())) {
            const newEnd = new Date(startD);
            newEnd.setDate(newEnd.getDate() + existing.durationDays);
            updateData.endDate = newEnd.toISOString().split('T')[0];
          }
        }
      }

      // ----- Duration (Number of Days): auto-calc from Start/End Date -----
      // The two blocks above only handle Duration -> End Date (and startDate
      // deriving endDate from a previously-saved duration). They never
      // recompute Duration itself when the user edits Start Date or End
      // Date directly, which left the Duration column stale/out of sync.
      // Fix: whenever Start or End Date changes in this request (and the
      // caller isn't already explicitly setting durationDays), recompute
      // durationDays = End Date - Start Date so it's always self-consistent.
      if (
        typeof data.durationDays === 'undefined' &&
        (typeof data.startDate !== 'undefined' || typeof data.endDate !== 'undefined')
      ) {
        const effectiveStart: string | null =
          typeof updateData.startDate !== 'undefined' ? updateData.startDate : (scheduleSnapshot?.startDate ?? null);
        const effectiveEnd: string | null =
          typeof updateData.endDate !== 'undefined' ? updateData.endDate : (scheduleSnapshot?.endDate ?? null);

        if (effectiveStart && effectiveEnd) {
          const sD = new Date(effectiveStart);
          const eD = new Date(effectiveEnd);
          if (!isNaN(sD.getTime()) && !isNaN(eD.getTime())) {
            const diffDays = Math.round((eD.getTime() - sD.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0) {
              updateData.durationDays = diffDays;
            }
          }
        }
      }

      if (typeof data.keyStepId !== 'undefined') updateData.keyStepId = data.keyStepId || null;
      if (typeof data.taskOwnerId !== 'undefined') updateData.taskOwnerId = data.taskOwnerId || null;
      if (typeof data.progress !== 'undefined' && typeof updateData.progress === 'undefined') updateData.progress = Number(data.progress);
      if (typeof data.isAddon !== 'undefined') updateData.isAddon = Boolean(data.isAddon);
      if (typeof data.isIssue !== 'undefined') updateData.isIssue = Boolean(data.isIssue);
      if (typeof data.sortOrder !== 'undefined') updateData.sortOrder = Number(data.sortOrder);
      // Keep the completionDate column in sync with completedAt when it's set above,
      // otherwise persist whatever explicit value was sent.
      if (typeof updateData.completedAt !== 'undefined') {
        updateData.completionDate = updateData.completedAt ? updateData.completedAt : null;
      } else if (typeof data.completionDate !== 'undefined') {
        updateData.completionDate = data.completionDate || null;
      }
      if (typeof data.reminderFrequency !== 'undefined') updateData.reminderFrequency = data.reminderFrequency;
      if (typeof data.taskPeriod !== 'undefined') updateData.taskPeriod = data.taskPeriod;

      updateData.updatedAt = new Date();

      const [updated] = await db
        .update(projectTasks)
        .set(updateData)
        .where(eq(projectTasks.id, id))
        .returning();

      if (updated) {
        // Cascade cancellation: mark only non-completed subtasks Cancelled,
        // mirroring the project/key-step cancel cascades above.
        if (updateData.status === "Cancelled" || updateData.status === "cancelled") {
          await db.update(subtasks)
            .set({ status: "Cancelled" })
            .where(
              and(
                eq(subtasks.taskId, id),
                eq(subtasks.isCompleted, false)
              )
            );
          console.log(`[Task Cancel] Cancelled non-completed subtasks for task: ${id}`);
        }

        // If the task is being reopened (status changed from Completed to something else),
        // or if progress is explicitly set to < 100, reopen all subtasks
        const isReopening = updateData.status &&
          updateData.status !== "Completed" &&
          updateData.status !== "completed" &&
          updateData.status !== "Cancelled" &&
          updateData.status !== "cancelled";

        if (isReopening || (typeof updateData.progress !== 'undefined' && updateData.progress < 100)) {
          await db.update(subtasks)
            .set({ isCompleted: false, progress: 0 })
            .where(eq(subtasks.taskId, id));
          console.log(`[Task Reopen] Reopened all subtasks for task: ${id}`);

          // Cascade upward: if this task's parent Key Step and/or Project were
          // already Completed/Cancelled, reopen them too. Without this, a
          // reopened task can end up "orphaned" inside a Key Step or Project
          // that's still marked Completed — making the task invisible in views
          // that hide completed projects/steps, even though it's active again.
          // Only the parent's own status/progress is touched here; sibling
          // tasks/steps are left as-is since they may still be legitimately done.
          const parentKeyStepId = updated.keyStepId;
          const parentProjectId = updated.projectId;

          if (parentKeyStepId) {
            const [parentStep] = await db
              .select({ status: keySteps.status })
              .from(keySteps)
              .where(eq(keySteps.id, parentKeyStepId))
              .limit(1);
            if (parentStep && ["completed", "cancelled"].includes(String(parentStep.status).toLowerCase())) {
              await db.update(keySteps)
                .set({ status: "in-progress", progress: 0, completedAt: null })
                .where(eq(keySteps.id, parentKeyStepId));
              console.log(`[Task Reopen] Reopened parent key step: ${parentKeyStepId}`);
            }
          }

          if (parentProjectId) {
            const [parentProject] = await db
              .select({ status: projects.status })
              .from(projects)
              .where(eq(projects.id, parentProjectId))
              .limit(1);
            if (parentProject && ["completed", "cancelled"].includes(String(parentProject.status).toLowerCase())) {
              await db.update(projects)
                .set({ status: "In Progress", progress: 0, completedAt: null })
                .where(eq(projects.id, parentProjectId));
              console.log(`[Task Reopen] Reopened parent project: ${parentProjectId}`);
            }
          }
        }

        // Handle assignedMembers update (both assignedMembers and taskMembers fields)
        if (typeof data.assignedMembers !== 'undefined' || typeof data.taskMembers !== 'undefined') {
          const newMembers = data.assignedMembers || data.taskMembers || [];

          // De-duplicate incoming member IDs. This is a defensive fix for a bug
          // where the same person could end up with multiple assignee "tiles"
          // on the same task: the previous logic tried to diff against existing
          // rows and only append new ones, but task_members has no unique
          // constraint on (task_id, employee_id), so any mismatch in that diff
          // (stale client state, a fast double-click, etc.) let duplicate rows
          // for the same employee accumulate. Always fully replacing with a
          // de-duplicated list is simpler and guarantees no duplicates.
          const uniqueMemberIds = Array.from(
            new Set((Array.isArray(newMembers) ? newMembers : []).filter(Boolean).map((v: any) => String(v)))
          );

          await db.delete(taskMembers).where(eq(taskMembers.taskId, id));
          if (uniqueMemberIds.length > 0) {
            const memberInserts = uniqueMemberIds.map((employeeId: string) => ({
              taskId: id,
              employeeId,
            }));
            await db.insert(taskMembers).values(memberInserts);
          }
          console.log(`[Task Members] Set ${uniqueMemberIds.length} member(s) for task ${id}`);
        }

        // Fire-and-forget: this recalculates the parent key step's (and its
        // parent's, and the project's) progress by walking up the chain,
        // which is several sequential DB round trips per level. Previously
        // `await`ed here, so EVERY inline edit (task name, date, status,
        // members, etc.) blocked its response on that whole chain finishing
        // — this was the main reason the Tasks page felt slow on every
        // action. The response below never used its result, so it's safe
        // to let it run in the background instead (same pattern already
        // used in POST /api/tasks for task creation).
        updateParentProgress('task', id, req.user?.id).catch((err) => {
          console.error("[PATCH /api/tasks/:id] Background progress update failed:", err);
        });

        // Cascade Start/End Date changes up: Task -> Key Step -> Project.
        // (Subtask-driven task date changes already flow through
        // updateParentTimeline('subtask', ...) above; this covers direct
        // edits to a task's own Start/End Date.)
        if (typeof data.startDate !== 'undefined' || typeof data.endDate !== 'undefined') {
          updateParentTimeline('task', id).catch((err) => {
            console.error("[PATCH /api/tasks/:id] Background timeline update failed:", err);
          });
        }
      }

      if (!updated) return res.status(404).json({ message: "Task not found" });

      // --- Task Dependency & Automatic Schedule Management (new, additive) ---
      try {
        if (scheduleSnapshot) {
          await dependencyService.recordManualChangeAndCascade(
            id,
            updated.projectId || scheduleSnapshot.projectId,
            {
              startDate: scheduleSnapshot.startDate ?? null,
              endDate: scheduleSnapshot.endDate ?? null,
              duration: scheduleSnapshot.durationDays ?? null,
            },
            {
              startDate: updated.startDate ?? null,
              endDate: updated.endDate ?? null,
              duration: typeof updated.durationDays !== 'undefined' ? updated.durationDays : (scheduleSnapshot.durationDays ?? null),
            },
            {
              reason: data.scheduleChangeReason || data.reasonCategory || "Not specified",
              changedBy: req.employee?.id || null,
            }
          );
        }
      } catch (depErr) {
        console.warn("[Dependency] schedule history/cascade skipped:", depErr instanceof Error ? depErr.message : depErr);
      }

      // Fetch updated members if they were modified
      if (typeof data.assignedMembers !== 'undefined' || typeof data.taskMembers !== 'undefined') {
        const members = await db.select().from(taskMembers).where(eq(taskMembers.taskId, id));
        const memberIds = members.map(m => m.employeeId);
        return res.json({ ...updated, assignedMembers: memberIds });
      }

      res.json(updated);
    } catch (err) {
      console.error("Task patch failed:", err);
      res.status(500).json({ message: "Update failed" });
    }
  });

  // DELETE TASK
  app.delete("/api/tasks/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Capture parent IDs before deleting (lookup becomes impossible afterward)
      const [deletingTask] = await db.select({ keyStepId: projectTasks.keyStepId, projectId: projectTasks.projectId })
        .from(projectTasks).where(eq(projectTasks.id, id));
      const taskKeyStepId = deletingTask?.keyStepId;
      const taskProjectId = deletingTask?.projectId;

      // Wrapped in a transaction so a failure partway through (e.g. a
      // dropped connection) can't leave the task row behind while its
      // children are already gone — that kind of partial state is what
      // makes a delete look like it "didn't work" until a later refresh.
      // Mirrors /api/tasks/bulk-delete.
      await db.transaction(async (tx) => {
        // Delete subtasks
        await tx.delete(subtasks).where(eq(subtasks.taskId, id));

        // Delete task members
        await tx.delete(taskMembers).where(eq(taskMembers.taskId, id));

        // Delete CC members — no DB-level cascade exists for this table,
        // so it must be cleaned up explicitly. This was previously missing
        // here (bulk-delete already did it), leaving orphaned rows behind
        // on every single-task delete.
        await tx.delete(taskCcMembers).where(eq(taskCcMembers.taskId, id));

        // Delete the task
        await tx.delete(projectTasks).where(eq(projectTasks.id, id));
      });

      // Cascade timeline rollup so Key Step & Project dates contract automatically
      // Use 'keystep' type directly (task is already deleted, can't be looked up)
      if (taskKeyStepId) {
        updateParentTimeline('keystep', taskKeyStepId, undefined).catch((err) => {
          console.error("[DELETE /api/tasks/:id] Timeline update failed:", err);
        });
      } else if (taskProjectId) {
        updateParentTimeline('project', taskProjectId).catch((err) => {
          console.error("[DELETE /api/tasks/:id] Timeline update failed:", err);
        });
      }

      res.json({ success: true });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Task delete error:", errorMessage);
      res.status(500).json({ message: "Task delete failed", details: errorMessage });
    }
  });

  // CLONE TASK (duplicate with subtasks and members)
  app.post("/api/tasks/:id/clone", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { newName } = req.body;

      // Get original task
      const [originalTask] = await db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.id, id));

      if (!originalTask) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Create new task with cloned data
      const newTaskId = uuidv4();
      await db.insert(projectTasks).values({
        id: newTaskId,
        projectId: originalTask.projectId,
        keyStepId: originalTask.keyStepId,
        taskName: newName || `${originalTask.taskName} (Copy)`,
        description: originalTask.description,
        status: originalTask.status,
        priority: originalTask.priority,
        startDate: originalTask.startDate,
        endDate: originalTask.endDate,
        assignerId: originalTask.assignerId,
      });

      // Clone task members
      const originalMembers = await db
        .select()
        .from(taskMembers)
        .where(eq(taskMembers.taskId, id));

      if (originalMembers.length > 0) {
        await db.insert(taskMembers).values(
          originalMembers.map(m => ({
            taskId: newTaskId,
            employeeId: m.employeeId,
          }))
        );
      }

      // Clone subtasks
      const originalSubtasks = await db
        .select()
        .from(subtasks)
        .where(eq(subtasks.taskId, id));

      if (originalSubtasks.length > 0) {
        const subtaskIds = new Map<string, string>();

        for (const originalSubtask of originalSubtasks) {
          const newSubtaskId = uuidv4();
          subtaskIds.set(originalSubtask.id, newSubtaskId);

          await db.insert(subtasks).values({
            id: newSubtaskId,
            taskId: newTaskId,
            title: originalSubtask.title,
            description: originalSubtask.description || "",
            isCompleted: false,
            assignedTo: originalSubtask.assignedTo,
            startDate: originalSubtask.startDate || null,
            endDate: originalSubtask.endDate || null,
          });

          // Clone subtask members
          const subMembers = await db
            .select()
            .from(subtaskMembers)
            .where(eq(subtaskMembers.subtaskId, originalSubtask.id));

          if (subMembers.length > 0) {
            await db.insert(subtaskMembers).values(
              subMembers.map(m => ({
                subtaskId: newSubtaskId,
                employeeId: m.employeeId,
              }))
            );
          }
        }
      }

      res.json({
        success: true,
        newTaskId,
        message: `Task cloned successfully as "${newName || `${originalTask.taskName} (Copy)`}"`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Task clone error:", errorMessage);
      res.status(500).json({ error: "Clone failed", details: errorMessage });
    }
  });

  // GET ALL COMPLETED SUBTASKS (bulk) — for Completed page
  app.get("/api/subtasks/completed/bulk", requireAuth, async (req: any, res) => {
    try {
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const empCode = req.employee?.empCode;
      const isE0001 = empCode === "E0001";
      const requestingEmployeeId = req.employee?.id;

      // Fetch all completed subtasks
      const completedSubs = await db
        .select()
        .from(subtasks)
        .where(eq(subtasks.isCompleted, true));

      if (!completedSubs.length) return res.json([]);

      // Filter by visibility for non-admin users
      let visibleSubs = completedSubs;
      if (!isAdmin && !isE0001 && requestingEmployeeId) {
        // Get subtask member assignments
        const subIds = completedSubs.map(s => s.id);
        const subMemberRows = subIds.length > 0
          ? await db.select().from(subtaskMembers).where(inArray(subtaskMembers.subtaskId, subIds))
          : [];
        const subMemberMap = new Map<string, string[]>();
        subMemberRows.forEach(r => {
          if (!subMemberMap.has(r.subtaskId)) subMemberMap.set(r.subtaskId, []);
          subMemberMap.get(r.subtaskId)!.push(r.employeeId);
        });

        visibleSubs = completedSubs.filter(s => {
          const mIds = subMemberMap.get(s.id) || [];
          return s.assignedTo === requestingEmployeeId || mIds.includes(requestingEmployeeId);
        });
      }

      if (!visibleSubs.length) return res.json([]);

      // Enrich with parent task names + project info
      const taskIds = Array.from(new Set(visibleSubs.map(s => s.taskId)));
      const parentTasks = await db
        .select({ id: projectTasks.id, taskName: projectTasks.taskName, projectId: projectTasks.projectId })
        .from(projectTasks)
        .where(inArray(projectTasks.id, taskIds));

      const taskMap = new Map(parentTasks.map(t => [t.id, t]));

      const projectIds = Array.from(new Set(parentTasks.map(t => t.projectId)));
      const projectRows = projectIds.length > 0
        ? await db.select({ id: projects.id, title: projects.title }).from(projects).where(inArray(projects.id, projectIds))
        : [];
      const projMap = new Map(projectRows.map(p => [p.id, p]));

      const result = visibleSubs.map(s => {
        const parentTask = taskMap.get(s.taskId);
        const project = parentTask ? projMap.get(parentTask.projectId) : null;
        return {
          ...s,
          taskName: parentTask?.taskName || "Unknown Task",
          projectId: parentTask?.projectId || null,
          projectTitle: project?.title || "Unknown Project",
        };
      });

      res.json(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Completed subtasks fetch error:", errorMessage);
      res.status(500).json({ error: "Failed to fetch completed subtasks" });
    }
  });

  app.get("/api/subtasks/cancelled/bulk", requireAuth, async (req: any, res) => {
    try {
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const empCode = req.employee?.empCode;
      const isE0001 = empCode === "E0001";
      const requestingEmployeeId = req.employee?.id;

      // Fetch all cancelled subtasks
      const cancelledSubs = await db
        .select()
        .from(subtasks)
        .where(sql`LOWER(${subtasks.status}) = 'cancelled'`);

      if (!cancelledSubs.length) return res.json([]);

      // Filter by visibility for non-admin users
      let visibleSubs = cancelledSubs;
      if (!isAdmin && !isE0001 && requestingEmployeeId) {
        // Get subtask member assignments
        const subIds = cancelledSubs.map(s => s.id);
        const subMemberRows = subIds.length > 0
          ? await db.select().from(subtaskMembers).where(inArray(subtaskMembers.subtaskId, subIds))
          : [];
        const subMemberMap = new Map<string, string[]>();
        subMemberRows.forEach(r => {
          if (!subMemberMap.has(r.subtaskId)) subMemberMap.set(r.subtaskId, []);
          subMemberMap.get(r.subtaskId)!.push(r.employeeId);
        });

        visibleSubs = cancelledSubs.filter(s => {
          const mIds = subMemberMap.get(s.id) || [];
          return s.assignedTo === requestingEmployeeId || mIds.includes(requestingEmployeeId);
        });
      }

      if (!visibleSubs.length) return res.json([]);

      // Enrich with parent task names + project info
      const taskIds = Array.from(new Set(visibleSubs.map(s => s.taskId)));
      const parentTasks = await db
        .select({ id: projectTasks.id, taskName: projectTasks.taskName, projectId: projectTasks.projectId })
        .from(projectTasks)
        .where(inArray(projectTasks.id, taskIds));

      const taskMap = new Map(parentTasks.map(t => [t.id, t]));

      const projectIds = Array.from(new Set(parentTasks.map(t => t.projectId)));
      const projectRows = projectIds.length > 0
        ? await db.select({ id: projects.id, title: projects.title }).from(projects).where(inArray(projects.id, projectIds))
        : [];
      const projMap = new Map(projectRows.map(p => [p.id, p]));

      const result = visibleSubs.map(s => {
        const parentTask = taskMap.get(s.taskId);
        const project = parentTask ? projMap.get(parentTask.projectId) : null;
        return {
          ...s,
          taskName: parentTask?.taskName || "Unknown Task",
          projectId: parentTask?.projectId || null,
          projectTitle: project?.title || "Unknown Project",
        };
      });

      res.json(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Cancelled subtasks fetch error:", errorMessage);
      res.status(500).json({ error: "Failed to fetch cancelled subtasks" });
    }
  });

  // BULK FETCH ALL SUBTASKS (all subtasks for all authenticated users)
  app.get("/api/subtasks/bulk", requireAuth, async (req: any, res) => {
    try {
      const filterStatus = req.query.status ? String(req.query.status) : "active";
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const requestingEmployeeId = req.employee?.id;
      const requestingEmployeeDepartment = req.employee?.department;

      let subtaskQuery: any = db.select().from(subtasks);
      if (filterStatus === "active") {
        subtaskQuery = subtaskQuery.where(eq(subtasks.isCompleted, false));
      } else if (filterStatus === "Completed") {
        subtaskQuery = subtaskQuery.where(eq(subtasks.isCompleted, true));
      }

      if (!isAdmin) {
        if (!requestingEmployeeId) return res.json([]);

        const deptProjectIdsRaw = await db
          .select({ projectId: projectDepartments.projectId })
          .from(projectDepartments)
          .where(eq(projectDepartments.department, normalizeDept(requestingEmployeeDepartment)));
        const deptProjectIds = deptProjectIdsRaw.map((r) => r.projectId);

        const teamProjectIdsRaw = await db
          .select({ projectId: projectTeamMembers.projectId })
          .from(projectTeamMembers)
          .where(eq(projectTeamMembers.employeeId, requestingEmployeeId));
        const teamProjectIds = teamProjectIdsRaw.map((r) => r.projectId);

        const accessibleProjectIds = Array.from(new Set([...deptProjectIds, ...teamProjectIds]));

        const assignedSubtaskTaskIdsRaw = await db
          .select({ taskId: subtasks.taskId })
          .from(subtasks)
          .leftJoin(subtaskMembers, eq(subtasks.id, subtaskMembers.subtaskId))
          .where(or(eq(subtasks.assignedTo, requestingEmployeeId), eq(subtaskMembers.employeeId, requestingEmployeeId)));
        const assignedSubtaskTaskIds = Array.from(new Set(assignedSubtaskTaskIdsRaw.map((r) => r.taskId)));

        const conditions: any[] = [];
        if (accessibleProjectIds.length > 0) {
          const visibleTaskIdsRaw = await db
            .select({ id: projectTasks.id })
            .from(projectTasks)
            .where(inArray(projectTasks.projectId, accessibleProjectIds));
          const visibleTaskIds = visibleTaskIdsRaw.map((r) => r.id);
          if (visibleTaskIds.length > 0) {
            conditions.push(inArray(subtasks.taskId, visibleTaskIds));
          }
        }

        if (assignedSubtaskTaskIds.length > 0) {
          conditions.push(inArray(subtasks.taskId, assignedSubtaskTaskIds));
        }

        if (conditions.length === 0) {
          return res.json([]);
        }

        subtaskQuery = subtaskQuery.where(or(...conditions));
      }

      const subtasksResult = await subtaskQuery;
      res.json(subtasksResult);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Bulk subtasks fetch error:", errorMessage);
      res.status(500).json({ error: "Failed to fetch subtasks", details: errorMessage });
    }
  });

  // GET SUBTASKS BY TASK ID
  app.get("/api/subtasks/:taskId", requireAuth, async (req: any, res) => {
    try {
      const { taskId } = req.params;
      const rows = await db.select().from(subtasks).where(eq(subtasks.taskId, taskId));
      if (!rows.length) return res.json([]);

      const subIds = rows.map((s) => s.id);
      const tagRows = await db
        .select({ subtaskId: subtaskTags.subtaskId, id: tags.id, name: tags.name })
        .from(subtaskTags)
        .innerJoin(tags, eq(subtaskTags.tagId, tags.id))
        .where(inArray(subtaskTags.subtaskId, subIds));
      const tagMap = new Map<string, any[]>();
      tagRows.forEach((r) => {
        if (!tagMap.has(r.subtaskId)) tagMap.set(r.subtaskId, []);
        tagMap.get(r.subtaskId)!.push({ id: r.id, name: r.name });
      });

      res.json(rows.map((s) => ({ ...s, tags: tagMap.get(s.id) || [] })));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Subtasks fetch error:", errorMessage);
      res.status(500).json({ error: "Failed to fetch subtasks" });
    }
  });


  // CREATE SUBTASK (standalone endpoint for quick add)
  app.post("/api/subtasks", requireAuth, async (req: any, res) => {
    try {
      const {
        taskId, title, description = "", startDate = null, endDate = null,
        isAddon = false, isIssue = false,
        taskOwnerId = null, priority = "medium", status = "Not Started", ccMembers = [],
        keyStepId = null, taskPeriod = "custom", reminderFrequency = "1 Time",
        assignerId = null, durationDays = null, completionDate = null,
      } = req.body;

      if (!taskId || !title) {
        return res.status(400).json({ error: "taskId and title are required" });
      }

      const newSubtaskId = uuidv4();
      await db.insert(subtasks).values({
        id: newSubtaskId,
        taskId,
        title: title.trim(),
        description: description || "",
        isCompleted: false,
        assignedTo: null,
        startDate: startDate || null,
        endDate: endDate || null,
        isAddon: !!isAddon,
        isIssue: !!isIssue,
        taskOwnerId: taskOwnerId || null,
        priority: priority || "medium",
        status: status || "Not Started",
        ccMembers: Array.isArray(ccMembers) ? ccMembers : [],
        keyStepId: keyStepId || null,
        taskPeriod: taskPeriod || "custom",
        reminderFrequency: reminderFrequency || "1 Time",
        assignerId: assignerId || null,
        durationDays: typeof durationDays === 'number' ? durationDays : (durationDays ? Number(durationDays) : null),
        completionDate: completionDate || null,
      });

      if (startDate || endDate) {
        updateParentTimeline('subtask', newSubtaskId).catch((err) => {
          console.error('[POST /api/subtasks] Background timeline update failed:', err);
        });
      }

      res.json({
        success: true,
        id: newSubtaskId,
        message: "Subtask created successfully",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Subtask create error:", errorMessage);
      res.status(500).json({ error: "Failed to create subtask", details: errorMessage });
    }
  });


  // PATCH single subtask (toggle complete / update dates)
  app.patch("/api/subtasks/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const {
        isCompleted, progress, startDate, endDate, isAddon, isIssue, taskOwnerId, priority, status, ccMembers, title, description, assignedTo,
        keyStepId, taskPeriod, reminderFrequency, assignerId, durationDays, completionDate,
      } = req.body;

      const updateData: any = {};
      if (typeof title !== 'undefined') updateData.title = title;
      if (typeof description !== 'undefined') updateData.description = description || "";
      if (typeof isCompleted !== 'undefined') {
        updateData.isCompleted = !!isCompleted;
        if (!!isCompleted && typeof progress === 'undefined') updateData.progress = 100;
        if (!isCompleted && typeof progress === 'undefined') updateData.progress = 0;
      }
      if (typeof progress !== 'undefined') {
        updateData.progress = Number(progress);
        if (updateData.progress === 100) updateData.isCompleted = true;
        else if (updateData.progress < 100) updateData.isCompleted = false;
      }
      if (typeof startDate !== 'undefined') updateData.startDate = startDate || null;
      if (typeof endDate !== 'undefined') updateData.endDate = endDate || null;
      if (typeof isAddon !== 'undefined') updateData.isAddon = !!isAddon;
      if (typeof isIssue !== 'undefined') updateData.isIssue = !!isIssue;
      if (typeof taskOwnerId !== 'undefined') updateData.taskOwnerId = taskOwnerId || null;
      if (typeof priority !== 'undefined') updateData.priority = priority || "medium";
      if (typeof ccMembers !== 'undefined') updateData.ccMembers = Array.isArray(ccMembers) ? ccMembers : [];
      if (typeof keyStepId !== 'undefined') updateData.keyStepId = keyStepId || null;
      if (typeof taskPeriod !== 'undefined') updateData.taskPeriod = taskPeriod || "custom";
      if (typeof reminderFrequency !== 'undefined') updateData.reminderFrequency = reminderFrequency || "1 Time";
      if (typeof assignerId !== 'undefined') updateData.assignerId = assignerId || null;
      if (typeof durationDays !== 'undefined') updateData.durationDays = durationDays === null || durationDays === "" ? null : Number(durationDays);
      if (typeof completionDate !== 'undefined') updateData.completionDate = completionDate || null;

      // ----- Duration (Number of Days) <-> Start/End Date sync -----
      // Mirrors the same logic used for tasks (PATCH /api/tasks/:id):
      //   1. If durationDays is being set, recompute endDate = startDate + durationDays.
      //   2. Otherwise, if startDate or endDate is being changed directly,
      //      recompute durationDays = endDate - startDate so the Duration
      //      column never goes stale.
      if (typeof startDate !== 'undefined' || typeof endDate !== 'undefined' || typeof durationDays !== 'undefined') {
        const [existingSub] = await db
          .select({ startDate: subtasks.startDate, endDate: subtasks.endDate, durationDays: subtasks.durationDays })
          .from(subtasks)
          .where(eq(subtasks.id, id))
          .limit(1);

        if (typeof durationDays !== 'undefined' && updateData.durationDays !== null && typeof updateData.durationDays === 'number') {
          const baseStart: string | null = updateData.startDate ?? existingSub?.startDate ?? null;
          if (baseStart) {
            const startD = new Date(baseStart);
            if (!isNaN(startD.getTime())) {
              const newEnd = new Date(startD);
              newEnd.setDate(newEnd.getDate() + updateData.durationDays);
              updateData.endDate = newEnd.toISOString().split('T')[0];
            }
          }
        } else if (typeof durationDays === 'undefined') {
          const effectiveStart: string | null =
            typeof updateData.startDate !== 'undefined' ? updateData.startDate : (existingSub?.startDate ?? null);
          const effectiveEnd: string | null =
            typeof updateData.endDate !== 'undefined' ? updateData.endDate : (existingSub?.endDate ?? null);

          if (effectiveStart && effectiveEnd) {
            const sD = new Date(effectiveStart);
            const eD = new Date(effectiveEnd);
            if (!isNaN(sD.getTime()) && !isNaN(eD.getTime())) {
              const diffDays = Math.round((eD.getTime() - sD.getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays >= 0) {
                updateData.durationDays = diffDays;
              }
            }
          }
        }
      }

      // Multi-assignee support: the UI sends an array of employee IDs. We
      // keep the legacy singular `assigned_to` column in sync (first ID, or
      // null) for any old code paths that still read it directly, and sync
      // the full list into subtask_members below once the main update lands.
      let newAssignedToList: string[] | undefined;
      if (typeof assignedTo !== 'undefined') {
        newAssignedToList = Array.isArray(assignedTo)
          ? assignedTo.filter(Boolean)
          : (assignedTo ? [assignedTo] : []);
        updateData.assignedTo = newAssignedToList[0] || null;
      }

      // Status mirrors the parent task's behavior: setting it to "Completed"
      // marks the subtask done and pins progress to 100%; moving it away from
      // "Completed" reopens the subtask (unless the caller also sent an
      // explicit isCompleted/progress value in the same request, which wins).
      if (typeof status !== 'undefined') {
        updateData.status = status || "Not Started";
        const isCompletingViaStatus = status === "Completed" || status === "completed";
        const isCancelling = status === "Cancelled" || status === "cancelled";
        if (isCompletingViaStatus && typeof isCompleted === 'undefined') {
          updateData.isCompleted = true;
          if (typeof progress === 'undefined') updateData.progress = 100;
        } else if (!isCompletingViaStatus && !isCancelling && typeof isCompleted === 'undefined') {
          updateData.isCompleted = false;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No valid fields provided to update. Ensure the request body was sent as JSON with a Content-Type: application/json header.' });
      }

      // DEBUG: log incoming update payload
      console.debug('[PATCH /api/subtasks/:id] id=', id, 'updateData=', updateData);

      const [updated] = await db.update(subtasks).set(updateData).where(eq(subtasks.id, id)).returning();
      console.debug('[PATCH /api/subtasks/:id] db returned updated=', updated);

      if (updated && typeof newAssignedToList !== 'undefined') {
        try {
          await db.delete(subtaskMembers).where(eq(subtaskMembers.subtaskId, id));
          if (newAssignedToList.length > 0) {
            await db.insert(subtaskMembers).values(
              newAssignedToList.map((empId: string) => ({ subtaskId: id, employeeId: empId }))
            );
          }
        } catch (err) {
          console.warn('[PATCH /api/subtasks/:id] Failed to sync subtask_members:', err);
        }
      }

      if (updated) {
        // Fire-and-forget — see the matching comment in PATCH /api/tasks/:id.
        // 'subtask' is the longest chain (subtask -> task -> keystep -> ...
        // -> project), so this was the slowest of the blocking call sites.
        updateParentProgress('subtask', id, req.user?.id).catch((err) => {
          console.error('[PATCH /api/subtasks/:id] Background progress update failed:', err);
        });

        // Cascade Start/End Date changes up: Subtask -> Task -> Key Step -> Project.
        if (typeof startDate !== 'undefined' || typeof endDate !== 'undefined') {
          updateParentTimeline('subtask', id).catch((err) => {
            console.error('[PATCH /api/subtasks/:id] Background timeline update failed:', err);
          });
        }
      }

      if (!updated) return res.status(404).json({ message: 'Subtask not found' });

      // Build assignedTo array from mapping (if any)
      let assigned: string[] = [];
      try {
        const rows = await db.select({ employeeId: subtaskMembers.employeeId }).from(subtaskMembers).where(eq(subtaskMembers.subtaskId, id));
        assigned = rows.map(r => r.employeeId);
      } catch (e) {
        assigned = updated.assignedTo ? [updated.assignedTo] : [];
      }

      res.json({
        id: updated.id,
        title: updated.title,
        description: updated.description || "",
        isCompleted: updated.isCompleted,
        assignedTo: assigned,
        startDate: updated.startDate || null,
        endDate: updated.endDate || null,
        progress: updated.progress,
        isAddon: !!updated.isAddon,
        isIssue: !!updated.isIssue,
        taskOwnerId: updated.taskOwnerId || null,
        priority: updated.priority || "medium",
        status: updated.status || "Not Started",
        ccMembers: Array.isArray(updated.ccMembers) ? updated.ccMembers : [],
        keyStepId: updated.keyStepId || null,
        taskPeriod: updated.taskPeriod || "custom",
        reminderFrequency: updated.reminderFrequency || "1 Time",
        assignerId: updated.assignerId || null,
        durationDays: typeof updated.durationDays === 'number' ? updated.durationDays : null,
        completionDate: updated.completionDate || null,
      });
    } catch (err) {
      console.error('Failed to patch subtask:', err);
      res.status(500).json({ message: 'Failed to update subtask' });
    }
  });

  // CLONE SUBTASK
  app.post("/api/subtasks/:id/clone", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { newTitle } = req.body;

      // Get original subtask
      const [originalSubtask] = await db
        .select()
        .from(subtasks)
        .where(eq(subtasks.id, id));

      if (!originalSubtask) {
        return res.status(404).json({ error: "Subtask not found" });
      }

      // Create new subtask
      const newSubtaskId = uuidv4();
      await db.insert(subtasks).values({
        id: newSubtaskId,
        taskId: originalSubtask.taskId,
        title: newTitle || `${originalSubtask.title} (Copy)`,
        description: originalSubtask.description,
        isCompleted: false,
        assignedTo: originalSubtask.assignedTo,
        isAddon: originalSubtask.isAddon,
        isIssue: originalSubtask.isIssue,
      });

      // Clone subtask members
      const originalMembers = await db
        .select()
        .from(subtaskMembers)
        .where(eq(subtaskMembers.subtaskId, id));

      if (originalMembers.length > 0) {
        await db.insert(subtaskMembers).values(
          originalMembers.map(m => ({
            subtaskId: newSubtaskId,
            employeeId: m.employeeId,
          }))
        );
      }

      res.json({
        success: true,
        newSubtaskId,
        message: `Subtask cloned successfully as "${newTitle || `${originalSubtask.title} (Copy)`}"`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Subtask clone error:", errorMessage);
      res.status(500).json({ error: "Clone failed", details: errorMessage });
    }
  });

  // BULK ASSIGN MEMBERS TO TASKS
  app.post("/api/tasks/bulk-assign", requireAuth, async (req: any, res) => {
    try {
      const { taskIds, employeeIds = [], startDate, endDate, completionDate, mode = "add" } = req.body;

      debug("[BULK-ASSIGN] Request received:", { taskIds, employeeIds, startDate, endDate, completionDate, mode });

      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: "taskIds (non-empty array) is required" });
      }

      // Check that at least one update is requested (employees OR dates)
      if (employeeIds.length === 0 && !startDate && !endDate && !completionDate) {
        return res.status(400).json({ error: "Please provide at least one member, department, or date to update" });
      }

      // Normalize + de-dupe incoming employee IDs up front so we never insert
      // the same person twice for a task (which previously showed up as
      // duplicate assignee tiles in the UI).
      const normalizedEmployeeIds = Array.from(
        new Set((Array.isArray(employeeIds) ? employeeIds : []).filter(Boolean).map((v: any) => String(v)))
      );
      const isRemoveMode = mode === "remove";

      // We'll perform each task's membership update and optional date update.
      // Add mode: append new members to existing ones (don't replace).
      // Remove mode: bulk-remove the selected assignees from every selected task.
      await db.transaction(async (tx) => {
        for (const taskId of taskIds) {
          debug(`[BULK-ASSIGN] Processing task: ${taskId} (mode=${mode})`);

          if (normalizedEmployeeIds.length > 0) {
            if (isRemoveMode) {
              // Bulk remove: delete only the rows matching the selected employees.
              await tx
                .delete(taskMembers)
                .where(and(eq(taskMembers.taskId, taskId), inArray(taskMembers.employeeId, normalizedEmployeeIds)));
              debug(`[BULK-ASSIGN] Task ${taskId} removed ${normalizedEmployeeIds.length} member(s)`);
            } else {
              // Get existing members for this task
              const existingMembers = await tx
                .select({ employeeId: taskMembers.employeeId })
                .from(taskMembers)
                .where(eq(taskMembers.taskId, taskId));

              debug(`[BULK-ASSIGN] Task ${taskId} existing members:`, existingMembers.map(m => m.employeeId));

              const existingMemberIds = new Set(existingMembers.map(m => String(m.employeeId)));

              // Filter out members that are already assigned
              const newMembersToAdd = normalizedEmployeeIds.filter((empId: string) => !existingMemberIds.has(empId));
              debug(`[BULK-ASSIGN] Task ${taskId} new members to add:`, newMembersToAdd);

              // Insert only new members that don't already exist
              if (newMembersToAdd.length > 0) {
                await tx.insert(taskMembers).values(
                  newMembersToAdd.map((empId: string) => ({
                    taskId,
                    employeeId: empId,
                  }))
                );
                debug(`[BULK-ASSIGN] Task ${taskId} added ${newMembersToAdd.length} members`);
              }
            }
          }

          // Update dates if provided (add mode only — removal is assignee-only)
          if (!isRemoveMode && (startDate || endDate || completionDate)) {
            const updateData: any = {};
            if (startDate) updateData.startDate = startDate;
            if (endDate) updateData.endDate = endDate;
            if (completionDate) updateData.completionDate = completionDate;
            updateData.updatedAt = new Date();

            await tx
              .update(projectTasks)
              .set(updateData)
              .where(eq(projectTasks.id, taskId));
            debug(`[BULK-ASSIGN] Task ${taskId} dates updated`);
          }
        }
      });

      // Build appropriate success message
      let message = "";
      if (isRemoveMode && normalizedEmployeeIds.length > 0) {
        message = `Removed selected assignee(s) from ${taskIds.length} task(s)`;
      } else if (employeeIds.length > 0 && (startDate || endDate)) {
        message = `Assigned members and updated dates for ${taskIds.length} task(s)`;
      } else if (employeeIds.length > 0) {
        message = `Assigned members to ${taskIds.length} task(s)`;
      } else {
        message = `Updated dates for ${taskIds.length} task(s)`;
      }

      res.json({ success: true, message });
    } catch (err) {
      console.error("Bulk assign error:", err);
      res.status(500).json({ error: "Bulk assignment failed" });
    }
  });

  // BULK DELETE TASKS
  app.post("/api/tasks/bulk-delete", requireAuth, async (req: any, res) => {
    try {
      const { taskIds } = req.body;
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: "taskIds (non-empty array) is required" });
      }

      // Capture parent key step & project IDs before deleting
      const parentRows = await db.select({ keyStepId: projectTasks.keyStepId, projectId: projectTasks.projectId })
        .from(projectTasks).where(inArray(projectTasks.id, taskIds));
      const affectedKeyStepIds = [...new Set(parentRows.map(r => r.keyStepId).filter(Boolean))];
      const affectedProjectIds = [...new Set(parentRows.filter(r => !r.keyStepId).map(r => r.projectId).filter(Boolean))];

      await db.transaction(async (tx) => {
        // Delete related data first
        await tx.delete(subtasks).where(inArray(subtasks.taskId, taskIds));
        await tx.delete(taskMembers).where(inArray(taskMembers.taskId, taskIds));
        await tx.delete(taskCcMembers).where(inArray(taskCcMembers.taskId, taskIds));
        await tx.delete(projectTasks).where(inArray(projectTasks.id, taskIds));
      });

      // Cascade timeline rollup after deletion
      // Use 'keystep' type directly (tasks are already deleted so can't be looked up)
      for (const ksId of affectedKeyStepIds) {
        updateParentTimeline('keystep', ksId!, undefined).catch((err) => {
          console.error("[bulk-delete tasks] Timeline update for keystep failed:", err);
        });
      }
      for (const projectId of affectedProjectIds) {
        updateParentTimeline('project', projectId!).catch((err) => {
          console.error("[bulk-delete tasks] Timeline update for project failed:", err);
        });
      }

      res.json({ success: true, message: `Deleted ${taskIds.length} task(s)` });
    } catch (err) {
      console.error("Bulk delete error:", err);
      res.status(500).json({ error: "Bulk delete failed" });
    }
  });

  // BULK ASSIGN KEY STEP TO TASKS
  app.post("/api/tasks/bulk-update-keystep", requireAuth, async (req: any, res) => {
    try {
      const { taskIds, keyStepId } = req.body;
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: "taskIds (non-empty array) is required" });
      }

      // Capture old keyStepIds before updating (for rollup on source key steps)
      const oldRows = await db.select({ keyStepId: projectTasks.keyStepId })
        .from(projectTasks).where(inArray(projectTasks.id, taskIds));
      const oldKeyStepIds = [...new Set(oldRows.map(r => r.keyStepId).filter(Boolean))];

      await db.update(projectTasks)
        .set({ keyStepId: keyStepId || null, updatedAt: new Date() })
        .where(inArray(projectTasks.id, taskIds));

      // Cascade timeline for all affected key steps (old and new)
      const allAffectedKeyStepIds = [...new Set([...oldKeyStepIds, keyStepId].filter(Boolean))];
      for (const ksId of allAffectedKeyStepIds) {
        updateParentTimeline('keystep', ksId!, ksId).catch((err) => {
          console.error("[bulk-update-keystep] Timeline update failed:", err);
        });
      }

      res.json({ success: true, message: `Key step assigned to ${taskIds.length} task(s)` });
    } catch (err) {
      console.error("Bulk key step error:", err);
      res.status(500).json({ error: "Bulk key step assignment failed" });
    }
  });

  // BULK ASSIGN TASK OWNER TO TASKS
  app.post("/api/tasks/bulk-assign-task-owner", requireAuth, async (req: any, res) => {
    try {
      const { taskIds, taskOwnerId } = req.body;
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: "taskIds (non-empty array) is required" });
      }
      if (!taskOwnerId) {
        return res.status(400).json({ error: "taskOwnerId is required" });
      }
      await db.update(projectTasks)
        .set({ taskOwnerId, updatedAt: new Date() })
        .where(inArray(projectTasks.id, taskIds));
      res.json({ success: true, message: `Task owner assigned to ${taskIds.length} task(s)` });
    } catch (err) {
      console.error("Bulk task owner error:", err);
      res.status(500).json({ error: "Bulk task owner assignment failed" });
    }
  });

  // REORDER TASKS (drag & drop)
  app.post("/api/tasks/reorder", requireAuth, async (req: any, res) => {
    try {
      const { orderedIds } = req.body; // Array of task IDs in new order
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ error: "orderedIds (non-empty array) is required" });
      }
      await db.transaction(async (tx) => {
        for (let i = 0; i < orderedIds.length; i++) {
          await tx.update(projectTasks)
            .set({ sortOrder: i })
            .where(eq(projectTasks.id, orderedIds[i]));
        }
      });
      res.json({ success: true, message: `Reordered ${orderedIds.length} task(s)` });
    } catch (err) {
      console.error("Reorder error:", err);
      res.status(500).json({ error: "Reorder failed" });
    }
  });

  // REORDER KEY STEPS (drag & drop, persisted permanently via sort_order column)
  app.post("/api/key-steps/reorder", requireAuth, async (req: any, res) => {
    try {
      const { orderedIds } = req.body; // Array of key step IDs in new order
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ error: "orderedIds (non-empty array) is required" });
      }
      await db.transaction(async (tx) => {
        for (let i = 0; i < orderedIds.length; i++) {
          await tx.update(keySteps)
            .set({ sortOrder: i })
            .where(eq(keySteps.id, orderedIds[i]));
        }
      });
      res.json({ success: true, message: `Reordered ${orderedIds.length} key step(s)` });
    } catch (err) {
      console.error("Key step reorder error:", err);
      res.status(500).json({ error: "Reorder failed" });
    }
  });

  // ADD DELAY REASON FOR OVERDUE TASK
  app.post("/api/tasks/:id/delay-reason", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: "Reason is required" });
      }
      const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, id)).limit(1);
      if (!task) return res.status(404).json({ error: "Task not found" });

      const [inserted] = await db.insert(delayReasons).values({
        taskId: id,
        projectId: task.projectId,
        reason: reason.trim(),
        delayDate: new Date().toISOString().split('T')[0],
        recordedBy: req.employee?.id || null,
      } as any).returning();

      res.status(201).json(inserted);
    } catch (err) {
      console.error("Delay reason error:", err);
      res.status(500).json({ error: "Failed to save delay reason" });
    }
  });

  // GET ALL DELAY REASONS (Admin only)
  app.get("/api/delay-reasons", requireAuth, async (req: any, res) => {
    try {
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      if (!isAdmin) return res.status(403).json({ error: "Admin only" });

      const projectIdFilter = req.query.projectId as string | undefined;
      const rows = await db.select({
        id: delayReasons.id,
        taskId: delayReasons.taskId,
        projectId: delayReasons.projectId,
        reason: delayReasons.reason,
        delayDate: delayReasons.delayDate,
        recordedBy: delayReasons.recordedBy,
        createdAt: delayReasons.createdAt,
        taskName: projectTasks.taskName,
        employeeName: employees.name,
      })
        .from(delayReasons)
        .leftJoin(projectTasks, eq(delayReasons.taskId, projectTasks.id))
        .leftJoin(employees, eq(delayReasons.recordedBy, employees.id))
        .orderBy(desc(delayReasons.createdAt));

      const filtered = projectIdFilter
        ? rows.filter(r => r.projectId === projectIdFilter)
        : rows;

      res.json(filtered);
    } catch (err) {
      console.error("Get delay reasons error:", err);
      res.status(500).json({ error: "Failed to fetch delay reasons" });
    }
  });

  // GET CC MEMBERS FOR A TASK
  app.get("/api/tasks/:id/cc-members", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const rows = await db.select({ employeeId: taskCcMembers.employeeId })
        .from(taskCcMembers)
        .where(eq(taskCcMembers.taskId, id));
      res.json(rows.map(r => r.employeeId));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch CC members" });
    }
  });

  // LAZY SUBTASK LOAD: full subtask details (with assignees) for ONE task,
  // fetched on-demand when a row is expanded in the UI. /api/tasks/bulk only
  // sends a subtaskCount to keep the admin "all tasks" payload small — the
  // full nested subtask objects (with descriptions, dates, per-subtask
  // assignees) were previously being sent for every task whether or not the
  // row was ever expanded, which was a large chunk of the bulk payload size.
  app.get("/api/tasks/:id/subtasks", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const subs = await db.select().from(subtasks).where(eq(subtasks.taskId, id));
      if (!subs.length) return res.json([]);

      const subIds = subs.map((s) => s.id);
      const [subMemRows, tagRows] = await Promise.all([
        db.select().from(subtaskMembers).where(inArray(subtaskMembers.subtaskId, subIds)),
        db
          .select({ subtaskId: subtaskTags.subtaskId, id: tags.id, name: tags.name })
          .from(subtaskTags)
          .innerJoin(tags, eq(subtaskTags.tagId, tags.id))
          .where(inArray(subtaskTags.subtaskId, subIds)),
      ]);

      const subMemMap = new Map<string, string[]>();
      subMemRows.forEach((rm) => {
        if (!subMemMap.has(rm.subtaskId)) subMemMap.set(rm.subtaskId, []);
        subMemMap.get(rm.subtaskId)!.push(rm.employeeId);
      });

      const tagMap = new Map<string, any[]>();
      tagRows.forEach((r) => {
        if (!tagMap.has(r.subtaskId)) tagMap.set(r.subtaskId, []);
        tagMap.get(r.subtaskId)!.push({ id: r.id, name: r.name });
      });

      const result = subs.map((s) => ({
        ...s,
        assignedTo: subMemMap.get(s.id) || (s.assignedTo ? [s.assignedTo] : []),
        tags: tagMap.get(s.id) || [],
      }));

      res.json(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: "Failed to fetch subtasks", details: errorMessage });
    }
  });

  // UPDATE CC MEMBERS FOR A TASK
  app.patch("/api/tasks/:id/cc-members", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { ccMemberIds } = req.body;
      if (!Array.isArray(ccMemberIds)) return res.status(400).json({ error: "ccMemberIds must be an array" });
      await db.delete(taskCcMembers).where(eq(taskCcMembers.taskId, id));
      if (ccMemberIds.length > 0) {
        await db.insert(taskCcMembers).values(ccMemberIds.map((empId: string) => ({ taskId: id, employeeId: empId })));
      }
      res.json({ success: true, ccMemberIds });
    } catch (err) {
      res.status(500).json({ error: "Failed to update CC members" });
    }
  });

  // BULK ASSIGN CC MEMBERS
  app.post("/api/tasks/bulk-assign-cc", requireAuth, async (req: any, res) => {
    try {
      const { taskIds, ccEmployeeIds } = req.body;
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: "taskIds required" });
      }
      if (!Array.isArray(ccEmployeeIds) || ccEmployeeIds.length === 0) {
        return res.status(400).json({ error: "ccEmployeeIds required" });
      }
      await db.transaction(async (tx) => {
        for (const taskId of taskIds) {
          const existing = await tx.select({ employeeId: taskCcMembers.employeeId })
            .from(taskCcMembers).where(eq(taskCcMembers.taskId, taskId));
          const existingSet = new Set(existing.map(e => e.employeeId));
          const toAdd = ccEmployeeIds.filter((id: string) => !existingSet.has(id));
          if (toAdd.length > 0) {
            await tx.insert(taskCcMembers).values(toAdd.map((empId: string) => ({ taskId, employeeId: empId })));
          }
        }
      });
      res.json({ success: true, message: `CC assigned to ${taskIds.length} task(s)` });
    } catch (err) {
      res.status(500).json({ error: "Bulk CC assign failed" });
    }
  });

  // ========================================
  // TAG ROUTES
  // ========================================
  app.get("/api/tags", requireAuth, async (req: any, res) => {
    try {
      const allTags = await storageHelper.getTags();
      res.json(allTags);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  app.post("/api/tags", requireAuth, async (req: any, res) => {
    try {
      const { name } = req.body;
      if (!name || name.trim() === "") {
        return res.status(400).json({ error: "Tag name is required" });
      }
      const newTag = await storageHelper.createTag(name);
      res.status(201).json(newTag);
    } catch (err) {
      console.error("[TAGS] POST /api/tags error:", err);
      res.status(500).json({ error: "Failed to create tag" });
    }
  });

  app.patch("/api/tags/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      if (!name || name.trim() === "") {
        return res.status(400).json({ error: "Tag name is required" });
      }
      const updated = await storageHelper.updateTag(id, name);
      if (!updated) return res.status(404).json({ error: "Tag not found" });
      res.json(updated);
    } catch (err) {
      console.error("[TAGS] PATCH /api/tags/:id error:", err);
      res.status(500).json({ error: "Failed to update tag" });
    }
  });

  app.delete("/api/tags/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storageHelper.deleteTag(id);
      res.json({ success: true });
    } catch (err) {
      console.error("[TAGS] DELETE /api/tags/:id error:", err);
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });

  app.post("/api/tasks/:id/tags", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { tagIds } = req.body; // array of tag ids
      // Remove all existing tags and re-assign, or use assignTagsToTask (it does incremental addition but we usually want replacement for simple UI)
      // Actually storageHelper.assignTagsToTask just adds, let's replace them all
      await db.delete(taskTags).where(eq(taskTags.taskId, id));
      await storageHelper.assignTagsToTask(id, tagIds || []);
      res.json({ success: true });
    } catch (err) {
      console.error("[TAGS] POST /api/tasks/:id/tags error:", err);
      res.status(500).json({ error: "Failed to update task tags" });
    }
  });

  app.delete("/api/tasks/:id/tags/:tagId", requireAuth, async (req: any, res) => {
    try {
      const { id, tagId } = req.params;
      await storageHelper.removeTagFromTask(id, tagId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to remove tag from task" });
    }
  });

  app.post("/api/tasks/bulk-tags", requireAuth, async (req: any, res) => {
    try {
      const { taskIds, tagIds, action } = req.body; // action: "add" | "remove"
      if (!Array.isArray(taskIds) || !Array.isArray(tagIds) || !action) {
        return res.status(400).json({ error: "Invalid payload for bulk tags" });
      }
      await storageHelper.bulkAssignTags(taskIds, tagIds, action);
      res.json({ success: true, message: `Tags ${action}ed for ${taskIds.length} tasks` });
    } catch (err) {
      console.error("[TAGS] Bulk assign tags error:", err);
      res.status(500).json({ error: "Bulk tag assign failed" });
    }
  });

  // Subtask tag routes (mirror the task tag routes above, for full field-parity)
  app.post("/api/subtasks/:id/tags", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { tagIds } = req.body; // array of tag ids
      await db.delete(subtaskTags).where(eq(subtaskTags.subtaskId, id));
      await storageHelper.assignTagsToSubtask(id, tagIds || []);
      res.json({ success: true });
    } catch (err) {
      console.error("[TAGS] POST /api/subtasks/:id/tags error:", err);
      res.status(500).json({ error: "Failed to update subtask tags" });
    }
  });

  app.delete("/api/subtasks/:id/tags/:tagId", requireAuth, async (req: any, res) => {
    try {
      const { id, tagId } = req.params;
      await storageHelper.removeTagFromSubtask(id, tagId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to remove tag from subtask" });
    }
  });

  app.post("/api/subtasks/bulk-tags", requireAuth, async (req: any, res) => {
    try {
      const { subtaskIds, tagIds, action } = req.body; // action: "add" | "remove"
      if (!Array.isArray(subtaskIds) || !Array.isArray(tagIds) || !action) {
        return res.status(400).json({ error: "Invalid payload for bulk tags" });
      }
      await storageHelper.bulkAssignSubtaskTags(subtaskIds, tagIds, action);
      res.json({ success: true, message: `Tags ${action}ed for ${subtaskIds.length} subtasks` });
    } catch (err) {
      console.error("[TAGS] Subtask bulk assign tags error:", err);
      res.status(500).json({ error: "Bulk tag assign failed" });
    }
  });

  // BULK FETCH ALL TASKS (all tasks for all authenticated users)
  app.get("/api/tasks/bulk", requireAuth, async (req: any, res) => {
    try {
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const empCode = req.employee?.empCode;
      const isE0001 = empCode === "E0001";
      const requestingEmployeeId = req.employee?.id;
      const requestingEmployeeDepartment = req.employee?.department;
      const filterStatus = req.query.status ? String(req.query.status) : "active";

      let tasks;
      let assignedTaskIds: string[] = [];

      if (isAdmin || isE0001) {
        // ADMIN FAST-PATH: Skip permission checks, just fetch filtered tasks
        console.log(`[TASKS BULK] Admin user ${empCode} - using fast-path (skip permission checks)`);
        let query = db.select().from(projectTasks);
        if (filterStatus === "active") {
          tasks = await query.where(sql`${projectTasks.status} != 'Completed' AND ${projectTasks.status} != 'completed'`);
        } else if (filterStatus === "Completed") {
          tasks = await query.where(or(eq(projectTasks.status, "Completed"), eq(projectTasks.status, "completed"), isNotNull(projectTasks.completedAt)));
        } else if (filterStatus === "Cancelled") {
          tasks = await query.where(or(eq(projectTasks.status, "Cancelled"), eq(projectTasks.status, "cancelled")));
        } else {
          tasks = await query;
        }
      } else {
        if (!requestingEmployeeId) return res.status(403).json({ error: "Forbidden" });

        const reqDeptNorm = normalizeDept(requestingEmployeeDepartment);
        const currentEmpCode = req.employee?.empCode;

        // Run all independent lookups in parallel instead of one-by-one — this was
        // the main cause of the Tasks page loading slowly for non-admin users.
        const [
          deptProjectIdsRaw,
          teamProjectIdsRaw,
          taskMemberIdsRaw,
          subtaskAssignedTaskIdsRaw,
        ] = await Promise.all([
          db.select({ projectId: projectDepartments.projectId })
            .from(projectDepartments)
            .where(eq(projectDepartments.department, reqDeptNorm)),
          db.select({ projectId: projectTeamMembers.projectId })
            .from(projectTeamMembers)
            .where(eq(projectTeamMembers.employeeId, requestingEmployeeId)),
          db.select({ taskId: taskMembers.taskId })
            .from(taskMembers)
            .where(eq(taskMembers.employeeId, requestingEmployeeId)),
          db.select({ taskId: subtasks.taskId })
            .from(subtasks)
            .leftJoin(subtaskMembers, eq(subtasks.id, subtaskMembers.subtaskId))
            .where(or(eq(subtasks.assignedTo, requestingEmployeeId), eq(subtaskMembers.employeeId, requestingEmployeeId))),
        ]);

        const deptProjectIds = deptProjectIdsRaw.map((r) => r.projectId);
        const teamProjectIds = teamProjectIdsRaw.map((r) => r.projectId);

        // Accessible projects = team member OR department match
        const accessibleProjectIds = Array.from(new Set([...deptProjectIds, ...teamProjectIds]));

        const taskMemberIds = taskMemberIdsRaw.map((r) => r.taskId);
        const subtaskAssignedTaskIds = subtaskAssignedTaskIdsRaw.map(r => r.taskId);

        assignedTaskIds = Array.from(new Set([...taskMemberIds, ...subtaskAssignedTaskIds]));

        // Visibility: tasks from accessible projects (dept/team) OR directly assigned OR created by user
        let conditions: any[] = [
          eq(projectTasks.assignerId, requestingEmployeeId),
        ];
        if (accessibleProjectIds.length > 0) {
          conditions.push(inArray(projectTasks.projectId, accessibleProjectIds));
        }

        if (assignedTaskIds.length > 0) {
          conditions.push(inArray(projectTasks.id, assignedTaskIds));
        }

        let finalConditions;
        if (filterStatus === "active") {
          finalConditions = and(or(...conditions), sql`${projectTasks.status} != 'Completed' AND ${projectTasks.status} != 'completed'`);
        } else if (filterStatus === "Completed") {
          finalConditions = and(or(...conditions), or(eq(projectTasks.status, "Completed"), eq(projectTasks.status, "completed"), isNotNull(projectTasks.completedAt)));
        } else if (filterStatus === "Cancelled") {
          finalConditions = and(or(...conditions), or(eq(projectTasks.status, "Cancelled"), eq(projectTasks.status, "cancelled")));
        } else {
          finalConditions = or(...conditions);
        }

        tasks = await db
          .select()
          .from(projectTasks)
          .where(finalConditions);
      }

      if (!tasks.length) return res.json([]);

      // Sort tasks by sortOrder
      tasks.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      const taskIds = tasks.map((t) => t.id);

      // Fetch members, CC members, tags and subtasks in parallel
      // PERF: by default we only send subtask COUNTS in the bulk/list view
      // (the expand chevron + "X subtasks" badge) — full subtask rows (with
      // descriptions, dates, per-subtask assignee joins) are fetched lazily
      // per-task via GET /api/tasks/:id/subtasks only when a row is actually
      // expanded. This was one of the largest contributors to the bulk
      // payload size for admins, since it used to be sent in full for every
      // task whether or not anyone ever expanded it.
      //
      // Some callers (e.g. the Reports PDF export) genuinely need the full
      // subtask list for every task up front — pass ?includeSubtasks=true
      // to opt into the old, heavier behavior.
      const includeSubtasks = String(req.query.includeSubtasks || "") === "true";

      const [members, ccMembers, taskTagsList, subs] = await Promise.all([
        db
          .select()
          .from(taskMembers)
          .where(inArray(taskMembers.taskId, taskIds)),
        db
          .select()
          .from(taskCcMembers)
          .where(inArray(taskCcMembers.taskId, taskIds)),
        db
          .select({
            taskId: taskTags.taskId,
            id: tags.id,
            name: tags.name
          })
          .from(taskTags)
          .innerJoin(tags, eq(taskTags.tagId, tags.id))
          .where(inArray(taskTags.taskId, taskIds)),
        includeSubtasks
          ? db.select().from(subtasks).where(inArray(subtasks.taskId, taskIds))
          : db.select({ taskId: subtasks.taskId }).from(subtasks).where(inArray(subtasks.taskId, taskIds)),
      ]);

      let subMemMap = new Map<string, string[]>();
      let subTagMap = new Map<string, any[]>();
      if (includeSubtasks) {
        const subIds = (subs as any[]).map((s) => s.id);
        const [subMemRows, subTagRows] = await Promise.all([
          subIds.length ? db.select().from(subtaskMembers).where(inArray(subtaskMembers.subtaskId, subIds)) : Promise.resolve([]),
          subIds.length
            ? db
              .select({ subtaskId: subtaskTags.subtaskId, id: tags.id, name: tags.name })
              .from(subtaskTags)
              .innerJoin(tags, eq(subtaskTags.tagId, tags.id))
              .where(inArray(subtaskTags.subtaskId, subIds))
            : Promise.resolve([]),
        ]);
        subMemRows.forEach((rm) => {
          if (!subMemMap.has(rm.subtaskId)) subMemMap.set(rm.subtaskId, []);
          subMemMap.get(rm.subtaskId)!.push(rm.employeeId);
        });
        subTagRows.forEach((r: any) => {
          if (!subTagMap.has(r.subtaskId)) subTagMap.set(r.subtaskId, []);
          subTagMap.get(r.subtaskId)!.push({ id: r.id, name: r.name });
        });
      }

      // Build maps for O(1) lookups instead of O(n) filtering
      const memberMap = new Map<string, string[]>();
      const ccMemberMap = new Map<string, string[]>();
      const tagMap = new Map<string, any[]>();
      const subtaskCountMap = new Map<string, number>();
      const subtaskMap = new Map<string, any[]>();

      members.forEach((m) => {
        if (!memberMap.has(m.taskId)) memberMap.set(m.taskId, []);
        memberMap.get(m.taskId)!.push(m.employeeId);
      });

      ccMembers.forEach((m) => {
        if (!ccMemberMap.has(m.taskId)) ccMemberMap.set(m.taskId, []);
        ccMemberMap.get(m.taskId)!.push(m.employeeId);
      });

      taskTagsList.forEach((t) => {
        if (!tagMap.has(t.taskId)) tagMap.set(t.taskId, []);
        tagMap.get(t.taskId)!.push({ id: t.id, name: t.name });
      });

      (subs as any[]).forEach((s) => {
        subtaskCountMap.set(s.taskId, (subtaskCountMap.get(s.taskId) || 0) + 1);
        if (includeSubtasks) {
          if (!subtaskMap.has(s.taskId)) subtaskMap.set(s.taskId, []);
          subtaskMap.get(s.taskId)!.push({
            ...s,
            assignedTo: subMemMap.get(s.id) || (s.assignedTo ? [s.assignedTo] : []),
            tags: subTagMap.get(s.id) || [],
          });
        }
      });

      // Build result with members, CC members, tags and subtask counts
      const result = tasks.map((task) => ({
        ...task,
        assignedMembers: memberMap.get(task.id) || [],
        ccMembers: ccMemberMap.get(task.id) || [],
        tags: tagMap.get(task.id) || [],
        subtaskCount: subtaskCountMap.get(task.id) || 0,
        ...(includeSubtasks ? { subtasks: subtaskMap.get(task.id) || [] } : {}),
      }));

      res.json(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Bulk tasks fetch error:", errorMessage);
      res.status(500).json({ error: "Failed to fetch tasks", details: errorMessage });
    }
  });

  // BULK FETCH ALL KEY STEPS (all key steps for all authenticated users)
  app.get("/api/keysteps/bulk", requireAuth, async (req: any, res) => {
    try {
      const filterStatus = req.query.status ? String(req.query.status) : "active";
      let statusCondition: any = undefined;

      if (filterStatus === "active") {
        statusCondition = sql`${keySteps.status} != 'completed' AND ${keySteps.status} != 'Completed'`;
      } else if (filterStatus === "Completed") {
        statusCondition = or(eq(keySteps.status, "completed"), eq(keySteps.status, "Completed"));
      } else if (filterStatus === "Cancelled") {
        statusCondition = or(eq(keySteps.status, "cancelled"), eq(keySteps.status, "Cancelled"));
      }

      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const requestingEmployeeId = req.employee?.id;
      const requestingEmployeeDepartment = req.employee?.department;

      let steps: any[] = [];
      if (isAdmin) {
        let query = db.select().from(keySteps);
        if (statusCondition) {
          query = query.where(statusCondition) as any;
        }
        steps = await query.orderBy(sql`${keySteps.createdAt} DESC`);
      } else {
        if (!requestingEmployeeId) return res.json([]);

        // For normal users, show primary keysteps if:
        // 1. They are in a project that matches their department
        const reqDeptNorm = normalizeDept(requestingEmployeeDepartment);
        const deptProjectIdsRaw = await db
          .select({ projectId: projectDepartments.projectId })
          .from(projectDepartments)
          .where(eq(projectDepartments.department, reqDeptNorm));
        const deptProjectIds = deptProjectIdsRaw.map((r) => r.projectId);

        // 2. They are explicitly in the project team
        const teamProjectIdsRaw = await db
          .select({ projectId: projectTeamMembers.projectId })
          .from(projectTeamMembers)
          .where(eq(projectTeamMembers.employeeId, requestingEmployeeId));
        const teamProjectIds = teamProjectIdsRaw.map((r) => r.projectId);

        // 3. Projects containing a task they created or are assigned to —
        // mirrors /api/tasks/bulk's visibility rule. Without this, a project
        // visible via task ownership (rather than dept/team membership) would
        // return zero key steps here, making every task in it display
        // "No Key Step" even when it has a real keyStepId set.
        const [assignerTaskProjectIdsRaw, memberTaskProjectIdsRaw] = await Promise.all([
          db.select({ projectId: projectTasks.projectId })
            .from(projectTasks)
            .where(eq(projectTasks.assignerId, requestingEmployeeId)),
          db.select({ projectId: projectTasks.projectId })
            .from(projectTasks)
            .innerJoin(taskMembers, eq(taskMembers.taskId, projectTasks.id))
            .where(eq(taskMembers.employeeId, requestingEmployeeId)),
        ]);
        const taskAccessProjectIds = [
          ...assignerTaskProjectIdsRaw.map((r) => r.projectId),
          ...memberTaskProjectIdsRaw.map((r) => r.projectId),
        ];

        const accessibleProjectIds = Array.from(new Set([...deptProjectIds, ...teamProjectIds, ...taskAccessProjectIds]));

        if (accessibleProjectIds.length === 0) {
          steps = [];
        } else {
          const projectAccessCond = inArray(keySteps.projectId, accessibleProjectIds);
          const combinedCond = statusCondition ? and(statusCondition, projectAccessCond) : projectAccessCond;

          steps = await db.select().from(keySteps)
            .where(combinedCond)
            .orderBy(sql`${keySteps.createdAt} DESC`);
        }
      }
      res.json(steps);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Bulk keysteps fetch error:", errorMessage);
      res.status(500).json({ error: "Failed to fetch keysteps", details: errorMessage });
    }
  });

  // GET TASKS BY PROJECT
  app.get("/api/tasks/:projectId", requireAuth, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const empCode = req.employee?.empCode;
      const isE0001 = empCode === "E0001";
      const requestingEmployeeId = req.employee?.id;
      const requestingEmployeeDepartment = req.employee?.department;

      // First, get the tasks for the project
      const filterStatus = req.query.status ? String(req.query.status) : "active";
      const projectIdCond = eq(projectTasks.projectId, projectId);

      let finalCond;
      if (filterStatus === "active") {
        finalCond = and(projectIdCond, sql`${projectTasks.status} != 'Completed' AND ${projectTasks.status} != 'completed'`);
      } else if (filterStatus === "Completed") {
        finalCond = and(projectIdCond, or(eq(projectTasks.status, "Completed"), eq(projectTasks.status, "completed")));
      } else {
        finalCond = projectIdCond;
      }

      const allProjectTasks = await db
        .select()
        .from(projectTasks)
        .where(finalCond);

      if (!allProjectTasks.length) return res.json([]);

      let tasks;
      let userTaskMemberIds: string[] = [];
      let assignedTaskIds: string[] = [];
      if (isAdmin || isE0001) {
        tasks = allProjectTasks;
      } else {
        if (!requestingEmployeeId) return res.status(403).json({ error: "Forbidden" });

        const reqDeptNorm = normalizeDept(requestingEmployeeDepartment);

        // Check if the employee has project-level access (department match OR team membership OR creator)
        const [deptMatch, teamMatch] = await Promise.all([
          db.select({ id: projectDepartments.projectId })
            .from(projectDepartments)
            .where(and(eq(projectDepartments.projectId, projectId), eq(projectDepartments.department, reqDeptNorm))),
          db.select({ id: projectTeamMembers.projectId })
            .from(projectTeamMembers)
            .where(and(eq(projectTeamMembers.projectId, projectId), eq(projectTeamMembers.employeeId, requestingEmployeeId))),
        ]);

        const hasProjectAccess = deptMatch.length > 0 || teamMatch.length > 0;

        if (hasProjectAccess) {
          // User has project-level access — show ALL tasks in the project
          tasks = allProjectTasks;
          debug(`[TASKS-API] Project: ${projectId}, User has project access — showing all ${allProjectTasks.length} tasks, User: ${requestingEmployeeId}`);
        } else {
          // No dept/team project access — check if user is assigned to ANY task in this project.
          // If yes, they are a project participant and should see all tasks (matches production behaviour).
          const [taskMemberIdsRaw, subtaskAssignedTaskIdsRaw] = await Promise.all([
            db.select({ taskId: taskMembers.taskId })
              .from(taskMembers)
              .where(eq(taskMembers.employeeId, requestingEmployeeId)),
            db.select({ taskId: subtasks.taskId })
              .from(subtasks)
              .leftJoin(subtaskMembers, eq(subtasks.id, subtaskMembers.subtaskId))
              .where(or(eq(subtasks.assignedTo, requestingEmployeeId), eq(subtaskMembers.employeeId, requestingEmployeeId))),
          ]);
          const taskMemberIds = taskMemberIdsRaw.map((r) => r.taskId);
          const subtaskAssignedTaskIds = subtaskAssignedTaskIdsRaw.map(r => r.taskId);

          assignedTaskIds = Array.from(new Set([...taskMemberIds, ...subtaskAssignedTaskIds]));

          // Check if the user has any connection to this specific project
          const projectTaskIds = allProjectTasks.map(t => t.id);
          const isProjectParticipant =
            assignedTaskIds.some(id => projectTaskIds.includes(id)) ||
            allProjectTasks.some(t => t.assignerId === requestingEmployeeId);

          if (isProjectParticipant) {
            // User is a participant in this project — show ALL project tasks
            tasks = allProjectTasks;
            debug(`[TASKS-API] Project: ${projectId}, User is project participant — showing all ${allProjectTasks.length} tasks, User: ${requestingEmployeeId}`);
          } else {
            // User has no connection to this project at all — show only their assigned tasks
            tasks = allProjectTasks.filter(t => assignedTaskIds.includes(t.id) || t.assignerId === requestingEmployeeId);
            debug(`[TASKS-API] Project: ${projectId}, No project connection — showing ${tasks.length}/${allProjectTasks.length} tasks, User: ${requestingEmployeeId}`);
          }
        }
      }

      // Filter by status if requested (secondary filter since allProjectTasks was already filtered by status at line 1984)
      // Actually, line 1984 already applied the status filter to allProjectTasks.
      // So 'tasks' here is already status-filtered.

      if (!tasks.length) return res.json([]);

      const taskIds = tasks.map((t) => t.id);

      // Fetch members, CC members, tags and subtasks in parallel
      const [members, ccMembersProjectFetch, taskTagsList, subs] = await Promise.all([
        db
          .select({
            taskId: taskMembers.taskId,
            employeeId: taskMembers.employeeId,
          })
          .from(taskMembers)
          .where(inArray(taskMembers.taskId, taskIds)),
        db
          .select({
            taskId: taskCcMembers.taskId,
            employeeId: taskCcMembers.employeeId,
          })
          .from(taskCcMembers)
          .where(inArray(taskCcMembers.taskId, taskIds)),
        db
          .select({
            taskId: taskTags.taskId,
            id: tags.id,
            name: tags.name
          })
          .from(taskTags)
          .innerJoin(tags, eq(taskTags.tagId, tags.id))
          .where(inArray(taskTags.taskId, taskIds)),
        // Select every subtask column (not a hand-picked subset) so any new
        // task-parity fields (keyStepId, taskPeriod, reminderFrequency,
        // assignerId, durationDays, completionDate, plus taskOwnerId,
        // priority, status, ccMembers) flow through automatically.
        db
          .select()
          .from(subtasks)
          .where(inArray(subtasks.taskId, taskIds)),
      ]);

      // Fetch subtask member mappings and tags for subtasks we just retrieved
      let subtaskMemberRows: any[] = [];
      let subtaskTagRows: any[] = [];
      try {
        const subtaskIds = subs.map((s: any) => s.id).filter(Boolean);
        if (subtaskIds.length > 0) {
          [subtaskMemberRows, subtaskTagRows] = await Promise.all([
            db
              .select()
              .from(subtaskMembers)
              .where(inArray(subtaskMembers.subtaskId, subtaskIds)),
            db
              .select({ subtaskId: subtaskTags.subtaskId, id: tags.id, name: tags.name })
              .from(subtaskTags)
              .innerJoin(tags, eq(subtaskTags.tagId, tags.id))
              .where(inArray(subtaskTags.subtaskId, subtaskIds)),
          ]);
        }
      } catch (e) {
        subtaskMemberRows = [];
        subtaskTagRows = [];
      }

      // Build maps for O(1) lookups
      const memberMap = new Map<string, string[]>();
      const ccMemberProjectMap = new Map<string, string[]>();
      const tagMap = new Map<string, any[]>();
      const subtaskMap = new Map<string, any[]>();
      const subtaskMembersMap = new Map<string, string[]>();
      const subtaskTagMap = new Map<string, any[]>();

      (subtaskMemberRows || []).forEach((r: any) => {
        if (!subtaskMembersMap.has(r.subtaskId)) subtaskMembersMap.set(r.subtaskId, []);
        subtaskMembersMap.get(r.subtaskId)!.push(r.employeeId);
      });

      (subtaskTagRows || []).forEach((r: any) => {
        if (!subtaskTagMap.has(r.subtaskId)) subtaskTagMap.set(r.subtaskId, []);
        subtaskTagMap.get(r.subtaskId)!.push({ id: r.id, name: r.name });
      });

      members.forEach((m) => {
        if (!memberMap.has(m.taskId)) memberMap.set(m.taskId, []);
        memberMap.get(m.taskId)!.push(m.employeeId);
      });

      ccMembersProjectFetch.forEach((m) => {
        if (!ccMemberProjectMap.has(m.taskId)) ccMemberProjectMap.set(m.taskId, []);
        ccMemberProjectMap.get(m.taskId)!.push(m.employeeId);
      });

      taskTagsList.forEach((t) => {
        if (!tagMap.has(t.taskId)) tagMap.set(t.taskId, []);
        tagMap.get(t.taskId)!.push({ id: t.id, name: t.name });
      });

      subs.forEach((s) => {
        if (!subtaskMap.has(s.taskId)) subtaskMap.set(s.taskId, []);

        // Visibility Check for subtasks: if the user can see the task, they can see its subtasks.
        // Subtasks are already filtered because we only query subtasks for visible tasks.

        const assigned = subtaskMembersMap.get(s.id) || (s.assignedTo ? [s.assignedTo] : []);
        subtaskMap.get(s.taskId)!.push({
          ...s,
          assignedTo: assigned,
          tags: subtaskTagMap.get(s.id) || [],
        });
      });

      // Bulk fetch owner names
      const ownerIds = Array.from(new Set(tasks.map((t: any) => t.taskOwnerId).filter(Boolean)));
      const ownerMap = new Map<string, string>();
      if (ownerIds.length > 0) {
        const ownerRows = await db.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, ownerIds as string[]));
        ownerRows.forEach((o: any) => ownerMap.set(o.id, o.name));
      }
      const result = tasks
        .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((t) => ({
          ...t,
          taskMembers: memberMap.get(t.id) || [],
          ccMembers: ccMemberProjectMap.get(t.id) || [],
          tags: tagMap.get(t.id) || [],
          subtasks: subtaskMap.get(t.id) || [],
          ownerName: t.taskOwnerId ? (ownerMap.get(t.taskOwnerId) || null) : null,
        }));

      res.json(result);
    } catch (err) {
      console.error("Task fetch error:", err);
      res.status(500).json([]);
    }
  });

  // GET SINGLE TASK BY ID
  app.get("/api/task/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const empCode = req.employee?.empCode;
      const isE0001 = empCode === "E0001";
      const requestingEmployeeId = req.employee?.id;
      const requestingEmployeeDepartment = req.employee?.department;

      const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, id)).limit(1);
      if (!task) return res.status(404).json({ message: "Task not found" });

      // Permission Check
      if (!isAdmin && !isE0001) {
        if (!requestingEmployeeId) return res.status(403).json({ error: "Forbidden" });

        // Check if user is a member of this task
        const membership = await db
          .select()
          .from(taskMembers)
          .where(and(eq(taskMembers.taskId, id), eq(taskMembers.employeeId, requestingEmployeeId)));

        const isMember = membership.length > 0;

        if (!isMember) {
          // Check if project department matches
          const reqDeptNorm = normalizeDept(requestingEmployeeDepartment);
          const projectDeptsRaw = await db
            .select()
            .from(projectDepartments)
            .where(and(eq(projectDepartments.projectId, task.projectId), eq(projectDepartments.department, reqDeptNorm)));

          if (projectDeptsRaw.length === 0) {
            return res.status(403).json({ error: "Access denied to this task" });
          }
        }
      }

      const [members, subs, tagsList] = await Promise.all([
        db
          .select({ taskId: taskMembers.taskId, employeeId: taskMembers.employeeId })
          .from(taskMembers)
          .where(eq(taskMembers.taskId, id)),
        db
          .select()
          .from(subtasks)
          .where(eq(subtasks.taskId, id)),
        db
          .select({ id: tags.id, name: tags.name })
          .from(taskTags)
          .innerJoin(tags, eq(taskTags.tagId, tags.id))
          .where(eq(taskTags.taskId, id))
      ]);

      // Fetch subtask members + tags mapping for these subtasks
      const subtaskIds = subs.map((s: any) => s.id).filter(Boolean);
      let subtaskMemberRows: any[] = [];
      let subtaskTagRows: any[] = [];
      if (subtaskIds.length > 0) {
        try {
          [subtaskMemberRows, subtaskTagRows] = await Promise.all([
            db
              .select({ subtaskId: subtaskMembers.subtaskId, employeeId: subtaskMembers.employeeId })
              .from(subtaskMembers)
              .where(inArray(subtaskMembers.subtaskId, subtaskIds)),
            db
              .select({ subtaskId: subtaskTags.subtaskId, id: tags.id, name: tags.name })
              .from(subtaskTags)
              .innerJoin(tags, eq(subtaskTags.tagId, tags.id))
              .where(inArray(subtaskTags.subtaskId, subtaskIds)),
          ]);
        } catch (e) {
          subtaskMemberRows = [];
          subtaskTagRows = [];
        }
      }

      const subtaskMembersMap = new Map<string, string[]>();
      subtaskMemberRows.forEach((r: any) => {
        if (!subtaskMembersMap.has(r.subtaskId)) subtaskMembersMap.set(r.subtaskId, []);
        subtaskMembersMap.get(r.subtaskId)!.push(r.employeeId);
      });

      const subtaskTagMap = new Map<string, any[]>();
      subtaskTagRows.forEach((r: any) => {
        if (!subtaskTagMap.has(r.subtaskId)) subtaskTagMap.set(r.subtaskId, []);
        subtaskTagMap.get(r.subtaskId)!.push({ id: r.id, name: r.name });
      });

      let ownerName: string | null = null;
      if ((task as any).taskOwnerId) {
        const [ownerEmp] = await db.select({ name: employees.name }).from(employees).where(eq(employees.id, (task as any).taskOwnerId)).limit(1);
        ownerName = ownerEmp?.name || null;
      }
      const result = {
        ...task,
        taskMembers: members.map((m) => m.employeeId),
        tags: tagsList,
        subtasks: subs.map((s) => ({
          ...s,
          assignedTo: subtaskMembersMap.get(s.id) || (s.assignedTo ? [s.assignedTo] : []),
          tags: subtaskTagMap.get(s.id) || [],
        })),
        ownerName,
      };

      res.json(result);
    } catch (err) {
      console.error("Get single task error:", err);
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  /* ===============================
      FILES & VENDORS
  ================================ */
  app.post(
    "/api/projects/:id/upload",
    requireAuth,
    upload.single("file"),
    async (req: any, res) => {
      if (!req.file) return res.status(400).json({ error: "No file" });

      try {
        // ensure user can upload to this project
        const projectId = req.params.id;
        const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
        if (!isAdmin) {
          const membership = await db
            .select()
            .from(projectTeamMembers)
            .where(and(eq(projectTeamMembers.projectId, projectId), eq(projectTeamMembers.employeeId, req.employee?.id)));
          if (!membership || membership.length === 0) return res.status(403).json({ error: "Unauthorized" });
        }
        const filePath = `/uploads/${req.file.filename}`;
        const [inserted] = await db
          .insert(projectFiles)
          .values({
            projectId: req.params.id,
            fileName: req.file.originalname,
            filePath: filePath, // Ensure column exists in DB
            fileUrl: filePath,
            fileSize: req.file.size,
            uploadedBy: req.user?.id || null,
          } as any)
          .returning();

        res.json(inserted);
      } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({
          error:
            "Upload failed. Please check if 'file_path' and 'uploaded_by' columns exist in your database.",
        });
      }
    },
  );

  app.get("/api/projects/:id/files", requireAuth, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      if (!isAdmin) {
        const membership = await db
          .select()
          .from(projectTeamMembers)
          .where(and(eq(projectTeamMembers.projectId, projectId), eq(projectTeamMembers.employeeId, req.employee?.id)));
        if (!membership || membership.length === 0) return res.status(403).json({ error: "Unauthorized" });
      }

      const files = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.projectId, projectId));
      res.json(files);
    } catch (err) {
      res.status(500).json([]);
    }
  });

  // Download file
  app.get("/api/projects/:projectId/files/:fileId/download", requireAuth, async (req: any, res) => {
    try {
      const { projectId, fileId } = req.params;
      const file = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.id, fileId))
        .limit(1);

      if (!file || file.length === 0) {
        return res.status(404).json({ error: "File not found" });
      }

      const fileRecord = file[0];
      if (fileRecord.projectId !== projectId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Ensure user has access to the project
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      if (!isAdmin) {
        const membership = await db
          .select()
          .from(projectTeamMembers)
          .where(and(eq(projectTeamMembers.projectId, projectId), eq(projectTeamMembers.employeeId, req.employee?.id)));
        if (!membership || membership.length === 0) return res.status(403).json({ error: "Unauthorized" });
      }

      const filePath = (fileRecord as any).filePath || fileRecord.storageUrl;
      if (!filePath) {
        return res.status(404).json({ error: "File path not found" });
      }

      // Construct full file path
      const fullPath = filePath.startsWith("/")
        ? `${process.cwd()}${filePath}`
        : `${process.cwd()}/${filePath}`;

      res.download(fullPath, fileRecord.fileName);
    } catch (err) {
      console.error("File download error:", err);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  {/* 
  app.get("/api/vendors", async (_req, res) => {
    try {
      const all = await db.select().from(vendors);
      res.json(all);
    } catch (err) {
      res.status(500).json([]);
    }
  });
*/}

  /* ===============================
     DISCUSSIONS
  ================================ */

  // Multi-file upload for discussions
  app.post("/api/discussions/upload", requireAuth, upload.array("files"), async (req: any, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const uploadedFiles = files.map(file => ({
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageUrl: `/uploads/${file.filename}`,
      }));

      res.json(uploadedFiles);
    } catch (err: any) {
      console.error("Discussion upload failed:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // GET all discussions for current employee
  app.get("/api/discussions", requireAuth, async (req: any, res) => {
    try {
      const empId = req.employee?.id;
      if (!empId) return res.status(403).json({ error: "Employee profile required" });

      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const userDept = req.employee?.department;

      // Base query only joins `employees` for the creator name/department.
      // We deliberately do NOT join discussion_participants here anymore —
      // that join multiplied every discussion row by its participant count
      // (and then got deduped in JS), which was pure wasted DB + network work.
      const baseQuery = db
        .select({
          id: discussions.id,
          title: discussions.title,
          content: discussions.content,
          createdBy: discussions.createdBy,
          createdAt: discussions.createdAt,
          updatedAt: discussions.updatedAt,
          creatorName: employees.name,
          creatorDept: employees.department,
        })
        .from(discussions)
        .leftJoin(employees, eq(discussions.createdBy, employees.id));

      let result;
      if (isAdmin) {
        result = await baseQuery.orderBy(sql`${discussions.createdAt} DESC`);
      } else {
        // Resolve which discussions this employee participates in with a
        // lightweight, indexed lookup instead of a row-multiplying join.
        const participantRows = await db
          .select({ discussionId: discussionParticipants.discussionId })
          .from(discussionParticipants)
          .where(eq(discussionParticipants.employeeId, empId));
        const participantDiscussionIds = participantRows.map((r) => r.discussionId);

        const conditions = [eq(discussions.createdBy, empId)];
        if (participantDiscussionIds.length > 0) {
          conditions.push(inArray(discussions.id, participantDiscussionIds));
        }
        if (userDept) {
          conditions.push(eq(employees.department, userDept));
        }
        result = await baseQuery
          .where(or(...conditions))
          .orderBy(sql`${discussions.createdAt} DESC`);
      }

      res.json(result);
    } catch (err: any) {
      console.error("Fetch discussions failed:", err);
      res.status(500).json({ error: "Failed to fetch discussions" });
    }
  });

  // GET specific discussion details
  app.get("/api/discussions/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const empId = req.employee?.id;
      if (!empId) return res.status(403).json({ error: "Employee profile required" });

      // Check if participant
      const [isParticipant] = await db
        .select()
        .from(discussionParticipants)
        .where(
          and(
            eq(discussionParticipants.discussionId, id),
            eq(discussionParticipants.employeeId, empId)
          )
        );

      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const userDept = req.employee?.department;

      const [discussion] = await db
        .select({
          id: discussions.id,
          title: discussions.title,
          content: discussions.content,
          createdBy: discussions.createdBy,
          createdAt: discussions.createdAt,
          creatorName: employees.name,
          creatorDept: employees.department,
        })
        .from(discussions)
        .leftJoin(employees, eq(discussions.createdBy, employees.id))
        .where(eq(discussions.id, id));

      if (!discussion) return res.status(404).json({ error: "Discussion not found" });

      const isCreator = discussion.createdBy === empId;
      const isSameDept = userDept && discussion.creatorDept === userDept;

      if (!isAdmin && !isCreator && !isParticipant && !isSameDept) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Fetch replies
      const replies = await db
        .select({
          id: discussionReplies.id,
          content: discussionReplies.content,
          createdBy: discussionReplies.createdBy,
          createdAt: discussionReplies.createdAt,
          creatorName: employees.name,
        })
        .from(discussionReplies)
        .leftJoin(employees, eq(discussionReplies.createdBy, employees.id))
        .where(eq(discussionReplies.discussionId, id))
        .orderBy(sql`${discussionReplies.createdAt} ASC`);

      // Fetch attachments
      const attachments = await db
        .select()
        .from(discussionAttachments)
        .where(eq(discussionAttachments.discussionId, id));

      // Fetch participants
      const participants = await db
        .select({
          id: employees.id,
          name: employees.name,
        })
        .from(discussionParticipants)
        .leftJoin(employees, eq(discussionParticipants.employeeId, employees.id))
        .where(eq(discussionParticipants.discussionId, id));

      res.json({
        ...discussion,
        replies,
        attachments,
        participants,
      });
    } catch (err: any) {
      console.error("Fetch discussion detail failed:", err);
      res.status(500).json({ error: "Failed to fetch discussion details" });
    }
  });

  // POST new discussion
  app.post("/api/discussions", requireAuth, async (req: any, res) => {
    try {
      const { title, content, participantIds, attachments } = req.body;
      const empId = req.employee?.id;
      if (!empId) return res.status(403).json({ error: "Employee profile required" });

      if (!title || !content) return res.status(400).json({ error: "Title and content required" });

      const [newDiscussion] = await db.insert(discussions).values({
        title,
        content,
        createdBy: empId,
      }).returning();

      // Add self as participant
      await db.insert(discussionParticipants).values({
        discussionId: newDiscussion.id,
        employeeId: empId,
      });

      // Add other participants
      if (participantIds && Array.isArray(participantIds)) {
        const otherParticipants = participantIds
          .filter(id => id !== empId)
          .map(id => ({
            discussionId: newDiscussion.id,
            employeeId: id,
          }));
        if (otherParticipants.length > 0) {
          await db.insert(discussionParticipants).values(otherParticipants);
        }
      }

      // Add attachments
      if (attachments && Array.isArray(attachments)) {
        const attachmentData = attachments.map(att => ({
          discussionId: newDiscussion.id,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          storageUrl: att.storageUrl,
        }));
        if (attachmentData.length > 0) {
          await db.insert(discussionAttachments).values(attachmentData);
        }
      }

      res.status(201).json(newDiscussion);
    } catch (err: any) {
      console.error("Create discussion failed:", err);
      res.status(500).json({ error: "Failed to create discussion" });
    }
  });

  // POST reply to discussion
  app.post("/api/discussions/:id/replies", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { content, attachments } = req.body;
      const empId = req.employee?.id;
      if (!empId) return res.status(403).json({ error: "Employee profile required" });

      if (!content) return res.status(400).json({ error: "Reply content required" });

      // Security Check
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const userDept = req.employee?.department;

      // Check if participant
      const [isParticipant] = await db
        .select()
        .from(discussionParticipants)
        .where(
          and(
            eq(discussionParticipants.discussionId, id),
            eq(discussionParticipants.employeeId, empId)
          )
        );

      const [discussion] = await db
        .select({
          id: discussions.id,
          createdBy: discussions.createdBy,
          creatorDept: employees.department,
        })
        .from(discussions)
        .leftJoin(employees, eq(discussions.createdBy, employees.id))
        .where(eq(discussions.id, id));

      if (!discussion) return res.status(404).json({ error: "Discussion not found" });

      const isCreator = discussion.createdBy === empId;
      const isSameDept = userDept && discussion.creatorDept === userDept;

      if (!isAdmin && !isCreator && !isSameDept && !isParticipant) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [reply] = await db.insert(discussionReplies).values({
        discussionId: id,
        content,
        createdBy: empId,
      }).returning();

      // Add attachments for reply
      if (attachments && Array.isArray(attachments)) {
        const attachmentData = attachments.map(att => ({
          discussionId: id,
          replyId: reply.id,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          storageUrl: att.storageUrl,
        }));
        if (attachmentData.length > 0) {
          await db.insert(discussionAttachments).values(attachmentData);
        }
      }

      res.status(201).json(reply);
    } catch (err: any) {
      console.error("Post reply failed:", err);
      res.status(500).json({ error: "Failed to post reply" });
    }
  });

  /* ===============================
      PROJECT ANALYTICS (REAL DATA)
  ================================ */
  app.get("/api/analytics/projects", requireAuth, async (req: any, res) => {
    try {
      // 1. Fetch all core data in parallel
      // OPTIMIZATION: Add 6-month date filter to reduce data volume from 50K+ to ~5K rows
      const sixMonthsAgo = sql`NOW() - INTERVAL '6 months'`;
      const [
        allProjects,
        allEmployees,
        allTasks,
        allTeamMembers,
        allTaskMemberRows,
        allTickets,
        allProgressLogs,
        allKeyStepsRows
      ] = await Promise.all([
        db.select().from(projects).where(sql`${projects.createdAt} > ${sixMonthsAgo}`),
        db.select().from(employees),
        db.select().from(projectTasks).where(sql`${projectTasks.createdAt} > ${sixMonthsAgo}`),
        db.select({
          projectId: projectTeamMembers.projectId,
          employeeId: projectTeamMembers.employeeId,
          empName: employees.name,
          empCode: employees.empCode,
          empDepartment: employees.department,
          empEmail: employees.email,
        }).from(projectTeamMembers)
          .innerJoin(employees, eq(projectTeamMembers.employeeId, employees.id)),
        db.select().from(taskMembers),
        db.select().from(tickets).where(sql`${tickets.createdAt} > ${sixMonthsAgo}`),
        db.select().from(progressLogs).where(sql`${progressLogs.updatedAt} > ${sixMonthsAgo}`).orderBy(desc(progressLogs.updatedAt)),
        db.select().from(keySteps).where(sql`${keySteps.createdAt} > ${sixMonthsAgo}`),
      ]);

      // 2. Index data for fast lookups
      const employeeMap = new Map(allEmployees.map(e => [e.id, e]));
      const tasksByProject: Record<string, any[]> = {};
      const teamByProject: Record<string, any[]> = {};
      const taskMembersByTask: Record<string, string[]> = {};
      const ticketsByProject: Record<string, any[]> = {};
      const progressByProject: Record<string, any[]> = {};
      const keyStepsByProject: Record<string, any[]> = {};

      allTasks.forEach(t => {
        const pid = t.projectId;
        if (!tasksByProject[pid]) tasksByProject[pid] = [];
        tasksByProject[pid].push(t);
      });

      allTeamMembers.forEach(m => {
        const pid = m.projectId;
        if (!teamByProject[pid]) teamByProject[pid] = [];
        teamByProject[pid].push(m);
      });

      allTaskMemberRows.forEach(tm => {
        if (!taskMembersByTask[tm.taskId]) taskMembersByTask[tm.taskId] = [];
        taskMembersByTask[tm.taskId].push(tm.employeeId);
      });

      allTickets.forEach(t => {
        if (t.projectId) {
          if (!ticketsByProject[t.projectId]) ticketsByProject[t.projectId] = [];
          ticketsByProject[t.projectId].push(t);
        }
      });

      allProgressLogs.forEach(pl => {
        if (pl.projectId) {
          if (!progressByProject[pl.projectId]) progressByProject[pl.projectId] = [];
          progressByProject[pl.projectId].push(pl);
        }
      });

      allKeyStepsRows.forEach(ks => {
        if (!keyStepsByProject[ks.projectId]) keyStepsByProject[ks.projectId] = [];
        keyStepsByProject[ks.projectId].push(ks);
      });

      // 3. Build analytics for each project
      const projectAnalytics = allProjects.map(proj => {
        const projTasks = tasksByProject[proj.id] || [];
        const projTeam = teamByProject[proj.id] || [];
        const projTickets = ticketsByProject[proj.id] || [];
        const projProgress = progressByProject[proj.id] || [];
        const projKeySteps = keyStepsByProject[proj.id] || [];

        // Task statistics
        const totalTasks = projTasks.length;
        const completedTasks = projTasks.filter(t =>
          ["completed", "done", "closed", "finish", "finished"].includes(String(t.status).toLowerCase())
        ).length;
        const pendingTasks = totalTasks - completedTasks;
        const delayedTasks = projTasks.filter(t => {
          if (!t.endDate) return false;
          const isPast = new Date(t.endDate) < new Date();
          const isComplete = ["completed", "done", "closed", "finish", "finished"].includes(String(t.status).toLowerCase());
          return (isPast && !isComplete) || (t.completedAt && new Date(t.completedAt) > new Date(t.endDate));
        }).length;
        const completionPct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

        // Key step statistics
        const totalKeySteps = projKeySteps.length;
        const completedKeySteps = projKeySteps.filter(ks =>
          ["completed", "done", "closed"].includes(String(ks.status).toLowerCase())
        ).length;

        // Ticket statistics
        const openTickets = projTickets.filter(t => t.status === "Open" || t.status === "In Progress").length;
        const resolvedTickets = projTickets.filter(t => t.status === "Resolved" || t.status === "Closed").length;

        // Employee contributions - REAL data from taskMembers
        const employeeTaskMap: Record<string, { assigned: number; completed: number; inProgress: number; taskIds: string[] }> = {};

        projTasks.forEach(task => {
          const memberIds = taskMembersByTask[task.id] || [];
          // Also include the assigner/creator
          const allInvolved = Array.from(new Set([...memberIds, task.assignerId].filter(Boolean)));

          allInvolved.forEach(empId => {
            if (!employeeTaskMap[empId]) {
              employeeTaskMap[empId] = { assigned: 0, completed: 0, inProgress: 0, taskIds: [] };
            }
            employeeTaskMap[empId].assigned++;
            employeeTaskMap[empId].taskIds.push(task.id);
            const status = String(task.status).toLowerCase();
            if (["completed", "done", "closed", "finish", "finished"].includes(status)) {
              employeeTaskMap[empId].completed++;
            } else if (["in-progress", "in progress", "active"].includes(status)) {
              employeeTaskMap[empId].inProgress++;
            }
          });
        });

        // Build employee logs from REAL team members + task data
        const employeeLogs = projTeam.map(member => {
          const empData = employeeTaskMap[member.employeeId] || { assigned: 0, completed: 0, inProgress: 0, taskIds: [] };
          const completionRate = empData.assigned > 0 ? Math.round((empData.completed / empData.assigned) * 100) : 0;

          return {
            id: member.employeeId,
            name: member.empName,
            empCode: member.empCode || "N/A",
            department: member.empDepartment || "Unassigned",
            email: member.empEmail || "",
            tasksAssigned: empData.assigned,
            tasksCompleted: empData.completed,
            tasksInProgress: empData.inProgress,
            completionRate,
          };
        });

        // Also include task assignees who are NOT in projectTeamMembers
        const teamMemberIds = new Set(projTeam.map(m => m.employeeId));
        Object.entries(employeeTaskMap).forEach(([empId, data]) => {
          if (!teamMemberIds.has(empId)) {
            const emp = employeeMap.get(empId);
            if (emp) {
              employeeLogs.push({
                id: empId,
                name: emp.name,
                empCode: emp.empCode || "N/A",
                department: emp.department || "Unassigned",
                email: emp.email || "",
                tasksAssigned: data.assigned,
                tasksCompleted: data.completed,
                tasksInProgress: data.inProgress,
                completionRate: data.assigned > 0 ? Math.round((data.completed / data.assigned) * 100) : 0,
              });
            }
          }
        });

        // Sort by tasks assigned descending
        employeeLogs.sort((a, b) => b.tasksAssigned - a.tasksAssigned);

        // Health score based on REAL metrics
        const healthScore = Math.max(0, Math.min(100, Math.round(
          (completionPct * 0.5) +
          ((totalTasks > 0 ? Math.max(0, 100 - (delayedTasks / totalTasks) * 100) : 100) * 0.3) +
          ((projTickets.length > 0 ? Math.max(0, 100 - (openTickets / projTickets.length) * 100) : 100) * 0.2)
        )));
        const healthCategory = healthScore >= 85 ? "Excellent" : healthScore >= 65 ? "Good" : healthScore >= 40 ? "Risk" : "Critical";

        // Daily activity timeline from real progress logs and task dates
        const dailyActivity: Record<string, { tasksCreated: number; tasksCompleted: number; progressUpdates: number }> = {};

        projTasks.forEach(task => {
          if (task.createdAt) {
            const day = new Date(task.createdAt).toISOString().split("T")[0];
            if (!dailyActivity[day]) dailyActivity[day] = { tasksCreated: 0, tasksCompleted: 0, progressUpdates: 0 };
            dailyActivity[day].tasksCreated++;
          }
          if (task.completedAt) {
            const day = new Date(task.completedAt).toISOString().split("T")[0];
            if (!dailyActivity[day]) dailyActivity[day] = { tasksCreated: 0, tasksCompleted: 0, progressUpdates: 0 };
            dailyActivity[day].tasksCompleted++;
          }
        });

        projProgress.forEach(pl => {
          if (pl.updatedAt) {
            const day = new Date(pl.updatedAt).toISOString().split("T")[0];
            if (!dailyActivity[day]) dailyActivity[day] = { tasksCreated: 0, tasksCompleted: 0, progressUpdates: 0 };
            dailyActivity[day].progressUpdates++;
          }
        });

        // Convert to sorted array (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const activityTimeline = Object.entries(dailyActivity)
          .filter(([date]) => new Date(date) >= thirtyDaysAgo)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, data]) => ({ date, ...data }));

        return {
          projectId: proj.id,
          projectName: proj.title,
          projectCode: proj.projectCode,
          clientName: proj.clientName || "",
          description: proj.description || "",
          startDate: proj.startDate,
          endDate: proj.endDate,
          status: proj.status,
          progress: proj.progress,
          createdAt: proj.createdAt,
          completedAt: proj.completedAt,
          totalTasks,
          completedTasks,
          pendingTasks,
          delayedTasks,
          completionPct,
          totalKeySteps,
          completedKeySteps,
          totalTickets: projTickets.length,
          openTickets,
          resolvedTickets,
          teamCount: employeeLogs.length,
          healthScore,
          healthCategory,
          employeeLogs,
          activityTimeline,
        };
      });

      res.json(projectAnalytics);
    } catch (err: any) {
      console.error("[ANALYTICS] Failed to fetch project analytics:", err);
      res.status(500).json({ error: "Failed to fetch analytics", details: String(err) });
    }
  });

  /* ===============================
     TIMESHEET PROGRESS PER TASK
  ================================ */
  app.get("/api/tasks/:id/timesheet-progress", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [task] = await db.select({ taskName: projectTasks.taskName, projectId: projectTasks.projectId }).from(projectTasks).where(eq(projectTasks.id, id)).limit(1);
      if (!task) return res.status(404).json({ error: "Task not found" });
      const [proj] = await db.select({ title: projects.title }).from(projects).where(eq(projects.id, task.projectId)).limit(1);
      const projectName = proj?.title || "";
      const taskName = task.taskName || "";
      const entries = await getTaskTimeEntries(projectName, taskName);
      const totalLoggedHours = entries.reduce((sum: number, e: any) => sum + (e.hoursSpent || 0), 0);
      const contributorCount = entries.length;
      const completionPercent = Math.min(100, Math.round((totalLoggedHours / 8) * 10));  // rough heuristic
      res.json({ completionPercent, totalLoggedHours: Math.round(totalLoggedHours * 10) / 10, contributorCount, source: "timesheet", contributors: entries.map((e: any) => ({ name: e.name, hours: Math.round((e.hoursSpent || 0) * 10) / 10 })) });
    } catch (err) {
      res.json({ completionPercent: 0, totalLoggedHours: 0, contributorCount: 0, source: "timesheet" });
    }
  });

  /* ===============================
     EMPLOYEE CONTRIBUTIONS
  ================================ */
  app.get("/api/employees/:id/contributions", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [emp] = await db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.id, id)).limit(1);
      if (!emp) return res.status(404).json({ error: "Employee not found" });

      // Get all projects this employee is a member of
      const empProjects = await db.select({ projectId: projectTeamMembers.projectId }).from(projectTeamMembers).where(eq(projectTeamMembers.employeeId, id));
      const projectIds = Array.from(new Set(empProjects.map((p: any) => p.projectId)));
      let projectBreakdown: any[] = [];
      let totalHours = 0;

      for (const projId of projectIds) {
        const [proj] = await db.select({ title: projects.title }).from(projects).where(eq(projects.id, projId)).limit(1);
        if (!proj) continue;
        const { entries } = await getProjectTimeEntries(proj.title);
        const empEntry = entries.find((e: any) => e.name?.toLowerCase() === emp.name?.toLowerCase());
        const hours = empEntry?.hoursSpent || 0;
        const totalProjectHours = entries.reduce((s: number, e: any) => s + (e.hoursSpent || 0), 0);
        const percent = totalProjectHours > 0 ? Math.round((hours / totalProjectHours) * 100) : 0;
        if (hours > 0) {
          totalHours += hours;
          projectBreakdown.push({ projectId: projId, projectName: proj.title, hoursContributed: Math.round(hours * 10) / 10, contributionPercent: percent });
        }
      }

      // tasks worked on (as member)
      const taskMemberRows = await db.select({ taskId: taskMembers.taskId }).from(taskMembers).where(eq(taskMembers.employeeId, id));
      res.json({ totalHours: Math.round(totalHours * 10) / 10, projectsWorked: projectBreakdown.length, tasksWorked: taskMemberRows.length, projectBreakdown });
    } catch (err) {
      console.error("Employee contributions error:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  /* ===============================
     PROJECT CONTRIBUTIONS
  ================================ */
  app.get("/api/projects/:id/contributions", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [proj] = await db.select({ title: projects.title }).from(projects).where(eq(projects.id, id)).limit(1);
      if (!proj) return res.status(404).json({ error: "Project not found" });
      const { entries } = await getProjectTimeEntries(proj.title);
      const totalHours = entries.reduce((s: number, e: any) => s + (e.hoursSpent || 0), 0);
      const contributors = entries.map((e: any) => ({
        employeeName: e.name,
        hoursContributed: Math.round((e.hoursSpent || 0) * 10) / 10,
        percentContribution: totalHours > 0 ? Math.round(((e.hoursSpent || 0) / totalHours) * 100) : 0,
        entriesCount: e.entriesCount || 0,
      }));
      res.json({ projectId: id, projectName: proj.title, totalHours: Math.round(totalHours * 10) / 10, contributors });
    } catch (err) {
      res.status(500).json({ error: "Failed" });
    }
  });

  /* ===============================
     PERFORMANCE: EMPLOYEE STATS
  ================================ */
  app.get("/api/performance/employee/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const isAdmin = req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
      const requestingEmpId = req.employee?.id;
      if (!isAdmin && requestingEmpId !== id) return res.status(403).json({ error: "Access denied" });

      const [emp] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
      if (!emp) return res.status(404).json({ error: "Employee not found" });

      // Get tasks where employee is a member
      const memberTaskIds = (await db.select({ taskId: taskMembers.taskId }).from(taskMembers).where(eq(taskMembers.employeeId, id))).map((r: any) => r.taskId);
      // Get tasks owned by employee
      const ownedTasks = memberTaskIds.length > 0
        ? await db.select().from(projectTasks).where(and(eq(projectTasks.taskOwnerId as any, id), inArray(projectTasks.id, memberTaskIds)))
        : await db.select().from(projectTasks).where(eq(projectTasks.taskOwnerId as any, id));

      const allOwnedTasks = await db.select().from(projectTasks).where(eq(projectTasks.taskOwnerId as any, id));
      const completedOwned = allOwnedTasks.filter((t: any) => t.status === 'Completed' || t.status === 'completed');
      const delayedOwned = allOwnedTasks.filter((t: any) => {
        if (!t.endDate) return false;
        const due = new Date(t.endDate);
        const completedAt = t.completedAt ? new Date(t.completedAt) : new Date();
        return completedAt > due;
      });
      const totalPoints = completedOwned.reduce((s: number, t: any) => s + (t.performancePoints || 0), 0);
      const avgPoints = completedOwned.length > 0 ? Math.round((totalPoints / completedOwned.length) * 10) / 10 : 0;

      // Contribution data from TimeStrap
      const empProjects = await db.select({ projectId: projectTeamMembers.projectId }).from(projectTeamMembers).where(eq(projectTeamMembers.employeeId, id));
      let totalHours = 0;
      const projectBreakdown: any[] = [];
      for (const { projectId } of empProjects) {
        const [proj] = await db.select({ title: projects.title }).from(projects).where(eq(projects.id, projectId)).limit(1);
        if (!proj) continue;
        const { entries } = await getProjectTimeEntries(proj.title);
        const empEntry = entries.find((e: any) => e.name?.toLowerCase() === emp.name?.toLowerCase());
        const hours = empEntry?.hoursSpent || 0;
        if (hours > 0) { totalHours += hours; projectBreakdown.push({ projectName: proj.title, hours: Math.round(hours * 10) / 10 }); }
      }

      res.json({
        employee: { id: emp.id, name: emp.name, department: emp.department, designation: emp.designation },
        totalPoints,
        avgPoints,
        completedTasks: completedOwned.length,
        delayedTasks: delayedOwned.length,
        totalOwnedTasks: allOwnedTasks.length,
        ownershipSuccessRate: allOwnedTasks.length > 0 ? Math.round((completedOwned.length / allOwnedTasks.length) * 100) : 0,
        contributionHours: Math.round(totalHours * 10) / 10,
        projectsContributed: projectBreakdown.length,
        tasksWorked: memberTaskIds.length,
        projectBreakdown,
      });
    } catch (err) {
      console.error("Performance employee error:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  /* ===============================
     PERFORMANCE: LEADERBOARD
  ================================ */
  app.get("/api/performance/leaderboard", requireAuth, async (req: any, res) => {
    try {
      const { department, limit = 50 } = req.query;

      // Single aggregated query instead of N+1 per employee
      const deptFilter = department
        ? sql`AND e.department = ${department}`
        : sql``;

      const rows = await db.execute(sql`
        SELECT
          e.id            AS "employeeId",
          e.name          AS "name",
          COALESCE(e.department, 'N/A') AS "department",
          COALESCE(SUM(CASE WHEN t.status IN ('Completed','completed') THEN COALESCE(t.performance_points,0) ELSE 0 END), 0) AS "totalPoints",
          COUNT(CASE WHEN t.status IN ('Completed','completed') THEN 1 END)  AS "tasksCompleted",
          COUNT(t.id)     AS "totalTasks"
        FROM employees e
        LEFT JOIN project_tasks t ON t.task_owner_id = e.id
        WHERE 1=1 ${deptFilter}
        GROUP BY e.id, e.name, e.department
        ORDER BY "totalPoints" DESC, "tasksCompleted" DESC
        LIMIT ${Number(limit)}
      `);

      const ranked = (rows.rows as any[]).map((e, i) => ({
        ...e,
        totalPoints: Number(e.totalPoints),
        tasksCompleted: Number(e.tasksCompleted),
        totalTasks: Number(e.totalTasks),
        contributionHours: 0,
        rank: i + 1,
      }));

      res.json(ranked);
    } catch (err) {
      console.error("Leaderboard error:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  /* ===============================
     PERFORMANCE REPORTS
  ================================ */
  app.get("/api/reports/performance", requireAuth, async (req: any, res) => {
    try {
      const { projectId, employeeId, dateFrom, dateTo } = req.query;
      let conditions: any[] = [];
      if (projectId) conditions.push(eq(projectTasks.projectId, projectId as string));
      if (employeeId) conditions.push(eq(projectTasks.taskOwnerId as any, employeeId as string));
      if (dateFrom) conditions.push(sql`${projectTasks.createdAt} >= ${dateFrom}`);
      if (dateTo) conditions.push(sql`${projectTasks.createdAt} <= ${dateTo}`);
      const tasks = conditions.length > 0
        ? await db.select().from(projectTasks).where(and(...conditions))
        : await db.select().from(projectTasks);

      const ownerIds = Array.from(new Set(tasks.map((t: any) => t.taskOwnerId).filter(Boolean)));
      const ownerMap = new Map<string, string>();
      if (ownerIds.length > 0) {
        const ownerRows = await db.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, ownerIds as string[]));
        ownerRows.forEach((o: any) => ownerMap.set(o.id, o.name));
      }
      const projectMap2 = new Map<string, string>();
      const projIds = Array.from(new Set(tasks.map((t: any) => t.projectId).filter(Boolean)));
      if (projIds.length > 0) {
        const projRows = await db.select({ id: projects.id, title: projects.title }).from(projects).where(inArray(projects.id, projIds as string[]));
        projRows.forEach((p: any) => projectMap2.set(p.id, p.title));
      }

      const report = tasks.map((t: any) => ({
        taskId: t.id,
        taskName: t.taskName,
        projectName: projectMap2.get(t.projectId) || t.projectId,
        ownerName: t.taskOwnerId ? (ownerMap.get(t.taskOwnerId) || 'Unknown') : 'No Owner',
        status: t.status,
        priority: t.priority,
        progress: t.progress,
        performancePoints: t.performancePoints || 0,
        dueDate: t.endDate,
        completedAt: t.completedAt,
        startDate: t.startDate,
      }));
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: "Failed" });
    }
  });

  /* ===============================================================
      ADMIN GUARD (shared helper for Workspace + Settings routes)
  =================================================================== */
  function isAdminReq(req: any) {
    return req.user?.role === "ADMIN" || req.employee?.empCode === "E0001";
  }
  function requireAdmin(req: any, res: any, next: any) {
    if (!isAdminReq(req)) return res.status(403).json({ error: "Admin access required" });
    next();
  }

  /* ===============================================================
      WORKSPACE  (centralized admin view: Projects + Key Steps + Tasks)
  =================================================================== */
  app.get("/api/workspace", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const meId = req.employee?.id || null;
      const meName = (req.employee?.name || "").trim().toLowerCase();

      const [allProjects, allKeySteps, allTasks, allEmployees, allTeamMembers, allTaskMembers] = await Promise.all([
        db.select().from(projects),
        db.select().from(keySteps),
        db.select().from(projectTasks),
        db.select({ id: employees.id, name: employees.name, empCode: employees.empCode, department: employees.department, designation: employees.designation }).from(employees),
        db.select().from(projectTeamMembers),
        db.select().from(taskMembers),
      ]);

      const empMap = new Map(allEmployees.map((e: any) => [e.id, e]));
      const empName = (id: string | null) => (id && empMap.get(id)?.name) || null;

      const teamByProject = new Map<string, string[]>();
      for (const tm of allTeamMembers as any[]) {
        if (!teamByProject.has(tm.projectId)) teamByProject.set(tm.projectId, []);
        teamByProject.get(tm.projectId)!.push(tm.employeeId);
      }
      const membersByTask = new Map<string, string[]>();
      for (const tm of allTaskMembers as any[]) {
        if (!membersByTask.has(tm.taskId)) membersByTask.set(tm.taskId, []);
        membersByTask.get(tm.taskId)!.push(tm.employeeId);
      }

      const keyStepsByProject = new Map<string, any[]>();
      for (const ks of allKeySteps as any[]) {
        if (!keyStepsByProject.has(ks.projectId)) keyStepsByProject.set(ks.projectId, []);
        keyStepsByProject.get(ks.projectId)!.push(ks);
      }
      const tasksByProject = new Map<string, any[]>();
      for (const t of allTasks as any[]) {
        if (!tasksByProject.has(t.projectId)) tasksByProject.set(t.projectId, []);
        tasksByProject.get(t.projectId)!.push(t);
      }

      const projectsOut = (allProjects as any[]).map((p: any) => {
        const teamIds = teamByProject.get(p.id) || [];
        const pTasks = (tasksByProject.get(p.id) || []).map((t: any) => {
          const memberIds = membersByTask.get(t.id) || [];
          const mentionsMe = !!meId && (
            t.assignerId === meId || t.taskOwnerId === meId || memberIds.includes(meId)
          );
          return {
            id: t.id,
            keyStepId: t.keyStepId,
            taskName: t.taskName,
            description: t.description,
            status: t.status,
            priority: t.priority,
            startDate: t.startDate,
            endDate: t.endDate,
            progress: t.progress,
            assignerId: t.assignerId,
            assignerName: empName(t.assignerId),
            taskOwnerId: t.taskOwnerId,
            taskOwnerName: empName(t.taskOwnerId),
            memberIds,
            memberNames: memberIds.map(empName).filter(Boolean),
            isAddon: t.isAddon,
            isIssue: t.isIssue,
            createdAt: t.createdAt,
            mentionsMe,
          };
        });

        const pKeySteps = (keyStepsByProject.get(p.id) || []).map((ks: any) => ({
          id: ks.id,
          parentKeyStepId: ks.parentKeyStepId,
          header: ks.header,
          title: ks.title,
          description: ks.description,
          phase: ks.phase,
          status: ks.status,
          startDate: ks.startDate,
          endDate: ks.endDate,
          progress: ks.progress,
          taskCount: pTasks.filter((t: any) => t.keyStepId === ks.id).length,
        }));

        const involvesMe = !!meId && (
          p.createdByEmployeeId === meId ||
          teamIds.includes(meId) ||
          pTasks.some((t: any) => t.mentionsMe) ||
          (!!meName && (p.description || "").toLowerCase().includes(meName))
        );

        return {
          id: p.id,
          title: p.title,
          projectCode: p.projectCode,
          clientName: p.clientName,
          company: p.company,
          status: p.status,
          progress: p.progress,
          startDate: p.startDate,
          endDate: p.endDate,
          holdReason: p.holdReason,
          teamIds,
          teamNames: teamIds.map(empName).filter(Boolean),
          involvesMe,
          keySteps: pKeySteps,
          tasks: pTasks,
        };
      });

      res.json({
        me: { id: meId, name: req.employee?.name || null },
        employees: allEmployees,
        projects: projectsOut,
      });
    } catch (err) {
      console.error("Workspace fetch error:", err);
      res.status(500).json({ error: "Failed to load workspace" });
    }
  });

  /* ===============================================================
      SETTINGS — EMPLOYEES (create / update / delete)
  =================================================================== */
  app.post("/api/employees", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { empCode, name, designation, department, email, phone } = req.body;
      if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required" });

      const [created] = await db.insert(employees).values({
        empCode: empCode || null,
        name: String(name).trim(),
        designation: designation || null,
        department: department || null,
        email: email || null,
        phone: phone || null,
      }).returning();

      res.status(201).json(created);
    } catch (err: any) {
      console.error("Employee create error:", err);
      if (err?.code === "23505") return res.status(409).json({ error: "Employee code already exists" });
      res.status(500).json({ error: "Failed to create employee" });
    }
  });

  app.put("/api/employees/:id", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { empCode, name, designation, department, email, phone } = req.body;
      const updateData: any = {};
      if (typeof empCode !== "undefined") updateData.empCode = empCode || null;
      if (typeof name !== "undefined") updateData.name = String(name).trim();
      if (typeof designation !== "undefined") updateData.designation = designation || null;
      if (typeof department !== "undefined") updateData.department = department || null;
      if (typeof email !== "undefined") updateData.email = email || null;
      if (typeof phone !== "undefined") updateData.phone = phone || null;

      const [updated] = await db.update(employees).set(updateData).where(eq(employees.id, id)).returning();
      if (!updated) return res.status(404).json({ error: "Employee not found" });
      res.json(updated);
    } catch (err: any) {
      console.error("Employee update error:", err);
      if (err?.code === "23505") return res.status(409).json({ error: "Employee code already exists" });
      res.status(500).json({ error: "Failed to update employee" });
    }
  });

  app.delete("/api/employees/:id", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [linkedUser] = await db.select({ id: users.id }).from(users).where(eq(users.employeeId, id)).limit(1);
      if (linkedUser) {
        return res.status(409).json({ error: "Cannot delete: employee has a linked user login. Remove the user account first." });
      }
      const [deleted] = await db.delete(employees).where(eq(employees.id, id)).returning();
      if (!deleted) return res.status(404).json({ error: "Employee not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("Employee delete error:", err);
      res.status(500).json({ error: "Failed to delete employee. They may be referenced elsewhere." });
    }
  });

  /* ===============================================================
      SETTINGS — DEPARTMENTS (rename / delete label across employees)
  =================================================================== */
  app.post("/api/departments/rename", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { oldName, newName } = req.body;
      const trimmedNew = String(newName || "").trim();
      if (!oldName || !trimmedNew) {
        return res.status(400).json({ error: "oldName and newName are required" });
      }

      const [deptRow] = await db.select().from(departments).where(eq(departments.name, oldName)).limit(1);
      if (!deptRow) return res.status(404).json({ error: "Department not found" });

      // Guard against renaming into a name that already exists (case-insensitive)
      if (trimmedNew.toLowerCase() !== oldName.toLowerCase()) {
        const [clash] = await db
          .select({ id: departments.id })
          .from(departments)
          .where(sql`LOWER(${departments.name}) = ${trimmedNew.toLowerCase()}`)
          .limit(1);
        if (clash) return res.status(409).json({ error: `Department "${trimmedNew}" already exists` });
      }

      // Update the master table
      await db.update(departments).set({ name: trimmedNew }).where(eq(departments.id, deptRow.id));

      // Cascade the rename to every place that stores the department as free text
      await db.update(employees).set({ department: trimmedNew }).where(eq(employees.department, oldName));
      await db.update(projectDepartments).set({ department: trimmedNew }).where(eq(projectDepartments.department, oldName));

      res.json({ success: true });
    } catch (err) {
      console.error("Department rename error:", err);
      res.status(500).json({ error: "Failed to rename department" });
    }
  });

  app.delete("/api/departments/:name", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { name } = req.params;
      const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(employees).where(eq(employees.department, name));
      if (Number(count) > 0) {
        await db.update(employees).set({ department: null }).where(eq(employees.department, name));
      }
      await db.delete(projectDepartments).where(eq(projectDepartments.department, name));
      await db.delete(departments).where(eq(departments.name, name));
      res.json({ success: true, unassigned: Number(count) });
    } catch (err) {
      console.error("Department delete error:", err);
      res.status(500).json({ error: "Failed to delete department" });
    }
  });

  /* ===============================================================
      SETTINGS — USERS (login accounts / role & employee-link management)
  =================================================================== */
  app.get("/api/users", requireAuth, requireAdmin, async (_req: any, res) => {
    try {
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          role: users.role,
          employeeId: users.employeeId,
        })
        .from(users);

      const empIds = Array.from(new Set(rows.map((r: any) => r.employeeId).filter(Boolean)));
      const empRows = empIds.length
        ? await db.select({ id: employees.id, name: employees.name, empCode: employees.empCode, department: employees.department, designation: employees.designation, email: employees.email })
          .from(employees).where(inArray(employees.id, empIds as string[]))
        : [];
      const empMap = new Map(empRows.map((e: any) => [e.id, e]));

      res.json(rows.map((r: any) => ({ ...r, employee: r.employeeId ? empMap.get(r.employeeId) || null : null })));
    } catch (err) {
      console.error("Users fetch error:", err);
      res.status(500).json({ error: "Failed to load users" });
    }
  });

  app.post("/api/users", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { username, password, role, employeeId } = req.body;
      if (!username || !password) return res.status(400).json({ error: "username and password are required" });

      const [created] = await db.insert(users).values({
        username: String(username).trim(),
        password: String(password),
        role: role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
        employeeId: employeeId || null,
      }).returning();

      res.status(201).json({ id: created.id, username: created.username, role: created.role, employeeId: created.employeeId });
    } catch (err: any) {
      console.error("User create error:", err);
      if (err?.code === "23505") return res.status(409).json({ error: "Username already exists" });
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.put("/api/users/:id", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { username, password, role, employeeId } = req.body;
      const updateData: any = {};
      if (typeof username !== "undefined") updateData.username = String(username).trim();
      if (typeof password !== "undefined" && password) updateData.password = String(password);
      if (typeof role !== "undefined") updateData.role = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";
      if (typeof employeeId !== "undefined") updateData.employeeId = employeeId || null;

      const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({ id: updated.id, username: updated.username, role: updated.role, employeeId: updated.employeeId });
    } catch (err: any) {
      console.error("User update error:", err);
      if (err?.code === "23505") return res.status(409).json({ error: "Username already exists" });
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      if (req.user?.id === id) return res.status(400).json({ error: "You cannot delete your own account" });
      const [deleted] = await db.delete(users).where(eq(users.id, id)).returning();
      if (!deleted) return res.status(404).json({ error: "User not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("User delete error:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ===============================
  // GOOGLE CALENDAR SYNC
  // ===============================

  // Kick off OAuth: redirect the browser to Google's consent screen
  app.get("/api/google/connect", requireAuth, async (req: any, res) => {
    try {
      const url = getGoogleAuthUrl(req.user.id);
      res.redirect(url);
    } catch (err) {
      console.error("Google connect error:", err);
      res.status(500).send("Failed to start Google connection");
    }
  });

  // Google redirects here after the user grants (or denies) consent.
  // Not behind requireAuth because Google's redirect won't carry our auth
  // header — we rely on the `state` param (which we set to the user id).
  app.get("/api/google/callback", async (req: any, res) => {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    const frontendBase =
      process.env.APP_URL ||
      (process.env.NODE_ENV === "production"
        ? `${req.protocol}://${req.hostname}`
        : `${req.protocol}://${req.hostname}:5001`);

    if (error) {
      return res.redirect(`${frontendBase}/calendar?google=denied`);
    }
    if (!code || !state) {
      return res.redirect(`${frontendBase}/calendar?google=error`);
    }

    try {
      await handleGoogleCallback(state, code);
      // Kick off an initial pull so existing Google events show up right away.
      syncFromGoogle(state).catch((e) => console.error("Initial Google sync failed:", e));
      res.redirect(`${frontendBase}/calendar?google=connected`);
    } catch (err) {
      console.error("Google callback error:", err);
      res.redirect(`${frontendBase}/calendar?google=error`);
    }
  });

  app.get("/api/google/status", requireAuth, async (req: any, res) => {
    try {
      const status = await isGoogleConnected(req.user.id);
      res.json(status);
    } catch (err) {
      console.error("Google status error:", err);
      res.status(500).json({ error: "Failed to check Google connection" });
    }
  });

  app.post("/api/google/disconnect", requireAuth, async (req: any, res) => {
    try {
      await disconnectGoogle(req.user.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Google disconnect error:", err);
      res.status(500).json({ error: "Failed to disconnect Google Calendar" });
    }
  });

  // Manual "Sync now" — pulls the latest events from Google into the app and pushes unsynced app events.
  app.post("/api/google/sync-now", requireAuth, async (req: any, res) => {
    try {
      const timeZone = req.body?.timeZone || "UTC";
      const result = await syncFromGoogle(req.user.id);
      const pushResult = await syncToGoogle(req.user.id, timeZone);
      res.json({
        ...result,
        pushed: pushResult.pushed,
        failed: pushResult.failed,
        pullError: result.error,
        pushError: pushResult.error,
      });
    } catch (err) {
      console.error("Google sync-now error:", err);
      res.status(500).json({ error: "Failed to sync with Google Calendar" });
    }
  });

  // ===============================
  // CALENDAR EVENTS — guest sync helpers
  // ===============================
  // When an organizer invites guests to an event, two things should happen
  // (matching Google Calendar behavior):
  //   1. If the guest is an internal, logged-in employee, a linked copy of
  //      the event is inserted into their own calendar so it just "shows up".
  //   2. If the guest has an email address (internal or external), they get
  //      a "You've been invited" email.
  // Editing the organizer's event later keeps guest copies in sync and
  // re-notifies guests; removing a guest deletes their copy and sends a
  // cancellation notice.

  const CALENDAR_COPY_FIELDS = [
    "title", "description", "location", "videoLink", "allDay", "date", "endDate",
    "startTime", "endTime", "calendarType", "colorKey", "projectId", "projectTitle",
    "taskId", "taskTitle", "repeat", "repeatUntil", "reminders", "visibility", "busy",
    "guestsCanModify", "guestsCanInvite", "guestsCanSeeGuestList", "guests",
  ] as const;

  async function findUserIdByEmail(email: string): Promise<string | null> {
    if (!email) return null;
    try {
      const rows = await db
        .select({ userId: users.id })
        .from(users)
        .innerJoin(employees, eq(users.employeeId, employees.id))
        .where(sql`LOWER(${employees.email}) = LOWER(${email})`)
        .limit(1);
      return rows[0]?.userId || null;
    } catch (e) {
      console.error("Guest user lookup failed for", email, e);
      return null;
    }
  }

  async function findNameEmailByUserId(userId: string): Promise<{ name: string; email: string }> {
    try {
      const rows = await db
        .select({ name: employees.name, email: employees.email })
        .from(users)
        .innerJoin(employees, eq(users.employeeId, employees.id))
        .where(eq(users.id, userId))
        .limit(1);
      return { name: rows[0]?.name || "A team member", email: rows[0]?.email || "" };
    } catch (e) {
      console.error("Organizer lookup failed for", userId, e);
      return { name: "A team member", email: "" };
    }
  }

  // Insert/update linked calendar copies for internal guests on this event.
  async function upsertGuestCalendarCopies(event: any, organizerName: string, organizerEmail: string) {
    const guests: any[] = Array.isArray(event.guests) ? event.guests : [];
    for (const g of guests) {
      const email = (g?.email || "").trim();
      if (!email) continue;
      const guestUserId = await findUserIdByEmail(email);
      if (!guestUserId || guestUserId === event.userId) continue;

      const copyData: any = { userId: guestUserId, sourceEventId: event.id, isOrganizer: false, organizerName, organizerEmail };
      for (const field of CALENDAR_COPY_FIELDS) copyData[field] = event[field];

      const existing = await db
        .select({ id: calendarEvents.id })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.sourceEventId, event.id), eq(calendarEvents.userId, guestUserId)))
        .limit(1);

      if (existing.length) {
        await db.update(calendarEvents).set(copyData).where(eq(calendarEvents.id, existing[0].id));
      } else {
        await db.insert(calendarEvents).values(copyData);
      }
    }
  }

  // Remove linked copies for guests who are no longer invited; returns their emails.
  async function removeStaleGuestCopies(eventId: string, currentEmailsLower: string[]): Promise<string[]> {
    const copies = await db
      .select({ id: calendarEvents.id, userId: calendarEvents.userId })
      .from(calendarEvents)
      .where(eq(calendarEvents.sourceEventId, eventId));
    if (!copies.length) return [];

    const userIds = copies.map((c) => c.userId);
    const userEmailRows = await db
      .select({ userId: users.id, email: employees.email })
      .from(users)
      .innerJoin(employees, eq(users.employeeId, employees.id))
      .where(inArray(users.id, userIds));
    const emailByUser = new Map(userEmailRows.map((r) => [r.userId, (r.email || "").toLowerCase()]));

    const staleIds: string[] = [];
    const staleEmails: string[] = [];
    for (const c of copies) {
      const email = emailByUser.get(c.userId);
      if (!email || !currentEmailsLower.includes(email)) {
        staleIds.push(c.id);
        if (email) staleEmails.push(email);
      }
    }
    if (staleIds.length) {
      await db.delete(calendarEvents).where(inArray(calendarEvents.id, staleIds));
    }
    return staleEmails;
  }

  // Full sync: keep guest calendar copies current and email guests about
  // invites/updates/removals. Only ever run this against an organizer's own
  // (non-guest-copy) event row. Runs in the background — never blocks the response.
  async function syncCalendarGuests(event: any, organizer: { name: string; email: string }, prevEmailsLower: string[]) {
    try {
      const guests: any[] = Array.isArray(event.guests) ? event.guests : [];
      const currentEmailsLower = guests.map((g: any) => (g?.email || "").toLowerCase()).filter(Boolean);

      const removedEmails = await removeStaleGuestCopies(event.id, currentEmailsLower);
      for (const email of removedEmails) {
        sendCalendarInviteEmail(email, {
          guestName: "", eventTitle: event.title, organizerName: organizer.name, organizerEmail: organizer.email,
          date: event.date, endDate: event.endDate, startTime: event.startTime, endTime: event.endTime,
          allDay: event.allDay, location: event.location, videoLink: event.videoLink, description: event.description,
        }, "cancelled").catch((e) => console.error("Cancellation invite email failed:", e));
      }

      await upsertGuestCalendarCopies(event, organizer.name, organizer.email);

      for (const g of guests) {
        const email = (g?.email || "").trim();
        if (!email) continue;
        const isNew = !prevEmailsLower.includes(email.toLowerCase());
        sendCalendarInviteEmail(email, {
          eventId: event.id,
          guestName: g?.name || "", eventTitle: event.title, organizerName: organizer.name, organizerEmail: organizer.email,
          date: event.date, endDate: event.endDate, startTime: event.startTime, endTime: event.endTime,
          allDay: event.allDay, location: event.location, videoLink: event.videoLink, description: event.description,
        }, isNew ? "invited" : "updated").catch((e) => console.error("Guest invite email failed:", e));
      }
    } catch (e) {
      console.error("Calendar guest sync failed:", e);
    }
  }

  // ===============================
  // CALENDAR EVENTS — guest RSVP (Accept / Decline / Propose new time)
  // ===============================
  // Single source of truth for a guest's answer lives on the ORGANIZER's
  // event row, inside guests[] (works for external guests with no login
  // too). If the responding guest is an internal employee, we also mirror
  // the answer onto their own linked calendar copy so it renders with the
  // right color without the client having to cross-reference the organizer's
  // event. Used by both the authenticated in-app buttons and the public,
  // token-based email links.
  type GuestResponseInput = {
    status: "accepted" | "declined" | "proposed";
    proposedDate?: string | null;
    proposedStartTime?: string | null;
    proposedEndTime?: string | null;
    proposedNote?: string | null;
  };

  async function applyGuestResponse(organizerEventId: string, email: string, response: GuestResponseInput) {
    const [orgEvent] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, organizerEventId)).limit(1);
    if (!orgEvent) return { ok: false as const, status: 404, error: "Event not found" };
    if (orgEvent.isOrganizer === false) return { ok: false as const, status: 400, error: "Invalid event" };

    const guests: any[] = Array.isArray(orgEvent.guests) ? [...orgEvent.guests] : [];
    const idx = guests.findIndex((g) => (g?.email || "").trim().toLowerCase() === email.trim().toLowerCase());
    if (idx === -1) return { ok: false as const, status: 404, error: "You are not on the guest list for this event" };

    const nowIso = new Date().toISOString();
    const isProposal = response.status === "proposed";
    guests[idx] = {
      ...guests[idx],
      status: response.status,
      proposedDate: isProposal ? response.proposedDate || null : null,
      proposedStartTime: isProposal ? response.proposedStartTime || null : null,
      proposedEndTime: isProposal ? response.proposedEndTime || null : null,
      proposedNote: isProposal ? response.proposedNote || null : null,
      respondedAt: nowIso,
    };
    const guestName = guests[idx]?.name || email;

    await db.update(calendarEvents).set({ guests }).where(eq(calendarEvents.id, organizerEventId));

    // Mirror onto the guest's own linked copy, if they're an internal user.
    const guestUserId = await findUserIdByEmail(email);
    if (guestUserId) {
      await db
        .update(calendarEvents)
        .set({
          responseStatus: response.status,
          proposedDate: isProposal ? response.proposedDate || null : null,
          proposedStartTime: isProposal ? response.proposedStartTime || null : null,
          proposedEndTime: isProposal ? response.proposedEndTime || null : null,
          proposedNote: isProposal ? response.proposedNote || null : null,
          respondedAt: new Date(),
        })
        .where(and(eq(calendarEvents.sourceEventId, organizerEventId), eq(calendarEvents.userId, guestUserId)));
    }

    // Notify the organizer, and confirm back to the guest.
    const organizer = await findNameEmailByUserId(orgEvent.userId);
    const whenText = formatEventWhen(orgEvent as any);
    const proposedWhenText = isProposal
      ? formatEventWhen({
        date: response.proposedDate || orgEvent.date,
        endDate: response.proposedDate || orgEvent.date,
        startTime: response.proposedStartTime,
        endTime: response.proposedEndTime,
        allDay: false,
      })
      : null;

    if (organizer.email) {
      const kind = response.status === "accepted" ? "guest_accepted" : response.status === "declined" ? "guest_declined" : "guest_proposed";
      sendCalendarRsvpNotification(organizer.email, {
        eventId: organizerEventId, guestEmail: email,
        eventTitle: orgEvent.title, recipientName: organizer.name, guestName, whenText, proposedWhenText, proposedNote: response.proposedNote || null,
      }, kind as any).catch((e) => console.error("Organizer RSVP notification failed:", e));
    }
    if (response.status !== "proposed") {
      sendCalendarRsvpNotification(email, {
        eventTitle: orgEvent.title, recipientName: guestName, guestName, whenText, proposedWhenText: null, proposedNote: null,
      }, "response_confirmed").catch((e) => console.error("Guest RSVP confirmation failed:", e));
    }

    return { ok: true as const, event: orgEvent };
  }

  // Authenticated (in-app) response — id is the GUEST's own linked copy of the event.
  app.post("/api/calendar-events/:id/respond", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, proposedDate, proposedStartTime, proposedEndTime, proposedNote } = req.body || {};
      if (!["accepted", "declined", "proposed"].includes(status)) {
        return res.status(400).json({ error: "status must be accepted, declined, or proposed" });
      }
      const [copy] = await db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, req.user.id)))
        .limit(1);
      if (!copy) return res.status(404).json({ error: "Event not found" });
      const targetEventId = copy.sourceEventId || copy.id; // guest's own copy points at organizer's row
      const email = req.employee?.email;
      if (!email) return res.status(400).json({ error: "No email on file for your account" });

      const result = await applyGuestResponse(targetEventId, email, { status, proposedDate, proposedStartTime, proposedEndTime, proposedNote });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json({ success: true });
    } catch (err) {
      console.error("Calendar RSVP respond error:", err);
      res.status(500).json({ error: "Failed to record your response" });
    }
  });

  // Organizer accepts or declines a guest's proposed new time.
  // Organizer accepts or declines a guest's proposed new time. Shared by the
  // authenticated in-app route below and the public, token-based email-link
  // route (so the organizer can resolve it straight from the notification
  // email too, same as accepting/declining an invite).
  async function resolveGuestProposal(eventId: string, organizerUserId: string | null, guestEmail: string, action: "accept" | "decline") {
    const where = organizerUserId
      ? and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, organizerUserId))
      : eq(calendarEvents.id, eventId);
    const [orgEvent] = await db.select().from(calendarEvents).where(where).limit(1);
    if (!orgEvent) return { ok: false as const, status: 404, error: "Event not found" };
    if (orgEvent.isOrganizer === false) return { ok: false as const, status: 400, error: "Invalid event" };

    const guests: any[] = Array.isArray(orgEvent.guests) ? [...orgEvent.guests] : [];
    const idx = guests.findIndex((g) => (g?.email || "").toLowerCase() === guestEmail.toLowerCase());
    if (idx === -1 || guests[idx]?.status !== "proposed") {
      return { ok: false as const, status: 404, error: "No pending proposal from this guest" };
    }
    const proposal = guests[idx];

    // Keep the proposing guest's own linked copy in sync too, if they're internal.
    const guestUserId = await findUserIdByEmail(guestEmail);

    if (action === "accept") {
      // Move the event to the proposed time and re-notify everyone, reusing
      // the existing guest-sync flow (linked copies + emails).
      const prevEmailsLower = guests.map((g: any) => (g?.email || "").toLowerCase()).filter(Boolean);
      guests[idx] = { ...proposal, status: "accepted", proposedDate: null, proposedStartTime: null, proposedEndTime: null, proposedNote: null, respondedAt: new Date().toISOString() };
      const [updated] = await db
        .update(calendarEvents)
        .set({ date: proposal.proposedDate || orgEvent.date, endDate: proposal.proposedDate || orgEvent.endDate, startTime: proposal.proposedStartTime || orgEvent.startTime, endTime: proposal.proposedEndTime || orgEvent.endTime, guests })
        .where(eq(calendarEvents.id, eventId))
        .returning();

      const organizer = await findNameEmailByUserId(orgEvent.userId);
      syncCalendarGuests(updated, organizer, prevEmailsLower).catch((e) => console.error("Guest sync after proposal accept failed:", e));
      if (guestUserId) {
        await db
          .update(calendarEvents)
          .set({ responseStatus: "accepted", proposedDate: null, proposedStartTime: null, proposedEndTime: null, proposedNote: null, respondedAt: new Date() })
          .where(and(eq(calendarEvents.sourceEventId, eventId), eq(calendarEvents.userId, guestUserId)));
      }
      sendCalendarRsvpNotification(guestEmail, {
        eventTitle: orgEvent.title, recipientName: proposal?.name || guestEmail, guestName: proposal?.name || guestEmail,
        whenText: formatEventWhen({ date: proposal.proposedDate, endDate: proposal.proposedDate, startTime: proposal.proposedStartTime, endTime: proposal.proposedEndTime, allDay: false }),
      }, "proposal_accepted").catch((e) => console.error("Proposal-accepted email failed:", e));
      return { ok: true as const, event: updated };
    } else {
      guests[idx] = { ...proposal, status: "needsAction", proposedDate: null, proposedStartTime: null, proposedEndTime: null, proposedNote: null, respondedAt: new Date().toISOString() };
      const [updated] = await db.update(calendarEvents).set({ guests }).where(eq(calendarEvents.id, eventId)).returning();
      if (guestUserId) {
        await db
          .update(calendarEvents)
          .set({ responseStatus: "needsAction", proposedDate: null, proposedStartTime: null, proposedEndTime: null, proposedNote: null, respondedAt: new Date() })
          .where(and(eq(calendarEvents.sourceEventId, eventId), eq(calendarEvents.userId, guestUserId)));
      }
      sendCalendarRsvpNotification(guestEmail, {
        eventTitle: orgEvent.title, recipientName: proposal?.name || guestEmail, guestName: proposal?.name || guestEmail,
        whenText: formatEventWhen(orgEvent as any),
      }, "proposal_declined").catch((e) => console.error("Proposal-declined email failed:", e));
      return { ok: true as const, event: updated };
    }
  }

  app.post("/api/calendar-events/:id/resolve-proposal", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { guestEmail, action } = req.body || {};
      if (!guestEmail || !["accept", "decline"].includes(action)) {
        return res.status(400).json({ error: "guestEmail and action ('accept'|'decline') are required" });
      }
      const result = await resolveGuestProposal(id, req.user.id, guestEmail, action);
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json({ success: true, event: result.event });
    } catch (err) {
      console.error("Calendar resolve-proposal error:", err);
      res.status(500).json({ error: "Failed to resolve proposal" });
    }
  });

  // Public, no-login version — lets the ORGANIZER accept/decline a proposed
  // time straight from the notification email, without opening the app.
  app.get("/api/calendar-rsvp/resolve-proposal", async (req: any, res) => {
    const { event, guestEmail, token, action } = req.query as Record<string, string>;
    if (!verifyRsvpToken(event, guestEmail, token) || !["accept", "decline"].includes(action)) {
      return res.status(400).send(rsvpPage("Link invalid or expired", "Please use the latest notification email, or resolve it from the app instead.", "#dc2626"));
    }
    try {
      const result = await resolveGuestProposal(event, null, guestEmail, action as "accept" | "decline");
      if (!result.ok) return res.status(result.status).send(rsvpPage("Couldn't resolve the proposal", result.error || "Please try again.", "#dc2626"));
      res.send(rsvpPage(
        action === "accept" ? "Time updated ✅" : "Original time kept",
        action === "accept" ? "The event was moved to the proposed time and every guest has been re-notified." : "The guest has been notified that the original time stands.",
        action === "accept" ? "#16a34a" : "#6b7280"
      ));
    } catch (err) {
      console.error("Public resolve-proposal error:", err);
      res.status(500).send(rsvpPage("Something went wrong", "Please try again in a moment.", "#dc2626"));
    }
  });

  // ---- Public, no-login RSVP links (for external guests, clicked from the invite email) ----

  function rsvpPage(title: string, message: string, color: string) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f4f6f9;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px 28px;max-width:420px;text-align:center;">
    <div style="width:48px;height:48px;border-radius:50%;background:${color};margin:0 auto 16px;"></div>
    <h1 style="font-size:18px;color:#0f172a;margin:0 0 8px;">${title}</h1>
    <p style="font-size:14px;color:#6b7280;margin:0;">${message}</p>
  </div>
</body></html>`;
  }

  app.get("/api/calendar-rsvp/respond", async (req: any, res) => {
    const { event, email, token, status } = req.query as Record<string, string>;
    if (!verifyRsvpToken(event, email, token) || !["accepted", "declined"].includes(status)) {
      return res.status(400).send(rsvpPage("Link invalid or expired", "Please use the latest invitation email you received, or contact the organizer.", "#dc2626"));
    }
    try {
      const result = await applyGuestResponse(event, email, { status: status as "accepted" | "declined" });
      if (!result.ok) return res.status(result.status).send(rsvpPage("Couldn't record your response", result.error || "Please try again.", "#dc2626"));
      res.send(rsvpPage(
        status === "accepted" ? "You're in! ✅" : "Response recorded",
        status === "accepted" ? "Your acceptance has been sent to the organizer." : "The organizer has been notified that you can't make it.",
        status === "accepted" ? "#16a34a" : "#dc2626"
      ));
    } catch (err) {
      console.error("Public RSVP respond error:", err);
      res.status(500).send(rsvpPage("Something went wrong", "Please try again in a moment.", "#dc2626"));
    }
  });

  app.get("/api/calendar-rsvp/propose", async (req: any, res) => {
    const { event, email, token } = req.query as Record<string, string>;
    if (!verifyRsvpToken(event as string, email as string, token as string)) {
      return res.status(400).send(rsvpPage("Link invalid or expired", "Please use the latest invitation email you received, or contact the organizer.", "#dc2626"));
    }
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Propose a new time</title></head>
<body style="margin:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f4f6f9;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <form method="POST" action="/api/calendar-rsvp/propose" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;max-width:380px;width:90%;">
    <h1 style="font-size:18px;color:#0f172a;margin:0 0 16px;">Propose a new time</h1>
    <input type="hidden" name="event" value="${event}"><input type="hidden" name="email" value="${email}"><input type="hidden" name="token" value="${token}">
    <label style="display:block;font-size:13px;color:#4b5563;margin-bottom:4px;">Date</label>
    <input type="date" name="proposedDate" required style="width:100%;padding:8px;margin-bottom:12px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
    <label style="display:block;font-size:13px;color:#4b5563;margin-bottom:4px;">Start time</label>
    <input type="time" name="proposedStartTime" required style="width:100%;padding:8px;margin-bottom:12px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
    <label style="display:block;font-size:13px;color:#4b5563;margin-bottom:4px;">End time</label>
    <input type="time" name="proposedEndTime" required style="width:100%;padding:8px;margin-bottom:12px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
    <label style="display:block;font-size:13px;color:#4b5563;margin-bottom:4px;">Note (optional)</label>
    <textarea name="proposedNote" rows="2" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"></textarea>
    <button type="submit" style="width:100%;background:#0f172a;color:#fff;border:none;padding:12px;border-radius:6px;font-weight:bold;">Send proposal</button>
  </form>
</body></html>`);
  });

  app.post("/api/calendar-rsvp/propose", express.urlencoded({ extended: true }), async (req: any, res) => {
    const { event, email, token, proposedDate, proposedStartTime, proposedEndTime, proposedNote } = req.body || {};
    if (!verifyRsvpToken(event, email, token)) {
      return res.status(400).send(rsvpPage("Link invalid or expired", "Please use the latest invitation email you received, or contact the organizer.", "#dc2626"));
    }
    try {
      const result = await applyGuestResponse(event, email, { status: "proposed", proposedDate, proposedStartTime, proposedEndTime, proposedNote });
      if (!result.ok) return res.status(result.status).send(rsvpPage("Couldn't send your proposal", result.error || "Please try again.", "#dc2626"));
      res.send(rsvpPage("Proposal sent 🕓", "The organizer has been notified of your proposed time and will let you know.", "#d97706"));
    } catch (err) {
      console.error("Public RSVP propose error:", err);
      res.status(500).send(rsvpPage("Something went wrong", "Please try again in a moment.", "#dc2626"));
    }
  });

  // ===============================
  // CALENDAR EVENTS
  // ===============================
  app.get("/api/calendar-events", requireAuth, async (req: any, res) => {
    try {
      const rows = await db.select().from(calendarEvents).where(eq(calendarEvents.userId, req.user.id));
      res.json(rows);
    } catch (err) {
      console.error("Calendar events fetch error:", err);
      res.status(500).json({ error: "Failed to load calendar events" });
    }
  });

  app.post("/api/calendar-events", requireAuth, async (req: any, res) => {
    try {
      const data = { ...req.body, userId: req.user.id };
      const timeZone = data.timeZone || "UTC";
      delete data.timeZone;
      // Omit id so DB generates it
      if (data.id) delete data.id;
      // Let DB default handle createdAt (frontend sends a string, Drizzle needs Date)
      delete data.createdAt;
      // googleUpdatedAt/source/googleEventId are sync bookkeeping fields —
      // never trust raw values sent back from the client for these. If the
      // client echoes googleUpdatedAt as a string, Drizzle's timestamp column
      // crashes expecting a Date. Google-related sync assigns these itself.
      delete data.googleUpdatedAt;
      // Guest-sync bookkeeping fields are assigned by the server (see
      // syncCalendarGuests / upsertGuestCalendarCopies) — never trust the client here.
      delete data.sourceEventId;
      delete data.isOrganizer;
      delete data.organizerName;
      delete data.organizerEmail;
      // Sanitize empty-string uuid fields (frontend sends "" for unset)
      if (!data.projectId) data.projectId = null;
      if (!data.taskId) data.taskId = null;
      // Ensure title is never null
      if (!data.title && data.title !== "") data.title = "Untitled event";

      const [created] = await db.insert(calendarEvents).values(data).returning();
      res.status(201).json(created);

      // Push to Google in the background; never block or fail the request on this.
      pushEventToGoogle(req.user.id, created, timeZone).catch((e) =>
        console.error("Background Google push (create) failed:", e)
      );

      // Add the event to any internal guests' own calendars and email everyone invited.
      const organizerName = req.employee?.name || req.user?.username || "A team member";
      const organizerEmail = req.employee?.email || "";
      syncCalendarGuests(created, { name: organizerName, email: organizerEmail }, []).catch((e) =>
        console.error("Background guest sync (create) failed:", e)
      );
    } catch (err) {
      console.error("Calendar event create error:", err);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  });

  app.put("/api/calendar-events/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const data = { ...req.body };
      const timeZone = data.timeZone || "UTC";
      delete data.timeZone;
      if (data.id) delete data.id;
      if (data.userId) delete data.userId; // don't change owner
      if (data.createdAt) delete data.createdAt;
      // Same sync-bookkeeping guard as the create route above.
      delete data.googleUpdatedAt;
      delete data.sourceEventId;
      delete data.isOrganizer;
      delete data.organizerName;
      delete data.organizerEmail;
      // Sanitize empty-string uuid fields (frontend sends "" for unset)
      if (data.projectId !== undefined && !data.projectId) data.projectId = null;
      if (data.taskId !== undefined && !data.taskId) data.taskId = null;

      // Grab the guest list as it was *before* this update so we can tell new
      // invites apart from existing ones, and detect who was removed.
      const [existing] = await db
        .select({ guests: calendarEvents.guests, isOrganizer: calendarEvents.isOrganizer })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, req.user.id)))
        .limit(1);
      const prevEmailsLower = (Array.isArray(existing?.guests) ? existing!.guests : [])
        .map((g: any) => (g?.email || "").toLowerCase())
        .filter(Boolean);

      const [updated] = await db
        .update(calendarEvents)
        .set(data)
        .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, req.user.id)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Event not found" });
      res.json(updated);

      pushEventToGoogle(req.user.id, updated, timeZone).catch((e) =>
        console.error("Background Google push (update) failed:", e)
      );

      // Only sync guests off the organizer's own copy of the event — editing a
      // guest's linked copy of someone else's event shouldn't re-invite anyone.
      if (existing?.isOrganizer !== false) {
        const organizerName = req.employee?.name || req.user?.username || "A team member";
        const organizerEmail = req.employee?.email || "";
        syncCalendarGuests(updated, { name: organizerName, email: organizerEmail }, prevEmailsLower).catch((e) =>
          console.error("Background guest sync (update) failed:", e)
        );
      }
    } catch (err) {
      console.error("Calendar event update error:", err);
      res.status(500).json({ error: "Failed to update calendar event" });
    }
  });

  app.delete("/api/calendar-events/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [deleted] = await db
        .delete(calendarEvents)
        .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, req.user.id)))
        .returning();

      if (!deleted) return res.status(404).json({ error: "Event not found" });
      res.json({ success: true });

      deleteEventFromGoogle(req.user.id, deleted.googleEventId).catch((e) =>
        console.error("Background Google delete failed:", e)
      );

      // Guest copies are removed automatically (ON DELETE CASCADE via source_event_id).
      // Only notify guests when the organizer's own event is deleted, not a guest's copy.
      if (deleted.isOrganizer !== false) {
        const guests: any[] = Array.isArray(deleted.guests) ? deleted.guests : [];
        const organizerName = req.employee?.name || req.user?.username || "A team member";
        const organizerEmail = req.employee?.email || "";
        for (const g of guests) {
          const email = (g?.email || "").trim();
          if (!email) continue;
          sendCalendarInviteEmail(email, {
            guestName: g?.name || "", eventTitle: deleted.title, organizerName, organizerEmail,
            date: deleted.date, endDate: deleted.endDate, startTime: deleted.startTime, endTime: deleted.endTime,
            allDay: deleted.allDay, location: deleted.location, videoLink: deleted.videoLink, description: deleted.description,
          }, "cancelled").catch((e) => console.error("Cancellation invite email failed:", e));
        }
      }
    } catch (err) {
      console.error("Calendar event delete error:", err);
      res.status(500).json({ error: "Failed to delete calendar event" });
    }
  });

  /* =====================================================================
     TASK DEPENDENCY & AUTOMATIC SCHEDULE MANAGEMENT  (NEW FEATURE)
     ---------------------------------------------------------------------
     Everything below is additive. It does not alter any existing route,
     table, or behavior. It only becomes active for tasks/projects where
     a dependency is explicitly created.
  ===================================================================== */

  // List ALL dependencies for a project (used by the Gantt dependency dialog)
  app.get("/api/projects/:id/dependencies", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const edges = await dependencyService.getProjectDependencyEdges(id);
      res.json(edges);
    } catch (err) {
      console.error("Get project dependencies error:", err);
      res.status(500).json({ message: "Failed to load project dependencies" });
    }
  });

  // List predecessors + successors for a task
  app.get("/api/tasks/:id/dependencies", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [predecessors, successors] = await Promise.all([
        dependencyService.getPredecessors(id),
        dependencyService.getSuccessors(id),
      ]);
      res.json({
        predecessors: predecessors.map((p) => ({ ...p.dependency, task: p.task })),
        successors: successors.map((s) => ({ ...s.dependency, task: s.task })),
      });
    } catch (err) {
      console.error("Get task dependencies error:", err);
      res.status(500).json({ message: "Failed to load dependencies" });
    }
  });

  // Create a dependency between two tasks in the same project
  app.post("/api/task-dependencies", requireAuth, async (req: any, res) => {
    try {
      const { projectId, predecessorId, successorId, type = "FS", lagDays = 0 } = req.body || {};
      if (!projectId || !predecessorId || !successorId) {
        return res.status(400).json({ message: "projectId, predecessorId and successorId are required" });
      }
      const created = await dependencyService.validateAndAddDependency({
        projectId,
        predecessorId,
        successorId,
        type,
        lagDays: Number(lagDays) || 0,
        createdBy: req.employee?.id || null,
      });
      res.status(201).json(created);
    } catch (err: any) {
      if (err instanceof dependencyService.DependencyValidationError) {
        return res.status(400).json({ message: err.message, code: err.code });
      }
      console.error("Create task dependency error:", err);
      res.status(500).json({ message: "Failed to create dependency" });
    }
  });

  // Change dependency type / lag
  app.patch("/api/task-dependencies/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updated = await dependencyService.updateDependency(id, {
        type: req.body?.type,
        lagDays: typeof req.body?.lagDays !== "undefined" ? Number(req.body.lagDays) : undefined,
      });
      if (!updated) return res.status(404).json({ message: "Dependency not found" });
      res.json(updated);
    } catch (err: any) {
      if (err instanceof dependencyService.DependencyValidationError) {
        return res.status(400).json({ message: err.message, code: err.code });
      }
      console.error("Update task dependency error:", err);
      res.status(500).json({ message: "Failed to update dependency" });
    }
  });

  // Remove a dependency
  app.delete("/api/task-dependencies/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const removed = await dependencyService.removeDependency(id);
      if (!removed) return res.status(404).json({ message: "Dependency not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("Delete task dependency error:", err);
      res.status(500).json({ message: "Failed to delete dependency" });
    }
  });

  // Centralized manual schedule change endpoint. Every UI surface that lets a
  // user change Start Date / End Date / Duration (task edit page, Gantt drag,
  // timeline, calendar, bulk reschedule) should call this so the "reason"
  // prompt and cascade logic is applied consistently in one place.
  app.patch("/api/tasks/:id/schedule", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate, durationDays, reason, reasonCategory, changeType } = req.body || {};

      const result = await dependencyService.applyScheduleChange(
        id,
        {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          durationDays: typeof durationDays !== "undefined" ? Number(durationDays) : undefined,
        },
        {
          changeType: changeType === "System" ? "System" : "Manual",
          reason: reasonCategory && reasonCategory !== "Other" ? reasonCategory : reason,
          changedBy: req.employee?.id || null,
        }
      );

      res.json(result);
    } catch (err: any) {
      if (err instanceof dependencyService.DependencyValidationError) {
        return res.status(400).json({ message: err.message, code: err.code });
      }
      console.error("Apply schedule change error:", err);
      res.status(500).json({ message: "Failed to update schedule" });
    }
  });

  // Full chronological schedule history for a single task
  app.get("/api/tasks/:id/schedule-history", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const history = await dependencyService.getTaskScheduleHistory(id);

      // Resolve display names for changedBy / triggeredByTaskId without a join
      const employeeIds = Array.from(new Set(history.map((h) => h.changedBy).filter(Boolean))) as string[];
      const taskIds = Array.from(new Set(history.map((h) => h.triggeredByTaskId).filter(Boolean))) as string[];

      const [employeesRows, tasksRows] = await Promise.all([
        employeeIds.length ? db.select().from(employees).where(inArray(employees.id, employeeIds)) : [],
        taskIds.length ? db.select().from(projectTasks).where(inArray(projectTasks.id, taskIds)) : [],
      ]);
      const employeeMap = new Map(employeesRows.map((e: any) => [e.id, e.name]));
      const taskMap = new Map(tasksRows.map((t: any) => [t.id, t.taskName]));

      res.json(
        history.map((h) => ({
          ...h,
          changedByName: h.changedBy ? employeeMap.get(h.changedBy) || null : null,
          triggeredByTaskName: h.triggeredByTaskId ? taskMap.get(h.triggeredByTaskId) || null : null,
        }))
      );
    } catch (err) {
      console.error("Get task schedule history error:", err);
      res.status(500).json({ message: "Failed to load schedule history" });
    }
  });

  // Project-level audit log across all tasks, with optional filters
  app.get("/api/projects/:id/schedule-history", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { taskId, changedBy, changeType, from, to } = req.query || {};
      const history = await dependencyService.getProjectScheduleHistory(id, {
        taskId: taskId as string | undefined,
        changedBy: changedBy as string | undefined,
        changeType: changeType as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
      });

      const employeeIds = Array.from(new Set(history.map((h) => h.changedBy).filter(Boolean))) as string[];
      const taskIdsInvolved = Array.from(new Set(history.map((h) => h.taskId))) as string[];

      const [employeesRows, tasksRows] = await Promise.all([
        employeeIds.length ? db.select().from(employees).where(inArray(employees.id, employeeIds)) : [],
        taskIdsInvolved.length ? db.select().from(projectTasks).where(inArray(projectTasks.id, taskIdsInvolved)) : [],
      ]);
      const employeeMap = new Map(employeesRows.map((e: any) => [e.id, e.name]));
      const taskMap = new Map(tasksRows.map((t: any) => [t.id, t.taskName]));

      res.json(
        history.map((h) => ({
          ...h,
          changedByName: h.changedBy ? employeeMap.get(h.changedBy) || null : null,
          taskName: taskMap.get(h.taskId) || null,
        }))
      );
    } catch (err) {
      console.error("Get project schedule history error:", err);
      res.status(500).json({ message: "Failed to load project schedule history" });
    }
  });

  return httpServer;
}