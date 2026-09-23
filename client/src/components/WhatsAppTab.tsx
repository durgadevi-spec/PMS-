import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, Users, Search, Send, Plus, Check, Loader2, UserPlus, ListTodo, PanelLeftClose, PanelLeftOpen, RefreshCw, Trash2, Reply as ReplyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/apiClient";
import { useAuth } from "@/components/Layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Conversation = {
  employeeId: string;
  name: string;
  phone: string;
  designation?: string | null;
  lastMessage: {
    body: string;
    direction: "outbound" | "inbound";
    status: string;
    createdAt: string;
  } | null;
};

type WhatsAppGroup = {
  id: string;
  groupJid: string;
  name: string;
  participantEmployeeIds: string[];
  createdAt: string;
  lastMessage: {
    body: string;
    direction: "outbound" | "inbound";
    status: string;
    createdAt: string;
  } | null;
};

type ChatMessage = {
  id: string;
  body: string;
  direction: "outbound" | "inbound";
  status: string;
  createdAt: string;
  senderName?: string | null;
  senderPhone?: string | null;
  whatsappFromMe?: boolean;
  deletedAt?: string | null;
};

type SelectedChat = { type: "employee"; id: string } | { type: "group"; id: string } | null;
type AskTargetType = "project" | "task";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function WhatsAppTab() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [selected, setSelected] = useState<SelectedChat>(null);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isAskAboutOpen, setIsAskAboutOpen] = useState(false);
  const [askTargetType, setAskTargetType] = useState<AskTargetType>("project");
  const [askProjectId, setAskProjectId] = useState("");
  const [askTaskIds, setAskTaskIds] = useState<string[]>([]);
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState("Could you please share the current status and expected completion date?");
  const [groupName, setGroupName] = useState("");
  const [groupParticipants, setGroupParticipants] = useState<string[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isRefreshingChat, setIsRefreshingChat] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("whatsapp_last_read_at") || "{}");
    } catch {
      return {};
    }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (event: MouseEvent) => {
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left || 0;
      setSidebarWidth(Math.min(520, Math.max(240, event.clientX - sidebarLeft)));
    };
    const stopResizing = () => setIsResizingSidebar(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopResizing);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingSidebar]);

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/whatsapp/conversations"],
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery<WhatsAppGroup[]>({
    queryKey: ["/api/whatsapp/groups"],
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("whatsapp") !== "1") return;

    const employeeId = params.get("employeeId");
    const linkedRecipientIds = params.get("recipientIds")?.split(",").filter(Boolean) || [];
    if (employeeId) {
      setSelected({ type: "employee", id: employeeId });
      setRecipientIds(linkedRecipientIds.length > 0 ? linkedRecipientIds : [employeeId]);
    }

    const taskName = params.get("taskName");
    const projectTitle = params.get("projectTitle");
    if (taskName || projectTitle) {
      const context = [projectTitle && `Project: ${projectTitle}`, taskName && `Task: ${taskName}`]
        .filter(Boolean)
        .join(" | ");
      setMessageInput(`[${context}]\nCould you please share the current status and expected completion date?`);
    }
  }, [location.search]);

  const { data: projects = [], isLoading: loadingProjects } = useQuery<any[]>({
    queryKey: ["/api/projects?status=active"],
    enabled: isAdmin && isAskAboutOpen,
  });

  const { data: projectTasks = [], isLoading: loadingProjectTasks } = useQuery<any[]>({
    queryKey: [`/api/tasks/${askProjectId}?status=active`],
    enabled: isAdmin && isAskAboutOpen && Boolean(askProjectId),
  });

  const { data: employeeMessages = [], isLoading: loadingEmployeeMessages } = useQuery<ChatMessage[]>({
    queryKey: ["/api/admin/whatsapp/conversation", selected?.type === "employee" ? selected.id : null],
    enabled: selected?.type === "employee",
    refetchInterval: selected?.type === "employee" ? 5000 : false,
  });

  const { data: groupThread, isLoading: loadingGroupThread } = useQuery<{ group: WhatsAppGroup; messages: ChatMessage[] }>({
    queryKey: ["/api/whatsapp/groups", selected?.type === "group" ? selected.id : null, "messages"],
    enabled: selected?.type === "group",
    refetchInterval: selected?.type === "group" ? 5000 : false,
  });

  const activeMessages: ChatMessage[] =
    selected?.type === "employee" ? employeeMessages : selected?.type === "group" ? groupThread?.messages || [] : [];

  const activeName =
    selected?.type === "employee"
      ? conversations.find((c) => c.employeeId === selected.id)?.name
      : selected?.type === "group"
      ? groups.find((g) => g.id === selected.id)?.name
      : "";

  const markChatRead = (chatKey: string, latestMessageAt?: string | null) => {
    if (!latestMessageAt) return;
    setLastReadAt((current) => {
      const next = { ...current, [chatKey]: latestMessageAt };
      localStorage.setItem("whatsapp_last_read_at", JSON.stringify(next));
      return next;
    });
  };

  const hasUnreadMessage = (chatKey: string, lastMessage: Conversation["lastMessage"] | WhatsAppGroup["lastMessage"]) =>
    Boolean(
      lastMessage?.direction === "inbound" &&
      (!lastReadAt[chatKey] || new Date(lastMessage.createdAt).getTime() > new Date(lastReadAt[chatKey]).getTime())
    );

  const refreshActiveChat = async () => {
    if (!selected) return;
    setIsRefreshingChat(true);
    try {
      if (selected.type === "employee") {
        const [threadResponse, conversationsResponse] = await Promise.all([
          apiFetch(`/api/admin/whatsapp/conversation/${selected.id}`, { bypassCache: true }),
          apiFetch("/api/whatsapp/conversations", { bypassCache: true }),
        ]);
        if (threadResponse.ok) {
          queryClient.setQueryData(
            ["/api/admin/whatsapp/conversation", selected.id],
            await threadResponse.json()
          );
        }
        if (conversationsResponse.ok) {
          queryClient.setQueryData(["/api/whatsapp/conversations"], await conversationsResponse.json());
        }
      } else {
        const [threadResponse, groupsResponse] = await Promise.all([
          apiFetch(`/api/whatsapp/groups/${selected.id}/messages`, { bypassCache: true }),
          apiFetch("/api/whatsapp/groups", { bypassCache: true }),
        ]);
        if (threadResponse.ok) {
          queryClient.setQueryData(
            ["/api/whatsapp/groups", selected.id, "messages"],
            await threadResponse.json()
          );
        }
        if (groupsResponse.ok) {
          queryClient.setQueryData(["/api/whatsapp/groups"], await groupsResponse.json());
        }
      }
    } finally {
      setIsRefreshingChat(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [activeMessages.length]);

  useEffect(() => {
    if (!selected || activeMessages.length === 0) return;
    const latest = activeMessages[activeMessages.length - 1];
    markChatRead(`${selected.type}:${selected.id}`, latest.createdAt);
  }, [selected, activeMessages.length]);

  const sendEmployeeMutation = useMutation({
    mutationFn: async ({ employeeId, recipients, message }: { employeeId: string; recipients: string[]; message: string }) => {
      const res = await apiRequest(
        recipients.length > 1 || !isAdmin ? "POST" : "POST",
        recipients.length > 1 || !isAdmin ? "/api/whatsapp/send" : "/api/admin/whatsapp/send",
        recipients.length > 1 || !isAdmin ? { employeeIds: recipients, message } : { employeeId, message }
      );
      return res.json();
    },
    onSuccess: () => {
      setMessageInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/whatsapp/conversation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/conversations"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Couldn't send message", description: err.message || "WhatsApp send failed." });
    },
  });

  const sendGroupMutation = useMutation({
    mutationFn: async ({ groupId, message }: { groupId: string; message: string }) => {
      const res = await apiRequest("POST", `/api/admin/whatsapp/groups/${groupId}/send`, { message });
      return res.json();
    },
    onSuccess: () => {
      setMessageInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/groups"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Couldn't send message", description: err.message || "WhatsApp group send failed." });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/whatsapp/groups", {
        name: groupName.trim(),
        employeeIds: groupParticipants,
      });
      return res.json();
    },
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/groups"] });
      setIsNewGroupOpen(false);
      setGroupName("");
      setGroupParticipants([]);
      setSelected({ type: "group", id: group.id });
      toast({ title: "Group created", description: `"${group.name}" is live on WhatsApp.` });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Couldn't create group", description: err.message || "Group creation failed." });
    },
  });

  const handleSend = () => {
    const trimmed = messageInput.trim();
    if (!trimmed || !selected) return;
    if (selected.type === "employee") {
      const recipients = recipientIds.length > 0 ? recipientIds : [selected.id];
      if (recipients.length === 0) return;
      sendEmployeeMutation.mutate({ employeeId: selected.id, recipients, message: trimmed });
      setReplyingTo(null);
    } else {
      sendGroupMutation.mutate({ groupId: selected.id, message: trimmed });
      setReplyingTo(null);
    }
  };

  const getMessageSenderName = (message: ChatMessage) =>
    message.senderName || message.senderPhone || (message.direction === "outbound" ? "You" : activeName || "Contact");

  const handleReplyToMessage = (message: ChatMessage) => {
    const sender = getMessageSenderName(message);
    const quote = message.body.length > 120 ? `${message.body.slice(0, 120)}...` : message.body;
    setReplyingTo(message.id);
    setMessageInput(`Reply to ${sender}: "${quote}"\n`);
  };

  const handleDeleteMessage = async (messageId: string) => {
    setDeletingMessageId(messageId);
    try {
      const response = await apiRequest("POST", `/api/admin/whatsapp/messages/${messageId}/delete`);
      const result = await response.json().catch(() => ({}));
      if (result.warning) {
        toast({ title: "Message hidden in PMS", description: result.warning });
      } else {
        toast({ title: "Message deleted from WhatsApp" });
      }
      await refreshActiveChat();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Couldn't delete message", description: err.message || "WhatsApp delete failed." });
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleAskAbout = () => {
    const project = projects.find((item) => String(item.id) === askProjectId);
    const selectedTasks = projectTasks.filter((item) => askTaskIds.includes(String(item.id)));
    const question = askQuestion.trim();
    if (!project || !question) return;

    const reference =
      askTargetType === "task" && selectedTasks.length > 0
        ? `Tasks: ${selectedTasks.map((task) => task.taskName).join(", ")} | Project: ${project.title}${project.projectCode ? ` (${project.projectCode})` : ""}`
        : `Project: ${project.title}${project.projectCode ? ` (${project.projectCode})` : ""}`;
    const taggedMessage = `[${reference}]\n${question}`;

    setMessageInput((current) => (current.trim() ? `${current.trim()}\n\n${taggedMessage}` : taggedMessage));
    setIsAskAboutOpen(false);
  };

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) => c.name.toLowerCase().includes(term) || c.phone?.includes(term));
  }, [conversations, searchTerm]);

  const filteredGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(term));
  }, [groups, searchTerm]);

  const isSending = sendEmployeeMutation.isPending || sendGroupMutation.isPending;
  const isLoadingThread =
    (selected?.type === "employee" && loadingEmployeeMessages) || (selected?.type === "group" && loadingGroupThread);

  return (
    <div className="flex h-full min-h-0 gap-6 overflow-hidden">
      {/* Sidebar: chats + groups */}
      {!isSidebarCollapsed && (
      <div ref={sidebarRef} className="relative flex flex-col border rounded-xl bg-card shadow-sm overflow-visible shrink-0" style={{ width: sidebarWidth }}>
        <div className="p-4 border-b space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              WhatsApp
            </h2>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Close chat list"
                onClick={() => setIsSidebarCollapsed(true)}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
              <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" title="New chat">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>New WhatsApp chat</DialogTitle>
                    <DialogDescription>Select a person to start or continue a direct conversation.</DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="h-72 border rounded-md p-2">
                    <div className="space-y-1">
                      {conversations.map((conversation) => (
                        <button
                          key={conversation.employeeId}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left hover:bg-muted"
                          onClick={() => {
                            setSelected({ type: "employee", id: conversation.employeeId });
                            setRecipientIds([conversation.employeeId]);
                            setIsNewChatOpen(false);
                          }}
                        >
                          <Avatar className="h-9 w-9">
                            <AvatarFallback>{initials(conversation.name)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium truncate">{conversation.name}</span>
                            <span className="block text-xs text-muted-foreground truncate">{conversation.phone}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
              {isAdmin && (
                <Dialog open={isNewGroupOpen} onOpenChange={setIsNewGroupOpen}>
                  <DialogTrigger asChild>
                    <Button size="icon" variant="default" className="h-8 w-8 rounded-full" title="New group">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>New WhatsApp Group</DialogTitle>
                    <DialogDescription>
                      Creates a real WhatsApp group via your linked number. All selected employees must have a phone number saved.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <Input
                      placeholder="Group name"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      data-testid="input-group-name"
                    />
                    <div>
                      <p className="text-sm font-medium mb-2">Participants</p>
                      <ScrollArea className="h-56 border rounded-md p-2">
                        <div className="space-y-1">
                          {conversations.map((c) => (
                            <label
                              key={c.employeeId}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                            >
                              <Checkbox
                                checked={groupParticipants.includes(c.employeeId)}
                                onCheckedChange={(checked) => {
                                  setGroupParticipants((prev) =>
                                    checked ? [...prev, c.employeeId] : prev.filter((id) => id !== c.employeeId)
                                  );
                                }}
                              />
                              <span>{c.name}</span>
                              <span className="text-xs text-muted-foreground ml-auto">{c.phone}</span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => createGroupMutation.mutate()}
                      disabled={!groupName.trim() || groupParticipants.length === 0 || createGroupMutation.isPending}
                    >
                      {createGroupMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Create Group
                    </Button>
                  </DialogFooter>
                </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {filteredGroups.length > 0 && (
              <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Users className="h-3 w-3" /> Groups
              </p>
            )}
            {filteredGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setSelected({ type: "group", id: g.id });
                  setRecipientIds([]);
                  markChatRead(`group:${g.id}`, g.lastMessage?.createdAt);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left hover:bg-muted transition-colors",
                  selected?.type === "group" && selected.id === g.id && "bg-muted"
                )}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-green-100 text-green-700">
                    <Users className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{g.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground truncate flex-1">
                      {g.lastMessage ? g.lastMessage.body : `${g.participantEmployeeIds?.length || 0} members`}
                    </p>
                    {hasUnreadMessage(`group:${g.id}`, g.lastMessage) && (
                      <span className="h-2 w-2 rounded-full bg-green-600 shrink-0" title="Unread message" />
                    )}
                  </div>
                </div>
              </button>
            ))}

            {filteredConversations.length > 0 && (
              <p className="px-2 py-1 mt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chats</p>
            )}
            {filteredConversations.map((c) => (
              <button
                key={c.employeeId}
                onClick={() => {
                  setSelected({ type: "employee", id: c.employeeId });
                  setRecipientIds([c.employeeId]);
                  markChatRead(`employee:${c.employeeId}`, c.lastMessage?.createdAt);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left hover:bg-muted transition-colors",
                  selected?.type === "employee" && selected.id === c.employeeId && "bg-muted"
                )}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback>{initials(c.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    {c.lastMessage && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {format(new Date(c.lastMessage.createdAt), "MMM d")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground truncate flex-1">
                      {c.lastMessage ? c.lastMessage.body : c.phone}
                    </p>
                    {hasUnreadMessage(`employee:${c.employeeId}`, c.lastMessage) && (
                      <span className="h-2 w-2 rounded-full bg-green-600 shrink-0" title="Unread message" />
                    )}
                  </div>
                </div>
              </button>
            ))}

            {!loadingConversations && !loadingGroups && filteredConversations.length === 0 && filteredGroups.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No chats yet</p>
            )}
          </div>
        </ScrollArea>
        <div
          role="separator"
          aria-label="Resize chat list"
          onMouseDown={() => setIsResizingSidebar(true)}
          className="absolute right-[-5px] top-0 z-10 h-full w-2 cursor-col-resize rounded-r-xl hover:bg-primary/30"
        />
      </div>
      )}

      {/* Main: thread */}
      <div className="flex-1 flex flex-col border rounded-xl bg-card shadow-sm overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            {isSidebarCollapsed && (
              <Button
                size="icon"
                variant="outline"
                title="Open chat list"
                onClick={() => setIsSidebarCollapsed(false)}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
            <MessageCircle className="h-12 w-12 opacity-30" />
            <p>Select a chat or group to view messages</p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b bg-muted/30 flex items-center gap-3">
              {isSidebarCollapsed && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  title="Open chat list"
                  onClick={() => setIsSidebarCollapsed(false)}
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
              )}
              <Avatar className="h-9 w-9">
                <AvatarFallback className={selected.type === "group" ? "bg-green-100 text-green-700" : ""}>
                  {selected.type === "group" ? <Users className="h-4 w-4" /> : initials(activeName || "")}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{activeName}</p>
                {!isAdmin && selected.type === "group" && <p className="text-xs text-muted-foreground">View only — ask an admin to reply</p>}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto h-8 w-8"
                title="Refresh conversation"
                onClick={refreshActiveChat}
                disabled={isRefreshingChat}
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshingChat && "animate-spin")} />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              {isLoadingThread ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : activeMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No messages yet</p>
              ) : (
                <div className="space-y-3">
                  {activeMessages.map((m) => (
                    <div key={m.id} className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "group relative max-w-[70%] rounded-2xl px-4 py-2 text-sm",
                          m.direction === "outbound" ? "bg-green-500 text-white" : "bg-muted"
                        )}
                        onDoubleClick={() => handleReplyToMessage(m)}
                      >
                        <button
                          type="button"
                          className="absolute -right-8 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Reply to this message"
                          onClick={() => handleReplyToMessage(m)}
                        >
                          <ReplyIcon className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin && m.direction === "outbound" && m.whatsappFromMe && !m.deletedAt && (
                          <button
                            type="button"
                            className="absolute -top-2 -right-2 hidden h-6 w-6 items-center justify-center rounded-full border bg-background text-destructive shadow-sm group-hover:flex"
                            title="Delete from WhatsApp"
                            onClick={() => handleDeleteMessage(m.id)}
                            disabled={deletingMessageId === m.id}
                          >
                            {deletingMessageId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </button>
                        )}
                        {selected.type === "group" && m.direction === "inbound" && (m.senderName || m.senderPhone) && (
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">
                            {m.senderName || m.senderPhone}
                          </p>
                        )}
                        <p className={cn("whitespace-pre-wrap break-words", m.deletedAt && "italic opacity-70")}>{m.body}</p>
                        <p className={cn("text-[10px] mt-1", m.direction === "outbound" ? "text-green-50" : "text-muted-foreground")}>
                          {format(new Date(m.createdAt), "MMM d, h:mm a")}
                          {m.status === "failed" && " · failed"}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {(isAdmin || selected?.type === "employee") && (
              <div className="relative p-4 border-t flex items-end gap-2">
                {replyingTo && (
                  <div className="absolute bottom-full left-4 right-4 flex items-center justify-between rounded-t-md border border-b-0 bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                    <span>Replying to a message</span>
                    <button type="button" className="font-medium hover:text-foreground" onClick={() => setReplyingTo(null)}>
                      Cancel
                    </button>
                  </div>
                )}
                {isAdmin && (
                <Dialog open={isAskAboutOpen} onOpenChange={setIsAskAboutOpen}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Ask about a project or task"
                      disabled={!selected}
                    >
                      <ListTodo className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Ask about a project or task</DialogTitle>
                      <DialogDescription>
                        Select the pending work item. A tagged question will be added to the message box for review.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={askTargetType === "project" ? "default" : "outline"}
                          onClick={() => setAskTargetType("project")}
                        >
                          Project
                        </Button>
                        <Button
                          type="button"
                          variant={askTargetType === "task" ? "default" : "outline"}
                          onClick={() => setAskTargetType("task")}
                        >
                          Task
                        </Button>
                      </div>
                      <Popover open={isProjectPickerOpen} onOpenChange={setIsProjectPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between font-normal"
                            disabled={loadingProjects}
                          >
                            <span className="truncate">
                              {loadingProjects
                                ? "Loading projects..."
                                : projects.find((project) => String(project.id) === askProjectId)?.title || "Select a project"}
                            </span>
                            <Search className="h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search projects..." />
                            <CommandList className="max-h-64">
                              <CommandEmpty>No project found.</CommandEmpty>
                              {projects.map((project) => (
                                <CommandItem
                                  key={project.id}
                                  value={`${project.title} ${project.projectCode || ""} ${project.status || ""}`}
                                  onSelect={() => {
                                    setAskProjectId(String(project.id));
                                    setAskTaskIds([]);
                                    setIsProjectPickerOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", askProjectId === String(project.id) ? "opacity-100" : "opacity-0")} />
                                  <span className="truncate">{project.title}{project.projectCode ? ` (${project.projectCode})` : ""} - {project.status}</span>
                                </CommandItem>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {askTargetType === "task" && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Select task(s)</p>
                          <Popover open={isTaskPickerOpen} onOpenChange={setIsTaskPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-between font-normal"
                                disabled={!askProjectId || loadingProjectTasks}
                              >
                                <span className="truncate">
                                  {!askProjectId
                                    ? "Select a project first"
                                    : loadingProjectTasks
                                    ? "Loading tasks..."
                                    : askTaskIds.length > 0
                                    ? `${askTaskIds.length} task(s) selected`
                                    : "Select task(s)"}
                                </span>
                                <Search className="h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search tasks..." />
                                <CommandList className="max-h-56">
                                  <CommandEmpty>{projectTasks.length ? "No task found." : "No active tasks in this project."}</CommandEmpty>
                                  {projectTasks.map((task) => {
                                    const taskId = String(task.id);
                                    const isTaskSelected = askTaskIds.includes(taskId);
                                    return (
                                      <CommandItem
                                        key={task.id}
                                        value={`${task.taskName} ${task.status || ""}`}
                                        onSelect={() => {
                                          setAskTaskIds((current) =>
                                            isTaskSelected ? current.filter((id) => id !== taskId) : [...current, taskId]
                                          );
                                        }}
                                      >
                                        <Checkbox checked={isTaskSelected} className="mr-2" tabIndex={-1} />
                                        <span className="min-w-0">
                                          <span className="block truncate font-medium">{task.taskName}</span>
                                          <span className="text-xs text-muted-foreground">{task.status}</span>
                                        </span>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {askTaskIds.length > 0 && (
                            <p className="text-xs text-muted-foreground">{askTaskIds.length} task(s) selected</p>
                          )}
                        </div>
                      )}
                      <Textarea
                        value={askQuestion}
                        onChange={(event) => setAskQuestion(event.target.value)}
                        placeholder="Ask a question about the delay..."
                        className="min-h-24"
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        onClick={handleAskAbout}
                        disabled={!askProjectId || !askQuestion.trim() || (askTargetType === "task" && askTaskIds.length === 0)}
                      >
                        Add to message
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                )}
                {selected.type === "employee" && recipientIds.length > 0 && (
                  <div className="absolute bottom-[76px] left-4 right-4 flex flex-wrap gap-1 rounded-md border bg-background p-2">
                    <span className="mr-1 text-xs text-muted-foreground self-center">To:</span>
                    {recipientIds.map((recipientId) => {
                      const recipient = conversations.find((conversation) => conversation.employeeId === recipientId);
                      return (
                        <button
                          key={recipientId}
                          type="button"
                          className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 hover:bg-green-100"
                          onClick={() => setRecipientIds((current) => current.filter((id) => id !== recipientId))}
                          title="Remove recipient"
                        >
                          {recipient?.name || "Recipient"} x
                        </button>
                      );
                    })}
                  </div>
                )}
                <Textarea
                  placeholder="Type your message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className="min-h-[44px] max-h-32 resize-none"
                />
                <Button
                  onClick={handleSend}
                  disabled={!messageInput.trim() || isSending}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}