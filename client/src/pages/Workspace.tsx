import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  ListChecks,
  ClipboardList,
  Star,
  Loader2,
  RefreshCw,
  ExternalLink,
  Clock,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/Layout";

/* ===============================
   Types
================================ */
interface Employee {
  id: string;
  name: string;
  empCode: string | null;
  department: string | null;
  designation: string | null;
}

interface WsTask {
  id: string;
  keyStepId: string | null;
  taskName: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  assignerId: string | null;
  assignerName: string | null;
  taskOwnerId: string | null;
  taskOwnerName: string | null;
  memberIds: string[];
  memberNames: string[];
  isAddon: boolean;
  isIssue: boolean;
  mentionsMe: boolean;
}

interface WsKeyStep {
  id: string;
  parentKeyStepId: string | null;
  header: string | null;
  title: string;
  description: string | null;
  phase: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  taskCount: number;
}

interface WsProject {
  id: string;
  title: string;
  projectCode: string;
  clientName: string | null;
  company: string | null;
  status: string;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  teamIds: string[];
  teamNames: string[];
  involvesMe: boolean;
  keySteps: WsKeyStep[];
  tasks: WsTask[];
}

interface WorkspaceResponse {
  me: { id: string | null; name: string | null };
  employees: Employee[];
  projects: WsProject[];
}

const TASK_STATUSES = ["pending", "in-progress", "Completed", "On Hold", "Cancelled"];
const KEYSTEP_STATUSES = ["pending", "in-progress", "completed", "cancelled"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

export default function Workspace() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [data, setData] = useState<WorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentProjectId, setRecentProjectId] = useState<string | null>(() => localStorage.getItem("pms_recent_project"));

  const markRecent = (projectId: string) => {
    setRecentProjectId(projectId);
    localStorage.setItem("pms_recent_project", projectId);
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "mine">("all");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "progress" | "date">("recent");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [taskDialog, setTaskDialog] = useState<{ projectId: string; keyStepId?: string } | null>(null);
  const [keyStepDialog, setKeyStepDialog] = useState<{ projectId: string } | null>(null);

  // Multi-select + delete state (per project, keyed by projectId -> Set of taskIds)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Record<string, Set<string>>>({});
  const [taskDeleteTarget, setTaskDeleteTarget] = useState<{ projectId: string; taskId: string; taskName: string } | null>(null);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ projectId: string; taskIds: string[] } | null>(null);
  const [keyStepDeleteTarget, setKeyStepDeleteTarget] = useState<{ projectId: string; keyStepId: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toggleTaskSelected = (projectId: string, taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = { ...prev };
      const set = new Set(next[projectId] || []);
      if (set.has(taskId)) set.delete(taskId);
      else set.add(taskId);
      next[projectId] = set;
      return next;
    });
  };

  const toggleSelectAllTasks = (projectId: string, taskIds: string[], checked: boolean) => {
    setSelectedTaskIds((prev) => ({
      ...prev,
      [projectId]: checked ? new Set(taskIds) : new Set(),
    }));
  };

  const deleteTask = async (projectId: string, taskId: string) => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setSelectedTaskIds((prev) => {
        const next = { ...prev };
        const set = new Set(next[projectId] || []);
        set.delete(taskId);
        next[projectId] = set;
        return next;
      });
      toast({ title: "Task deleted" });
      await load(true);
    } catch (err: any) {
      toast({ title: "Couldn't delete task", description: err?.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setTaskDeleteTarget(null);
    }
  };

  const bulkDeleteTasks = async (projectId: string, taskIds: string[]) => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/tasks/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setSelectedTaskIds((prev) => ({ ...prev, [projectId]: new Set() }));
      toast({ title: `Deleted ${taskIds.length} task(s)` });
      await load(true);
    } catch (err: any) {
      toast({ title: "Couldn't delete tasks", description: err?.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setBulkDeleteTarget(null);
    }
  };

  const deleteKeyStep = async (keyStepId: string) => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/key-steps/${keyStepId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "Key step deleted" });
      await load(true);
    } catch (err: any) {
      toast({ title: "Couldn't delete key step", description: err?.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setKeyStepDeleteTarget(null);
    }
  };

  const load = async (bypassCache = false) => {
    try {
      setRefreshing(true);
      const res = await apiFetch("/api/workspace", { bypassCache });
      if (!res.ok) throw new Error("Failed to load workspace");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      toast({ title: "Failed to load Workspace", description: err?.message || "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const employeeMap = useMemo(() => {
    const m = new Map<string, Employee>();
    (data?.employees || []).forEach((e) => m.set(e.id, e));
    return m;
  }, [data]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    let list = [...data.projects];

    if (scopeFilter === "mine") list = list.filter((p) => p.involvesMe);
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list
        .map((p) => {
          const projectMatches =
            p.title.toLowerCase().includes(q) ||
            p.projectCode?.toLowerCase().includes(q) ||
            p.clientName?.toLowerCase().includes(q);
          const matchingKeySteps = p.keySteps.filter((k) => k.title.toLowerCase().includes(q));
          const matchingTasks = p.tasks.filter((t) => t.taskName.toLowerCase().includes(q));
          if (projectMatches || matchingKeySteps.length || matchingTasks.length) {
            return p;
          }
          return null;
        })
        .filter(Boolean) as WsProject[];
    }

    if (sortBy === "name") list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === "progress") list.sort((a, b) => b.progress - a.progress);
    else if (sortBy === "date") {
      list.sort((a, b) => {
        const aTime = a.startDate ? new Date(a.startDate).getTime() : 0;
        const bTime = b.startDate ? new Date(b.startDate).getTime() : 0;
        return bTime - aTime; // newest start date first
      });
    }
    else if (sortBy === "recent" && recentProjectId) {
      list.sort((a, b) => {
        if (a.id === recentProjectId) return -1;
        if (b.id === recentProjectId) return 1;
        return 0;
      });
    }

    return list;
  }, [data, search, statusFilter, scopeFilter, sortBy, recentProjectId]);

  const toggleExpand = (id: string) => {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
    if (!expanded[id]) {
      markRecent(id);
    }
  };

  /* ---------- Inline mutations ---------- */

  const patchTask = async (taskId: string, body: any, projectId: string) => {
    try {
      const res = await apiFetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      markRecent(projectId);
      await load(true);
    } catch (err: any) {
      toast({ title: "Couldn't update task", description: err?.message, variant: "destructive" });
    }
  };

  const patchKeyStep = async (id: string, body: any, projectId: string) => {
    try {
      const res = await apiFetch(`/api/key-steps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      markRecent(projectId);
      await load(true);
    } catch (err: any) {
      toast({ title: "Couldn't update key step", description: err?.message, variant: "destructive" });
    }
  };

  const patchProject = async (id: string, body: any) => {
    try {
      const res = await apiFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = "Update failed";
        try {
          const errBody = await res.json();
          msg = errBody?.error || errBody?.message || msg;
        } catch {
          // ignore parse errors, keep default message
        }
        throw new Error(msg);
      }
      markRecent(id);
      await load(true);
    } catch (err: any) {
      toast({ title: "Couldn't update project", description: err?.message, variant: "destructive" });
    }
  };

  // Project status can require extra info (e.g. "On Hold" needs a reason on
  // the server). Handle that here so the change actually goes through
  // instead of silently failing with a generic error.
  const handleProjectStatusChange = (project: WsProject, newStatus: string) => {
    if (newStatus === "On Hold") {
      const existingReason = (project as any).holdReason || "";
      const reason = window.prompt("Please enter the reason for putting this project on hold:", existingReason);
      if (reason === null) return; // user cancelled
      if (!reason.trim()) {
        toast({ title: "Hold reason required", description: "Please provide a reason to put this project on hold.", variant: "destructive" });
        return;
      }
      patchProject(project.id, { status: newStatus, holdReason: reason.trim() });
    } else {
      patchProject(project.id, { status: newStatus });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading workspace...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Workspace</h1>
          <p className="text-muted-foreground mt-1">
            One place to view and manage Projects, Key Steps, and Tasks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button onClick={() => navigate("/admin-tasks")}>
              <ListChecks className="mr-2 h-4 w-4" />
              My Tasks
            </Button>
          )}
          <Button variant="outline" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects, key steps, tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={scopeFilter} onValueChange={(v) => setScopeFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All Projects</TabsTrigger>
            <TabsTrigger value="mine">My Projects</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Planned">Planned</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="On Hold">On Hold</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Default Order</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="progress">Progress</SelectItem>
            <SelectItem value="date">Date (Newest First)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredProjects.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No projects match your filters.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {filteredProjects.map((project) => {
          const isOpen = !!expanded[project.id];
          return (
            <Card key={project.id} className="overflow-hidden">
              <CardHeader
                className="cursor-pointer select-none"
                onClick={() => toggleExpand(project.id)}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-2">
                    {isOpen ? (
                      <ChevronDown className="h-5 w-5 mt-1 shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 mt-1 shrink-0" />
                    )}
                    <div>
                      <CardTitle className="flex items-center gap-2 flex-wrap">
                        {project.title}
                        <Badge variant="outline">{project.projectCode}</Badge>
                        {project.id === recentProjectId && (
                          <Badge variant="outline" className="gap-1 border-primary/50 text-primary bg-primary/5">
                            <Clock className="h-3 w-3" /> Recent
                          </Badge>
                        )}
                        {project.involvesMe && (
                          <Badge variant="secondary" className="gap-1">
                            <Star className="h-3 w-3" /> Mine
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {project.clientName || "No client"} · {project.keySteps.length} key steps ·{" "}
                        {project.tasks.length} tasks
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <div className="w-32">
                      <Progress value={project.progress} />
                    </div>
                    <span className="text-sm text-muted-foreground w-10">{project.progress}%</span>
                    <Select
                      value={project.status}
                      onValueChange={(v) => handleProjectStatusChange(project, v)}
                    >
                      <SelectTrigger className="w-36 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Planned">Planned</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="On Hold">On Hold</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              {isOpen && (
                <CardContent className="space-y-6 border-t pt-4">
                  {/* Key Steps */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <ListChecks className="h-4 w-4" /> Key Steps
                      </h4>
                      <Button size="sm" variant="outline" onClick={() => setKeyStepDialog({ projectId: project.id })}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Key Step
                      </Button>
                    </div>
                    {project.keySteps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No key steps yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Phase</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Dates</TableHead>
                            <TableHead>Tasks</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {project.keySteps.map((ks) => (
                            <TableRow
                              key={ks.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => navigate(`/tasks?projectId=${project.id}&keyStepId=${ks.id}`)}
                              title="View tasks for this key step"
                            >
                              <TableCell className="font-medium">{ks.title}</TableCell>
                              <TableCell>{ks.phase}</TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Select
                                  value={ks.status}
                                  onValueChange={(v) => patchKeyStep(ks.id, { status: v }, project.id)}
                                >
                                  <SelectTrigger className="h-8 w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {KEYSTEP_STATUSES.map((s) => (
                                      <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {ks.startDate || "—"} → {ks.endDate || "—"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/tasks?projectId=${project.id}&keyStepId=${ks.id}`);
                                  }}
                                >
                                  {ks.taskCount} task{ks.taskCount === 1 ? "" : "s"}
                                </Badge>
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  title="Delete key step"
                                  onClick={() => setKeyStepDeleteTarget({ projectId: project.id, keyStepId: ks.id, title: ks.title })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>

                  {/* Tasks — grouped by key step so they line up under the step they belong to */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" /> Tasks
                      </h4>
                      <div className="flex items-center gap-2">
                        {(selectedTaskIds[project.id]?.size || 0) > 0 && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              setBulkDeleteTarget({
                                projectId: project.id,
                                taskIds: Array.from(selectedTaskIds[project.id] || []),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Delete {selectedTaskIds[project.id]?.size} selected
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/tasks?projectId=${project.id}`)}
                          title="Open the full Tasks page filtered to this project"
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open in Tasks
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setTaskDialog({ projectId: project.id })}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
                        </Button>
                      </div>
                    </div>
                    {project.tasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No tasks yet.</p>
                    ) : (
                      <div className="space-y-5">
                        {[
                          ...project.keySteps.map((ks) => ({
                            key: ks.id,
                            label: ks.title,
                            tasks: project.tasks.filter((t) => t.keyStepId === ks.id),
                          })),
                          {
                            key: "__none__",
                            label: "No Key Step",
                            tasks: project.tasks.filter(
                              (t) => !t.keyStepId || !project.keySteps.some((ks) => ks.id === t.keyStepId)
                            ),
                          },
                        ]
                          .filter((group) => group.tasks.length > 0)
                          .map((group) => {
                            const groupTaskIds = group.tasks.map((t) => t.id);
                            const selected = selectedTaskIds[project.id] || new Set<string>();
                            const allGroupSelected = groupTaskIds.length > 0 && groupTaskIds.every((id) => selected.has(id));
                            return (
                              <div key={group.key}>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                                  {group.label}
                                </p>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-10">
                                        <Checkbox
                                          checked={allGroupSelected}
                                          onCheckedChange={(v) => toggleSelectAllTasks(project.id, groupTaskIds, !!v)}
                                          aria-label="Select all tasks in this group"
                                        />
                                      </TableHead>
                                      <TableHead>Task</TableHead>
                                      <TableHead>Owner</TableHead>
                                      <TableHead>Assign To</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Priority</TableHead>
                                      <TableHead>Progress</TableHead>
                                      <TableHead className="w-10" />
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {group.tasks.map((t) => (
                                      <TableRow key={t.id} className={t.mentionsMe ? "bg-muted/40" : undefined}>
                                        <TableCell>
                                          <Checkbox
                                            checked={selected.has(t.id)}
                                            onCheckedChange={() => toggleTaskSelected(project.id, t.id)}
                                            aria-label={`Select ${t.taskName}`}
                                          />
                                        </TableCell>
                                        <TableCell className="font-medium">
                                          {t.taskName}
                                          {t.isIssue && <Badge variant="destructive" className="ml-2 text-xs">Issue</Badge>}
                                          {t.isAddon && <Badge variant="secondary" className="ml-2 text-xs">Addon</Badge>}
                                        </TableCell>
                                        <TableCell className="text-sm">{t.taskOwnerName || "Unassigned"}</TableCell>
                                        <TableCell>
                                          <Select
                                            value={t.taskOwnerId || "unassigned"}
                                            onValueChange={(v) =>
                                              patchTask(t.id, { taskOwnerId: v === "unassigned" ? null : v }, project.id)
                                            }
                                          >
                                            <SelectTrigger className="h-8 w-36">
                                              <SelectValue placeholder="Assign" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="unassigned">Unassigned</SelectItem>
                                              {(data?.employees || []).map((e) => (
                                                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </TableCell>
                                        <TableCell>
                                          <Select
                                            value={t.status}
                                            onValueChange={(v) => patchTask(t.id, { status: v }, project.id)}
                                          >
                                            <SelectTrigger className="h-8 w-32">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {TASK_STATUSES.map((s) => (
                                                <SelectItem key={s} value={s}>{s}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </TableCell>
                                        <TableCell>
                                          <Select
                                            value={t.priority}
                                            onValueChange={(v) => patchTask(t.id, { priority: v }, project.id)}
                                          >
                                            <SelectTrigger className="h-8 w-28">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {PRIORITIES.map((p) => (
                                                <SelectItem key={p} value={p}>{p}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </TableCell>
                                        <TableCell className="w-36">
                                          <div className="flex items-center gap-2">
                                            <Progress value={t.progress} className="w-16" />
                                            <Input
                                              type="number"
                                              min={0}
                                              max={100}
                                              defaultValue={t.progress}
                                              key={`${t.id}-${t.progress}`}
                                              className="h-8 w-16 px-2 text-xs"
                                              onBlur={(e) => {
                                                const raw = Number(e.target.value);
                                                const next = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : t.progress;
                                                if (next !== t.progress) {
                                                  patchTask(t.id, { progress: next }, project.id);
                                                }
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                              }}
                                            />
                                            <span className="text-xs text-muted-foreground">%</span>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            title="Delete task"
                                            onClick={() =>
                                              setTaskDeleteTarget({ projectId: project.id, taskId: t.id, taskName: t.taskName })
                                            }
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {taskDialog && (
        <QuickAddTaskDialog
          projectId={taskDialog.projectId}
          keySteps={data?.projects.find((p) => p.id === taskDialog.projectId)?.keySteps || []}
          employees={data?.employees || []}
          onClose={() => setTaskDialog(null)}
          onCreated={() => {
            setTaskDialog(null);
            load(true);
          }}
        />
      )}

      {keyStepDialog && (
        <QuickAddKeyStepDialog
          projectId={keyStepDialog.projectId}
          onClose={() => setKeyStepDialog(null)}
          onCreated={() => {
            setKeyStepDialog(null);
            load(true);
          }}
        />
      )}

      <AlertDialog open={!!taskDeleteTarget} onOpenChange={(v) => !v && setTaskDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{taskDeleteTarget?.taskName}" and its subtasks. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => taskDeleteTarget && deleteTask(taskDeleteTarget.projectId, taskDeleteTarget.taskId)}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bulkDeleteTarget} onOpenChange={(v) => !v && setBulkDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkDeleteTarget?.taskIds.length} tasks?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected tasks and their subtasks. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => bulkDeleteTarget && bulkDeleteTasks(bulkDeleteTarget.projectId, bulkDeleteTarget.taskIds)}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!keyStepDeleteTarget} onOpenChange={(v) => !v && setKeyStepDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete key step?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{keyStepDeleteTarget?.title}" and any child key steps. Tasks under it will
              remain but lose their key step link. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => keyStepDeleteTarget && deleteKeyStep(keyStepDeleteTarget.keyStepId)}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ===============================
   Quick Add Task Dialog
================================ */
function QuickAddTaskDialog({
  projectId,
  keySteps,
  employees,
  onClose,
  onCreated,
}: {
  projectId: string;
  keySteps: WsKeyStep[];
  employees: Employee[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [keyStepId, setKeyStepId] = useState<string>("none");
  const [taskOwnerId, setTaskOwnerId] = useState<string>("unassigned");
  const [priority, setPriority] = useState("medium");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!taskName.trim()) {
      toast({ title: "Task name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          keyStepId: keyStepId === "none" ? null : keyStepId,
          taskName: taskName.trim(),
          description,
          priority,
          taskOwnerId: taskOwnerId === "unassigned" ? null : taskOwnerId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to create task");
      }
      toast({ title: "Task created" });
      onCreated();
    } catch (err: any) {
      toast({ title: "Couldn't create task", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
          <DialogDescription>Create a task directly from the Workspace.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Task Name</Label>
            <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="Task name" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Key Step</Label>
              <Select value={keyStepId} onValueChange={setKeyStepId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {keySteps.map((ks) => (
                    <SelectItem key={ks.id} value={ks.id}>{ks.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign To</Label>
              <Select value={taskOwnerId} onValueChange={setTaskOwnerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating..." : "Create Task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===============================
   Quick Add Key Step Dialog
================================ */
function QuickAddKeyStepDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/key-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          description,
          phase: Number(phase) || 1,
          status: "pending",
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to create key step");
      }
      toast({ title: "Key step created" });
      onCreated();
    } catch (err: any) {
      toast({ title: "Couldn't create key step", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Key Step</DialogTitle>
          <DialogDescription>Create a key step directly from the Workspace.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Key step title" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Phase</Label>
              <Input type="number" min={1} value={phase} onChange={(e) => setPhase(e.target.value)} />
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating..." : "Create Key Step"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}