import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Search, MessageCircle, ExternalLink, Users2, Link2, Unlink, Loader2, Send, RefreshCw, Paperclip, Hash, X, ChevronDown, ListTodo, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch } from "@/lib/apiClient";
import { CLIQ_BASE_URL, buildCliqUserDeepLink } from "@/lib/cliqConfig";
import { connectCliq, deleteCliqMessage, disconnectCliqAccount, downloadCliqFile, getCliqChannelThreads, getCliqChannels, getCliqChatForEmail, getCliqChats, getCliqDirectChatEmails, getCliqMessages, getCliqStatus, sendCliqChannelMessage, sendCliqChatMessage, sendCliqMessage, sendCliqThreadMessage, type CliqChannel, type CliqChat, type CliqMessage, type CliqThread, uploadCliqChannelFile, uploadCliqChatFile, uploadCliqFile } from "@/lib/cliqApi";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Employee = {
  id: string;
  name: string;
  department?: string | null;
  email?: string | null;
  designation?: string | null;
};

interface ZohoCliqPanelProps {
  employees: Employee[];
  currentEmployeeId?: string | null;
  // Reports the number of Cliq conversations (DMs + group chats) that have
  // a message newer than the last time this user opened them, so the
  // parent page can show a notification-style number badge on the "Zoho
  // Cliq" tab without duplicating the unread-tracking logic itself.
  onUnreadCountChange?: (count: number) => void;
}

// Zoho Cliq's /chats endpoint (v2) does not return a per-chat unread count,
// so "unread" here is tracked client-side: we remember the timestamp each
// chat was last opened and compare it against that chat's last message
// time. This is per-browser (localStorage), scoped per logged-in employee.
const CLIQ_LAST_READ_STORAGE_PREFIX = "cliq_last_read:";

function loadCliqLastReadMap(employeeId?: string | null): Record<string, number> {
  if (!employeeId) return {};
  try {
    const raw = localStorage.getItem(CLIQ_LAST_READ_STORAGE_PREFIX + employeeId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCliqLastReadMap(employeeId: string | null | undefined, map: Record<string, number>) {
  if (!employeeId) return;
  try {
    localStorage.setItem(CLIQ_LAST_READ_STORAGE_PREFIX + employeeId, JSON.stringify(map));
  } catch {
    // Storage full or unavailable — unread tracking just won't persist.
  }
}

// Best-effort extraction of "when was this chat last active" for unread
// tracking — mirrors the same field-name fallbacks server/cliqOAuth.ts
// already had to use (getChatRecency), since different Cliq DCs/API
// versions have been observed to use different keys, and the value can
// come through as either a number (epoch ms) or an ISO date string.
function getCliqChatLastMessageTime(chat?: Record<string, any>): number {
  const candidates = [
    chat?.last_message_info?.time,
    chat?.last_message_information?.time,
    chat?.last_modified_time,
    chat?.last_message_time,
  ];
  for (const value of candidates) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = typeof value === "number" ? value : Date.parse(String(value));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

export default function ZohoCliqPanel({ employees, currentEmployeeId, onUnreadCountChange }: ZohoCliqPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<CliqChannel | null>(null);
  const [selectedThread, setSelectedThread] = useState<CliqThread | null>(null);
  const [selectedGroupChat, setSelectedGroupChat] = useState<{ chat_id: string; name?: string; participant_count?: number } | null>(null);
  // Tracked separately from selectedChannel so the threads sublist can be
  // collapsed without also leaving/deselecting the channel itself.
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [contextReplyText, setContextReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAskAboutOpen, setIsAskAboutOpen] = useState(false);
  const [askProjectId, setAskProjectId] = useState("");
  const [askTaskIds, setAskTaskIds] = useState<string[]>([]);
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const [taskSearchTerm, setTaskSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageListEndRef = useRef<HTMLDivElement>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<Record<string, CliqMessage[]>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const userEditedCliqDraftRef = useRef(false);

  const clearTaskContextFromUrl = () => {
    const url = new URL(window.location.href);
    ["projectId", "projectTitle", "keyStepId", "keyStepTitle", "taskId", "taskName", "subtaskName", "employeeId", "recipientIds"].forEach((key) => {
      url.searchParams.delete(key);
    });
    window.history.replaceState({}, "", `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ""}`);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const employeeId = params.get("employeeId");
    const hasTaskContext = !!(params.get("projectTitle") || params.get("taskName") || params.get("keyStepTitle") || params.get("subtaskName"));

    if (!employeeId) {
      if (!hasTaskContext) {
        setDraft("");
        setContextReplyText("");
        userEditedCliqDraftRef.current = false;
      }
      return;
    }

    if (String(employeeId) === String(currentEmployeeId) || String(employeeId) === String(currentEmployeeId ?? "")) {
      setSelectedEmployee(null);
      return;
    }

    const employee = employees.find((item) => String(item.id) === String(employeeId));
    if (!employee) return;

    setSelectedEmployee(employee);
    setSelectedThread(null);
    setSelectedChannel(null);
    setSelectedGroupChat(null);
    setSelectedFile(null);
    userEditedCliqDraftRef.current = false;
  }, [location.search, employees, currentEmployeeId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const projectTitle = params.get("projectTitle") || "";
    const taskName = params.get("taskName") || "";
    const keyStepTitle = params.get("keyStepTitle") || "";
    const subtaskName = params.get("subtaskName") || "";

    if (!projectTitle && !taskName && !keyStepTitle && !subtaskName) {
      setDraft("");
      setContextReplyText("");
      userEditedCliqDraftRef.current = false;
      return;
    }

    if (!selectedEmployee || userEditedCliqDraftRef.current) return;

    const contextText = [projectTitle && `Project: ${projectTitle}`, taskName && `Task: ${taskName}`, keyStepTitle && `Key Step: ${keyStepTitle}`, subtaskName && `Subtask: ${subtaskName}`]
      .filter(Boolean)
      .join(" | ");

    const autoContext = contextText ? `[${contextText}]` : "";
    setContextReplyText(autoContext);
    setDraft("");
    userEditedCliqDraftRef.current = false;
  }, [location.search, selectedEmployee]);

  // Connection status only (Phase 2, Slice 1). No polling, no interval, no
  // refetch-on-focus — this is a manual/one-shot check, same discipline the
  // Phase 2 plan requires for the recent-conversations query that lands in
  // Slice 2. A long staleTime avoids re-checking on every tab switch.
  const { data: cliqStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["cliq-status"],
    queryFn: getCliqStatus,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const shouldPollCliq = !!cliqStatus?.connected;
  const cliqPollingInterval: number | false = shouldPollCliq ? 20 * 1000 : false;

  const { data: chatsData, isLoading: chatsLoading } = useQuery({
    queryKey: ["cliq-chats"],
    queryFn: getCliqChats,
    enabled: shouldPollCliq,
    staleTime: 30 * 1000,
    // Unlike the one-shot status check above, this list needs to notice
    // new incoming messages on its own — otherwise the unread badge would
    // only ever update when this panel happens to remount (e.g. switching
    // page tabs away and back).
    refetchInterval: cliqPollingInterval,
  });

  // Per-chat "last opened" timestamps used to derive unread state — see the
  // CLIQ_LAST_READ_STORAGE_PREFIX helpers above.
  const [cliqLastReadMap, setCliqLastReadMap] = useState<Record<string, number>>({});
  const cliqUnreadBootstrappedRef = useRef(false);

  useEffect(() => {
    setCliqLastReadMap(loadCliqLastReadMap(currentEmployeeId));
    cliqUnreadBootstrappedRef.current = false;
  }, [currentEmployeeId]);

  const markCliqChatRead = (chatId?: string | null) => {
    if (!chatId) return;
    setCliqLastReadMap((current) => {
      const currentChat = chatsData?.chats?.find((chat) => chat.chat_id === chatId);
      const lastMessageTime = currentChat ? getCliqChatLastMessageTime(currentChat) : Date.now();
      const nextReadAt = Math.max(current[chatId] ?? 0, lastMessageTime || Date.now());
      if (current[chatId] === nextReadAt) return current;
      const next = { ...current, [chatId]: nextReadAt };
      saveCliqLastReadMap(currentEmployeeId, next);
      return next;
    });
  };

  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ["cliq-channels"],
    queryFn: getCliqChannels,
    enabled: !!cliqStatus?.connected,
    staleTime: 30 * 1000,
  });

  const { data: threadsData, isLoading: threadsLoading } = useQuery({
    queryKey: ["cliq-channel-threads", selectedChannel?.channel_id],
    queryFn: () => getCliqChannelThreads(selectedChannel!.channel_id),
    enabled: !!selectedChannel?.channel_id,
    staleTime: 30 * 1000,
  });

  // Authoritative source for the teammate list's per-row unread dot: real
  // Cliq chat membership (same lookup /chat-for-email uses for the open
  // conversation), resolved once for every direct chat instead of per
  // employee. This is what lets a row's dot show up correctly even when
  // the teammate's Cliq display name doesn't match their PMS name.
  const { data: directChatEmailsData } = useQuery({
    queryKey: ["cliq-direct-chat-emails"],
    queryFn: getCliqDirectChatEmails,
    enabled: shouldPollCliq,
    staleTime: 30 * 1000,
    refetchInterval: cliqPollingInterval,
  });

  const { data: selectedChatData, isLoading: chatLookupLoading } = useQuery({
    queryKey: ["cliq-chat-for-email", selectedEmployee?.email],
    queryFn: () => getCliqChatForEmail(selectedEmployee!.email!),
    enabled: !!selectedEmployee?.email && !!cliqStatus?.connected,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Zoho Cliq's /chats endpoint returns chat_type "chat" for BOTH 1:1 DMs
  // and group chats — participant_count is the only reliable signal for
  // "is this actually a direct chat with just one other person". Do not
  // OR this with chat_type again, or every group chat becomes eligible.
  const isDirectCliqChat = (chat: { participant_count?: number }) => Number(chat.participant_count ?? 0) <= 2;

  // The first time we see this user's chat list, treat every conversation
  // as already read instead of flooding them with unread badges for
  // history that predates this feature. Anything that arrives after this
  // (or any chat we've genuinely never seen before) still counts as
  // unread, since it simply won't have an entry yet.
  useEffect(() => {
    if (!chatsData?.chats || cliqUnreadBootstrappedRef.current) return;
    cliqUnreadBootstrappedRef.current = true;
    setCliqLastReadMap((current) => {
      let changed = false;
      const next = { ...current };
      for (const chat of chatsData.chats) {
        if (!chat.chat_id) continue;
        if (!(chat.chat_id in next)) {
          next[chat.chat_id] = getCliqChatLastMessageTime(chat);
          changed = true;
        }
      }
      if (changed) saveCliqLastReadMap(currentEmployeeId, next);
      return changed ? next : current;
    });
  }, [chatsData, currentEmployeeId]);

  const isCliqChatUnread = (chat?: { chat_id?: string; last_message_info?: { time?: string } }) => {
    if (!chat?.chat_id) return false;
    const lastMessageTime = getCliqChatLastMessageTime(chat);
    if (!lastMessageTime) return false;
    return lastMessageTime > (cliqLastReadMap[chat.chat_id] ?? 0);
  };

  // Names coming out of Cliq vs. the PMS employee record often carry small,
  // cosmetic differences that a raw string === would choke on — an initial
  // written as "S." vs "S ", double spaces, or the first/last name written
  // in a different order ("S.Naveen Kumar" vs "Naveen Kumar S"). Strip
  // punctuation/whitespace noise for the exact check, and keep a
  // word-set comparison as a second pass so reordered names still match.
  const normalizeForMatch = (value: string) =>
    value
      .toLowerCase()
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const wordSetForMatch = (value: string) =>
    new Set(normalizeForMatch(value).split(" ").filter(Boolean));

  const namesRefersToSamePerson = (nameA: string, nameB: string) => {
    if (!nameA || !nameB) return false;
    if (normalizeForMatch(nameA) === normalizeForMatch(nameB)) return true;

    // Word-set match: same words present on both sides (ignoring order),
    // and at least two words so a single shared initial can't match.
    const wordsA = wordSetForMatch(nameA);
    const wordsB = wordSetForMatch(nameB);
    if (wordsA.size < 2 || wordsB.size < 2) return false;
    if (wordsA.size !== wordsB.size) return false;
    for (const word of wordsA) {
      if (!wordsB.has(word)) return false;
    }
    return true;
  };

  // Last-resort fallback ONLY: the accurate match is getCliqChatForEmail,
  // which checks real chat membership by email on the server. This fallback
  // only runs once that lookup has finished and found nothing (see
  // selectedChat below) — it must never race ahead of it. Because it's a
  // last resort, require a full-name or exact-email-prefix match (allowing
  // for punctuation/word-order noise, see namesRefersToSamePerson above)
  // rather than loose single-token substring matching, which could match
  // an unrelated chat (e.g. a short token like an initial matching almost
  // any chat name).
  const fallbackDirectChat = useMemo(() => {
    if (!selectedEmployee || !chatsData?.chats) return null;

    const targetName = (selectedEmployee.name || "").trim();
    const targetEmailPrefix = (selectedEmployee.email || "").split("@")[0].trim().toLowerCase();
    if (!targetName && !targetEmailPrefix) return null;

    const candidates = chatsData.chats.filter((chat) => {
      if (!isDirectCliqChat(chat)) return false;

      const chatName = (chat.name || "").trim();
      if (!chatName) return false;

      return (
        namesRefersToSamePerson(chatName, targetName) ||
        (!!targetEmailPrefix && chatName.trim().toLowerCase() === targetEmailPrefix)
      );
    });

    // If more than one chat matches, we can't safely tell them apart by
    // name alone — better to show nothing than the wrong person's
    // conversation.
    return candidates.length === 1 ? candidates[0] : null;
  }, [chatsData, selectedEmployee]);

  // Same match heuristic as fallbackDirectChat above, but run across every
  // teammate up front so each row in the list can show its own unread
  // badge without a per-employee server lookup.
  //
  // Primary source: directChatEmailsData, which resolves each direct
  // chat's other participant by actual Cliq membership on the server
  // (see /api/cliq/direct-chat-emails) — this is accurate regardless of
  // what the chat happens to be *named*. Only employees an email lookup
  // didn't resolve (e.g. the bulk lookup hasn't loaded yet, or the
  // teammate has no confirmed membership match) fall back to the
  // heuristic name/email-prefix match against the chat name.
  const employeeCliqChatMap = useMemo(() => {
    const map: Record<string, CliqChat> = {};
    if (!chatsData?.chats) return map;
    const directChats = chatsData.chats.filter(isDirectCliqChat);
    const chatsById = new Map(directChats.map((chat) => [chat.chat_id, chat]));

    const chatIdByEmail = new Map<string, string>();
    for (const entry of directChatEmailsData?.entries || []) {
      if (entry.chat_id && entry.email) chatIdByEmail.set(entry.email, entry.chat_id);
    }

    for (const emp of employees) {
      const targetEmail = (emp.email || "").trim().toLowerCase();
      const viaEmail = targetEmail ? chatIdByEmail.get(targetEmail) : undefined;
      if (viaEmail && chatsById.has(viaEmail)) {
        map[emp.id] = chatsById.get(viaEmail)!;
        continue;
      }

      const targetName = (emp.name || "").trim();
      const targetEmailPrefix = targetEmail.split("@")[0];
      if (!targetName && !targetEmailPrefix) continue;
      const candidates = directChats.filter((chat) => {
        const chatName = (chat.name || "").trim();
        if (!chatName) return false;
        return (
          namesRefersToSamePerson(chatName, targetName) ||
          (!!targetEmailPrefix && chatName.trim().toLowerCase() === targetEmailPrefix)
        );
      });
      if (candidates.length === 1) map[emp.id] = candidates[0];
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatsData, directChatEmailsData, employees]);

  // The chats list only tells us a chat *has* unread activity, not how
  // many messages are unread — Cliq's /chats endpoint doesn't return a
  // count (see the note above isCliqChatUnread). To show an actual number
  // next to a teammate's name instead of just a dot, fetch the message
  // list for only the chats that are currently unread (typically a
  // handful, not every chat) and count how many landed after this chat
  // was last marked read.
  const unreadChatIds = useMemo(() => {
    const ids = new Set<string>();
    for (const chat of chatsData?.chats ?? []) {
      if (chat.chat_id && isCliqChatUnread(chat)) ids.add(chat.chat_id);
    }
    return Array.from(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatsData, cliqLastReadMap]);

  const unreadChatMessagesQueries = useQueries({
    queries: unreadChatIds.map((chatId) => ({
      queryKey: ["cliq-unread-count-messages", chatId],
      queryFn: () => getCliqMessages(chatId),
      enabled: shouldPollCliq,
      staleTime: 15 * 1000,
      refetchInterval: cliqPollingInterval,
    })),
  });

  const unreadCountByChatId = useMemo(() => {
    const counts: Record<string, number> = {};
    unreadChatIds.forEach((chatId, index) => {
      const lastRead = cliqLastReadMap[chatId] ?? 0;
      const messages = unreadChatMessagesQueries[index]?.data?.data || [];
      counts[chatId] = messages.filter((message) => (message.time ?? 0) > lastRead).length;
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadChatIds, unreadChatMessagesQueries, cliqLastReadMap]);

  const cliqUnreadCount = useMemo(() => {
    if (!chatsData?.chats) return 0;
    return chatsData.chats.filter((chat) => isCliqChatUnread(chat)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatsData, cliqLastReadMap]);

  useEffect(() => {
    onUnreadCountChange?.(cliqUnreadCount);
  }, [cliqUnreadCount, onUnreadCountChange]);

  const selectedChat = useMemo(() => {
    if (selectedChannel && !selectedThread) return null;
    if (selectedGroupChat) return selectedGroupChat;
    if (!selectedEmployee) return null;
    // Only fall back to the loose name match once the accurate,
    // email-based server lookup has actually finished. Using the fallback
    // while that request is still in flight is what let a random chat
    // flash up before correcting itself (or stick around if the lookup
    // failed silently).
    if (chatLookupLoading) return null;
    const directChat = selectedChatData?.chat ?? fallbackDirectChat;
    return directChat ?? null;
  }, [selectedChatData, chatLookupLoading, fallbackDirectChat, selectedChannel, selectedGroupChat, selectedThread, selectedEmployee]);

  const selectedChatId = selectedThread?.chat_id || selectedChannel?.chat_id || selectedGroupChat?.chat_id || selectedChat?.chat_id || null;

  // Opening a conversation is what clears its unread badge — this fires
  // for DMs (once the email-to-chat lookup above resolves), group chats,
  // and threads alike, since they all funnel through selectedChatId.
  useEffect(() => {
    markCliqChatRead(selectedChatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);
  const selectedConversationKey = selectedChatId || null;
  const selectedTitle = selectedThread?.title || selectedChannel?.name || selectedGroupChat?.name || selectedEmployee?.name || "Conversation";

  const { data: messagesData, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ["cliq-messages", selectedChatId],
    queryFn: () => getCliqMessages(selectedChatId!),
    enabled: !!selectedChatId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: selectedChatId ? 10 * 1000 : false,
  });

  const visibleMessages = useMemo(() => {
    const key = selectedConversationKey;
    if (!key) return [];
    const messages = [...(messagesData?.data || []), ...(optimisticMessages[key] || [])];
    return messages
      .filter((message, index, all) => all.findIndex((candidate) => candidate.id === message.id) === index)
      .sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  }, [messagesData, optimisticMessages, selectedConversationKey]);

  useEffect(() => {
    if (!selectedChatId) return;
    requestAnimationFrame(() => {
      messageListEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [selectedChatId, visibleMessages.length]);

  // Handle the redirect back from /api/cliq/callback (mirrors the Google
  // Calendar connect handling in CalendarEnhanced.tsx).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cliqParam = params.get("cliq");
    if (!cliqParam) return;

    if (cliqParam === "connected") {
      toast({ title: "Zoho Cliq connected", description: "PMS can now show a read-only overview of your recent Cliq conversations." });
      queryClient.invalidateQueries({ queryKey: ["cliq-status"] });
    } else if (cliqParam === "denied") {
      toast({ title: "Connection cancelled", description: "You didn't grant access to Zoho Cliq." });
    } else if (cliqParam === "error") {
      toast({ title: "Connection failed", description: "Something went wrong connecting Zoho Cliq.", variant: "destructive" });
    }

    params.delete("cliq");
    const newSearch = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [disconnecting, setDisconnecting] = useState(false);
  const [showCliqMenu, setShowCliqMenu] = useState(false);
  const cliqInitial = (cliqStatus && "connected" in cliqStatus && cliqStatus.connected ? cliqStatus.cliqEmail : "C")
    .split("@")
    .at(0)
    ?.charAt(0)
    .toUpperCase() || "C";

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectCliqAccount();
      setShowCliqMenu(false);
      queryClient.invalidateQueries({ queryKey: ["cliq-status"] });
      toast({ title: "Zoho Cliq disconnected" });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to disconnect", variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  // Only employees with a usable email can be reached via a Cliq deep link.
  // We also drop the current user, since chatting with yourself isn't useful.
  const chattableEmployees = useMemo(() => {
    return employees.filter(
      (e) => !!e.email && e.email.trim().length > 0 && e.id !== currentEmployeeId
    );
  }, [employees, currentEmployeeId]);

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return chattableEmployees;
    return chattableEmployees.filter(
      (e) =>
        e.name?.toLowerCase().includes(term) ||
        e.department?.toLowerCase().includes(term) ||
        e.email?.toLowerCase().includes(term)
    );
  }, [chattableEmployees, searchTerm]);

  const grouped = useMemo(() => {
    const groups: Record<string, Employee[]> = {};
    filtered.forEach((e) => {
      const key = e.department || "No Department";
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const openCliqChat = (employee: Employee) => {
    setSelectedEmployee(employee);
    setSelectedThread(null);
    setSelectedChannel(null);
    setSelectedGroupChat(null);
    setSelectedFile(null);
    setContextReplyText("");
    setDraft("");
    userEditedCliqDraftRef.current = false;
  };

  const openCliqChannel = (channel: CliqChannel) => {
    setSelectedChannel(channel);
    setSelectedThread(null);
    setSelectedEmployee(null);
    setSelectedGroupChat(null);
    setSelectedFile(null);
    setExpandedChannelId(channel.channel_id);
  };

  const openCliqThread = (thread: CliqThread) => {
    setSelectedThread(thread);
    setSelectedEmployee(null);
    setSelectedGroupChat(null);
    setSelectedChannel(null);
    setSelectedFile(null);
  };

  const openCliqGroup = (group: { chat_id: string; name?: string; participant_count?: number }) => {
    setSelectedGroupChat(group);
    setSelectedEmployee(null);
    setSelectedThread(null);
    setSelectedChannel(null);
    setSelectedFile(null);
  };

  const { data: projects = [], isLoading: loadingProjects } = useQuery<any[]>({
    queryKey: ["/api/projects?status=active"],
    queryFn: async () => {
      const res = await apiFetch("/api/projects?status=active");
      return res.ok ? res.json() : [];
    },
  });

  const { data: projectTasks = [], isLoading: loadingProjectTasks } = useQuery<any[]>({
    queryKey: [`/api/tasks/${askProjectId}?status=active`],
    queryFn: async () => {
      if (!askProjectId) return [];
      const res = await apiFetch(`/api/tasks/${askProjectId}?status=active`);
      return res.ok ? res.json() : [];
    },
    enabled: !!askProjectId,
  });

  const filteredProjects = useMemo(() => {
    const term = projectSearchTerm.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter((project) => {
      const title = (project.title || "").toLowerCase();
      const code = (project.projectCode || "").toLowerCase();
      return title.includes(term) || code.includes(term);
    });
  }, [projects, projectSearchTerm]);

  const filteredTasks = useMemo(() => {
    const term = taskSearchTerm.trim().toLowerCase();
    if (!term) return projectTasks;
    return projectTasks.filter((task) => {
      const taskName = (task.taskName || "").toLowerCase();
      const taskCode = (task.taskCode || "").toLowerCase();
      return taskName.includes(term) || taskCode.includes(term);
    });
  }, [projectTasks, taskSearchTerm]);

  const handleApplyTaskContext = () => {
    const project = projects.find((item) => String(item.id) === String(askProjectId));
    const selectedTasks = projectTasks.filter((item) => askTaskIds.includes(String(item.id)));
    const projectText = project ? `Project: ${project.title}${project.projectCode ? ` (${project.projectCode})` : ""}` : "";
    const tasksText = selectedTasks.length > 0 ? `Tasks: ${selectedTasks.map((task) => task.taskName).join(", ")}` : "";
    const reference = [projectText, tasksText].filter(Boolean).join(" | ");
    setContextReplyText(reference ? `[${reference}]` : "");
    setDraft("");
    setAskProjectId("");
    setAskTaskIds([]);
    setIsAskAboutOpen(false);
  };

  const handleSend = async () => {
    if ((!selectedEmployee?.email && !selectedChannel && !selectedGroupChat && !selectedThread) || (!draft.trim() && !selectedFile && !contextReplyText) || sending) return;
    setSending(true);
    setUploadingFile(!!selectedFile);
    try {
      const text = draft.trim();
      const fullText = contextReplyText && text ? `${contextReplyText}\n${text}` : text || contextReplyText;
      if (fullText) {
        const response = selectedThread?.chat_id
          ? await sendCliqThreadMessage(selectedThread.chat_id, fullText)
          : selectedChannel?.channel_id
          ? await sendCliqChannelMessage(selectedChannel.channel_id, fullText)
          : selectedGroupChat?.chat_id
            ? await sendCliqChatMessage(selectedGroupChat.chat_id, fullText)
          : await sendCliqMessage(selectedEmployee!.email!, fullText);
        const message: CliqMessage = {
          id: response?.message_id || `local-${Date.now()}`,
          time: Date.now(),
          type: "text",
          sender: { name: "You" },
          content: { text: fullText },
        };
        setOptimisticMessages((current) => ({
          ...current,
          [selectedThread?.chat_id || selectedChannel?.chat_id || selectedGroupChat?.chat_id || selectedEmployee!.email!]: [...(current[selectedThread?.chat_id || selectedChannel?.chat_id || selectedGroupChat?.chat_id || selectedEmployee!.email!] || []), message],
        }));
      }
      if (selectedFile) {
        if (selectedThread?.chat_id) {
          await uploadCliqChatFile(selectedThread.chat_id, selectedFile);
        } else if (selectedChannel?.channel_id) {
          await uploadCliqChannelFile(selectedChannel.channel_id, selectedFile);
        } else if (selectedGroupChat?.chat_id) {
          await uploadCliqChatFile(selectedGroupChat.chat_id, selectedFile);
        } else if (selectedEmployee?.email) {
          await uploadCliqFile(selectedEmployee.email, selectedFile);
        }
        toast({ title: "File shared", description: `${selectedFile.name} was sent to Cliq.` });
        setSelectedFile(null);
      }
      setDraft("");
      setContextReplyText("");
      userEditedCliqDraftRef.current = false;
      clearTaskContextFromUrl();
      await queryClient.invalidateQueries({ queryKey: ["cliq-chats"] });
      if (selectedEmployee?.email) await queryClient.invalidateQueries({ queryKey: ["cliq-chat-for-email", selectedEmployee.email] });
      await refetchMessages();
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to send message", description: "Reconnect Cliq if the access has expired.", variant: "destructive" });
    } finally {
      setSending(false);
      setUploadingFile(false);
    }
  };

  const missingEmailCount = employees.length - chattableEmployees.length - (currentEmployeeId ? 1 : 0);

  const getMessageText = (message: CliqMessage) => {
    if (message.content?.text) return message.content.text;
    if (message.content?.comment) return message.content.comment;
    if (message.content?.file?.name) return `Attachment: ${message.content.file.name}`;
    if (message.type === "file") return "Attachment shared in Cliq";
    if (message.type === "image") return "Image shared in Cliq";
    if (message.type === "info") return "Cliq activity notification";
    return "Message available in Open Cliq";
  };

  const formatMessageDate = (time?: number) => {
    if (!time) return "";
    return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(time));
  };

  const formatMessageTime = (time?: number) => {
    if (!time) return "";
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(time));
  };

  const handleDownload = async (message: CliqMessage) => {
    const file = message.content?.file;
    if (!file?.id || downloadingFile) return;
    setDownloadingFile(file.id);
    try {
      const blob = await downloadCliqFile(file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name || "cliq-attachment";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast({ title: "Download failed", description: "Open Cliq to access this attachment.", variant: "destructive" });
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!messageId || !selectedChatId) return;

    const confirmed = window.confirm("Delete this message from Zoho Cliq?");
    if (!confirmed) return;

    try {
      await deleteCliqMessage(selectedChatId, messageId);
      setOptimisticMessages((current) => ({
        ...current,
        [selectedConversationKey || selectedChatId]: (current[selectedConversationKey || selectedChatId] || []).filter((msg) => msg.id !== messageId),
      }));
      await queryClient.invalidateQueries({ queryKey: ["cliq-messages", selectedChatId] });
      toast({ title: "Message deleted" });
    } catch (err) {
      console.error(err);
      toast({
        title: "Delete failed",
        description: "This message could not be removed from Cliq. Older or protected messages may not allow deletion.",
        variant: "destructive",
      });
    }
  };

  const isOwnCliqMessage = (message: CliqMessage) => {
    const currentEmail = cliqStatus && "connected" in cliqStatus && cliqStatus.connected
      ? cliqStatus.cliqEmail.toLowerCase()
      : "";

    const senderName = message.sender?.name?.trim().toLowerCase() || "";
    const senderEmail = (message.sender as { email?: string } | undefined)?.email?.toLowerCase() || "";
    const senderId = message.sender?.id?.toLowerCase() || "";

    return (
      senderName === "you" ||
      senderName === "me" ||
      senderEmail === currentEmail ||
      senderId === currentEmail ||
      senderId === "you"
    );
  };

  const canDeleteCliqMessage = (message: CliqMessage) => {
    if (!message.id || !isOwnCliqMessage(message)) return false;
    const type = String(message.type || "").toLowerCase();
    if (type === "info" || type === "system" || type === "notification" || type === "file" || type === "image") return false;
    if (message.content?.file?.id) return false;
    return Boolean(message.content?.text || message.content?.comment || type === "text");
  };

  const getReadReceiptState = (message: CliqMessage) => {
    const raw = [
      message.status,
      message.delivery_status,
      message.read_status,
      message.seen ? "seen" : "",
      message.read ? "seen" : "",
      message.is_seen ? "seen" : "",
      message.isRead ? "seen" : "",
      message.delivered ? "delivered" : "",
    ].filter(Boolean).map((value) => String(value).toLowerCase());

    if (raw.some((value) => ["seen", "read"].includes(value))) return "seen";
    if (raw.some((value) => ["delivered", "sent"].includes(value))) return "delivered";
    return "pending";
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || (!selectedEmployee?.email && !selectedChannel && !selectedGroupChat && !selectedThread) || sending) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "File is too large", description: "Cliq uploads are limited to 50 MB.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="shrink-0 space-y-2 border-b bg-muted/20 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <MessageCircle className="h-4 w-4 text-primary" />
              Zoho Cliq
              {cliqUnreadCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {cliqUnreadCount > 99 ? "99+" : cliqUnreadCount}
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Chat with teammates from inside PMS. Zoho Cliq remains the source of truth.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {statusLoading ? null : cliqStatus?.connected ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCliqMenu((open) => !open)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-[12px] font-bold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
                  aria-label="Zoho Cliq account options"
                  title={cliqStatus.cliqEmail}
                >
                  {cliqInitial}
                </button>

                {showCliqMenu && (
                  <div className="absolute right-0 top-10 z-20 w-56 rounded-md border bg-popover p-2 shadow-lg">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Connected as</p>
                    <p className="truncate text-sm font-medium text-foreground">{cliqStatus.cliqEmail}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full justify-center text-xs text-muted-foreground hover:text-destructive"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                    >
                      {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                      <span className="ml-1.5">Disconnect</span>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Button size="sm" className="shrink-0 gap-1.5" onClick={connectCliq}>
                <Link2 className="h-3.5 w-3.5" />
                Connect Cliq
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-2"
              onClick={() => window.open(CLIQ_BASE_URL, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Cliq
            </Button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[420px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search teammates..."
            className="h-8 border bg-background pl-9 shadow-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 w-64 shrink-0 flex-col border-r border-slate-600 bg-slate-700 text-slate-50">
      {channelsData?.channels?.length ? (
        <div className="shrink-0 border-b border-slate-600 px-2 py-3">
          <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300">
            <Hash className="h-3 w-3" /> Channels
            <Badge variant="outline" className="ml-1 border-slate-400 text-[10px] font-normal text-slate-100">{channelsData.channels.length}</Badge>
          </div>
          <div className="space-y-1">
            {channelsData.channels.map((channel) => (
              <div key={channel.channel_id}>
                <div className={cn("flex w-full items-center gap-1 rounded-md pr-1 text-left text-sm transition-colors", selectedChannel?.channel_id === channel.channel_id ? "bg-slate-500" : "hover:bg-slate-600")}>
                  <button type="button" onClick={() => openCliqChannel(channel)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2">
                    <Hash className="h-4 w-4 shrink-0 text-slate-200" />
                    <span className="truncate">{channel.name.replace(/^#/, "")}</span>
                  </button>
                  {selectedChannel?.channel_id === channel.channel_id && (
                    <button
                      type="button"
                      onClick={() => setExpandedChannelId((current) => (current === channel.channel_id ? null : channel.channel_id))}
                      title={expandedChannelId === channel.channel_id ? "Collapse threads" : "Expand threads"}
                      className="shrink-0 rounded p-1 text-slate-200 hover:bg-slate-400/40"
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expandedChannelId === channel.channel_id ? "rotate-0" : "-rotate-90")} />
                    </button>
                  )}
                </div>
                {selectedChannel?.channel_id === channel.channel_id && expandedChannelId === channel.channel_id && (
                  <div className="ml-5 max-h-48 space-y-1 overflow-y-auto border-l border-slate-500 pl-2">
                    {threadsLoading ? <p className="px-2 py-1 text-[11px] text-slate-300">Loading threads...</p> : threadsData?.data?.length ? threadsData.data.map((thread) => (
                      <button key={thread.chat_id} type="button" onClick={() => openCliqThread(thread)} className={cn("flex w-full items-center rounded px-2 py-1.5 text-left text-xs transition-colors", selectedThread?.chat_id === thread.chat_id ? "bg-slate-500" : "text-slate-200 hover:bg-slate-600")}>
                        <span className="truncate">{thread.title || thread.last_message_information?.text || "Untitled thread"}</span>
                      </button>
                    )) : <p className="px-2 py-1 text-[11px] text-slate-300">No open threads</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {chatsData?.chats?.filter((chat) => !isDirectCliqChat(chat)).length ? (
        <div className="shrink-0 border-b border-slate-600 px-2 py-3">
          <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300">
            <Users2 className="h-3 w-3" /> Groups
          </div>
          <div className="space-y-1">
            {chatsData.chats.filter((chat) => !isDirectCliqChat(chat)).map((group) => {
              const groupUnread = isCliqChatUnread(group);
              return (
              <button
                key={group.chat_id}
                type="button"
                onClick={() => openCliqGroup(group)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                  selectedGroupChat?.chat_id === group.chat_id
                    ? "bg-slate-500"
                    : groupUnread
                    ? "bg-amber-400/20 text-amber-50 hover:bg-amber-400/30"
                    : "hover:bg-slate-600"
                )}
              >
                <Users2 className="h-4 w-4 shrink-0 text-slate-200" />
                <span className={cn("min-w-0 flex-1 truncate", groupUnread && "font-semibold")}>{group.name}</span>
                {groupUnread && (
                  <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                    •
                  </span>
                )}
              </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm italic">
            No teammates found
          </div>
        ) : (
          <div className="space-y-4 p-2">
            {grouped.map(([department, members]) => (
              <div key={department}>
                <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                  <Users2 className="h-3 w-3 text-slate-300" />
                  {department}
                  <Badge variant="outline" className="ml-1 border-slate-400 text-[10px] font-normal text-slate-100">
                    {members.length}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {members.map((emp) => {
                    const empChat = employeeCliqChatMap[emp.id];
                    const empUnread = isCliqChatUnread(empChat);
                    // The count query only kicks off once we know the
                    // chat is unread (see unreadDirectChatIds), so right
                    // after a new message arrives it may still be
                    // loading — fall back to a plain dot for that brief
                    // window instead of showing "0".
                    const empUnreadCount = empChat ? unreadCountByChatId[empChat.chat_id] : undefined;
                    return (
                    <div
                      key={emp.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCliqChat(emp)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openCliqChat(emp);
                        }
                      }}
                      className={cn(
                        "group flex cursor-pointer items-center gap-3 rounded-md p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300",
                        selectedEmployee?.id === emp.id
                          ? "bg-slate-500"
                          : empUnread
                          ? "bg-amber-400/20 hover:bg-amber-400/30"
                          : "hover:bg-slate-600"
                      )}
                    >
                      <Avatar className="h-9 w-9 shrink-0 ring-1 ring-border">
                        <AvatarFallback className="bg-slate-500 text-xs font-semibold text-slate-50">
                          {emp.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className={cn("truncate text-sm", empUnread ? "font-semibold text-white" : "font-medium")}>{emp.name}</p>
                        <p className="truncate text-xs text-slate-200">
                          {emp.designation || emp.email}
                        </p>
                      </div>
                      {empUnread && (
                        empUnreadCount ? (
                          <span
                            className="ml-auto flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-none text-white"
                            title={`${empUnreadCount} unread message${empUnreadCount === 1 ? "" : "s"}`}
                          >
                            {empUnreadCount > 99 ? "99+" : empUnreadCount}
                          </span>
                        ) : (
                          <span className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" title="Unread messages" />
                        )
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {missingEmailCount > 0 && (
        <div className="border-t border-slate-600 bg-slate-800 px-4 py-2 text-[11px] text-slate-200">
          {missingEmailCount} teammate{missingEmailCount === 1 ? "" : "s"} without an email on file can't be reached via Cliq yet.
        </div>
      )}
      </div>

      <div className="relative flex min-w-0 min-h-0 flex-1 flex-col bg-slate-50/70">
        {selectedEmployee || selectedChannel || selectedGroupChat ? (
          <>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-9 w-9"><AvatarFallback>{selectedTitle.charAt(0)}</AvatarFallback></Avatar>
                <div className="min-w-0"><p className="font-semibold truncate">{selectedTitle}</p><p className="text-xs text-muted-foreground truncate">{selectedChannel ? `${selectedChannel.participant_count || 0} members` : selectedGroupChat ? `${selectedGroupChat.participant_count || 0} members` : selectedEmployee?.email}</p></div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" title="Refresh messages" onClick={() => refetchMessages()}><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 pb-20">
              {chatsLoading || channelsLoading || chatLookupLoading || messagesLoading ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading conversation...</div> : visibleMessages.length ? <div className="space-y-4">{visibleMessages.map((message, index) => { const previousDate = formatMessageDate(visibleMessages[index - 1]?.time); const messageDate = formatMessageDate(message.time); const canDeleteMessage = canDeleteCliqMessage(message); const isOwnMessage = isOwnCliqMessage(message); const readState = getReadReceiptState(message); return <div key={message.id}>{messageDate && messageDate !== previousDate && <div className="my-2 flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm">{messageDate}</span><div className="h-px flex-1 bg-slate-200" /></div>}<div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><div className="mb-1 flex items-center justify-between gap-3"><p className="truncate text-xs font-semibold text-slate-600">{message.sender?.name || "Cliq user"}</p><div className="flex items-center gap-2"><time className="shrink-0 text-[10px] text-slate-400">{formatMessageTime(message.time)}</time>{isOwnMessage && <span className={cn("text-[10px] font-semibold", readState === "seen" ? "text-blue-600" : "text-slate-400")} title={readState === "seen" ? "Seen" : readState === "delivered" ? "Delivered" : "Sent"}>{readState === "seen" ? "✓✓" : "✓"}</span>}{canDeleteMessage && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => void handleDeleteMessage(message.id)} title="Delete message"><X className="h-3.5 w-3.5" /></Button>}</div></div><p className="whitespace-pre-wrap text-sm text-slate-700">{getMessageText(message)}</p>{message.content?.file?.id && <Button size="sm" variant="outline" className="mt-2" onClick={() => void handleDownload(message)} disabled={downloadingFile === message.content.file.id}>{downloadingFile === message.content.file.id ? "Downloading..." : "Download attachment"}</Button>}</div></div>})}<div ref={messageListEndRef} className="h-1" /></div> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No messages yet. Send a message to start one.</div>}
            </div>
            <div className="absolute bottom-0 left-0 right-0 z-10 border-t bg-background p-3">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
              {selectedFile && <div className="mb-2 flex items-center justify-between rounded border bg-muted/30 px-2 py-1 text-xs"><span className="truncate">Attached: {selectedFile.name}</span><Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setSelectedFile(null)}>Remove</Button></div>}
              {contextReplyText && (
                <div className="mb-2 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">Task reference</span>
                    <button type="button" className="text-[10px] text-slate-500 hover:text-slate-700" onClick={() => {
                      setContextReplyText("");
                      setDraft("");
                      clearTaskContextFromUrl();
                      userEditedCliqDraftRef.current = false;
                    }}>
                      Clear
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-slate-600">{contextReplyText}</p>
                </div>
              )}
              <div className="flex items-end gap-2">
                <Dialog open={isAskAboutOpen} onOpenChange={setIsAskAboutOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="icon" title="Select project or task to reference" disabled={!cliqStatus?.connected || sending}>
                      <ListTodo className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-xl overflow-hidden p-0">
                    <div className="border-b px-6 py-4">
                      <DialogHeader className="space-y-1">
                        <DialogTitle className="text-lg font-semibold">Select a project and task</DialogTitle>
                        <DialogDescription className="text-sm text-slate-600">Choose the work item to reference in the message.</DialogDescription>
                      </DialogHeader>
                    </div>
                    <div className="max-h-[72vh] overflow-y-auto px-6 py-4">
                      <div className="space-y-5">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Project</label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                              value={projectSearchTerm}
                              onChange={(event) => setProjectSearchTerm(event.target.value)}
                              placeholder="Search project..."
                              className="h-9 pl-9 text-sm"
                            />
                          </div>
                          <div className="grid max-h-[220px] gap-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2">
                            {loadingProjects ? (
                              <div className="text-sm text-muted-foreground">Loading projects…</div>
                            ) : filteredProjects.length === 0 ? (
                              <div className="text-sm text-muted-foreground">No projects available</div>
                            ) : (
                              filteredProjects.map((project) => (
                                <button
                                  key={project.id}
                                  type="button"
                                  onClick={() => {
                                    setAskProjectId(String(project.id));
                                    setAskTaskIds([]);
                                    setTaskSearchTerm("");
                                  }}
                                  className={cn(
                                    "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                    askProjectId === String(project.id) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white hover:bg-slate-100"
                                  )}
                                >
                                  <span className="truncate">{project.title}</span>
                                  {askProjectId === String(project.id) && <Check className="h-4 w-4" />}
                                </button>
                              ))
                            )}
                          </div>
                        </div>

                        {askProjectId && (
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Tasks</label>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <Input
                                value={taskSearchTerm}
                                onChange={(event) => setTaskSearchTerm(event.target.value)}
                                placeholder="Search task..."
                                className="h-9 pl-9 text-sm"
                              />
                            </div>
                            <div className="grid max-h-[260px] gap-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2">
                              {loadingProjectTasks ? (
                                <div className="text-sm text-muted-foreground">Loading tasks…</div>
                              ) : filteredTasks.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No tasks found</div>
                              ) : (
                                filteredTasks.map((task) => {
                                  const checked = askTaskIds.includes(String(task.id));
                                  return (
                                    <label key={task.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={() => {
                                          setAskTaskIds((current) =>
                                            checked ? current.filter((id) => id !== String(task.id)) : [...current, String(task.id)]
                                          );
                                        }}
                                      />
                                      <span className="flex-1 truncate">{task.taskName}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <DialogFooter className="border-t bg-slate-50 px-6 py-3">
                      <Button type="button" variant="outline" onClick={() => setIsAskAboutOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="button" onClick={handleApplyTaskContext} disabled={!askProjectId && askTaskIds.length === 0}>
                        Add reference
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={!cliqStatus?.connected || sending} title="Attach file">{uploadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}</Button><Input value={draft} onChange={(event) => { userEditedCliqDraftRef.current = true; setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} placeholder={`Type your message to ${selectedTitle}...`} disabled={!cliqStatus?.connected || sending} /><Button size="icon" onClick={() => void handleSend()} disabled={(!draft.trim() && !selectedFile && !contextReplyText) || sending} title="Send message">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></div>
            </div>
          </>
        ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a teammate to open a conversation.</div>}
      </div>
      </div>
    </div>
  );
}