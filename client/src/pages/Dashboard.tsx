import { useState, useEffect, useRef } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  RadialBar,
  RadialBarChart,
  PolarAngleAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";
import {
  CheckCircle2,
  Layers,
  ChevronDown,
  Download,
  Plus,
  Briefcase,
  Calendar,
  AlertCircle,
  Trash2,
  Ticket,
  GanttChartSquare,
  Search,
  Flame,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Progress } from "@/components/ui/progress";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/Layout";
import { ProjectTimelineDialog } from "@/components/ProjectTimelineDialog";

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [keySteps, setKeySteps] = useState<any[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState({ analytics: true });
  const [newProjectDialog, setNewProjectDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<any>(null);
  const [, setLocation] = useLocation();

  const [newProject, setNewProject] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    status: "open" as const,
    department: "" as string,
    vendors: "",
  });
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const dashboardRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const [newTickets, setNewTickets] = useState<any[]>([]);

  // Employees (needed for the Project Timeline / Gantt dialog, same as Projects page)
  const [employees, setEmployees] = useState<any[]>([]);

  // Project Timeline / Gantt dialog (same component & behavior as the Projects page)
  const [timelineProject, setTimelineProject] = useState<any | null>(null);
  const [timelineDialogOpen, setTimelineDialogOpen] = useState(false);

  // Search bar for the "Active Projects" listing box
  const [projectSearchQuery, setProjectSearchQuery] = useState("");

  // Fetch ticket notifications for the current user
  useEffect(() => {
    if (!user?.employeeId) {
      console.log("[TICKET-NOTIF-DEBUG] No employeeId found on user:", user);
      return;
    }

    console.log("[TICKET-NOTIF-DEBUG] Setting up notification fetch for employeeId:", user.employeeId);

    const fetchTickets = async () => {
      try {
        const res = await apiFetch("/api/tickets");
        if (!res.ok) throw new Error("Failed to fetch tickets");
        const data = await res.json();

        // Find tickets where current user is assignee or CC'd participant
        // AND which are not marked as seen in localStorage
        const seenIds = JSON.parse(localStorage.getItem("seen_ticket_ids") || "[]");

        console.log("[TICKET-NOTIF-DEBUG] All fetched tickets count:", data.length);
        console.log("[TICKET-NOTIF-DEBUG] seen IDs in localStorage:", seenIds);

        const unread = data.filter((t: any) => {
          // Check if ticket is active (not Resolved/Closed)
          const isActive = !["resolved", "closed"].includes(String(t.status).toLowerCase());
          if (!isActive) return false;

          const isAssignee = String(t.assignedTo) === String(user.employeeId);
          const isParticipant = Array.isArray(t.participants) && t.participants.map(String).includes(String(user.employeeId));

          const isMatching = isAssignee || isParticipant;

          if (isMatching) {
            console.log(`[TICKET-NOTIF-DEBUG] Ticket ${t.ticketCode} matches! isAssignee: ${isAssignee}, isParticipant: ${isParticipant}, isSeen: ${seenIds.includes(t.id)}`);
          }

          if (!isMatching) return false;

          return !seenIds.includes(t.id);
        });

        console.log("[TICKET-NOTIF-DEBUG] Final unread notifications list:", unread);
        setNewTickets(unread);
      } catch (err) {
        console.error("[TICKET-NOTIF-DEBUG] Fetch new tickets error:", err);
      }
    };

    fetchTickets();

    // Check every 60 seconds (reduced from 10s for better performance)
    // Pause polling when tab is inactive (improves performance on background tabs)
    const poll = () => {
      if (document.visibilityState === 'visible') {
        fetchTickets();
      }
    };
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [user?.employeeId]);

  const dismissAllTickets = () => {
    const seenIds = JSON.parse(localStorage.getItem("seen_ticket_ids") || "[]");
    newTickets.forEach(t => {
      if (!seenIds.includes(t.id)) seenIds.push(t.id);
    });
    localStorage.setItem("seen_ticket_ids", JSON.stringify(seenIds));
    setNewTickets([]);
  };

  // Fetch departments on mount
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await apiFetch("/api/departments");
        if (!res.ok) throw new Error("Failed to fetch departments");
        const data = await res.json();
        setDepartments(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Fetch departments error:", err);
      }
    };
    fetchDepartments();
  }, []);

  // Fetch employees on mount (used to resolve assignee names in the Timeline/Gantt dialog)
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await apiFetch("/api/employees");
        if (!res.ok) throw new Error("Failed to fetch employees");
        const data = await res.json();
        setEmployees(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Fetch employees error:", err);
        setEmployees([]);
      }
    };
    fetchEmployees();
  }, []);

  // ---------------- PROJECTS ----------------

  const fetchProjects = async () => {
    try {
      const res = await apiFetch("/api/projects?status=all");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.error("Fetch projects error:", err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const getProjectName = (projectId: any) => {
    const project = projects.find((p) => String(p.id) === String(projectId));
    return project ? project.title : "Unknown Project";
  };


  // ---------------- TASKS (BULK FETCH) ----------------

  const fetchTasks = async () => {
    try {
      if (projects.length === 0) {
        setTasks([]);
        return;
      }
      // Fetch all tasks for all projects at once
      const res = await apiFetch("/api/tasks/bulk?status=all");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch tasks error:", err);
      setTasks([]);
    }
  };

  // ---------------- KEY STEPS (BULK FETCH) ----------------

  const fetchKeySteps = async () => {
    try {
      if (projects.length === 0) {
        setKeySteps([]);
        return;
      }
      // Fetch all keysteps for all projects at once
      const res = await apiFetch("/api/keysteps/bulk?status=all");
      if (!res.ok) throw new Error("Failed to fetch keysteps");
      const data = await res.json();
      setKeySteps(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch keysteps error:", err);
      setKeySteps([]);
    }
  };

  useEffect(() => {
    if (projects.length > 0) {
      // Fetch tasks and keysteps in parallel (not sequentially)
      Promise.all([fetchTasks(), fetchKeySteps()]);
    }
  }, [projects]);

  // ---------------- CREATE PROJECT ----------------

  const handleCreateProject = async () => {
    if (isCreatingProject) return;
    if (!newProject.title || !newProject.startDate || !newProject.endDate) return;

    setIsCreatingProject(true);
    try {
      // Auto-generate project code from title (e.g., "My Project" -> "MYPROJECT")
      const autoProjectCode = newProject.title
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .substring(0, 20) || "PROJECT";

      const response = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newProject.title,
          projectCode: autoProjectCode,
          description: newProject.description,
          startDate: newProject.startDate,
          endDate: newProject.endDate,
          status: newProject.status,
          department: newProject.department ? [newProject.department] : [],
          vendors: newProject.vendors ? [newProject.vendors] : [],
          progress: 0,
          team: [],
        }),
      });

      if (!response.ok) throw new Error("Failed to create project");

      await fetchProjects();
      setNewProject({
        title: "",
        description: "",
        startDate: "",
        endDate: "",
        status: "open",
        department: "",
        vendors: "",
      });
      setNewProjectDialog(false);
    } catch (err) {
      console.error(err);
      alert("Failed to create project");
    } finally {
      setIsCreatingProject(false);
    }
  };

  // ---------------- DELETE PROJECT ----------------

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    try {
      const response = await apiFetch(`/api/projects/${projectToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete project");

      await fetchProjects();
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    } catch (err) {
      console.error(err);
      alert("Failed to delete project");
    }
  };

  // ---------------- PROJECTS ----------------
  const activeProjects = projects.filter(p =>
    !["closed", "completed", "done"].includes(String(p.status).toLowerCase())
  );

  // Active (non-completed) key steps — used for the "pending steps" summary card,
  // kept separate from the full `keySteps` set so completion % charts stay accurate.
  const activeKeySteps = keySteps.filter((ks) =>
    !["completed", "done", "closed"].includes(String(ks.status).toLowerCase())
  );

  const pendingTasks = tasks.filter((t) =>
    !["completed", "done", "closed"].includes(String(t.status).toLowerCase())
  );

  const completedCount = tasks.filter((t) =>
    ["completed", "done", "closed"].includes(String(t.status).toLowerCase())
  ).length;

  const unassignedCount = pendingTasks.filter((t) => !t.assignerId).length;

  const completionPercent =
    tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  // ---------------- UI HELPERS ----------------

  const toggleSection = (section: string) => {
    //setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // ---------------- REAL ANALYTICS DATA ----------------

  // Bar chart: tasks per project
  const barData = activeProjects.map((project) => {
    const projectTasks = tasks.filter((t) => t.projectId === project.id);
    const completed = projectTasks.filter((t) =>
      ["completed", "done", "closed"].includes(String(t.status).toLowerCase())
    ).length;
    const pending = projectTasks.length - completed;

    return {
      name: project.title,
      pending,
      completed,
    };
  });

  // Pie chart: key steps completion
  const completedKeySteps = keySteps.filter((ks) =>
    ["completed", "done", "closed"].includes(String(ks.status).toLowerCase())
  ).length;

  const pieData = [
    { name: "Completed", value: completedKeySteps, color: "hsl(var(--chart-2))" },
    { name: "Pending", value: keySteps.length - completedKeySteps, color: "hsl(var(--chart-1))" },
  ];

  // -------- GROUP KEY STEPS BY PROJECT (TOP STATS) --------
  const groupedKeySteps = activeProjects
    .map((project) => {
      const steps = activeKeySteps.filter((ks) => String(ks.projectId) === String(project.id));
      return {
        projectId: project.id,
        projectName: project.title,
        steps,
      };
    })
    .filter((g) => g.steps.length > 0);

  // -------- FILTERED / SEARCHABLE ACTIVE PROJECTS LIST --------
  const filteredActiveProjects = activeProjects.filter((p) =>
    p.title?.toLowerCase().includes(projectSearchQuery.trim().toLowerCase())
  );

  // ---------------- COLORFUL ANALYTICS (Zoho-style) ----------------

  // Donut: Projects grouped by status
  const PROJECT_STATUS_COLORS: Record<string, string> = {
    "not started": "#94a3b8",
    "open": "#38bdf8",
    "in-progress": "#3b82f6",
    "in progress": "#3b82f6",
    "on hold": "#f59e0b",
    "delayed": "#ef4444",
    "completed": "#10b981",
    "closed": "#10b981",
    "done": "#10b981",
  };

  const projectStatusData = (() => {
    const counts = new Map<string, number>();
    projects.forEach((p) => {
      const key = (p.status || "Open").toString();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([status, value]) => ({
      name: status,
      value,
      color: PROJECT_STATUS_COLORS[status.toLowerCase()] || "#a78bfa",
    }));
  })();

  // Donut: Tasks grouped by priority
  const TASK_PRIORITY_COLORS: Record<string, string> = {
    critical: "#dc2626",
    high: "#f97316",
    medium: "#eab308",
    low: "#22c55e",
  };

  const taskPriorityData = (() => {
    const counts = new Map<string, number>();
    tasks.forEach((t) => {
      const key = (t.priority || "Medium").toString();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([priority, value]) => ({
      name: priority,
      value,
      color: TASK_PRIORITY_COLORS[priority.toLowerCase()] || "#8b5cf6",
    }));
  })();

  // Radial gauge: overall task completion
  const gaugeColor =
    completionPercent >= 70 ? "#10b981" : completionPercent >= 40 ? "#f59e0b" : "#ef4444";
  const gaugeData = [{ name: "Completion", value: completionPercent, fill: gaugeColor }];


  // ---------------- RENDER ----------------

  return (
    <div ref={dashboardRef} className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Welcome back. Here's what's happening today.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            className="hidden sm:flex font-bold bg-gradient-to-r from-primary to-primary/80 hover:to-primary text-white shadow-lg shadow-primary/25 transition-all hover:scale-105 active:scale-95 border-none"
            onClick={() => setLocation("/tickets?tab=raise")}
          >
            <Ticket className="mr-2 h-4 w-4" /> Raise Ticket
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              try {
                // 1️⃣ Summary stats
                const totalProjects = projects.length;
                const totalTasks = tasks.length;
                const totalKeySteps = keySteps.length;

                // 2️⃣ Start HTML for Word
                let html = `
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>Dashboard Export</title></head>
<body>
<h2>Dashboard Summary</h2>
<p><strong>Total Projects:</strong> ${totalProjects}</p>
<p><strong>Total Tasks:</strong> ${totalTasks}</p>
<p><strong>Total Key Steps:</strong> ${totalKeySteps}</p>

<h3>Projects Overview</h3>
<table border="1" cellspacing="0" cellpadding="5">
  <tr>
    <th>Project Name</th>
    <th>Start Date</th>
    <th>End Date</th>
    <th>Progress</th>
    <th>Number of Tasks</th>
    <th>Number of Key Steps</th>
  </tr>
`;

                projects.forEach((p) => {
                  const projectTasks = tasks.filter((t) => t.projectId === p.id);
                  const pendingT = projectTasks.filter(t => !["completed", "done", "closed"].includes(String(t.status).toLowerCase())).length;
                  const projectKeySteps = keySteps.filter((ks) => ks.projectId === p.id);

                  html += `
  <tr>
    <td>${p.title}</td>
    <td>${formatDate(p.startDate)}</td>
    <td>${formatDate(p.endDate)}</td>
    <td>${p.progress || 0}%</td>
    <td>${pendingT}</td>
    <td>${projectKeySteps.length}</td>
  </tr>
`;
                });

                html += `</table></body></html>`;

                // 3️⃣ Create and download Word file
                const blob = new Blob([html], { type: "application/msword" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "dashboard.doc";
                a.click();
                URL.revokeObjectURL(url);
              } catch (err: any) {
                console.error(err);
                alert("Failed to export dashboard: " + err.message);
              }
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>

          <Dialog open={newProjectDialog} onOpenChange={setNewProjectDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Project
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>
                  Add a new project with team members and vendors.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label>Project Name</Label>
                  <Input
                    value={newProject.title}
                    onChange={(e) =>
                      setNewProject({ ...newProject, title: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={newProject.description}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        description: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="date"
                    value={newProject.startDate}
                    onChange={(e) => {
                      const newStartDate = e.target.value;
                      setNewProject((p) => ({
                        ...p,
                        startDate: newStartDate,
                        endDate: p.endDate && newStartDate && p.endDate < newStartDate ? newStartDate : p.endDate,
                      }));
                    }}
                  />
                  <Input
                    type="date"
                    value={newProject.endDate}
                    min={newProject.startDate || undefined}
                    onChange={(e) => {
                      const newEndDate = e.target.value;
                      setNewProject((p) => ({
                        ...p,
                        endDate: p.startDate && newEndDate && newEndDate < p.startDate ? p.startDate : newEndDate,
                      }));
                    }}
                  />
                </div>

                <div>
                  <Label>Department (visible to all members in this department)</Label>
                  <Select
                    value={newProject.department}
                    onValueChange={(val: string) =>
                      setNewProject({ ...newProject, department: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Select
                  value={newProject.status}
                  onValueChange={(val: any) =>
                    setNewProject({ ...newProject, status: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Not Started">Not Started</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setNewProjectDialog(false)}
                >
                  Cancel
                </Button>
                <Button disabled={isCreatingProject} onClick={handleCreateProject}>
                  {isCreatingProject ? "Creating..." : "Create Project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* NEW TICKET NOTIFICATION BANNER */}
      {newTickets.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border-l-4 border-emerald-500 p-4 rounded-r-lg shadow-sm transition-all duration-300 hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-emerald-100/80 rounded-xl text-emerald-700 shadow-inner">
              <Ticket className="h-5 w-5 animate-bounce" />
            </div>
            <div>
              <h3 className="font-extrabold text-emerald-950 text-sm flex items-center gap-2">
                New Support Ticket Assigned / CC'd to You
                <span className="bg-emerald-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                  {newTickets.length} New
                </span>
              </h3>
              <p className="text-xs text-emerald-800/90 mt-1">
                {newTickets.length === 1 ? (
                  <>
                    Ticket <span className="font-bold text-emerald-950">#{newTickets[0].ticketCode}</span> - "{newTickets[0].title}" has been assigned or copied to you.
                  </>
                ) : (
                  <>
                    You have <span className="font-bold text-emerald-950">{newTickets.length} new support tickets</span> that require your attention.
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/10 transition-transform active:scale-95 px-4"
              onClick={() => {
                // Keep the current view but mark them seen
                dismissAllTickets();
                setLocation("/tickets");
              }}
            >
              Open Tickets
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-200 text-emerald-800 hover:bg-emerald-100/50 hover:text-emerald-900 font-bold text-xs transition-transform active:scale-95"
              onClick={dismissAllTickets}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* TOP STATS */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">

        {/* PROJECTS */}
        <Card className="hover:shadow-lg hover:scale-105 transition-transform transition-shadow">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">Active Projects</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>

          <CardContent className="space-y-3">
            {/* Main Count */}
            <div className="flex items-end justify-between">
              <div className="text-3xl font-bold">{activeProjects.length}</div>
              <span className="text-xs text-muted-foreground">
                All time
              </span>
            </div>

            {/* Divider */}
            <div className="h-px bg-border" />

            {/* Sub info row */}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Tracked projects</span>
              <span>Updated live</span>
            </div>
          </CardContent>
        </Card>

        {/* TASKS */}
        <Card className="hover:shadow-lg hover:scale-105 transition-transform transition-shadow">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">Task Completion</CardTitle>
          </CardHeader>

          <CardContent className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tasks yet</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {completedCount} of {tasks.length} tasks completed
                </p>

                <Progress value={completionPercent} />

                <div className="pt-2 space-y-1">
                  {pendingTasks.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      className="text-xs border-b last:border-none py-1 space-y-0.5"
                    >
                      <div className="flex justify-between">
                        <span className="truncate font-medium">
                          {task.taskName || task.title}
                        </span>
                        <div className="flex gap-1">
                          {task.taskPeriod && task.taskPeriod !== 'custom' && (
                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 capitalize">
                              {task.taskPeriod}
                            </Badge>
                          )}
                          {task.reminderFrequency && (
                            <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 capitalize">
                              {task.reminderFrequency}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            {task.status}
                          </Badge>
                        </div>
                      </div>

                      <div className="text-[10px] text-muted-foreground truncate">
                        📁 {getProjectName(task.projectId)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* UNASSIGNED TASKS */}
        <Card className="hover:shadow-lg hover:scale-105 transition-transform transition-shadow">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">Unassigned Tasks</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>

          <CardContent className="space-y-3">
            {/* Main Count */}
            <div className="flex items-end justify-between">
              <div className="text-3xl font-bold text-amber-600">{unassignedCount}</div>
              <span className="text-xs text-muted-foreground">
                Need action
              </span>
            </div>

            {/* Divider */}
            <div className="h-px bg-border" />

            {/* Sub info row */}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Pending assignment</span>
              <span>{tasks.length === 0 ? "0" : Math.round((unassignedCount / tasks.length) * 100)}%</span>
            </div>
          </CardContent>
        </Card>

        {/* KEY STEPS */}
        <Card className="hover:shadow-lg hover:scale-105 transition-transform transition-shadow">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">Key Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">{activeKeySteps.length}</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groupedKeySteps.slice(0, 4).map((group) => (
                <div key={group.projectId} className="space-y-1">
                  {/* Project Name */}
                  <div className="text-xs font-semibold truncate">
                    📁 {group.projectName}
                  </div>

                  {/* Steps under project */}
                  {group.steps.slice(0, 2).map((ks) => (
                    <div
                      key={ks.id}
                      className="text-[11px] text-muted-foreground truncate pl-3"
                    >
                      • {ks.title || ks.stepName}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* CALENDAR */}
        <Card className="hover:shadow-lg hover:scale-105 transition-transform transition-shadow">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">Upcoming</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1">
            {activeProjects.slice(0, 3).map((p) => (
              <div key={p.id} className="text-xs">
                <span className="font-medium">{p.title}</span>
                <div className="text-muted-foreground">{formatDate(p.endDate)}</div>
              </div>
            ))}
          </CardContent>
        </Card>

      </div>

      {/* CURRENT PROJECTS */}
      <Card className="border shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Active Projects</CardTitle>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={projectSearchQuery}
                onChange={(e) => setProjectSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="h-8 w-52 pl-8 text-xs"
              />
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 uppercase font-black text-[10px] whitespace-nowrap">
              {projectSearchQuery.trim()
                ? `${filteredActiveProjects.length} of ${activeProjects.length} Live Projects`
                : `${activeProjects.length} Live Projects`}
            </Badge>
          </div>
        </div>

        <div className="border-t">
          {activeProjects.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground font-bold">
              No live projects found
            </div>
          ) : filteredActiveProjects.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground font-bold">
              No projects match "{projectSearchQuery}"
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/50 border-b sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 text-xs font-bold">Name</th>
                    <th className="px-6 py-3 text-xs font-bold">Status</th>
                    <th className="px-6 py-3 text-xs font-bold">Dates</th>
                    <th className="px-6 py-3 text-xs font-bold">Progress</th>
                    <th className="px-6 py-3 text-xs font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredActiveProjects.map((project) => (
                    <tr key={project.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4 font-semibold text-sm">
                        {project.title}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className={`text-[10px] font-black uppercase px-2 py-0.5 ${String(project.status).toLowerCase() === 'not started' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                          String(project.status).toLowerCase() === 'in-progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-green-50 text-green-700 border-green-200'
                          }`}>
                          {project.status || 'Open'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {formatDate(project.startDate)} — {formatDate(project.endDate)}
                      </td>
                      <td className="px-6 py-4 font-bold text-primary">
                        {project.progress || 0}%
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTimelineProject(project);
                              setTimelineDialogOpen(true);
                            }}
                            title="View Project Timeline & Gantt Chart"
                          >
                            <GanttChartSquare className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setProjectToDelete(project);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* ANALYTICS */}
      <Card>
        <CardHeader
          className="pb-3 cursor-pointer flex justify-between"
          onClick={() => toggleSection("analytics")}
        >
          <div>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>Performance overview</CardDescription>
          </div>
          <ChevronDown
            className={`h-5 w-5 transition-transform ${expandedSections.analytics ? "" : "-rotate-90"
              }`}
          />
        </CardHeader>

        {expandedSections.analytics && (
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* BAR CHART: Tasks per Project */}
              <div className="flex flex-col items-center w-full">
                <h3 className="text-sm font-semibold mb-2">Tasks</h3>

                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="pending" stackId="a" fill="hsl(var(--chart-1))" name="Pending Tasks" />
                    <Bar dataKey="completed" stackId="a" fill="hsl(var(--chart-2))" name="Completed Tasks" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* PIE CHART: Key Steps Completion */}
              <div className="flex flex-col items-center w-full">
                <h3 className="text-sm font-semibold mb-2">Key Steps</h3>

                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, value }) => {
                        const percent =
                          keySteps.length === 0
                            ? 0
                            : ((value / keySteps.length) * 100).toFixed(0);
                        return `${name}: ${value} (${percent}%)`;
                      }}
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.color}
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>

                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      formatter={(value, entry: any) => {
                        const percent =
                          keySteps.length === 0
                            ? 0
                            : ((entry.payload.value / keySteps.length) * 100).toFixed(0);
                        return `${value}: ${percent}%`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* MORE COLORFUL INSIGHTS (Zoho-style widgets) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Insights</CardTitle>
          <CardDescription>A closer look at status, priority & overall health</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* DONUT: Projects by Status */}
            <div className="flex flex-col items-center w-full rounded-xl border bg-gradient-to-b from-muted/30 to-transparent p-3">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" /> Projects by Status
              </h3>
              {projectStatusData.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
                  No project data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={projectStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {projectStatusData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      formatter={(value) => <span className="text-[11px] capitalize">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* DONUT: Tasks by Priority */}
            <div className="flex flex-col items-center w-full rounded-xl border bg-gradient-to-b from-muted/30 to-transparent p-3">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-orange-500" /> Tasks by Priority
              </h3>
              {taskPriorityData.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
                  No task data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={taskPriorityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {taskPriorityData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      formatter={(value) => <span className="text-[11px] capitalize">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* RADIAL GAUGE: Overall Completion */}
            <div className="flex flex-col items-center w-full rounded-xl border bg-gradient-to-b from-muted/30 to-transparent p-3">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5" style={{ color: gaugeColor }} /> Overall Completion
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadialBarChart
                  innerRadius="70%"
                  outerRadius="100%"
                  data={gaugeData}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background dataKey="value" cornerRadius={12} fill={gaugeColor} />
                  <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-foreground"
                    style={{ fontSize: 28, fontWeight: 800 }}
                  >
                    {completionPercent}%
                  </text>
                </RadialBarChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground -mt-2">
                {completedCount} of {tasks.length} tasks completed
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this project? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {projectToDelete && (
            <p className="text-sm">
              Project: <span className="font-bold">{projectToDelete.title}</span>
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setProjectToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteProject}>
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PROJECT TIMELINE & GANTT CHART DIALOG (same component & behavior as the Projects page) */}
      <ProjectTimelineDialog
        open={timelineDialogOpen}
        onOpenChange={(o) => { setTimelineDialogOpen(o); if (!o) setTimelineProject(null); }}
        project={timelineProject}
        employees={employees}
      />
    </div>
  );
}