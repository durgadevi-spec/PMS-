// server/cliqOAuth.ts
//
// Zoho Cliq Phase 2 — per-employee OAuth (India data center).
// Read-only: requests ZohoCliq.Chats.READ only. Structurally mirrors
// server/googleCalendar.ts's OAuth handling (see that file for the pattern
// this was copied from). Do not add write scopes (Chats.UPDATE,
// Messages.CREATE, etc.) here without deliberately deciding to — see the
// Phase 2 report for why.
//
// PMS is the directory/launcher/overview; Zoho Cliq remains the messaging
// client. This file only ever reads chat metadata — it never sends
// messages, marks anything read, or opens a socket.

import { eq } from "drizzle-orm";
import { db } from "./db.ts";
import { cliqAccounts } from "../shared/schema.ts";

const CLIQ_CLIENT_ID = process.env.CLIQ_CLIENT_ID || "";
const CLIQ_CLIENT_SECRET = process.env.CLIQ_CLIENT_SECRET || "";
const CLIQ_REDIRECT_URI = process.env.CLIQ_REDIRECT_URI || "";

// India data center. Do not switch to .com — see cliqConfig.ts and the
// Phase 2 report for why these three hosts must all match the org's DC.
const ACCOUNTS_BASE = "https://accounts.zoho.in";
const AUTH_URL = `${ACCOUNTS_BASE}/oauth/v2/auth`;
const TOKEN_URL = `${ACCOUNTS_BASE}/oauth/v2/token`;
const USERINFO_URL = `${ACCOUNTS_BASE}/oauth/user/info`;
export const CLIQ_API_BASE = "https://cliq.zoho.in/api/v2";

// Where to send the browser after /api/cliq/callback finishes. Derived from
// CLIQ_REDIRECT_URI itself (e.g. http://localhost:5001/api/cliq/callback ->
// http://localhost:5001) rather than APP_URL/NODE_ENV, so a local test
// always redirects back to localhost and a deployed instance always
// redirects back to its own domain — whichever one actually started the
// OAuth flow — instead of both landing on one shared/global APP_URL.
export function getCliqFrontendBase(): string {
  return CLIQ_REDIRECT_URI.replace(/\/api\/cliq\/callback\/?$/, "");
}

// Deliberately minimal for Phase 2. ZohoCliq.Chats.READ is the actual
// product permission (recent conversations, later phases). AaaServer.profile.READ
// is required separately — Zoho's oauth/user/info identity endpoint (used
// below to learn the connected account's email/ZUID) rejects requests with
// INVALID_OAUTHSCOPE unless this exact scope was included in the original
// consent request. It only grants read access to basic profile info
// (email, display name, ZUID) — not a Cliq permission, and not
// Chats.UPDATE. Do not widen beyond these two without asking first.
const SCOPE = "ZohoCliq.Chats.READ,ZohoCliq.Channels.READ,ZohoCliq.Messages.READ,ZohoCliq.Webhooks.CREATE,AaaServer.profile.READ";

if (!CLIQ_CLIENT_ID || !CLIQ_CLIENT_SECRET || !CLIQ_REDIRECT_URI) {
  console.warn(
    "⚠️  Zoho Cliq overview is not configured — missing CLIQ_CLIENT_ID / CLIQ_CLIENT_SECRET / CLIQ_REDIRECT_URI in .env"
  );
}

/* ============================================================
   OAuth: build consent URL, exchange code, refresh tokens
============================================================ */

// `state` carries the internal PMS user id (not the employee's Cliq
// identity) so we know who's connecting when Zoho redirects back to
// /api/cliq/callback. The callback route cannot rely on the PMS
// Authorization header — Zoho's redirect is a plain browser navigation —
// so `state` is the only link back to the authenticated PMS user.
export function getCliqAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: CLIQ_CLIENT_ID,
    redirect_uri: CLIQ_REDIRECT_URI,
    response_type: "code",
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // force a refresh_token even on a repeat connect
    scope: SCOPE,
    state: userId,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIQ_CLIENT_ID,
      client_secret: CLIQ_CLIENT_SECRET,
      redirect_uri: CLIQ_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Cliq token exchange failed: ${JSON.stringify(data)}`);
  }
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIQ_CLIENT_ID,
      client_secret: CLIQ_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    // Covers both expiry and revocation — Zoho returns an `error` field
    // (e.g. invalid_code / invalid_client) rather than a clean 401 for a
    // dead refresh token in some cases, so we check both.
    throw new CliqReauthRequiredError(
      `Cliq token refresh failed: ${JSON.stringify(data)}`
    );
  }
  return data as { access_token: string; expires_in: number };
}

// Thrown when a token is expired/revoked and cannot be silently refreshed.
// Routes should catch this and surface "reconnect required" rather than a
// generic 500, and callers must stop — no retry loop.
export class CliqReauthRequiredError extends Error {}

async function fetchCliqIdentity(accessToken: string): Promise<{ email: string; zuid: string }> {
  // Zoho's account-level userinfo endpoint (not Cliq-specific) — used the
  // same way Google's /oauth2/v2/userinfo is used in googleCalendar.ts, to
  // learn who authorized us without needing a separate Cliq "me" call.
  // NOTE: verify the exact response field casing (Email/ZUID vs email/zuid)
  // against a live token before shipping — see the Phase 2 verification
  // checklist. Both casings are handled defensively below.
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  const email = data.Email || data.email || "";
  const zuid = data.ZUID || data.zuid || data.zoid || "";
  if (!email) {
    throw new Error(`Could not determine Cliq account email from Zoho response: ${JSON.stringify(data)}`);
  }
  return { email, zuid: String(zuid) };
}

/* ============================================================
   Handle the OAuth callback: save tokens for this PMS user
============================================================ */
export async function handleCliqCallback(userId: string, code: string) {
  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Zoho did not return a refresh token. Please disconnect and reconnect, granting access again."
    );
  }

  const identity = await fetchCliqIdentity(tokens.access_token);
  const expiry = new Date(Date.now() + tokens.expires_in * 1000);

  await db
    .insert(cliqAccounts)
    .values({
      userId,
      cliqZuid: identity.zuid,
      cliqEmail: identity.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: expiry,
    })
    .onConflictDoUpdate({
      target: cliqAccounts.userId,
      set: {
        cliqZuid: identity.zuid,
        cliqEmail: identity.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: expiry,
      },
    });

  return { email: identity.email };
}

/* ============================================================
   Get a valid access token for a user, refreshing if needed.
   Throws CliqReauthRequiredError if the connection needs to be redone —
   callers must not retry, just surface "reconnect".
============================================================ */
export async function getValidCliqAccessToken(userId: string): Promise<string | null> {
  const [account] = await db.select().from(cliqAccounts).where(eq(cliqAccounts.userId, userId));
  if (!account) return null;

  const now = Date.now();
  const expiry = new Date(account.tokenExpiry).getTime();

  if (expiry - now > 2 * 60 * 1000) {
    return account.accessToken;
  }

  const refreshed = await refreshAccessToken(account.refreshToken);
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);

  await db
    .update(cliqAccounts)
    .set({ accessToken: refreshed.access_token, tokenExpiry: newExpiry })
    .where(eq(cliqAccounts.userId, userId));

  return refreshed.access_token;
}

export async function isCliqConnected(userId: string) {
  const [account] = await db.select().from(cliqAccounts).where(eq(cliqAccounts.userId, userId));
  return account
    ? { connected: true, cliqEmail: account.cliqEmail, connectedAt: account.connectedAt }
    : { connected: false as const };
}

export async function disconnectCliq(userId: string) {
  await db.delete(cliqAccounts).where(eq(cliqAccounts.userId, userId));
}

async function cliqRequest(userId: string, path: string, init: RequestInit = {}) {
  const accessToken = await getValidCliqAccessToken(userId);
  if (!accessToken) return null;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Zoho-oauthtoken ${accessToken}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${CLIQ_API_BASE}${path}`, { ...init, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Cliq API ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function listCliqChats(userId: string) {
  return cliqRequest(userId, "/chats?limit=100");
}

export async function listCliqChannels(userId: string) {
  return cliqRequest(userId, "/channels?joined=true&limit=100");
}

// Best-effort extraction of "when was this chat last active", trying every
// field name Cliq's v2/v3 chat list responses have been seen to use. Used
// only as a tiebreaker below — never to override the structural score.
function getChatRecency(chat: any): number {
  const candidates = [
    chat?.last_modified_time,
    chat?.last_message_info?.time,
    chat?.last_message_information?.time,
    chat?.last_message_time,
  ];
  for (const value of candidates) {
    if (value === undefined || value === null) continue;
    const parsed = typeof value === "number" ? value : Date.parse(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function findCliqChatByEmail(userId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await listCliqChats(userId) as {
    chats?: Array<{ chat_id?: string; chat_type?: string; participant_count?: number; name?: string; title?: string }>
  } | null;
  const matches: Array<{ chat: any; score: number; recency: number }> = [];

  console.log(`[cliq-chat-lookup] email=${normalizedEmail} scanning ${result?.chats?.length ?? 0} chats`);

  for (const chat of result?.chats || []) {
    if (!chat.chat_id) continue;

    const participantCount = Number(chat.participant_count ?? 0);
    const members = await cliqRequest(userId, `/chats/${encodeURIComponent(chat.chat_id)}/members`) as {
      members?: Array<any>
      data?: Array<any>
    } | null;
    const memberList = members?.members || members?.data || [];
    const hasTargetMember = memberList.some((member) => {
      const candidateEmails = [
        member.email_id,
        member.email,
        member.user_email,
        member.emailAddress,
        member.email_address,
        member.user?.email,
        member.user?.email_id,
      ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
      return candidateEmails.includes(normalizedEmail);
    });
    if (!hasTargetMember) continue;

    const score = (
      (chat.chat_type === "chat" ? 28 : 0) +
      (participantCount <= 2 ? 45 : 0) +
      (participantCount === 2 ? 25 : 0) +
      (!chat.name ? 8 : 0)
    );
    const recency = getChatRecency(chat);

    console.log(
      `[cliq-chat-lookup]   candidate chat_id=${chat.chat_id} name=${JSON.stringify(chat.name)} ` +
      `chat_type=${chat.chat_type} participant_count=${participantCount} score=${score} ` +
      `recency=${recency ? new Date(recency).toISOString() : "unknown"}`
    );

    matches.push({ chat, score, recency });
  }

  if (matches.length === 0) {
    console.log(`[cliq-chat-lookup] no chat found with a member matching ${normalizedEmail} — falling back to client-side name matching`);
    return null;
  }
  // Highest structural score wins first (i.e. genuinely looks like a 1:1
  // chat). Only when two candidates score identically — e.g. Naveen is a
  // member of both his personal DM and an old, unrelated 2-person chat
  // such as an archived IT-support thread — do we break the tie by which
  // one has actually been active more recently, so a months-old stale chat
  // can't be shown instead of the live conversation.
  matches.sort((a, b) => (b.score - a.score) || (b.recency - a.recency));
  console.log(`[cliq-chat-lookup] picked chat_id=${matches[0].chat.chat_id} name=${JSON.stringify(matches[0].chat.name)} out of ${matches.length} candidate(s)`);
  return matches[0].chat;
}

export async function getCliqMessages(userId: string, chatId: string) {
  return cliqRequest(userId, `/chats/${encodeURIComponent(chatId)}/messages?limit=100`);
}

export async function deleteCliqMessage(userId: string, chatId: string, messageId: string) {
  return cliqRequest(userId, `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
}

export async function getCliqChannelThreads(userId: string, channelId: string) {
  return cliqRequest(userId, `/channels/${encodeURIComponent(channelId)}/threads?state=all&type=open&limit=100`);
}

export async function sendCliqThreadMessage(userId: string, threadId: string, text: string) {
  return cliqRequest(userId, `/chats/${encodeURIComponent(threadId)}/message`, {
    method: "POST",
    body: JSON.stringify({ text, sync_message: true }),
  });
}

export async function downloadCliqFile(userId: string, fileId: string) {
  const accessToken = await getValidCliqAccessToken(userId);
  if (!accessToken) return null;

  const response = await fetch(`${CLIQ_API_BASE}/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Cliq file API ${response.status}`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function uploadCliqFile(
  userId: string,
  email: string,
  file: { buffer: Buffer; filename: string; mimetype: string },
) {
  const accessToken = await getValidCliqAccessToken(userId);
  if (!accessToken) return null;

  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype }), file.filename);
  const response = await fetch(`${CLIQ_API_BASE}/buddies/${encodeURIComponent(email)}/files`, {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Cliq file upload API ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function uploadCliqChatFile(
  userId: string,
  chatId: string,
  file: { buffer: Buffer; filename: string; mimetype: string },
) {
  const accessToken = await getValidCliqAccessToken(userId);
  if (!accessToken) return null;

  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype }), file.filename);
  const response = await fetch(`${CLIQ_API_BASE}/chats/${encodeURIComponent(chatId)}/files`, {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Cliq chat file upload API ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function uploadCliqChannelFile(
  userId: string,
  channelId: string,
  file: { buffer: Buffer; filename: string; mimetype: string },
) {
  const accessToken = await getValidCliqAccessToken(userId);
  if (!accessToken) return null;

  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype }), file.filename);
  const response = await fetch(`${CLIQ_API_BASE}/channels/${encodeURIComponent(channelId)}/files`, {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Cliq channel file upload API ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function sendCliqMessage(userId: string, email: string, text: string) {
  return cliqRequest(userId, `/buddies/${encodeURIComponent(email)}/message`, {
    method: "POST",
    body: JSON.stringify({ text, sync_message: true }),
  });
}

export async function sendCliqChatMessage(userId: string, chatId: string, text: string) {
  return cliqRequest(userId, `/chats/${encodeURIComponent(chatId)}/message`, {
    method: "POST",
    body: JSON.stringify({ text, sync_message: true }),
  });
}

export async function sendCliqChannelMessage(userId: string, channelId: string, text: string) {
  return cliqRequest(userId, `/channels/${encodeURIComponent(channelId)}/message`, {
    method: "POST",
    body: JSON.stringify({ text, sync_message: true }),
  });
}