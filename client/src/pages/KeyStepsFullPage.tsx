import { useEffect, useMemo, useState, Fragment } from "react";
import { useFreeze } from "@/context/FreezeContext";
import {
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  X,
  Filter,
  Search,
  ChevronRight,
  ChevronDown,
  Circle,
  ListTodo,
  Percent,
  Save,
  Library,
  Bookmark,
  FolderOpen,
  GripVertical,
} from "lucide-react";
import { useLocation } from "wouter";
import { KeyStepFilters, CustomFilter } from "@/components/KeyStepFilters";
import { ManageColumns, ColumnConfig } from "@/components/ManageColumns";
import { Progress } from "@/components/ui/progress";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/apiClient";
import { useAuth } from "@/components/Layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface KeyStep {
  id: string;
  projectId: string;
  parentKeyStepId?: string | null;
  header?: string | null;
  title: string;
  description?: string | null;
  requirements?: string | null;
  phase: number;
  status: "pending" | "in-progress" | "completed" | "not started" | "cancelled";
  startDate: string;
  endDate: string;
  progress: number;
  sortOrder?: number | null;
}

const isoDateOnly = (d: Date) => d.toISOString().slice(0, 10);

// ----------------- COLUMN CONFIGURATION -----------------
// Mirrors the Tasks page's column config shape so Manage Columns behaves
// identically (drag to reorder, checkbox to show/hide, Reset to default).
const defaultKeyStepColumns: ColumnConfig[] = [
  { id: "title", label: "Title", visible: true },
  { id: "project", label: "Project", visible: true },
  { id: "startDate", label: "Start Date", visible: true },
  { id: "endDate", label: "End Date", visible: true },
  { id: "progress", label: "Progress", visible: true },
  { id: "status", label: "Status", visible: true },
];

export default function KeyStepsFullPage() {
  const { isFrozen, frozenProjectId, isItemFrozen, frozenItem } = useFreeze();
  const [selectedKeystepIds, setSelectedKeystepIds] = useState<string[]>([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickTitles, setQuickTitles] = useState<string[]>(Array.from({ length: 5 }).map(() => ""));
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneKeystep, setCloneKeystep] = useState<KeyStep | null>(null);
  const [cloneTitle, setCloneTitle] = useState("");

  // ── Rich Template System ─────────────────────────────────────────────────
  // Save as Template
  const [saveTemplateStep, setSaveTemplateStep] = useState<KeyStep | null>(null);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Use Template
  const [useTemplateOpen, setUseTemplateOpen] = useState(false);
  const [templateList, setTemplateList] = useState<any[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateListLoading, setTemplateListLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [keySteps, setKeySteps] = useState<KeyStep[]>([]);
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  const [dragOverStepId, setDragOverStepId] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("project_id") || params.get("projectId");
    if (fromUrl) return fromUrl;
    if (frozenProjectId != null) return String(frozenProjectId);
    return "all";
  });

  // If a project gets frozen while this page is already open (or has just
  // mounted before the freeze context finished resolving) and no explicit
  // project was requested via URL, and the user hasn't manually switched to
  // a specific project themselves, adopt the frozen project automatically.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("project_id") || params.get("projectId");
    if (!fromUrl && frozenProjectId != null) {
      setSelectedProjectId((prev) => (prev === "all" ? String(frozenProjectId) : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenProjectId]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [clientFilter, setClientFilter] = useState<string>(() => localStorage.getItem("keysteps_clientFilter") || "all");
  const [clients, setClients] = useState<string[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState<string>(() => localStorage.getItem("keysteps_employeeFilter") || "all");
  const [priorityFilter, setPriorityFilter] = useState<string>(() => localStorage.getItem("keysteps_priorityFilter") || "all");

  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem("keysteps_searchTerm") || "");
  const [filterStartDate, setFilterStartDate] = useState(() => localStorage.getItem("keysteps_filterStartDate") || "");
  const [filterEndDate, setFilterEndDate] = useState(() => localStorage.getItem("keysteps_filterEndDate") || "");
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());
  const [projectSearch, setProjectSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");

  // Tasks & Subtasks state
  const [stepTasks, setStepTasks] = useState<Record<string, any[]>>({});
  const [taskSubtasks, setTaskSubtasks] = useState<Record<string, any[]>>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [showTaskFormFor, setShowTaskFormFor] = useState<string | null>(null);
  const [newTaskForm, setNewTaskForm] = useState({ taskName: "", startDate: "", endDate: "", status: "Not Started", priority: "medium" });
  const [showSubtaskFormFor, setShowSubtaskFormFor] = useState<string | null>(null);
  const [newSubtaskForm, setNewSubtaskForm] = useState({ title: "", startDate: "", endDate: "" });

  const [statusFilter, setStatusFilter] = useState("all");
  // Overdue filter — mirrors the Tasks page
  const [overdueFilter, setOverdueFilter] = useState<string>(() => localStorage.getItem("keysteps_overdueFilter") || "all");
  // NOTE: Key Steps are intentionally never hidden based on completion status —
  // a completed Key Step must remain visible in the list (with its Completed
  // status/badge) whether it was completed from the Freeze view or the
  // Project page. See filteredKeySteps below.
  // Manage Columns — mirrors the Tasks page feature
  const [columnsConfig, setColumnsConfig] = useState<ColumnConfig[]>(() => {
    const saved = localStorage.getItem("keysteps_columnsConfig");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const savedIds = new Set(parsed.map((c: ColumnConfig) => c.id));
          const merged = parsed.filter((c: ColumnConfig) => defaultKeyStepColumns.some(d => d.id === c.id));
          defaultKeyStepColumns.forEach(d => { if (!savedIds.has(d.id)) merged.push(d); });
          return merged;
        }
      } catch { /* fall through to defaults */ }
    }
    return defaultKeyStepColumns;
  });

  useEffect(() => {
    localStorage.setItem("keysteps_columnsConfig", JSON.stringify(columnsConfig));
  }, [columnsConfig]);

  useEffect(() => {
    localStorage.setItem("keysteps_overdueFilter", overdueFilter);
  }, [overdueFilter]);

  const isColVisible = (id: string) => columnsConfig.find(c => c.id === id)?.visible !== false;

  const [customFilters, setCustomFilters] = useState<CustomFilter[]>(() => {
    const saved = localStorage.getItem("keysteps_customFilters");
    return saved ? JSON.parse(saved) : [];
  });
  const [savedFilterSets, setSavedFilterSets] = useState<Record<string, any>>(() => {
    const saved = localStorage.getItem("keysteps_savedFilterSets");
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem("keysteps_customFilters", JSON.stringify(customFilters));
  }, [customFilters]);

  useEffect(() => {
    localStorage.setItem("keysteps_savedFilterSets", JSON.stringify(savedFilterSets));
  }, [savedFilterSets]);

  useEffect(() => {
    localStorage.setItem("keysteps_employeeFilter", employeeFilter);
  }, [employeeFilter]);

  const onClearAllFilters = () => {
    setSearchTerm("");
    setFilterStartDate("");
    setFilterEndDate("");
    setStatusFilter("all");
    setClientFilter("all");
    setPriorityFilter("all");
    setEmployeeFilter("all");
    setCustomFilters([]);
    setSelectedProjectId("all");
    setOverdueFilter("all");
  };

  const hasActiveFilters = searchTerm || filterStartDate || filterEndDate || statusFilter !== "all" || clientFilter !== "all" || priorityFilter !== "all" || employeeFilter !== "all" || customFilters.length > 0 || overdueFilter !== "all";

  const clearFilters = () => {
    onClearAllFilters();
  };

  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  // Load projects + employees
  useEffect(() => {
    apiFetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setProjects(list);
        const uniqueClients = Array.from(
          new Set(list.map((proj: any) => String(proj.clientName || proj.company || "")).filter(Boolean))
        );
        setClients(uniqueClients);
      })
      .catch(() => { });

    apiFetch("/api/employees")
      .then((r) => r.json())
      .then((data) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => { });
  }, []);

  // Sync with URL on mount or location change
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("project_id") || params.get("projectId");
    if (fromUrl && fromUrl !== selectedProjectId) {
      setSelectedProjectId(fromUrl);
    }
  }, [window.location.search]);

  // Pre-fetch all tasks whenever project changes
  const prefetchTasksForProject = async (projectId: string) => {
    if (!projectId || projectId === "all") return;
    try {
      const r = await apiFetch(`/api/tasks/${projectId}`);
      if (!r.ok) return;
      const allTasks: any[] = await r.json();
      const byKeyStep: Record<string, any[]> = {};
      allTasks.forEach((t: any) => {
        const ksId = t.keyStepId ? String(t.keyStepId) : "__none__";
        if (!byKeyStep[ksId]) byKeyStep[ksId] = [];
        byKeyStep[ksId].push(t);
      });
      setStepTasks(byKeyStep);
      // Pre-fetch subtasks
      allTasks.forEach(async (t: any) => {
        try {
          const sr = await apiFetch(`/api/subtasks/${t.id}`);
          if (sr.ok) {
            const subs = await sr.json();
            setTaskSubtasks((prev) => ({ ...prev, [t.id]: Array.isArray(subs) ? subs : [] }));
          }
        } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  };

  const refreshKeySteps = async (projectId: string) => {
    try {
      const url = (!projectId || projectId === "all")
        ? "/api/keysteps/bulk?status=all"
        : `/api/projects/${projectId}/key-steps?status=all`;
      const r = await apiFetch(url);
      if (!r.ok) throw new Error(`Failed to load key steps (${r.status})`);
      const data = await r.json();
      const rootSteps = Array.isArray(data) ? (data as KeyStep[]).filter((ks) => !ks.parentKeyStepId) : [];
      setKeySteps(rootSteps); // REPLACE data completely
      setSelectedKeystepIds([]);
    } catch (err) {
      console.error("Failed to load key steps:", err);
      setKeySteps([]);
    }
  };

  useEffect(() => {
    console.log("[KeySteps] selectedProjectId changed:", selectedProjectId);

    // Removed localStorage.setItem — do NOT persist project selection across visits

    // Reset old data CRITICAL step
    setKeySteps([]);
    setStepTasks({});
    setTaskSubtasks({});
    setExpandedStepIds(new Set());
    setExpandedTaskIds(new Set());
    setSelectedKeystepIds([]);

    if (selectedProjectId) {
      refreshKeySteps(selectedProjectId);
      prefetchTasksForProject(selectedProjectId);
    }
  }, [selectedProjectId]);

  // ── Instant injection of newly created/updated keystep ──
  useEffect(() => {
    const newRaw = sessionStorage.getItem("__newKeyStep");
    const updatedRaw = sessionStorage.getItem("__updatedKeyStep");

    if (newRaw) {
      try {
        const newStep: KeyStep = JSON.parse(newRaw);
        sessionStorage.removeItem("__newKeyStep");
        // Inject immediately only if it belongs to the currently selected project
        if (selectedProjectId === "all" || String(newStep.projectId) === String(selectedProjectId)) {
          setKeySteps((prev) => {
            // avoid duplicate if refresh already added it
            if (prev.some((s) => String(s.id) === String(newStep.id))) return prev;
            return [newStep, ...prev];
          });
        }
        // Background sync to get server-authoritative data (progress, etc.)
        setTimeout(() => refreshKeySteps(selectedProjectId), 600);
      } catch { /* ignore */ }
    }

    if (updatedRaw) {
      try {
        const updated: KeyStep = JSON.parse(updatedRaw);
        sessionStorage.removeItem("__updatedKeyStep");
        setKeySteps((prev) => prev.map((s) => String(s.id) === String(updated.id) ? { ...s, ...updated } : s));
        setTimeout(() => refreshKeySteps(selectedProjectId), 600);
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Refresh on tab refocus so data stays fresh ──
  useEffect(() => {
    const onFocus = () => refreshKeySteps(selectedProjectId);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [selectedProjectId]);

  useEffect(() => { localStorage.setItem("keysteps_searchTerm", searchTerm); }, [searchTerm]);
  useEffect(() => { localStorage.setItem("keysteps_filterStartDate", filterStartDate); }, [filterStartDate]);
  useEffect(() => { localStorage.setItem("keysteps_filterEndDate", filterEndDate); }, [filterEndDate]);

  const toggleExpand = (step: KeyStep) => {
    const id = step.id;
    const wasOpen = expandedStepIds.has(id);
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      if (wasOpen) next.delete(id);
      else next.add(id);
      return next;
    });
    // If opening and tasks not yet loaded for this specific step, load them
    if (!wasOpen && !stepTasks[id] && step.projectId) {
      apiFetch(`/api/tasks/${step.projectId}?status=all`)
        .then((r) => r.json())
        .then((allTasks: any[]) => {
          const filtered = allTasks.filter((t: any) => String(t.keyStepId) === String(id));
          setStepTasks((prev) => ({ ...prev, [id]: filtered }));
          filtered.forEach(async (t: any) => {
            try {
              const sr = await apiFetch(`/api/subtasks/${t.id}`);
              if (sr.ok) {
                const subs = await sr.json();
                setTaskSubtasks((p) => ({ ...p, [t.id]: Array.isArray(subs) ? subs : [] }));
              }
            } catch { /* ignore */ }
          });
        })
        .catch(() => { });
    }
  };

  const addTaskToKeyStep = async (keyStepId: string, projectId: string) => {
    if (!newTaskForm.taskName.trim()) { alert("Task name is required"); return; }
    try {
      const res = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          keyStepId,
          taskName: newTaskForm.taskName.trim(),
          startDate: newTaskForm.startDate || null,
          endDate: newTaskForm.endDate || null,
          status: newTaskForm.status,
          priority: newTaskForm.priority,
          assignerId: user?.employeeId ?? null,
        }),
      });

      if (!res.ok) {
        let errorData: any = {};
        try { errorData = await res.json(); } catch { /* ignore */ }
        throw new Error(errorData.message || (Array.isArray(errorData.details) ? errorData.details.map((d: any) => d.message).join(", ") : errorData.details) || "Failed to add task");
      }

      setNewTaskForm({ taskName: "", startDate: "", endDate: "", status: "Not Started", priority: "medium" });
      setShowTaskFormFor(null);
      const tr = await apiFetch(`/api/tasks/${projectId}`);
      if (tr.ok) {
        const allTasks: any[] = await tr.json();
        const filtered = allTasks.filter((t: any) => String(t.keyStepId) === String(keyStepId));
        setStepTasks((prev) => ({ ...prev, [keyStepId]: filtered }));
      }
      toast({ title: "Task added" });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Failed to add task"
      });
    }
  };

  const addSubtaskToTask = async (taskId: string) => {
    if (!newSubtaskForm.title.trim()) { alert("Subtask title is required"); return; }
    try {
      const res = await apiFetch("/api/subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, title: newSubtaskForm.title.trim(), startDate: newSubtaskForm.startDate || null, endDate: newSubtaskForm.endDate || null, completed: false }),
      });
      if (!res.ok) {
        let errorData: any = {};
        try { errorData = await res.json(); } catch { /* ignore */ }
        throw new Error(errorData.message || (Array.isArray(errorData.details) ? errorData.details.map((d: any) => d.message).join(", ") : errorData.details) || "Failed to add subtask");
      }
      setNewSubtaskForm({ title: "", startDate: "", endDate: "" });
      setShowSubtaskFormFor(null);
      const sr = await apiFetch(`/api/subtasks/${taskId}`);
      if (sr.ok) { const subs = await sr.json(); setTaskSubtasks((prev) => ({ ...prev, [taskId]: Array.isArray(subs) ? subs : [] })); }
      toast({ title: "Subtask added" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message || "Failed to add subtask" });
    }
  };

  const toggleSubtask = async (taskId: string, subtaskId: string, current: boolean) => {
    const newProgress = !current ? 100 : 0;
    setTaskSubtasks((prev) => ({ ...prev, [taskId]: (prev[taskId] || []).map((s: any) => s.id === subtaskId ? { ...s, isCompleted: !current, progress: newProgress } : s) }));
    try {
      await apiFetch(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: newProgress })
      });
      // Refresh parent data as progress propagates
      refreshKeySteps(selectedProjectId);
    } catch {
      setTaskSubtasks((prev) => ({ ...prev, [taskId]: (prev[taskId] || []).map((s: any) => s.id === subtaskId ? { ...s, isCompleted: current } : s) }));
    }
  };

  const updateSubtaskProgress = async (taskId: string, subtaskId: string, value: number) => {
    setTaskSubtasks((prev) => ({ ...prev, [taskId]: (prev[taskId] || []).map((s: any) => s.id === subtaskId ? { ...s, progress: value, isCompleted: value === 100 } : s) }));
    try {
      await apiFetch(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: value })
      });
      // Refresh parent data as progress propagates
      refreshKeySteps(selectedProjectId);
    } catch (err) {
      console.error("Failed to update subtask progress", err);
    }
  };

  const openTaskPage = (taskId: string, projectId: string, keyStepId: string) => {
    localStorage.setItem("tasks_projectId", String(projectId));
    localStorage.setItem("selectedProjectId", String(projectId));
    localStorage.setItem("tasks_keyStepId", String(keyStepId));
    localStorage.setItem("selectedKeyStepId", String(keyStepId));
    localStorage.setItem("tasks_selectedTaskId", String(taskId));
    setLocation(`/tasks?project_id=${encodeURIComponent(projectId)}&keyStepId=${encodeURIComponent(keyStepId)}&taskId=${encodeURIComponent(taskId)}`);
  };

  const openEditPage = (step: KeyStep) => setLocation(`/add-key-step?projectId=${step.projectId}&keyStepId=${step.id}`);

  const handleDeleteStep = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    const prev = keySteps;
    setKeySteps((k) => k.filter((s) => s.id !== id));
    setStepTasks((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const response = await apiFetch(`/api/key-steps/${id}`, { method: "DELETE" });
      if (!response.ok) { const txt = await response.text().catch(() => ""); throw new Error(txt || `Delete failed (${response.status})`); }
      const result = await response.json();
      if (!result.success) throw new Error("Delete did not succeed on server");
      toast({ title: "Deleted", description: "Key step deleted successfully" });
      // Removed 500ms delay and full refresh — the optimistic filter on line 415 is sufficient
    } catch (err: any) {
      setKeySteps(prev);
      toast({ variant: "destructive", title: "Error", description: err?.message || "Failed to delete key step" });
    }
  };

  const KEYSTEP_STATUS_OPTIONS = ["not started", "pending", "in-progress", "completed", "cancelled"];

  // The status column used to be a plain read-only Badge — there was no way to
  // change a key step's status from this page at all. Updates optimistically,
  // then reconciles with the server response.
  const updateStepStatus = async (step: KeyStep, newStatus: KeyStep["status"]) => {
    if (newStatus === step.status) return;
    const prevSteps = keySteps;
    setKeySteps((k) => k.map((s) => (s.id === step.id ? { ...s, status: newStatus } : s)));
    try {
      const res = await apiFetch(`/api/key-steps/${step.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json();
      setKeySteps((k) => k.map((s) => (s.id === step.id ? { ...s, ...updated } : s)));
      toast({ title: "Status updated" });
    } catch (err: any) {
      setKeySteps(prevSteps);
      toast({ variant: "destructive", title: "Couldn't update status", description: err?.message });
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "in-progress") return <Clock className="h-4 w-4 text-blue-500" />;
    return <AlertCircle className="h-4 w-4 text-amber-500" />;
  };

  const getStatusBadgeClass = (status: string) => {
    const s = String(status).toLowerCase();
    if (s === "completed") return "bg-green-100 text-green-800 border-green-200";
    if (s === "in-progress" || s === "in progress") return "bg-blue-100 text-blue-800 border-blue-200";
    if (s === "cancelled" || s === "canceled") return "bg-red-100 text-red-800 border-red-200";
    if (s === "not started") return "bg-slate-100 text-slate-600 border-slate-200";
    return "bg-amber-100 text-amber-800 border-amber-200";
  };

  const computeTaskProgress = (task: any, subs: any[]) => {
    if (typeof task.progress === "number" && task.progress >= 0) return task.progress;
    if (!subs || subs.length === 0) return 0;
    const completedCount = subs.filter((sub: any) => sub.isCompleted || Number(sub.progress) === 100).length;
    return Math.round((completedCount / subs.length) * 100);
  };

  const getTaskStatusColor = (status: string) => {
    const s = String(status).toLowerCase();
    if (s === "completed") return "bg-green-100 text-green-800 border-green-200";
    if (s === "in progress") return "bg-blue-100 text-blue-800 border-blue-200";
    if (s === "on hold") return "bg-amber-100 text-amber-800 border-amber-200";
    if (s === "cancelled" || s === "canceled") return "bg-red-100 text-red-800 border-red-200";
    if (s === "not started") return "bg-slate-100 text-slate-600 border-slate-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
  };

  const normalizeDept = (val: any) => {
    let v = String(val || "").trim().toLowerCase();
    if (v.length > 3 && v.endsWith("s")) v = v.slice(0, -1);
    return v;
  };

  // When the Freeze selection narrows down to a single Task, resolve which
  // Key Step it belongs to so this page can still show that Key Step. Fetched
  // lazily and only once — purely additive, doesn't touch any other state.
  const [frozenTaskKeyStepId, setFrozenTaskKeyStepId] = useState<string | null>(null);
  useEffect(() => {
    if (!isItemFrozen || !frozenItem || frozenItem.type !== "task") {
      setFrozenTaskKeyStepId(null);
      return;
    }
    apiFetch("/api/tasks/bulk?status=all")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        const match = list.find((t: any) => String(t.id) === String(frozenItem.id));
        setFrozenTaskKeyStepId(match?.keyStepId ? String(match.keyStepId) : null);
      })
      .catch(() => setFrozenTaskKeyStepId(null));
  }, [isItemFrozen, frozenItem]);

  const sortedKeySteps = useMemo(() => keySteps.slice().sort((a, b) => {
    const aHasOrder = a.sortOrder !== null && a.sortOrder !== undefined;
    const bHasOrder = b.sortOrder !== null && b.sortOrder !== undefined;
    if (aHasOrder && bHasOrder) return (a.sortOrder as number) - (b.sortOrder as number);
    if (aHasOrder) return -1;
    if (bHasOrder) return 1;
    return Number(a.phase) - Number(b.phase) || a.title.localeCompare(b.title);
  }), [keySteps]);

  const filteredKeySteps = useMemo(() => sortedKeySteps.filter((step) => {
    // 1. Search (Title, Header)
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const matchTitle = (step.title || "").toLowerCase().includes(s);
      const matchHeader = (step.header || "").toLowerCase().includes(s);
      if (!matchTitle && !matchHeader) return false;
    }

    // 2. Status Filter
    if (statusFilter !== "all" && String(step.status || "").toLowerCase() !== statusFilter.toLowerCase()) return false;

    // 3. Client Filter
    if (clientFilter !== "all") {
      const project = projects.find((proj) => String(proj.id) === String(step.projectId));
      const clientValue = String(project?.clientName || project?.company || "").toLowerCase();
      if (clientValue !== clientFilter.toLowerCase()) return false;
    }

    // 4. Date Filters
    if (filterStartDate && step.startDate && step.startDate < filterStartDate) return false;
    if (filterEndDate && step.endDate && step.endDate > filterEndDate) return false;

    // 5. Overdue Filter
    if (overdueFilter !== "all") {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = step.endDate ? new Date(step.endDate) : null;
      const isCompletedStatus = String(step.status || "").toLowerCase() === "completed";
      const isOverdue = !!(end && end < today && !isCompletedStatus);
      if (overdueFilter === "overdue" && !isOverdue) return false;
    }

    // 6. Completed key steps are ALWAYS shown (with their Completed status/badge),
    // regardless of whether they were completed from the Freeze view or the
    // Project page — this list must never make a completed step disappear.

    // 7. Cancelled Filter
    if (String(step.status || "").toLowerCase() === "cancelled" && statusFilter !== "cancelled") return false;

    // 4. Custom Filters
    const matchesCustom = customFilters.every(f => {
      if (!f.value) return true;
      const val = step[f.field as keyof typeof step];
      const target = f.value.toLowerCase();
      const actual = String(val || "").toLowerCase();

      switch (f.operator) {
        case "==": return actual === target;
        case "!=": return actual !== target;
        case "contains": return actual.includes(target);
        case ">": return Number(actual) > Number(target);
        case "<": return Number(actual) < Number(target);
        default: return true;
      }
    });

    if (!matchesCustom) return false;

    // Global Freeze: when a project is frozen, scope everything to it on
    // top of whatever the existing filters already narrowed down to.
    if (isFrozen && frozenProjectId != null && String(step.projectId) !== String(frozenProjectId)) return false;

    // Optional further narrowing to one selected Key Step (or the parent of
    // a selected Task, once resolved).
    if (isItemFrozen && frozenItem) {
      if (frozenItem.type === "keystep" && String(step.id) !== String(frozenItem.id)) return false;
      if (frozenItem.type === "task" && frozenTaskKeyStepId && String(step.id) !== String(frozenTaskKeyStepId)) return false;
    }

    return true;
  }), [sortedKeySteps, searchTerm, filterStartDate, filterEndDate, statusFilter, customFilters, clientFilter, projects, overdueFilter, isFrozen, frozenProjectId, isItemFrozen, frozenItem, frozenTaskKeyStepId]);

  const processedKeySteps = useMemo(() => {
    return filteredKeySteps.map(step => {
      const p = projects.find(proj => String(proj.id) === String(step.projectId));
      const isProjectAssigned = p && ((p.team && p.team.some((tid: string) => String(tid) === employeeFilter)) || String(p.createdByEmployeeId) === employeeFilter);

      const taskList = stepTasks[step.id] || [];
      const hasAssignedTask = taskList.some((t: any) =>
        (t.taskMembers && t.taskMembers.some((mId: string) => String(mId) === employeeFilter)) ||
        String(t.assignerId) === employeeFilter
      );
      const isAssigned = employeeFilter !== "all" && (isProjectAssigned || hasAssignedTask);

      const emp = employees.find(e => String(e.id) === employeeFilter);
      const empDept = emp ? normalizeDept(emp.department) : "";
      // Wait, step doesn't directly have department in schema, but it might have it dynamically
      const stepDepts = (step as any).department ? (Array.isArray((step as any).department) ? (step as any).department : [(step as any).department]) : [];
      const projDepts = p && p.department ? (Array.isArray(p.department) ? p.department : [p.department]) : [];
      const allDepts = [...stepDepts, ...projDepts].map(d => normalizeDept(String(d)));
      const isDeptRelated = employeeFilter !== "all" && empDept && allDepts.some(d => d === empDept);

      return {
        ...step,
        _group: employeeFilter === "all" ? "none" : (isAssigned ? "assigned" : (isDeptRelated ? "dept" : "none"))
      };
    });
  }, [filteredKeySteps, employeeFilter, projects, stepTasks, employees]);

  const sortedProcessedKeySteps = useMemo(() => {
    if (employeeFilter === "all") return processedKeySteps;

    // Only keep assigned or department related key steps when employee filter is selected
    const activeSteps = processedKeySteps.filter(ks => ks._group === "assigned" || ks._group === "dept");

    return [...activeSteps].sort((a, b) => {
      const rank = { assigned: 1, dept: 2, none: 3 };
      const ra = rank[a._group as keyof typeof rank] || 3;
      const rb = rank[b._group as keyof typeof rank] || 3;
      if (ra !== rb) return ra - rb;
      return Number(a.phase) - Number(b.phase) || a.title.localeCompare(b.title);
    });
  }, [processedKeySteps, employeeFilter]);

  const allSelected = sortedProcessedKeySteps.length > 0 && selectedKeystepIds.length === sortedProcessedKeySteps.length;
  const toggleSelectAll = (checked: boolean) => { if (checked) setSelectedKeystepIds(sortedProcessedKeySteps.map((k) => k.id)); else setSelectedKeystepIds([]); };
  const toggleOne = (id: string, checked: boolean) => setSelectedKeystepIds((prev) => checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id));

  // Drag & drop reordering persists a sort_order value on each key step, so
  // it works correctly whether you're viewing "All Projects" or a single
  // project. It's still disabled while filters/employee-grouping are active,
  // since the visible order in that case doesn't represent the full list.
  const canReorder = !hasActiveFilters && employeeFilter === "all";

  const handleStepDragStart = (e: any, stepId: string) => {
    if (!canReorder) return;
    setDraggedStepId(stepId);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", stepId); } catch { /* ignore */ }
  };

  const handleStepDragOver = (e: any, stepId: string) => {
    if (!canReorder || !draggedStepId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStepId !== stepId) setDragOverStepId(stepId);
  };

  const handleStepDragEnd = () => {
    setDraggedStepId(null);
    setDragOverStepId(null);
  };

  const handleStepDrop = async (e: any, targetStepId: string) => {
    if (!canReorder) return;
    e.preventDefault();
    const sourceId = draggedStepId;
    setDraggedStepId(null);
    setDragOverStepId(null);
    if (!sourceId || sourceId === targetStepId) return;

    const currentOrder = sortedKeySteps.map((s) => s.id);
    const fromIdx = currentOrder.indexOf(sourceId);
    const toIdx = currentOrder.indexOf(targetStepId);
    if (fromIdx === -1 || toIdx === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, sourceId);

    // Optimistic UI update so the reorder feels instant
    setKeySteps((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]));
      return newOrder.map((id, idx) => ({ ...(byId.get(id) as KeyStep), sortOrder: idx }));
    });

    try {
      const r = await apiFetch("/api/key-steps/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: newOrder }),
      });
      if (!r.ok) throw new Error(`Reorder failed (${r.status})`);
    } catch (err) {
      console.error("Failed to save key step order:", err);
      // Revert to server truth on failure
      refreshKeySteps(selectedProjectId);
    }
  };

  const resetQuickTitles = (count = 5) => setQuickTitles(Array.from({ length: count }).map(() => ""));
  const updateQuickTitle = (idx: number, value: string) => setQuickTitles((prev) => prev.map((t, i) => (i === idx ? value : t)));
  const addQuickTitleRow = () => setQuickTitles((prev) => [...prev, ""]);
  const removeQuickTitleRow = (idx: number) => setQuickTitles((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const quickAdd = async () => {
    if (!selectedProjectId) { toast({ variant: "destructive", title: "Select a project" }); return; }
    const titles = quickTitles.map((t) => t.trim()).filter(Boolean);
    if (titles.length === 0) return;
    try {
      const today = isoDateOnly(new Date());
      const responses = await Promise.all(titles.map((title) => apiFetch("/api/key-steps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: selectedProjectId, title, status: "pending", header: "", description: "", requirements: "", startDate: today, endDate: today, parentKeyStepId: null }) })));
      if (responses.some((r) => !r.ok)) throw new Error("Some key steps failed to create.");
      toast({ title: "Added", description: `Created ${titles.length} key step${titles.length > 1 ? "s" : ""}.` });
      resetQuickTitles(5);
      setQuickAddOpen(false);
      await refreshKeySteps(selectedProjectId);
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e?.message }); }
  };

  const doClone = async () => {
    if (!cloneKeystep) return;
    try {
      const resp = await apiFetch(`/api/key-steps/${cloneKeystep.id}/clone`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newTitle: cloneTitle || cloneKeystep.title }) });
      if (!resp.ok) { const t = await resp.text().catch(() => ""); throw new Error(t || `Clone failed (${resp.status})`); }
      toast({ title: "Cloned" });
      setCloneOpen(false); setCloneTitle(""); setCloneKeystep(null);
      await refreshKeySteps(selectedProjectId);
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e?.message }); }
  };

  // Save a single KeyStep (+ its tasks & subtasks) as a rich template
  const saveStepAsTemplate = async () => {
    if (!saveTemplateStep || !saveTemplateName.trim()) {
      toast({ variant: "destructive", title: "Template name is required" });
      return;
    }
    setSavingTemplate(true);
    try {
      const sourceProject = projects.find((p: any) => String(p.id) === String(saveTemplateStep.projectId));
      const resp = await apiFetch("/api/keystep-templates/from-keystep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyStepId: saveTemplateStep.id,
          templateName: saveTemplateName.trim(),
          sourceProjectName: sourceProject?.title || "",
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save template");
      }

      const saved = await resp.json();
      toast({ title: "Template saved!", description: `"${saveTemplateName}" saved with ${saved.taskCount} tasks.` });
      setSaveTemplateStep(null);
      setSaveTemplateName("");
      loadTemplateList(); // Refresh the list so it's ready for the "Apply" modal
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message });
    } finally {
      setSavingTemplate(false);
    }
  };

  // Load the full template list (lazy — only when Use Template modal opens)
  const loadTemplateList = async () => {
    setTemplateListLoading(true);
    try {
      const r = await apiFetch("/api/keystep-templates/list-full");
      if (r.ok) setTemplateList(await r.json());
    } catch { /* ignore */ } finally {
      setTemplateListLoading(false);
    }
  };

  // Apply selected template to current project (deep clone)
  const applyFullTemplate = async () => {
    if (!selectedTemplateId || !selectedProjectId) return;
    setApplyingTemplate(true);
    try {
      const r = await apiFetch(`/api/keystep-templates/${selectedTemplateId}/apply-full`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Apply failed"); }
      const result = await r.json();
      toast({
        title: "Template applied!",
        description: `Created KeyStep with ${result.tasks?.length ?? 0} tasks and ${result.subtasks?.length ?? 0} subtasks.`,
      });
      // Update local state immediately for a "fast" feel
      if (result.keystep) {
        setKeySteps(prev => [result.keystep, ...prev]);
        if (result.tasks) {
          setStepTasks(prev => ({ ...prev, [result.keystep.id]: result.tasks }));
        }
      }
      setUseTemplateOpen(false);
      setSelectedTemplateId("");

      // Still refresh in background to ensure everything is in sync, but don't await it
      refreshKeySteps(selectedProjectId);
      prefetchTasksForProject(selectedProjectId);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message });
    } finally {
      setApplyingTemplate(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Key Steps</h1>
          <p className="text-muted-foreground mt-1">Manage project phases and key steps effectively.</p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3 mb-4 bg-white p-4 rounded-lg border">
          <div className="min-w-[200px]">
            <p className="text-xs text-muted-foreground mb-1 font-medium">Project</p>
            <Select value={selectedProjectId || "all"} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All Projects" /></SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                <div className="px-2 py-1.5 sticky top-0 bg-white z-10">
                  <input type="text" placeholder="Search projects..." value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.filter((p: any) => !projectSearch || (p.title || "").toLowerCase().includes(projectSearch.toLowerCase())).map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1" />
          <Button
            variant="outline"
            className="h-9 border-violet-300 text-violet-700 hover:bg-violet-50"
            onClick={() => { setUseTemplateOpen(true); loadTemplateList(); }}
            disabled={!selectedProjectId}
            title="Apply a saved template to this project"
          >
            <Library className="mr-1.5 h-4 w-4" /> Use Template
          </Button>
          <Button
            onClick={() => {
              const target = (selectedProjectId && selectedProjectId !== "all")
                ? `/add-key-step?projectId=${selectedProjectId}`
                : "/add-key-step";
              setLocation(target);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9"
          >
            <Plus className="mr-2 h-4 w-4" /> New Key Step
          </Button>
          <Button
            variant={quickAddOpen ? "secondary" : "outline"}
            className="h-9"
            onClick={() => setQuickAddOpen((prev) => !prev)}
            disabled={!selectedProjectId}
          >
            <Plus className="mr-2 h-4 w-4" /> Quick Add
          </Button>
        </div>

        {quickAddOpen && (
          <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Quick Add Key Steps</p>
                <p className="text-xs text-slate-500">Bulk-create titles for the selected project without leaving the page.</p>
              </div>
              <Button variant="outline" size="sm" onClick={addQuickTitleRow}>Add row</Button>
            </div>
            <div className="space-y-3">
              {quickTitles.map((title, idx) => (
                <div key={idx} className="flex flex-wrap gap-2 items-center">
                  <Input
                    className="flex-1 min-w-[220px]"
                    placeholder={`Key Step ${idx + 1}`}
                    value={title}
                    onChange={(e) => updateQuickTitle(idx, e.target.value)}
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeQuickTitleRow(idx)} disabled={quickTitles.length <= 1}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => resetQuickTitles(5)}>Reset</Button>
              <Button size="sm" onClick={quickAdd} disabled={!selectedProjectId}>
                Create {quickTitles.filter(Boolean).length || "steps"}
              </Button>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search key steps..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200 focus:bg-white transition-all duration-200 rounded-lg h-10"
            />
          </div>

          <KeyStepFilters
            projectId={selectedProjectId}
            setProjectId={setSelectedProjectId}
            projects={projects}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            clientFilter={clientFilter}
            setClientFilter={setClientFilter}
            clients={clients}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            searchQuery={searchTerm}
            setSearchQuery={setSearchTerm}
            startDateFilter={filterStartDate}
            setStartDateFilter={setFilterStartDate}
            endDateFilter={filterEndDate}
            setEndDateFilter={setFilterEndDate}
            customFilters={customFilters}
            setCustomFilters={setCustomFilters}
            onClearAll={onClearAllFilters}
            onApply={() => refreshKeySteps(selectedProjectId)}
            savedFilterSets={savedFilterSets}
            setSavedFilterSets={setSavedFilterSets}
            employeeFilter={employeeFilter}
            setEmployeeFilter={setEmployeeFilter}
            employees={employees}
          />

          <ManageColumns columns={columnsConfig} setColumns={setColumnsConfig} defaultColumns={defaultKeyStepColumns} />

          <Button
            onClick={() => setOverdueFilter(prev => prev === "overdue" ? "all" : "overdue")}
            className={cn(
              "h-9 px-3 min-w-[100px] justify-center text-xs flex items-center gap-2 shadow-sm transition-all duration-150 hover:shadow-md",
              overdueFilter === "overdue" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            Overdue
          </Button>

          <Button
            onClick={() => setStatusFilter(prev => prev === "completed" ? "all" : "completed")}
            className={cn(
              "h-9 px-3 min-w-[100px] justify-center text-xs flex items-center gap-2 shadow-sm transition-all duration-150 hover:shadow-md",
              statusFilter === "completed" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            Completed
          </Button>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAllFilters}
              className="text-slate-500 hover:text-red-600 hover:bg-red-50 h-10 px-3"
            >
              Clear all
            </Button>
          )}
        </div>

        {hasActiveFilters && <p className="text-sm text-muted-foreground mb-2">Showing {sortedProcessedKeySteps.length} of {sortedKeySteps.length} key steps</p>}
        {!canReorder && sortedProcessedKeySteps.length > 1 && (
          <p className="text-xs text-muted-foreground mb-2 italic">Clear filters to enable drag-to-reorder for key steps.</p>
        )}

        {/* Clone Modal */}
        {cloneOpen && cloneKeystep && (
          <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30">
            <div className="bg-white rounded-lg p-6 w-96 shadow-lg">
              <h2 className="text-lg font-bold mb-4">Clone Keystep</h2>
              <input className="w-full border rounded p-2 mb-4" placeholder="New keystep title" value={cloneTitle} onChange={(e) => setCloneTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doClone(); }} />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setCloneOpen(false)}>Cancel</Button>
                <Button variant="default" size="sm" onClick={doClone}>Clone</Button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div key={selectedProjectId} className="overflow-x-auto bg-white rounded-lg border shadow-sm">
          {sortedProcessedKeySteps.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-1 py-3 w-6" title={canReorder ? "Drag to reorder" : "Clear filters to reorder"} />
                  <th className="px-2 py-3 w-8" />
                  <th className="px-3 py-3 w-8"><input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} className="rounded" /></th>
                  {isColVisible("title") && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Title</th>}
                  {isColVisible("project") && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: "1%" }}>Project</th>}
                  {isColVisible("startDate") && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: "1%" }}>Start Date</th>}
                  {isColVisible("endDate") && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: "1%" }}>End Date</th>}
                  {isColVisible("progress") && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: "1%" }}>Progress</th>}
                  {isColVisible("status") && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: "1%" }}>Status</th>}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: "1%" }}>Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {(() => {
                  let lastGroup: string | null = null;
                  return sortedProcessedKeySteps.map((step) => {
                    const isExpanded = expandedStepIds.has(step.id);
                    const stepTasksForStep = stepTasks[step.id] || [];
                    const tasks = stepTasksForStep.filter((t) => priorityFilter === "all" || String(t.priority || "medium").toLowerCase() === priorityFilter.toLowerCase());

                    let groupHeaderRow = null;
                    if (employeeFilter !== "all" && step._group !== lastGroup) {
                      lastGroup = step._group;
                      const selectedEmployeeObj = employees.find(e => String(e.id) === employeeFilter);
                      const employeeName = selectedEmployeeObj ? selectedEmployeeObj.name : "";
                      if (step._group === "assigned") {
                        groupHeaderRow = (
                          <tr className="bg-blue-50/40">
                            <td colSpan={10} className="px-4 py-2 text-[11px] font-bold text-blue-600 uppercase tracking-wider border-y border-blue-100">
                              <div className="flex items-center gap-2">
                                <span>Assigned to {employeeName}</span>
                                <Badge className="bg-blue-600 hover:bg-blue-700 text-[10px] font-bold h-4 px-1.5 flex items-center justify-center rounded">
                                  {sortedProcessedKeySteps.filter(s => s._group === "assigned").length}
                                </Badge>
                              </div>
                            </td>
                          </tr>
                        );
                      } else if (step._group === "dept") {
                        groupHeaderRow = (
                          <tr className="bg-slate-50">
                            <td colSpan={10} className="px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-y border-slate-200">
                              <div className="flex items-center gap-2">
                                <span>Department Related</span>
                                <Badge variant="secondary" className="text-[10px] font-bold h-4 px-1.5 flex items-center justify-center rounded">
                                  {sortedProcessedKeySteps.filter(s => s._group === "dept").length}
                                </Badge>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                    }

                    return (
                      <Fragment key={step.id}>
                        {groupHeaderRow}
                        {/* KEY STEP ROW */}
                        <tr
                          className={`hover:bg-slate-50 transition-colors ${draggedStepId === step.id ? "opacity-40" : ""} ${dragOverStepId === step.id && draggedStepId && draggedStepId !== step.id ? "border-t-2 border-primary" : ""}`}
                          onDragOver={(e) => handleStepDragOver(e, step.id)}
                          onDrop={(e) => handleStepDrop(e, step.id)}
                          onDragEnd={handleStepDragEnd}
                        >
                          <td className="px-1 py-3 w-6">
                            {canReorder && (
                              <div
                                draggable
                                onDragStart={(e) => handleStepDragStart(e, step.id)}
                                onDragEnd={handleStepDragEnd}
                                className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors flex items-center justify-center"
                                title="Drag to reorder"
                              >
                                <GripVertical className="h-4 w-4" />
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-3 w-8">
                            <button onClick={() => toggleExpand(step)} className="rounded p-0.5 hover:bg-slate-200 transition-colors text-slate-500" title={isExpanded ? "Hide details" : "Show details"}>
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="px-3 py-3 w-8"><input type="checkbox" className="rounded" checked={selectedKeystepIds.includes(step.id)} onChange={(e) => toggleOne(step.id, e.target.checked)} onClick={(e) => e.stopPropagation()} /></td>
                          {isColVisible("title") && (
                            <td
                              className="px-4 py-3 font-medium cursor-pointer"
                              onClick={() => {
                                // NOTE: Tasks.tsx reads its project/key-step filter from the
                                // "tasks_projectId" / "tasks_keyStepId" localStorage keys (or
                                // the project_id/keyStepId URL params) — NOT "selectedProjectId"
                                // / "selectedKeyStepId". Setting the wrong keys here meant a
                                // click always landed on the Tasks page with no filter applied,
                                // showing every task instead of just this key step's tasks.
                                localStorage.setItem("tasks_projectId", String(step.projectId));
                                localStorage.setItem("selectedProjectId", String(step.projectId));
                                localStorage.setItem("tasks_keyStepId", String(step.id));
                                setLocation(`/tasks?project_id=${encodeURIComponent(String(step.projectId))}&keyStepId=${encodeURIComponent(String(step.id))}`);
                              }}
                            >
                              <div className="flex items-center gap-2">
                                {getStatusIcon(step.status)}
                                <div className="flex flex-col">
                                  {step.header && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-[10px] text-blue-500 font-bold uppercase tracking-wider mb-0.5 truncate max-w-[200px] cursor-default">
                                          {step.header}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{step.header}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="hover:text-primary hover:underline underline-offset-2 transition-colors whitespace-nowrap truncate max-w-[300px] cursor-default">
                                        {step.title}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{step.title}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </td>
                          )}
                          {isColVisible("project") && (
                            <td className="px-4 py-3 text-sm">
                              <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 font-medium text-[11px] whitespace-nowrap">
                                {projects.find(p => String(p.id) === String(step.projectId))?.title || "Unknown Project"}
                              </span>
                            </td>
                          )}
                          {isColVisible("startDate") && <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDate(step.startDate)}</td>}
                          {isColVisible("endDate") && <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDate(step.endDate)}</td>}
                          {isColVisible("progress") && (
                            <td className="px-4 py-3 min-w-[120px]">
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center text-[10px] text-muted-foreground font-medium">
                                  <span>{step.progress || 0}%</span>
                                </div>
                                <Progress value={step.progress || 0} className="h-1.5" />
                              </div>
                            </td>
                          )}
                          {isColVisible("status") && (
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <Select value={step.status} onValueChange={(v) => updateStepStatus(step, v as KeyStep["status"])}>
                                <SelectTrigger className={`h-8 w-32 text-xs font-medium capitalize ${getStatusBadgeClass(step.status)}`}>
                                  <SelectValue>
                                    {step.status ? String(step.status).replace("-", " ") : "Select status"}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {KEYSTEP_STATUS_OPTIONS.map((s) => (
                                    <SelectItem key={s} value={s} className="capitalize">{s.replace("-", " ")}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={(e) => { e.stopPropagation(); openEditPage(step); }} title="Edit"><Edit className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={(e) => { e.stopPropagation(); setCloneOpen(true); setCloneKeystep(step); setCloneTitle(`${step.title} (Copy)`); }} title="Clone"><Copy className="h-4 w-4" /></Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                                title="Save as Template (includes tasks & subtasks)"
                                onClick={(e) => { e.stopPropagation(); setSaveTemplateStep(step); setSaveTemplateName(step.title); }}
                              ><Bookmark className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleDeleteStep(step.id, step.title); }} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </td>
                        </tr>

                        {/* EXPANDED PANEL */}
                        {isExpanded && (
                          <tr className="bg-blue-50/30 border-t border-blue-100">
                            <td colSpan={10} className="px-0 py-0">
                              {/* Metadata strip */}
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-8 py-3 border-b border-blue-100 bg-indigo-50/50">
                                <div><p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Status</p><span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize ${getStatusBadgeClass(step.status)}`}>{step.status.replace("-", " ")}</span></div>
                                <div><p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Duration</p><p className="text-sm">{fmtDate(step.startDate)} → {fmtDate(step.endDate)}</p></div>
                              </div>

                              {/* Tasks section */}
                              <div className="px-8 py-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
                                  <div className="flex items-center gap-2 text-sm font-bold text-blue-700">
                                    <ListTodo size={15} /> Tasks ({tasks.length})
                                  </div>
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                                    <Input
                                      value={taskSearch}
                                      onChange={(e) => setTaskSearch(e.target.value)}
                                      placeholder="Search tasks..."
                                      className="h-9 w-full sm:w-80"
                                    />
                                    <button
                                      onClick={() => { setShowTaskFormFor(showTaskFormFor === step.id ? null : step.id); setNewTaskForm({ taskName: "", startDate: "", endDate: "", status: "Not Started", priority: "medium" }); }}
                                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-2 py-1 bg-white"
                                    >
                                      <Plus size={11} /> Add Task
                                    </button>
                                  </div>
                                </div>

                                {/* Add Task form */}
                                {showTaskFormFor === step.id && (
                                  <div className="flex flex-wrap gap-2 items-center bg-white border border-blue-200 rounded-lg px-3 py-2 mb-3">
                                    <input placeholder="Task name *" className="border rounded px-2 py-1 text-xs flex-1 min-w-[160px]" value={newTaskForm.taskName} onChange={(e) => setNewTaskForm((p) => ({ ...p, taskName: e.target.value }))} />
                                    <input type="date" className="border rounded px-2 py-1 text-xs" value={newTaskForm.startDate} onChange={(e) => { const newStartDate = e.target.value; setNewTaskForm((p) => ({ ...p, startDate: newStartDate, endDate: p.endDate && newStartDate && p.endDate < newStartDate ? newStartDate : p.endDate })); }} />
                                    <input type="date" className="border rounded px-2 py-1 text-xs" min={newTaskForm.startDate || undefined} value={newTaskForm.endDate} onChange={(e) => { const newEndDate = e.target.value; setNewTaskForm((p) => ({ ...p, endDate: p.startDate && newEndDate && newEndDate < p.startDate ? p.startDate : newEndDate })); }} />
                                    <select className="border rounded px-2 py-1 text-xs" value={newTaskForm.priority} onChange={(e) => setNewTaskForm((p) => ({ ...p, priority: e.target.value }))}>
                                      <option value="low">Low</option>
                                      <option value="medium">Medium</option>
                                      <option value="high">High</option>
                                    </select>
                                    <button onClick={() => addTaskToKeyStep(step.id, step.projectId)} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold">Save</button>
                                    <button onClick={() => setShowTaskFormFor(null)} className="text-xs text-slate-500 underline">Cancel</button>
                                  </div>
                                )}

                                {tasks.length === 0 && showTaskFormFor !== step.id && (
                                  <p className="text-sm text-slate-400 italic py-2">No tasks linked to this key step. Click "+ Add Task" to add one.</p>
                                )}

                                {/* Task cards */}
                                <div className="space-y-2">
                                  {tasks
                                    .filter((task: any) => !taskSearch || String(task.taskName || "").toLowerCase().includes(taskSearch.toLowerCase()))
                                    .map((task: any) => {
                                      const taskKey = `${step.id}-${task.id}`;
                                      const isTaskExpanded = expandedTaskIds.has(taskKey);
                                      const subs = taskSubtasks[task.id] || [];
                                      const memberNames = (task.taskMembers || task.assignedMembers || [])
                                        .map((id: string) => employees.find((e: any) => String(e.id) === String(id))?.name || id)
                                        .filter(Boolean);

                                      return (
                                        <div key={task.id} className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
                                          <div className="flex items-center gap-3 px-3 py-2.5">
                                            <button
                                              onClick={() => {
                                                const expanding = !isTaskExpanded;
                                                setExpandedTaskIds((prev) => { const next = new Set(prev); if (expanding) next.add(taskKey); else next.delete(taskKey); return next; });
                                                if (expanding && taskSubtasks[task.id] === undefined) {
                                                  apiFetch(`/api/subtasks/${task.id}`).then((r) => r.json()).then((s) => setTaskSubtasks((p) => ({ ...p, [task.id]: Array.isArray(s) ? s : [] }))).catch(() => { });
                                                }
                                              }}
                                              className="text-slate-400 hover:text-slate-600 flex-shrink-0"
                                            >
                                              {isTaskExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <button
                                                    type="button"
                                                    className="text-left text-sm font-semibold text-slate-800 truncate cursor-pointer"
                                                    onClick={() => openTaskPage(task.id, step.projectId, step.id)}
                                                  >
                                                    {task.taskName}
                                                  </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>{task.taskName}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                              {memberNames.length > 0 && <p className="text-xs text-slate-400">{memberNames.join(", ")}</p>}
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border flex-shrink-0 ${getTaskStatusColor(task.status)}`}>{task.status || "—"}</span>
                                            <div className="w-24 flex-shrink-0 hidden md:block">
                                              <div className="flex justify-between items-center text-[9px] text-muted-foreground mb-0.5">
                                                <span>Progress</span>
                                                <span>{task.progress || 0}%</span>
                                              </div>
                                              <Progress value={task.progress || 0} className="h-1 shadow-sm" />
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${task.priority === "high" ? "bg-red-100 text-red-700" : task.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>{task.priority || "medium"}</span>
                                            <span className="text-xs text-slate-400 flex-shrink-0">{fmtDate(task.startDate)} → {fmtDate(task.endDate)}</span>
                                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">{subs.length} sub</span>
                                            <button
                                              onClick={() => { setShowSubtaskFormFor(showSubtaskFormFor === task.id ? null : task.id); setNewSubtaskForm({ title: "", startDate: "", endDate: "" }); if (!isTaskExpanded) { setExpandedTaskIds((prev) => { const next = new Set(prev); next.add(taskKey); return next; }); } }}
                                              className="text-xs text-emerald-600 border border-emerald-200 rounded px-1.5 py-0.5 hover:bg-emerald-50 flex-shrink-0"
                                            >+ Sub</button>
                                          </div>

                                          {/* Subtasks panel */}
                                          {isTaskExpanded && (
                                            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 space-y-1">
                                              {showSubtaskFormFor === task.id && (
                                                <div className="flex flex-wrap gap-2 items-center bg-white border border-emerald-200 rounded-lg px-3 py-2 mb-2">
                                                  <input placeholder="Subtask title *" className="border rounded px-2 py-1 text-xs flex-1 min-w-[160px]" value={newSubtaskForm.title} onChange={(e) => setNewSubtaskForm((p) => ({ ...p, title: e.target.value }))} />
                                                  <input type="date" className="border rounded px-2 py-1 text-xs" value={newSubtaskForm.startDate} onChange={(e) => { const newStartDate = e.target.value; setNewSubtaskForm((p) => ({ ...p, startDate: newStartDate, endDate: p.endDate && newStartDate && p.endDate < newStartDate ? newStartDate : p.endDate })); }} />
                                                  <input type="date" className="border rounded px-2 py-1 text-xs" min={newSubtaskForm.startDate || undefined} value={newSubtaskForm.endDate} onChange={(e) => { const newEndDate = e.target.value; setNewSubtaskForm((p) => ({ ...p, endDate: p.startDate && newEndDate && newEndDate < p.startDate ? p.startDate : newEndDate })); }} />
                                                  <button onClick={() => addSubtaskToTask(task.id)} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-semibold">Save</button>
                                                  <button onClick={() => setShowSubtaskFormFor(null)} className="text-xs text-slate-500 underline">Cancel</button>
                                                </div>
                                              )}
                                              {subs.length === 0 && showSubtaskFormFor !== task.id && (
                                                <p className="text-xs text-slate-400 italic py-1 pl-2">No subtasks yet.</p>
                                              )}
                                              {subs.map((sub: any) => (
                                                <div key={sub.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-100">
                                                  <button onClick={() => toggleSubtask(task.id, sub.id, !!sub.isCompleted)} className={sub.isCompleted ? "text-green-500" : "text-slate-300 hover:text-slate-500"}>
                                                    {sub.isCompleted ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                                                  </button>
                                                  <span className={`text-sm flex-1 ${sub.isCompleted ? "line-through text-slate-400" : "text-slate-700"}`}>{sub.title}</span>

                                                  <div className="flex items-center gap-2 w-32 shrink-0">
                                                    <input
                                                      type="range"
                                                      min="0"
                                                      max="100"
                                                      step="1"
                                                      value={sub.progress || 0}
                                                      disabled={sub.isCompleted}
                                                      onChange={(e) => updateSubtaskProgress(task.id, sub.id, parseInt(e.target.value))}
                                                      className={`w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 ${sub.isCompleted ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    />
                                                    <span className="text-[10px] font-mono text-slate-500 min-w-[24px] text-right">{sub.progress || 0}%</span>
                                                  </div>

                                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${sub.isCompleted ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{sub.isCompleted ? "Done" : "Pending"}</span>
                                                  {(sub.startDate || sub.endDate) && <span className="text-xs text-slate-400">{fmtDate(sub.startDate)} → {fmtDate(sub.endDate)}</span>}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              {hasActiveFilters ? (
                <div>
                  <p className="text-base font-medium mb-1">No key steps match your filters</p>
                  <p className="text-sm mb-3">Try adjusting or clearing the filters</p>
                  <Button variant="outline" size="sm" onClick={clearFilters}><X className="h-3.5 w-3.5 mr-1" /> Clear Filters</Button>
                </div>
              ) : (
                <div>
                  {!selectedProjectId ? (
                    <>
                      <p className="text-base font-medium mb-1">No project selected</p>
                      <p className="text-sm">Please select a project to view its KeySteps.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-medium mb-1">No KeySteps for this project</p>
                      <p className="text-sm">Click "New Key Step" to get started.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── SAVE AS TEMPLATE MODAL ─────────────────────────────────────── */}
      {saveTemplateStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Bookmark className="h-5 w-5" />
                <span className="font-bold text-lg">Save as Template</span>
              </div>
              <button onClick={() => { setSaveTemplateStep(null); setSaveTemplateName(""); }} className="text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 text-sm text-violet-800">
                <p className="font-semibold mb-0.5">📋 Saving: <span className="font-bold">{saveTemplateStep.title}</span></p>
                <p className="text-xs text-violet-600">All tasks and subtasks linked to this KeyStep will be included.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Template Name *</label>
                <input
                  autoFocus
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="e.g. Standard Onboarding Flow"
                  value={saveTemplateName}
                  onChange={(e) => setSaveTemplateName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveStepAsTemplate(); }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSaveTemplateStep(null); setSaveTemplateName(""); }}>Cancel</Button>
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                disabled={savingTemplate || !saveTemplateName.trim()}
                onClick={saveStepAsTemplate}
              >
                {savingTemplate ? (
                  <><span className="animate-spin mr-2 inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Saving…</>
                ) : (
                  <><Save className="h-4 w-4 mr-1.5" />Save Template</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── USE TEMPLATE MODAL ────────────────────────────────────────────── */}
      {useTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 text-white">
                <Library className="h-5 w-5" />
                <span className="font-bold text-lg">Apply a Template</span>
              </div>
              <button onClick={() => { setUseTemplateOpen(false); setSelectedTemplateId(""); }} className="text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search bar */}
            <div className="px-6 pt-4 pb-2 flex-shrink-0 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="Search templates by name or project…"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                />
              </div>
              {!selectedProjectId && (
                <p className="text-xs text-amber-600 mt-2 font-medium">⚠ Please select a project before applying a template.</p>
              )}
            </div>

            {/* Template list — scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {templateListLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <span className="animate-spin w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full mr-3" />
                  Loading templates…
                </div>
              ) : templateList.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No templates saved yet.</p>
                  <p className="text-sm mt-1">Click the <Bookmark className="inline h-3.5 w-3.5 text-violet-500" /> icon on any KeyStep row to save one.</p>
                </div>
              ) : (() => {
                const filtered = templateList.filter(t =>
                  !templateSearch ||
                  t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                  (t.sourceProjectName || "").toLowerCase().includes(templateSearch.toLowerCase())
                );
                return filtered.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">No templates match your search.</p>
                ) : (
                  filtered.map((tpl: any) => {
                    const isSelected = selectedTemplateId === tpl.id;
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => setSelectedTemplateId(isSelected ? "" : tpl.id)}
                        className={`border-2 rounded-xl p-4 cursor-pointer transition-all select-none ${isSelected
                          ? "border-violet-500 bg-violet-50 shadow-md"
                          : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/40"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{tpl.name}</p>
                            {tpl.keystepTitle && tpl.keystepTitle !== tpl.name && (
                              <p className="text-xs text-slate-500 truncate mt-0.5">KeyStep: {tpl.keystepTitle}</p>
                            )}
                          </div>
                          {isSelected && (
                            <span className="flex-shrink-0 bg-violet-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Selected</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-3">
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-medium">
                            📋 {tpl.taskCount} Task{tpl.taskCount !== 1 ? "s" : ""}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-medium">
                            ✅ {tpl.subtaskCount} Subtask{tpl.subtaskCount !== 1 ? "s" : ""}
                          </span>
                          {tpl.sourceProjectName && (
                            <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                              🏗 {tpl.sourceProjectName}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400 ml-auto">
                            {new Date(tpl.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 flex justify-between items-center">
              <p className="text-xs text-slate-500">
                {selectedTemplateId ? "Ready to apply to: " : "Select a template above"}
                {selectedTemplateId && <span className="font-semibold text-violet-700">{projects.find((p: any) => p.id === selectedProjectId)?.title || "selected project"}</span>}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setUseTemplateOpen(false); setSelectedTemplateId(""); }}>Cancel</Button>
                <Button
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                  disabled={!selectedTemplateId || !selectedProjectId || applyingTemplate}
                  onClick={applyFullTemplate}
                >
                  {applyingTemplate ? (
                    <><span className="animate-spin mr-2 inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Applying…</>
                  ) : (
                    <><FolderOpen className="h-4 w-4 mr-1.5" />Apply Template</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}