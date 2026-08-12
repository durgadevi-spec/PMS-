import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Ticket,
  Plus,
  Search,
  Filter,
  MessageSquare,
  History,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Paperclip,
  Send,
  MoreVertical,
  ChevronRight,
  Download,
  ExternalLink,
  ArrowLeft,
  User as UserIcon,
  Tag,
  Building2,
  Calendar,
  Trash2,
  Pencil,
  Mic,
  Play,
  Pause,
  Copy,
  Check,
  ChevronsUpDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  X
} from "lucide-react";

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
import { cn } from "@/lib/utils";

import { VoiceRecorder } from "@/components/VoiceRecorder";

import { useAuth } from "@/components/Layout";
import { apiFetch } from "@/lib/apiClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

// --- Types ---
interface TicketData {
  id: string;
  ticketCode: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  department: string;
  projectId?: string;
  projectName?: string;
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedToName?: string;
  companyName?: string;
  participants?: string[];
  createdAt: string;
  updatedAt: string;
  comments?: CommentData[];
  attachments?: AttachmentData[];
  taskId?: string | null;
  closeReason?: string | null;
  closeRequestedBy?: string | null;
  completedLines?: number[];
}

interface CommentData {
  id: string;
  content: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

interface AttachmentData {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageUrl: string;
  createdAt: string;
}

// --- Constants ---
const CATEGORIES = ["Technical", "HR", "Facility", "Hardware", "Software", "Accounts", "Other"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-500 hover:bg-red-600 text-white border-none",
  High: "bg-orange-500 hover:bg-orange-600 text-white border-none",
  Medium: "bg-yellow-500 hover:bg-yellow-600 text-white border-none",
  Low: "bg-green-500 hover:bg-green-600 text-white border-none",
};

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-blue-100 text-blue-700 border-blue-200",
  "In Progress": "bg-purple-100 text-purple-700 border-purple-200",
  Resolved: "bg-green-100 text-green-700 border-green-200",
  Closed: "bg-gray-100 text-gray-700 border-gray-200",
  "Pending Closure": "bg-amber-100 text-amber-700 border-amber-300",
};

// --- Custom Searchable Select ---
function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  emptyMessage = "No options found.",
  disabled = false
}: {
  options: { value: string, label: string }[],
  value: string,
  onValueChange: (v: string) => void,
  placeholder?: string,
  emptyMessage?: string,
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {value
            ? options.find((option) => option.value === value)?.label || value
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList className="max-h-[200px] overflow-y-auto">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value === value ? "" : option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MultiSearchableSelect({
  options,
  selectedValues,
  onToggle,
  placeholder = "Select members...",
  disabled = false
}: {
  options: { value: string, label: string }[],
  selectedValues: string[],
  onToggle: (v: string) => void,
  placeholder?: string,
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {selectedValues.length > 0
            ? `${selectedValues.length} selected`
            : placeholder}
          <Plus className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search members..." />
          <CommandList className="max-h-[200px] overflow-y-auto">
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onToggle(option.value);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedValues.includes(option.value) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function TicketsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("my");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN";

  // Queries
  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<TicketData[]>({
    queryKey: ["/api/tickets"],
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "raise") {
      setActiveTab("raise");
    } else if (tab === "manage") {
      setActiveTab("manage");
    }
  }, [isAdmin]);

  if (selectedTicketId) {
    return <TicketDetailView id={selectedTicketId} onBack={() => setSelectedTicketId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ticket Management</h1>
          <p className="text-muted-foreground">Raise, track, and manage support tickets.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => window.open("/api/tickets/export", "_blank")}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          )}
          <Button onClick={() => setActiveTab("raise")}>
            <Plus className="mr-2 h-4 w-4" /> Raise Ticket
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-background/50 backdrop-blur-sm border p-1 shadow-sm">
          <TabsTrigger value="my" className="px-6">My Tickets</TabsTrigger>
          <TabsTrigger value="manage" className="px-6">
            {isAdmin ? "Manage Tickets" : "Assigned Tickets"}
          </TabsTrigger>
          <TabsTrigger value="closed" className="px-6">Closed Tickets</TabsTrigger>
          <TabsTrigger value="raise" className="px-6 text-primary font-semibold">
            <Plus className="mr-1 h-3.5 w-3.5" /> Raise Ticket
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="space-y-4">
          <TicketsTable
            tickets={tickets.filter(t =>
              t.status !== "Closed" &&
              (t.createdBy === user?.employeeId ||
                t.assignedTo === user?.employeeId ||
                (Array.isArray(t.participants) && t.participants.includes(user?.employeeId)))
            )}
            isLoading={ticketsLoading}
            onView={setSelectedTicketId}
            projects={projects}
            employees={employees}
          />
        </TabsContent>

        <TabsContent value="manage" className="space-y-4">
          <TicketsTable
            tickets={(isAdmin ? tickets : tickets.filter(t => t.assignedTo === user?.employeeId))
              .filter(t => t.status !== "Closed")}
            isLoading={ticketsLoading}
            onView={setSelectedTicketId}
            isAdminView={isAdmin}
            employees={employees}
            projects={projects}
          />
        </TabsContent>

        {/* Closed Tickets: once a ticket's status becomes "Closed", it moves
            out of My Tickets / Manage Tickets and lives here instead — same
            visibility rules as before (admins see every closed ticket,
            everyone else sees closed tickets they created, are assigned to,
            or participate in). */}
        <TabsContent value="closed" className="space-y-4">
          <TicketsTable
            tickets={tickets.filter(t =>
              t.status === "Closed" &&
              (isAdmin ||
                t.createdBy === user?.employeeId ||
                t.assignedTo === user?.employeeId ||
                (Array.isArray(t.participants) && t.participants.includes(user?.employeeId)))
            )}
            isLoading={ticketsLoading}
            onView={setSelectedTicketId}
            isAdminView={isAdmin}
            employees={employees}
            projects={projects}
          />
        </TabsContent>

        <TabsContent value="raise">
          <RaiseTicketForm
            projects={projects}
            employees={employees}
            onSuccess={() => setActiveTab("my")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Components ---

function RaiseTicketForm({
  projects,
  employees = [],
  onSuccess,
  initialData,
  isClone = false
}: {
  projects: any[],
  employees?: any[],
  onSuccess: () => void,
  initialData?: TicketData,
  isClone?: boolean
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useTextarea, setUseTextarea] = useState(false);
  const [formData, setFormData] = useState({
    title: initialData?.title || "",
    description: initialData?.description || "",
    category: initialData?.category || "Other",
    priority: initialData?.priority || "Medium",
    department: initialData?.department || "",
    projectId: initialData?.projectId || "",
    manualProject: (initialData as any)?.manualProject || "",
    companyName: initialData?.companyName || "",
    participants: initialData?.participants || [],
    assignedTo: initialData?.assignedTo || "",
    // Cloning makes a brand new ticket, so it shouldn't inherit which lines
    // were already ticked off on the original one.
    completedLines: (isClone ? [] : initialData?.completedLines) || [] as number[],
  });

  const filteredAndSortedProjects = useMemo(() => {
    if (!projects || projects.length === 0) return [];

    const normalizeDept = (d: string) => {
      if (!d) return "";
      // Collapse repeated whitespace too, not just leading/trailing, so
      // "IT  Support" and "IT Support" are treated as the same department.
      let norm = d.toLowerCase().trim().replace(/\s+/g, " ");
      if (norm.includes("software")) return "software";
      if (norm.includes("hardware") || norm.includes("technician")) return "hardware";
      return norm;
    };

    // Projects may store their department(s) as `departments` (array) OR
    // `department` (either an array or a single string, depending on how
    // the project was created). Normalize to an array here so `.some()`
    // never throws / silently drops a project just because of its shape.
    const getProjectDepts = (p: any): string[] => {
      const raw = p.departments ?? p.department;
      if (!raw) return [];
      return Array.isArray(raw) ? raw : [raw];
    };

    // If a Target Department has been picked on the form, only show projects
    // that belong to that department. This takes priority over the default
    // user-based visibility/sorting below, but doesn't remove any of it.
    if (formData.department) {
      const targetDept = normalizeDept(formData.department);
      const deptProjects = projects.filter((p: any) =>
        getProjectDepts(p).some((d: string) => normalizeDept(d) === targetDept)
      );
      return [...deptProjects].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }

    if (!user) return projects;

    const isAdmin = user.role?.toUpperCase() === 'ADMIN';
    // Admin (SAM) sees ALL projects sorted alphabetically
    if (isAdmin) return [...projects].sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    const userDept = normalizeDept(user.department || "");
    const empId = user.employeeId;

    const isDeptProject = (p: any) =>
      userDept && getProjectDepts(p).some((d: string) => normalizeDept(d) === userDept);

    const isAssignedProject = (p: any) =>
      empId && (
        (p.team && p.team.includes(empId)) ||
        (p.taskAssignees && p.taskAssignees.includes(empId)) ||
        (p.createdByEmployeeId === empId)
      );

    // Sort: department projects first, then assigned, then alphabetical rest
    return [...projects].sort((a, b) => {
      const aDept = isDeptProject(a) ? 2 : isAssignedProject(a) ? 1 : 0;
      const bDept = isDeptProject(b) ? 2 : isAssignedProject(b) ? 1 : 0;
      if (aDept !== bDept) return bDept - aDept;
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [projects, user, formData.department]);


  const { data: departments = [] } = useQuery<string[]>({
    queryKey: ["/api/departments"],
  });

  // Filter employees based on selected department
  const filteredEmployees = useMemo(() => {
    if (!formData.department) return employees;
    const norm = (d: string) => (d || "").toLowerCase().trim().replace(/\s+/g, " ");
    const targetDept = norm(formData.department);
    return employees.filter(e => norm(e.department) === targetDept);
  }, [employees, formData.department]);

  const [files, setFiles] = useState<File[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscription, setInterimTranscription] = useState("");
  const descriptionRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusLineIndex, setFocusLineIndex] = useState<number | null>(null);

  // Handle transcription — dictated text is appended onto the last checklist
  // item (so a continuous sentence keeps building on one item; press Enter
  // manually, or wait for the next dictation pause, to start a new one).
  const handleTranscription = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      setFormData(prev => {
        const lines = prev.description === "" ? [""] : prev.description.split("\n");
        const lastIndex = lines.length - 1;
        const currentLast = lines[lastIndex].trim();
        lines[lastIndex] = currentLast ? `${currentLast} ${text}.` : `${text}.`;
        return { ...prev, description: lines.join("\n") };
      });
      setInterimTranscription("");
    } else {
      setInterimTranscription(text);
    }

    // Auto-scroll the checklist into view as new text comes in
    setTimeout(() => {
      if (descriptionRef.current) {
        descriptionRef.current.scrollTop = descriptionRef.current.scrollHeight;
      }
    }, 10);
  }, []);

  // Google Keep style checklist editing: description is stored as one item
  // per line (same "\n"-joined text + completedLines index array the rest of
  // the app already uses), but the editor below lets each line be typed,
  // checked, added, and removed like a real checklist instead of free text.
  const descLines = formData.description === "" ? [""] : formData.description.split("\n");

  useEffect(() => {
    if (focusLineIndex !== null) {
      itemRefs.current[focusLineIndex]?.focus();
      setFocusLineIndex(null);
    }
  }, [focusLineIndex]);

  const updateLineText = (index: number, text: string) => {
    setFormData(prev => {
      const lines = prev.description === "" ? [""] : prev.description.split("\n");
      lines[index] = text;
      return { ...prev, description: lines.join("\n") };
    });
  };

  // Enter — split into a brand new checkbox item right after this one
  const insertLineAfter = (index: number) => {
    setFormData(prev => {
      const lines = prev.description === "" ? [""] : prev.description.split("\n");
      lines.splice(index + 1, 0, "");
      const completed = Array.isArray(prev.completedLines) ? prev.completedLines : [];
      const shifted = completed.map((i: number) => (i > index ? i + 1 : i));
      return { ...prev, description: lines.join("\n"), completedLines: shifted };
    });
    setFocusLineIndex(index + 1);
  };

  // Backspace on an empty item, or the X button — remove that checkbox item
  const removeLine = (index: number) => {
    setFormData(prev => {
      const lines = prev.description === "" ? [""] : prev.description.split("\n");
      if (lines.length <= 1) {
        return { ...prev, description: "", completedLines: [] };
      }
      lines.splice(index, 1);
      const completed = Array.isArray(prev.completedLines) ? prev.completedLines : [];
      const shifted = completed
        .filter((i: number) => i !== index)
        .map((i: number) => (i > index ? i - 1 : i));
      return { ...prev, description: lines.join("\n"), completedLines: shifted };
    });
    setFocusLineIndex(Math.max(0, index - 1));
  };

  const addTrailingItem = () => {
    const newIndex = descLines.length;
    setFormData(prev => {
      const lines = prev.description === "" ? [""] : prev.description.split("\n");
      lines.push("");
      return { ...prev, description: lines.join("\n") };
    });
    setFocusLineIndex(newIndex);
  };

  // Toggle a checklist line while composing/editing the description, Google
  // Keep style. Blank-line indices are never toggled (they're skipped in the UI).
  const toggleFormLine = (index: number) => {
    setFormData(prev => {
      const current = Array.isArray(prev.completedLines) ? prev.completedLines : [];
      const next = current.includes(index)
        ? current.filter((i: number) => i !== index)
        : [...current, index];
      return { ...prev, completedLines: next };
    });
  };

  const raiseMutation = useMutation({
    mutationFn: async (data: any) => {
      // First upload files and voice note if any
      let attachments = [];
      if (files.length > 0 || audioBlob) {
        const formDataFiles = new FormData();
        files.forEach(file => formDataFiles.append("files", file));

        if (audioBlob) {
          const voiceFile = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: "audio/webm" });
          formDataFiles.append("files", voiceFile);
        }

        const uploadRes = await apiFetch("/api/site-reports/upload", { // Reuse existing upload endpoint
          method: "POST",
          body: formDataFiles,
        });
        if (uploadRes.ok) {
          attachments = await uploadRes.json();
        }
      }

      const url = (initialData?.id && !isClone) ? `/api/tickets/${initialData.id}` : "/api/tickets";
      const method = (initialData?.id && !isClone) ? "PATCH" : "POST";

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, attachments }),
      });
      if (!res.ok) throw new Error("Failed to process ticket");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      if (initialData?.id && !isClone) {
        queryClient.invalidateQueries({ queryKey: [`/api/tickets/${initialData.id}`] });
      }
      toast({
        title: (initialData?.id && !isClone) ? "Ticket Updated" : "Ticket Raised",
        description: (initialData?.id && !isClone) ? "Your changes have been saved." : "Your ticket has been submitted successfully."
      });
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => setIsSubmitting(false),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.assignedTo) {
      toast({ title: "Required Field", description: "Please assign an agent to this ticket.", variant: "destructive" });
      return;
    }
    if (!formData.participants || formData.participants.length === 0) {
      toast({ title: "Required Field", description: "Please add at least one participant.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    raiseMutation.mutate(formData);
  };

  return (
    <Card className="max-w-3xl mx-auto border-t-4 border-t-primary shadow-lg glassmorphism">
      <CardHeader>
        <CardTitle>Create New Support Ticket</CardTitle>
        <CardDescription>Fill out the form below to raise a new support request.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="title">Ticket Title</Label>
              <Input
                id="title"
                placeholder="Brief summary of the issue"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="transition-all focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                placeholder="Client/Company name"
                value={formData.companyName}
                onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                className="transition-all focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={formData.priority} onValueChange={v => setFormData({ ...formData, priority: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Target Department</Label>
              <SearchableSelect
                options={departments.map(d => ({ value: d, label: d }))}
                value={formData.department}
                onValueChange={v => setFormData({ ...formData, department: v, assignedTo: "", participants: [] })}
                placeholder="Select department..."
              />
            </div>

            <div className="space-y-2">
              <Label>Link Project</Label>
              <SearchableSelect
                options={[
                  { value: "none", label: "None" },
                  ...filteredAndSortedProjects.map(p => ({ value: p.id, label: p.title }))
                ]}
                value={formData.projectId}
                onValueChange={v => setFormData({ ...formData, projectId: v })}
                placeholder="Select project..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manualProject">Manual Project Entry</Label>
              <Input
                id="manualProject"
                placeholder="Type project name manually"
                value={formData.manualProject}
                onChange={e => setFormData({ ...formData, manualProject: e.target.value })}
                className="transition-all focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <VoiceRecorder
            onRecordingComplete={setAudioBlob}
            onTranscription={handleTranscription}
            onIsRecordingChange={setIsRecording}
          />

          <div className="space-y-2 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Description {useTextarea ? "" : "(checklist — press Enter for a new item, or dictate with voice)"}
              </Label>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="description-mode-toggle" 
                  checked={useTextarea} 
                  onCheckedChange={(c) => setUseTextarea(!!c)} 
                />
                <Label htmlFor="description-mode-toggle" className="text-xs text-muted-foreground font-normal cursor-pointer">Use Text Area</Label>
              </div>
            </div>
            
            {useTextarea ? (
              <Textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description here..."
                className="min-h-[150px] transition-all focus:ring-2 focus:ring-primary/20 bg-background/50"
              />
            ) : (
              <div
                ref={descriptionRef}
                className="rounded-lg border border-primary/10 shadow-inner bg-background/50 max-h-[300px] overflow-y-auto px-2 py-1.5"
              >
                {descLines.map((line, index) => {
                const isChecked = Array.isArray(formData.completedLines) && formData.completedLines.includes(index);
                return (
                  <div key={index} className="group flex items-center gap-2 py-1">
                    <GripVertical className="h-4 w-4 text-muted-foreground/25 shrink-0" />
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleFormLine(index)}
                      className="shrink-0"
                    />
                    <input
                      ref={el => { itemRefs.current[index] = el; }}
                      value={line}
                      placeholder={index === 0 && descLines.length === 1 ? "List item… speak now or start typing" : "List item"}
                      onChange={e => updateLineText(index, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          insertLineAfter(index);
                        } else if (e.key === "Backspace" && line === "" && descLines.length > 1) {
                          e.preventDefault();
                          removeLine(index);
                        }
                      }}
                      className={`flex-1 min-w-0 bg-transparent border-none outline-none text-sm py-0.5 font-medium ${isChecked ? 'line-through text-muted-foreground' : ''}`}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => removeLine(index)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addTrailingItem}
                className="flex items-center gap-2 py-1.5 pl-[3.375rem] text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
              >
                <Plus className="h-4 w-4 -ml-[1.625rem]" /> List item
              </button>
            </div>
            )}
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] text-muted-foreground italic">
                {isRecording
                  ? (interimTranscription ? `Listening: ${interimTranscription}…` : "Transcription active... keep speaking.")
                  : useTextarea 
                    ? "Type your description or use the mic above." 
                    : "Tick items off, press Enter for a new checkbox, or use the mic above."}
              </p>
              {formData.description && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, description: "", completedLines: [] })}
                  className="text-[10px] text-destructive hover:underline"
                >
                  Clear Description
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Team & Collaboration</Label>
            <div className="border rounded-lg p-3 bg-muted/20 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Assigned To <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  options={[
                    { value: "none", label: "Unassigned" },
                    ...filteredEmployees.map(emp => ({ value: emp.id, label: emp.name }))
                  ]}
                  value={formData.assignedTo}
                  onValueChange={v => setFormData({ ...formData, assignedTo: v === "none" ? "" : v })}
                  placeholder="Choose assignee..."
                  disabled={!formData.department}
                />
                {!formData.department && <p className="text-[10px] text-amber-600">Select a department first</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Participants / CC <span className="text-destructive">*</span></Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {formData.participants.map((pId: string) => {
                    const emp = employees.find((e: any) => e.id === pId);
                    return (
                      <Badge key={pId} variant="secondary" className="pr-1 gap-1">
                        {emp?.name || pId}
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, participants: formData.participants.filter((id: string) => id !== pId) })}
                          className="hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    );
                  })}
                </div>
                <MultiSearchableSelect
                  options={filteredEmployees
                    .filter(e => e.id !== formData.assignedTo)
                    .map(emp => ({ value: emp.id, label: emp.name }))
                  }
                  selectedValues={formData.participants}
                  onToggle={v => {
                    if (formData.participants.includes(v)) {
                      setFormData({ ...formData, participants: formData.participants.filter(id => id !== v) });
                    } else {
                      setFormData({ ...formData, participants: [...formData.participants, v] });
                    }
                  }}
                  placeholder="Add participant..."
                  disabled={!formData.department}
                />
              </div>
            </div>
          </div>

          <VoiceRecorder onRecordingComplete={setAudioBlob} />

          <div className="space-y-2">
            <Label>Attachments</Label>
            <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg bg-muted/30 transition-colors hover:bg-muted/50 cursor-pointer relative">
              <input
                type="file"
                multiple
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={e => setFiles(Array.from(e.target.files || []))}
              />
              <div className="flex-1 flex flex-col items-center justify-center py-2 text-muted-foreground">
                <Paperclip className="h-8 w-8 mb-2" />
                <p className="text-sm font-medium">Click or drag files to upload</p>
                <p className="text-xs">Max size: 10MB each</p>
              </div>
            </div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {files.map((f, i) => (
                  <Badge key={i} variant="secondary" className="pl-1 pr-2 py-1 gap-1">
                    <Paperclip className="h-3 w-3" />
                    {f.name}
                    <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="ml-1 text-muted-foreground hover:text-foreground">×</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t p-6 bg-muted/10">
          <Button type="button" variant="ghost" onClick={() => onSuccess()}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Processing...
              </>
            ) : initialData?.id ? "Update Ticket" : "Submit Ticket"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function TicketsTable({
  tickets,
  isLoading,
  onView,
  isAdminView,
  employees = [],
  projects = []
}: {
  tickets: TicketData[],
  isLoading: boolean,
  onView: (id: string) => void,
  isAdminView?: boolean,
  employees?: any[],
  projects?: any[]
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/tickets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete ticket");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Deleted", description: "Ticket has been removed successfully." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const res = await apiFetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update ticket");
      return res.json();
    },
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ["/api/tickets"] });

      // Snapshot the previous value
      const previousTickets = queryClient.getQueryData<TicketData[]>(["/api/tickets"]);

      // Optimistically update to the new value
      queryClient.setQueryData<TicketData[]>(["/api/tickets"], (old) => {
        return old?.map(t => t.id === id ? { ...t, ...data } : t);
      });

      // Return a context object with the snapshotted value
      return { previousTickets };
    },
    onSuccess: (updatedTicket, { id }) => {
      // Write the server-confirmed ticket straight into the list cache so the
      // row shows the real status immediately, instead of waiting on a
      // background refetch that may be delayed or skipped.
      queryClient.setQueryData<TicketData[]>(["/api/tickets"], (old) =>
        old?.map(t => t.id === id ? { ...t, ...updatedTicket } : t)
      );
      // Also update the detail-view cache for this ticket if it's loaded.
      queryClient.setQueryData([`/api/tickets/${id}`], (old: any) =>
        old ? { ...old, ...updatedTicket } : old
      );
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousTickets) {
        queryClient.setQueryData(["/api/tickets"], context.previousTickets);
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success to ensure we have the correct data from the server.
      // (Previously this tried to invalidate `/api/tickets/:id` queries with a RegExp inside
      // queryKey, which react-query does not support — it never matched anything, so open
      // detail views could keep showing the old status. Use a predicate instead.)
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/tickets/"),
      });
    },
  });

  const [editingTicket, setEditingTicket] = useState<TicketData | null>(null);
  const [cloningTicket, setCloningTicket] = useState<TicketData | null>(null);
  const [addToTaskTicket, setAddToTaskTicket] = useState<TicketData | null>(null);
  const [requestCloseTicket, setRequestCloseTicket] = useState<TicketData | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);

  // Click-to-sort on any column header — same pattern as the Tasks list.
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: "asc" | "desc" } | null>(null);
  const handleSort = (column: string) => {
    setSortConfig(prev => {
      if (prev?.column === column) {
        return prev.direction === "asc" ? { column, direction: "desc" } : null;
      }
      return { column, direction: "asc" };
    });
  };
  const sortIndicator = (column: string) => {
    if (sortConfig?.column !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    const result = tickets.filter(t => {
      // Search now matches every column shown in the list, not just title/ID.
      const matchSearch = !searchLower ||
        t.title.toLowerCase().includes(searchLower) ||
        t.ticketCode.toLowerCase().includes(searchLower) ||
        (t.category || "").toLowerCase().includes(searchLower) ||
        (t.priority || "").toLowerCase().includes(searchLower) ||
        (t.status || "").toLowerCase().includes(searchLower) ||
        (t.department || "").toLowerCase().includes(searchLower) ||
        (t.assignedToName || "").toLowerCase().includes(searchLower) ||
        (t.createdByName || "").toLowerCase().includes(searchLower);
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      return matchSearch && matchStatus;
    });

    if (!sortConfig) return result;
    const { column, direction } = sortConfig;
    const getKey = (t: TicketData): string | number => {
      switch (column) {
        case "id": return t.ticketCode || "";
        case "title": return (t.title || "").toLowerCase();
        case "category": return (t.category || "").toLowerCase();
        case "priority": return (t.priority || "").toLowerCase();
        case "status": return (t.status || "").toLowerCase();
        case "department": return (t.department || "").toLowerCase();
        case "assignee": return (t.assignedToName || "").toLowerCase();
        case "raisedDate": return t.createdAt ? new Date(t.createdAt).getTime() : 0;
        default: return "";
      }
    };
    const sorted = [...result].sort((a, b) => {
      const ka = getKey(a);
      const kb = getKey(b);
      if (ka < kb) return direction === "asc" ? -1 : 1;
      if (ka > kb) return direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [tickets, search, statusFilter, sortConfig]);

  if (isLoading) {
    return (
      <Card className="w-full h-96 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground animate-pulse">Loading tickets...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-none shadow-sm shadow-primary/10">
      <div className="p-4 bg-background border-b flex flex-col sm:flex-row gap-4 justify-between items-center sm:items-center">
        <div className="relative w-full sm:w-80 group">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            placeholder="Search by ID or title..."
            className="pl-9 h-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Resolved">Resolved</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
              <SelectItem value="Pending Closure">Pending Closure</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="relative overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-[120px] cursor-pointer select-none" onClick={() => handleSort("id")}>
                <div className="flex items-center gap-1">ID {sortIndicator("id")}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("title")}>
                <div className="flex items-center gap-1">Ticket Information {sortIndicator("title")}</div>
              </TableHead>
              <TableHead className="hidden md:table-cell cursor-pointer select-none" onClick={() => handleSort("category")}>
                <div className="flex items-center gap-1">Category {sortIndicator("category")}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("priority")}>
                <div className="flex items-center gap-1">Priority {sortIndicator("priority")}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("status")}>
                <div className="flex items-center gap-1">Status {sortIndicator("status")}</div>
              </TableHead>
              <TableHead className="hidden lg:table-cell cursor-pointer select-none" onClick={() => handleSort("raisedDate")}>
                <div className="flex items-center gap-1">Raised Date {sortIndicator("raisedDate")}</div>
              </TableHead>
              <TableHead className="hidden md:table-cell cursor-pointer select-none" onClick={() => handleSort("department")}>
                <div className="flex items-center gap-1">Department {sortIndicator("department")}</div>
              </TableHead>
              {/* Task Owner (= Assignee / "Handled By") — now visible to everyone
                  in the list view, not just admins. Non-admins get a read-only
                  name; admins keep the existing reassign/remove controls. */}
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("assignee")}>
                <div className="flex items-center gap-1">Task Owner {sortIndicator("assignee")}</div>
              </TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Ticket className="h-12 w-12 mb-4 opacity-20" />
                    <p className="text-lg font-medium">No tickets found</p>
                    <p className="text-sm">Try adjusting your search or filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => (
                <TableRow key={t.id} className="group hover:bg-muted/20 transition-colors">
                  <TableCell className="font-mono text-xs font-bold text-primary">{t.ticketCode}</TableCell>
                  <TableCell>
                    <div className="flex flex-col max-w-[300px]">
                      <span className="font-semibold truncate">{t.title}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <UserIcon className="h-3 w-3" /> {t.createdByName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className="font-normal capitalize">{t.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Badge className={`${PRIORITY_COLORS[t.priority] || "bg-gray-500"} cursor-pointer hover:opacity-80 transition-opacity`}>
                          {t.priority}
                        </Badge>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {PRIORITIES.map(p => (
                          <DropdownMenuItem key={p} onClick={() => updateMutation.mutate({ id: t.id, data: { priority: p } })}>
                            {p}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Badge variant="outline" className={`${STATUS_COLORS[t.status] || "bg-amber-100 text-amber-700 border-amber-300"} px-2 py-0 h-6 cursor-pointer hover:bg-opacity-80 transition-all`}>
                          {t.status}
                        </Badge>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {Object.keys(STATUS_COLORS).map(s =>
                          s === "Pending Closure" ? null : (
                            <DropdownMenuItem key={s} onClick={() => updateMutation.mutate({ id: t.id, data: { status: s } })}>
                              {s}
                            </DropdownMenuItem>
                          )
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" /> {t.department || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isAdminView ? (
                      t.assignedToName ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px]">{t.assignedToName[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs truncate max-w-[100px]">{t.assignedToName}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => updateMutation.mutate({ id: t.id, data: { assignedTo: null } })}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <AdminAssignSelect ticketId={t.id} employees={employees} />
                      )
                    ) : (
                      // Non-admins get a read-only view of who owns this ticket —
                      // no reassign/remove controls, matching the Tasks page's
                      // read-only "Task Owner" display for regular users.
                      t.assignedToName ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px]">{t.assignedToName[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs truncate max-w-[100px]">{t.assignedToName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not assigned</span>
                      )
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => onView(t.id)} title="View Details">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      {t.taskId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => {
                            sessionStorage.setItem("tasks_navigate_fresh", "1");
                            localStorage.setItem("tasks_searchQuery", t.title);
                            window.location.href = "/tasks";
                          }}
                          title="Go to Linked PMS Task"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => setAddToTaskTicket(t)}
                          title="Add to PMS Task"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Request Close button — visible to everyone */}
                      {t.status !== "Closed" && t.status !== "Pending Closure" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          onClick={() => { setRequestCloseTicket(t); setCloseReason(""); }}
                          title="Request Closure"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50" onClick={() => setCloningTicket(t)} title="Clone Ticket">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => setEditingTicket(t)} title="Edit Ticket">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => {
                        if (confirm("Are you sure you want to delete this ticket?")) {
                          deleteMutation.mutate(t.id);
                        }
                      }} title="Delete Ticket">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editingTicket} onOpenChange={(open) => !open && setEditingTicket(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Ticket: {editingTicket?.ticketCode}</DialogTitle>
            <DialogDescription>Modify ticket details and click save updates.</DialogDescription>
          </DialogHeader>
          {editingTicket && (
            <RaiseTicketForm
              projects={projects}
              employees={employees}
              initialData={editingTicket}
              onSuccess={() => setEditingTicket(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cloningTicket} onOpenChange={(open) => !open && setCloningTicket(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Clone Ticket: {cloningTicket?.ticketCode}</DialogTitle>
            <DialogDescription>Create a new ticket based on this one.</DialogDescription>
          </DialogHeader>
          {cloningTicket && (
            <RaiseTicketForm
              projects={projects}
              employees={employees}
              initialData={cloningTicket}
              isClone={true}
              onSuccess={() => setCloningTicket(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!addToTaskTicket} onOpenChange={(open) => !open && setAddToTaskTicket(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-xl border-t-4 border-t-emerald-500 shadow-2xl glassmorphism">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Plus className="h-5 w-5 text-emerald-500" />
              Add Ticket to PMS Task
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Create a project management task automatically from Ticket <strong>{addToTaskTicket?.ticketCode}</strong>.
            </DialogDescription>
          </DialogHeader>

          {addToTaskTicket && (
            <AddToTaskForm
              ticket={addToTaskTicket}
              projects={projects}
              employees={employees}
              onClose={() => setAddToTaskTicket(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Request Close Modal */}
      <Dialog open={!!requestCloseTicket} onOpenChange={(open) => { if (!open) { setRequestCloseTicket(null); setCloseReason(""); } }}>
        <DialogContent className="max-w-md rounded-xl border-t-4 border-t-amber-500 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <CheckCircle2 className="h-5 w-5 text-amber-500" />
              Request Ticket Closure
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Ticket <strong>{requestCloseTicket?.ticketCode}</strong> will be marked as <span className="font-semibold text-amber-600">Pending Closure</span> and sent to admin for approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="close-reason" className="text-sm font-semibold">
              Reason for closing <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="close-reason"
              placeholder="Describe why this ticket should be closed..."
              className="min-h-[100px] resize-none focus:ring-amber-400/30"
              value={closeReason}
              onChange={e => setCloseReason(e.target.value)}
            />
            {closeReason.trim().length === 0 && (
              <p className="text-xs text-amber-600">A reason is required before submitting.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setRequestCloseTicket(null); setCloseReason(""); }} disabled={isSubmittingClose}>
              Cancel
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-md shadow-amber-500/20"
              disabled={!closeReason.trim() || isSubmittingClose}
              onClick={async () => {
                if (!requestCloseTicket) return;
                setIsSubmittingClose(true);
                try {
                  await updateMutation.mutateAsync({ id: requestCloseTicket.id, data: { status: "Pending Closure", closeReason: closeReason.trim() } });
                  toast({ title: "Closure Requested", description: "Your closure request has been sent to the admin for approval." });
                  setRequestCloseTicket(null);
                  setCloseReason("");
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                } finally {
                  setIsSubmittingClose(false);
                }
              }}
            >
              {isSubmittingClose ? (
                <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Submitting...</>
              ) : (
                <>Submit Request</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AddToTaskForm({
  ticket,
  projects,
  employees,
  onClose
}: {
  ticket: TicketData,
  projects: any[],
  employees: any[],
  onClose: () => void
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(ticket.projectId || "");
  const [selectedKeyStepId, setSelectedKeyStepId] = useState<string>("");
  const [selectedAssignee, setSelectedAssignee] = useState<string>(ticket.assignedTo || "");
  const [dueDate, setDueDate] = useState<string>("");
  const [createAsSubtask, setCreateAsSubtask] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const filteredAndSortedProjects = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    if (!user) return projects;

    const isAdmin = user.role?.toUpperCase() === 'ADMIN';
    const normalizeDept = (d: string) => {
      if (!d) return "";
      let norm = d.toLowerCase().trim().replace(/\s+/g, " ");
      if (norm.includes("software")) return "software";
      if (norm.includes("hardware") || norm.includes("technician")) return "hardware";
      return norm;
    };
    const getProjectDepts = (p: any): string[] => {
      const raw = p.departments ?? p.department;
      if (!raw) return [];
      return Array.isArray(raw) ? raw : [raw];
    };

    const userDept = normalizeDept(user.department || "");
    const empId = user.employeeId;

    // Admin sees every project here too, same as the Raise Ticket form —
    // previously admin was still run through the assigned/department-only
    // filter below and only got special treatment in the sort, not the
    // filter, which could hide projects from admins as well.
    const validProjects = isAdmin ? projects : projects.filter(p => {
      const isAssigned = empId && (
        (p.team && p.team.includes(empId)) ||
        (p.taskAssignees && p.taskAssignees.includes(empId)) ||
        (p.createdByEmployeeId === empId)
      );

      const isDept = userDept && getProjectDepts(p).some((d: string) => normalizeDept(d) === userDept);

      return isAssigned || isDept || (p.createdByEmployeeId === user.id);
    });

    return validProjects.sort((a, b) => {
      if (isAdmin) return a.title.localeCompare(b.title);

      const aAssigned = empId && ((a.team && a.team.includes(empId)) || (a.createdByEmployeeId === empId)) ? 1 : 0;
      const bAssigned = empId && ((b.team && b.team.includes(empId)) || (b.createdByEmployeeId === empId)) ? 1 : 0;

      if (aAssigned !== bAssigned) return bAssigned - aAssigned;

      return (a.title || "").localeCompare(b.title || "");
    });
  }, [projects, user]);

  // Fetch KeySteps for selected project
  const { data: keySteps = [], isLoading: keyStepsLoading } = useQuery<any[]>({
    queryKey: [`/api/projects/${selectedProjectId}/key-steps`],
    queryFn: async () => {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/key-steps`);
      if (!res.ok) throw new Error("Failed to fetch key steps");
      return res.json();
    },
    enabled: !!selectedProjectId && selectedProjectId !== "none",
  });

  const handleCreateTask = async () => {
    if (!selectedProjectId) {
      toast({ title: "Validation Error", description: "Please select a project.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    try {
      // 1. Create PMS Task
      const taskBody = {
        projectId: selectedProjectId,
        keyStepId: selectedKeyStepId || null,
        taskName: ticket.title,
        description: ticket.description,
        status: syncStatus ? (ticket.status === "Open" ? "pending" : "in-progress") : "pending",
        priority: ticket.priority.toLowerCase() === "critical" ? "high" :
          ticket.priority.toLowerCase() === "high" ? "high" :
            ticket.priority.toLowerCase() === "medium" ? "medium" : "low",
        startDate: new Date().toISOString(),
        endDate: dueDate || null,
        assignerId: user?.employeeId || null,
        taskMembers: selectedAssignee ? [selectedAssignee] : [],
        subtasks: createAsSubtask ? [{ title: ticket.title, description: ticket.description, assignedTo: selectedAssignee ? [selectedAssignee] : [] }] : [],
        ticketId: ticket.id,
      };

      const taskRes = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskBody),
      });

      if (!taskRes.ok) {
        throw new Error("Failed to create PMS Task");
      }

      const task = await taskRes.json();

      // 2. Update Ticket with taskId and projectId
      const ticketRes = await apiFetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          projectId: selectedProjectId,
          status: syncStatus ? (ticket.status === "Resolved" || ticket.status === "Closed" ? ticket.status : "In Progress") : ticket.status,
        }),
      });

      if (!ticketRes.ok) {
        throw new Error("Failed to link Ticket to Task");
      }

      // 3. Create In-App Notification (pushing to localStorage)
      const savedNotifications = localStorage.getItem("pms_notifications");
      const currentNotifications = savedNotifications ? JSON.parse(savedNotifications) : [];
      const newNotification = {
        id: Date.now(),
        title: "Task Created from Ticket",
        message: `A new task "${ticket.title}" has been created from Ticket ${ticket.ticketCode} and linked to the project.`,
        time: "Just now",
        unread: true,
      };
      localStorage.setItem("pms_notifications", JSON.stringify([newNotification, ...currentNotifications]));
      window.dispatchEvent(new Event("pms-new-notification"));

      toast({
        title: "Success",
        description: `Task created and linked successfully to Ticket ${ticket.ticketCode}.`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 py-4">
      {/* Search & Link Project */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Linked Project *</Label>
        {ticket.projectId && ticket.projectId !== "none" ? (
          // Project is LOCKED — auto-selected from the ticket
          <div className="flex items-center gap-2 h-9 border border-emerald-300 rounded-md px-3 bg-emerald-50/60 text-sm font-medium text-emerald-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            {projects.find(p => p.id === ticket.projectId)?.title || "Linked Project"}
            <span className="ml-auto text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full font-semibold">Auto-linked · Locked</span>
          </div>
        ) : (
          <SearchableSelect
            options={filteredAndSortedProjects.map(p => ({ value: p.id, label: p.title }))}
            value={selectedProjectId}
            onValueChange={(v) => {
              setSelectedProjectId(v);
              setSelectedKeyStepId("");
            }}
            placeholder="Select a project..."
          />
        )}
      </div>

      {/* KeyStep Dropdown */}
      {selectedProjectId && (
        <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Key Step (Phase)</Label>
          {keyStepsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground h-9 border rounded-md px-3 bg-muted/10">
              <div className="h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading keysteps...
            </div>
          ) : keySteps.length === 0 ? (
            <div className="text-xs text-amber-600 h-9 border border-amber-200/50 rounded-md px-3 bg-amber-50/50 flex items-center">
              No keysteps found under this project.
            </div>
          ) : (
            <SearchableSelect
              options={keySteps.map(ks => ({ value: ks.id, label: ks.title }))}
              value={selectedKeyStepId}
              onValueChange={setSelectedKeyStepId}
              placeholder="Select a keystep phase..."
            />
          )}
        </div>
      )}

      {/* Assign To */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Assign To</Label>
        <SearchableSelect
          options={employees.map(emp => ({ value: emp.id, label: emp.name }))}
          value={selectedAssignee}
          onValueChange={setSelectedAssignee}
          placeholder="Select assignee..."
        />
      </div>

      {/* Due Date */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          Due Date (Optional)
        </Label>
        <Input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="w-full text-sm font-medium focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {/* Additional Options */}
      <div className="border border-border/80 rounded-xl p-4 bg-muted/15 space-y-4 shadow-inner">
        {/* Create as Subtask Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group select-none">
          <input
            type="checkbox"
            checked={createAsSubtask}
            onChange={e => setCreateAsSubtask(e.target.checked)}
            className="h-4.5 w-4.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 transition-all cursor-pointer mt-0.5"
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground group-hover:text-emerald-700 transition-colors">Create as Subtask</span>
            <span className="text-xs text-muted-foreground">Automatically nest ticket as a subtask inside the created PMS Task.</span>
          </div>
        </label>

        <Separator />

        {/* Status Sync Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group select-none">
          <input
            type="checkbox"
            checked={syncStatus}
            onChange={e => setSyncStatus(e.target.checked)}
            className="h-4.5 w-4.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 transition-all cursor-pointer mt-0.5"
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground group-hover:text-emerald-700 transition-colors">Two-Way Status Sync</span>
            <span className="text-xs text-muted-foreground">Keep the ticket status and task status fully synchronized in real-time.</span>
          </div>
        </label>
      </div>

      <DialogFooter className="pt-2">
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button
          onClick={handleCreateTask}
          disabled={isSubmitting || !selectedProjectId}
          className="min-w-[140px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-all shadow-md shadow-emerald-600/10"
        >
          {isSubmitting ? (
            <>
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Create Task
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

function AdminAssignSelect({ ticketId, employees }: { ticketId: string, employees: any[] }) {
  const { toast } = useToast();
  const assignMutation = useMutation({
    mutationFn: async (empId: string) => {
      const res = await apiFetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTo: empId, status: "In Progress" }),
      });
      if (!res.ok) throw new Error("Failed to assign ticket");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket Assigned", description: "The ticket has been assigned successfully." });
    },
  });

  return (
    <Select onValueChange={v => assignMutation.mutate(v)}>
      <SelectTrigger className="w-[130px] h-8 text-xs bg-muted/50">
        <SelectValue placeholder="Assign To" />
      </SelectTrigger>
      <SelectContent>
        {employees.map(e => <SelectItem key={e.id} value={e.id} className="text-xs">{e.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function TicketDetailView({ id, onBack }: { id: string, onBack: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeReasonDetail, setCloseReasonDetail] = useState("");
  const [isSubmittingCloseDetail, setIsSubmittingCloseDetail] = useState(false);
  const isAdmin = user?.role === "ADMIN";

  const { data: ticket, isLoading } = useQuery<TicketData & { comments: CommentData[], attachments: AttachmentData[] }>({
    queryKey: [`/api/tickets/${id}`],
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiFetch(`/api/tickets/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to add comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${id}`] });
      setComment("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onMutate: async (newData) => {
      // Cancel refetches
      await queryClient.cancelQueries({ queryKey: [`/api/tickets/${id}`] });
      await queryClient.cancelQueries({ queryKey: ["/api/tickets"] });

      // Snapshot previous
      const previousTicket = queryClient.getQueryData([`/api/tickets/${id}`]);

      // Optimistic update
      queryClient.setQueryData([`/api/tickets/${id}`], (old: any) => ({
        ...old,
        ...newData
      }));

      return { previousTicket };
    },
    onSuccess: (updatedTicket) => {
      // Merge the confirmed server response in right away (don't wait on the
      // background refetch) so the status badge updates immediately.
      queryClient.setQueryData([`/api/tickets/${id}`], (old: any) =>
        old ? { ...old, ...updatedTicket } : old
      );
      queryClient.setQueryData<TicketData[]>(["/api/tickets"], (old) =>
        old?.map(t => t.id === id ? { ...t, ...updatedTicket } : t)
      );
    },
    onError: (err, newData, context) => {
      if (context?.previousTicket) {
        queryClient.setQueryData([`/api/tickets/${id}`], context.previousTicket);
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
    },
  });

  if (isLoading || !ticket) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground animate-pulse text-sm">Loading details...</p>
        </div>
      </div>
    );
  }

  const isOwner = ticket.createdBy === user?.employeeId;
  const isAssigned = ticket.assignedTo === user?.employeeId;

  const toggleLine = (index: number) => {
    const currentCompleted = Array.isArray(ticket.completedLines) ? ticket.completedLines : [];
    const newCompleted = currentCompleted.includes(index)
      ? currentCompleted.filter((i: number) => i !== index)
      : [...currentCompleted, index];

    updateMutation.mutate({ completedLines: newCompleted });
  };

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="group">
          <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Back to List
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Ticket Info */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-lg border-none hover-glass transition-all overflow-hidden">
              <div className="p-1 bg-gradient-to-r from-primary/40 via-primary/20 to-transparent" />
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{ticket.ticketCode}</span>
                      <Badge className={PRIORITY_COLORS[ticket.priority]}>{ticket.priority}</Badge>
                    </div>
                    <CardTitle className="text-2xl pt-2">{ticket.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status badge / dropdown */}
                    {(isAdmin || isOwner || isAssigned) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className={`${STATUS_COLORS[ticket.status] || "bg-amber-100 text-amber-700 border-amber-300"} border-none`}>
                            {ticket.status} <ChevronRight className="ml-2 h-4 w-4 rotate-90" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => updateMutation.mutate({ status: "Open" })}>Open</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateMutation.mutate({ status: "In Progress" })}>In Progress</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateMutation.mutate({ status: "Resolved" })}>Resolved</DropdownMenuItem>
                          {isAdmin && <DropdownMenuItem onClick={() => updateMutation.mutate({ status: "Closed" })}>Closed</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {/* Request Close — visible to any logged-in user when not already Closed/Pending */}
                    {ticket.status !== "Closed" && ticket.status !== "Pending Closure" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 font-semibold gap-1.5"
                        onClick={() => { setShowCloseModal(true); setCloseReasonDetail(""); }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Request Close
                      </Button>
                    )}
                    {isOwner && ticket.status === "Closed" && (
                      <Button variant="outline" size="sm" onClick={() => updateMutation.mutate({ status: "Open" })}>
                        Reopen Ticket
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Pending Closure banner — shown when status is Pending Closure */}
                {ticket.status === "Pending Closure" && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-amber-100 border-b border-amber-200">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      <p className="text-sm font-bold text-amber-800">Closure Requested — Awaiting Admin Approval</p>
                    </div>
                    {ticket.closeReason ? (
                      <div className="px-4 py-3 space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Reason Provided</p>
                        <p className="text-sm text-amber-900 font-medium leading-relaxed whitespace-pre-wrap">{ticket.closeReason}</p>
                      </div>
                    ) : (
                      <div className="px-4 py-3">
                        <p className="text-xs text-amber-600 italic">No reason provided.</p>
                      </div>
                    )}
                    <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                      <p className="text-[10px] text-amber-600">An admin must approve or reject this closure request.</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pb-4 border-b">
                  <div className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Created {new Date(ticket.createdAt).toLocaleString()}</div>
                  <div className="flex items-center gap-1.5"><Tag className="h-4 w-4" /> {ticket.category}</div>
                  <div className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> {ticket.department}</div>
                  {ticket.companyName && <div className="flex items-center gap-1.5 text-amber-600"><Building2 className="h-4 w-4" /> Company: {ticket.companyName}</div>}
                  {ticket.projectName && <div className="flex items-center gap-1.5 text-primary"><FileText className="h-4 w-4" /> Project: {ticket.projectName}</div>}
                </div>

                <div className="prose prose-sm max-w-none pt-4">
                  {/* Google Keep style checklist: every non-blank description line gets its
                      own checkbox. Ticking one marks that line done (struck-through) and is
                      saved to the ticket immediately via completedLines. */}
                  <div className="leading-relaxed text-foreground/80 space-y-0.5">
                    {(ticket.description || "").split('\n').map((line: string, index: number) => {
                      const isBlank = line.trim().length === 0;
                      const isCompleted = Array.isArray(ticket.completedLines) && ticket.completedLines.includes(index);

                      if (isBlank) return <div key={index} className="h-3"></div>;

                      return (
                        <div
                          key={index}
                          onClick={() => toggleLine(index)}
                          className="flex items-start gap-2.5 cursor-pointer transition-all duration-200 hover:bg-primary/5 rounded px-1 py-1 -mx-1"
                        >
                          <Checkbox
                            checked={isCompleted}
                            onCheckedChange={() => toggleLine(index)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 shrink-0"
                          />
                          <span className={`whitespace-pre-wrap ${isCompleted ? 'line-through text-green-500 opacity-80' : ''}`}>
                            {line}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {ticket.attachments && ticket.attachments.length > 0 && (
                  <div className="mt-8">
                    <h4 className="flex items-center gap-2 text-sm font-semibold mb-3"><Paperclip className="h-4 w-4" /> Attachments ({ticket.attachments.length})</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {ticket.attachments?.map((att) => {
                        const isAudio = att.mimeType?.startsWith("audio/") || att.fileName.endsWith(".webm") || att.fileName.endsWith(".mp3");

                        if (isAudio) {
                          return (
                            <div key={att.id} className="p-4 border rounded-xl bg-primary/5 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                                  <Mic className="h-3 w-3" /> Voice Note
                                </span>
                                <a href={att.storageUrl} download={att.fileName} className="text-muted-foreground hover:text-primary transition-colors">
                                  <Download className="h-4 w-4" />
                                </a>
                              </div>
                              <audio src={att.storageUrl} controls className="w-full h-10" />
                            </div>
                          );
                        }

                        return (
                          <div key={att.id} className="flex items-center justify-between p-3 border rounded-xl hover:bg-muted/30 transition-colors group">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="p-2 bg-muted rounded-lg text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                                <Paperclip className="h-4 w-4" />
                              </div>
                              <div className="flex flex-col overflow-hidden">
                                <span className="text-sm font-medium truncate">{att.fileName}</span>
                                <span className="text-[10px] text-muted-foreground">{(att.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <a href={att.storageUrl} target="_blank" rel="noreferrer">
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </a>
                              <a href={att.storageUrl} download={att.fileName}>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary">
                                  <Download className="h-4 w-4" />
                                </Button>
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chat style comments */}
            <Card className="shadow-lg border-none glassmorphism overflow-hidden">
              <CardHeader className="py-4 border-b bg-muted/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Comments & Discussion
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px] p-6">
                  <div className="space-y-6">
                    {ticket.comments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                        <MessageSquare className="h-10 w-10 opacity-20 mb-2" />
                        <p className="text-sm italic">No comments yet. Start the conversation!</p>
                      </div>
                    ) : (
                      ticket.comments.map((c, i) => {
                        const isMe = c.createdBy === user?.employeeId;
                        return (
                          <div key={c.id} className={`flex gap-4 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                            <Avatar className={`mt-1 h-9 w-9 border-2 ${isMe ? "border-primary/20" : "border-muted"}`}>
                              <AvatarFallback className={isMe ? "bg-primary text-primary-foreground" : "bg-muted"}>
                                {c.createdByName[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div className={`flex flex-col space-y-1.5 max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                              <div className="flex items-center gap-2 px-1">
                                <span className="text-xs font-bold">{c.createdByName}</span>
                                <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <div className={`p-4 rounded-2xl shadow-sm text-sm ${isMe
                                ? "bg-primary text-primary-foreground rounded-tr-none"
                                : "bg-muted/50 border rounded-tl-none"
                                }`}>
                                {c.content}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
              <CardFooter className="p-4 border-t bg-muted/10">
                <div className="flex w-full gap-3 items-end">
                  <div className="flex-1 relative">
                    <Textarea
                      placeholder="Type your message..."
                      className="min-h-[60px] max-h-[120px] resize-none pr-12 transition-all focus:ring-2 focus:ring-primary/20 bg-background"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (comment.trim()) commentMutation.mutate(comment);
                        }
                      }}
                    />
                  </div>
                  <Button
                    size="icon"
                    disabled={!comment.trim() || commentMutation.isPending}
                    onClick={() => commentMutation.mutate(comment)}
                    className="h-[60px] w-12 rounded-xl transition-all active:scale-95"
                  >
                    <Send className={`h-5 w-5 ${comment.trim() ? "animate-pulse" : "opacity-50"}`} />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </div>

          {/* Right Column: Actions & Meta */}
          <div className="space-y-6">
            <Card className="shadow-lg border-none bg-primary/5 border-l-4 border-l-primary overflow-hidden">
              <CardHeader className="pb-3 px-4 pt-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary/70">Action Center</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-6">
                {/* Admin Approve / Reject for Pending Closure */}
                {isAdmin && ticket.status === "Pending Closure" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-100/80 border-b border-amber-200">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Closure Request</p>
                    </div>
                    <div className="px-3 py-2 space-y-1">
                      <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Reason</p>
                      <p className="text-xs text-amber-900 font-medium leading-relaxed whitespace-pre-wrap">
                        {ticket.closeReason || <span className="italic text-muted-foreground">No reason provided</span>}
                      </p>
                    </div>
                    <div className="flex gap-2 px-3 pb-3">
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-9 font-semibold gap-1.5 shadow-sm shadow-green-600/20"
                        onClick={() => updateMutation.mutate({ status: "Closed" })}
                        disabled={updateMutation.isPending}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve Close
                      </Button>
                      <Button
                        className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs h-9 font-semibold gap-1.5 shadow-sm shadow-red-500/20"
                        onClick={() => updateMutation.mutate({ status: "Open" })}
                        disabled={updateMutation.isPending}
                      >
                        <AlertCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                    <Separator className="bg-amber-200" />
                  </div>
                )}
                {isAdmin && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Assign Agent</Label>
                      <Select value={ticket.assignedTo || ""} onValueChange={v => updateMutation.mutate({ assignedTo: v, status: ticket.status === "Open" ? "In Progress" : ticket.status })}>
                        <SelectTrigger className="glassmorphism-light">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Priority Level</Label>
                      <Select value={ticket.priority} onValueChange={v => updateMutation.mutate({ priority: v })}>
                        <SelectTrigger className="glassmorphism-light">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <Separator className="bg-primary/10" />

                <div className="space-y-4 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Raised By</span>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 ring-2 ring-primary/10 ring-offset-1">
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{ticket.createdByName[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{ticket.createdByName}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Handled By</span>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 ring-2 ring-blue-500/10 ring-offset-1">
                        <AvatarFallback className="text-[10px] bg-blue-50 text-blue-600">
                          {ticket.assignedToName ? ticket.assignedToName[0] : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{ticket.assignedToName || <span className="text-muted-foreground italic">Not assigned</span>}</span>
                    </div>
                  </div>

                  {ticket.taskId && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Linked PMS Task</span>
                      <Button
                        variant="outline"
                        className="w-full text-xs h-9 gap-2 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 transition-all font-semibold justify-start px-3"
                        onClick={() => {
                          sessionStorage.setItem("tasks_navigate_fresh", "1");
                          localStorage.setItem("tasks_searchQuery", ticket.title);
                          window.location.href = "/tasks";
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Linked Task
                      </Button>
                    </div>
                  )}

                  {ticket.participants && ticket.participants.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Participants</span>
                      <div className="flex flex-wrap gap-2">
                        {ticket.participants.map(pId => {
                          const emp = employees.find((e: any) => e.id === pId);
                          return (
                            <div key={pId} className="flex items-center gap-1.5 bg-background border rounded-full pl-1 pr-2 py-0.5" title={emp?.name}>
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="text-[8px]">{emp?.name ? emp.name[0] : "?"}</AvatarFallback>
                              </Avatar>
                              <span className="text-[10px] font-medium truncate max-w-[80px]">{emp?.name || "Member"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 space-y-2">
                  {/* Request Close button in detail view */}
                  {ticket.status !== "Closed" && ticket.status !== "Pending Closure" && (
                    <Button
                      variant="outline"
                      className="w-full text-xs h-9 gap-2 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 font-semibold transition-all"
                      onClick={() => { setShowCloseModal(true); setCloseReasonDetail(""); }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Request Closure
                    </Button>
                  )}
                  <Button variant="outline" className="w-full text-xs h-9 gap-2 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all">
                    <AlertCircle className="h-3.5 w-3.5" /> Report Issue
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-none glassmorphism">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Ticket History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-0 before:w-0.5 before:bg-muted">
                  <div className="relative">
                    <div className="absolute -left-[23px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background shadow-sm" />
                    <div className="space-y-0.5 text-xs">
                      <p className="font-bold">Ticket Created</p>
                      <p className="text-muted-foreground">{new Date(ticket.createdAt).toLocaleString()}</p>
                      <p className="text-primary font-medium mt-1">Status: Open</p>
                    </div>
                  </div>
                  {ticket.assignedTo && (
                    <div className="relative">
                      <div className="absolute -left-[23px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-blue-500 bg-background shadow-sm" />
                      <div className="space-y-0.5 text-xs">
                        <p className="font-bold">Ticket Assigned</p>
                        <p className="text-muted-foreground">Assigned to {ticket.assignedToName}</p>
                      </div>
                    </div>
                  )}
                  <div className="relative">
                    <div className="absolute -left-[23px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30 bg-background shadow-sm" />
                    <div className="space-y-0.5 text-xs">
                      <p className="font-bold">Last Update</p>
                      <p className="text-muted-foreground">{new Date(ticket.updatedAt).toLocaleString()}</p>
                      <p className="font-medium mt-1">Current Status: <span className="text-primary">{ticket.status}</span></p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Request Close Modal — inside TicketDetailView */}
      <Dialog open={showCloseModal} onOpenChange={(open) => { if (!open) { setShowCloseModal(false); setCloseReasonDetail(""); } }}>
        <DialogContent className="max-w-md rounded-xl border-t-4 border-t-amber-500 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <CheckCircle2 className="h-5 w-5 text-amber-500" />
              Request Ticket Closure
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Ticket <strong>{ticket?.ticketCode}</strong> will be marked as <span className="font-semibold text-amber-600">Pending Closure</span> and sent to admin for approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="close-reason-detail" className="text-sm font-semibold">
              Reason for closing <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="close-reason-detail"
              placeholder="Describe why this ticket should be closed..."
              className="min-h-[100px] resize-none focus:ring-amber-400/30"
              value={closeReasonDetail}
              onChange={e => setCloseReasonDetail(e.target.value)}
            />
            {closeReasonDetail.trim().length === 0 && (
              <p className="text-xs text-amber-600">A reason is required before submitting.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setShowCloseModal(false); setCloseReasonDetail(""); }} disabled={isSubmittingCloseDetail}>
              Cancel
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-md shadow-amber-500/20"
              disabled={!closeReasonDetail.trim() || isSubmittingCloseDetail}
              onClick={async () => {
                setIsSubmittingCloseDetail(true);
                try {
                  await updateMutation.mutateAsync({ status: "Pending Closure", closeReason: closeReasonDetail.trim() });
                  toast({ title: "Closure Requested", description: "Your closure request has been sent to the admin for approval." });
                  setShowCloseModal(false);
                  setCloseReasonDetail("");
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                } finally {
                  setIsSubmittingCloseDetail(false);
                }
              }}
            >
              {isSubmittingCloseDetail ? (
                <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Submitting...</>
              ) : (
                <>Submit Request</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}