/**
 * WhatsApp notifications for PMS.
 *
 * Uses a self-hosted Evolution API instance (https://github.com/EvolutionAPI/evolution-api)
 * — an open-source wrapper around Baileys (WhatsApp Web multi-device protocol) —
 * via plain `fetch` calls against its REST API. No SDK dependency needed.
 *
 * IMPORTANT: This talks to WhatsApp through an unofficial, automated Web
 * session linked to a real WhatsApp account (scanned via QR code), not
 * Meta's official Business API. That account can be rate-limited or banned
 * by WhatsApp for automated/bulk sending patterns. Keep volume low, add
 * delays between sends, and prefer a dedicated number over a personal one
 * where possible.
 *
 * Required environment variables:
 *   EVOLUTION_API_URL        - base URL of your Evolution API instance,
 *                               e.g. "https://your-vps-domain:8080"
 *   EVOLUTION_API_KEY        - the AUTHENTICATION_API_KEY set on that instance
 *   EVOLUTION_INSTANCE_NAME  - the instance name you created
 *                               (POST /instance/create) and scanned the QR for
 *
 * If these are not set, every function below logs a warning and no-ops —
 * it will never throw and never block email notifications from sending.
 */

import { sql } from "drizzle-orm";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME;

const isConfigured = () =>
  Boolean(EVOLUTION_API_URL && EVOLUTION_API_KEY && EVOLUTION_INSTANCE_NAME);

/**
 * Lazily import the DB layer so this module can still be used (e.g. for the
 * low-level send) even in a context where the DB isn't wired up. Message
 * history logging is best-effort: a logging failure never blocks a send.
 */
async function logMessage(entry: {
  phone: string;
  direction: "outbound" | "inbound";
  body: string;
  status?: string;
  twilioSid?: string | null;
  employeeId?: string | null;
  groupId?: string | null;
  sentBy?: string | null;
  senderPhone?: string | null;
  senderName?: string | null;
  whatsappMessageId?: string | null;
  whatsappRemoteJid?: string | null;
  whatsappFromMe?: boolean;
}) {
  try {
    const { db } = await import("./db.ts");
    const { whatsappMessages, employees } = await import("../shared/schema.ts");
    const { eq } = await import("drizzle-orm");

    let employeeId = entry.employeeId || null;
    if (!employeeId && entry.senderPhone) {
      const senderDigits = entry.senderPhone.replace(/[^\d]/g, "");
      if (senderDigits) {
        const [match] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(sql`regexp_replace(${employees.phone}, '[^0-9]', '', 'g') = ${senderDigits}`);
        if (match) employeeId = match.id;
      }
    }

    if (!employeeId && !entry.groupId && entry.phone) {
      // Best-effort match on the raw phone string so history still shows up
      // for automated sends that only had a phone number, not an employee id.
      const digits = entry.phone.replace(/[^\d]/g, "");
      if (digits) {
        const [match] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(eq(employees.phone, entry.phone));
        if (match) employeeId = match.id;
      }
    }

    await db.insert(whatsappMessages).values({
      employeeId,
      groupId: entry.groupId || null,
      phone: entry.phone,
      direction: entry.direction,
      body: entry.body,
      status: entry.status || (entry.direction === "outbound" ? "sent" : "received"),
      twilioSid: entry.twilioSid || null,
      sentBy: entry.sentBy || null,
      senderPhone: entry.senderPhone || null,
      senderName: entry.senderName || null,
      whatsappMessageId: entry.whatsappMessageId || null,
      whatsappRemoteJid: entry.whatsappRemoteJid || null,
      whatsappFromMe: entry.whatsappFromMe ?? false,
    });
  } catch (err) {
    console.error("[WHATSAPP] Failed to log message to history:", err);
  }
}

/**
 * Normalizes a stored phone number into the plain-digits shape Evolution
 * API expects ("91XXXXXXXXXX" — country code + number, no "+", no spaces).
 * If the number doesn't already look like it has a country code, assumes
 * DEFAULT_COUNTRY_CODE (defaults to India, "91") — adjust via env if most
 * staff are elsewhere.
 */
function toWhatsAppAddress(rawPhone: string): string | null {
  if (!rawPhone) return null;
  let digits = rawPhone.trim().replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else {
    const defaultCc = process.env.DEFAULT_COUNTRY_CODE || "91";
    // Strip a leading 0 (common in local mobile formats) before prefixing,
    // but only if the number doesn't already start with the country code.
    if (!digits.startsWith(defaultCc)) {
      digits = digits.replace(/^0+/, "");
      digits = `${defaultCc}${digits}`;
    }
  }

  return digits;
}

/**
 * Raw call to Evolution API's sendText endpoint. `to` here is whatever
 * Evolution API's "number" field accepts as-is — either a plain-digits
 * phone number (for 1:1 chats) or a group JID like "123...-456...@g.us"
 * (for groups). No phone normalization happens here.
 */
async function rawSendText(to: string, body: string): Promise<{ ok: boolean; sid: string | null; error?: any }> {
  const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: EVOLUTION_API_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ number: to, text: body }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, sid: null, error: data || res.statusText };
  }
  const sid = data?.key?.id || data?.id || null;
  return { ok: true, sid };
}

export async function deleteWhatsAppMessage(
  remoteAddress: string,
  messageId: string,
  fromMe = true
): Promise<{ ok: boolean; error?: string }> {
  if (!isConfigured()) return { ok: false, error: "Evolution API is not configured" };
  const remoteJid = remoteAddress.includes("@")
    ? remoteAddress
    : `${toWhatsAppAddress(remoteAddress) || remoteAddress}@s.whatsapp.net`;
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/deleteMessageForEveryone/${EVOLUTION_INSTANCE_NAME}`, {
      method: "DELETE",
      headers: { apikey: EVOLUTION_API_KEY as string, "Content-Type": "application/json" },
      body: JSON.stringify({ id: messageId, remoteJid, fromMe }),
    });
    if (res.ok) return { ok: true };
    const responseBody = await res.text().catch(() => "");
    return { ok: false, error: responseBody || res.statusText };
  } catch (err) {
    console.error("[WHATSAPP] Failed to delete message:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function markWhatsAppMessageDeleted(messageId: string) {
  try {
    const { db } = await import("./db.ts");
    const { whatsappMessages } = await import("../shared/schema.ts");
    const { eq } = await import("drizzle-orm");
    await db
      .update(whatsappMessages)
      .set({ body: "This message was deleted", status: "deleted", deletedAt: new Date() })
      .where(eq(whatsappMessages.whatsappMessageId, messageId));
  } catch (err) {
    console.error("[WHATSAPP] Failed to mark deleted message:", err);
  }
}

/**
 * Low-level sender. Never throws — logs and returns null on failure so
 * calling code can fire-and-forget alongside email sends.
 */
export async function sendWhatsAppMessage(
  toPhone: string | null | undefined,
  body: string,
  meta?: { employeeId?: string | null; sentBy?: string | null }
): Promise<{ sid: string } | null> {
  if (!isConfigured()) {
    console.warn(
      "[WHATSAPP] Skipping message: EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE_NAME not configured"
    );
    return null;
  }

  if (!toPhone) {
    console.warn("[WHATSAPP] Skipping message: no phone number provided");
    return null;
  }

  const to = toWhatsAppAddress(toPhone);
  if (!to) {
    console.warn(`[WHATSAPP] Skipping message: could not parse phone number "${toPhone}"`);
    return null;
  }

  try {
    const result = await rawSendText(to, body);

    if (!result.ok) {
      console.error(`[WHATSAPP] Evolution API error sending to ${to}:`, result.error);
      logMessage({
        phone: toPhone,
        direction: "outbound",
        body,
        status: "failed",
        employeeId: meta?.employeeId,
        sentBy: meta?.sentBy,
        whatsappMessageId: result.sid,
        whatsappRemoteJid: `${to}@s.whatsapp.net`,
        whatsappFromMe: true,
      });
      return null;
    }

    console.log(`[WHATSAPP] Message sent to ${to}. ID: ${result.sid}`);
    logMessage({
      phone: toPhone,
      direction: "outbound",
      body,
      status: "sent",
      twilioSid: result.sid,
      whatsappMessageId: result.sid,
      employeeId: meta?.employeeId,
      sentBy: meta?.sentBy,
      whatsappRemoteJid: `${to}@s.whatsapp.net`,
      whatsappFromMe: true,
    });
    return { sid: result.sid as string };
  } catch (err) {
    console.error(`[WHATSAPP] Unexpected failure sending to ${toPhone}:`, err);
    logMessage({
      phone: toPhone,
      direction: "outbound",
      body,
      status: "failed",
      employeeId: meta?.employeeId,
      sentBy: meta?.sentBy,
    });
    return null;
  }
}

/**
 * Creates a real WhatsApp group via Evolution API's /group/create endpoint
 * and saves it locally so the PMS can list it and log its messages.
 * `participantPhones` should be raw employee phone numbers as saved in the
 * PMS — they get normalized the same way 1:1 sends do.
 */
export async function createWhatsAppGroup(
  name: string,
  participantPhones: string[],
  meta?: { createdBy?: string | null; participantEmployeeIds?: string[] }
): Promise<{ groupJid: string } | null> {
  if (!isConfigured()) {
    console.warn(
      "[WHATSAPP] Skipping group creation: EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE_NAME not configured"
    );
    return null;
  }

  const participants = participantPhones
    .map((p) => toWhatsAppAddress(p))
    .filter((p): p is string => Boolean(p));

  if (participants.length === 0) {
    console.warn("[WHATSAPP] Skipping group creation: no valid participant phone numbers");
    return null;
  }

  try {
    const url = `${EVOLUTION_API_URL}/group/create/${EVOLUTION_INSTANCE_NAME}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: EVOLUTION_API_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject: name, participants }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("[WHATSAPP] Evolution API error creating group:", data || res.statusText);
      return null;
    }

    // Evolution API returns the created group's id (JID) under `id` (varies
    // slightly by version) — fall back gracefully if the shape differs.
    const groupJid: string | null = data?.id || data?.groupJid || data?.group?.id || null;
    if (!groupJid) {
      console.error("[WHATSAPP] Group created but no groupJid found in response:", data);
      return null;
    }

    try {
      const { db } = await import("./db.ts");
      const { whatsappGroups } = await import("../shared/schema.ts");
      await db.insert(whatsappGroups).values({
        groupJid,
        name,
        participantEmployeeIds: meta?.participantEmployeeIds || [],
        createdBy: meta?.createdBy || null,
      });
    } catch (dbErr) {
      console.error("[WHATSAPP] Group created on WhatsApp but failed to save locally:", dbErr);
    }

    console.log(`[WHATSAPP] Group "${name}" created. JID: ${groupJid}`);
    return { groupJid };
  } catch (err) {
    console.error("[WHATSAPP] Unexpected failure creating group:", err);
    return null;
  }
}

/**
 * Sends a text message to an existing WhatsApp group. `groupJid` is the
 * value stored in whatsapp_groups.group_jid (e.g. "123...-456...@g.us").
 */
export async function sendWhatsAppGroupMessage(
  groupJid: string,
  groupDbId: string,
  body: string,
  meta?: { sentBy?: string | null }
): Promise<{ sid: string } | null> {
  if (!isConfigured()) {
    console.warn(
      "[WHATSAPP] Skipping group message: EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE_NAME not configured"
    );
    return null;
  }

  try {
    const result = await rawSendText(groupJid, body);

    if (!result.ok) {
      console.error(`[WHATSAPP] Evolution API error sending to group ${groupJid}:`, result.error);
      logMessage({
        phone: groupJid,
        groupId: groupDbId,
        direction: "outbound",
        body,
        status: "failed",
        sentBy: meta?.sentBy,
      });
      return null;
    }

    console.log(`[WHATSAPP] Message sent to group ${groupJid}. ID: ${result.sid}`);
    logMessage({
      phone: groupJid,
      groupId: groupDbId,
      direction: "outbound",
      body,
      status: "sent",
      twilioSid: result.sid,
      whatsappMessageId: result.sid,
      whatsappRemoteJid: groupJid,
      whatsappFromMe: true,
      sentBy: meta?.sentBy,
    });
    return { sid: result.sid as string };
  } catch (err) {
    console.error(`[WHATSAPP] Unexpected failure sending to group ${groupJid}:`, err);
    logMessage({
      phone: groupJid,
      groupId: groupDbId,
      direction: "outbound",
      body,
      status: "failed",
      sentBy: meta?.sentBy,
    });
    return null;
  }
}

/**
 * Records an inbound WhatsApp reply (called from the Evolution API webhook
 * route). `remoteJid` is the full JID from the webhook payload — either a
 * 1:1 contact ("919...@s.whatsapp.net") or a group ("123...-456...@g.us").
 * Groups are matched against whatsapp_groups.group_jid; unrecognized groups
 * (not created through the PMS) are logged with a null groupId so the raw
 * history is still captured even if there's no matching UI thread yet.
 */
export async function logIncomingWhatsAppMessage(
  remoteJid: string,
  body: string,
  senderJid?: string | null,
  senderName?: string | null,
  messageId?: string | null
) {
  if (remoteJid.includes("@g.us")) {
    let groupId: string | null = null;
    try {
      const { db } = await import("./db.ts");
      const { whatsappGroups } = await import("../shared/schema.ts");
      const { eq } = await import("drizzle-orm");
      const [group] = await db
        .select({ id: whatsappGroups.id })
        .from(whatsappGroups)
        .where(eq(whatsappGroups.groupJid, remoteJid));
      groupId = group?.id || null;
    } catch (err) {
      console.error("[WHATSAPP] Failed to look up group for incoming message:", err);
    }
    await logMessage({
      phone: remoteJid,
      groupId,
      direction: "inbound",
      body,
      status: "received",
      senderPhone: senderJid ? senderJid.split("@")[0] : null,
      senderName,
      whatsappMessageId: messageId,
      whatsappRemoteJid: remoteJid,
      whatsappFromMe: false,
    });
    return;
  }

  const fromPhone = remoteJid.split("@")[0];
  await logMessage({
    phone: fromPhone,
    direction: "inbound",
    body,
    status: "received",
    senderPhone: fromPhone,
    senderName,
    whatsappMessageId: messageId,
    whatsappRemoteJid: remoteJid,
    whatsappFromMe: false,
  });
}

/** Small helper: keep messages tidy regardless of missing fields. */
const line = (label: string, value?: string | number | null) =>
  value !== undefined && value !== null && value !== "" ? `*${label}:* ${value}\n` : "";

/**
 * Task assignment / reminder WhatsApp message.
 * Mirrors sendTaskAssignmentEmail's content.
 */
export async function sendWhatsAppTaskAssignment(
  toPhone: string | null | undefined,
  employeeData: {
    name: string;
    project: string;
    assigner: string;
    dueDate: string;
  },
  taskData: {
    name: string;
    priority: string;
    startDate: string;
    endDate: string;
    status: string;
  },
  heading: string = "New Task Assigned"
) {
  const appUrl = process.env.APP_URL || "http://localhost:5000";
  const body =
    `📌 *PMS — ${heading}*\n\n` +
    `Hi ${employeeData.name},\n\n` +
    line("Task", taskData.name) +
    line("Project", employeeData.project) +
    line("Assigned By", employeeData.assigner) +
    line("Priority", taskData.priority) +
    line("Start Date", taskData.startDate) +
    line("Due Date", taskData.endDate || employeeData.dueDate) +
    line("Status", taskData.status) +
    `\nView it here: ${appUrl}/tasks`;

  return sendWhatsAppMessage(toPhone, body);
}

/**
 * Subtask assignment WhatsApp message.
 * Mirrors sendSubtaskAssignmentEmail's content.
 */
export async function sendWhatsAppSubtaskAssignment(
  toPhone: string | null | undefined,
  employeeData: {
    name: string;
    project: string;
    assigner: string;
    dueDate: string;
  },
  subtaskData: {
    name: string;
    priority: string;
    startDate: string;
    endDate: string;
    status: string;
    parentTaskName: string;
  }
) {
  const appUrl = process.env.APP_URL || "http://localhost:5000";
  const body =
    `📌 *PMS — New Subtask Assigned*\n\n` +
    `Hi ${employeeData.name},\n\n` +
    line("Subtask", subtaskData.name) +
    line("Parent Task", subtaskData.parentTaskName) +
    line("Project", employeeData.project) +
    line("Assigned By", employeeData.assigner) +
    line("Priority", subtaskData.priority) +
    line("Start Date", subtaskData.startDate) +
    line("Due Date", subtaskData.endDate || employeeData.dueDate) +
    line("Status", subtaskData.status) +
    `\nView it here: ${appUrl}/tasks`;

  return sendWhatsAppMessage(toPhone, body);
}

/**
 * Project completion alert WhatsApp message (sent to admins).
 * Mirrors sendProjectCompletionEmail's content.
 */
export async function sendWhatsAppProjectCompletion(
  toPhone: string | null | undefined,
  projectData: {
    title: string;
    projectCode: string;
    clientName: string;
    startDate: string;
    endDate: string;
    progress: number;
  }
) {
  const appUrl = process.env.APP_URL || "http://localhost:5000";
  const body =
    `✅ *PMS — Project Completed*\n\n` +
    line("Project", projectData.title) +
    line("Code", projectData.projectCode) +
    line("Client", projectData.clientName) +
    line("Start Date", projectData.startDate) +
    line("End Date", projectData.endDate) +
    line("Progress", `${projectData.progress}%`) +
    `\nView it here: ${appUrl}/projects`;

  return sendWhatsAppMessage(toPhone, body);
}

/**
 * Ticket notification WhatsApp message.
 * Mirrors sendTicketNotificationEmail's content.
 */
export async function sendWhatsAppTicketNotification(
  toPhone: string | null | undefined,
  ticketData: {
    ticketCode: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    projectName?: string;
    createdByName: string;
    assignedToName?: string;
  },
  type: "created" | "updated" | "completed"
) {
  const appUrl = process.env.APP_URL || "http://localhost:5000";
  const heading =
    type === "created"
      ? "New Support Ticket"
      : type === "completed"
        ? "Ticket Completed"
        : "Ticket Updated";

  const body =
    `🎫 *PMS — ${heading}*\n\n` +
    line("Ticket", `${ticketData.ticketCode} — ${ticketData.title}`) +
    line("Category", ticketData.category) +
    line("Priority", ticketData.priority) +
    line("Status", ticketData.status) +
    line("Project", ticketData.projectName) +
    line("Raised By", ticketData.createdByName) +
    line("Assigned To", ticketData.assignedToName) +
    `\nView it here: ${appUrl}/tickets`;

  return sendWhatsAppMessage(toPhone, body);
}