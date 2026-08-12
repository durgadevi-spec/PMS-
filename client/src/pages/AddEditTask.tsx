import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/Layout";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Plus, Trash2, CheckCircle2, Circle, Check, ChevronsUpDown, Eye } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/apiClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import TaskDependencyManager from "@/components/TaskDependencyManager";
import TaskScheduleHistoryDialog from "@/components/TaskScheduleHistoryDialog";
import SessionTasksPanel from "@/components/SessionTasksPanel";
import DateField from "@/components/DateField";
import { useScheduleChangeReason, scheduleFieldsChanged } from "@/components/ScheduleChangeReasonDialog";
import { useFreeze } from "@/context/FreezeContext";

export default function AddEditTask() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get("id");
  const projectId = searchParams.get("projectId");

  const [employees, setEmployees] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [keySteps, setKeySteps] = useState<any[]>([]);
  const [subtasks, setSubtasks] = useState<any[]>([]);
  // Task Dependency & Automatic Schedule Management (new feature)
  const [originalSchedule, setOriginalSchedule] = useState<{ startDate: string; endDate: string } | null>(null);
  const [sameProjectTasks, setSameProjectTasks] = useState<{ id: string; taskName: string; keyStepId: string | null }[]>([]);
  const { requestReason, ReasonDialog } = useScheduleChangeReason();
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [taskPeriod, setTaskPeriod] = useState<"custom" | "daily" | "weekly" | "monthly">("custom");

  const [updating, setUpdating] = useState(false);

  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [departments, setDepartments] = useState<string[]>([]);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  // Cache keysteps per project to avoid reloading
  const [keystepsCache, setKeystepsCache] = useState<Record<string, any[]>>({});

  const { user } = useAuth();
  const { frozenProjectId } = useFreeze();
  const taskNameInputRef = useRef<HTMLInputElement>(null);
  const focusEditForm = () => {
    taskNameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    taskNameInputRef.current?.focus();
  };

  const [form, setForm] = useState({
    projectId: String(projectId || frozenProjectId || ""),
    keyStepId: "",
    taskName: "",
    description: "",
    startDate: "",
    endDate: "",
    completionDate: "",
    status: "pending",
    priority: "medium" as "low" | "medium" | "high",
    assignerId: "",
    taskMembers: [] as string[],
    tagIds: [] as string[],
    taskPeriod: "custom",
    reminderFrequency: "1 Time",
    taskOwnerId: "",
    isAddon: false,
    isIssue: false,
  });

  // Multi-task session: every task saved in this visit accumulates in
  // `sessionTasks` and stays visible in a floating list panel, so the user
  // can keep adding tasks without leaving the page, then review/edit/reopen
  // any of them from that list.
  const [sessionTasks, setSessionTasks] = useState<
    Array<{ id: string; form: typeof form; subtasks: any[]; savedAt: string }>
  >([]);
  const [sessionPanelCollapsed, setSessionPanelCollapsed] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  // The session task currently loaded into the form for editing (null while
  // drafting a brand-new task).
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);


  // When creating a new task, default assigner to current user's employee id
  useEffect(() => {
    if (!taskId && user?.employeeId) {
      setForm((f) => ({ ...f, assignerId: String(user.employeeId) }));
    }
  }, [taskId, user]);

  // When creating a new task, default the Start Date and End Date to today so the dates
  // actually get saved with the task (previously they only appeared selected
  // visually but were never set in the form state, so they didn't reflect on
  // the Tasks page after saving and had to be re-selected manually).
  useEffect(() => {
    if (!taskId) {
      const todayStr = new Date().toISOString().split("T")[0];
      setForm((f) => ({
        ...f,
        startDate: f.startDate || todayStr,
        endDate: f.endDate || todayStr,
      }));
    }
  }, [taskId]);

  // Load initial data - employees and projects
  useEffect(() => {
    let isMounted = true;

    Promise.all([
      apiFetch("/api/employees").then((r) => {
        if (!r.ok) throw new Error(`API error: ${r.status}`);
        return r.json();
      }),
      apiFetch("/api/projects").then((r) => {
        if (!r.ok) throw new Error(`API error: ${r.status}`);
        return r.json();
      }),
      apiFetch("/api/tags").then((r) => {
        if (!r.ok) return [];
        return r.json();
      })
    ])
      .then(([empData, projData, tagsData]) => {
        if (!isMounted) return;
        const emps = Array.isArray(empData) ? empData : [];
        setEmployees(emps);
        setAllEmployees(emps);
        setProjects(Array.isArray(projData) ? projData : []);
        setAllTags(Array.isArray(tagsData) ? tagsData : []);

        // If creating a new task (not editing), auto-assign from logged-in user
        if (!taskId && user?.employeeId) {
          setForm((f) => ({ ...f, assignerId: String(user.employeeId) }));
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load data:", err);
        setEmployees([]);
        setProjects([]);
      });

    return () => {
      isMounted = false;
    };
  }, [taskId, user]);

  // Set projectId from URL parameter when projects load (for new tasks)
  useEffect(() => {
    if (!taskId && projectId && projects.length > 0) {
      setForm((f) => ({ ...f, projectId: String(projectId) }));
    }
  }, [taskId, projectId, projects]);

  // If no explicit projectId was passed in the URL and a project is frozen,
  // auto-select the frozen project for new tasks.
  useEffect(() => {
    if (!taskId && !projectId && frozenProjectId != null) {
      setForm((f) => (f.projectId ? f : { ...f, projectId: String(frozenProjectId) }));
    }
  }, [taskId, projectId, frozenProjectId]);

  // OPTIMIZATION: Load project members AND key steps in PARALLEL when project changes
  useEffect(() => {
    if (!form.projectId || form.projectId === "") {
      // Load all employees if no project selected
      setEmployees(allEmployees);
      setKeySteps([]);
      return;
    }

    let isMounted = true;
    const projectId = form.projectId;

    // Load members and keysteps in parallel for faster performance
    Promise.all([
      apiFetch(`/api/projects/${projectId}/members`).then(r => r.ok ? r.json() : []),
      // Check cache first - if keysteps already loaded, use cached version
      keystepsCache[projectId]
        ? Promise.resolve(keystepsCache[projectId])
        : apiFetch(`/api/projects/${projectId}/key-steps`).then(r => r.ok ? r.json() : [])
    ])
      .then(([membersData, keystepsData]) => {
        if (!isMounted) return;

        // Set members
        if (Array.isArray(membersData) && membersData.length > 0) {
          setEmployees(membersData);
        } else {
          setEmployees(allEmployees);
        }

        // Cache and set keysteps
        const ksArray = Array.isArray(keystepsData) ? keystepsData : [];
        if (!keystepsCache[projectId]) {
          setKeystepsCache(prev => ({ ...prev, [projectId]: ksArray }));
        }
        setKeySteps(ksArray);
      })
      .catch(() => {
        if (!isMounted) return;
        // Fallback on error
        setEmployees(allEmployees);
        setKeySteps([]);
      });

    return () => {
      isMounted = false;
    };
  }, [form.projectId, allEmployees, keystepsCache]);

  // AUTO-POPULATE task members from project's departments (only for new tasks)
  useEffect(() => {
    // Only auto-populate when creating a new task, not when editing
    if (taskId || !form.projectId || form.projectId === "") {
      return;
    }

    let isMounted = true;

    // Find the selected project to get its departments
    const selectedProject = projects.find(p => String(p.id) === String(form.projectId));

    if (!selectedProject) {
      return;
    }

    // Get departments from the selected project
    const projectDepts = Array.isArray(selectedProject.department) ? selectedProject.department : [];

    if (projectDepts.length === 0) {
      // No departments selected for this project, don't auto-populate
      return;
    }

    // Filter employees that belong to any of the project's departments
    const deptMembersToAdd = allEmployees
      .filter(emp => {
        if (!emp.department) return false;
        // Normalize department names for case-insensitive comparison
        const empDeptNorm = emp.department.toLowerCase().trim();
        return projectDepts.some((projDept: string) =>
          projDept.toLowerCase().trim() === empDeptNorm
        );
      })
      .map(emp => String(emp.id));

    if (deptMembersToAdd.length > 0 && isMounted) {
      // Auto-populate taskMembers with department employees
      // Only add if taskMembers is currently empty (first time project is selected)
      if (form.taskMembers.length === 0) {
        setForm(prev => ({
          ...prev,
          taskMembers: Array.from(new Set(deptMembersToAdd)) // Remove duplicates
        }));

        // Show notification to user
        const memberNames = allEmployees
          .filter(e => deptMembersToAdd.includes(String(e.id)))
          .map(e => e.name)
          .slice(0, 3)
          .join(", ");
        const moreCount = deptMembersToAdd.length - 3;
        const memberList = moreCount > 0
          ? `${memberNames} and ${moreCount} more`
          : memberNames;

        toast({
          title: "Members Auto-Added",
          description: `Added ${deptMembersToAdd.length} member(s) from selected departments: ${memberList}`,
        });
      }
    }

    return () => {
      isMounted = false;
    };
  }, [form.projectId, projects, allEmployees, taskId, toast]);


  useEffect(() => {
    apiFetch("/api/departments")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to fetch departments", err));
  }, []);

  const filteredEmployees = selectedDepartment === "all" ? employees : employees.filter(e => e.department === selectedDepartment);

  // When the department filter changes, drop any already-selected assignees
  // (task members) and subtask assignees that no longer belong to the
  // newly selected department. "All Departments" never invalidates a selection.
  useEffect(() => {
    if (selectedDepartment === "all") return;

    const validIds = new Set(
      employees
        .filter((e) => e.department === selectedDepartment)
        .map((e) => String(e.id))
    );

    setForm((prev) => {
      const nextTaskMembers = prev.taskMembers.filter((id) => validIds.has(String(id)));
      if (nextTaskMembers.length === prev.taskMembers.length) return prev;
      return { ...prev, taskMembers: nextTaskMembers };
    });

    setSubtasks((prev) => {
      let changed = false;
      const next = prev.map((st) => {
        const currentAssignees = Array.isArray(st.assignedTo) ? st.assignedTo : [];
        const filteredAssignees = currentAssignees.filter((id: string) => validIds.has(String(id)));
        if (filteredAssignees.length !== currentAssignees.length) {
          changed = true;
          return { ...st, assignedTo: filteredAssignees };
        }
        return st;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartment]);

  // Load task data when editing
  useEffect(() => {
    if (!taskId) return;

    let isMounted = true;

    apiFetch(`/api/task/${taskId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`API error: ${r.status}`);
        return r.json();
      })
      .then((task: any) => {
        if (!isMounted) return;
        setForm({
          projectId: String(task.projectId || ""),
          keyStepId: String(task.keyStepId || ""),
          taskName: task.taskName || "",
          description: task.description || "",
          startDate: task.startDate || "",
          endDate: task.endDate || "",
          completionDate: task.completionDate || "",
          status: task.status || "pending",
          priority: task.priority || "medium",
          assignerId: String(task.assignerId || ""),
          taskMembers: task.taskMembers || [],
          tagIds: Array.isArray(task.tags) ? task.tags.map((t: any) => t.id) : [],
          taskPeriod: task.taskPeriod || "custom",
          reminderFrequency: task.reminderFrequency || "1 Time",
          taskOwnerId: String(task.taskOwnerId || ""),
          isAddon: !!task.isAddon,
          isIssue: !!task.isIssue,
        });
        // Task Dependency & Automatic Schedule Management: remember the
        // schedule as it was when the page loaded, so we can tell whether
        // the user is about to manually change it and needs to be asked why.
        setOriginalSchedule({ startDate: task.startDate || "", endDate: task.endDate || "" });
        setTaskPeriod(task.taskPeriod || "custom");
        setSubtasks(
          Array.isArray(task.subtasks)
            ? task.subtasks.map((st: any) => ({
              ...st,
              startDate: st.startDate || "",
              endDate: st.endDate || "",
            }))
            : []
        );
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load task:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [taskId]);

  // Pre-load keysteps for cloning workflow - load when initial projectId is available
  useEffect(() => {
    if (!projectId || !projects.length || keystepsCache[projectId]) return;

    // Pre-fetch keysteps for the cloned project to have them ready
    apiFetch(`/api/projects/${projectId}/key-steps`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setKeystepsCache(prev => ({
          ...prev,
          [projectId]: Array.isArray(data) ? data : []
        }));
      })
      .catch(() => {
        setKeystepsCache(prev => ({
          ...prev,
          [projectId]: []
        }));
      });
  }, [projectId, projects, keystepsCache]);

  // Task Dependency & Automatic Schedule Management: load sibling tasks in
  // the same project so the dependency picker has options. Purely additive;
  // does nothing if the project has no other tasks.
  useEffect(() => {
    if (!form.projectId) {
      setSameProjectTasks([]);
      return;
    }
    let isMounted = true;
    apiFetch(`/api/tasks/${form.projectId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (!isMounted) return;
        setSameProjectTasks(
          Array.isArray(list) ? list.map((t: any) => ({ id: t.id, taskName: t.taskName, keyStepId: t.keyStepId || null })) : []
        );
      })
      .catch(() => {
        if (isMounted) setSameProjectTasks([]);
      });
    return () => {
      isMounted = false;
    };
  }, [form.projectId]);

  const addSubtask = () => {
    setSubtasks((s) => [
      { id: undefined, title: "", description: "", isCompleted: false, assignedTo: [] as string[], startDate: "", endDate: "" },
      ...s,
    ]);
  };

  const updateSubtask = (index: number, key: string, value: any) => {
    setSubtasks((s) =>
      s.map((st, i) => {
        if (i !== index) return st;
        if (key === "endDate") {
          return {
            ...st,
            endDate: st.startDate && value && value < st.startDate ? st.startDate : value,
          };
        }
        if (key === "startDate") {
          return {
            ...st,
            startDate: value,
            endDate: st.endDate && value && st.endDate < value ? value : st.endDate,
          };
        }
        return { ...st, [key]: value };
      })
    );
  };

  const removeSubtask = (index: number) => {
    setSubtasks((s) => s.filter((_, i) => i !== index));
  };


  const [newTagName, setNewTagName] = useState("");
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await apiFetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() })
      });
      if (!res.ok) throw new Error("Failed to create tag");
      const newTag = await res.json();
      setAllTags(prev => [...prev, newTag]);
      setForm(prev => ({
        ...prev,
        tagIds: Array.isArray(prev.tagIds) ? [...prev.tagIds, newTag.id] : [newTag.id]
      }));
      setNewTagName("");
      toast({ title: "Tag created successfully" });
    } catch (err) {
      toast({ title: "Failed to create tag", variant: "destructive" });
    }
  };

  // Reset only the per-task fields to draft a new task — Project,
  // Assigned By, Task Owner, Assignees and Key Step stay as-is since the
  // user is typically adding several tasks for the same project/person.
  // Note: this does NOT clear `sessionTasks` — the running list of tasks
  // already saved in this visit stays visible in the floating panel.
  const resetForNextTask = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    setForm((f) => ({
      ...f,
      taskName: "",
      description: "",
      startDate: todayStr,
      endDate: todayStr,
      completionDate: "",
      status: "pending",
      priority: "medium",
      tagIds: [],
      taskPeriod: "custom",
      isAddon: false,
      isIssue: false,
      // projectId, assignerId, taskOwnerId, taskMembers, keyStepId,
      // reminderFrequency intentionally kept from the previous task.
    }));
    setSubtasks([]);
    setOriginalSchedule(null);
    setEditingSessionId(null);
    focusEditForm();
  };

  const handleSave = async (mode: "save" | "saveAndAddAnother" = "save") => {
    if (!form.taskName || !form.projectId || !form.assignerId) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Task Name, Project, and Assigned By are required",
      });
      return;
    }
    if (!form.taskOwnerId) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Task Owner is required",
      });
      return;
    }
    if (!form.keyStepId) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Key Step is required",
      });
      return;
    }

    // The task we're actually writing to: the route's taskId when editing
    // an existing task directly, otherwise the session task currently
    // loaded into the form (if the user clicked "Edit" on one from the
    // list), otherwise none (a brand-new task not yet saved).
    const effectiveTaskId = taskId || editingSessionId;

    setLoading(true);

    try {
      // Task Dependency & Automatic Schedule Management: if this is an
      // existing task and the Start/End Date actually changed, a reason is
      // mandatory before we save.
      let scheduleReasonPayload: { reason: string; reasonCategory: string } | null = null;
      if (taskId && originalSchedule && scheduleFieldsChanged(originalSchedule, form)) {
        try {
          const result = await requestReason();
          scheduleReasonPayload = { reason: result.reason, reasonCategory: result.reasonCategory };
        } catch {
          // User cancelled the reason prompt — abort the save entirely.
          setLoading(false);
          return;
        }
      }

      const payload: any = { ...form, subtasks };
      if (scheduleReasonPayload) {
        payload.scheduleChangeReason = scheduleReasonPayload.reason;
        payload.reasonCategory = scheduleReasonPayload.reasonCategory;
      }
      const method = effectiveTaskId ? "PUT" : "POST";
      const url = effectiveTaskId ? `/api/tasks/${effectiveTaskId}` : "/api/tasks";

      const response = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let error: any = {};
        try {
          error = await response.json();
        } catch {
          // ignore
        }
        console.error("API Error:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || (Array.isArray(error.details) ? error.details.map((d: any) => d.message).join(", ") : error.details) || "Failed to save task",
        });
        return;
      }

      const result = await response.json();
      console.log("Task saved:", result);
      const savedId = effectiveTaskId ? String(effectiveTaskId) : String(result.id);

      // Notify Tasks.tsx (and any other listeners) that this task changed
      window.dispatchEvent(new CustomEvent('task.edited', {
        detail: { task: { ...result, taskMembers: form.taskMembers, tags: allTags.filter(t => form.tagIds.includes(t.id)) } }
      }));

      toast({
        title: effectiveTaskId ? "Updated" : "Created",
        description: `Task "${form.taskName}" ${effectiveTaskId ? "updated" : "created"} successfully!`,
      });

      // Full "Edit Task" route (existing task reached via /tasks/:id/edit) —
      // there's only ever one task to save here, so behave as before.
      if (taskId) {
        navigate("/tasks");
        return;
      }

      // Add-Task flow: keep a running list of every task saved this visit,
      // so the user can see, edit, and add more without leaving the page.
      const nowLabel = new Date().toLocaleTimeString();
      const snapshot = { id: savedId, form: { ...form }, subtasks: [...subtasks], savedAt: nowLabel };
      setSessionTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === savedId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = snapshot;
          return next;
        }
        return [...prev, snapshot];
      });
      setSessionPanelCollapsed(false);

      if (mode === "saveAndAddAnother") {
        // Keep going: reset the form for the next task, list stays visible.
        resetForNextTask();
        return;
      }

      // Plain "Save": finish up and leave the page.
      navigate("/tasks");
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save task" });
      console.error(err);
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  };

  // Load a previously-saved session task back into the form for editing.
  const editSessionTask = (id: string) => {
    const entry = sessionTasks.find((t) => t.id === id);
    if (!entry) return;
    setForm({ ...entry.form });
    setSubtasks([...entry.subtasks]);
    setEditingSessionId(id);
    setExpandedSessionId(null);
    focusEditForm();
  };

  const handleDelete = async () => {
    if (!taskId) return;

    setDeleting(true);
    try {
      const response = await apiFetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let error: any = {};
        try {
          error = await response.json();
        } catch {
          // ignore
        }
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to delete task",
        });
        return;
      }

      toast({
        title: "Deleted",
        description: `Task "${form.taskName}" deleted successfully!`,
      });

      setDeleteDialogOpen(false);
      navigate("/tasks");
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete task" });
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const showSessionPanel = sessionTasks.length > 0 && !sessionPanelCollapsed;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div
        className={cn(
          "flex gap-6 items-start justify-center transition-all duration-200",
        )}
      >
        <div className={showSessionPanel ? "w-full max-w-3xl" : "w-full max-w-4xl"}>
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => navigate("/tasks")}
              className="hover:bg-slate-200 p-2 rounded-lg"
            >
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-3xl font-bold">
              {taskId ? "Edit Task" : editingSessionId ? "Editing Saved Task" : "Add Task"}
            </h1>
            {sessionTasks.length > 0 && !taskId && (
              <Badge className="bg-green-100 text-green-700">
                {sessionTasks.length} task{sessionTasks.length !== 1 ? "s" : ""} added
              </Badge>
            )}
            {taskId && (
              <div className="ml-auto">
                <TaskScheduleHistoryDialog taskId={taskId} taskName={form.taskName} />
              </div>
            )}
          </div>

          {/* Form */}
          <div className="bg-white rounded-lg border p-8 space-y-6">
            {/* Row 1: Project & Department */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-semibold mb-2 block">Project *</Label>
                <Popover open={projectDropdownOpen} onOpenChange={setProjectDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={projectDropdownOpen}
                      className="w-full justify-between h-10 font-normal"
                    >
                      {form.projectId
                        ? projects.find((p) => String(p.id) === form.projectId)?.title || "Select Project..."
                        : "Select Project..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                    <Command>
                      <CommandInput placeholder="Search project..." />
                      <CommandList className="max-h-80">
                        <CommandEmpty>No project found.</CommandEmpty>
                        <CommandGroup>
                          {projects.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={p.title}
                              onSelect={() => {
                                setForm((f) => ({ ...f, projectId: String(p.id) }));
                                setProjectDropdownOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  form.projectId === String(p.id) ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {p.title}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label className="text-sm font-semibold mb-2 block">Filter Assignees by Department</Label>
                <Select
                  value={selectedDepartment}
                  onValueChange={setSelectedDepartment}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80 overflow-y-auto">
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((d: any) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-semibold mb-2 block">Assigned By *</Label>
                <Select
                  value={form.assignerId}
                  onValueChange={(v) => setForm((f) => ({ ...f, assignerId: v }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select Assigned By" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80 overflow-y-auto">
                    {allEmployees.length > 0 ? (
                      allEmployees.map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-xs text-muted-foreground">No employees available</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-semibold mb-2 block">Task Owner <span className="text-red-500">*</span></Label>
                <Select
                  value={form.taskOwnerId}
                  onValueChange={(v) => setForm((f) => ({ ...f, taskOwnerId: v }))}
                >
                  <SelectTrigger className="h-10 border-amber-300 focus:ring-amber-400">
                    <SelectValue placeholder="Select Task Owner..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-80 overflow-y-auto">
                    {allEmployees.length > 0 ? (
                      allEmployees.map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-xs text-muted-foreground">No employees available</div>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-amber-600 mt-1">Owner is accountable for this task's completion</p>
              </div>

              <div className="col-span-1">
                <Label className="text-sm font-semibold mb-2 block">Assignees (multiple)</Label>
                <Select
                  value=""
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      taskMembers: Array.isArray(f.taskMembers)
                        ? Array.from(new Set([...f.taskMembers, v]))
                        : [v],
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Add assignee..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {filteredEmployees.length > 0 ? (
                      filteredEmployees.map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-xs text-muted-foreground">No employees available</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <div className="flex gap-2 flex-wrap max-h-[150px] overflow-y-auto">
                  {form.taskMembers.map((id) => (
                    <Badge
                      key={id}
                      variant="secondary"
                      className="text-xs cursor-pointer"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          taskMembers: f.taskMembers.filter((x) => x !== id),
                        }))
                      }
                    >
                      {allEmployees.find((e) => String(e.id) === String(id))?.name || id} ✕
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Key Step */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Key Step *</Label>
              <Select
                value={form.keyStepId || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, keyStepId: v === "none" ? "" : v }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select Key Step" />
                </SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  <SelectItem value="none">Select Key Step...</SelectItem>
                  {keySteps.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Task Name & Description */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Task Name *</Label>
              <Input
                ref={taskNameInputRef}
                value={form.taskName}
                onChange={(e) => setForm((f) => ({ ...f, taskName: e.target.value }))}
                placeholder="Enter task name"
                className="h-10"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Enter task description"
                rows={4}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 gap-6">
              <div>
                <Label className="text-sm font-semibold mb-2 block">Task Period</Label>
                <Select
                  value={taskPeriod}
                  onValueChange={(v: any) => {
                    setTaskPeriod(v);
                    if (v !== "custom") {
                      const today = new Date();
                      const startStr = today.toISOString().split("T")[0];
                      let endDate = new Date(today);

                      if (v === "today") {
                        // Same day
                      } else if (v === "1 week") {
                        endDate.setDate(endDate.getDate() + 7);
                      } else if (v === "fortnight") {
                        endDate.setDate(endDate.getDate() + 15);
                      } else if (v === "1 month") {
                        endDate.setMonth(endDate.getMonth() + 1);
                      } else if (v === "quarterly") {
                        endDate.setMonth(endDate.getMonth() + 3);
                      } else if (v === "half yearly") {
                        endDate.setMonth(endDate.getMonth() + 6);
                      } else if (v === "annual") {
                        endDate.setFullYear(endDate.getFullYear() + 1);
                      }

                      const endStr = endDate.toISOString().split("T")[0];
                      setForm((f) => ({
                        ...f,
                        startDate: startStr,
                        endDate: endStr,
                        taskPeriod: v
                      }));
                    } else {
                      setForm(f => ({ ...f, taskPeriod: "custom" }));
                    }
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select task period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="1 week">1 Week</SelectItem>
                    <SelectItem value="fortnight">Fortnight (15 Days)</SelectItem>
                    <SelectItem value="1 month">1 Month</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="half yearly">Half Yearly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-semibold mb-2 block">Reminder Frequency</Label>
                <Select
                  value={form.reminderFrequency}
                  onValueChange={(v: any) => setForm((f) => ({ ...f, reminderFrequency: v }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select reminder frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1 time">1 Time</SelectItem>
                    <SelectItem value="2 times">2 Times</SelectItem>
                    <SelectItem value="4 times">4 Times</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Task Dependency & Automatic Schedule Management (new feature) */}
            {form.projectId && (
              <TaskDependencyManager
                projectId={form.projectId}
                taskId={taskId || ""}
                projectTasks={sameProjectTasks}
                keySteps={keySteps}
              />
            )}

            {/* Addon & Issue Flags */}
            <div className="flex items-center gap-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isAddon"
                  checked={form.isAddon}
                  onChange={(e) => setForm(f => ({ ...f, isAddon: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <Label htmlFor="isAddon" className="text-sm font-semibold cursor-pointer text-amber-700">Mark as Addon</Label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isIssue"
                  checked={form.isIssue}
                  onChange={(e) => setForm(f => ({ ...f, isIssue: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                />
                <Label htmlFor="isIssue" className="text-sm font-semibold cursor-pointer text-red-700">Mark as Issue</Label>
              </div>
            </div>

            <hr className="border-slate-200 my-4" />
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-semibold mb-2 block">Start Date</Label>
                <DateField
                  value={form.startDate}
                  onChange={(newStartDate) => {
                    setTaskPeriod("custom");
                    setForm((f) => ({
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
              <div>
                <Label className="text-sm font-semibold mb-2 block">End Date</Label>
                <DateField
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(newEndDate) => {
                    setTaskPeriod("custom");
                    setForm((f) => ({
                      ...f,
                      endDate:
                        f.startDate && newEndDate && newEndDate < f.startDate
                          ? f.startDate
                          : newEndDate,
                    }));
                  }}
                />
              </div>
              <div>
                <Label className="text-sm font-semibold mb-2 block">Completion Date</Label>
                <DateField
                  value={form.completionDate}
                  clearable
                  onChange={(newCompletionDate) => {
                    setForm((f) => ({ ...f, completionDate: newCompletionDate }));
                  }}
                />
              </div>
            </div>


            {/* Status & Priority */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-semibold mb-2 block">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not started">Not Started</SelectItem>
                    <SelectItem value="pending">Planned</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="on hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-semibold mb-2 block">Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: v as any }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Subtasks */}
            <div className="border-t pt-6 space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-semibold">Subtasks</Label>
                <Button size="sm" variant="outline" onClick={addSubtask}>
                  <Plus className="h-4 w-4 mr-1" /> Add Subtask
                </Button>
              </div>

              {subtasks.map((st, i) => (
                <div key={i} className="p-4 bg-slate-50 border rounded-lg space-y-3">
                  <div className="flex gap-3 items-start">
                    <button onClick={() => updateSubtask(i, "isCompleted", !st.isCompleted)} className="mt-2">
                      {st.isCompleted ? (
                        <CheckCircle2 size={20} className="text-green-500" />
                      ) : (
                        <Circle size={20} className="text-slate-400" />
                      )}
                    </button>

                    <div className="flex-1">
                      <Input
                        placeholder="Subtask title"
                        value={st.title}
                        onChange={(e) => updateSubtask(i, "title", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => removeSubtask(i)}
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>

                  {/* Subtask Description */}
                  <Input
                    placeholder="Description (optional)"
                    value={st.description || ""}
                    onChange={(e) => updateSubtask(i, "description", e.target.value)}
                    className="h-8 text-xs"
                  />

                  {/* Subtask Start Date / End Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px] font-medium text-slate-500 mb-1 block">Start Date</Label>
                      <DateField
                        value={st.startDate || ""}
                        onChange={(v) => updateSubtask(i, "startDate", v)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-medium text-slate-500 mb-1 block">End Date</Label>
                      <DateField
                        value={st.endDate || ""}
                        min={st.startDate || undefined}
                        onChange={(v) => updateSubtask(i, "endDate", v)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">

                    <div>
                      <Select
                        value=""
                        onValueChange={(id) => {
                          if (!st.assignedTo.includes(id)) {
                            updateSubtask(i, "assignedTo", [...st.assignedTo, id]);
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Assign members..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px] overflow-y-auto">
                          {filteredEmployees.map((e) => (
                            <SelectItem key={e.id} value={String(e.id)}>
                              {e.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {st.assignedTo.map((id: string) => (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="text-xs cursor-pointer"
                        onClick={() =>
                          updateSubtask(i, "assignedTo", st.assignedTo.filter((x: string) => x !== id))
                        }
                      >
                        {allEmployees.find((e) => String(e.id) === String(id))?.name || id} ✕
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div className="flex gap-4 justify-between border-t pt-6">
              {/* Delete button (only show when editing) */}
              {taskId && (
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={loading || deleting}
                  className="flex items-center gap-2"
                >
                  <Trash2 size={16} />
                  Delete Task
                </Button>
              )}

              <div className="flex gap-4 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => navigate("/tasks")}
                  disabled={loading || deleting}
                >
                  {sessionTasks.length > 0 ? "Done" : "Cancel"}
                </Button>
                {!taskId && (
                  <Button
                    variant="secondary"
                    onClick={() => handleSave("saveAndAddAnother")}
                    disabled={loading || deleting}
                  >
                    {loading
                      ? "Saving..."
                      : editingSessionId
                        ? "Update & Add Another"
                        : "Save & Add Another"}
                  </Button>
                )}
                <Button onClick={() => handleSave("save")} disabled={loading || deleting}>
                  {loading
                    ? "Saving..."
                    : taskId
                      ? "Save Changes"
                      : editingSessionId
                        ? "Update & Finish"
                        : sessionTasks.length > 0
                          ? "Save & Finish"
                          : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Docked session task list — reserves real layout space next to the
            form (so it can never overlap fields), styled as a floating card.
            Every task saved this visit stays here so it can be reviewed,
            expanded, and reopened for editing without leaving the page. */}
        {showSessionPanel && (
          <div className="hidden lg:block w-[380px] shrink-0 sticky top-6 self-start">
            <SessionTasksPanel
              tasks={sessionTasks}
              projects={projects}
              keySteps={keySteps}
              employees={allEmployees}
              tags={allTags}
              expandedId={expandedSessionId}
              onToggleExpand={(id) => setExpandedSessionId((cur) => (cur === id ? null : id))}
              onEditTask={editSessionTask}
              onClose={() => setSessionPanelCollapsed(true)}
              activeId={editingSessionId}
            />
          </div>
        )}
      </div>

      {/* On small/narrow screens there isn't room for a docked panel, so
          fall back to a full-width floating overlay instead. */}
      {showSessionPanel && (
        <div className="lg:hidden fixed inset-x-4 top-20 z-50 max-w-md mx-auto">
          <SessionTasksPanel
            tasks={sessionTasks}
            projects={projects}
            keySteps={keySteps}
            employees={allEmployees}
            tags={allTags}
            expandedId={expandedSessionId}
            onToggleExpand={(id) => setExpandedSessionId((cur) => (cur === id ? null : id))}
            onEditTask={editSessionTask}
            onClose={() => setSessionPanelCollapsed(true)}
            activeId={editingSessionId}
          />
        </div>
      )}
      {sessionTasks.length > 0 && sessionPanelCollapsed && (
        <button
          onClick={() => setSessionPanelCollapsed(false)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
        >
          <Eye size={16} />
          Show Tasks ({sessionTasks.length})
        </button>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm">
            Task: <span className="font-bold">{form.taskName}</span>
          </p>

          {subtasks.length > 0 && (
            <p className="text-sm text-amber-600">
              ⚠️ This task has {subtasks.length} subtask{subtasks.length !== 1 ? "s" : ""} that will also be deleted.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {ReasonDialog}
    </div>
  );
}