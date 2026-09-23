import { useState, useEffect, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Search,
  Filter,
  Users,
  Briefcase,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  Share2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  ChevronsUpDown,
  Minimize2,
  Maximize2,
  RefreshCw,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "framer-motion";

/* ================= TYPES ================= */

interface Task {
  id: string;
  projectId: string;
  taskName: string;
  status: string;
  priority: string;
  startDate: string;
  endDate: string;
  completedAt?: string;
  assignerId: string;
  taskMembers?: string[];
  progress: number;
  keyStepId?: string;
  createdAt?: string;
  updatedAt?: string;
  subtasks?: Subtask[];
}

interface Subtask {
  id?: string;
  title: string;
  isCompleted: boolean;
  assignedTo?: string;
  startDate?: string;
  endDate?: string;
}

interface Project {
  id: string;
  title: string;
  projectCode: string;
  clientName?: string;
}

interface Employee {
  id: string;
  name: string;
  department: string;
}

/* ================= COMPONENT ================= */

export default function Reports() {
  const { toast } = useToast();

  // React Query for fast caching and automatic refetching
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    staleTime: 1000 * 60 * 5,
  });

  const { data: rawTasks = [], isLoading: tasksLoading } = useQuery<any[]>({
    queryKey: ["/api/tasks/bulk?status=all&includeSubtasks=true"],
    staleTime: 1000 * 60 * 2, // 2 minutes - faster refresh for tasks
  });

  const { data: keysteps = [], isLoading: keystepsLoading } = useQuery<any[]>({
    queryKey: ["/api/keysteps/bulk?status=all"],
    staleTime: 1000 * 60 * 5,
  });

  // Normalize tasks
  const tasks = useMemo(() => {
    return (rawTasks || []).map((t: any) => ({
      ...t,
      taskName: t.taskName || t.task_name,
      taskMembers: t.taskMembers || t.assignedMembers || t.assigned_members || [],
      startDate: t.startDate || t.start_date,
      endDate: t.endDate || t.end_date,
      completedAt: t.completedAt || t.completed_at,
      updatedAt: t.updatedAt || t.updated_at,
    }));
  }, [rawTasks]);

  const loading = projectsLoading || employeesLoading || tasksLoading || keystepsLoading;
  const allEmployees = employees;

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedKeystepId, setSelectedKeystepId] = useState<string>("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all"); // days
  const [searchQuery, setSearchQuery] = useState("");
  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);
  const [memberPopoverOpen, setMemberPopoverOpen] = useState(false);
  const [keyStepPopoverOpen, setKeyStepPopoverOpen] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Member Chart Pagination
  const [memberPage, setMemberPage] = useState(0);
  const membersPerPage = 5;

  // UI States for Collapsibility
  const [showFilters, setShowFilters] = useState(true);
  const [showSummary, setShowSummary] = useState(true);
  const [showCharts, setShowCharts] = useState(true);
  const [isCompact, setIsCompact] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refresh all data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/tasks/bulk?status=all&includeSubtasks=true"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/keysteps/bulk?status=all"] }),
      ]);
      toast({ title: "Refreshed", description: "All report data has been updated" });
    } catch (err) {
      toast({ variant: "destructive", title: "Refresh Failed", description: "Could not refresh data" });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Export Modal States
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState<"csv" | "pdf" | null>(null);
  const [exportColumns, setExportColumns] = useState({
    taskName: true,
    project: true,
    assignedTo: true,
    status: true,
    priority: true,
    startDate: true,
    dueDate: true,
    completionDate: true,
  });

  const handleExportClick = (type: "csv" | "pdf") => {
    setExportType(type);
    setExportModalOpen(true);
  };

  const handleColumnToggle = (column: keyof typeof exportColumns) => {
    setExportColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const proceedWithExport = () => {
    if (exportType === "csv") exportCSV();
    else if (exportType === "pdf") exportPDF();
    setExportModalOpen(false);
  };

  /* ================= REAL-TIME UPDATES & EVENTS ================= */

  // Listen for updates from other pages and refresh reports
  useEffect(() => {
    const handleTaskUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/bulk?status=all&includeSubtasks=true"] });
      toast({ title: "Reports updated", description: "Task data refreshed" });
    };

    const handleTaskCreated = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/bulk?status=all&includeSubtasks=true"] });
      toast({ title: "Reports updated", description: "New task added to reports" });
    };

    const handleKeystepDeleted = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keysteps/bulk?status=all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/bulk?status=all&includeSubtasks=true"] });
      toast({ title: "Reports updated", description: "Keystep changes reflected" });
    };

    const handleProjectDeleted = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/bulk?status=all&includeSubtasks=true"] });
      toast({ title: "Reports updated", description: "Project changes reflected" });
    };

    window.addEventListener('task.updated', handleTaskUpdated as EventListener);
    window.addEventListener('task.created', handleTaskCreated as EventListener);
    window.addEventListener('keystep.deleted', handleKeystepDeleted as EventListener);
    window.addEventListener('project.deleted', handleProjectDeleted as EventListener);

    return () => {
      window.removeEventListener('task.updated', handleTaskUpdated as EventListener);
      window.removeEventListener('task.created', handleTaskCreated as EventListener);
      window.removeEventListener('keystep.deleted', handleKeystepDeleted as EventListener);
      window.removeEventListener('project.deleted', handleProjectDeleted as EventListener);
    };
  }, []);

  // Filter members when project changes
  useEffect(() => {
    if (selectedProjectId === "all") {
      setSelectedKeystepId("all");
      return;
    }

    // Reset keystep filter when project changes
    setSelectedKeystepId("all");
  }, [selectedProjectId]);

  const projectKeysteps = useMemo(() => {
    if (selectedProjectId === "all") return keysteps;
    return keysteps.filter(ks => ks.projectId === selectedProjectId);
  }, [keysteps, selectedProjectId]);

  /* ================= HELPERS ================= */

  const getTargetDate = (days: string) => {
    if (days === "all") return null;
    const date = new Date();
    date.setDate(date.getDate() - parseInt(days));
    return date;
  };

  const getEmployeeName = (userId: string) => {
    const emp = allEmployees.find((e) => e.id === userId);
    return emp ? emp.name : userId || "Unassigned";
  };

  const getProjectName = (pid: string) => {
    const proj = projects.find((p) => p.id === pid);
    return proj ? proj.title : "Unknown Project";
  };

  /* ================= FILTERED DATA ================= */
  const isTaskCompleted = (status: string) => ["completed", "done", "closed", "finish", "finished"].includes((status || "").toLowerCase().trim());

  // Tasks matching all filters EXCEPT status - used for KPIs
  const kpiBaseTasks = useMemo(() => {
    const targetDate = getTargetDate(dateRange);

    return tasks.filter((t: Task) => {
      const matchesProject = selectedProjectId === "all" || t.projectId === selectedProjectId;
      const matchesKeystep = selectedKeystepId === "all" || t.keyStepId === selectedKeystepId;
      const matchesEmployee = selectedEmployeeId === "all" || (t.taskMembers || []).includes(selectedEmployeeId);
      const matchesSearch = t.taskName.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesDate = true;
      if (targetDate) {
        const startDate = t.startDate ? new Date(t.startDate) : null;
        const compDate = (t.completedAt || t.endDate) ? new Date(t.completedAt || t.endDate!) : null;
        const startedInRange = startDate && startDate >= targetDate;
        const completedInRange = compDate && compDate >= targetDate;
        matchesDate = !!(startedInRange || completedInRange);
      }

      return matchesProject && matchesKeystep && matchesEmployee && matchesSearch && matchesDate;
    });
  }, [tasks, selectedProjectId, selectedKeystepId, selectedEmployeeId, dateRange, searchQuery]);

  const filteredTasks = useMemo(() => {
    return kpiBaseTasks.filter((t: Task) => {
      if (selectedStatus === "all") return true;
      if (selectedStatus === "overdue") {
        return !isTaskCompleted(t.status) && t.endDate && new Date(t.endDate) < new Date();
      }
      if (selectedStatus === "pending") {
        return !isTaskCompleted(t.status);
      }
      return (t.status || "").toLowerCase() === selectedStatus.toLowerCase();
    });
  }, [kpiBaseTasks, selectedStatus]);

  /* ================= ANALYTICS CALCULATIONS ================= */

  const kpis = useMemo(() => {
    const total = kpiBaseTasks.length;
    const completed = kpiBaseTasks.filter((t: Task) => isTaskCompleted(t.status)).length;
    const pending = total - completed;
    const overdue = kpiBaseTasks.filter((t: Task) => {
      if (isTaskCompleted(t.status)) return false;
      if (!t.endDate) return false;
      return new Date(t.endDate) < new Date();
    }).length;

    const productivity = total === 0 ? 0 : Math.round((completed / total) * 100);

    const completedTasksList = kpiBaseTasks.filter((t: Task) => isTaskCompleted(t.status) && (t.completedAt || t.updatedAt));

    // Average Completion Time
    let avgCompletionDays = 0;
    let onTimePercentage = 0;

    if (completedTasksList.length > 0) {
      let totalDays = 0;
      let onTimeCount = 0;

      completedTasksList.forEach(t => {
        const start = t.startDate ? new Date(t.startDate) : null;
        const end = t.endDate ? new Date(t.endDate) : null;
        const comp = new Date(t.completedAt || t.updatedAt!);

        if (start) {
          const days = Math.round((comp.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          totalDays += Math.max(0, days);
        }

        if (end && comp <= end) {
          onTimeCount++;
        }
      });

      avgCompletionDays = Math.round(totalDays / completedTasksList.length);
      onTimePercentage = Math.round((onTimeCount / completedTasksList.length) * 100);
    }

    let latestCompletion = "-";
    if (completedTasksList.length > 0) {
      const dates = completedTasksList.map(t => new Date(t.completedAt || t.updatedAt!).getTime());
      const maxDate = new Date(Math.max(...dates));
      latestCompletion = maxDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    return { total, completed, pending, overdue, productivity, latestCompletion, avgCompletionDays, onTimePercentage };
  }, [kpiBaseTasks]);

  // KeyStep-based analytics
  const keystepAnalytics = useMemo(() => {
    const analysis: Record<string, { name: string; tasks: number; completed: number; progress: number }> = {};

    kpiBaseTasks.forEach((t: Task) => {
      const ksId = t.keyStepId || "__unassigned__";
      if (!analysis[ksId]) {
        const ks = keysteps.find(k => k.id === ksId);
        analysis[ksId] = {
          name: ks ? ks.title : "Unassigned",
          tasks: 0,
          completed: 0,
          progress: 0
        };
      }
      analysis[ksId].tasks++;
      if (isTaskCompleted(t.status)) {
        analysis[ksId].completed++;
      }
    });

    // Calculate progress percentage
    Object.values(analysis).forEach(ks => {
      ks.progress = ks.tasks === 0 ? 0 : Math.round((ks.completed / ks.tasks) * 100);
    });

    return Object.entries(analysis)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.tasks - a.tasks);
  }, [kpiBaseTasks, keysteps]);

  // Tasks matching project/time/search but NOT employee - used for Charts
  const chartBaseTasks = useMemo(() => {
    const targetDate = getTargetDate(dateRange);

    return tasks.filter((t: Task) => {
      const matchesProject = selectedProjectId === "all" || t.projectId === selectedProjectId;
      const matchesKeystep = selectedKeystepId === "all" || t.keyStepId === selectedKeystepId;
      const matchesSearch = t.taskName.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesDate = true;
      if (targetDate) {
        const startDate = t.startDate ? new Date(t.startDate) : null;
        const compDate = (t.completedAt || t.endDate) ? new Date(t.completedAt || t.endDate!) : null;
        const startedInRange = startDate && startDate >= targetDate;
        const completedInRange = compDate && compDate >= targetDate;
        matchesDate = !!(startedInRange || completedInRange);
      }

      return matchesProject && matchesKeystep && matchesSearch && matchesDate;
    });
  }, [tasks, selectedProjectId, selectedKeystepId, dateRange, searchQuery]);

  const pieData = useMemo(() => {
    const stats: Record<string, number> = {};
    chartBaseTasks.forEach((t: Task) => {
      let s = (t.status || "Unknown").toLowerCase().trim().replace("-", " ");
      // Capitalize for display
      const displayStatus = s.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      stats[displayStatus] = (stats[displayStatus] || 0) + 1;
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [chartBaseTasks]);

  const priorityData = useMemo(() => {
    const stats: Record<string, number> = {};
    chartBaseTasks.forEach((t: Task) => {
      const p = (t.priority || "Normal").toLowerCase();
      const displayPriority = p.charAt(0).toUpperCase() + p.slice(1);
      stats[displayPriority] = (stats[displayPriority] || 0) + 1;
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [chartBaseTasks]);

  const taskAgeData = useMemo(() => {
    const ageCategories = {
      "0-3 Days": 0,
      "4-7 Days": 0,
      "8-14 Days": 0,
      "15+ Days": 0
    };

    const now = new Date().getTime();

    chartBaseTasks.forEach((t: Task) => {
      if (!isTaskCompleted(t.status)) {
        const start = new Date(t.startDate || t.createdAt || new Date()).getTime();
        const daysOld = Math.floor((now - start) / (1000 * 60 * 60 * 24));

        if (daysOld <= 3) ageCategories["0-3 Days"]++;
        else if (daysOld <= 7) ageCategories["4-7 Days"]++;
        else if (daysOld <= 14) ageCategories["8-14 Days"]++;
        else ageCategories["15+ Days"]++;
      }
    });

    return Object.entries(ageCategories).map(([name, count]) => ({ name, count }));
  }, [chartBaseTasks]);



  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];
  const PRIORITY_COLORS: Record<string, string> = {
    "high": "#ef4444",
    "medium": "#f59e0b",
    "low": "#3b82f6",
    "urgent": "#b91c1c"
  };

  const lineData = useMemo(() => {
    // Last 14 days of completion
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      days[key] = 0;
    }

    chartBaseTasks.forEach((t: Task) => {
      if (isTaskCompleted(t.status)) {
        const d = new Date(t.completedAt || t.updatedAt! || t.endDate!);
        const key = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        if (days[key] !== undefined) {
          days[key]++;
        }
      }
    });

    return Object.entries(days).map(([name, completed]) => ({ name, completed }));
  }, [chartBaseTasks]);

  /* ================= EXPORT ACTIONS ================= */

  const exportCSV = () => {
    try {
      const data = filteredTasks.map((t: Task) => {
        const row: any = {};
        if (exportColumns.taskName) row["Task Name"] = t.taskName;
        if (exportColumns.project) row["Project"] = getProjectName(t.projectId);
        if (exportColumns.assignedTo) row["Assigned By"] = (t.taskMembers || []).map(getEmployeeName).join(", ");
        if (exportColumns.status) row["Status"] = t.status;
        if (exportColumns.priority) row["Priority"] = t.priority;
        if (exportColumns.startDate) row["Start Date"] = t.startDate ? formatDate(t.startDate) : "-";
        if (exportColumns.dueDate) row["Due Date"] = t.endDate ? formatDate(t.endDate) : "-";
        if (exportColumns.completionDate) row["Completion Date"] = t.completedAt ? formatDate(t.completedAt) : "-";
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tasks Report");
      XLSX.writeFile(wb, `project_report_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast({ title: "Export Successful", description: `Excel file with ${data.length} tasks exported` });
    } catch (err) {
      console.error("CSV export failed:", err);
      toast({ variant: "destructive", title: "Export Failed", description: "Could not export to CSV" });
    }
  };

  const exportPDF = () => {
    try {
      const doc = new jsPDF("landscape");
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text("PROJECT PROGRESS REPORT", 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-400
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
      doc.text(`${filteredTasks.length} Tasks matching current filters`, 14, 33);

      let currentY = 45;

      // Group tasks by project
      const projectMap = new Map<string, Task[]>();
      filteredTasks.forEach((t: Task) => {
        if (!projectMap.has(t.projectId)) projectMap.set(t.projectId, []);
        projectMap.get(t.projectId)!.push(t);
      });

      projectMap.forEach((pTasks: Task[], projectId: string) => {
        const project = projects.find(p => p.id === projectId);

        // Page break if near bottom
        if (currentY > 170) {
          doc.addPage();
          currentY = 20;
        }

        // Project Header
        doc.setFontSize(14);
        doc.setTextColor(59, 130, 246); // primary
        doc.text(`Project: ${project?.title || "Unknown"} (${project?.projectCode || "N/A"})`, 14, currentY);
        currentY += 8;

        // Group by Key Step
        const ksMap = new Map<string, Task[]>();
        pTasks.forEach((t: Task) => {
          const ksId = t.keyStepId || "no-ks";
          if (!ksMap.has(ksId)) ksMap.set(ksId, []);
          ksMap.get(ksId)!.push(t);
        });

        ksMap.forEach((tasksInKs: Task[], ksId: string) => {
          const keyStep = keysteps.find(ks => ks.id === ksId);

          if (currentY > 180) {
            doc.addPage();
            currentY = 20;
          }

          // Key Step Header
          doc.setFontSize(11);
          doc.setTextColor(71, 85, 105); // slate-600
          doc.text(`> Key Step: ${keyStep?.title || "Direct Tasks"}`, 20, currentY);
          currentY += 4;

          const tableHead = [];
          if (exportColumns.taskName) tableHead.push("Task / Subtask");
          if (exportColumns.project) tableHead.push("Project");
          if (exportColumns.assignedTo) tableHead.push("Assigned By");
          if (exportColumns.status) tableHead.push("Status");
          if (exportColumns.priority) tableHead.push("Priority");
          if (exportColumns.startDate) tableHead.push("Start Date");
          if (exportColumns.dueDate) tableHead.push("Due Date");
          if (exportColumns.completionDate) tableHead.push("Comp. Date");

          const tableData: any[][] = [];
          tasksInKs.forEach((t: Task) => {
            const compDate = t.completedAt ? formatDate(t.completedAt) : "-";

            const row = [];
            if (exportColumns.taskName) row.push(`• ${t.taskName}`);
            if (exportColumns.project) row.push(getProjectName(t.projectId));
            if (exportColumns.assignedTo) row.push((t.taskMembers || []).map(getEmployeeName).join(", "));
            if (exportColumns.status) row.push(t.status.toUpperCase());
            if (exportColumns.priority) row.push(t.priority.toUpperCase());
            if (exportColumns.startDate) row.push(t.startDate ? formatDate(t.startDate) : "-");
            if (exportColumns.dueDate) row.push(t.endDate ? formatDate(t.endDate) : "-");
            if (exportColumns.completionDate) row.push(compDate);

            tableData.push(row);

            // Add Subtasks if any
            if (t.subtasks && Array.isArray(t.subtasks) && t.subtasks.length > 0) {
              t.subtasks.forEach((s: any) => {
                const sRow = [];
                if (exportColumns.taskName) sRow.push(`   - ${s.title}`);
                if (exportColumns.project) sRow.push("");
                if (exportColumns.assignedTo) sRow.push(s.assignedTo ? getEmployeeName(s.assignedTo) : "-");
                if (exportColumns.status) sRow.push(s.isCompleted ? "DONE" : "PENDING");
                if (exportColumns.priority) sRow.push("");
                if (exportColumns.startDate) sRow.push("");
                if (exportColumns.dueDate) sRow.push("");
                if (exportColumns.completionDate) sRow.push("");
                tableData.push(sRow);
              });
            }
          });

          autoTable(doc, {
            head: [tableHead],
            body: tableData,
            startY: currentY + 2,
            margin: { left: 24 },
            theme: 'striped',
            headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 2 },
            didDrawPage: (data: any) => {
              const x = data.cursor?.x || 0;
              const y = data.cursor?.y || 0;
              currentY = y + 10;
            }
          });

          currentY = (doc as any).lastAutoTable.finalY + 10;
        });

        currentY += 5;
      });

      doc.save(`Project_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      toast({ title: "Export Successful", description: `PDF report with ${filteredTasks.length} tasks exported` });
    } catch (err) {
      console.error("PDF export failed:", err);
      toast({ variant: "destructive", title: "Export Failed", description: "Could not export to PDF" });
    }
  };

  /* ================= PAGINATION ================= */

  const totalPagesCount = Math.ceil(filteredTasks.length / itemsPerPage);
  const paginatedTasksList = filteredTasks.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-8 bg-slate-50/50 min-h-screen">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">
            Reports <span className="text-primary font-normal">& Analytics</span>
          </h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            Professional project insights and performance metrics
            <Badge variant="outline" className="ml-2 bg-white">{filteredTasks.length} Tasks Found</Badge>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="bg-white"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button variant="outline" size="sm" className="bg-white" onClick={() => handleExportClick("csv")}>
            <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
            Excel
          </Button>
          <Button variant="outline" size="sm" className="bg-white" onClick={() => handleExportClick("pdf")}>
            <FileText className="mr-2 h-4 w-4 text-red-600" />
            PDF
          </Button>
          <Button size="sm" className="shadow-lg shadow-primary/25">
            <Share2 className="mr-2 h-4 w-4" />
            Share Report
          </Button>
        </div>
      </div>

      {/* FILTERS */}
      <Card className="border-none shadow-sm bg-white/80 backdrop-blur-md overflow-hidden">
        <CardHeader
          className="p-4 cursor-pointer flex flex-row items-center justify-between border-b border-slate-50"
          onClick={() => setShowFilters(!showFilters)}
        >
          <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                      <Briefcase className="h-3 w-3" /> Project
                    </label>
                    <Popover open={projectPopoverOpen} onOpenChange={setProjectPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={projectPopoverOpen}
                          className="w-full justify-between bg-slate-50 border-slate-200 font-normal truncate"
                        >
                          {selectedProjectId === "all"
                            ? "All Projects"
                            : projects.find((project) => project.id === selectedProjectId)?.title}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search project..." />
                          <CommandList className="max-h-[300px] overflow-y-auto">
                            <CommandEmpty>No project found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="all"
                                onSelect={() => {
                                  setSelectedProjectId("all");
                                  setProjectPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedProjectId === "all" ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                All Projects
                              </CommandItem>
                              {projects.map((project) => (
                                <CommandItem
                                  key={project.id}
                                  value={project.title}
                                  onSelect={() => {
                                    setSelectedProjectId(project.id);
                                    setProjectPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedProjectId === project.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {project.title}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                      <Briefcase className="h-3 w-3" /> Key Step
                    </label>
                    <Popover open={keyStepPopoverOpen} onOpenChange={setKeyStepPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={keyStepPopoverOpen}
                          disabled={selectedProjectId === "all"}
                          className="w-full justify-between bg-slate-50 border-slate-200 font-normal truncate"
                        >
                          {selectedKeystepId === "all"
                            ? "All Key Steps"
                            : projectKeysteps.find((ks) => ks.id === selectedKeystepId)?.title}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search key step..." />
                          <CommandList className="max-h-[300px] overflow-y-auto">
                            <CommandEmpty>No key step found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="all"
                                onSelect={() => {
                                  setSelectedKeystepId("all");
                                  setKeyStepPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedKeystepId === "all" ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                All Key Steps
                              </CommandItem>
                              {projectKeysteps.map((ks) => (
                                <CommandItem
                                  key={ks.id}
                                  value={ks.title}
                                  onSelect={() => {
                                    setSelectedKeystepId(ks.id);
                                    setKeyStepPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedKeystepId === ks.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {ks.title}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                      <Users className="h-3 w-3" /> Team Member
                    </label>
                    <Popover open={memberPopoverOpen} onOpenChange={setMemberPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={memberPopoverOpen}
                          className="w-full justify-between bg-slate-50 border-slate-200 font-normal truncate"
                        >
                          {selectedEmployeeId === "all"
                            ? "All Members"
                            : employees.find((emp) => emp.id === selectedEmployeeId)?.name}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search member..." />
                          <CommandList className="max-h-[300px] overflow-y-auto">
                            <CommandEmpty>No member found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="all"
                                onSelect={() => {
                                  setSelectedEmployeeId("all");
                                  setMemberPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedEmployeeId === "all" ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                All Members
                              </CommandItem>
                              {employees.map((emp) => (
                                <CommandItem
                                  key={emp.id}
                                  value={emp.name}
                                  onSelect={() => {
                                    setSelectedEmployeeId(emp.id);
                                    setMemberPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedEmployeeId === emp.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {emp.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> Timeline
                    </label>
                    <Select value={dateRange} onValueChange={setDateRange}>
                      <SelectTrigger className="bg-slate-50 border-slate-200">
                        <SelectValue placeholder="Select Range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Today</SelectItem>
                        <SelectItem value="7">1 Week</SelectItem>
                        <SelectItem value="15">Fortnight (15 Days)</SelectItem>
                        <SelectItem value="30">1 Month</SelectItem>
                        <SelectItem value="90">Quarterly</SelectItem>
                        <SelectItem value="180">Half Yearly</SelectItem>
                        <SelectItem value="365">Annual</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                      <Filter className="h-3 w-3" /> Status
                    </label>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger className="bg-slate-50 border-slate-200">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="not started">Not Started</SelectItem>
                        <SelectItem value="planned">Planned</SelectItem>
                        <SelectItem value="in progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                        <SelectItem value="on hold">On Hold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                      <Search className="h-3 w-3" /> Search
                    </label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Task name..."
                        className="pl-9 bg-slate-50 border-slate-200"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* SUMMARY CARD */}
      <Card className="border-none shadow-sm bg-white/80 backdrop-blur-md overflow-hidden">
        <CardHeader
          className="p-4 cursor-pointer flex flex-row items-center justify-between border-b border-slate-50"
          onClick={() => setShowSummary(!showSummary)}
        >
          <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Task Metrics Summary
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {showSummary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <AnimatePresence>
          {showSummary && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CardContent className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                  {[
                    { id: "total", label: "Total Tasks", value: kpis.total, icon: Briefcase, color: "text-blue-600", bg: "bg-blue-50" },
                    { id: "completed", label: "Completed", value: kpis.completed, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", clickable: true },
                    { id: "pending", label: "Pending", value: kpis.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", clickable: true },
                    { id: "overdue", label: "Overdue", value: kpis.overdue, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", clickable: true },
                    { id: "efficiency", label: "Efficiency", value: `${kpis.onTimePercentage}%`, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
                    { id: "avg_time", label: "Avg. Days", value: kpis.avgCompletionDays, icon: Clock, color: "text-cyan-600", bg: "bg-cyan-50" },
                    { id: "latest", label: "Latest", value: kpis.latestCompletion, icon: CheckCircle2, color: "text-slate-600", bg: "bg-slate-50" }
                  ].map((kpi, i) => (
                    <div
                      key={kpi.label}
                      className={cn(
                        "p-4 rounded-xl border border-slate-100 transition-all",
                        kpi.clickable ? "hover:bg-slate-50 cursor-pointer hover:border-slate-200" : "bg-white"
                      )}
                      onClick={() => {
                        if (kpi.id === "completed") setSelectedStatus("completed");
                        if (kpi.id === "pending") setSelectedStatus("pending");
                        if (kpi.id === "overdue") setSelectedStatus("overdue");
                      }}
                    >
                      <div className={`p-2 w-fit rounded-lg ${kpi.bg} mb-3`}>
                        <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
                        <h3 className="text-xl font-black text-slate-900">{kpi.value}</h3>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* CHARTS */}
      <Card className="border-none shadow-sm bg-white/80 backdrop-blur-md overflow-hidden">
        <CardHeader
          className="p-4 cursor-pointer flex flex-row items-center justify-between border-b border-slate-50"
          onClick={() => setShowCharts(!showCharts)}
        >
          <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Analytics Charts
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {showCharts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <AnimatePresence>
          {showCharts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Status Distribution */}
                  <Card className="border shadow-none h-[300px]">
                    <CardHeader className="p-4 pb-0">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        Status Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[230px] p-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={70}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px' }} />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Priority Distribution */}
                  <Card className="border shadow-none h-[300px]">
                    <CardHeader className="p-4 pb-0">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        Priority Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[230px] p-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={priorityData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={70}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {priorityData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[entry.name.toLowerCase()] || COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px' }} />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Task Aging (Pending Tasks) */}
                  <Card className="border shadow-none h-[300px]">
                    <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        Pending Task Age Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[230px] p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={taskAgeData} layout="vertical" margin={{ left: 20 }}>
                          <XAxis type="number" hide />
                          <YAxis
                            dataKey="name"
                            type="category"
                            axisLine={false}
                            tickLine={false}
                            width={80}
                            style={{ fontSize: '10px' }}
                          />
                          <Tooltip cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }} contentStyle={{ borderRadius: '12px', fontSize: '10px' }} />
                          <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={12}>
                            <LabelList dataKey="count" position="right" style={{ fontSize: '10px', fill: '#64748b', fontWeight: 'bold' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Completion Trend */}
                  <Card className="border shadow-none h-[300px]">
                    <CardHeader className="p-4 pb-0">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        Completion Trend (14d)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[230px] p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={lineData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: '10px' }} />
                          <YAxis axisLine={false} tickLine={false} style={{ fontSize: '10px' }} />
                          <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '10px' }} />
                          <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={3} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* KEYSTEP-BASED ANALYTICS */}
      {selectedProjectId !== "all" && keystepAnalytics.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>KeyStep Progress</CardTitle>
            <CardDescription>Workflow stage completion metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {keystepAnalytics.map((ks) => (
                <div key={ks.id} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{ks.name}</span>
                    <Badge variant={ks.progress === 100 ? "default" : "secondary"}>
                      {ks.progress}% ({ks.completed}/{ks.tasks} tasks)
                    </Badge>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${ks.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* DETAILED TABLE */}
      <Card className="border-none shadow-sm overflow-hidden">
        <div className="bg-white px-6 py-4 flex items-center justify-between border-b border-slate-100">
          <CardTitle className="text-xl font-black">Detailed Report</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="mr-2 h-8 text-xs font-medium text-slate-600"
              onClick={() => setIsCompact(!isCompact)}
            >
              {isCompact ? <Maximize2 className="h-3 w-3 mr-2" /> : <Minimize2 className="h-3 w-3 mr-2" />}
              {isCompact ? "Standard" : "Compact"}
            </Button>
            <span className="text-xs text-slate-400 mr-2">Page {currentPage} of {totalPagesCount || 1}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(p => Math.min(totalPagesCount, p + 1))}
              disabled={currentPage === totalPagesCount || totalPagesCount === 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} text-xs font-bold text-slate-500 uppercase tracking-wider`}>Task Name</th>
                <th className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} text-xs font-bold text-slate-500 uppercase tracking-wider`}>Assigned By</th>
                <th className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} text-xs font-bold text-slate-500 uppercase tracking-wider`}>Status</th>
                <th className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} text-xs font-bold text-slate-500 uppercase tracking-wider`}>Priority</th>
                <th className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} text-xs font-bold text-slate-500 uppercase tracking-wider`}>Start Date</th>
                <th className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} text-xs font-bold text-slate-500 uppercase tracking-wider`}>Due Date</th>
                <th className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} text-xs font-bold text-slate-500 uppercase tracking-wider`}>Completion Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {paginatedTasksList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No results found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedTasksList.map((t, idx) => {
                  const compDate = t.completedAt ? formatDate(t.completedAt) : "-";

                  return (
                    <motion.tr
                      key={t.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-slate-50/50 transition-colors cursor-default"
                    >
                      <td className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} font-semibold text-slate-900`}>
                        <div className="flex flex-col">
                          <span
                            className={isCompact ? 'truncate max-w-[200px] md:max-w-[300px] inline-block' : ''}
                            title={isCompact ? t.taskName : undefined}
                          >
                            {t.taskName}
                          </span>
                          <span
                            className={`text-[10px] text-slate-400 font-normal ${isCompact ? 'truncate max-w-[200px] md:max-w-[300px] inline-block' : ''}`}
                            title={isCompact ? getProjectName(t.projectId) : undefined}
                          >
                            {getProjectName(t.projectId)}
                          </span>
                        </div>
                      </td>
                      <td className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'}`}>
                        <div className="flex -space-x-2">
                          {t.taskMembers && t.taskMembers.length > 0 ? (
                            t.taskMembers.slice(0, 3).map((mId: string) => {
                              const emp = employees.find(e => e.id === mId);
                              return (
                                <div key={mId} className="h-7 w-7 rounded-full bg-primary/10 border-2 border-white flex items-center justify-center text-[10px] font-bold text-primary" title={emp?.name}>
                                  {emp?.name?.split(' ').map(n => n[0]).join('') || '?'}
                                </div>
                              )
                            })
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                          {t.taskMembers && t.taskMembers.length > 3 && (
                            <div className="h-7 w-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500">
                              +{t.taskMembers.length - 3}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'}`}>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-black uppercase px-2 py-0.5 ${isTaskCompleted(t.status) ? 'bg-green-50 text-green-700 border-green-200' :
                            t.status.toLowerCase() === 'in progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                        >
                          {t.status}
                        </Badge>
                      </td>
                      <td className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'}`}>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-black uppercase px-2 py-0.5 ${t.priority.toLowerCase() === 'high' ? 'bg-red-50 text-red-700 border-red-200' :
                            t.priority.toLowerCase() === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-green-50 text-green-700 border-green-200'
                            }`}
                        >
                          {t.priority}
                        </Badge>
                      </td>
                      <td className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} text-xs text-slate-500 font-medium`}>
                        {t.startDate ? formatDate(t.startDate) : "-"}
                      </td>
                      <td className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} text-xs text-slate-500 font-medium`}>
                        {t.endDate ? formatDate(t.endDate) : "-"}
                      </td>
                      <td className={`${isCompact ? 'px-4 py-2' : 'px-6 py-4'} text-xs text-slate-900 font-bold`}>
                        {compDate}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>


      </Card>

      <style>{`
        .font-black { font-weight: 900; }
        .tracking-tight { letter-spacing: -0.025em; }
      `}</style>

      {/* Export Dialog */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Configure Download</DialogTitle>
            <DialogDescription>
              Select the columns you want to include in your {exportType?.toUpperCase()} report.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {Object.entries({
              taskName: "Task Name",
              project: "Project",
              assignedTo: "Assigned By",
              status: "Status",
              priority: "Priority",
              startDate: "Start Date",
              dueDate: "Due Date",
              completionDate: "Completion Date",
            }).map(([key, label]) => (
              <div key={key} className="flex items-center space-x-2">
                <Checkbox
                  id={`export-${key}`}
                  checked={exportColumns[key as keyof typeof exportColumns]}
                  onCheckedChange={() => handleColumnToggle(key as keyof typeof exportColumns)}
                />
                <label
                  htmlFor={`export-${key}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {label}
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportModalOpen(false)}>Cancel</Button>
            <Button onClick={proceedWithExport}>Download {exportType?.toUpperCase()}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}