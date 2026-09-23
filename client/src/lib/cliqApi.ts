import { apiFetch } from "@/lib/apiClient";

export type CliqStatus =
  | { connected: true; cliqEmail: string; connectedAt: string | null }
  | { connected: false };

export type CliqChat = {
  chat_id: string;
  name?: string;
  chat_type?: string;
  participant_count?: number;
  last_message_info?: {
    text?: string;
    time?: string;
    sender_name?: string;
  };
};

export type CliqChannel = {
  channel_id: string;
  chat_id?: string;
  name: string;
  description?: string;
  participant_count?: number;
};

export type CliqThread = {
  chat_id: string;
  title?: string;
  thread_message_id?: string;
  last_message_information?: { text?: string; time?: number; sender_name?: string };
};

export type CliqMessage = {
  id: string;
  time?: number;
  type?: string;
  status?: string;
  seen?: boolean;
  read?: boolean;
  delivered?: boolean;
  is_seen?: boolean;
  isRead?: boolean;
  delivery_status?: string;
  read_status?: string;
  sender?: { id?: string; name?: string; email?: string };
  content?: {
    text?: string;
    comment?: string;
    file?: { id?: string; name?: string; type?: string };
    thumbnail?: { width?: string; height?: string };
  };
};

/**
 * Kicks off the Zoho Cliq OAuth consent flow via a full-page navigation
 * (mirrors connectGoogle() in CalendarEnhanced.tsx) — the token has to be
 * passed as a query param here since this isn't an XHR request and can't
 * carry an Authorization header.
 */
export function connectCliq() {
  const token = localStorage.getItem("knockturn_token") || "";
  window.location.href = `/api/cliq/connect?token=${encodeURIComponent(token)}`;
}

export async function getCliqStatus(): Promise<CliqStatus> {
  const res = await apiFetch("/api/cliq/status", { bypassCache: true });
  if (!res.ok) return { connected: false };
  return res.json();
}

export async function disconnectCliqAccount(): Promise<{ success: boolean }> {
  const res = await apiFetch("/api/cliq/disconnect", { method: "POST" });
  return res.json();
}

export async function getCliqChats(): Promise<{ chats: CliqChat[] }> {
  const res = await apiFetch("/api/cliq/chats", { bypassCache: true });
  if (!res.ok) throw new Error("Failed to load Cliq chats");
  return res.json();
}

export async function getCliqChatForEmail(email: string): Promise<{ chat: CliqChat | null }> {
  const res = await apiFetch(`/api/cliq/chat-for-email?email=${encodeURIComponent(email)}`, { bypassCache: true });
  if (!res.ok) throw new Error("Failed to find Cliq conversation");
  return res.json();
}

export async function getCliqMessages(chatId: string): Promise<{ data: CliqMessage[] }> {
  const res = await apiFetch(`/api/cliq/chats/${encodeURIComponent(chatId)}/messages`, { bypassCache: true });
  if (!res.ok) throw new Error("Failed to load Cliq messages");
  return res.json();
}

export async function deleteCliqMessage(chatId: string, messageId: string) {
  const res = await apiFetch(`/api/cliq/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete Cliq message");
  return res.json();
}

export async function sendCliqMessage(email: string, text: string) {
  const res = await apiFetch("/api/cliq/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, text }),
  });
  if (!res.ok) throw new Error("Failed to send Cliq message");
  return res.json();
}

export async function downloadCliqFile(fileId: string) {
  const res = await apiFetch(`/api/cliq/files/${encodeURIComponent(fileId)}`, { bypassCache: true });
  if (!res.ok) throw new Error("Failed to download Cliq attachment");
  return res.blob();
}

export async function uploadCliqFile(email: string, file: File) {
  const form = new FormData();
  form.append("email", email);
  form.append("file", file);
  const res = await apiFetch("/api/cliq/files", { method: "POST", body: form });
  if (!res.ok) throw new Error("Failed to upload Cliq attachment");
  return res.json();
}

export async function uploadCliqChatFile(chatId: string, file: File) {
  const form = new FormData();
  form.append("chatId", chatId);
  form.append("file", file);
  const res = await apiFetch("/api/cliq/chat-files", { method: "POST", body: form });
  if (!res.ok) throw new Error("Failed to upload Cliq chat attachment");
  return res.json();
}

export async function uploadCliqChannelFile(channelId: string, file: File) {
  const form = new FormData();
  form.append("channelId", channelId);
  form.append("file", file);
  const res = await apiFetch("/api/cliq/channel-files", { method: "POST", body: form });
  if (!res.ok) throw new Error("Failed to upload Cliq channel attachment");
  return res.json();
}

export async function getCliqChannels(): Promise<{ channels: CliqChannel[] }> {
  const res = await apiFetch("/api/cliq/channels", { bypassCache: true });
  if (!res.ok) throw new Error("Failed to load Cliq channels");
  return res.json();
}

export async function sendCliqChatMessage(chatId: string, text: string) {
  const res = await apiFetch("/api/cliq/chat-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, text }),
  });
  if (!res.ok) throw new Error("Failed to send Cliq chat message");
  return res.json();
}

export async function sendCliqChannelMessage(channelId: string, text: string) {
  const res = await apiFetch("/api/cliq/channel-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, text }),
  });
  if (!res.ok) throw new Error("Failed to send Cliq channel message");
  return res.json();
}

export async function getCliqChannelThreads(channelId: string): Promise<{ data: CliqThread[] }> {
  const res = await apiFetch(`/api/cliq/channels/${encodeURIComponent(channelId)}/threads`, { bypassCache: true });
  if (!res.ok) throw new Error("Failed to load Cliq threads");
  return res.json();
}

export async function sendCliqThreadMessage(threadId: string, text: string) {
  const res = await apiFetch("/api/cliq/thread-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, text }),
  });
  if (!res.ok) throw new Error("Failed to send Cliq thread message");
  return res.json();
}