import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  Search, 
  MoreVertical, 
  Paperclip, 
  Send,
  Plus,
  FileText,
  X,
  UserPlus,
  Check,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/components/Layout";
import { useToast } from "@/hooks/use-toast";
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";

type Attachment = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageUrl: string;
  replyId?: string;
};

type Reply = {
  id: string;
  content: string;
  createdBy: string;
  createdAt: string;
  creatorName: string;
  attachments?: Attachment[];
};

type DiscussionDetail = {
  id: string;
  title: string;
  content: string;
  createdBy: string;
  createdAt: string;
  creatorName: string;
  replies: Reply[];
  attachments: Attachment[];
  participants: { id: string; name: string }[];
};

export default function Discussion() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeDiscussionId, setActiveDiscussionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [replyInput, setReplyInput] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Mention state
  const [mentionSearch, setMentionSearch] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(-1);
  
  // New Discussion Form State
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: discussions = [], isLoading: isLoadingList } = useQuery<any[]>({
    queryKey: ["/api/discussions"],
  });

  const location = useLocation();
  const [autoOpenedFromParams, setAutoOpenedFromParams] = useState(false);

  const { data: activeDiscussion, isLoading: isLoadingDetail } = useQuery<DiscussionDetail>({
    queryKey: ["/api/discussions", activeDiscussionId],
    enabled: !!activeDiscussionId,
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const departments = useMemo(() => {
    return Array.from(new Set(employees.map(e => e.department).filter(Boolean)));
  }, [employees]);

  // Mutations
  const createDiscussionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/discussions", data);
      return res.json();
    },
    onMutate: async (newDiscussion) => {
      await queryClient.cancelQueries({ queryKey: ["/api/discussions"] });

      const previousDiscussions = queryClient.getQueryData(["/api/discussions"]) as any[] | undefined;

      // Create optimistic discussion
      const optimisticDiscussion = {
        id: `temp-${Date.now()}`,
        title: newDiscussion.title,
        content: newDiscussion.content,
        createdBy: user?.employeeId,
        createdAt: new Date().toISOString(),
        creatorName: user?.name || "You",
        replies: [],
        attachments: [],
        participants: newDiscussion.selectedParticipants || [],
      };

      queryClient.setQueryData(
        ["/api/discussions"],
        [optimisticDiscussion, ...(previousDiscussions || [])]
      );

      // Dispatch event for cross-page sync
      window.dispatchEvent(new CustomEvent('discussion.created', {
        detail: { discussion: optimisticDiscussion }
      }));

      return { previousDiscussions, optimisticDiscussionId: optimisticDiscussion.id };
    },
    onSuccess: (data, variables, context) => {
      // Replace temp ID with real discussion
      const previousDiscussions = context?.previousDiscussions as any[] | undefined;
      if (context?.optimisticDiscussionId && previousDiscussions) {
        const updated = (previousDiscussions || []).map((d) =>
          d.id === context.optimisticDiscussionId ? data : d
        );
        queryClient.setQueryData(["/api/discussions"], updated);
      }

      setIsCreateDialogOpen(false);
      setActiveDiscussionId(data.id);
      resetForm();
      toast({ title: "Discussion created!", description: "Your discussion is now live" });
    },
    onError: (error, variables, context) => {
      if (context?.previousDiscussions) {
        queryClient.setQueryData(["/api/discussions"], context.previousDiscussions);
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create discussion. Please try again."
      });
    },
  });

  const postReplyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/discussions/${activeDiscussionId}/replies`, data);
      return res.json();
    },
    onMutate: async (newReply) => {
      await queryClient.cancelQueries({ queryKey: ["/api/discussions", activeDiscussionId] });

      const previousDiscussion = queryClient.getQueryData(["/api/discussions", activeDiscussionId]) as DiscussionDetail | undefined;

      const optimisticReply: Reply = {
        id: `temp-${Date.now()}`,
        content: newReply.content,
        createdBy: user?.employeeId || "",
        createdAt: new Date().toISOString(),
        creatorName: user?.name || "You",
        attachments: newReply.attachments,
      };

      if (previousDiscussion) {
        queryClient.setQueryData<DiscussionDetail>(["/api/discussions", activeDiscussionId], (old) => {
          if (!old) return old;
          return {
            ...old,
            replies: [...(old.replies || []), optimisticReply],
            attachments: old.attachments,
          };
        });
      }

      window.dispatchEvent(new CustomEvent('discussion.messageAdded', {
        detail: { discussionId: activeDiscussionId, reply: optimisticReply }
      }));

      return {
        previousDiscussion,
        optimisticReplyId: optimisticReply.id,
        replyContent: newReply.content,
        replyAttachments: newReply.attachments,
      };
    },
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData<DiscussionDetail>(["/api/discussions", activeDiscussionId], (old) => {
        if (!old) return old;
        const updatedReplies = (old.replies || []).map((r) =>
          r.id === context?.optimisticReplyId ? data : r
        );
        return {
          ...old,
          replies: updatedReplies,
        };
      });

      queryClient.setQueryData(["/api/discussions"], (old: any[] | undefined) =>
        old?.map((disc) =>
          disc.id === activeDiscussionId
            ? { ...disc, lastReplyAt: new Date().toISOString(), lastRepliedBy: user?.name }
            : disc
        ) || []
      );

      toast({ title: "Message sent!", description: "Your reply has been posted" });
    },
    onError: (error, variables, context) => {
      if (context?.previousDiscussion) {
        queryClient.setQueryData(["/api/discussions", activeDiscussionId], context.previousDiscussion);
      }
      if (context?.replyContent) {
        setReplyInput(context.replyContent);
      }
      if (context?.replyAttachments) {
        setPendingAttachments(context.replyAttachments);
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message. Please try again."
      });
    },
    onSettled: () => {
      if (activeDiscussionId) {
        queryClient.invalidateQueries({ queryKey: ["/api/discussions", activeDiscussionId] });
      }
    },
  });

  // File Upload Logic
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isReply = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/discussions/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setPendingAttachments(prev => [...prev, ...data]);
      toast({ title: "Files uploaded successfully" });
    } catch (err) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (replyFileInputRef.current) replyFileInputRef.current.value = "";
    }
  };

  const resetForm = () => {
    setNewTitle("");
    setNewContent("");
    setSelectedParticipants([]);
    setPendingAttachments([]);
  };

  const handlePostReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyInput.trim() && pendingAttachments.length === 0) return;

    // Clear input immediately for instant feedback (before API call)
    const messageContent = replyInput;
    const attachments = pendingAttachments;
    setReplyInput("");
    setPendingAttachments([]);

    // Send message in background
    postReplyMutation.mutate({
      content: messageContent,
      attachments: attachments,
    });
  };

  const handleReplyChange = (val: string) => {
    setReplyInput(val);
    
    // Simple @mention detection
    const lastWord = val.split(" ").pop() || "";
    if (lastWord.startsWith("@")) {
      setMentionSearch(lastWord.substring(1).toLowerCase());
      setShowMentions(true);
      setMentionIndex(val.lastIndexOf("@"));
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (name: string) => {
    const before = replyInput.substring(0, mentionIndex);
    const after = replyInput.substring(mentionIndex + mentionSearch.length + 1);
    setReplyInput(`${before}@${name} ${after}`);
    setShowMentions(false);
  };

  const mentionSuggestions = useMemo(() => {
    if (!activeDiscussion) return [];
    return activeDiscussion.participants.filter(p => 
      p.name.toLowerCase().includes(mentionSearch)
    );
  }, [activeDiscussion, mentionSearch]);

  const handleCreateDiscussion = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    createDiscussionMutation.mutate({
      title: newTitle,
      content: newContent,
      participantIds: selectedParticipants,
      attachments: pendingAttachments,
    });
  };

  const filteredDiscussions = useMemo(() => {
    return discussions.filter(d => 
      d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.creatorName?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [discussions, searchTerm]);

  // Set first discussion as active if none selected
  useMemo(() => {
    if (!activeDiscussionId && discussions.length > 0) {
      setActiveDiscussionId(discussions[0].id);
    }
  }, [discussions, activeDiscussionId]);

  // Auto-open discussion when query params are present: projectTitle, keyStepTitle, taskName, subtaskName
  useEffect(() => {
    if (autoOpenedFromParams) return;
    const params = new URLSearchParams(location.search);
    const projectTitle = params.get("projectTitle") || "";
    const keyStepTitle = params.get("keyStepTitle") || "";
    const taskName = params.get("taskName") || "";
    const subtaskName = params.get("subtaskName") || "";

    if (!projectTitle && !keyStepTitle && !taskName && !subtaskName) return;

    // Construct canonical discussion title used to find or create a thread
    const parts: string[] = [];
    if (projectTitle) parts.push(projectTitle);
    if (keyStepTitle) parts.push(keyStepTitle);
    if (taskName) parts.push(taskName);
    if (subtaskName) parts.push(subtaskName);
    const desiredTitle = parts.join(" / ");

    // Wait until discussions list is loaded
    if (isLoadingList) return;

    // Try to find existing discussion
    const existing = discussions.find(d => String(d.title).trim() === String(desiredTitle).trim());
    if (existing) {
      setActiveDiscussionId(existing.id);
      setAutoOpenedFromParams(true);
      return;
    }

    // Not found — create new discussion automatically with a starter message linking the context
    const starterContent = `Discussion for ${parts.join(" > ")}`;
    createDiscussionMutation.mutate({
      title: desiredTitle,
      content: starterContent,
      participantIds: [],
      attachments: [],
    });
    setAutoOpenedFromParams(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, discussions, isLoadingList]);

  // Auto-scroll to latest message when new reply is added
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (messagesEndRef.current && activeDiscussion?.replies) {
      // Use requestAnimationFrame for fastest possible scroll
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      });
    }
  }, [activeDiscussion?.replies]);

  // Listen for discussion updates from other pages
  useEffect(() => {
    const handleDiscussionCreated = (ev: any) => {
      const discussion = ev?.detail?.discussion;
      if (!discussion) return;

      // Update discussions list
      queryClient.setQueryData(["/api/discussions"], (old: any[] | undefined) =>
        [discussion, ...(old || [])]
      );
    };

    const handleMessageAdded = (ev: any) => {
      const { discussionId, reply } = ev?.detail || {};
      if (!discussionId || !reply || discussionId !== activeDiscussionId) return;

      // Message is already added optimistically in the mutation's onMutate
      // No need to invalidate or fetch - just let the component re-render with new data
      // The component will automatically update via React Query's setQueryData
    };

    window.addEventListener('discussion.created', handleDiscussionCreated as EventListener);
    window.addEventListener('discussion.messageAdded', handleMessageAdded as EventListener);

    return () => {
      window.removeEventListener('discussion.created', handleDiscussionCreated as EventListener);
      window.removeEventListener('discussion.messageAdded', handleMessageAdded as EventListener);
    };
  }, [activeDiscussionId]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 overflow-hidden">
      {/* Sidebar: Discussion List */}
      <div className="w-80 flex flex-col border rounded-xl bg-card shadow-sm overflow-hidden shrink-0">
        <div className="p-4 border-b space-y-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Discussions</h2>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="default" className="h-8 w-8 rounded-full">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>New Discussion</DialogTitle>
                  <DialogDescription>
                    Start a new conversation with your team or department.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Topic Title</label>
                    <Input 
                      placeholder="What is this discussion about?" 
                      value={newTitle} 
                      onChange={e => setNewTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Participants (Users or Teams)</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {selectedParticipants.map(id => {
                        const emp = employees.find(e => e.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="pl-1 pr-1 py-0.5 flex items-center gap-1">
                            <Avatar className="h-4 w-4">
                              <AvatarFallback className="text-[8px]">{emp?.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            {emp?.name}
                            <X 
                              className="h-3 w-3 cursor-pointer hover:text-destructive" 
                              onClick={() => setSelectedParticipants(prev => prev.filter(pId => pId !== id))}
                            />
                          </Badge>
                        );
                      })}
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground bg-muted/20">
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add team members or entire departments...
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-80 shadow-2xl" align="start">
                        <Command>
                          <CommandInput placeholder="Search people or teams..." />
                          <CommandList>
                            <CommandEmpty>No results found.</CommandEmpty>
                            <CommandGroup heading="Departments (Teams)">
                              {departments.map(dept => (
                                <CommandItem
                                  key={dept}
                                  onSelect={() => {
                                    const deptMembers = employees.filter(e => e.department === dept).map(e => e.id);
                                    setSelectedParticipants(prev => {
                                      const next = [...prev];
                                      deptMembers.forEach(id => {
                                        if (!next.includes(id)) next.push(id);
                                      });
                                      return next;
                                    });
                                    toast({ title: `Added all members from ${dept}` });
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center">
                                    <UserPlus className="h-3 w-3 text-primary" />
                                  </div>
                                  <span className="font-semibold">{dept} Team</span>
                                  <Badge variant="outline" className="ml-auto text-[10px]">{employees.filter(e => e.department === dept).length} members</Badge>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            <CommandGroup heading="Individual Members">
                              {employees.map(emp => (
                                <CommandItem
                                  key={emp.id}
                                  onSelect={() => {
                                    if (!selectedParticipants.includes(emp.id)) {
                                      setSelectedParticipants(prev => [...prev, emp.id]);
                                    } else {
                                      setSelectedParticipants(prev => prev.filter(id => id !== emp.id));
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-2 flex-1">
                                    <Avatar className="h-6 w-6">
                                      <AvatarFallback>{emp.name?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col">
                                      <span className="text-sm">{emp.name}</span>
                                      <span className="text-[10px] text-muted-foreground">{emp.department}</span>
                                    </div>
                                    {selectedParticipants.includes(emp.id) && <Check className="h-4 w-4 ml-auto text-primary" />}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Initiating Message</label>
                    <Textarea 
                      placeholder="Start the conversation..." 
                      className="min-h-[120px]" 
                      value={newContent}
                      onChange={e => setNewContent(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Attachments</label>
                    <div className="flex flex-wrap gap-2">
                      {pendingAttachments.map((att, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded-md text-xs relative group">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="max-w-[150px] truncate">{att.fileName}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-4 w-4 absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setPendingAttachments(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-dashed"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4 mr-2" />}
                        Attach Files
                      </Button>
                      <input 
                        type="file" 
                        multiple 
                        hidden 
                        ref={fileInputRef} 
                        onChange={(e) => handleFileUpload(e)}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => { resetForm(); setIsCreateDialogOpen(false); }}>Cancel</Button>
                  <Button 
                    onClick={handleCreateDiscussion} 
                    disabled={createDiscussionMutation.isPending || !newTitle.trim() || !newContent.trim()}
                  >
                    {createDiscussionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Topic
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Filter topics..." 
              className="pl-9 h-10 bg-background border-none shadow-inner" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {isLoadingList ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : filteredDiscussions.length > 0 ? (
            <div className="divide-y divide-border/50">
              {filteredDiscussions.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setActiveDiscussionId(d.id)}
                  className={`w-full p-4 text-left transition-all hover:bg-muted/50 group flex flex-col gap-2 ${
                    activeDiscussionId === d.id ? "bg-primary/5 border-r-4 border-r-primary" : ""
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">{d.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{d.createdAt ? format(new Date(d.createdAt), "MMM d") : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[8px] uppercase">{d.creatorName?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground truncate font-medium">{d.creatorName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 italic">
                    {d.content}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm italic">
              No discussions found
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col border rounded-xl bg-card shadow-lg overflow-hidden relative">
        {!activeDiscussionId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 bg-muted/5">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Plus className="h-8 w-8 opacity-20" />
            </div>
            <h3 className="text-lg font-medium">Select a discussion</h3>
            <p className="text-sm">Choose a topic from the sidebar or start a new one.</p>
          </div>
        ) : isLoadingDetail ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : activeDiscussion ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-muted/10">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{activeDiscussion.title}</h3>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">Topic</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Started by <span className="font-semibold text-foreground">{activeDiscussion.creatorName}</span></span>
                  <span>•</span>
                  <span>{activeDiscussion.participants?.length || 0} participants</span>
                </div>
              </div>
              <div className="flex -space-x-2 mr-4">
                {activeDiscussion.participants?.slice(0, 3).map((p, idx) => (
                  <Avatar key={idx} className="h-8 w-8 border-2 border-background ring-2 ring-transparent hover:ring-primary transition-all cursor-pointer">
                    <AvatarFallback className="text-xs">{p.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                ))}
                {(activeDiscussion.participants?.length || 0) > 3 && (
                  <div className="h-8 w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold z-10">
                    +{(activeDiscussion.participants?.length || 0) - 3}
                  </div>
                )}
              </div>
            </div>

            {/* Conversation Area */}
            <ScrollArea className="flex-1 p-6 bg-gradient-to-b from-transparent to-muted/5">
              <div className="max-w-4xl mx-auto space-y-8">
                {/* Main Topic Post */}
                <div className={cn("flex gap-4", activeDiscussion.createdBy === user?.employeeId ? "flex-row-reverse" : "flex-row")}>
                  <Avatar className={cn("h-10 w-10 shrink-0 shadow-sm border-2", activeDiscussion.createdBy === user?.employeeId ? "border-primary" : "border-primary/20")}>
                    <AvatarFallback className={cn("font-bold", activeDiscussion.createdBy === user?.employeeId ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
                      {activeDiscussion.creatorName?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn("flex-1 flex flex-col max-w-[85%] space-y-2", activeDiscussion.createdBy === user?.employeeId ? "items-end text-right" : "items-start")}>
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-sm tracking-tight">{activeDiscussion.creatorName}</span>
                      <span className="text-[10px] text-muted-foreground uppercase font-medium">
                        {activeDiscussion.createdAt && format(new Date(activeDiscussion.createdAt), "MMM d, h:mm a")}
                      </span>
                    </div>
                    <div className={cn(
                      "p-4 rounded-2xl shadow-sm relative group overflow-visible text-sm leading-relaxed whitespace-pre-wrap",
                      activeDiscussion.createdBy === user?.employeeId 
                        ? "bg-primary text-primary-foreground rounded-tr-none px-5" 
                        : "bg-card border rounded-tl-none"
                    )}>
                      {activeDiscussion.content}
                      
                      {activeDiscussion.attachments && activeDiscussion.attachments.length > 0 && (
                        <div className={cn("mt-4 pt-4 border-t flex flex-wrap gap-2", activeDiscussion.createdBy === user?.employeeId ? "border-primary-foreground/20" : "border-border/50")}>
                          {activeDiscussion.attachments.filter(a => !a.replyId).map((att, idx) => (
                            <a 
                              key={idx} 
                              href={att.storageUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className={cn(
                                "flex items-center gap-2 p-2 transition-colors rounded-lg border text-xs",
                                activeDiscussion.createdBy === user?.employeeId 
                                  ? "bg-primary-foreground/10 hover:bg-primary-foreground/20 border-primary-foreground/20 text-primary-foreground"
                                  : "bg-muted/30 hover:bg-muted border-border/50"
                              )}
                            >
                              <FileText className="h-4 w-4" />
                              <span className="font-medium underline-offset-4 hover:underline">{att.fileName}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Divider for Replies */}
                <div className="relative py-2">
                  <div className="absolute inset-x-0 top-1/2 h-[1px] bg-border" />
                  <span className="relative bg-background px-3 text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground ml-14">
                    {activeDiscussion.replies?.length || 0} Replies
                  </span>
                </div>

                {/* Replies Thread */}
                {activeDiscussion.replies?.map((reply) => {
                  const isOwn = reply.createdBy === user?.employeeId;
                  return (
                    <div key={reply.id} className={cn("flex gap-4 group", isOwn ? "flex-row-reverse" : "flex-row")}>
                      <Avatar className={cn("h-8 w-8 shrink-0 shadow-sm ring-1", isOwn ? "ring-primary/20" : "ring-border")}>
                        <AvatarFallback className={cn("text-xs font-semibold", isOwn ? "bg-primary/10 text-primary" : "bg-muted")}>
                          {reply.creatorName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn("flex-1 flex flex-col max-w-[80%] space-y-2", isOwn ? "items-end" : "items-start")}>
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-sm">{reply.creatorName}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {reply.createdAt && format(new Date(reply.createdAt), "h:mm a")}
                          </span>
                        </div>
                        <div className={cn(
                          "px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap relative",
                          isOwn 
                            ? "bg-primary text-primary-foreground rounded-tr-none px-5" 
                            : "bg-muted rounded-tl-none"
                        )}>
                          {reply.content}
                          
                          {/* Attachments for this reply */}
                          {(() => {
                            const replyAttachments = [
                              ...(reply.attachments || []),
                              ...(activeDiscussion.attachments?.filter(a => a.replyId === reply.id) || []),
                            ];
                            return replyAttachments.length > 0 ? (
                              <div className={cn("mt-3 pt-3 border-t flex flex-wrap gap-2", isOwn ? "border-primary-foreground/20" : "border-background/20")}>
                                {replyAttachments.map((att, idx) => (
                                  <a 
                                    key={idx} 
                                    href={att.storageUrl} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className={cn(
                                      "flex items-center gap-2 p-1.5 transition-colors rounded-md text-[10px]",
                                      isOwn ? "bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground" : "bg-background/50 hover:bg-background"
                                    )}
                                  >
                                    <FileText className="h-3 w-3" />
                                    <span className="truncate max-w-[120px]">{att.fileName}</span>
                                  </a>
                                ))}
                              </div>
                            ) : null;
                          })() }
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Scroll anchor - ensures latest message is visible */}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Overlay for Replies */}
            <div className="p-4 bg-background border-t shadow-2xl relative z-20">
              <div className="max-w-4xl mx-auto space-y-3">
                {/* Pending Attachments List for current reply */}
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 p-2 bg-muted/30 rounded-lg">
                    {pendingAttachments.map((att, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1 py-1">
                        <FileText className="h-3 w-3" />
                        <span className="max-w-[100px] truncate">{att.fileName}</span>
                        <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => setPendingAttachments(prev => prev.filter((_, i) => i !== idx))} />
                      </Badge>
                    ))}
                  </div>
                )}
                <form className="flex items-end gap-3" onSubmit={handlePostReply}>
                  <div className="flex-1 relative">
                    {showMentions && mentionSuggestions.length > 0 && (
                      <div className="absolute bottom-full left-0 mb-2 w-64 bg-card border rounded-lg shadow-xl z-50 overflow-hidden">
                        <div className="p-2 border-b bg-muted/50 text-[10px] font-bold uppercase tracking-wider">Mention Teammate</div>
                        <ScrollArea className="max-h-40">
                          {mentionSuggestions.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full p-2 text-left text-xs hover:bg-primary/10 flex items-center gap-2 transition-colors border-b last:border-0 border-border/50"
                              onClick={() => insertMention(p.name)}
                            >
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="text-[8px]">{p.name?.charAt(0)}</AvatarFallback>
                              </Avatar>
                              {p.name}
                            </button>
                          ))}
                        </ScrollArea>
                      </div>
                    )}
                    <Textarea
                      placeholder="Type a reply... use @ to mention teammates"
                      value={replyInput}
                      onChange={e => handleReplyChange(e.target.value)}
                      className="min-h-12 max-h-48 resize-none bg-muted/20 focus-visible:ring-1 pr-12 pt-3"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handlePostReply(e);
                        }
                      }}
                    />
                    <div className="absolute right-2 bottom-2 flex gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        type="button" 
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => replyFileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                      </Button>
                      <input 
                        type="file" 
                        multiple 
                        hidden 
                        ref={replyFileInputRef} 
                        onChange={(e) => handleFileUpload(e, true)}
                      />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="h-10 w-10 shrink-0 shadow-lg"
                    disabled={postReplyMutation.isPending || (!replyInput.trim() && pendingAttachments.length === 0)}
                  >
                    {postReplyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
                <p className="text-[10px] text-muted-foreground text-center">
                  Press <strong>Enter</strong> to send, <strong>Shift + Enter</strong> for new line.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}