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
  X,
  ArrowRight,
  ArrowUpRight,
  BarChart2,
  Sparkles,
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
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import bannerIllustration from "@/assets/banner-illustration.png";

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

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            className="bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200 rounded-xl shadow-xs transition-colors font-medium px-4"
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
              <Button className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold rounded-xl shadow-sm shadow-blue-900/10 transition-transform active:scale-95 border-none px-4">
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

      {/* WELCOME BANNER (Image 2 style with Option 1 Warm Cream + Royal Blue) */}
      <div className="relative overflow-hidden rounded-2xl bg-[#FEF7DA] border border-[#FDE68A] p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 transition-all">
        {/* Left Text & CTA Section */}
        <div className="max-w-xl space-y-3 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight leading-snug">
            Power your business with Enterprise Project Management
          </h2>
          <p className="text-sm text-stone-600 leading-relaxed max-w-lg">
            Organize projects, track tasks, manage employee workloads, and collaborate seamlessly across departments all in real time.
          </p>
          <div className="pt-2">
            <Button
              className="group bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold px-5 py-2.5 rounded-xl shadow-md shadow-blue-900/10 transition-all active:scale-95 flex items-center gap-2.5 border-none cursor-pointer"
              onClick={() => setLocation("/tickets?tab=raise")}
            >
              <Ticket className="h-4 w-4" />
              <span>Raise Ticket</span>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-white/50 ml-1 transition-transform duration-200 group-hover:translate-x-1">
                <ArrowRight className="h-3 w-3" />
              </span>
            </Button>
          </div>
        </div>

        {/* Right Section: Welcome Banner Illustration (Enlarged Scale & Moved Left without Changing Banner Size) */}
        <div className="w-full md:w-88 lg:w-96 h-44 md:h-48 shrink-0 flex items-center justify-center md:justify-end md:pr-16 lg:pr-28 xl:pr-36 relative select-none">
          <img
            src={bannerIllustration}
            alt="Enterprise Project Management Illustration"
            className="h-full w-auto max-w-full object-contain scale-[1.38] md:scale-[1.48] origin-center drop-shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
          />
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

      {/* TOP STATS - Semantic Pastel Frosted Quartet (4 Unique Bespoke Patterns) */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">

        {/* 1. ACTIVE PROJECTS (Frosted Lavender Glass + Signature 4-Point Stars) */}
        <div
          onClick={() => setLocation("/projects")}
          className="group relative overflow-hidden bg-gradient-to-br from-[#EAE6FE]/95 via-[#E1D6FD]/90 to-[#D7CBFA]/95 backdrop-blur-md border border-white/80 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(167,139,250,0.18)] hover:shadow-[0_12px_28px_rgba(167,139,250,0.28)] hover:border-white hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[140px]"
        >
          {/* Subtle Glass Refraction Highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

          {/* Pattern 1: High-Visibility White 4-Point Sparkle Stars */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none select-none transition-transform duration-500 group-hover:scale-105"
            viewBox="0 0 280 150"
            fill="none"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Primary Large Star in open right area */}
            <path d="M220 52 Q220 68 236 68 Q220 68 220 84 Q220 68 204 68 Q220 68 220 52 Z" fill="white" fillOpacity="0.85" />
            {/* Medium Star to the left of the button */}
            <path d="M185 15 Q185 26 196 26 Q185 26 185 37 Q185 26 174 26 Q185 26 185 15 Z" fill="white" fillOpacity="0.8" />
            {/* Star in bottom right corner */}
            <path d="M248 98 Q248 110 260 110 Q248 110 248 122 Q248 110 236 110 Q248 110 248 98 Z" fill="white" fillOpacity="0.75" />
            {/* Lower-center Star */}
            <path d="M165 110 Q165 118 173 118 Q165 118 165 126 Q165 118 157 118 Q165 118 165 110 Z" fill="white" fillOpacity="0.65" />
            {/* Micro Star near upper left */}
            <path d="M120 15 Q120 20 125 20 Q120 20 120 25 Q120 20 115 20 Q120 20 120 15 Z" fill="white" fillOpacity="0.55" />
          </svg>

          {/* Content */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#2E1065] tracking-tight">
              Active Projects
            </span>
            <div className="w-8 h-8 rounded-full bg-white/85 backdrop-blur-xs border border-white/80 flex items-center justify-center text-[#4C1D95] shadow-xs group-hover:text-[#1D4ED8] group-hover:bg-white group-hover:border-blue-200 transition-all">
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>

          <div className="relative z-10 my-2">
            <div className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1E1B4B]">
              {activeProjects.length}
            </div>
          </div>

          <div className="relative z-10 text-xs text-[#581C87]/80 font-medium">
            Tracked across all departments
          </div>
        </div>

        {/* 2. TASK COMPLETION (Frosted Mint Green Glass + Concentric Progress Target Rings) */}
        <div
          onClick={() => setLocation("/tasks")}
          className="group relative overflow-hidden bg-gradient-to-br from-[#D1FAE5]/95 via-[#A7F3D0]/85 to-[#6EE7B7]/50 backdrop-blur-md border border-white/80 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(16,185,129,0.16)] hover:shadow-[0_12px_28px_rgba(16,185,129,0.25)] hover:border-white hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[140px]"
        >
          {/* Subtle Glass Refraction Highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

          {/* Pattern 2: Concentric Progress Target Rings & Metric Arc */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none select-none transition-transform duration-500 group-hover:scale-105"
            viewBox="0 0 280 150"
            fill="none"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer subtle progress track */}
            <circle cx="218" cy="72" r="44" stroke="white" strokeWidth="2.5" strokeDasharray="6 6" strokeOpacity="0.65" />
            {/* Middle solid progress arc */}
            <circle cx="218" cy="72" r="30" stroke="white" strokeWidth="3.5" strokeDasharray="140 50" strokeLinecap="round" strokeOpacity="0.85" />
            {/* Inner target ring */}
            <circle cx="218" cy="72" r="14" fill="white" fillOpacity="0.35" stroke="white" strokeWidth="2" strokeOpacity="0.9" />
            {/* Center completion dot */}
            <circle cx="218" cy="72" r="4" fill="white" fillOpacity="0.95" />
            {/* Upper-left accent ring */}
            <circle cx="160" cy="28" r="8" stroke="white" strokeWidth="2" strokeDasharray="3 3" strokeOpacity="0.7" />
          </svg>

          {/* Content */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#064E3B] tracking-tight">
              Task Completion
            </span>
            <div className="w-8 h-8 rounded-full bg-white/85 backdrop-blur-xs border border-white/80 flex items-center justify-center text-[#047857] shadow-xs group-hover:text-[#1D4ED8] group-hover:bg-white group-hover:border-blue-200 transition-all">
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>

          <div className="relative z-10 my-2 flex items-baseline gap-2">
            <div className="text-3xl sm:text-4xl font-bold tracking-tight text-[#064E3B]">
              {completionPercent}%
            </div>
          </div>

          <div className="relative z-10 text-xs text-[#065F46]/80 font-medium">
            {completedCount} of {tasks.length} tasks completed
          </div>
        </div>

        {/* 3. UNASSIGNED TASKS (Frosted Warm Amber Glass + Task Queue Dot Matrix) */}
        <div
          onClick={() => setLocation("/tasks")}
          className="group relative overflow-hidden bg-gradient-to-br from-[#FEF3C7]/95 via-[#FDE68A]/85 to-[#FCD34D]/50 backdrop-blur-md border border-white/80 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(245,158,11,0.16)] hover:shadow-[0_12px_28px_rgba(245,158,11,0.25)] hover:border-white hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[140px]"
        >
          {/* Subtle Glass Refraction Highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

          {/* Pattern 3: Task Queue Dot Matrix (Staggered Waiting Queue Grid) */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none select-none transition-transform duration-500 group-hover:scale-105"
            viewBox="0 0 280 150"
            fill="none"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Staggered Dot Matrix */}
            <g fill="white" fillOpacity="0.85">
              <circle cx="185" cy="45" r="4.5" />
              <circle cx="205" cy="45" r="4.5" />
              <circle cx="225" cy="45" r="4.5" />
              <circle cx="245" cy="45" r="4.5" />

              <circle cx="185" cy="65" r="4.5" fillOpacity="0.7" />
              <circle cx="205" cy="65" r="5.5" fillOpacity="0.95" />
              <circle cx="225" cy="65" r="4.5" fillOpacity="0.8" />
              <circle cx="245" cy="65" r="4.5" fillOpacity="0.7" />

              <circle cx="185" cy="85" r="4.5" fillOpacity="0.6" />
              <circle cx="205" cy="85" r="4.5" fillOpacity="0.75" />
              <circle cx="225" cy="85" r="5.5" fillOpacity="0.9" />
              <circle cx="245" cy="85" r="4.5" fillOpacity="0.65" />

              <circle cx="185" cy="105" r="3.5" fillOpacity="0.5" />
              <circle cx="205" cy="105" r="4.5" fillOpacity="0.6" />
              <circle cx="225" cy="105" r="4.5" fillOpacity="0.7" />
              <circle cx="245" cy="105" r="3.5" fillOpacity="0.5" />
            </g>
            {/* Subtle dashed bounding pill */}
            <rect x="175" y="35" width="80" height="80" rx="14" stroke="white" strokeWidth="1.8" strokeDasharray="4 4" strokeOpacity="0.55" />
          </svg>

          {/* Content */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#78350F] tracking-tight">
              Unassigned Tasks
            </span>
            <div className="w-8 h-8 rounded-full bg-white/85 backdrop-blur-xs border border-white/80 flex items-center justify-center text-[#B45309] shadow-xs group-hover:text-[#1D4ED8] group-hover:bg-white group-hover:border-blue-200 transition-all">
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>

          <div className="relative z-10 my-2">
            <div className={`text-3xl sm:text-4xl font-bold tracking-tight ${unassignedCount > 0 ? "text-amber-800" : "text-[#78350F]"}`}>
              {unassignedCount}
            </div>
          </div>

          <div className="relative z-10 text-xs text-[#92400E]/80 font-medium">
            {unassignedCount > 0 ? "Requires team assignment" : "All tasks assigned"}
          </div>
        </div>

        {/* 4. KEY STEPS (Frosted Ice Blue Glass + Connected Milestone Roadmap Nodes) */}
        <div
          onClick={() => setLocation("/key-steps")}
          className="group relative overflow-hidden bg-gradient-to-br from-[#DBEAFE]/95 via-[#BFDBFE]/85 to-[#93C5FD]/50 backdrop-blur-md border border-white/80 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(59,130,246,0.16)] hover:shadow-[0_12px_28px_rgba(59,130,246,0.25)] hover:border-white hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[140px]"
        >
          {/* Subtle Glass Refraction Highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

          {/* Pattern 4: Connected Milestone Roadmap Nodes (Timeline Steps) */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none select-none transition-transform duration-500 group-hover:scale-105"
            viewBox="0 0 280 150"
            fill="none"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Roadmap connecting vectors */}
            <path d="M165 95 L195 55 L235 85 L258 45" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" />
            <path d="M165 95 L195 55 L235 85 L258 45" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" />

            {/* Milestone Nodes */}
            <circle cx="165" cy="95" r="7" fill="white" fillOpacity="0.9" stroke="white" strokeWidth="2" />
            <circle cx="165" cy="95" r="3" fill="#1E3A8A" fillOpacity="0.5" />

            <circle cx="195" cy="55" r="8" fill="white" fillOpacity="0.95" stroke="white" strokeWidth="2" />
            <circle cx="195" cy="55" r="4" fill="#1E3A8A" fillOpacity="0.6" />

            <circle cx="235" cy="85" r="8" fill="white" fillOpacity="0.95" stroke="white" strokeWidth="2" />
            <circle cx="235" cy="85" r="4" fill="#1E3A8A" fillOpacity="0.6" />

            {/* Target Milestone Pin */}
            <circle cx="258" cy="45" r="10" fill="white" fillOpacity="1" />
            <path d="M255 42 L261 45 L255 48 Z" fill="#1E3A8A" />
          </svg>

          {/* Content */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#1E3A8A] tracking-tight">
              Key Steps
            </span>
            <div className="w-8 h-8 rounded-full bg-white/85 backdrop-blur-xs border border-white/80 flex items-center justify-center text-[#2563EB] shadow-xs group-hover:text-[#1D4ED8] group-hover:bg-white group-hover:border-blue-200 transition-all">
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>

          <div className="relative z-10 my-2">
            <div className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1E3A8A]">
              {activeKeySteps.length}
            </div>
          </div>

          <div className="relative z-10 text-xs text-[#1D4ED8]/80 font-medium">
            Active milestone phases across projects
          </div>
        </div>

      </div>

      {/* CURRENT PROJECTS */}
      <Card className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_2px_12px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.02] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50 shadow-2xs shrink-0">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 font-display">Active Projects</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Real-time status, timeline & completion progress</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <Input
                value={projectSearchQuery}
                onChange={(e) => setProjectSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="h-8.5 w-44 sm:w-52 pl-9 pr-8 text-xs rounded-xl border-slate-200/90 bg-slate-50/70 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:w-64 sm:focus:w-80 transition-all duration-300 ease-out shadow-2xs font-medium"
              />
              {projectSearchQuery && (
                <button
                  type="button"
                  onClick={() => setProjectSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full hover:bg-slate-200/60 transition-colors"
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Badge variant="outline" className="bg-blue-50/90 text-blue-700 border-blue-200/80 uppercase font-bold text-[10px] tracking-wider px-2.5 py-1 rounded-lg whitespace-nowrap shadow-2xs shrink-0">
              {projectSearchQuery.trim()
                ? `${filteredActiveProjects.length} of ${activeProjects.length} Live Projects`
                : `${activeProjects.length} Live Projects`}
            </Badge>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800">
          {activeProjects.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium">
              No live projects found
            </div>
          ) : filteredActiveProjects.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium">
              No projects match "{projectSearchQuery}"
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/80 dark:bg-slate-850/80 border-b border-slate-100 dark:border-slate-800 sticky top-0 z-10 backdrop-blur-xs">
                  <tr>
                    <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dates</th>
                    <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Progress</th>
                    <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredActiveProjects.map((project) => (
                    <tr key={project.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group">
                      <td className="px-6 py-4 font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {project.title}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-md ${
                          String(project.status).toLowerCase() === 'not started' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                          String(project.status).toLowerCase() === 'in-progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {project.status || 'Open'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(project.startDate)} — {formatDate(project.endDate)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-20 sm:w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner shrink-0">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                (project.progress || 0) >= 75
                                  ? 'bg-emerald-500'
                                  : (project.progress || 0) >= 40
                                  ? 'bg-blue-500'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, project.progress || 0))}%` }}
                            />
                          </div>
                          <span className="font-bold text-xs tabular-nums text-slate-800 dark:text-slate-200">
                            {project.progress || 0}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-all shadow-2xs"
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
                            className="h-8 w-8 rounded-lg text-slate-400 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={() => {
                              setProjectToDelete(project);
                              setDeleteDialogOpen(true);
                            }}
                            title="Delete Project"
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
      <Card className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_2px_12px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.02] overflow-hidden">
        <CardHeader
          className="p-4 sm:p-5 cursor-pointer flex flex-row items-center justify-between"
          onClick={() => toggleSection("analytics")}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-100 dark:border-purple-900/50 shadow-2xs shrink-0">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 font-display">Analytics</CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400 font-medium">Performance overview across tasks & milestones</CardDescription>
            </div>
          </div>
          <div className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ChevronDown
              className={`h-5 w-5 transition-transform duration-200 ${
                expandedSections.analytics ? "" : "-rotate-90"
              }`}
            />
          </div>
        </CardHeader>

        {expandedSections.analytics && (
          <CardContent className="p-4 sm:p-5 pt-0">
            <div className="grid gap-5 md:grid-cols-2">
              {/* BAR CHART: Tasks per Project */}
              <div className="flex flex-col items-center w-full rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 p-4 shadow-2xs">
                <div className="w-full flex items-center justify-between mb-3 px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Tasks per Project</h3>
                  <span className="text-[11px] font-medium text-slate-400">Pending vs Completed</span>
                </div>

                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="pending" stackId="a" fill="hsl(var(--chart-1))" name="Pending Tasks" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="completed" stackId="a" fill="hsl(var(--chart-2))" name="Completed Tasks" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* PIE CHART: Key Steps Completion */}
              <div className="flex flex-col items-center w-full rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 p-4 shadow-2xs">
                <div className="w-full flex items-center justify-between mb-3 px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Key Steps Completion</h3>
                  <span className="text-[11px] font-medium text-slate-400">Overall Milestone Health</span>
                </div>

                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
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
      <Card className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_2px_12px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.02] overflow-hidden">
        <CardHeader className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/50 shadow-2xs shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 font-display">Insights</CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400 font-medium">A closer look at status, priority & overall health</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0">
          <div className="grid gap-4 md:grid-cols-3">
            {/* DONUT: Projects by Status */}
            <div className="flex flex-col items-center w-full rounded-xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-b from-slate-50/80 to-transparent p-4 shadow-2xs">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Layers className="h-4 w-4 text-blue-500" /> Projects by Status
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
            <div className="flex flex-col items-center w-full rounded-xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-b from-slate-50/80 to-transparent p-4 shadow-2xs">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Flame className="h-4 w-4 text-orange-500" /> Tasks by Priority
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
            <div className="flex flex-col items-center w-full rounded-xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-b from-slate-50/80 to-transparent p-4 shadow-2xs">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Gauge className="h-4 w-4" style={{ color: gaugeColor }} /> Overall Completion
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
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 -mt-2">
                {completedCount} of {tasks.length} tasks completed
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DELETE CONFIRMATION DIALOG */}
      <DeleteConfirmModal
        open={deleteDialogOpen}
        onOpenChange={(o) => {
          setDeleteDialogOpen(o);
          if (!o) setProjectToDelete(null);
        }}
        title="Delete Project?"
        itemName={projectToDelete?.title}
        description="Are you sure you want to delete this project? All associated tasks, timeline records, and data will be permanently removed. This action cannot be undone."
        onConfirm={handleDeleteProject}
        confirmText="Delete Project"
      />

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