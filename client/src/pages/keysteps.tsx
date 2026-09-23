import { useEffect, useMemo, useState, Fragment } from "react";
import { useFreeze } from "@/context/FreezeContext";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Edit,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  ListTodo,
  User,
  MessageSquare,
  Paperclip,
  MoreHorizontal,
  GripVertical,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/components/Layout";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface KeyStep {
  id: string;
  projectId: string;
  header?: string | null;
  title: string;

  // kept optional to avoid breaking if backend still returns them
  description?: string | null;
  requirements?: string | null;

  phase: number;
  status: "not started" | "pending" | "in-progress" | "completed" | "cancelled";
  startDate?: string | null;
  endDate?: string | null;
  parentKeyStepId?: string | null;
  createdAt?: string | null;
}

// FORCE absolute API calls to bypass proxy issues
const API_BASE = "";

export default function KeySteps() {
  const { isFrozen, frozenProjectId, isItemFrozen, frozenItem } = useFreeze();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);

  // Track which keystep is showing the sub-keystep form
  const [showSubFormFor, setShowSubFormFor] = useState<string | null>(null);

  const [keySteps, setKeySteps] = useState<KeyStep[]>([]);
  const [childKeySteps, setChildKeySteps] = useState<Record<string, KeyStep[]>>({});
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => localStorage.getItem("selectedProjectId") || "");
  const [clients, setClients] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string>(() => localStorage.getItem("keysteps_clientFilter") || localStorage.getItem("keysteps_companyFilter") || "all");
  const [statusFilter, setStatusFilter] = useState<string>(() => localStorage.getItem("keysteps_statusFilter") || "all");
  const [priorityFilter, setPriorityFilter] = useState<string>(() => localStorage.getItem("keysteps_priorityFilter") || "all");

  const [openDialog, setOpenDialog] = useState(false);
  const [editingStep, setEditingStep] = useState<KeyStep | null>(null);

  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<KeyStep | null>(null);

  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [cloneStepData, setCloneStepData] = useState<KeyStep | null>(null);
  const [cloneStepNewTitle, setCloneStepNewTitle] = useState("");
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);

  // ── Tasks & Subtasks per KeyStep ──────────────────────────────────────────
  const [stepTasks, setStepTasks] = useState<Record<string, any[]>>({});
  const [taskSubtasks, setTaskSubtasks] = useState<Record<string, any[]>>({});
  const [expandedTasks, setExpandedTasks] = useState<string[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [allProjectTasks, setAllProjectTasks] = useState<any[]>([]); // all tasks for selected project
  const [showAllTasks, setShowAllTasks] = useState(false);            // toggle the all-tasks panel
  const [taskSearch, setTaskSearch] = useState<string>("");

  // show-form states
  const [showTaskFormFor, setShowTaskFormFor] = useState<string | null>(null); // keystepId
  const [showSubtaskFormFor, setShowSubtaskFormFor] = useState<string | null>(null); // taskId

  // task quick-add form
  const [newTaskForm, setNewTaskForm] = useState({ taskName: "", startDate: "", endDate: "", status: "not started", priority: "medium", taskMembers: [] as string[] });
  // subtask quick-add form
  const [newSubtaskForm, setNewSubtaskForm] = useState({ title: "", startDate: "", endDate: "" });

  // Create form state (description/requirements removed)
  const [newStep, setNewStep] = useState({
    projectId: selectedProjectId || "",
    status: "pending" as const,
    startDate: "",
    endDate: "",
  });

  const [newTitles, setNewTitles] = useState<string[]>(
    Array.from({ length: 5 }).map(() => "")
  );

  // --- KEY STEP TEMPLATES ---
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState<boolean | string>(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");

  // ── Data Fetching Functions ──────────────────────────────────────────────

  const fetchSubtasksForTask = async (taskId: string) => {
    try {
      const res = await apiFetch(`/api/subtasks/${taskId}`);
      if (res.ok) {
        const subs: any[] = await res.json();
        setTaskSubtasks((prev) => ({ ...prev, [taskId]: Array.isArray(subs) ? subs : [] }));
      }
    } catch {
      setTaskSubtasks((prev) => ({ ...prev, [taskId]: [] }));
    }
  };

  const fetchTasksForStep = async (keyStepId: string, projectId: string) => {
    try {
      const res = await apiFetch(`/api/tasks/${projectId}`);
      if (res.ok) {
        const allTasks: any[] = await res.json();
        const filtered = allTasks.filter((t: any) => String(t.keyStepId) === String(keyStepId));
        setStepTasks((prev) => ({ ...prev, [keyStepId]: filtered }));

        // Fetch all subtasks in parallel instead of sequentially
        if (filtered.length > 0) {
          await Promise.all(
            filtered.map((task: any) => fetchSubtasksForTask(task.id))
          );
        }
      }
    } catch (err) {
      console.error("Failed to fetch tasks for step:", keyStepId, err);
    }
  };

  const fetchChildrenForStep = async (parentId: string) => {
    try {
      const res = await apiFetch(`/api/key-steps/${parentId}/children`);
      if (res.ok) {
        const children = await res.json();
        setChildKeySteps((prev) => ({
          ...prev,
          [parentId]: Array.isArray(children) ? children : [],
        }));
      }
    } catch (err) {
      console.error("Failed to fetch children for step:", parentId, err);
    }
  };

  const fetchSteps = async () => {
    if (!selectedProjectId) return;
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/key-steps?status=all`);
      if (!res.ok) {
        const text = await res.text();
        console.error("Server returned non-ok status:", res.status, text);
        return;
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Expected JSON but received:", contentType);
        return;
      }
      const data = await res.json();
      const arr: KeyStep[] = Array.isArray(data) ? data : [];
      setKeySteps(arr);

      // Fetch all children in parallel instead of sequentially
      const parentSteps = arr.filter((step) => !step.parentKeyStepId);
      if (parentSteps.length > 0) {
        await Promise.all(
          parentSteps.map((step) => fetchChildrenForStep(step.id))
        );
      }
    } catch (err: any) {
      console.error("Fetch error:", err);
    }
  };

  // ── Template Functions ──────────────────────────────────────────────────
  const fetchTemplates = async () => {
    setIsTemplatesLoading(true);
    try {
      const res = await apiFetch("/api/keystep-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setIsTemplatesLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const applyTemplate = async () => {
    if (!selectedProjectId) {
      alert("Please select a project first.");
      return;
    }
    if (!selectedTemplateId) {
      alert("Please select a template.");
      return;
    }

    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/key-steps/apply-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplateId }),
      });

      if (res.ok) {
        toast({ title: "Template applied successfully" });
        // Refresh KeySteps
        await fetchSteps();
        setSelectedTemplateId("");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to apply template");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to apply template");
    }
  };

  const saveAsTemplate = async () => {
    if (keySteps.length === 0) {
      alert("No KeySteps to save as template.");
      return;
    }
    if (!newTemplateName.trim()) {
      alert("Template name is required.");
      return;
    }

    try {
      // Only capture root-level steps (parents) for the template
      const items = keySteps.filter(ks => !ks.parentKeyStepId).map(ks => ({
        header: ks.header || "",
        title: ks.title,
        description: ks.description || "",
        requirements: ks.requirements || "",
      }));

      const res = await apiFetch("/api/keystep-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          description: newTemplateDescription.trim(),
          items
        }),
      });

      if (res.ok) {
        toast({ title: "Template saved successfully" });
        setSaveTemplateOpen(false);
        setNewTemplateName("");
        setNewTemplateDescription("");
        fetchTemplates();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to save template");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save template");
    }
  };


  const updateNewTitle = (idx: number, value: string) =>
    setNewTitles((prev) => prev.map((v, i) => (i === idx ? value : v)));
  const addTitleRow = () => setNewTitles((prev) => [...prev, ""]);
  const removeTitleRow = (idx: number) =>
    setNewTitles((prev) => prev.filter((_, i) => i !== idx));
  const resetNewTitles = (count = 5) =>
    setNewTitles(Array.from({ length: count }).map(() => ""));

  // Load projects
  useEffect(() => {
    apiFetch(`/api/projects`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load projects");
        return r.json();
      })
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setProjects(arr);
        // Derive unique clients from project clientName or company metadata
        const clientSet = new Set<string>();
        arr.forEach((p: any) => {
          const client = String(p.clientName || p.company || "").trim();
          if (client) clientSet.add(client);
        });
        setClients(Array.from(clientSet));
      })
      .catch((err) => console.error("Projects load error:", err));
  }, []);

  // Persist project and company filters
  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem("selectedProjectId", selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    localStorage.setItem("keysteps_clientFilter", clientFilter);
  }, [clientFilter]);

  useEffect(() => {
    localStorage.setItem("keysteps_statusFilter", statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    localStorage.setItem("keysteps_priorityFilter", priorityFilter);
  }, [priorityFilter]);


  // Add a task to a keystep
  const addTaskToKeyStep = async (keyStepId: string) => {
    if (!newTaskForm.taskName.trim()) { alert("Task name is required"); return; }
    try {
      // Create optimistic task object
      const optimisticTask = {
        id: `temp-${Date.now()}`,
        projectId: selectedProjectId,
        keyStepId,
        taskName: newTaskForm.taskName.trim(),
        startDate: newTaskForm.startDate || null,
        endDate: newTaskForm.endDate || null,
        status: newTaskForm.status,
        priority: newTaskForm.priority,
        taskMembers: newTaskForm.taskMembers,
        assignerId: user?.employeeId ?? null,
        createdAt: new Date().toISOString(),
      };

      // Optimistic UI update - add to stepTasks immediately
      setStepTasks((prev) => ({
        ...prev,
        [keyStepId]: [...(prev[keyStepId] || []), optimisticTask],
      }));

      // Add to allProjectTasks too
      setAllProjectTasks((prev) => [...prev, optimisticTask]);

      // Clear form immediately
      setNewTaskForm({ taskName: "", startDate: "", endDate: "", status: "not started", priority: "medium", taskMembers: [] });
      setShowTaskFormFor(null);

      // API call in background
      const res = await apiFetch(`/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          keyStepId,
          taskName: newTaskForm.taskName.trim(),
          startDate: newTaskForm.startDate || null,
          endDate: newTaskForm.endDate || null,
          status: newTaskForm.status,
          priority: newTaskForm.priority,
          taskMembers: newTaskForm.taskMembers,
          assignerId: user?.employeeId ?? null,
        }),
      });

      if (!res.ok) {
        let errorData: any = {};
        try { errorData = await res.json(); } catch { /* ignore */ }
        throw new Error(errorData.message || (Array.isArray(errorData.details) ? errorData.details.map((d: any) => d.message).join(", ") : errorData.details) || "Failed to add task");
      }

      const newTask = await res.json();

      // Replace temp ID with real ID
      setStepTasks((prev) => ({
        ...prev,
        [keyStepId]: (prev[keyStepId] || []).map((t) => (t.id === optimisticTask.id ? newTask : t)),
      }));

      setAllProjectTasks((prev) => prev.map((t) => (t.id === optimisticTask.id ? newTask : t)));

      // Dispatch event so Tasks page sees the new task
      window.dispatchEvent(new CustomEvent('task.created', { detail: { task: newTask } }));

      // Refresh to sync all data
      fetchTasksForStep(keyStepId, selectedProjectId);
      toast({ title: "Task added successfully" });
    } catch (err: any) {
      // Revert optimistic update on error
      setStepTasks((prev) => ({
        ...prev,
        [keyStepId]: (prev[keyStepId] || []).filter((t) => !t.id.startsWith('temp-')),
      }));

      setAllProjectTasks((prev) => prev.filter((t) => !t.id.startsWith('temp-')));

      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Failed to add task"
      });
    }
  };

  // Add a subtask to a task
  const addSubtaskToTask = async (taskId: string, keyStepId: string) => {
    if (!newSubtaskForm.title.trim()) { alert("Subtask title is required"); return; }
    try {
      // Optimistic subtask object
      const optimisticSubtask = {
        id: `temp-sub-${Date.now()}`,
        taskId,
        title: newSubtaskForm.title.trim(),
        startDate: newSubtaskForm.startDate || null,
        endDate: newSubtaskForm.endDate || null,
        isCompleted: false,
        createdAt: new Date().toISOString(),
      };

      // Optimistic UI update - add to taskSubtasks immediately
      setTaskSubtasks((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] || []), optimisticSubtask],
      }));

      // Clear form immediately
      setNewSubtaskForm({ title: "", startDate: "", endDate: "" });
      setShowSubtaskFormFor(null);

      // API call
      const res = await apiFetch(`/api/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          title: newSubtaskForm.title.trim(),
          startDate: newSubtaskForm.startDate || null,
          endDate: newSubtaskForm.endDate || null,
          completed: false,
        }),
      });
      if (!res.ok) {
        let errorData: any = {};
        try { errorData = await res.json(); } catch { /* ignore */ }
        throw new Error(errorData.message || (Array.isArray(errorData.details) ? errorData.details.map((d: any) => d.message).join(", ") : errorData.details) || "Failed to add subtask");
      }

      const newSubtask = await res.json();

      // Replace temp ID with real ID
      setTaskSubtasks((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] || []).map((s: any) => (s.id === optimisticSubtask.id ? newSubtask : s)),
      }));

      // Dispatch event for cross-page sync
      window.dispatchEvent(new CustomEvent('subtask.created', { detail: { subtask: newSubtask, taskId } }));

      toast({ title: "Subtask added successfully" });
    } catch (err: any) {
      // Revert optimistic update
      setTaskSubtasks((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] || []).filter((s: any) => !s.id.startsWith('temp-sub-')),
      }));

      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Failed to add subtask"
      });
    }
  };

  // Toggle subtask completion
  const toggleSubtask = async (taskId: string, subtaskId: string, current: boolean) => {
    // Optimistic
    setTaskSubtasks((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).map((s: any) =>
        s.id === subtaskId ? { ...s, isCompleted: !current } : s
      ),
    }));
    try {
      await apiFetch(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: !current }),
      });
    } catch {
      // revert
      setTaskSubtasks((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] || []).map((s: any) =>
          s.id === subtaskId ? { ...s, isCompleted: current } : s
        ),
      }));
    }
  };

  const toggleSubtaskFlag = async (taskId: string, subtaskId: string, field: "isAddon" | "isIssue", value: boolean) => {
    // Optimistic
    setTaskSubtasks((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).map((s: any) =>
        s.id === subtaskId ? { ...s, [field]: value } : s
      ),
    }));
    try {
      const res = await apiFetch(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error("Failed to update subtask flag");
    } catch {
      // revert
      setTaskSubtasks((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] || []).map((s: any) =>
          s.id === subtaskId ? { ...s, [field]: !value } : s
        ),
      }));
    }
  };

  // Navigate to the task in the Tasks page
  const navigateToTask = (task: any, keyStepId: string) => {
    const params = new URLSearchParams({
      project_id: String(task.projectId),
      taskId: String(task.id),
      keyStepId: String(keyStepId),
    });

    localStorage.setItem("tasks_projectId", task.projectId);
    localStorage.setItem("selectedProjectId", task.projectId);
    localStorage.setItem("tasks_keyStepId", keyStepId);
    localStorage.setItem("tasks_selectedTaskId", task.id);
    navigate(`/tasks?${params.toString()}`);
  };

  // Load key steps for selected project
  useEffect(() => {
    fetchSteps();
  }, [selectedProjectId]);

  // Load ALL tasks for the selected project whenever it changes
  useEffect(() => {
    if (!selectedProjectId) { setAllProjectTasks([]); return; }
    apiFetch(`/api/tasks/${selectedProjectId}?status=all`)
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setAllProjectTasks(arr);
        // Populate stepTasks from the full list so expansions work immediately
        const byKeyStep: Record<string, any[]> = {};
        arr.forEach((t: any) => {
          const ksId = t.keyStepId ? String(t.keyStepId) : "__none__";
          if (!byKeyStep[ksId]) byKeyStep[ksId] = [];
          byKeyStep[ksId].push(t);
        });
        setStepTasks(byKeyStep);
        // Pre-fetch subtasks for all tasks
        arr.forEach((t: any) => fetchSubtasksForTask(t.id));
      })
      .catch(() => setAllProjectTasks([]));
  }, [selectedProjectId]);

  // Load employees based on selected project
  useEffect(() => {
    if (!selectedProjectId || selectedProjectId === "") {
      // Load all employees if no project selected
      apiFetch("/api/employees")
        .then((r) => r.json())
        .then((data) => setEmployees(Array.isArray(data) ? data : []))
        .catch(() => { });
    } else {
      // Load only employees assigned to this project
      apiFetch(`/api/projects/${selectedProjectId}/members`)
        .then((r) => r.json())
        .then((data) => setEmployees(Array.isArray(data) ? data : []))
        .catch(() => {
          // Fallback to all employees if members endpoint fails
          apiFetch("/api/employees")
            .then((r) => r.json())
            .then((data) => setEmployees(Array.isArray(data) ? data : []))
            .catch(() => { });
        });
    }
  }, [selectedProjectId]);

  const parentsSorted = useMemo(() => {
    let filtered = keySteps.filter((s) => !s.parentKeyStepId);

    // Apply client filter
    if (clientFilter !== "all") {
      const selectedProject = projects.find(p => String(p.id) === String(selectedProjectId));
      const projectClient = String(selectedProject?.clientName || selectedProject?.company || "").toLowerCase();
      if (selectedProject && projectClient !== clientFilter.toLowerCase()) {
        filtered = [];
      }
    }

    // Apply key step status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((s) => String(s.status || "").toLowerCase() === statusFilter.toLowerCase());
    } else {
      filtered = filtered.filter((s) => String(s.status || "").toLowerCase() !== "cancelled");
    }

    // Global Freeze: when a project is frozen, scope everything to it on top
    // of whatever the existing filters already narrowed down to.
    if (isFrozen && frozenProjectId != null) {
      filtered = filtered.filter((s) => String(s.projectId) === String(frozenProjectId));
    }

    // Optional further narrowing to one selected Key Step (or the parent of
    // a selected Task, so the Key Step it belongs to stays visible).
    if (isItemFrozen && frozenItem) {
      if (frozenItem.type === "keystep") {
        filtered = filtered.filter((s) => String(s.id) === String(frozenItem.id));
      } else if (frozenItem.type === "task") {
        const parentTask = allProjectTasks.find((t: any) => String(t.id) === String(frozenItem.id));
        if (parentTask?.keyStepId) {
          filtered = filtered.filter((s) => String(s.id) === String(parentTask.keyStepId));
        }
      }
    }

    // User requirement: Sort by latest created first
    return filtered
      .slice()
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
        return a.title.localeCompare(b.title);
      });
  }, [keySteps, clientFilter, projects, selectedProjectId, statusFilter, isFrozen, frozenProjectId, isItemFrozen, frozenItem, allProjectTasks]);

  // Create MANY key steps (multiple titles) — description/requirements removed
  const createMultipleSteps = async () => {
    // prefer the project chosen inside the dialog, fall back to page-selected
    const projectIdToUse = (newStep.projectId || selectedProjectId || "").trim();
    if (!projectIdToUse) {
      alert("Please select a project first.");
      return;
    }

    const titles = newTitles.map((t) => t.trim()).filter(Boolean);
    if (titles.length === 0) {
      alert("Please enter at least one title.");
      return;
    }

    try {
      const payloads = titles.map((title) => ({
        projectId: projectIdToUse,
        parentKeyStepId: null,
        title,
        status: newStep.status.toLowerCase(),
        startDate: newStep.startDate,
        endDate: newStep.endDate,
      }));

      const responses = await Promise.all(
        payloads.map((p) =>
          apiFetch(`/api/key-steps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p),
          })
        )
      );

      const failed = responses.filter((r) => !r.ok);
      if (failed.length > 0) {
        const texts = await Promise.all(
          failed.map((r) => r.text().catch(() => ""))
        );
        console.error("Some creations failed:", texts);
        alert("One or more key steps failed to create. Check console for details.");
      }

      // refresh list immediately
      await fetchSteps();

      // reset + close
      resetNewTitles(5);
      setNewStep({ projectId: selectedProjectId || "", status: "pending", startDate: "", endDate: "" });
      setOpenDialog(false);
    } catch (err) {
      console.error(err);
      alert("Failed to create key steps");
    }
  };

  // Create ONE sub-step (inline row) — description/requirements removed
  const createSubStep = async (parentId: string, title: string, startDate: string, endDate: string) => {
    if (!selectedProjectId) return;

    const payload = {
      projectId: selectedProjectId,
      parentKeyStepId: parentId,
      header: null,
      title,
      status: "pending",
      startDate,
      endDate,
    };

    const response = await apiFetch(`/api/key-steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ API ERROR:", errText);
      throw new Error(errText || "Failed to create sub-step");
    }

    // Refresh data
    await fetchSteps();
  };

  // Update step (used by dialog + inline edit)
  const updateStep = async (step: KeyStep) => {
    if (!step.title) {
      alert("Please fill in Title.");
      return;
    }

    try {
      const url = `${API_BASE}/api/key-steps/${step.id}`;

      const payload = {
        title: step.title,
        status: step.status.toLowerCase(),
        startDate: step.startDate,
        endDate: step.endDate,
        projectId: step.projectId || selectedProjectId,
        parentKeyStepId: step.parentKeyStepId ?? null,
      };

      const res = await apiFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();

      if (!res.ok) {
        console.error("PUT failed response:", text);
        throw new Error(`Update failed (${res.status}): ${text}`);
      }

      let updated: KeyStep;
      try {
        updated = JSON.parse(text);
      } catch {
        console.error("Invalid JSON from server:", text);
        throw new Error("Invalid JSON response from server");
      }

      setKeySteps((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));

      if (updated.parentKeyStepId) {
        fetchChildrenForStep(updated.parentKeyStepId);
      }
    } catch (err: any) {
      console.error("Update error details:", err);
      alert("Failed to update step: " + err.message);
    }
  };

  // Clone step
  const handleCloneStep = async () => {
    if (!cloneStepData) return;

    try {
      const response = await apiFetch(`/api/key-steps/${cloneStepData.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newTitle: cloneStepNewTitle || undefined }),
      });

      if (!response.ok) throw new Error("Clone failed");

      await fetchSteps();

      setCloneStepNewTitle("");
      setCloneDialogOpen(false);
      setCloneStepData(null);
      toast({ title: "Key step cloned successfully!" });
    } catch (err) {
      alert("Failed to clone key step");
    }
  };

  // Toggle expanded row — also loads tasks when expanding
  const toggleExpand = (step: KeyStep) => {
    const id = step.id;
    const isExpanding = !expandedRows.includes(id);
    setExpandedRows((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
    if (isExpanding && selectedProjectId) {
      fetchTasksForStep(id, selectedProjectId);
    }
  };

  const getTaskStatusColor = (status: string) => {
    switch (String(status).toLowerCase()) {
      case "completed": return "bg-green-100 text-green-800 border-green-200";
      case "in progress": return "bg-blue-100 text-blue-800 border-blue-200";
      case "on hold": return "bg-amber-100 text-amber-800 border-amber-200";
      case "cancelled":
      case "canceled": return "bg-red-100 text-red-800 border-red-200";
      case "not started": return "bg-slate-100 text-slate-600 border-slate-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (String(status).toLowerCase()) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "in-progress":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "not started":
        return "bg-slate-100 text-slate-600 border-slate-200";
      case "cancelled":
      case "canceled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Compute task progress: prefer task.progress if available, otherwise derive from subtasks
  const computeTaskProgress = (task: any, subs: any[]) => {
    if (typeof task.progress !== 'undefined' && task.progress !== null) return Math.round(Number(task.progress));
    if (!Array.isArray(subs) || subs.length === 0) return 0;
    const done = subs.filter((s) => s.isCompleted || s.progress === 100).length;
    return Math.round((done / subs.length) * 100);
  };

  // Compute keystep progress from its tasks (client-side immediate computation)
  const computeStepProgress = (stepId: string) => {
    const tasks = stepTasks[stepId] || [];
    if (!tasks || tasks.length === 0) return 0;
    const sum = tasks.reduce((s: number, t: any) => s + (Number(t.progress || 0)), 0);
    return Math.round(sum / tasks.length);
  };

  // Listen for task updates from other pages (optimistic updates) and apply them to local caches
  useEffect(() => {
    const handleTaskUpdated = (ev: any) => {
      const detail = ev?.detail || {};
      const { taskId, field, value } = detail;
      if (!taskId) return;

      // Map backend 'assignedMembers' -> UI 'taskMembers'
      const uiField = field === 'assignedMembers' ? 'taskMembers' : field;

      // Update allProjectTasks
      setAllProjectTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, [uiField]: value, ...(uiField ? { [uiField]: value } : {}) } : t)));

      // Update stepTasks map
      setStepTasks((prev) => {
        const next: Record<string, any[]> = {};
        Object.keys(prev).forEach((k) => {
          next[k] = (prev[k] || []).map((t: any) => (t.id === taskId ? { ...t, [uiField]: value } : t));
        });
        return next;
      });
    };

    const handleProjectDeleted = (ev: any) => {
      const { projectId } = ev?.detail || {};
      if (!projectId) return;

      // Remove keysteps from deleted project
      setKeySteps((prev) => prev.filter((k) => k.projectId !== projectId));
      setChildKeySteps((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (next[key].some((k: any) => k.projectId === projectId)) {
            delete next[key];
          }
        });
        return next;
      });

      // Remove tasks from deleted project
      setAllProjectTasks((prev) => prev.filter((t) => t.projectId !== projectId));
      setStepTasks((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          next[key] = (next[key] || []).filter((t: any) => t.projectId !== projectId);
        });
        return next;
      });
    };

    window.addEventListener('task.updated', handleTaskUpdated as EventListener);
    window.addEventListener('project.deleted', handleProjectDeleted as EventListener);
    return () => {
      window.removeEventListener('task.updated', handleTaskUpdated as EventListener);
      window.removeEventListener('project.deleted', handleProjectDeleted as EventListener);
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Key Steps</h1>
          <p className="text-muted-foreground mt-1">
            Manage project phases and milestones effectively.
          </p>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold whitespace-nowrap">Project</span>
            <div className="w-56">
              <Select
                value={selectedProjectId}
                onValueChange={(val) => {
                  localStorage.setItem("selectedProjectId", val);
                  setSelectedProjectId(val);
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {projects.length > 0 ? (
                    projects
                      .filter((p: any) => {
                        if (clientFilter === "all") return true;
                        const client = String(p.clientName || p.company || "").toLowerCase();
                        return client === clientFilter.toLowerCase();
                      })
                      .map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.title}
                        </SelectItem>
                      ))
                  ) : (
                    <div className="p-2 text-xs text-muted-foreground">No projects available</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Company Filter */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold whitespace-nowrap">Client</span>
            <div className="w-56">
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c} value={c.toLowerCase()}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold whitespace-nowrap">Step Status</span>
            <div className="w-56">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="not started">Not Started</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold whitespace-nowrap">Task Priority</span>
            <div className="w-56">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Template Actions */}
          <div className="flex items-center gap-2 ml-auto">
            {selectedProjectId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveTemplateOpen("save")}
                title="Save current KeySteps as a reusable template"
              >
                💾 Save as Template
              </Button>
            )}
            {selectedProjectId && templates.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveTemplateOpen("apply")}
                title="Apply a saved template to this project"
              >
                📋 Apply Template
              </Button>
            )}
          </div>

          <Dialog
            open={openDialog}
            onOpenChange={(open) => {
              setOpenDialog(open);

              if (!open) {
                setEditingStep(null);
                resetNewTitles(5);
                setNewStep({ projectId: selectedProjectId || "", status: "pending", startDate: "", endDate: "" });
              } else {
                // opening: if edit mode not set, ensure multi-title defaults + prefill project
                if (!editingStep) {
                  resetNewTitles(5);
                  setNewStep((s) => ({ ...s, projectId: selectedProjectId || "" }));
                }
              }
            }}
          >
            {!editingStep && (
              <DialogTrigger asChild>
                <Button className="w-full md:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  New Key Step
                </Button>
              </DialogTrigger>
            )}

            <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingStep ? "Edit Key Step" : "Create Key Steps"}</DialogTitle>
                <DialogDescription>
                  {editingStep
                    ? "Update this step."
                    : "Create multiple steps at once (description and requirements removed)."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">

                {/* Project selector (create mode only) */}
                {!editingStep && (
                  <div className="grid gap-2">
                    <Label htmlFor="keystepProject">Project</Label>
                    <Select
                      value={newStep.projectId || selectedProjectId}
                      onValueChange={(val) => setNewStep((s) => ({ ...s, projectId: val }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px] overflow-y-auto">
                        {projects.length > 0 ? (
                          projects.map((p: any) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.title}
                            </SelectItem>
                          ))
                        ) : (
                          <div className="p-2 text-xs text-muted-foreground">No projects available</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Title section */}
                {editingStep ? (
                  <div className="grid gap-2">
                    <Label htmlFor="title">Step Title</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Initial Design Review"
                      value={editingStep.title}
                      onChange={(e) => setEditingStep({ ...editingStep, title: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label>Step Titles (create multiple)</Label>
                    <div className="space-y-2">
                      {newTitles.map((t, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <Input
                            placeholder={`Title #${idx + 1}`}
                            value={t}
                            onChange={(e) => updateNewTitle(idx, e.target.value)}
                          />
                          {newTitles.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeTitleRow(idx)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 items-center">
                      <Button type="button" size="sm" onClick={addTitleRow} variant="ghost">
                        + Add another title
                      </Button>
                      <div className="text-xs text-muted-foreground ml-auto">
                        Empty rows are ignored.
                      </div>
                    </div>
                  </div>
                )}

                {/* Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={editingStep?.status ?? newStep.status}
                      onValueChange={(val: any) =>
                        editingStep
                          ? setEditingStep({ ...editingStep, status: val })
                          : setNewStep({ ...newStep, status: val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not started">Not Started</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      type="date"
                      value={editingStep?.startDate ?? newStep.startDate}
                      onChange={(e) => {
                        const newStartDate = e.target.value;
                        if (editingStep) {
                          setEditingStep({
                            ...editingStep,
                            startDate: newStartDate,
                            endDate: editingStep.endDate && newStartDate && editingStep.endDate < newStartDate ? newStartDate : editingStep.endDate,
                          });
                        } else {
                          setNewStep({
                            ...newStep,
                            startDate: newStartDate,
                            endDate: newStep.endDate && newStartDate && newStep.endDate < newStartDate ? newStartDate : newStep.endDate,
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      type="date"
                      value={editingStep?.endDate ?? newStep.endDate}
                      min={(editingStep?.startDate ?? newStep.startDate) || undefined}
                      onChange={(e) => {
                        const newEndDate = e.target.value;
                        if (editingStep) {
                          const startDate = editingStep.startDate;
                          setEditingStep({
                            ...editingStep,
                            endDate: startDate && newEndDate && newEndDate < startDate ? startDate : newEndDate,
                          });
                        } else {
                          const startDate = newStep.startDate;
                          setNewStep({
                            ...newStep,
                            endDate: startDate && newEndDate && newEndDate < startDate ? startDate : newEndDate,
                          });
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpenDialog(false);
                    setEditingStep(null);
                  }}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  onClick={async () => {
                    if (editingStep) {
                      await updateStep(editingStep);
                      setOpenDialog(false);
                      setEditingStep(null);
                    } else {
                      await createMultipleSteps();
                    }
                  }}
                >
                  {editingStep ? "Save Changes" : "Create Steps"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* SAVE AS TEMPLATE DIALOG */}
      <Dialog open={saveTemplateOpen === "save"} onOpenChange={(open) => setSaveTemplateOpen(open ? "save" : false)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Save as KeyStep Template</DialogTitle>
            <DialogDescription>
              Create a reusable template from current KeySteps
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                placeholder="e.g., Standard Project Workflow"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template-description">Description</Label>
              <Input
                id="template-description"
                placeholder="Optional description of this template"
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded">
              ℹ️ {keySteps.filter(k => !k.parentKeyStepId).length} root KeySteps will be saved
            </div>
            {keySteps.length === 0 && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                ⚠️ No KeySteps found for this project. You must create at least one KeyStep before saving a template.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSaveTemplateOpen(false);
                setNewTemplateName("");
                setNewTemplateDescription("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveAsTemplate} disabled={!newTemplateName.trim() || keySteps.length === 0}>
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* APPLY TEMPLATE DIALOG */}
      <Dialog open={saveTemplateOpen === "apply"} onOpenChange={(open) => setSaveTemplateOpen(open ? "apply" : false)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Apply KeyStep Template</DialogTitle>
            <DialogDescription>
              Select a template to auto-populate KeySteps for this project
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="template-select">Available Templates</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger id="template-select">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto">
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}{t.description ? ` - ${t.description}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSaveTemplateOpen(false);
                setSelectedTemplateId("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={applyTemplate} disabled={!selectedTemplateId}>
              Apply Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Key Steps Table (description removed) */}
      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b">
              <th className="px-3 py-3 text-center text-xs font-bold uppercase text-slate-600 border-r w-10"></th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600 border-r">
                Key Step Name
              </th>
              <th className="px-3 py-3 text-center text-xs font-bold uppercase text-slate-600 border-r w-32">
                Status
              </th>
              <th className="px-3 py-3 text-center text-xs font-bold uppercase text-slate-600 border-r w-28">
                Start Date
              </th>
              <th className="px-3 py-3 text-center text-xs font-bold uppercase text-slate-600 border-r w-28">
                End Date
              </th>
              <th className="px-3 py-3 text-center text-xs font-bold uppercase text-slate-600 border-r w-24">
                Sub-Steps
              </th>
              <th className="px-3 py-3 text-center text-xs font-bold uppercase text-slate-600 w-36">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {parentsSorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-500">
                  No key steps found for this project. Click "New Key Step" to add one.
                </td>
              </tr>
            ) : (
              parentsSorted.map((step) => (
                <Fragment key={step.id}>
                  {/* INLINE EDIT ROW */}
                  {inlineEditId === step.id && (
                    <tr className="border-b bg-yellow-50">
                      <td className="px-3 py-2 text-center border-r"></td>
                      <td className="px-4 py-2 border-r" colSpan={6}>
                        <form
                          className="flex flex-wrap gap-2 items-center"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const formEl = e.target as HTMLFormElement;

                            const title = (formEl.elements.namedItem("editTitle") as HTMLInputElement).value;
                            const startDate = (formEl.elements.namedItem("editStartDate") as HTMLInputElement).value;
                            let endDate = (formEl.elements.namedItem("editEndDate") as HTMLInputElement).value;
                            if (startDate && endDate && endDate < startDate) {
                              endDate = startDate;
                            }

                            await updateStep({
                              ...step,
                              title,
                              startDate,
                              endDate,
                            });

                            setInlineEditId(null);
                          }}
                        >
                          <input
                            name="editTitle"
                            defaultValue={step.title}
                            placeholder="Title"
                            className="border rounded px-2 py-1 text-xs"
                          />
                          <input
                            name="editStartDate"
                            type="date"
                            defaultValue={step.startDate ?? ""}
                            className="border rounded px-2 py-1 text-xs"
                          />
                          <input
                            name="editEndDate"
                            type="date"
                            defaultValue={step.endDate ?? ""}
                            className="border rounded px-2 py-1 text-xs"
                          />
                          <button type="submit" className="bg-blue-600 text-white px-2 py-1 rounded text-xs">
                            Save
                          </button>
                          <button
                            type="button"
                            className="ml-2 text-xs text-slate-500 underline"
                            onClick={() => setInlineEditId(null)}
                          >
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}

                  {/* MAIN KEY STEP ROW */}
                  <tr className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3 text-center border-r">
                      <button
                        onClick={() => toggleExpand(step)}
                        className="text-slate-500 hover:text-slate-700"
                      >
                        {expandedRows.includes(step.id) ? (
                          <ChevronDown size={18} />
                        ) : (
                          <ChevronRight size={18} />
                        )}
                      </button>
                    </td>

                    <td className="px-4 py-3 border-r">
                      <div className="flex flex-col">
                        {step.header ? (
                          <span className="text-[10px] text-blue-500 font-bold uppercase tracking-wider mb-0.5">
                            {step.header}
                          </span>
                        ) : null}

                        <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded leading-none">P{step.phase}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate">{step.title}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{step.title}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-center border-r">
                      <Badge
                        variant="outline"
                        className={`text-xs whitespace-nowrap ${getStatusColor(step.status)}`}
                      >
                        {step.status.replace("-", " ")}
                      </Badge>
                    </td>

                    <td className="px-3 py-3 text-center text-sm text-slate-600 border-r">
                      {formatDate(step.startDate)}
                    </td>

                    <td className="px-3 py-3 text-center text-sm text-slate-600 border-r">
                      {formatDate(step.endDate)}
                    </td>

                    <td className="px-3 py-3 text-center border-r">
                      <Badge variant="secondary" className="text-xs">
                        {childKeySteps[step.id]?.length || 0}
                      </Badge>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => setInlineEditId(step.id)}
                          className="text-blue-600 hover:text-blue-700"
                          title="Edit (inline)"
                        >
                          <Edit size={16} />
                        </button>

                        <button
                          onClick={() => {
                            setEditingStep(step);
                            setOpenDialog(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-700"
                          title="Edit (dialog)"
                        >
                          <Edit size={16} />
                        </button>

                        <button
                          onClick={() => {
                            setCloneStepData(step);
                            setCloneStepNewTitle(`${step.title} (Copy)`);
                            setCloneDialogOpen(true);
                          }}
                          className="text-green-600 hover:text-green-700"
                          title="Clone"
                        >
                          <Copy size={16} />
                        </button>

                        <button
                          onClick={() => {
                            setStepToDelete(step);
                            setOpenDeleteDialog(true);
                          }}
                          className="text-red-600 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>

                        <button
                          onClick={() =>
                            setShowSubFormFor(showSubFormFor === step.id ? null : step.id)
                          }
                          className={`text-purple-700 hover:text-purple-900 border border-purple-200 rounded px-2 py-1 text-xs ml-2 ${showSubFormFor === step.id ? "bg-purple-100" : ""
                            }`}
                          title="Add Sub-Phase"
                        >
                          + Add Sub-Phase
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* EXPANDED HIERARCHY: Sub-KeySteps → Tasks → Subtasks */}
                  {expandedRows.includes(step.id) && (
                    <>
                      {/* ── Sub-KeySteps ─────────────────────────────── */}
                      {(childKeySteps[step.id] || [])
                        .slice()
                        .sort((a, b) => Number(a.phase) - Number(b.phase) || a.title.localeCompare(b.title))
                        .map((child) => (
                          <tr key={child.id} className="border-b bg-indigo-50/30 hover:bg-indigo-50/60 transition-colors">
                            <td className="px-3 py-2 text-center border-r">
                              <span className="text-indigo-400 text-xs">↳</span>
                            </td>
                            <td className="px-4 py-2 border-r">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                                <div>
                                  <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wider">Sub-Phase {child.phase}</p>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <p className="text-sm font-medium text-slate-900 truncate max-w-[200px]">{child.title}</p>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{child.title}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center border-r">
                              <Badge variant="outline" className={`text-xs whitespace-nowrap ${getStatusColor(child.status)}`}>
                                {child.status.replace("-", " ")}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-center text-sm text-slate-600 border-r">{formatDate(child.startDate)}</td>
                            <td className="px-3 py-2 text-center text-sm text-slate-600 border-r">{formatDate(child.endDate)}</td>
                            <td className="px-3 py-2 text-center border-r"><Badge variant="outline" className="text-xs">—</Badge></td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex gap-2 justify-center">
                                <button onClick={() => { setEditingStep(child); setOpenDialog(true); }} className="text-blue-600 hover:text-blue-700" title="Edit"><Edit size={14} /></button>
                                <button onClick={() => { setStepToDelete(child); setOpenDeleteDialog(true); }} className="text-red-600 hover:text-red-700" title="Delete"><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}

                      {/* ── Inline sub-keystep creation row ─────────── */}
                      {showSubFormFor === step.id && (
                        <tr className="border-b bg-purple-50/75">
                          <td className="px-3 py-2 text-center border-r" />
                          <td className="px-4 py-2 border-r" colSpan={6}>
                            <form className="flex flex-wrap gap-2 items-center" onSubmit={async (e) => {
                              e.preventDefault();
                              const formEl = e.target as HTMLFormElement;
                              const title = (formEl.elements.namedItem("subTitle") as HTMLInputElement).value;
                              const startDate = (formEl.elements.namedItem("subStartDate") as HTMLInputElement).value;
                              let endDate = (formEl.elements.namedItem("subEndDate") as HTMLInputElement).value;
                              if (startDate && endDate && endDate < startDate) { endDate = startDate; }
                              if (!title || !startDate || !endDate) { alert("Fill all fields"); return; }
                              try { await createSubStep(step.id, title, startDate, endDate); formEl.reset(); setShowSubFormFor(null); }
                              catch (err: any) { alert(err?.message || "Failed to add sub-step"); }
                            }}>
                              <input name="subTitle" placeholder="Sub-phase title" className="border rounded px-2 py-1 text-xs flex-1 min-w-[140px]" />
                              <input name="subStartDate" type="date" className="border rounded px-2 py-1 text-xs" />
                              <input name="subEndDate" type="date" className="border rounded px-2 py-1 text-xs" />
                              <button type="submit" className="bg-purple-600 text-white px-3 py-1 rounded text-xs font-semibold">Add</button>
                              <button type="button" className="text-xs text-slate-500 underline" onClick={() => setShowSubFormFor(null)}>Cancel</button>
                            </form>
                          </td>
                        </tr>
                      )}

                      {/* ── TASKS for this KeyStep ───────────────────── */}
                      <tr className="border-b bg-blue-50/40">
                        <td className="px-3 py-2 border-r" />
                        <td className="px-4 py-2 border-r" colSpan={6}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
                                <ListTodo size={13} /> Tasks
                              </span>
                              <div className="text-xs text-slate-500">{(stepTasks[step.id] || []).length} total</div>
                              <div className="text-xs text-slate-500">|</div>
                              <div className="text-xs text-slate-500">Completed: {(stepTasks[step.id] || []).filter(t => Number(t.progress || 0) === 100).length}</div>
                              <div className="text-xs text-slate-500">Pending: {(stepTasks[step.id] || []).filter(t => Number(t.progress || 0) < 100).length}</div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <input
                                placeholder="Search tasks..."
                                className="text-xs px-2 py-1 border rounded bg-white w-full sm:w-64"
                                value={taskSearch}
                                onChange={(e) => setTaskSearch(e.target.value)}
                              />
                              <button
                                onClick={() => {
                                  setShowTaskFormFor(showTaskFormFor === step.id ? null : step.id);
                                  setNewTaskForm({ taskName: "", startDate: "", endDate: "", status: "not started", priority: "medium", taskMembers: [] });
                                }}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-0.5 bg-white"
                              >
                                <Plus size={11} /> Add Task
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr className="border-b bg-slate-50/75">
                        <td className="border-r" />
                        <td colSpan={6} className="px-4 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div className="bg-white border rounded-xl p-3 shadow-sm">
                              <div className="text-xs uppercase tracking-wide text-slate-500">Total tasks</div>
                              <div className="mt-2 text-xl font-semibold text-slate-900">{(stepTasks[step.id] || []).length}</div>
                            </div>
                            <div className="bg-white border rounded-xl p-3 shadow-sm">
                              <div className="text-xs uppercase tracking-wide text-slate-500">Completed</div>
                              <div className="mt-2 text-xl font-semibold text-slate-900">{(stepTasks[step.id] || []).filter((t) => Number(t.progress || 0) === 100).length}</div>
                            </div>
                            <div className="bg-white border rounded-xl p-3 shadow-sm">
                              <div className="text-xs uppercase tracking-wide text-slate-500">Pending</div>
                              <div className="mt-2 text-xl font-semibold text-slate-900">{(stepTasks[step.id] || []).filter((t) => Number(t.progress || 0) < 100).length}</div>
                            </div>
                            <div className="bg-white border rounded-xl p-3 shadow-sm">
                              <div className="text-xs uppercase tracking-wide text-slate-500">Team members</div>
                              <div className="mt-2 text-xl font-semibold text-slate-900">{new Set((stepTasks[step.id] || []).flatMap((t: any) => t.taskMembers || [])).size}</div>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Add Task inline form */}
                      {showTaskFormFor === step.id && (
                        <tr className="border-b bg-blue-50/70">
                          <td className="px-3 py-2 border-r" />
                          <td className="px-4 py-2 border-r" colSpan={6}>
                            <div className="bg-white border border-blue-200 rounded-lg p-3">
                              <div className="flex gap-2 items-center">
                                <input
                                  placeholder="Task name *"
                                  className="border rounded px-2 py-1 text-sm flex-1"
                                  value={newTaskForm.taskName}
                                  onChange={(e) => setNewTaskForm((p) => ({ ...p, taskName: e.target.value }))}
                                />
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={newTaskForm.startDate} onChange={(e) => { const newStartDate = e.target.value; setNewTaskForm((p) => ({ ...p, startDate: newStartDate, endDate: p.endDate && newStartDate && p.endDate < newStartDate ? newStartDate : p.endDate })); }} />
                                <input type="date" className="border rounded px-2 py-1 text-sm" min={newTaskForm.startDate || undefined} value={newTaskForm.endDate} onChange={(e) => { const newEndDate = e.target.value; setNewTaskForm((p) => ({ ...p, endDate: p.startDate && newEndDate && newEndDate < p.startDate ? p.startDate : newEndDate })); }} />
                                <select className="border rounded px-2 py-1 text-sm" value={newTaskForm.priority} onChange={(e) => setNewTaskForm((p) => ({ ...p, priority: e.target.value }))}>
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                                <Button size="sm" onClick={() => addTaskToKeyStep(step.id)}>Save</Button>
                                <Button variant="ghost" size="sm" onClick={() => setShowTaskFormFor(null)}>Cancel</Button>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <Select
                                  value=""
                                  onValueChange={(v) =>
                                    setNewTaskForm((f) => ({
                                      ...f,
                                      taskMembers: Array.from(new Set([...f.taskMembers, v])),
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Assign members..." />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[250px]">
                                    {employees.map((e) => (
                                      <SelectItem key={e.id} value={String(e.id)} className="text-sm">
                                        {e.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <div className="flex flex-wrap gap-1">
                                  {newTaskForm.taskMembers.map((id) => (
                                    <Badge
                                      key={id}
                                      variant="secondary"
                                      className="text-sm cursor-pointer py-0 px-1"
                                      onClick={() =>
                                        setNewTaskForm((f) => ({
                                          ...f,
                                          taskMembers: f.taskMembers.filter((x) => x !== id),
                                        }))
                                      }
                                    >
                                      {employees.find((e) => String(e.id) === String(id))?.name || id} ✕
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Task rows */}
                      {/* New modern cards/kanban columns view rendered below */}
                      <tr className="border-b bg-transparent">
                        <td className="border-r" />
                        <td colSpan={6} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {['not started', 'in-progress', 'completed'].map((colStatus) => (
                              <div key={colStatus} className="bg-slate-50 p-3 rounded-lg h-full">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs font-bold text-slate-700 uppercase">{colStatus === 'not started' ? 'To Do' : colStatus === 'in-progress' ? 'In Progress' : 'Completed'}</div>
                                  <div className="text-xs text-slate-500">{(stepTasks[step.id] || []).filter((t: any) => String(t.status || '').toLowerCase() === colStatus).filter((t: any) => priorityFilter === 'all' || String(t.priority || 'medium').toLowerCase() === priorityFilter).length}</div>
                                </div>
                                <div className="space-y-3">
                                  {(stepTasks[step.id] || [])
                                    .filter((t: any) => String(t.status || '').toLowerCase() === colStatus)
                                    .filter((t: any) => priorityFilter === 'all' || String(t.priority || 'medium').toLowerCase() === priorityFilter)
                                    .filter((t: any) => { const q = taskSearch.toLowerCase(); return !q || (t.taskName || '').toLowerCase().includes(q); })
                                    .map((task: any) => {
                                      const subs = taskSubtasks[task.id] || [];
                                      const progress = computeTaskProgress(task, subs);
                                      const assignee = (task.taskMembers || [])[0] ? employees.find((e: any) => String(e.id) === String((task.taskMembers || [])[0])) : null;
                                      return (
                                        <div key={task.id} draggable
                                          onDragStart={(ev) => { ev.dataTransfer?.setData('text/task', task.id); (ev.currentTarget as HTMLElement).classList.add('opacity-60'); }}
                                          onDragEnd={(ev) => { (ev.currentTarget as HTMLElement).classList.remove('opacity-60'); }}
                                          onClick={() => navigateToTask(task, step.id)}
                                          className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition flex items-start gap-3 cursor-pointer hover:bg-blue-50"
                                        >
                                          <div className="cursor-move pt-1 text-slate-300"><GripVertical size={16} /></div>
                                          <div className="flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                              <div>
                                                <div className="flex items-center gap-2">
                                                  <div className="text-sm font-semibold text-slate-800 truncate max-w-[360px]">{task.taskName}</div>
                                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${task.priority === 'high' ? 'bg-red-100 text-red-700' : task.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{task.priority || 'medium'}</span>
                                                </div>
                                                <div className="mt-1 text-xs text-slate-500 flex items-center gap-2">
                                                  <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-700">{assignee ? assignee.name?.split(' ').map((n: any) => n[0]).slice(0, 2).join('') : '—'}</div>
                                                    <div>{assignee ? assignee.name : 'Unassigned'}</div>
                                                  </div>
                                                  <div>• Due {formatDate(task.endDate)}</div>
                                                  <div>• {subs.length} subtasks</div>
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <button title="Comments" className="text-slate-400 hover:text-slate-600"><MessageSquare size={16} /></button>
                                                <button title="Attachments" className="text-slate-400 hover:text-slate-600"><Paperclip size={16} /></button>
                                                <button title="More" className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={16} /></button>
                                              </div>
                                            </div>

                                            <div className="mt-3">
                                              <div className="w-full bg-slate-100 h-2 rounded-full">
                                                <div className="h-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500" style={{ width: `${progress}%` }} />
                                              </div>
                                              <div className="text-xs text-slate-500 mt-1">Progress: {progress}%</div>
                                            </div>

                                            {/* Subtasks as chips */}
                                            {subs.length > 0 && (
                                              <div className="mt-3 flex flex-wrap gap-2">
                                                {subs.map((s: any) => (
                                                  <button
                                                    key={s.id}
                                                    onClick={() => toggleSubtask(task.id, s.id, !!s.isCompleted)}
                                                    className={`text-xs px-2 py-1 rounded-full border ${s.isCompleted
                                                      ? 'bg-green-50 text-green-700 border-transparent'
                                                      : s.isIssue
                                                        ? 'bg-pink-50 text-pink-700 border-dashed border-pink-300'
                                                        : s.isAddon
                                                          ? 'bg-amber-50 text-amber-700 border-dashed border-amber-300'
                                                          : 'bg-slate-50 text-slate-700 border-transparent'
                                                      }`}
                                                  >
                                                    {s.isCompleted ? '✓' : '◻'} {s.title}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>

                      {/* Keep details shown for expandedTasks (compatibility) */}
                      {(stepTasks[step.id] || []).map((task: any) => {
                        const isTaskExpanded = expandedTasks.includes(task.id);
                        const subs = taskSubtasks[task.id] || [];
                        return isTaskExpanded ? (
                          <tr key={`details-${task.id}`} className="border-b bg-white">
                            <td className="border-r" />
                            <td colSpan={6} className="px-4 py-2">
                              <div className="bg-white border rounded p-3">
                                <div className="flex items-center justify-between">
                                  <div className="text-sm font-semibold">{task.taskName}</div>
                                  <div className="flex items-center gap-2">
                                    <Button size="sm" onClick={() => { setShowSubtaskFormFor(showSubtaskFormFor === task.id ? null : task.id); if (!isTaskExpanded) { setExpandedTasks((p) => [...p, task.id]); fetchSubtasksForTask(task.id); } }}>+ Sub</Button>
                                    <Button variant="outline" size="sm" onClick={() => { setEditingStep(null); }}>Edit</Button>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <div className="text-xs text-slate-500">Start: {formatDate(task.startDate)} • End: {formatDate(task.endDate)} • Priority: {task.priority}</div>
                                  <div className="mt-3">
                                    {subs.length === 0 ? <div className="text-xs text-slate-400 italic">No subtasks yet.</div> : (
                                      subs.map((sub: any) => (
                                        <div
                                          key={sub.id}
                                          className={`flex items-center gap-2 py-1 px-2 rounded ${!sub.isCompleted && sub.isIssue
                                            ? 'bg-pink-50/60 border-l-2 border-dashed border-pink-300'
                                            : !sub.isCompleted && sub.isAddon
                                              ? 'bg-amber-50/60 border-l-2 border-dashed border-amber-300'
                                              : ''
                                            }`}
                                        >
                                          <button onClick={() => toggleSubtask(task.id, sub.id, !!sub.isCompleted)} className={sub.isCompleted ? 'text-green-500' : 'text-slate-300'}>{sub.isCompleted ? <CheckCircle2 size={16} /> : <Circle size={16} />}</button>
                                          <div className={sub.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'}>{sub.title}</div>
                                          <button
                                            onClick={() => toggleSubtaskFlag(task.id, sub.id, "isAddon", !sub.isAddon)}
                                            className={`text-[9px] font-bold uppercase px-1 rounded border border-dashed ${sub.isAddon
                                              ? 'bg-amber-100 text-amber-700 border-amber-300'
                                              : 'bg-white text-slate-300 border-slate-200 hover:text-amber-500 hover:border-amber-300'
                                              }`}
                                            title="Toggle Add-on"
                                          >
                                            Addon
                                          </button>
                                          <button
                                            onClick={() => toggleSubtaskFlag(task.id, sub.id, "isIssue", !sub.isIssue)}
                                            className={`text-[9px] font-bold uppercase px-1 rounded border border-dashed flex items-center gap-0.5 ${sub.isIssue
                                              ? 'bg-pink-100 text-pink-700 border-pink-300'
                                              : 'bg-white text-slate-300 border-slate-200 hover:text-pink-500 hover:border-pink-300'
                                              }`}
                                            title="Toggle Issue"
                                          >
                                            <AlertTriangle size={8} /> Issue
                                          </button>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null;
                      })}
                    </>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ══════════════════════════════════════════════════════════
           ALL PROJECT TASKS PANEL
          ══════════════════════════════════════════════════════════ */}
      {selectedProjectId && (
        <div className="bg-white border rounded-xl overflow-hidden">
          {/* Panel Header */}
          <button
            className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors border-b"
            onClick={() => setShowAllTasks((p) => !p)}
          >
            <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <ListTodo size={16} className="text-blue-500" />
              All Tasks for this Project
              <span className="ml-2 text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                {allProjectTasks.length}
              </span>
            </span>
            {showAllTasks ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {showAllTasks && (
            <div className="overflow-x-auto">
              {allProjectTasks.length === 0 ? (
                <p className="p-8 text-center text-slate-400 text-sm italic">No tasks found for this project.</p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-blue-50 border-b text-xs font-bold uppercase text-slate-600">
                      <th className="px-3 py-2 w-8 border-r" />
                      <th className="px-4 py-2 text-left border-r">Task Name</th>
                      <th className="px-3 py-2 text-center border-r w-32">Key Step</th>
                      <th className="px-3 py-2 text-center border-r w-28">Status</th>
                      <th className="px-3 py-2 text-center border-r w-24">Priority</th>
                      <th className="px-3 py-2 text-center border-r w-26">Start</th>
                      <th className="px-3 py-2 text-center border-r w-26">End</th>
                      <th className="px-3 py-2 text-center w-20">Subtasks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allProjectTasks.map((task: any) => {
                      const isTaskExpanded = expandedTasks.includes(`all-${task.id}`);
                      const subs = taskSubtasks[task.id] || [];
                      const ks = keySteps.find((s) => String(s.id) === String(task.keyStepId));
                      const memberNames = (task.taskMembers || task.assignedMembers || [])
                        .map((id: string) => employees.find((e: any) => String(e.id) === String(id))?.name || id)
                        .filter(Boolean);

                      return (
                        <Fragment key={`all-task-${task.id}`}>
                          <tr className="border-b hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 text-center border-r">
                              <button
                                onClick={() => {
                                  const key = `all-${task.id}`;
                                  const expanding = !expandedTasks.includes(key);
                                  setExpandedTasks((prev) =>
                                    expanding ? [...prev, key] : prev.filter((x) => x !== key)
                                  );
                                  if (expanding) fetchSubtasksForTask(task.id);
                                }}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                {isTaskExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </td>
                            <td className="px-4 py-2 border-r">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-sm font-medium text-slate-800 truncate max-w-[250px]">{task.taskName}</p>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{task.taskName}</p>
                                </TooltipContent>
                              </Tooltip>
                              {memberNames.length > 0 && (
                                <p className="text-xs text-slate-400 mt-0.5">{memberNames.join(", ")}</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center border-r">
                              {ks ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium truncate max-w-[120px] inline-block">
                                      {ks.title}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{ks.title}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-xs text-slate-400 italic">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center border-r">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${getTaskStatusColor(task.status)}`}>
                                {task.status || "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center border-r">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${task.priority === "high" ? "bg-red-100 text-red-700" :
                                task.priority === "medium" ? "bg-amber-100 text-amber-700" :
                                  "bg-green-100 text-green-700"
                                }`}>
                                {task.priority || "medium"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-slate-600 border-r">{formatDate(task.startDate)}</td>
                            <td className="px-3 py-2 text-center text-xs text-slate-600 border-r">{formatDate(task.endDate)}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                {subs.length}
                              </span>
                            </td>
                          </tr>

                          {/* Subtasks */}
                          {isTaskExpanded && (
                            <>
                              {subs.length === 0 ? (
                                <tr className="border-b">
                                  <td className="border-r" />
                                  <td colSpan={7} className="px-6 py-2 pl-10">
                                    <p className="text-xs text-slate-400 italic">No subtasks.</p>
                                  </td>
                                </tr>
                              ) : subs.map((sub: any) => (
                                <tr
                                  key={sub.id}
                                  className={`border-b transition-colors ${!sub.isCompleted && sub.isIssue
                                    ? "bg-pink-50/60 hover:bg-pink-50 border-l-2 border-dashed border-pink-300"
                                    : !sub.isCompleted && sub.isAddon
                                      ? "bg-amber-50/60 hover:bg-amber-50 border-l-2 border-dashed border-amber-300"
                                      : "bg-emerald-50/20 hover:bg-emerald-50/50"
                                    }`}
                                >
                                  <td className="border-r" />
                                  <td className="px-4 py-2 border-r" colSpan={4}>
                                    <div className="flex items-center gap-2 pl-6">
                                      <button
                                        onClick={() => toggleSubtask(task.id, sub.id, !!sub.isCompleted)}
                                        className={sub.isCompleted ? "text-green-500 hover:text-green-600" : "text-slate-300 hover:text-slate-500"}
                                      >
                                        {sub.isCompleted ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                                      </button>
                                      <span className={`text-sm ${sub.isCompleted ? "line-through text-slate-400" : "text-slate-700"}`}>
                                        {sub.title}
                                      </span>
                                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${sub.isCompleted ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                                        {sub.isCompleted ? "Done" : "Pending"}
                                      </span>
                                      <button
                                        onClick={() => toggleSubtaskFlag(task.id, sub.id, "isAddon", !sub.isAddon)}
                                        className={`text-[9px] font-bold uppercase px-1 rounded border border-dashed ${sub.isAddon
                                          ? "bg-amber-100 text-amber-700 border-amber-300"
                                          : "bg-white text-slate-300 border-slate-200 hover:text-amber-500 hover:border-amber-300"
                                          }`}
                                        title="Toggle Add-on"
                                      >
                                        Addon
                                      </button>
                                      <button
                                        onClick={() => toggleSubtaskFlag(task.id, sub.id, "isIssue", !sub.isIssue)}
                                        className={`text-[9px] font-bold uppercase px-1 rounded border border-dashed flex items-center gap-0.5 ${sub.isIssue
                                          ? "bg-pink-100 text-pink-700 border-pink-300"
                                          : "bg-white text-slate-300 border-slate-200 hover:text-pink-500 hover:border-pink-300"
                                          }`}
                                        title="Toggle Issue"
                                      >
                                        <AlertTriangle size={8} /> Issue
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-center text-xs text-slate-500 border-r">{formatDate(sub.startDate)}</td>
                                  <td className="px-3 py-2 text-center text-xs text-slate-500" colSpan={2}>{formatDate(sub.endDate)}</td>
                                </tr>
                              ))}
                            </>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clone Key Step</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cloneTitle">New Key Step Title</Label>
              <Input
                id="cloneTitle"
                value={cloneStepNewTitle}
                onChange={(e) => setCloneStepNewTitle(e.target.value)}
                placeholder="Enter new title..."
              />
            </div>
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCloneDialogOpen(false);
                setCloneStepData(null);
                setCloneStepNewTitle("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCloneStep}>Clone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Key Step</DialogTitle>
          </DialogHeader>

          <div className="py-2 text-sm text-muted-foreground">
            Are you sure you want to delete
            <span className="font-semibold"> {stepToDelete?.title}</span>?
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpenDeleteDialog(false);
                setStepToDelete(null);
              }}
            >
              Cancel
            </Button>

            <Button
              variant="destructive"
              onClick={async () => {
                if (!stepToDelete) return;
                const deletedStep = stepToDelete;

                try {
                  // Optimistic UI update - remove immediately
                  setKeySteps((prev) => prev.filter((s) => s.id !== deletedStep.id));
                  setChildKeySteps((prev) => {
                    const next = { ...prev };
                    delete next[deletedStep.id];
                    return next;
                  });
                  setStepTasks((prev) => {
                    const next = { ...prev };
                    delete next[deletedStep.id];
                    return next;
                  });

                  setOpenDeleteDialog(false);
                  setStepToDelete(null);

                  // API call
                  const res = await apiFetch(`/api/key-steps/${deletedStep.id}`, {
                    method: "DELETE",
                  });

                  if (res.ok) {
                    // Dispatch event for cross-page sync
                    window.dispatchEvent(new CustomEvent('keystep.deleted', { detail: { keyStepId: deletedStep.id } }));
                    toast({ title: "Key Step deleted successfully" });
                  } else {
                    const errText = await res.text();
                    throw new Error(errText || "Failed to delete");
                  }
                } catch (err: any) {
                  // Revert optimistic update
                  fetchSteps();
                  console.error("Error deleting step:", err);
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to delete key step. Changes reverted."
                  });
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}