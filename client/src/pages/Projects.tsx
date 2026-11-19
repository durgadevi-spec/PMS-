import React from "react";
import { useState, useEffect, useMemo } from "react";
import { useFreeze } from "@/context/FreezeContext";
import { useLocation } from "wouter";
import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  Hash,
  Upload,
  Download,
  FileIcon,
  Users,
  X,
  ExternalLink,
  UserPlus,
  Settings2,
  Check,
  Pencil,
  Calendar as CalendarIcon,
  Ticket,
  GanttChartSquare,
  Copy,
  Snowflake,
  Briefcase,
  Layers,
  Code2,
  CircleDot,
  BarChart3,
  Sparkles,
  Sliders,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { SuccessSendModal } from "@/components/SuccessSendModal";
import { SuccessCelebrationModal } from "@/components/SuccessCelebrationModal";
import projectsHeaderPattern from "@/assets/projects-header-pattern.png";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend } from "recharts";
import { ProjectFilters, CustomFilter } from "@/components/ProjectFilters";
import { ManageColumns, ColumnConfig } from "@/components/ManageColumns";
import { ProjectDetailsWithCounts } from "./ProjectDetailsWithCounts";
import { ProjectTimelineDialog } from "@/components/ProjectTimelineDialog";
// Types for keystep/task
type KeyStep = { id: string; projectId: string; status?: string; parentKeyStepId?: string | null };
type Task = {
  id: string;
  projectId: string;
  taskName?: string;
  status?: string;
  priority?: string;
};
import { useAuth } from "@/components/Layout";
import { apiFetch } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";

function ProjectLastWorked({ projectId }: { projectId: string }) {
  const [lastWorked, setLastWorked] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchLast = async () => {
      try {
        const res = await apiFetch(`/api/projects/${projectId}/time-entries`);
        if (!res.ok) return;
        const json = await res.json();
        if (mounted && json?.lastWorkedAt) setLastWorked(json.lastWorkedAt);
      } catch (e) {
        // ignore
      }
    };
    fetchLast();
    return () => { mounted = false; };
  }, [projectId]);

  if (!lastWorked) return null;

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  return <div className="text-xs text-muted-foreground mt-1">Last worked: {formatRelativeDate(lastWorked)}</div>;
}

const formatDisplayDate = (d?: string) => {
  if (!d) return "";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
  } catch {
    return d;
  }
};

// ----------------- COLUMN CONFIGURATION -----------------
// Fields shown in the project row summary. Kept in the same shape as the
// Tasks page's column config so the Manage Columns UI/behavior is identical.
const defaultProjectColumns: ColumnConfig[] = [
  { id: "client", label: "Client", visible: true },
  { id: "startDate", label: "Start Date", visible: true },
  { id: "endDate", label: "End Date", visible: true },
  { id: "status", label: "Status", visible: true },
  { id: "progress", label: "Progress", visible: true },
  { id: "keySteps", label: "Key Steps", visible: true },
  { id: "tasks", label: "Tasks", visible: true },
];

export default function Projects() {
  const { isFrozen, frozenProjectId, freezeProject, clearFreeze } = useFreeze();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.employeeCode === "E0001";
  const userDepartment = user?.department || null;
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  // Safely load array-backed filters from localStorage (handles legacy string values like "all")
  const safeLoadArray = (key: string) => {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return [];
      // Try parse JSON first
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
        if (parsed === "all" || parsed === null) return [];
        if (typeof parsed === "string") return [parsed];
        return [];
      } catch (e) {
        // Not valid JSON (legacy value like "all"), treat special cases
        if (stored === "all") return [];
        return [stored];
      }
    } catch (e) {
      return [];
    }
  };

  const [clientFilter, setClientFilter] = useState<string[]>(() => safeLoadArray("projects_clientFilter"));
  const [employeeFilter, setEmployeeFilter] = useState<string[]>(() => safeLoadArray("projects_employeeFilter"));
  const [priorityFilter, setPriorityFilter] = useState<string>(() => localStorage.getItem("projects_priorityFilter") || "all");
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem("projects_searchTerm") || "");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(() => localStorage.getItem("projects_searchTerm") || "");
  const [statusFilter, setStatusFilter] = useState<string[]>(() => safeLoadArray("projects_statusFilter"));
  const [openDialog, setOpenDialog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedDetailProject, setSelectedDetailProject] = useState<any>(null);
  const [detailActiveTab, setDetailActiveTab] = useState<"overview" | "time" | "files">("overview");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'saveAs'>('create');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // For non-admins, default to "all" so backend filters by department
  // Admins can see truly all projects with "all"
  const [departmentFilter, setDepartmentFilter] = useState<string[]>(() => safeLoadArray("projects_departmentFilter"));
  // Date filters (single visible start/end controls)
  const [startDate, setStartDate] = useState(() => {
    const stored = localStorage.getItem("projects_startDate");
    const legacy = localStorage.getItem("projects_startDateFrom");
    return stored || legacy || "";
  });
  const [endDate, setEndDate] = useState(() => {
    const stored = localStorage.getItem("projects_endDate");
    const legacy = localStorage.getItem("projects_endDateTo");
    return stored || legacy || "";
  });
  const [overdueFilter, setOverdueFilter] = useState<string>(() => localStorage.getItem("projects_overdueFilter") || "all");
  const [showCompleted, setShowCompleted] = useState<boolean>(() => localStorage.getItem("projects_showCompleted") === "true");
  // Manage Columns — mirrors the Tasks page feature
  const [columnsConfig, setColumnsConfig] = useState<ColumnConfig[]>(() => {
    const saved = localStorage.getItem("projects_columnsConfig");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge with defaults so newly added columns still show up for
          // users who saved a config before this column existed.
          const savedIds = new Set(parsed.map((c: ColumnConfig) => c.id));
          const merged = parsed.filter((c: ColumnConfig) => defaultProjectColumns.some(d => d.id === c.id));
          defaultProjectColumns.forEach(d => { if (!savedIds.has(d.id)) merged.push(d); });
          return merged;
        }
      } catch { /* fall through to defaults */ }
    }
    return defaultProjectColumns;
  });

  useEffect(() => {
    localStorage.setItem("projects_columnsConfig", JSON.stringify(columnsConfig));
  }, [columnsConfig]);

  const isColVisible = (id: string) => columnsConfig.find(c => c.id === id)?.visible !== false;

  // Sorting
  const [sortKey, setSortKey] = useState<string>(() => localStorage.getItem("projects_sort_key") || "name");
  const [sortDir, setSortDir] = useState<string>(() => localStorage.getItem("projects_sort_dir") || "asc");
  const [, setLocation] = useLocation();
  const [formProject, setFormProject] = useState({
    title: "",
    projectCode: "",
    department: [] as string[],
    clientName: "",
    description: "",
    company: "",
    startDate: "",
    endDate: "",
    progress: 0,
    status: "Planned",
    holdReason: "",
    team: [] as string[],
    vendors: [] as string[],
    restrictToTeam: false,
  });
  const [isSavingProject, setIsSavingProject] = useState(false);

  // Animation Modals
  const [createdProjectSuccessOpen, setCreatedProjectSuccessOpen] = useState(false);
  const [createdProjectTitle, setCreatedProjectTitle] = useState("");
  const [celebrationModalOpen, setCelebrationModalOpen] = useState(false);
  const [celebrationProjectTitle, setCelebrationProjectTitle] = useState("");

  const [uploadingProject, setUploadingProject] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<Record<string, any[]>>({});
  const [vendorInput, setVendorInput] = useState("");
  const [teamMemberSearch, setTeamMemberSearch] = useState("");
  const [allKeySteps, setAllKeySteps] = useState<KeyStep[]>([]); // legacy, not used in list
  const [allTasks, setAllTasks] = useState<Task[]>([]); // legacy, not used in list
  const [allSubtasks, setAllSubtasks] = useState<any[]>([]);

  // Advanced Filters State
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>(() => {
    const saved = localStorage.getItem("projects_customFilters");
    return saved ? JSON.parse(saved) : [];
  });
  const [savedFilterSets, setSavedFilterSets] = useState<Record<string, any>>(() => {
    const saved = localStorage.getItem("projects_savedFilterSets");
    return saved ? JSON.parse(saved) : {};
  });

  // Batch all localStorage persistence into a single effect
  useEffect(() => {
    localStorage.setItem("projects_customFilters", JSON.stringify(customFilters));
    localStorage.setItem("projects_savedFilterSets", JSON.stringify(savedFilterSets));
    localStorage.setItem("projects_employeeFilter", JSON.stringify(employeeFilter));
    localStorage.setItem("projects_clientFilter", JSON.stringify(clientFilter));
    localStorage.setItem("projects_priorityFilter", priorityFilter);
    localStorage.setItem("projects_searchTerm", searchTerm);
    localStorage.setItem("projects_statusFilter", JSON.stringify(statusFilter));
    localStorage.setItem("projects_departmentFilter", JSON.stringify(departmentFilter));
    localStorage.setItem("projects_startDate", startDate);
    localStorage.setItem("projects_endDate", endDate);
    localStorage.setItem("projects_overdueFilter", overdueFilter);
    localStorage.setItem("projects_showCompleted", String(showCompleted));
    // Clean up old legacy keys
    localStorage.removeItem("projects_startDateFrom");
    localStorage.removeItem("projects_startDateTo");
    localStorage.removeItem("projects_endDateFrom");
    localStorage.removeItem("projects_endDateTo");
  }, [customFilters, savedFilterSets, employeeFilter, clientFilter, priorityFilter, searchTerm, statusFilter, departmentFilter, startDate, endDate, overdueFilter, showCompleted]);

  const onClearAllFilters = () => {
    setSearchTerm("");
    setClientFilter([]);
    setDepartmentFilter([]);
    setStatusFilter([]);
    setPriorityFilter("all");
    setEmployeeFilter([]);
    setStartDate("");
    setEndDate("");
    localStorage.removeItem("projects_startDateFrom");
    localStorage.removeItem("projects_startDateTo");
    localStorage.removeItem("projects_endDateFrom");
    localStorage.removeItem("projects_endDateTo");
    setCustomFilters([]);
    setOverdueFilter("all");
    setShowCompleted(false);
  };

  // use shared apiFetch from lib/apiClient (includes caching, dedupe, auth)

  // FETCH DEPARTMENTS
  const fetchDepartments = async () => {
    try {
      const res = await apiFetch("/api/departments");
      if (!res.ok) throw new Error("Failed to fetch departments");
      const data = await res.json();
      let deptList = Array.isArray(data) ? data : [];
      // normalize/dedupe departments (case-insensitive) and ensure 'presales' exists
      const map = new Map<string, string>();
      deptList.forEach((d: string) => {
        if (!d) return;
        const key = d.toLowerCase();
        if (!map.has(key)) map.set(key, d);
      });
      if (!map.has('presales')) map.set('presales', 'Presales');
      if (!map.has('sales')) map.set('sales', 'Sales');
      const deduped = Array.from(map.values());
      setDepartments(deduped);
    } catch (err) {
      console.error("Failed to fetch departments", err);
      setDepartments([]);
    }
  };

  // FETCH PROJECTS
  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/projects?status=all");
      if (!res.ok) {
        // surface 401/other failures to user
        const body = await res.clone().text().catch(() => null);
        throw new Error(res.status === 401 ? "Unauthorized - please login" : (body || `HTTP ${res.status}`));
      }
      const data = await res.json();
      setProjects(data);
      // derive unique clients from projects for filtering
      const clientSet = new Set<string>();
      if (Array.isArray(data)) {
        data.forEach((p: any) => { if (p.clientName) clientSet.add(String(p.clientName)); });
      }
      setClients(Array.from(clientSet));
    } catch (err: any) {
      console.error("Failed to fetch projects", err);
      toast({ variant: "destructive", title: "Failed to load projects", description: err?.message || "Unknown error" });
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const addVendor = () => {
    const value = vendorInput.trim();
    if (!value) return;

    // prevent duplicates (case-insensitive)
    if (
      formProject.vendors.some(
        v => v.toLowerCase() === value.toLowerCase()
      )
    ) {
      setVendorInput("");
      return;
    }

    setFormProject(prev => ({
      ...prev,
      vendors: [...prev.vendors, value],
    }));

    setVendorInput("");
  };

  const removeVendor = (vendor: string) => {
    setFormProject(prev => ({
      ...prev,
      vendors: prev.vendors.filter(v => v !== vendor),
    }));
  };

  // Fetch employees data
  const fetchEmployees = async () => {
    try {
      const empRes = await apiFetch('/api/employees');
      if (!empRes.ok) {
        console.error("Failed to fetch employees:", empRes.status);
        setEmployees([]);
        return [];
      } else {
        const empData = await empRes.json();
        console.log("Loaded employees:", empData);
        const list = Array.isArray(empData) ? empData : [];
        setEmployees(list);
        return list;
      }
    } catch (err) {
      console.error("Error fetching employees:", err);
      setEmployees([]);
      return [];
    }
  };

  useEffect(() => {
    // Load employees, departments, and projects in parallel but don't block projects listing
    const loadInitialData = async () => {
      setLoading(true);

      // Load projects instantly
      const loadProjects = async () => {
        try {
          const projRes = await apiFetch("/api/projects?status=all");
          if (!projRes.ok) throw new Error(`HTTP ${projRes.status}`);
          const data = await projRes.json();
          setProjects(data);
          const clientSet = new Set<string>();
          if (Array.isArray(data)) {
            data.forEach((p: any) => { if (p.clientName) clientSet.add(String(p.clientName)); });
          }
          setClients(Array.from(clientSet));
        } catch (err: any) {
          console.error("Failed to fetch projects", err);
          toast({ variant: "destructive", title: "Failed to load projects", description: err?.message || "Unknown error" });
          setProjects([]);
        } finally {
          setLoading(false);
        }
      };

      loadProjects();

      // Load employees and departments in parallel
      Promise.all([
        (async () => {
          try {
            const empRes = await apiFetch('/api/employees');
            if (!empRes.ok) return [];
            return await empRes.json();
          } catch (err) {
            console.error("Error fetching employees:", err);
            return [];
          }
        })(),
        (async () => {
          try {
            const deptRes = await apiFetch("/api/departments");
            if (!deptRes.ok) return [];
            return await deptRes.json();
          } catch (err) {
            console.error("Failed to fetch departments", err);
            return [];
          }
        })(),
      ]).then(([empRes, deptRes]) => {
        setEmployees(Array.isArray(empRes) ? empRes : []);

        let deptList = Array.isArray(deptRes) ? deptRes : [];
        const map = new Map<string, string>();
        deptList.forEach((d: string) => {
          if (!d) return;
          const key = d.toLowerCase();
          if (!map.has(key)) map.set(key, d);
        });
        if (!map.has('presales')) map.set('presales', 'Presales');
        if (!map.has('sales')) map.set('sales', 'Sales');
        setDepartments(Array.from(map.values()));
      }).catch(err => {
        console.error("Error loading employees/departments:", err);
      });
    };

    loadInitialData();

    // Load supplementary data (keysteps, tasks, subtasks) in parallel but don't block main load
    Promise.all([
      apiFetch("/api/keysteps/bulk?status=all")
        .then(r => r.json())
        .then(data => setAllKeySteps(Array.isArray(data) ? data : []))
        .catch(() => setAllKeySteps([])),
      apiFetch("/api/tasks/bulk?status=all")
        .then(r => r.json())
        .then(data => setAllTasks(Array.isArray(data) ? data : []))
        .catch(() => setAllTasks([])),
      apiFetch("/api/subtasks/bulk?status=all")
        .then(r => r.json())
        .then(data => setAllSubtasks(Array.isArray(data) ? data : []))
        .catch(() => setAllSubtasks([])),
    ]).catch(() => { });
  }, []);

  const fetchProjectFiles = async (projectId: string) => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/files`);
      const data = res.ok ? await res.json() : [];
      setProjectFiles(prev => ({
        ...prev,
        [projectId]: data
      }));
    } catch (err) {
      console.error("Failed to fetch project files", err);
    }
  };

  // Debounce search term to reduce filter computations (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch project files whenever a project modal opens
  useEffect(() => {
    if (selectedDetailProject?.id) {
      fetchProjectFiles(selectedDetailProject.id);
    }
  }, [selectedDetailProject?.id]);

  // Helper: normalize department strings for robust matching (matches backend)
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

  // Pre-compute filter constants to avoid recomputation
  const filterConstants = useMemo(() => ({
    searchTermLower: debouncedSearchTerm.toLowerCase(),
    departmentFilterNorm: departmentFilter.map(d => normalizeDept(d)),
    clientFilterLower: clientFilter.map((c: string) => c.toLowerCase()),
    priorityFilterLower: (priorityFilter || "").toLowerCase(),
  }), [debouncedSearchTerm, departmentFilter, clientFilter, priorityFilter]);

  // Pre-compute employee department map
  const employeeDeptMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach(emp => {
      if (emp.id && emp.department) {
        map.set(String(emp.id), normalizeDept(emp.department));
      }
    });
    return map;
  }, [employees]);

  // Pre-compute enriched projects
  const enrichedProjects = useMemo(() => {
    return projects.map(p => {
      const projectDepts = Array.isArray(p.department)
        ? p.department.map((d: string) => normalizeDept(d))
        : [normalizeDept(String(p.department))];
      return {
        project: p,
        projectDepts,
        clientNameLower: (p.clientName || "").toLowerCase(),
        statusLower: (p.status || "").toLowerCase(),
        titleLower: (p.title || "").toLowerCase(),
        codeLower: (p.projectCode || "").toLowerCase(),
      };
    });
  }, [projects]);

  // Filtered projects with pre-computed data
  const filteredProjects = useMemo(() => {
    const { searchTermLower, departmentFilterNorm, clientFilterLower, priorityFilterLower } = filterConstants;

    return enrichedProjects.map((e: any) => e.project).filter((p: any, idx: number) => {
      const enriched = enrichedProjects[idx];
      const { projectDepts, clientNameLower, statusLower, titleLower, codeLower } = enriched;

      // 1. Standard Search (Title, Code, Client)
      const matchesSearch = !searchTermLower ||
        titleLower.includes(searchTermLower) ||
        codeLower.includes(searchTermLower) ||
        clientNameLower.includes(searchTermLower);

      // 2. Status Filter
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(p.status);

      // 3. Department Filter (using pre-computed normalized depts)
      const matchesDepartment =
        departmentFilter.length === 0 ||
        projectDepts.some((dept: string) => departmentFilterNorm.includes(dept));

      // 4. Client Filter (using pre-computed lowercase)
      const matchesClient = clientFilter.length === 0 || clientFilterLower.includes(clientNameLower);

      // 5. Custom Filters
      const matchesCustom = customFilters.every((f: any) => {
        if (!f.value) return true;
        const val = p[f.field as keyof typeof p];
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

      // 6. Employee / Assignee Filter (using pre-computed dept map)
      let matchesEmployee = true;
      if (employeeFilter.length > 0) {
        const isAssigned = (p.team && p.team.some((tid: string) => employeeFilter.includes(String(tid)))) ||
          employeeFilter.includes(String(p.createdByEmployeeId));

        const isDeptRelated = employeeFilter.some((eId: string) => {
          const empDept = employeeDeptMap.get(String(eId));
          return empDept && projectDepts.some((dept: string) => dept === empDept);
        });

        matchesEmployee = isAssigned || isDeptRelated;
      }

      // 7. Priority filter
      let matchesPriority = true;
      if (priorityFilter !== "all") {
        matchesPriority = allTasks.some((t: any) => String(t.projectId) === String(p.id) &&
          String((t.priority || "")).toLowerCase() === priorityFilterLower);
      }

      // 8. Start Date & End Date filters
      let matchesStartDateRange = true;
      if (startDate) {
        if (!p.startDate) {
          matchesStartDateRange = false;
        } else {
          const pDate = new Date(p.startDate).toISOString().split("T")[0];
          matchesStartDateRange = pDate >= startDate;
        }
      }

      let matchesEndDateRange = true;
      if (endDate) {
        if (!p.endDate) {
          matchesEndDateRange = false;
        } else {
          const pDate = new Date(p.endDate).toISOString().split("T")[0];
          matchesEndDateRange = pDate <= endDate;
        }
      }

      // Overdue filter
      let matchesOverdue = true;
      if (overdueFilter !== "all") {
        const now = new Date();
        const end = p.endDate ? new Date(p.endDate) : null;
        const isCompleted = statusLower === "completed";
        // A project is only overdue once its End Date is strictly before
        // today — not "before tomorrow", which incorrectly flagged projects
        // ending today as overdue.
        const isOverdue = !!(end && end < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && !isCompleted);
        matchesOverdue = overdueFilter === "overdue" ? isOverdue : true;
      }

      let matchesCompletedVisibility = true;
      if (!showCompleted && statusLower === "completed") {
        if (statusFilter.length === 0 || !statusFilter.includes("Completed")) {
          matchesCompletedVisibility = false;
        }
      }

      let matchesCancelledVisibility = true;
      if (statusLower === "cancelled") {
        if (statusFilter.length === 0 || !statusFilter.includes("Cancelled")) {
          matchesCancelledVisibility = false;
        }
      }

      // Global Freeze: when a project is frozen, that project should always
      // be visible on its own list — it takes priority over any other filter
      // left active elsewhere (status/department/employee/etc.), so freezing
      // never accidentally hides the very project you pinned. Search is the
      // only exception: if you're actively typing a search, it still applies.
      if (isFrozen && frozenProjectId != null) {
        const matchesFreeze = String(p.id) === String(frozenProjectId);
        return matchesFreeze && matchesSearch;
      }

      return matchesSearch && matchesStatus && matchesDepartment && matchesClient && matchesCustom &&
        matchesEmployee && matchesPriority && matchesStartDateRange && matchesEndDateRange && matchesOverdue && matchesCompletedVisibility && matchesCancelledVisibility;
    });
  }, [enrichedProjects, filterConstants, statusFilter, departmentFilter, clientFilter, customFilters,
    employeeFilter, employeeDeptMap, priorityFilter, allTasks, startDate, endDate, overdueFilter, showCompleted, isFrozen, frozenProjectId]);

  const handleOpenCreate = () => {
    setModalMode("create");
    setEditingId(null);
    setShowAdvanced(false);
    setFormProject({
      title: "",
      projectCode: "",
      department: [],
      clientName: "",
      description: "",
      company: "",
      startDate: "",
      endDate: "",
      progress: 0,
      status: "Planned",
      holdReason: "",
      team: [],
      vendors: [],
      // New projects default to team-restricted access: once a department
      // is picked, its members are auto-added to the team list below, and
      // removing someone from that list actually keeps them out. Admin can
      // still uncheck "Restrict access..." to fall back to classic
      // whole-department visibility for this project if they want that.
      restrictToTeam: true,
    });
    setTeamMemberSearch("");
    // Refresh employees before opening dialog
    fetchEmployees().then(() => {
      setOpenDialog(true);
    });
  };

  const handleFileUpload = async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await apiFetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        const uploadedFile = await response.json();
        // Ensure the backend returns { id, fileName, fileSize, url }
        setProjectFiles(prev => ({
          ...prev,
          [projectId]: [...(prev[projectId] || []), uploadedFile]
        }));
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  const handleOpenEdit = (project: any) => {
    setModalMode("edit");
    setEditingId(project.id);

    const existingDepartments = project.department ?? [];
    const existingTeam = project.team || [];

    setFormProject({
      title: project.title,
      projectCode: project.projectCode || "",
      department: existingDepartments,
      clientName: project.clientName || "",
      description: project.description || "",
      company: project.company || "",
      startDate: project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : "",
      endDate: project.endDate ? new Date(project.endDate).toISOString().split("T")[0] : "",
      progress: project.progress || 0,
      status: project.status || "Planned",
      holdReason: project.holdReason || "",
      team: existingTeam,
      vendors: project.vendors || [],
      // Reflect exactly what's saved for this project. Every project that
      // existed before this feature defaults to false here (whole
      // department keeps seeing it, unchanged) — this only becomes true if
      // an admin explicitly turned it on for this project before.
      restrictToTeam: Boolean(project.restrictToTeam),
    });

    setTeamMemberSearch("");
    // Refresh employees before opening dialog
    fetchEmployees().then((freshEmployees) => {
      // Existing/legacy projects: a department is selected but no explicit
      // team members were ever saved (it has always relied on whole-
      // department visibility). Auto-select that department's members into
      // the team list here too, so opening ANY existing department-only
      // project lets the admin remove specific people from it, exactly like
      // a brand-new project. If the project already has explicit team
      // members saved, this is skipped entirely — we never override a list
      // that's already been customized (respects any previous removals).
      if (existingDepartments.length > 0 && existingTeam.length === 0) {
        const deptNorms = existingDepartments.map((d: string) => normalizeDept(d));
        const deptMemberIds = (freshEmployees || [])
          .filter((emp: any) => {
            if (!emp.department) return false;
            const empDepts = Array.isArray(emp.department)
              ? emp.department.map((d: string) => normalizeDept(d))
              : [normalizeDept(emp.department)];
            return empDepts.some((d: string) => deptNorms.includes(d));
          })
          .map((emp: any) => emp.id);

        if (deptMemberIds.length > 0) {
          setFormProject((prev) => ({
            ...prev,
            team: Array.from(new Set([...prev.team, ...deptMemberIds])),
          }));
        }
      }
      setOpenDialog(true);
    });
  };

  const toggleProjectDepartment = async (projectId: string, dept: string) => {
    const project = projects.find((p: any) => p.id === projectId);
    if (!project) return;

    const deptNorm = normalizeDept(dept);
    const currentDepts = project.department || [];
    const isCurrentlyChecked = currentDepts.some((d: string) => normalizeDept(d) === deptNorm);

    const newDepts = isCurrentlyChecked
      ? currentDepts.filter((d: string) => normalizeDept(d) !== deptNorm)
      : Array.from(new Set([...currentDepts, dept]));

    // Optimistic local update
    setProjects((prev: any[]) => prev.map((p: any) => p.id === projectId ? { ...p, department: newDepts } : p));

    try {
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department: newDepts }),
      });

      if (!res.ok) throw new Error("Failed to shift department");

      toast({
        title: "Department Updated",
        description: isCurrentlyChecked ? `Project moved out of ${dept}` : `Project added to ${dept}`,
      });
    } catch (err) {
      console.error(err);
      // Revert optimistic update
      setProjects((prev: any[]) => prev.map((p: any) => p.id === projectId ? { ...p, department: currentDepts } : p));
      toast({ variant: "destructive", title: "Update Failed", description: "Could not shift department" });
    }
  };

  // OPTIMIZED SAVE PROJECT - minimal validation, fast execution
  const handleSaveProject = async () => {
    if (isSavingProject) return;
    setIsSavingProject(true);

    const titleTrimmed = formProject.title?.trim();
    if (!titleTrimmed) {
      toast({ variant: "destructive", title: "Error", description: "Project name is required" });
      setIsSavingProject(false);
      return;
    }

    if (!formProject.startDate) {
      toast({ variant: "destructive", title: "Error", description: "Start date is required" });
      setIsSavingProject(false);
      return;
    }

    if (!formProject.endDate) {
      toast({ variant: "destructive", title: "Error", description: "End date is required" });
      setIsSavingProject(false);
      return;
    }

    if (formProject.status === "On Hold" && !formProject.holdReason?.trim()) {
      toast({ variant: "destructive", title: "Error", description: "A hold reason is required when the project is on hold." });
      setIsSavingProject(false);
      return;
    }

    try {
      // Only send title as required; other fields are optional
      const payload = {
        title: titleTrimmed,
        projectCode: formProject.projectCode?.trim() || "",
        clientName: formProject.clientName?.trim() || "",
        company: formProject.company?.trim() || "",
        department: formProject.department || [],
        description: formProject.description?.trim() || "",
        status: formProject.status || "Planned",
        holdReason: formProject.status === "On Hold" ? formProject.holdReason?.trim() || null : null,
        startDate: formProject.startDate || "",
        endDate: formProject.endDate || "",
        progress: Number(formProject.progress) || 0,
        team: formProject.team || [],
        vendors: formProject.vendors || [],
        restrictToTeam: Boolean(formProject.restrictToTeam),
      };

      let response;
      if (modalMode === "edit" && editingId) {
        response = await apiFetch(`/api/projects/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await apiFetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        let errorMessage = "Failed to save project";
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.details || errorData.message || errorData.error || errorMessage;
          if (response.status === 409) {
            toast({
              variant: "destructive",
              title: errorData.error || "Duplicate Project",
              description: errorData.details || "A project with this title or code already exists.",
            });
            return;
          }
        } catch (e) {
          errorMessage = errorText || errorMessage;
        }
        toast({ variant: "destructive", title: "Error", description: errorMessage });
        return;
      }

      setOpenDialog(false);
      setEditingId(null);
      setModalMode("create");
      setFormProject({
        title: "",
        projectCode: "",
        department: [],
        clientName: "",
        description: "",
        company: "",
        startDate: "",
        endDate: "",
        progress: 0,
        status: "Planned",
        holdReason: "",
        team: [],
        vendors: [],
        restrictToTeam: true,
      });
      setVendorInput("");
      setTeamMemberSearch("");

      // Update local state without refetching entire projects list for performance
      try {
        const json = await response.json();
        if (modalMode === "edit" && editingId) {
          // replace updated project in local state
          setProjects((prev) => prev.map((p) => (String(p.id) === String(json.id) ? json : p)));
        } else {
          // prepend newly created project for immediate visibility
          setProjects((prev) => [json, ...prev]);
        }
      } catch (e) {
        // fallback: refetch if parsing fails
        await fetchProjects();
      }
      if (modalMode !== "edit") {
        setCreatedProjectTitle(titleTrimmed);
        setCreatedProjectSuccessOpen(true);
      } else if (editingId && formProject.status === "Completed") {
        const prior = projects.find((p) => String(p.id) === String(editingId));
        if (prior && prior.status !== "Completed") {
          setCelebrationProjectTitle(titleTrimmed);
          setCelebrationModalOpen(true);
        }
      }

      toast({
        title: modalMode === "edit" ? "Updated" : "Created",
        description: `Project "${titleTrimmed}" ${modalMode === "edit" ? "updated" : "created"}!`,
      });
    } catch (error) {
      console.error("Save error:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to save project" });
    } finally {
      setIsSavingProject(false);
    }
  };

  const [cloningProjectId, setCloningProjectId] = useState<string | null>(null);

  const handleCloneProject = async (project: any) => {
    if (cloningProjectId) return; // already cloning something
    setCloningProjectId(project.id);
    try {
      const response = await apiFetch(`/api/projects/${project.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.details || data?.error || "Failed to clone project");
      }
      // Refetch so the clone (and all its cloned key steps/tasks/subtasks) shows up immediately
      await fetchProjects();
      toast({
        title: "Project Cloned",
        description: data?.message || `"${project.title}" was cloned successfully.`,
      });
    } catch (error: any) {
      console.error("Failed to clone project:", error);
      toast({ variant: "destructive", title: "Clone Failed", description: error?.message || "Failed to clone project" });
    } finally {
      setCloningProjectId(null);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      // Optimistic UI update - remove immediately
      const deletedProject = projects.find(p => p.id === id);
      setProjects(projects.filter(p => p.id !== id));

      const response = await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (response.ok) {
        // Dispatch event for cross-page sync
        window.dispatchEvent(new CustomEvent('project.deleted', { detail: { projectId: id } }));
        toast({ title: "Deleted", description: "Project deleted successfully" });
      } else {
        throw new Error("Failed to delete project");
      }
    } catch (error) {
      // Revert optimistic update
      const deletedProject = projects.find(p => p.id === id);
      if (deletedProject) {
        setProjects(prev => [...prev, deletedProject].sort((a, b) => String(a.id).localeCompare(String(b.id))));
      }
      console.error("Failed to delete project:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to delete project. Changes reverted." });
    }
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [timelineProject, setTimelineProject] = useState<any | null>(null);
  const [timelineDialogOpen, setTimelineDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  // ── Inline editing state ──
  const [inlineEdit, setInlineEdit] = useState<{ projectId: string; field: string } | null>(null);
  const [inlineValue, setInlineValue] = useState<string>("");

  const startInlineEdit = (projectId: string, field: string, currentValue: string) => {
    setInlineEdit({ projectId, field });
    setInlineValue(currentValue || "");
  };

  const cancelInlineEdit = () => {
    setInlineEdit(null);
    setInlineValue("");
  };

  const saveInlineEdit = async (projectId: string, field: string, value: string) => {
    // Strip "_detail" suffix used for expanded-area editors
    const apiField = field.replace(/_detail$/, "");
    const project = projects.find((p) => String(p.id) === String(projectId));
    let payload: any = { [apiField]: value };

    if (apiField === "status" && (value === "Completed" || value?.toLowerCase() === "completed")) {
      const prior = projects.find((p) => String(p.id) === String(projectId));
      if (prior && prior.status !== "Completed") {
        setCelebrationProjectTitle(prior?.title || "Project");
        setCelebrationModalOpen(true);
      }
    }

    if (apiField === "status" && value === "On Hold") {
      const existingReason = project?.holdReason || "";
      const reason = window.prompt("Please enter the reason for putting this project on hold:", existingReason);
      if (!reason || !reason.trim()) {
        cancelInlineEdit();
        return;
      }
      payload.holdReason = reason.trim();
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: value, holdReason: reason.trim() } : p));
    } else {
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, [apiField]: value } : p));
    }

    setInlineEdit(null);
    setInlineValue("");

    try {
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Update failed");
      toast({ title: "Updated", description: `Project ${apiField} updated successfully` });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: `Failed to update ${apiField}` });
      // revert — refetch
      await fetchProjects();
    }
  };

  const handleMarkComplete = async (projectId: string) => {
    const prior = projects.find((p) => String(p.id) === String(projectId));
    setCelebrationProjectTitle(prior?.title || "Project");
    setCelebrationModalOpen(true);

    // Optimistic update
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: "Completed", progress: 100 } : p));

    try {
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed", progress: 100 }),
      });

      if (!res.ok) throw new Error("Update failed");
      toast({
        title: "Project Completed",
        description: "Project status and progress have been updated.",
      });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "Failed to mark project as completed" });
      // revert — refetch
      await fetchProjects();
    }
  };

  const addTeamMember = (id: string) => {
    if (!formProject.team.includes(id)) {
      setFormProject({ ...formProject, team: [...formProject.team, id] });
    }
  };

  const removeTeamMember = (id: string) => {
    setFormProject({ ...formProject, team: formProject.team.filter(m => m !== id) });
  };

  const getStatusBadge = (status: string) => {
    const s = status || 'Planned';
    if (s === 'Planned') {
      return <Badge className="bg-slate-500 hover:bg-slate-600 text-white text-[10px] uppercase border-none px-2 py-0.5">Planned</Badge>;
    }
    if (s === 'Not Started' || s === 'not started') {
      return <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] uppercase px-2 py-0.5" variant="outline">Not Started</Badge>;
    }
    if (s === 'In Progress') {
      return <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] uppercase border-none">In Progress</Badge>;
    }
    if (s === 'On Hold') {
      return <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] uppercase border-none">On Hold</Badge>;
    }
    if (s === 'Completed' || s === 'closed') {
      return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] uppercase border-none px-2 py-0.5">Completed</Badge>;
    }
    if (s === 'Cancelled' || s === 'cancelled') {
      return <Badge className="bg-red-500 hover:bg-red-600 text-white text-[10px] uppercase border-none px-2 py-0.5">Cancelled</Badge>;
    }
    return (
      <Badge variant="secondary" className="text-[10px] uppercase">
        {status || "Planned"}
      </Badge>
    );
  };

  const getProgressColorClass = (progress: number) => {
    if (progress <= 30) return "bg-red-500";
    if (progress <= 70) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const filteredEmployees =
    formProject.department.length > 0
      ? employees.filter(emp => {
        if (!emp.department) return false;
        // Support multiple departments per employee
        const empDepts = Array.isArray(emp.department)
          ? emp.department.map((d: string) => d.toLowerCase())
          : [emp.department.toLowerCase()];
        return formProject.department.some(selDept => empDepts.includes(selDept.toLowerCase()));
      })
      : employees;

  // Group employees by department
  const employeesByDepartment = employees.reduce((acc, emp) => {
    const dept = emp.department || "General";
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(emp);
    return acc;
  }, {} as Record<string, any[]>);

  const sortedDepartments = Object.keys(employeesByDepartment).sort();

  // Filter employees by search term for team member dropdown
  const filteredEmployeesForTeam = teamMemberSearch.trim()
    ? employees.filter(emp =>
      emp.name?.toLowerCase().includes(teamMemberSearch.toLowerCase()) ||
      emp.empCode?.toLowerCase().includes(teamMemberSearch.toLowerCase()) ||
      emp.designation?.toLowerCase().includes(teamMemberSearch.toLowerCase()) ||
      emp.department?.toLowerCase().includes(teamMemberSearch.toLowerCase())
    )
    : employees;

  // Apply department filtering to the team picker (if departments selected)
  // Normalize department names for comparison
  const normalizedSelectedDepartments = formProject.department.map(d => d.toLowerCase());
  const filteredEmployeesForPicker = formProject.department.length > 0
    ? filteredEmployeesForTeam.filter(emp => {
      if (!emp.department) return false;
      // Support multiple departments per employee
      const empDepts = Array.isArray(emp.department)
        ? emp.department.map((d: string) => d.toLowerCase())
        : [emp.department.toLowerCase()];
      return empDepts.some((dept: string) => normalizedSelectedDepartments.includes(dept));
    })
    : filteredEmployeesForTeam;

  // Group filtered employees by department
  const filteredEmployeesByDepartment = filteredEmployeesForPicker.reduce((acc, emp) => {
    const dept = emp.department || "General";
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(emp);
    return acc;
  }, {} as Record<string, any[]>);

  const filteredSortedDepartments = Object.keys(filteredEmployeesByDepartment).sort();

  // Removed formatDateDisplay in favor of centralized formatDate from @/lib/utils

  // Apply sorting to filtered projects
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const key = sortKey;

    if (key === 'startDate' || key === 'endDate') {
      const da = a[key] ? new Date(a[key]).getTime() : (sortDir === 'asc' ? Infinity : -Infinity);
      const db = b[key] ? new Date(b[key]).getTime() : (sortDir === 'asc' ? Infinity : -Infinity);
      if (da < db) return sortDir === 'asc' ? -1 : 1;
      if (da > db) return sortDir === 'asc' ? 1 : -1;
      return 0;
    }

    let va: any = a[key === 'name' ? 'title' : (key === 'client' ? 'clientName' : 'title')];
    let vb: any = b[key === 'name' ? 'title' : (key === 'client' ? 'clientName' : 'title')];
    if (!va) va = "";
    if (!vb) vb = "";
    va = String(va).toLowerCase();
    vb = String(vb).toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const processedProjects = sortedProjects.map(p => {
    const isAssigned = employeeFilter.length > 0 && ((p.team && p.team.some((tid: string) => employeeFilter.includes(String(tid)))) || employeeFilter.includes(String(p.createdByEmployeeId)));
    const empDepts = employeeFilter.length > 0 ? employeeFilter.map(eId => {
      const emp = employees.find(e => String(e.id) === eId);
      return emp ? normalizeDept(emp.department) : "";
    }).filter(Boolean) : [];
    const projectDepts = Array.isArray(p.department)
      ? p.department.map((d: string) => normalizeDept(d))
      : [normalizeDept(String(p.department))];
    const isDeptRelated = employeeFilter.length > 0 && empDepts.some(dept => projectDepts.includes(dept));

    return {
      ...p,
      _group: employeeFilter.length === 0 ? "none" : (isAssigned ? "assigned" : (isDeptRelated ? "dept" : "none"))
    };
  });

  const sortedProcessedProjects = [...processedProjects].sort((a, b) => {
    if (employeeFilter.length > 0) {
      const rank = { assigned: 1, dept: 2, none: 3 };
      const ra = rank[a._group as keyof typeof rank] || 3;
      const rb = rank[b._group as keyof typeof rank] || 3;
      if (ra !== rb) return ra - rb;
    }
    return sortedProjects.findIndex(x => x.id === a.id) - sortedProjects.findIndex(x => x.id === b.id);
  });

  const kpiStats = useMemo(() => {
    const totalActive = projects.filter(p => String(p.status || "").toLowerCase() !== "completed" && String(p.status || "").toLowerCase() !== "cancelled").length;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const overdueCount = projects.filter(p => {
      const pEnd = p.endDate ? new Date(p.endDate) : null;
      return pEnd && pEnd < today && String(p.status || "").toLowerCase() !== "completed";
    }).length;
    const totalKeySteps = allKeySteps.length;
    const avgProgress = projects.length > 0
      ? Math.round(projects.reduce((acc, p) => acc + (p.progress || 0), 0) / projects.length)
      : 0;
    return { totalActive, overdueCount, totalKeySteps, avgProgress };
  }, [projects, allKeySteps]);

  const handleFreezeProjectRow = (project: any) => {
    const projectName = project?.title || project?.name || "Untitled Project";
    const isCurrentProjectFrozen = String(frozenProjectId) === String(project.id);

    if (isCurrentProjectFrozen) {
      clearFreeze();
      toast({
        title: "Freeze Cleared",
        description: `"${projectName}" is no longer frozen.`,
      });
      return;
    }

    freezeProject({ id: project.id, name: projectName });
    toast({
      title: "Project Frozen",
      description: `"${projectName}" is now your active context across all pages.`,
    });
  };

  useEffect(() => {
    localStorage.setItem("projects_sort_key", sortKey);
    localStorage.setItem("projects_sort_dir", sortDir);
  }, [sortKey, sortDir]);

  return (
    <div className="space-y-6">
      {/* Header Banner with Lavender Gradient & White Doodle Background Pattern */}
      <div className="relative overflow-hidden rounded-2xl border border-[#CFC0FE] dark:border-slate-800 bg-gradient-to-r from-[#EDE8FF] via-[#E5DEFD] to-[#D9CDFE] dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 p-5 sm:p-6 shadow-[0_4px_20px_rgba(112,71,235,0.08)] ring-1 ring-[#7047EB]/10">
        {/* Crisp Pure White Doodle Pattern Background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.45] dark:opacity-[0.25]"
          style={{
            backgroundImage: `url(${projectsHeaderPattern})`,
            backgroundRepeat: "repeat-x",
            backgroundPosition: "right center",
            backgroundSize: "auto 100%",
            filter: "brightness(0) invert(1)",
          }}
        />
        {/* Soft lavender left fade strictly behind text area so title is 100% legible */}
        <div className="absolute inset-y-0 left-0 w-72 pointer-events-none bg-gradient-to-r from-[#EDE8FF] via-[#EDE8FF]/90 to-transparent dark:from-slate-900 dark:via-slate-900/80" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#1E1B4B] dark:text-slate-100 tracking-tight">
              Projects
            </h1>
            <p className="text-xs sm:text-sm text-[#584B85] dark:text-slate-400 mt-1 font-medium font-sans">
              Create and manage your projects.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setLocation("/tickets?tab=raise")}
              className="bg-white/90 backdrop-blur-xs border-white/80 text-slate-800 hover:bg-white hover:text-blue-700 font-semibold text-xs h-9 px-4 rounded-xl shadow-xs transition-all"
            >
              <Ticket className="mr-2 h-4 w-4 text-blue-600" />
              Raise Ticket
            </Button>

            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              {/* Button to open modal */}
              <Button
                onClick={handleOpenCreate}
                className="bg-[#5D5FEF] hover:bg-[#4E50E6] text-white font-semibold text-xs h-9 px-4 rounded-xl shadow-xs transition-transform active:scale-95"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>

            {/* Dialog Content */}
            <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] p-0 rounded-[24px] overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xl flex flex-col font-sans">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-[#EEF0FF] dark:bg-indigo-950/50 border border-[#E0E2FE] dark:border-indigo-800/40 flex items-center justify-center text-[#5D5FEF] shadow-2xs flex-shrink-0">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                      {editingId ? "Edit Project" : "Create New Project"}
                    </DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                      {editingId
                        ? "Update project details and team assignments."
                        : "Add a new project with team members and key details."}
                    </DialogDescription>
                  </div>
                </div>
              </div>

              {/* Scrollable Form & Live Overview Grid */}
              <div className="flex-1 overflow-y-auto px-7 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Left Column: Form Inputs (7 cols on lg, 8 cols on xl) */}
                  <div className="lg:col-span-7 xl:col-span-8 space-y-5">
                    {/* Row 1: Project Name, Project Code & Project Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="title" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Project Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="title"
                          value={formProject.title}
                          onChange={(e) => setFormProject({ ...formProject, title: e.target.value })}
                          placeholder="Website Redesign"
                          className="h-10 rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-[#7047EB] text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="projectCode" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Project Code <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                        </Label>
                        <Input
                          id="projectCode"
                          value={formProject.projectCode}
                          onChange={(e) => setFormProject({ ...formProject, projectCode: e.target.value })}
                          placeholder="K-2026-001"
                          className="h-10 rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-[#7047EB] text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="status" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Project Status <span className="text-red-500">*</span>
                        </Label>
                        <Select
                          value={formProject.status || "Planned"}
                          onValueChange={(v) => {
                            const updates: any = { status: v };
                            if (v === "Completed") updates.progress = 100;
                            setFormProject({ ...formProject, ...updates });
                          }}
                        >
                          <SelectTrigger id="status" className="h-10 rounded-xl border-slate-200 dark:border-slate-800 focus:ring-[#7047EB] text-sm">
                            <SelectValue placeholder="Select Status" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                            <SelectItem value="Planned">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-purple-500" />
                                <span>Planned</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="In Progress">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-blue-500" />
                                <span>In Progress</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Completed">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                <span>Completed</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="On Hold">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-amber-500" />
                                <span>On Hold</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Not Started">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-slate-400" />
                                <span>Not Started</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Cancelled">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                                <span>Cancelled</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Conditional Hold Reason */}
                    {formProject.status === "On Hold" && (
                      <div className="space-y-1.5 p-3.5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl">
                        <Label htmlFor="holdReason" className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          Hold Reason <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                          id="holdReason"
                          value={formProject.holdReason}
                          onChange={(e) => setFormProject({ ...formProject, holdReason: e.target.value })}
                          placeholder="Why is this project on hold?"
                          className="min-h-[80px] rounded-lg border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 text-sm"
                        />
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">A reason is required when project status is On Hold.</p>
                      </div>
                    )}

                    {/* Row 2: Client Name */}
                    <div className="space-y-1.5">
                      <Label htmlFor="clientName" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Client Name <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <div className="relative">
                        <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          id="clientName"
                          value={formProject.clientName}
                          onChange={(e) => setFormProject({ ...formProject, clientName: e.target.value })}
                          placeholder="Acme Corporation"
                          className="pl-10 h-10 rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-[#7047EB] text-sm"
                        />
                      </div>
                    </div>

                    {/* Row 3: Departments Tag Input with Dropdown Popover */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Departments <span className="text-red-500">*</span>
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <div className="min-h-[44px] w-full p-1.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-between gap-2 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {formProject.department.length === 0 ? (
                                <span className="text-xs text-slate-400 pl-2">Select departments...</span>
                              ) : (
                                formProject.department.map((dept) => (
                                  <span
                                    key={dept}
                                    className="inline-flex items-center gap-1 bg-[#F3EEFF] dark:bg-purple-950/60 text-[#6335E8] dark:text-purple-300 border border-[#E4D7FE] dark:border-purple-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs"
                                  >
                                    {dept}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const deptNorm = normalizeDept(dept);
                                        setFormProject((prev) => ({
                                          ...prev,
                                          department: prev.department.filter(d => normalizeDept(d) !== deptNorm)
                                        }));
                                      }}
                                      className="hover:text-red-500 rounded p-0.5 transition-colors"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))
                              )}
                            </div>
                            <ChevronDown className="h-4 w-4 text-slate-400 mr-2 flex-shrink-0" />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-[320px] p-3 rounded-xl shadow-lg border-slate-200 dark:border-slate-800" align="start">
                          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Select Departments</div>
                          <div className="space-y-1 max-h-[220px] overflow-y-auto">
                            {departments.map((dept) => {
                              const deptNorm = normalizeDept(dept);
                              const isCurrentlyChecked = formProject.department.some(d => normalizeDept(d) === deptNorm);
                              return (
                                <label
                                  key={dept}
                                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm text-slate-700 dark:text-slate-200"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isCurrentlyChecked}
                                    className="rounded border-slate-300 text-[#7047EB] focus:ring-[#7047EB]"
                                    onChange={() => {
                                      setFormProject((prev) => {
                                        const newDepartment = isCurrentlyChecked
                                          ? prev.department.filter(d => normalizeDept(d) !== deptNorm)
                                          : Array.from(new Set([...prev.department, dept]));

                                        let newTeam = prev.team;
                                        if (!isCurrentlyChecked) {
                                          const deptMemberIds = employees
                                            .filter((emp: any) => {
                                              if (!emp.department) return false;
                                              const empDepts = Array.isArray(emp.department)
                                                ? emp.department.map((d: string) => normalizeDept(d))
                                                : [normalizeDept(emp.department)];
                                              return empDepts.includes(deptNorm);
                                            })
                                            .map((emp: any) => emp.id);
                                          newTeam = Array.from(new Set([...prev.team, ...deptMemberIds]));
                                        }

                                        return {
                                          ...prev,
                                          department: newDepartment,
                                          team: newTeam,
                                        };
                                      });
                                    }}
                                  />
                                  <span className="font-medium text-xs">{dept}</span>
                                </label>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Row 4: Project Timeline (Start Date & End Date) */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-tight">
                        Project Timeline
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="startDate" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Start Date <span className="text-red-500">*</span>
                          </Label>
                          <div className="relative">
                            <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                              id="startDate"
                              type="date"
                              value={formProject.startDate}
                              onChange={(e) => {
                                const newStartDate = e.target.value;
                                setFormProject((f) => ({
                                  ...f,
                                  startDate: newStartDate,
                                  endDate:
                                    f.endDate && newStartDate && f.endDate < newStartDate
                                      ? newStartDate
                                      : f.endDate,
                                }));
                              }}
                              className="pl-10 h-10 rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-[#7047EB] text-sm"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="endDate" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            End Date <span className="text-red-500">*</span>
                          </Label>
                          <div className="relative">
                            <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                              id="endDate"
                              type="date"
                              value={formProject.endDate}
                              min={formProject.startDate || undefined}
                              onChange={(e) => {
                                const newEndDate = e.target.value;
                                setFormProject((f) => ({
                                  ...f,
                                  endDate:
                                    f.startDate && newEndDate && newEndDate < f.startDate
                                      ? f.startDate
                                      : newEndDate,
                                }));
                              }}
                              className="pl-10 h-10 rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-[#7047EB] text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Row 5: Progress (%) with Slider and Live Value Pill */}
                    <div className="space-y-2">
                      <Label htmlFor="progress" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Progress (%) <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <div className="flex items-center gap-4">
                        <input
                          id="progress"
                          type="range"
                          min="0"
                          max="100"
                          value={formProject.progress || 0}
                          onChange={(e) => setFormProject({ ...formProject, progress: parseInt(e.target.value) || 0 })}
                          disabled={formProject.status === "Completed"}
                          className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[#7047EB] disabled:opacity-50"
                        />
                        <div className="px-3.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 min-w-[56px] text-center shadow-xs">
                          {formProject.progress || 0} %
                        </div>
                      </div>
                    </div>

                    {/* Row 6: Description */}
                    <div className="space-y-1.5">
                      <Label htmlFor="description" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Description <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Textarea
                        id="description"
                        value={formProject.description}
                        onChange={(e) => setFormProject({ ...formProject, description: e.target.value })}
                        placeholder="Describe your project goals and scope..."
                        className="min-h-[85px] rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-[#7047EB] text-sm resize-none"
                      />
                    </div>

                    {/* Row 7: Styled Advanced Options Accordion */}
                    <div className="border border-[#ECE6FF] dark:border-purple-900/30 rounded-2xl bg-[#FAF8FF] dark:bg-purple-950/20 overflow-hidden transition-all">
                      <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between p-3.5 hover:bg-purple-50/50 dark:hover:bg-purple-950/40 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-[#F0ECFF] dark:bg-purple-900/50 text-[#7047EB] dark:text-purple-300 flex items-center justify-center">
                            <Settings2 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              Advanced Options
                              {showAdvanced && (
                                <span className="text-[10px] font-semibold bg-[#7047EB]/10 text-[#7047EB] px-2 py-0.5 rounded-full">
                                  {formProject.team.length + formProject.vendors.length} items
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Configure additional project settings (optional).
                            </p>
                          </div>
                        </div>
                        {showAdvanced ? (
                          <ChevronUp className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        )}
                      </button>

                      {showAdvanced && (
                        <div className="space-y-5 p-4 border-t border-[#ECE6FF] dark:border-purple-900/30 bg-white/80 dark:bg-slate-900/80">
                          {/* Team Members */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                <UserPlus className="h-4 w-4 text-[#7047EB]" /> Assign Team Members
                              </Label>
                              <span className="text-[10px] bg-[#7047EB]/10 text-[#7047EB] px-2 py-0.5 rounded-full font-bold">
                                {formProject.team.length} Selected
                              </span>
                            </div>
                            {formProject.department.length > 0 && (
                              <>
                                <label className="flex items-start gap-2 text-xs cursor-pointer bg-background border rounded-xl px-3 py-2">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 rounded border-slate-300 text-[#7047EB] focus:ring-[#7047EB]"
                                    checked={formProject.restrictToTeam}
                                    onChange={(e) => setFormProject({ ...formProject, restrictToTeam: e.target.checked })}
                                  />
                                  <span>
                                    <span className="font-medium text-slate-900 dark:text-slate-100">Restrict access to only the team members selected below.</span>{" "}
                                    <span className="text-slate-500">
                                      {formProject.restrictToTeam
                                        ? "Only the people listed below will see this project and its tasks — remove anyone you don't want to have access."
                                        : "Currently OFF: everyone in the selected department(s) can still see this project, even if removed from the list below."}
                                    </span>
                                  </span>
                                </label>
                                <p className="text-[11px] text-muted-foreground">
                                  Members of the selected department(s) are added here automatically.
                                  {formProject.restrictToTeam
                                    ? " Remove anyone below who should not see this project or its tasks."
                                    : " Turn on \"Restrict access\" above for removals here to actually take effect."}
                                </p>
                              </>
                            )}

                            {/* Search input for team members */}
                            <Input
                              placeholder="Search by name, code, designation, or department..."
                              value={teamMemberSearch}
                              onChange={(e) => setTeamMemberSearch(e.target.value)}
                              className="bg-background rounded-xl border-slate-200 text-xs"
                            />

                            <Select
                              value=""
                              onValueChange={(id) => {
                                addTeamMember(id);
                                setTeamMemberSearch("");
                              }}
                            >
                              <SelectTrigger className="w-full bg-background rounded-xl border-slate-200 text-xs">
                                <SelectValue placeholder={filteredEmployeesForPicker.length === 0 ? "No employees match search" : "Select employee to add..."} />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px] w-full rounded-xl">
                                {filteredEmployeesForPicker.length === 0 ? (
                                  <div className="p-2 text-xs text-muted-foreground">
                                    No employees found
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    {filteredSortedDepartments.map((dept) => (
                                      <div key={dept}>
                                        {/* Department Header */}
                                        <div className="px-3 py-1.5 text-[11px] font-bold uppercase text-[#7047EB] bg-purple-50/70 dark:bg-purple-950/40 sticky top-0">
                                          {dept}
                                        </div>
                                        {/* Employees in this department */}
                                        {filteredEmployeesByDepartment[dept].map((emp: any) => {
                                          const isSelected = formProject.team.includes(emp.id);
                                          return (
                                            <SelectItem
                                              key={emp.id}
                                              value={emp.id}
                                              disabled={isSelected}
                                              className={isSelected ? "opacity-50" : ""}
                                            >
                                              <div className="flex flex-col py-0.5 pl-2">
                                                <span className="font-medium text-xs">{emp.name}</span>
                                                <span className="text-[10px] text-muted-foreground">
                                                  {emp.designation || "N/A"} • {emp.empCode}
                                                </span>
                                              </div>
                                            </SelectItem>
                                          );
                                        })}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </SelectContent>
                            </Select>

                            <ScrollArea className="h-[120px] w-full rounded-xl border bg-background p-2">
                              {formProject.team.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                                  No team members assigned yet.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {formProject.team.map((id) => {
                                    const emp = employees.find((e) => String(e.id) === String(id));
                                    return (
                                      <div
                                        key={id}
                                        className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 group"
                                      >
                                        <div className="flex flex-col min-w-0">
                                          <span className="text-xs font-bold truncate">{emp?.name || id}</span>
                                          <span className="text-[9px] text-muted-foreground truncate uppercase">{emp?.designation || "Staff"}</span>
                                          {formProject.department.length > 0 && emp && !formProject.department.includes(emp.department) && (
                                            <span className="text-[9px] text-destructive">Inactive / Not in department</span>
                                          )}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                          onClick={() => removeTeamMember(id)}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </ScrollArea>
                          </div>

                          {/* Vendors (Manual Entry) */}
                          <div className="space-y-3 border-t pt-4">
                            <div className="flex items-center justify-between">
                              <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                <Users className="h-4 w-4 text-[#7047EB]" /> Vendors
                              </Label>
                              <span className="text-[10px] bg-[#7047EB]/10 text-[#7047EB] px-2 py-0.5 rounded-full font-bold">
                                {formProject.vendors.length} Added
                              </span>
                            </div>

                            <div className="flex gap-2">
                              <Input
                                value={vendorInput}
                                onChange={(e) => setVendorInput(e.target.value)}
                                placeholder="Type vendor name and press Add"
                                className="rounded-xl border-slate-200 text-xs"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addVendor();
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                onClick={addVendor}
                                className="bg-[#5D5FEF] hover:bg-[#4E50E6] text-white rounded-xl text-xs px-4"
                              >
                                Add
                              </Button>
                            </div>

                            {formProject.vendors.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">
                                No vendors added yet.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {formProject.vendors.map((vendor) => (
                                  <Badge
                                    key={vendor}
                                    variant="secondary"
                                    className="flex items-center gap-1 bg-[#F3EEFF] text-[#6335E8] border border-[#E4D7FE] rounded-lg px-2.5 py-1 text-xs"
                                  >
                                    {vendor}
                                    <button
                                      type="button"
                                      onClick={() => removeVendor(vendor)}
                                      className="ml-1 hover:text-destructive"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Live Project Overview Summary Card (5 cols on lg, 4 cols on xl) */}
                  <div className="lg:col-span-5 xl:col-span-4 sticky top-0">
                    <div className="bg-gradient-to-b from-[#FAF8FF] via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 border border-[#EDE7FF] dark:border-purple-900/30 rounded-2xl p-6 shadow-sm">
                      {/* Top Isometric Folders & Plus Illustration */}
                      <div className="relative h-32 flex items-center justify-center mb-4">
                        <div className="relative w-44 h-28 flex items-center justify-center">
                          {/* Ambient Purple Glow */}
                          <div className="absolute inset-0 bg-purple-400/20 rounded-full blur-xl transform scale-90" />

                          {/* SVG 3D Folders Illustration */}
                          <svg viewBox="0 0 180 120" className="w-full h-full relative z-10 drop-shadow-md">
                            {/* Back folder */}
                            <rect x="35" y="24" width="95" height="65" rx="10" fill="#DDD6FE" opacity="0.6" />
                            <path d="M 35 34 L 55 34 Q 65 34 72 24 L 115 24 Q 125 24 130 34" fill="#C4B5FD" opacity="0.8" />
                            {/* Middle document sheet */}
                            <rect x="45" y="16" width="80" height="60" rx="8" fill="#FFFFFF" stroke="#E9D5FF" strokeWidth="2" />
                            <line x1="55" y1="28" x2="85" y2="28" stroke="#DDD6FE" strokeWidth="2" strokeLinecap="round" />
                            <line x1="55" y1="36" x2="105" y2="36" stroke="#DDD6FE" strokeWidth="2" strokeLinecap="round" />
                            {/* Front folder */}
                            <rect x="25" y="36" width="115" height="64" rx="12" fill="url(#frontFolderGrad)" />
                            {/* Sparkle Stars */}
                            <path d="M 22 25 Q 23 20 28 19 Q 23 18 22 13 Q 21 18 16 19 Q 21 20 22 25 Z" fill="#A855F7" opacity="0.8" />
                            <path d="M 152 45 Q 153 42 156 41 Q 153 40 152 37 Q 151 40 148 41 Q 151 42 152 45 Z" fill="#A855F7" opacity="0.8" />
                            <defs>
                              <linearGradient id="frontFolderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#C4B5FD" />
                                <stop offset="100%" stopColor="#A78BFA" />
                              </linearGradient>
                            </defs>
                          </svg>

                          {/* Floating Circular + Badge */}
                          <div className="absolute right-6 bottom-4 z-20 h-9 w-9 rounded-full bg-[#7047EB] text-white flex items-center justify-center shadow-md shadow-purple-500/40">
                            <Plus className="h-5 w-5 stroke-[2.5]" />
                          </div>
                        </div>
                      </div>

                      {/* Header */}
                      <div className="mb-5">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                          Project Overview
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          A quick summary of the project details.
                        </p>
                      </div>

                      {/* Live Synchronized Metadata List */}
                      <div className="space-y-3.5 text-xs">
                        <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800">
                          <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                            <Layers className="h-3.5 w-3.5 text-[#7047EB]" /> Project Name
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100 text-right truncate max-w-[170px]">
                            {formProject.title || "Website Redesign"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800">
                          <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                            <Code2 className="h-3.5 w-3.5 text-[#7047EB]" /> Project Code
                          </span>
                          <span className={cn(
                            "text-right",
                            formProject.projectCode
                              ? "font-medium text-slate-700 dark:text-slate-300 font-mono"
                              : "text-slate-400 dark:text-slate-500 text-[11px] italic"
                          )}>
                            {formProject.projectCode || "Auto-generated"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800">
                          <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                            <CircleDot className="h-3.5 w-3.5 text-[#7047EB]" /> Status
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F0ECFF] dark:bg-purple-950/60 text-[#7047EB] dark:text-purple-300">
                            {formProject.status || "Planned"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800">
                          <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                            <Users className="h-3.5 w-3.5 text-[#7047EB]" /> Departments
                          </span>
                          <span className="font-medium text-slate-700 dark:text-slate-300 text-right truncate max-w-[170px]">
                            {formProject.department.length > 0 ? formProject.department.join(", ") : "None selected"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800">
                          <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                            <CalendarIcon className="h-3.5 w-3.5 text-[#7047EB]" /> Duration
                          </span>
                          <span className="font-medium text-slate-700 dark:text-slate-300 text-right">
                            {formProject.startDate && formProject.endDate
                              ? `${formatDisplayDate(formProject.startDate)} - ${formatDisplayDate(formProject.endDate)}`
                              : formProject.startDate
                              ? `From ${formatDisplayDate(formProject.startDate)}`
                              : "Timeline not set"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 py-1">
                          <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                            <BarChart3 className="h-3.5 w-3.5 text-[#7047EB]" /> Initial Progress
                          </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {formProject.progress || 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-7 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpenDialog(false);
                    setTeamMemberSearch("");
                  }}
                  className="rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 h-10 px-5 text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  disabled={isSavingProject}
                  onClick={handleSaveProject}
                  className="bg-[#5D5FEF] hover:bg-[#4E50E6] text-white font-semibold text-xs h-10 px-6 rounded-xl shadow-md shadow-[#5D5FEF]/25 active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4 stroke-[2.5]" />
                  {isSavingProject ? "Saving..." : modalMode === 'edit' ? "Update Project" :
                    modalMode === 'saveAs' ? "Create As Project" :
                      "Create Project"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>

      {/* KPI Summary Strip with Semantic Pastel Gradients & Unique White Vector Patterns */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. ACTIVE PROJECTS: Soft Lavender + 3D Isometric Diamond Cube Cluster */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#EAE6FE] via-[#E1D6FD] to-[#D7CBFA] border border-white/80 dark:border-slate-800 rounded-xl p-4 shadow-[0_3px_14px_rgba(167,139,250,0.15)] hover:shadow-[0_8px_22px_rgba(167,139,250,0.22)] transition-all duration-200">
          {/* Subtle Top Bevel Highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

          {/* Pattern 1: 3D Isometric Honeycomb Cube Cluster */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none select-none transition-transform duration-500 group-hover:scale-105" viewBox="0 0 220 95" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="175,18 198,32 175,46 152,32" fill="white" fillOpacity="0.75" />
            <polygon points="152,32 175,46 175,72 152,58" fill="white" fillOpacity="0.45" />
            <polygon points="175,46 198,32 198,58 175,72" fill="white" fillOpacity="0.60" />
            {/* Secondary isometric diamond */}
            <polygon points="138,44 154,53 138,62 122,53" fill="white" fillOpacity="0.60" />
            <polygon points="122,53 138,62 138,78 122,69" fill="white" fillOpacity="0.35" />
            <polygon points="138,62 154,53 154,69 138,78" fill="white" fillOpacity="0.50" />
            {/* Tertiary small top diamond */}
            <polygon points="200,56 212,63 200,70 188,63" fill="white" fillOpacity="0.55" />
            <line x1="105" y1="22" x2="148" y2="47" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="3 3" />
          </svg>

          <div className="relative z-10 flex flex-col justify-between h-full">
            <p className="text-[11px] font-bold text-[#4C1D95] uppercase tracking-wider">Active Projects</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#1E1B4B] font-display mt-1">{kpiStats.totalActive}</p>
            <p className="text-[10px] font-medium text-[#581C87]/75 mt-0.5">Tracked in real-time</p>
          </div>
        </div>

        {/* 2. OVERDUE: Soft Coral-Rose + Diagonal Speed Striations & Chevrons */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#FEE2E2] via-[#FECDD3] to-[#FDA4AF]/75 border border-white/80 dark:border-slate-800 rounded-xl p-4 shadow-[0_3px_14px_rgba(244,63,94,0.12)] hover:shadow-[0_8px_22px_rgba(244,63,94,0.20)] transition-all duration-200">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

          {/* Pattern 2: Diagonal Angled Speed Striations & Chevrons */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none select-none transition-transform duration-500 group-hover:scale-105" viewBox="0 0 220 95" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="125" y1="95" x2="185" y2="5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.70" />
            <line x1="148" y1="95" x2="208" y2="5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.55" />
            <line x1="105" y1="95" x2="165" y2="5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.38" strokeDasharray="5 3" />
            {/* Speed Chevrons */}
            <path d="M172 40 L184 48 L172 56" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.75" />
            <path d="M188 40 L200 48 L188 56" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.50" />
          </svg>

          <div className="relative z-10 flex flex-col justify-between h-full">
            <p className="text-[11px] font-bold text-[#9F1239] uppercase tracking-wider">Overdue</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#881337] font-display mt-1">{kpiStats.overdueCount}</p>
            <p className="text-[10px] font-medium text-[#9F1239]/75 mt-0.5">Requires immediate action</p>
          </div>
        </div>

        {/* 3. TOTAL KEY STEPS: Soft Ice-Indigo + Ascending Stage Staircase */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#E0E7FF] via-[#C7D2FE] to-[#A5B4FC]/70 border border-white/80 dark:border-slate-800 rounded-xl p-4 shadow-[0_3px_14px_rgba(99,102,241,0.12)] hover:shadow-[0_8px_22px_rgba(99,102,241,0.20)] transition-all duration-200">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

          {/* Pattern 3: Ascending Multi-Tier Step Elevation Staircase */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none select-none transition-transform duration-500 group-hover:scale-105" viewBox="0 0 220 95" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 125 78 L 145 78 L 145 56 L 168 56 L 168 35 L 192 35 L 192 16 L 210 16" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.80" />
            <rect x="145" y="56" width="23" height="22" fill="white" fillOpacity="0.25" rx="1" />
            <rect x="168" y="35" width="24" height="43" fill="white" fillOpacity="0.35" rx="1" />
            <rect x="192" y="16" width="18" height="62" fill="white" fillOpacity="0.45" rx="1" />
            <line x1="112" y1="78" x2="212" y2="78" stroke="white" strokeWidth="1.5" strokeOpacity="0.45" strokeDasharray="4 4" />
          </svg>

          <div className="relative z-10 flex flex-col justify-between h-full">
            <p className="text-[11px] font-bold text-[#1E40AF] uppercase tracking-wider">Total Key Steps</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#172554] font-display mt-1">{kpiStats.totalKeySteps}</p>
            <p className="text-[10px] font-medium text-[#1E40AF]/75 mt-0.5">Phase milestones defined</p>
          </div>
        </div>

        {/* 4. AVG PROGRESS: Soft Mint-Emerald + Fluid Wave Contour Streams */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#D1FAE5] via-[#A7F3D0] to-[#6EE7B7]/70 border border-white/80 dark:border-slate-800 rounded-xl p-4 shadow-[0_3px_14px_rgba(16,185,129,0.12)] hover:shadow-[0_8px_22px_rgba(16,185,129,0.20)] transition-all duration-200">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

          {/* Pattern 4: Fluid Sinusoidal Wave Contour Streams */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none select-none transition-transform duration-500 group-hover:scale-105" viewBox="0 0 220 95" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 100 62 Q 130 26 160 62 T 220 62" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.75" />
            <path d="M 115 48 Q 145 12 175 48 T 220 48" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.55" strokeDasharray="5 3" />
            <path d="M 130 76 Q 160 40 190 76 T 220 76" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.40" />
            <circle cx="160" cy="32" r="3.5" fill="white" fillOpacity="0.85" />
            <circle cx="188" cy="46" r="2" fill="white" fillOpacity="0.60" />
          </svg>

          <div className="relative z-10 flex flex-col justify-between h-full">
            <p className="text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Avg Progress</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#022C22] font-display mt-1">{kpiStats.avgProgress}%</p>
            <p className="text-[10px] font-medium text-[#065F46]/75 mt-0.5">Overall health score</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64 md:w-72 sm:focus-within:w-96 md:focus-within:w-[420px] lg:focus-within:w-[480px] transition-all duration-300 ease-out">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl h-10 w-full transition-all duration-300 shadow-2xs font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <ProjectFilters
            clientFilter={clientFilter}
            setClientFilter={setClientFilter}
            clients={clients}
            departmentFilter={departmentFilter}
            setDepartmentFilter={setDepartmentFilter}
            departments={departments}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            searchQuery={searchTerm}
            setSearchQuery={setSearchTerm}
            customFilters={customFilters}
            setCustomFilters={setCustomFilters}
            onClearAll={onClearAllFilters}
            onApply={() => fetchProjects()}
            savedFilterSets={savedFilterSets}
            setSavedFilterSets={setSavedFilterSets}
            employeeFilter={employeeFilter}
            setEmployeeFilter={setEmployeeFilter}
            employees={employees}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
          />

          <ManageColumns columns={columnsConfig} setColumns={setColumnsConfig} defaultColumns={defaultProjectColumns} />

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
            onClick={() => setShowCompleted(prev => !prev)}
            className={cn(
              "h-9 px-3 min-w-[100px] justify-center text-xs flex items-center gap-2 shadow-sm transition-all duration-150 hover:shadow-md",
              showCompleted ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            Completed
          </Button>

          {(searchTerm || clientFilter.length > 0 || departmentFilter.length > 0 || statusFilter.length > 0 || employeeFilter.length > 0 || startDate || endDate || customFilters.length > 0 || showCompleted) && (
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

        <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200 w-full md:w-auto">
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="w-full md:w-48 h-8 text-xs border-none bg-transparent focus:ring-0">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Project Name (A–Z)</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="startDate">Start Date</SelectItem>
              <SelectItem value="endDate">End Date</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-500 hover:text-blue-600"
            onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          >
            {sortDir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* ENTERPRISE ZERO-GAP UNIFIED PROJECT TABLE */}
      <Card className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_2px_12px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.02] overflow-hidden font-sans">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600 mb-4" />
            <p className="text-slate-500 font-sans">Loading projects...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-sans">No projects found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* Table Column Header Strip */}
            <div className="hidden lg:flex items-center justify-between px-6 py-3 bg-[#F2F3FF] dark:bg-slate-800/60 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-b border-slate-200/60 dark:border-slate-800 select-none">
              <div className="flex-1 min-w-[260px]">Project & Progress</div>
              <div className="flex items-center gap-6">
                {isColVisible("client") && <div className="w-32 text-left">Owner / Client</div>}
                {isColVisible("startDate") && <div className="w-24 text-left">Start Date</div>}
                {isColVisible("endDate") && <div className="w-24 text-left">End Date</div>}
                {isColVisible("status") && <div className="w-28 text-center">Status</div>}
                <div className="min-w-[220px] text-right pr-2">Work Items & Details</div>
              </div>
            </div>

            {(() => {
              let lastGroup: string | null = null;
              return sortedProcessedProjects.map(project => {
                let groupHeader = null;
                if (employeeFilter.length > 0 && project._group !== lastGroup) {
                  lastGroup = project._group;
                  const firstEmpId = employeeFilter[0];
                  const selectedEmployeeObj = employees.find(e => String(e.id) === firstEmpId);
                  const employeeName = selectedEmployeeObj ? selectedEmployeeObj.name : "";
                  if (project._group === "assigned") {
                    groupHeader = (
                      <div className="flex items-center gap-2 px-6 py-2 bg-blue-50/60 dark:bg-blue-950/30 border-y border-blue-100 dark:border-blue-900/50">
                        <span className="text-xs font-bold text-blue-600 uppercase tracking-wider font-sans">Assigned to {employeeName}</span>
                        <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-[10px] font-bold h-4 px-1.5 flex items-center justify-center rounded">
                          {sortedProcessedProjects.filter(p => p._group === "assigned").length}
                        </Badge>
                      </div>
                    );
                  } else if (project._group === "dept") {
                    groupHeader = (
                      <div className="flex items-center gap-2 px-6 py-2 bg-slate-100/60 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-sans">Department Related</span>
                        <Badge variant="secondary" className="text-[10px] font-bold h-4 px-1.5 flex items-center justify-center rounded">
                          {sortedProcessedProjects.filter(p => p._group === "dept").length}
                        </Badge>
                      </div>
                    );
                  }
                }

                // Count keysteps and tasks for this project, respecting department visibility rules
                const keystepCount = allKeySteps.filter(ks => {
                  if (String(ks.projectId) !== String(project.id)) return false;
                  if (ks.parentKeyStepId) return false;
                  if (isAdmin) return true;
                  return !(ks as any).department || String((ks as any).department).trim() === "" || String((ks as any).department).toLowerCase() === String(userDepartment).toLowerCase();
                }).length;

                const taskCount = allTasks.filter(t => {
                  if (String(t.projectId) !== String(project.id)) return false;
                  if (isAdmin) return true;
                  return !(t as any).department || String((t as any).department).trim() === "" || String((t as any).department).toLowerCase() === String(userDepartment).toLowerCase();
                }).length;

                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const projectEnd = project.endDate ? new Date(project.endDate) : null;
                const isProjectOverdue = !!(projectEnd && projectEnd < today && String((project.status || "")).toLowerCase() !== "completed");

                const isEditingField = (field: string) => inlineEdit?.projectId === project.id && inlineEdit?.field === field;

                return (
                  <React.Fragment key={project.id}>
                    {groupHeader}
                    <div
                      className={cn(
                        "group p-4 px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer transition-all duration-150",
                        isProjectOverdue
                          ? "bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100/60 border-l-4 border-l-red-500"
                          : "hover:bg-[#F2F3FF] dark:hover:bg-slate-800/60"
                      )}
                      onClick={() => setSelectedDetailProject(project)}
                      title="Click row to view full project details"
                    >
                      {/* Left Column: Title, Last Worked, Progress */}
                      <div className="flex-1 min-w-[260px]">
                        <div className="flex items-center gap-2">
                          {isEditingField("title") ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <Input
                                autoFocus
                                value={inlineValue}
                                onChange={(e) => setInlineValue(e.target.value)}
                                className="h-7 text-sm font-bold w-60"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveInlineEdit(project.id, "title", inlineValue);
                                  if (e.key === "Escape") cancelInlineEdit();
                                }}
                              />
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveInlineEdit(project.id, "title", inlineValue)}><Check className="h-3 w-3 text-emerald-600" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelInlineEdit}><X className="h-3 w-3 text-red-500" /></Button>
                            </div>
                          ) : (
                            <span
                              className={cn(
                                "leading-tight hover:text-blue-600 hover:underline decoration-dotted cursor-pointer transition-colors text-[15px]",
                                isProjectOverdue ? "text-red-700 dark:text-red-400 font-bold" : "font-bold text-slate-900 dark:text-white"
                              )}
                              onClick={(e) => { e.stopPropagation(); startInlineEdit(project.id, "title", project.title); }}
                              title="Click to edit title"
                            >
                              {project.title}
                            </span>
                          )}
                          {project.projectCode && (
                            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200/60">
                              {project.projectCode}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                          <ProjectLastWorked projectId={project.id} />
                          {String(project.status).toLowerCase() === "on hold" && project.holdReason ? (
                            <p className="text-xs text-amber-700 dark:text-amber-400 line-clamp-1">Hold: {project.holdReason}</p>
                          ) : null}
                        </div>

                        {isColVisible("progress") && (
                          <div className="mt-2 w-48 hidden sm:block" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center text-[10px] text-muted-foreground font-medium mb-1">
                              <span>Progress</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">{project.progress || 0}%</span>
                            </div>
                            <Progress value={project.progress || 0} className="h-1.5" />
                          </div>
                        )}
                      </div>

                      {/* Right Columns: Client, Dates, Status, Badges & Action */}
                      <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 lg:gap-6">
                        {/* Client Name */}
                        {isColVisible("client") && (
                          <div
                            className="w-32 text-sm text-slate-600 dark:text-slate-400 truncate cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={(e) => { e.stopPropagation(); startInlineEdit(project.id, "clientName", project.clientName || ""); }}
                            title="Click to edit client"
                          >
                            {isEditingField("clientName") ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  autoFocus
                                  value={inlineValue}
                                  onChange={(e) => setInlineValue(e.target.value)}
                                  className="h-6 text-xs w-28"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveInlineEdit(project.id, "clientName", inlineValue);
                                    if (e.key === "Escape") cancelInlineEdit();
                                  }}
                                />
                                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => saveInlineEdit(project.id, "clientName", inlineValue)}><Check className="h-3 w-3 text-emerald-600" /></Button>
                                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={cancelInlineEdit}><X className="h-3 w-3 text-red-500" /></Button>
                              </div>
                            ) : (
                              <span>{project.clientName || employees.find(e => String(e.id) === String(project.createdByEmployeeId))?.name || "-"}</span>
                            )}
                          </div>
                        )}

                        {/* Start Date */}
                        {isColVisible("startDate") && (
                          <div
                            className="w-24 text-xs text-slate-600 dark:text-slate-400 cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              startInlineEdit(project.id, "startDate", project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : "");
                            }}
                            title="Click to edit start date"
                          >
                            {isEditingField("startDate") ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  type="date"
                                  autoFocus
                                  value={inlineValue}
                                  onChange={(e) => setInlineValue(e.target.value)}
                                  className="h-6 text-xs w-28"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveInlineEdit(project.id, "startDate", inlineValue);
                                    if (e.key === "Escape") cancelInlineEdit();
                                  }}
                                />
                                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => saveInlineEdit(project.id, "startDate", inlineValue)}><Check className="h-3 w-3 text-emerald-600" /></Button>
                                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={cancelInlineEdit}><X className="h-3 w-3 text-red-500" /></Button>
                              </div>
                            ) : (
                              <span>{formatDate(project.startDate)}</span>
                            )}
                          </div>
                        )}

                        {/* End Date */}
                        {isColVisible("endDate") && (
                          <div
                            className={cn(
                              "w-24 text-xs cursor-pointer hover:text-blue-600 transition-colors",
                              isProjectOverdue ? "text-red-600 dark:text-red-400 font-semibold" : "text-slate-600 dark:text-slate-400"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              startInlineEdit(project.id, "endDate", project.endDate ? new Date(project.endDate).toISOString().split("T")[0] : "");
                            }}
                            title="Click to edit end date"
                          >
                            {isEditingField("endDate") ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  type="date"
                                  autoFocus
                                  value={inlineValue}
                                  min={project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : undefined}
                                  onChange={(e) => {
                                    const newEndDate = e.target.value;
                                    const startStr = project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : "";
                                    setInlineValue(startStr && newEndDate && newEndDate < startStr ? startStr : newEndDate);
                                  }}
                                  className="h-6 text-xs w-28"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveInlineEdit(project.id, "endDate", inlineValue);
                                    if (e.key === "Escape") cancelInlineEdit();
                                  }}
                                />
                                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => saveInlineEdit(project.id, "endDate", inlineValue)}><Check className="h-3 w-3 text-emerald-600" /></Button>
                                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={cancelInlineEdit}><X className="h-3 w-3 text-red-500" /></Button>
                              </div>
                            ) : (
                              <span>{project.endDate ? formatDate(project.endDate) : "Not set"}</span>
                            )}
                          </div>
                        )}

                        {/* Status */}
                        {isColVisible("status") && (
                          <div className="w-28 flex justify-center" onClick={(e) => e.stopPropagation()}>
                            <Popover
                              open={isEditingField("status")}
                              onOpenChange={(open) => open ? startInlineEdit(project.id, "status", project.status) : cancelInlineEdit()}
                            >
                              <PopoverTrigger asChild>
                                <button className="cursor-pointer hover:opacity-80 transition-opacity" title="Click to change status">
                                  {getStatusBadge(project.status)}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="p-0 w-40" align="center">
                                <Command>
                                  <CommandList>
                                    <CommandGroup>
                                      {["Not Started", "Planned", "In Progress", "On Hold", "Completed", "Cancelled"].map((s) => (
                                        <CommandItem
                                          key={s}
                                          onSelect={() => {
                                            if (s === "Completed") {
                                              saveInlineEdit(project.id, "status", s);
                                              saveInlineEdit(project.id, "progress", "100");
                                            } else {
                                              saveInlineEdit(project.id, "status", s);
                                            }
                                          }}
                                        >
                                          <Check className={cn("mr-2 h-4 w-4", project.status === s ? "opacity-100" : "opacity-0")} />
                                          {s}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}

                        {/* Navigation Badges & Actions */}
                        <div className="min-w-[220px] flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {isColVisible("keySteps") && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-6 px-2 border-slate-200 cursor-pointer hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                localStorage.setItem("selectedProjectId", project.id);
                                setLocation(`/key-steps?project_id=${project.id}`);
                              }}
                              title="Go to Key Steps for this project"
                            >
                              Steps: {keystepCount}
                            </Badge>
                          )}
                          {isColVisible("tasks") && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-6 px-2 border-slate-200 cursor-pointer hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                localStorage.setItem("selectedProjectId", project.id);
                                localStorage.setItem("tasks_projectId", project.id);
                                localStorage.setItem("tasks_keyStepId", "");
                                localStorage.setItem("tasks_searchQuery", "");
                                localStorage.setItem("tasks_clientFilter", "all");
                                localStorage.setItem("tasks_departmentFilter", "all");
                                localStorage.setItem("tasks_statusFilter", "all");
                                localStorage.setItem("tasks_assigneeFilter", "all");
                                setLocation(`/tasks?project_id=${project.id}`);
                              }}
                              title="Go to Tasks for this project"
                            >
                              Tasks: {taskCount}
                            </Badge>
                          )}

                          <Button
                            variant={String(frozenProjectId) === String(project.id) ? "default" : "ghost"}
                            size="icon"
                            className={cn(
                              "h-7 w-7",
                              String(frozenProjectId) === String(project.id)
                                ? "bg-sky-600 hover:bg-sky-700 text-white"
                                : "border-slate-200 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFreezeProjectRow(project);
                            }}
                            title={String(frozenProjectId) === String(project.id) ? `Frozen: ${project.title}` : "Freeze this project"}
                          >
                            <Snowflake className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTimelineProject(project);
                              setTimelineDialogOpen(true);
                            }}
                            title="View Project Timeline & Gantt Chart"
                          >
                            <GanttChartSquare className="h-3.5 w-3.5" />
                          </Button>

                          {/* Touch / Click Details Button to pop card forward */}
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 px-2.5 text-xs font-semibold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/80 transition-colors gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDetailProject(project);
                            }}
                            title="Open full project details"
                          >
                            <span>Details</span>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              });
            })()}
          </div>
        )}
      </Card>

      {/* POP-FORWARD PROJECT DETAIL MODAL */}
      <Dialog
        open={!!selectedDetailProject}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDetailProject(null);
            cancelInlineEdit();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col font-sans border-slate-200 dark:border-slate-800 shadow-2xl">
          {(() => {
            if (!selectedDetailProject) return null;
            const project = projects.find((p: any) => p.id === selectedDetailProject.id) || selectedDetailProject;
            const isEditingField = (field: string) => inlineEdit?.projectId === project.id && inlineEdit?.field === field;

            return (
              <>
                {/* Modal Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200/60 flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {project.projectCode || "NO CODE"}
                      </span>
                      {getStatusBadge(project.status)}
                      {project.endDate && new Date(project.endDate) < new Date() && String(project.status).toLowerCase() !== "completed" && (
                        <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-wider">
                          Overdue
                        </Badge>
                      )}
                    </div>
                    <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white truncate">
                      {project.title}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500 mt-0.5">
                      Managed project overview, analytics, files, and timeline tracking
                    </DialogDescription>
                  </div>

                  {/* Header Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-slate-700 dark:text-slate-300"
                      onClick={() => handleOpenEdit(project)}
                      title="Edit Project"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Edit</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-slate-700 dark:text-slate-300"
                      onClick={() => handleCloneProject(project)}
                      disabled={cloningProjectId === project.id}
                      title="Clone Project"
                    >
                      <Copy className={cn("h-3.5 w-3.5", cloningProjectId === project.id && "animate-pulse")} />
                      <span className="hidden sm:inline">Clone</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50 border-indigo-200"
                      onClick={() => {
                        setTimelineProject(project);
                        setTimelineDialogOpen(true);
                      }}
                      title="Gantt Timeline"
                    >
                      <GanttChartSquare className="h-3.5 w-3.5 text-indigo-600" />
                      <span className="hidden sm:inline">Gantt</span>
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => {
                        setDeleteConfirmOpen(true);
                        setProjectToDelete(project.id);
                      }}
                      title="Delete Project"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </Button>
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center px-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 gap-2">
                  <button
                    onClick={() => setDetailActiveTab("overview")}
                    className={cn(
                      "py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors",
                      detailActiveTab === "overview"
                        ? "border-blue-600 text-blue-600 font-bold"
                        : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <Briefcase className="h-3.5 w-3.5" />
                    <span>Overview & Scope</span>
                  </button>
                  <button
                    onClick={() => setDetailActiveTab("time")}
                    className={cn(
                      "py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors",
                      detailActiveTab === "time"
                        ? "border-blue-600 text-blue-600 font-bold"
                        : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>Timestrap Time Analytics</span>
                  </button>
                  <button
                    onClick={() => setDetailActiveTab("files")}
                    className={cn(
                      "py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors",
                      detailActiveTab === "files"
                        ? "border-blue-600 text-blue-600 font-bold"
                        : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Files & Attachments</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {projectFiles[project.id]?.length || 0}
                    </Badge>
                  </button>
                </div>

                {/* Modal Scrollable Body */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-170px)] space-y-6 CustomScroll">
                  {/* TAB 1: OVERVIEW */}
                  {detailActiveTab === "overview" && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      {/* Description & Inline edit */}
                      <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <Pencil className="h-3.5 w-3.5 text-blue-600" />
                            Description
                          </p>
                          <span className="text-[10px] text-slate-400">Click text to edit</span>
                        </div>
                        {isEditingField("description") ? (
                          <div className="space-y-2">
                            <Textarea
                              autoFocus
                              value={inlineValue}
                              onChange={(e) => setInlineValue(e.target.value)}
                              className="text-sm min-h-[70px] bg-white dark:bg-slate-900"
                              onKeyDown={(e) => {
                                if (e.key === "Escape") cancelInlineEdit();
                              }}
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <Button size="sm" variant="ghost" onClick={cancelInlineEdit}>Cancel</Button>
                              <Button size="sm" onClick={() => saveInlineEdit(project.id, "description", inlineValue)}>Save Description</Button>
                            </div>
                          </div>
                        ) : (
                          <p
                            className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed cursor-pointer hover:bg-white dark:hover:bg-slate-800 p-2 rounded transition-colors whitespace-pre-wrap"
                            onClick={() => startInlineEdit(project.id, "description", project.description || "")}
                            title="Click to edit description"
                          >
                            {project.description ? (
                              project.description
                            ) : (
                              <span className="text-slate-400 italic">No description provided. Click to add a description...</span>
                            )}
                          </p>
                        )}
                      </div>

                      {/* 3-Column Metadata Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Client Card */}
                        <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-blue-600" />
                            Client
                          </p>
                          {isEditingField("clientName_detail") ? (
                            <div className="flex items-center gap-2">
                              <Input
                                autoFocus
                                value={inlineValue}
                                onChange={(e) => setInlineValue(e.target.value)}
                                className="h-8 text-sm"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveInlineEdit(project.id, "clientName", inlineValue);
                                  if (e.key === "Escape") cancelInlineEdit();
                                }}
                              />
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveInlineEdit(project.id, "clientName", inlineValue)}><Check className="h-3.5 w-3.5 text-emerald-600" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelInlineEdit}><X className="h-3.5 w-3.5 text-red-500" /></Button>
                            </div>
                          ) : (
                            <p
                              className="text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={() => startInlineEdit(project.id, "clientName_detail", project.clientName || "")}
                              title="Click to edit client name"
                            >
                              {project.clientName || <span className="text-slate-400 italic font-normal">Click to assign client</span>}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400">Created by {employees.find(e => String(e.id) === String(project.createdByEmployeeId))?.name || "Admin"}</p>
                        </div>

                        {/* Departments Card */}
                        <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-blue-600" />
                              Departments
                            </p>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-slate-100">
                                  <Settings2 className="h-3.5 w-3.5 text-slate-500" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-0" align="end">
                                <Command>
                                  <CommandInput placeholder="Search departments..." className="h-8" />
                                  <CommandList>
                                    <CommandEmpty>No department found.</CommandEmpty>
                                    <CommandGroup heading="Project Departments">
                                      {departments.map((dept) => {
                                        const isChecked = (project.department || []).some((d: string) => normalizeDept(d) === normalizeDept(dept));
                                        return (
                                          <CommandItem
                                            key={dept}
                                            onSelect={() => toggleProjectDepartment(project.id, dept)}
                                            className="flex items-center gap-2 cursor-pointer"
                                          >
                                            <div className={cn(
                                              "w-4 h-4 border rounded flex items-center justify-center transition-colors",
                                              isChecked ? "bg-primary border-primary" : "border-muted-foreground/30"
                                            )}>
                                              {isChecked && <X className="h-3 w-3 text-primary-foreground stroke-[3px]" />}
                                            </div>
                                            <span className="text-xs">{dept}</span>
                                          </CommandItem>
                                        );
                                      })}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {project.department && project.department.length > 0 ? (
                              project.department.map((dept: string) => (
                                <Badge key={dept} variant="secondary" className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                                  {dept}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400 italic">None assigned</span>
                            )}
                          </div>
                        </div>

                        {/* Vendors & Team Size Card */}
                        <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-blue-600" />
                            Vendors & Team
                          </p>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">Team Size:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{project.team?.length || 0} Members</span>
                          </div>
                          <div className="pt-1">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Vendors:</span>
                            <div className="flex flex-wrap gap-1">
                              {project.vendors?.length ? (
                                project.vendors.map((v: string) => (
                                  <Badge key={v} variant="outline" className="text-[10px] py-0 bg-slate-50 text-slate-700">
                                    {v}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400 italic">No external vendors</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Timeline Dates & Navigation Banner */}
                      <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-6">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Start Date</span>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{formatDate(project.startDate)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Target Completion</span>
                            <span className={cn("text-xs font-semibold", project.endDate && new Date(project.endDate) < new Date() ? "text-red-600 font-bold" : "text-slate-800 dark:text-slate-200")}>
                              {project.endDate ? formatDate(project.endDate) : "Not set"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Overall Progress</span>
                            <span className="text-xs font-bold text-blue-600">{project.progress || 0}%</span>
                          </div>
                        </div>

                        {/* Direct Jump to Key Steps and Tasks */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs font-semibold h-8 gap-1.5 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                            onClick={() => {
                              setSelectedDetailProject(null);
                              localStorage.setItem("selectedProjectId", project.id);
                              setLocation(`/key-steps?project_id=${project.id}`);
                            }}
                          >
                            <span>Open Key Steps</span>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs font-semibold h-8 gap-1.5 border-slate-200 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300"
                            onClick={() => {
                              setSelectedDetailProject(null);
                              localStorage.setItem("selectedProjectId", project.id);
                              localStorage.setItem("tasks_projectId", project.id);
                              localStorage.setItem("tasks_keyStepId", "");
                              localStorage.setItem("tasks_searchQuery", "");
                              localStorage.setItem("tasks_clientFilter", "all");
                              localStorage.setItem("tasks_departmentFilter", "all");
                              localStorage.setItem("tasks_statusFilter", "all");
                              localStorage.setItem("tasks_assigneeFilter", "all");
                              setLocation(`/tasks?project_id=${project.id}`);
                            }}
                          >
                            <span>Open Tasks</span>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: TIMESTRAP TIME TRACKING */}
                  {detailActiveTab === "time" && (
                    <div className="animate-in fade-in duration-200">
                      <ProjectDetailsWithCounts project={project} />
                    </div>
                  )}

                  {/* TAB 3: FILES */}
                  {detailActiveTab === "files" && (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Project Documents & Assets</h4>
                          <p className="text-xs text-slate-500">Upload design assets, specifications, and project deliverables</p>
                        </div>
                        <div>
                          <Input
                            type="file"
                            id={`modal-file-up-${project.id}`}
                            className="hidden"
                            onChange={e => e.target.files?.[0] && handleFileUpload(project.id, e.target.files[0])}
                          />
                          <Label
                            htmlFor={`modal-file-up-${project.id}`}
                            className="text-xs font-bold uppercase bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2 shadow-sm"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            Upload File
                          </Label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {projectFiles[project.id]?.length ? (
                          projectFiles[project.id].map((f: any) => (
                            <div
                              key={f.id}
                              className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-600 shrink-0">
                                  <FileIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <a
                                    href={f.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 truncate block max-w-md"
                                  >
                                    {f.fileName}
                                  </a>
                                  <span className="text-[10px] text-slate-400">Uploaded {f.createdAt ? formatDate(f.createdAt) : "Recently"}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  title="Download / View"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                                <button
                                  onClick={() => confirm(`Delete ${f.fileName}?`) && apiFetch(`/api/projects/${project.id}/files/${f.id}`, { method: "DELETE" }).then(res => res.ok && setProjectFiles(p => ({ ...p, [project.id]: p[project.id].filter((x: any) => x.id !== f.id) })))}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                  title="Delete File"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                            <Upload className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">No files uploaded yet</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Click the upload button above to attach documents</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    Project ID: {project.id}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDetailProject(null)}
                    className="text-xs font-semibold"
                  >
                    Close
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* BLUE LOTTIE DELETE CONFIRMATION MODAL */}
      <DeleteConfirmModal
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Project"
        description="Are you sure you want to delete this project? All project steps, tasks, and attachments will be permanently removed."
        confirmText="Delete Project"
        onConfirm={async () => {
          if (projectToDelete) {
            await handleDeleteProject(projectToDelete);
          }
          setDeleteConfirmOpen(false);
          setProjectToDelete(null);
          if (selectedDetailProject?.id === projectToDelete) {
            setSelectedDetailProject(null);
          }
        }}
      />

      {/* PROJECT TIMELINE & GANTT CHART DIALOG */}
      <ProjectTimelineDialog
        open={timelineDialogOpen}
        onOpenChange={(o) => { setTimelineDialogOpen(o); if (!o) setTimelineProject(null); }}
        project={timelineProject}
        employees={employees}
      />

      {/* SUCCESS SEND (PROJECT CREATED) MODAL */}
      <SuccessSendModal
        open={createdProjectSuccessOpen}
        onOpenChange={setCreatedProjectSuccessOpen}
        title="Project Created!"
        itemName={createdProjectTitle}
        description="Successfully created and launched into your project roadmap."
      />

      {/* SUCCESS CELEBRATION (PROJECT COMPLETED) MODAL */}
      <SuccessCelebrationModal
        open={celebrationModalOpen}
        onOpenChange={setCelebrationModalOpen}
        title="Project Completed!"
        itemName={celebrationProjectTitle}
        description="Congratulations! All milestones and deliverables for this project have been achieved."
      />
    </div>
  );
}