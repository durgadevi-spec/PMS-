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
  const { isFrozen, frozenProjectId } = useFreeze();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.employeeCode === "E0001";
  const userDepartment = user?.department || null;
  const [projects, setProjects] = useState<any[]>([]);
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
    vendors: [] as string[]
  });
  const [isSavingProject, setIsSavingProject] = useState(false);
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
    try {
      const res = await apiFetch("/api/projects?status=all&_t=" + Date.now());
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
      } else {
        const empData = await empRes.json();
        console.log("Loaded employees:", empData);
        setEmployees(Array.isArray(empData) ? empData : []);
      }
    } catch (err) {
      console.error("Error fetching employees:", err);
      setEmployees([]);
    }
  };

  useEffect(() => {
    // Load employees, departments, and projects in parallel
    const loadInitialData = async () => {
      try {
        const [empRes, deptRes, projRes] = await Promise.all([
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
          (async () => {
            try {
              const projRes = await apiFetch("/api/projects?status=all&_t=" + Date.now());
              if (!projRes.ok) throw new Error(`HTTP ${projRes.status}`);
              return await projRes.json();
            } catch (err: any) {
              console.error("Failed to fetch projects", err);
              toast({ variant: "destructive", title: "Failed to load projects", description: err?.message || "Unknown error" });
              return [];
            }
          })(),
        ]);

        // Set employees
        setEmployees(Array.isArray(empRes) ? empRes : []);

        // Set departments with deduplication
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

        // Set projects and derive clients
        setProjects(projRes);
        const clientSet = new Set<string>();
        if (Array.isArray(projRes)) {
          projRes.forEach((p: any) => { if (p.clientName) clientSet.add(String(p.clientName)); });
        }
        setClients(Array.from(clientSet));
      } catch (err) {
        console.error("Error during parallel data load:", err);
      }
    };

    loadInitialData();

    // Load supplementary data (keysteps, tasks, subtasks) in parallel but don't block main load
    Promise.all([
      apiFetch("/api/keysteps/bulk?status=all&_t=" + Date.now())
        .then(r => r.json())
        .then(data => setAllKeySteps(Array.isArray(data) ? data : []))
        .catch(() => setAllKeySteps([])),
      apiFetch("/api/tasks/bulk?status=all&_t=" + Date.now())
        .then(r => r.json())
        .then(data => setAllTasks(Array.isArray(data) ? data : []))
        .catch(() => setAllTasks([])),
      apiFetch("/api/subtasks/bulk?status=all&_t=" + Date.now())
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
      vendors: []
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

    setFormProject({
      title: project.title,
      projectCode: project.projectCode || "",
      department: project.department ?? [],
      clientName: project.clientName || "",
      description: project.description || "",
      company: project.company || "",
      startDate: project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : "",
      endDate: project.endDate ? new Date(project.endDate).toISOString().split("T")[0] : "",
      progress: project.progress || 0,
      status: project.status || "Planned",
      holdReason: project.holdReason || "",
      team: project.team || [],
      vendors: project.vendors || [],
    });

    setTeamMemberSearch("");
    // Refresh employees before opening dialog
    fetchEmployees().then(() => {
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
              title: "Duplicate Project Code",
              description: "This code exists. Leave empty to auto-generate.",
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

  useEffect(() => {
    localStorage.setItem("projects_sort_key", sortKey);
    localStorage.setItem("projects_sort_dir", sortDir);
  }, [sortKey, sortDir]);

  return (
    <div className="space-y-6">
      {/* New Project Button & Dialog */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1 font-sans">Create and manage your projects.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setLocation("/tickets?tab=raise")} className="bg-white border-primary/20 text-primary hover:bg-primary/5">
            <Ticket className="mr-2 h-4 w-4" />
            Raise Ticket
          </Button>

          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            {/* Button to open modal */}
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>

            {/* Dialog Content */}
            <DialogContent className="max-w-none w-screen h-screen m-0 rounded-none overflow-y-auto">
              <DialogHeader className="px-6 pt-6">
                <DialogTitle className="text-2xl font-display">
                  {editingId ? "Edit Project" : "Create New Project"}
                </DialogTitle>
                <DialogDescription className="font-sans">
                  {editingId
                    ? "Update project details and team assignments."
                    : "Add a new project with team members and key steps."}
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 space-y-8 font-sans py-4 max-w-5xl mx-auto">
                {/* Project Name, Code & Status */}
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="title" className="font-bold">Project Name <span className="text-destructive">*</span></Label>
                    <Input
                      id="title"
                      value={formProject.title}
                      onChange={(e) => setFormProject({ ...formProject, title: e.target.value })}
                      placeholder="e.g., Website Redesign"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="projectCode">Project Code <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Input
                      id="projectCode"
                      value={formProject.projectCode}
                      onChange={(e) => setFormProject({ ...formProject, projectCode: e.target.value })}
                      placeholder="e.g., K-2025-001 (optional - leave empty to auto-generate)"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to auto-generate or enter a unique code
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Project Status <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Select
                      value={formProject.status || "Planned"}
                      onValueChange={(v) => {
                        const updates: any = { status: v };
                        if (v === "Completed") updates.progress = 100;
                        setFormProject({ ...formProject, ...updates });
                      }}
                    >
                      <SelectTrigger id="status">
                        <SelectValue placeholder="Select Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Not Started">Not Started</SelectItem>
                        <SelectItem value="Planned">Planned</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="On Hold">On Hold</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formProject.status === "On Hold" && (
                  <div className="space-y-2">
                    <Label htmlFor="holdReason">Hold Reason <span className="text-destructive">*</span></Label>
                    <Textarea
                      id="holdReason"
                      value={formProject.holdReason}
                      onChange={(e) => setFormProject({ ...formProject, holdReason: e.target.value })}
                      placeholder="Why is this project on hold?"
                      className="min-h-[100px]"
                    />
                    <p className="text-xs text-muted-foreground">A reason is required when project status is On Hold.</p>
                  </div>
                )}

                {/* Client & Departments */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="clientName">Client Name <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Input
                      id="clientName"
                      value={formProject.clientName}
                      onChange={(e) => setFormProject({ ...formProject, clientName: e.target.value })}
                      placeholder="e.g., Acme Corp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Departments <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <div className="grid grid-cols-2 gap-2 border rounded-lg p-3 bg-muted/20">
                      {departments.map((dept) => {
                        const isChecked = formProject.department.includes(dept);

                        return (
                          <label
                            key={dept}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formProject.department.some(d => normalizeDept(d) === normalizeDept(dept))}
                              onChange={() => {
                                const deptNorm = normalizeDept(dept);
                                const isCurrentlyChecked = formProject.department.some(d => normalizeDept(d) === deptNorm);

                                setFormProject((prev) => ({
                                  ...prev,
                                  department: isCurrentlyChecked
                                    ? prev.department.filter(d => normalizeDept(d) !== deptNorm)
                                    : Array.from(new Set([...prev.department, dept])),
                                }));
                              }}
                            />
                            {dept}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Advanced Options Toggle */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-bold uppercase text-muted-foreground">
                    {showAdvanced ? '−' : '+'} Advanced Options
                  </span>
                  {showAdvanced && <span className="text-xs text-primary">{formProject.team.length + formProject.vendors.length} items</span>}
                </button>

                {showAdvanced && (
                  <div className="space-y-6 p-4 border rounded-lg bg-muted/10">
                    {/* Team Members */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                          <UserPlus className="h-4 w-4" /> Assign Team Members
                        </Label>
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                          {formProject.team.length} Selected
                        </span>
                      </div>

                      {/* Search input for team members */}
                      <Input
                        placeholder="Search by name, code, designation, or department..."
                        value={teamMemberSearch}
                        onChange={(e) => setTeamMemberSearch(e.target.value)}
                        className="bg-background"
                      />

                      <Select
                        value=""
                        onValueChange={(id) => {
                          addTeamMember(id);
                          setTeamMemberSearch("");
                        }}
                      >
                        <SelectTrigger className="w-full bg-background">
                          <SelectValue placeholder={filteredEmployeesForPicker.length === 0 ? "No employees match search" : "Select employee to add..."} />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px] w-full">
                          {filteredEmployeesForPicker.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground">
                              No employees found
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {filteredSortedDepartments.map((dept) => (
                                <div key={dept}>
                                  {/* Department Header */}
                                  <div className="px-3 py-2 text-xs font-bold uppercase text-primary bg-muted/50 sticky top-0">
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
                                          <span className="font-medium text-sm">{emp.name}</span>
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

                      <ScrollArea className="h-[100px] w-full rounded-md border bg-background p-2">
                        {formProject.team.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                            No team members assigned yet.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {formProject.team.map((id) => {
                              const emp = employees.find((e) => String(e.id) === String(id));
                              return (
                                <div
                                  key={id}
                                  className="flex items-center justify-between p-2 rounded-md border bg-muted/30 group"
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
                        <Label className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                          <Users className="h-4 w-4" /> Vendors
                        </Label>
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                          {formProject.vendors.length} Added
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <Input
                          value={vendorInput}
                          onChange={(e) => setVendorInput(e.target.value)}
                          placeholder="Type vendor name and press Add"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addVendor();
                            }
                          }}
                        />
                        <Button type="button" onClick={addVendor}>
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
                              className="flex items-center gap-1"
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

                {/* Progress & Dates */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="progress">Progress (%) <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Input
                      id="progress"
                      type="number"
                      min="0"
                      max="100"
                      value={formProject.progress}
                      onChange={(e) => setFormProject({ ...formProject, progress: parseInt(e.target.value) || 0 })}
                      disabled={formProject.status === "Completed"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate" className="font-bold">Start Date <span className="text-destructive">*</span></Label>
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
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate" className="font-bold">End Date <span className="text-destructive">*</span></Label>
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
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Textarea
                    id="description"
                    value={formProject.description}
                    onChange={(e) => setFormProject({ ...formProject, description: e.target.value })}
                    placeholder="Describe your project goals and scope..."
                    className="min-h-[100px]"
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              <DialogFooter className="pt-4 border-t">
                <Button variant="outline" onClick={() => {
                  setOpenDialog(false);
                  setTeamMemberSearch("");
                }}>Cancel</Button>
                <Button disabled={isSavingProject} onClick={handleSaveProject} className="min-w-[120px]">
                  {isSavingProject ? "Saving..." : modalMode === 'edit' ? "Update Project" :
                    modalMode === 'saveAs' ? "Create As Project" :
                      "Create Project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200 focus:bg-white transition-all duration-200 rounded-lg h-10"
            />
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

      <div className="grid gap-3 font-sans">

        {filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No projects found</p>
            </CardContent>
          </Card>
        ) : (() => {
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
                  <div className="flex items-center gap-2 mt-4 mb-2 pb-1 border-b border-slate-100 animate-in fade-in duration-300">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider font-sans">Assigned to {employeeName}</span>
                    <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-[10px] font-bold h-4 px-1.5 flex items-center justify-center rounded">
                      {sortedProcessedProjects.filter(p => p._group === "assigned").length}
                    </Badge>
                  </div>
                );
              } else if (project._group === "dept") {
                groupHeader = (
                  <div className="flex items-center gap-2 mt-6 mb-2 pb-1 border-b border-slate-100 animate-in fade-in duration-300">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-sans">Department Related</span>
                    <Badge variant="secondary" className="text-[10px] font-bold h-4 px-1.5 flex items-center justify-center rounded">
                      {sortedProcessedProjects.filter(p => p._group === "dept").length}
                    </Badge>
                  </div>
                );
              }
            }
            const isExpanded = expandedId === project.id;
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
                <Card className={cn("hover:shadow-sm transition-all overflow-hidden border-muted/60", isProjectOverdue ? "bg-red-50/60 border-l-4 border-red-500" : "")}>
                  <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/20">
                    <div className="flex items-center gap-4 flex-1">
                      <ChevronDown
                        className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : project.id)}
                      />
                      <div className="flex-1">
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
                              "leading-tight hover:text-blue-600 hover:underline decoration-dotted cursor-pointer transition-colors",
                              isProjectOverdue ? "text-red-700 font-semibold" : "font-bold text-foreground"
                            )}
                            onClick={(e) => { e.stopPropagation(); startInlineEdit(project.id, "title", project.title); }}
                            title="Click to edit title"
                          >
                            {project.title}
                          </span>
                        )}
                        <ProjectLastWorked projectId={project.id} />
                        {String(project.status).toLowerCase() === "on hold" && project.holdReason ? (
                          <p className="text-xs text-orange-700 mt-1 line-clamp-2">Hold reason: {project.holdReason}</p>
                        ) : null}
                        {isColVisible("progress") && (
                          <div className="mt-1 w-48 hidden sm:block">
                            <div className="flex justify-between items-center text-[10px] text-muted-foreground font-medium mb-0.5">
                              <span>{project.progress || 0}%</span>
                            </div>
                            <Progress value={project.progress || 0} className="h-1" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-6">
                        {/* Client Name — inline editable */}
                        {isColVisible("client") && (
                          <div
                            className="text-sm text-muted-foreground cursor-pointer hover:text-blue-600 transition-colors"
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
                              <span>{employees.find(e => String(e.id) === String(project.createdByEmployeeId))?.name || "-"}</span>
                            )}
                          </div>
                        )}
                        {/* Start Date — inline editable */}
                        {isColVisible("startDate") && (
                          <div
                            className="text-sm text-muted-foreground cursor-pointer hover:text-blue-600 transition-colors"
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
                                  className="h-6 text-xs w-32"
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
                        {/* End Date — inline editable */}
                        {isColVisible("endDate") && (
                          <div
                            className="text-sm text-muted-foreground cursor-pointer hover:text-blue-600 transition-colors"
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
                                  className="h-6 text-xs w-32"
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
                        {/* Status — inline editable via popover dropdown */}
                        {isColVisible("status") && (
                          <div className="min-w-[100px] flex justify-center" onClick={(e) => e.stopPropagation()}>
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
                        {/* Key Steps & Tasks count badges — click to navigate */}
                        <div className="flex items-center gap-2 ml-4">
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
                              Key Steps: {keystepCount}
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
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTimelineProject(project);
                              setTimelineDialogOpen(true);
                            }}
                            title="View Project Timeline & Gantt Chart"
                          >
                            <GanttChartSquare className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <CardContent className="pt-0 pb-3 px-3 animate-in fade-in slide-in-from-top-1 overflow-hidden">
                      <div className="space-y-4">
                        <div className="grid md:grid-cols-4 gap-4 pt-1">
                          {/* Left Column: Description & Metadata (spans 2 cols) */}
                          <div className="space-y-2 md:col-span-2">
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                <Pencil className="h-3 w-3" /> Description
                              </p>
                              {isEditingField("description") ? (
                                <div className="flex items-start gap-2">
                                  <Textarea
                                    autoFocus
                                    value={inlineValue}
                                    onChange={(e) => setInlineValue(e.target.value)}
                                    className="text-sm min-h-[40px] max-h-[120px]"
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") cancelInlineEdit();
                                    }}
                                  />
                                  <div className="flex flex-col gap-1">
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveInlineEdit(project.id, "description", inlineValue)}><Check className="h-3 w-3 text-emerald-600" /></Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelInlineEdit}><X className="h-3 w-3 text-red-500" /></Button>
                                  </div>
                                </div>
                              ) : (
                                <p
                                  className="text-sm text-foreground/90 leading-relaxed cursor-pointer hover:bg-muted/30 px-2 py-1 rounded transition-colors whitespace-pre-wrap max-w-sm"
                                  onClick={() => startInlineEdit(project.id, "description", project.description || "")}
                                  title="Click to edit description"
                                >
                                  {project.description ? (
                                    <span className="text-foreground/90">{project.description}</span>
                                  ) : (
                                    <span className="text-muted-foreground italic">Click to add description...</span>
                                  )}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-mono font-bold bg-muted/40 w-fit px-2 py-1 rounded">
                              <Hash className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">CODE:</span>
                              <span className="text-foreground/90 ml-1">{project.projectCode || "N/A"}</span>
                            </div>
                          </div>

                          {/* Middle Column: Client, Dates & Departments */}
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                Client <Pencil className="h-2.5 w-2.5" />
                              </p>
                              {isEditingField("clientName_detail") ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    autoFocus
                                    value={inlineValue}
                                    onChange={(e) => setInlineValue(e.target.value)}
                                    className="h-7 text-sm w-32"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveInlineEdit(project.id, "clientName", inlineValue);
                                      if (e.key === "Escape") cancelInlineEdit();
                                    }}
                                  />
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveInlineEdit(project.id, "clientName", inlineValue)}><Check className="h-3 w-3 text-emerald-600" /></Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelInlineEdit}><X className="h-3 w-3 text-red-500" /></Button>
                                </div>
                              ) : (
                                <p
                                  className="text-sm font-semibold text-foreground/90 cursor-pointer hover:text-primary transition-colors truncate max-w-[120px]"
                                  onClick={() => startInlineEdit(project.id, "clientName_detail", project.clientName || "")}
                                  title="Click to edit client name"
                                >
                                  {project.clientName ? (
                                    <span className="text-foreground/90">{project.clientName}</span>
                                  ) : (
                                    <span className="text-muted-foreground italic">Add Client</span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Right Column: Departments */}
                          <div className="space-y-2">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                  <Building2 className="h-3 w-3" /> Departments
                                </p>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-muted">
                                      <Settings2 className="h-3 w-3 text-muted-foreground" />
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
                              <div className="flex flex-wrap gap-1">
                                {project.department && project.department.length > 0 ? (
                                  project.department.map((dept: string) => (
                                    <Badge key={dept} variant="secondary" className="px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider bg-muted/10 text-foreground/90 border-muted/20">{dept}</Badge>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-muted-foreground italic">None</span>
                                )}
                              </div>
                            </div>
                            {/* Team Size moved to bottom Actions column to keep metadata compact */}
                          </div>
                        </div>

                        {/* Bottom Section: Vendors, Files & Actions (compact) */}
                        <div className="grid md:grid-cols-3 gap-4 pt-4 border-t border-muted/20 items-start">
                          <div className="space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 font-Inter"><Users className="h-3 w-3" /> Vendors</p>
                            <div className="flex flex-wrap gap-1">
                              {project.vendors?.length ? project.vendors.map((v: string) => <Badge key={v} variant="outline" className="text-[9px] py-0 bg-muted/5 text-foreground/90">{v}</Badge>) : <span className="text-[10px] text-muted-foreground italic">None</span>}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2"><Upload className="h-3 w-3" /> Files</p>
                            <div className="flex items-center gap-2">
                              <Input type="file" id={`file-up-${project.id}`} className="hidden" onChange={e => e.target.files?.[0] && handleFileUpload(project.id, e.target.files[0])} />
                              <Label htmlFor={`file-up-${project.id}`} className="text-[9px] font-bold uppercase bg-primary/5 text-primary px-3 py-1.5 rounded border border-primary/10 cursor-pointer hover:bg-primary/10 transition-colors w-full text-center">Upload</Label>
                            </div>
                            <div className="max-h-[80px] overflow-auto space-y-1 CustomScroll">
                              {projectFiles[project.id]?.map((f: any) => (
                                <div key={f.id} className="flex items-center gap-2 p-1 rounded border border-muted/10 bg-muted/5 group text-[10px]">
                                  <FileIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <a href={f.url} target="_blank" className="flex-1 truncate hover:text-primary">{f.fileName}</a>
                                  <button onClick={() => confirm(`Delete ${f.fileName}?`) && apiFetch(`/api/projects/${project.id}/files/${f.id}`, { method: "DELETE" }).then(res => res.ok && setProjectFiles(p => ({ ...p, [project.id]: p[project.id].filter((x: any) => x.id !== f.id) })))} className="opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</p>
                              <div className="text-right">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 justify-end"><Users className="h-3 w-3 text-muted-foreground" /> Team Size</p>
                                <p className="text-sm font-semibold text-foreground/90">{project.team?.length || 0} Members</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="icon" onClick={() => handleOpenEdit(project)} title="Edit Project" className="h-8 w-8"><Edit className="h-4 w-4 text-muted-foreground" /></Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleCloneProject(project)}
                                disabled={cloningProjectId === project.id}
                                title="Clone Project"
                                className="h-8 w-8"
                              >
                                <Copy className={cn("h-4 w-4 text-muted-foreground", cloningProjectId === project.id && "animate-pulse")} />
                              </Button>
                              <Button variant="destructive" size="icon" onClick={() => { setDeleteConfirmOpen(true); setProjectToDelete(project.id); }} title="Delete Project" className="h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        </div>

                        {/* Time Tracking Analytics from Timestrap DB */}
                        <ProjectDetailsWithCounts project={project} />
                      </div>
                    </CardContent>
                  )}
                </Card>
              </React.Fragment>
            );
          });
        })()}
      </div>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this project?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setProjectToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (projectToDelete) {
                  await handleDeleteProject(projectToDelete);
                }
                setDeleteConfirmOpen(false);
                setProjectToDelete(null);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PROJECT TIMELINE & GANTT CHART DIALOG */}
      <ProjectTimelineDialog
        open={timelineDialogOpen}
        onOpenChange={(o) => { setTimelineDialogOpen(o); if (!o) setTimelineProject(null); }}
        project={timelineProject}
        employees={employees}
      />
    </div>
  );
}