import { useState, useEffect } from "react";
import { useAuth } from "@/components/Layout";
import { apiFetch } from "@/lib/apiClient";
import {
    CheckCircle2,
    Calendar,
    User,
    Search,
    Filter,
    ArrowRight,
    TrendingUp,
    Folder,
    Layers,
    CheckSquare,
    Maximize2,
    ListChecks,
    RotateCcw,
    AlertCircle,
    Ticket,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger
} from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/* ---------------- TYPES ---------------- */

interface CompletedItem {
    id: string;
    name: string;
    relatedItem?: string;
    subRelatedItem?: string; // for subtasks: parent task name
    assignedUser?: string;
    assignedUserAvatar?: string;
    completionDate: string;
    department?: string;
    type: "Project" | "Key Step" | "Task" | "Subtask" | "Ticket";
    raw: any;
}

/* ---------------- COMPONENT ---------------- */

export default function Completed() {
    const { user } = useAuth();

    const [completedProjects, setCompletedProjects] = useState<CompletedItem[]>([]);
    const [completedKeySteps, setCompletedKeySteps] = useState<CompletedItem[]>([]);
    const [completedTasks, setCompletedTasks] = useState<CompletedItem[]>([]);
    const [completedSubtasks, setCompletedSubtasks] = useState<CompletedItem[]>([]);
    const [closedTickets, setClosedTickets] = useState<CompletedItem[]>([]);

    const [cancelledProjects, setCancelledProjects] = useState<CompletedItem[]>([]);
    const [cancelledKeySteps, setCancelledKeySteps] = useState<CompletedItem[]>([]);
    const [cancelledTasks, setCancelledTasks] = useState<CompletedItem[]>([]);
    const [cancelledSubtasks, setCancelledSubtasks] = useState<CompletedItem[]>([]);

    const [employees, setEmployees] = useState<any[]>([]);
    const [projects, setProjects] = useState<any[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [projectSearch, setProjectSearch] = useState("");
    const [keystepSearch, setKeystepSearch] = useState("");
    const [taskSearch, setTaskSearch] = useState("");
    const [subtaskSearch, setSubtaskSearch] = useState("");
    const [ticketSearch, setTicketSearch] = useState("");

    const [cancelledProjectSearch, setCancelledProjectSearch] = useState("");
    const [cancelledKeystepSearch, setCancelledKeystepSearch] = useState("");
    const [cancelledTaskSearch, setCancelledTaskSearch] = useState("");
    const [cancelledSubtaskSearch, setCancelledSubtaskSearch] = useState("");

    const [selectedItem, setSelectedItem] = useState<CompletedItem | null>(null);
    const [detailedItemInfo, setDetailedItemInfo] = useState<any>(null);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    async function fetchData() {
        if (!isRefreshing) setIsRefreshing(true);
        try {
            const [empRes, projRes, compProjRes, compTaskRes, compKSRes, cancProjRes, cancTaskRes, cancKSRes, ticketsRes] = await Promise.all([
                apiFetch("/api/employees"),
                apiFetch("/api/projects?status=all"),
                apiFetch("/api/projects?status=Completed"),
                apiFetch("/api/tasks/bulk?status=Completed"),
                apiFetch("/api/keysteps/bulk?status=Completed"),
                apiFetch("/api/projects?status=Cancelled"),
                apiFetch("/api/tasks/bulk?status=Cancelled"),
                apiFetch("/api/keysteps/bulk?status=Cancelled"),
                apiFetch("/api/tickets?status=Closed"),
            ]);

            const emps: any[] = await empRes.json();
            const allProjs: any[] = await projRes.json();
            const cProjs: any[] = await compProjRes.json();
            const cTasks: any[] = await compTaskRes.json();
            const cKS: any[] = await compKSRes.json();
            const xProjs: any[] = await cancProjRes.json();
            const xTasks: any[] = await cancTaskRes.json();
            const xKS: any[] = await cancKSRes.json();
            const cTkts: any[] = ticketsRes.ok ? await ticketsRes.json() : [];


            setEmployees(emps);
            setProjects(allProjs);

            const empMap = new Map<string, any>(emps.map((e: any) => [e.id, e]));
            const projMap = new Map<string, any>(allProjs.map((p: any) => [p.id, p]));

            // Format Projects
            setCompletedProjects(cProjs.map((p: any) => ({
                id: p.id,
                name: p.title,
                relatedItem: p.clientName || "N/A",
                assignedUser: empMap.get(p.createdByEmployeeId)?.name || "Admin",
                completionDate: p.completedAt,
                department: p.department || "General",
                type: "Project",
                raw: p
            })));

            // Format Tasks
            setCompletedTasks(cTasks.map((t: any) => ({
                id: t.id,
                name: t.taskName,
                relatedItem: projMap.get(t.projectId)?.title || "Unknown Project",
                assignedUser: t.assignedMembers?.length > 0
                    ? empMap.get(t.assignedMembers[0])?.name + (t.assignedMembers.length > 1 ? ` +${t.assignedMembers.length - 1}` : "")
                    : "Unassigned",
                completionDate: t.completedAt,
                department: t.department || "General",
                type: "Task",
                raw: t
            })));

            // Format Key Steps
            setCompletedKeySteps(cKS.map((ks: any) => ({
                id: ks.id,
                name: ks.title,
                relatedItem: projMap.get(ks.projectId)?.title || "Unknown Project",
                assignedUser: "Project Team",
                completionDate: ks.completedAt,
                department: "Engineering",
                type: "Key Step",
                raw: ks
            })));

            // Format Closed Tickets
            if (Array.isArray(cTkts)) {
                setClosedTickets(cTkts.map((t: any) => ({
                    id: t.id,
                    name: `[${t.ticketCode}] ${t.title}`,
                    relatedItem: t.companyName || (t.projectId ? projMap.get(t.projectId)?.title : null) || "General Ticket",
                    assignedUser: t.assignedToName || t.createdByName || "Unassigned",
                    completionDate: t.updatedAt || t.createdAt,
                    department: t.department || "General",
                    type: "Ticket",
                    raw: t
                })));
            }

            // Format Cancelled Projects (no completedAt for cancelled items, fall back to updatedAt/createdAt)
            setCancelledProjects(xProjs.map((p: any) => ({
                id: p.id,
                name: p.title,
                relatedItem: p.clientName || "N/A",
                assignedUser: empMap.get(p.createdByEmployeeId)?.name || "Admin",
                completionDate: p.updatedAt || p.createdAt,
                department: p.department || "General",
                type: "Project",
                raw: p
            })));

            // Format Cancelled Tasks
            setCancelledTasks(xTasks.map((t: any) => ({
                id: t.id,
                name: t.taskName,
                relatedItem: projMap.get(t.projectId)?.title || "Unknown Project",
                assignedUser: t.assignedMembers?.length > 0
                    ? empMap.get(t.assignedMembers[0])?.name + (t.assignedMembers.length > 1 ? ` +${t.assignedMembers.length - 1}` : "")
                    : "Unassigned",
                completionDate: t.updatedAt || t.createdAt,
                department: t.department || "General",
                type: "Task",
                raw: t
            })));

            // Format Cancelled Key Steps
            setCancelledKeySteps(xKS.map((ks: any) => ({
                id: ks.id,
                name: ks.title,
                relatedItem: projMap.get(ks.projectId)?.title || "Unknown Project",
                assignedUser: "Project Team",
                completionDate: ks.createdAt,
                department: "Engineering",
                type: "Key Step",
                raw: ks
            })));

        } catch (error) {
            console.error("Failed to fetch completed items:", error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }

    // Fetch completed subtasks separately (different response shape)
    async function fetchSubtasks() {
        try {
            const res = await apiFetch("/api/subtasks/completed/bulk");
            if (!res.ok) return;
            const data: any[] = await res.json();
            if (!Array.isArray(data)) return;
            setCompletedSubtasks(data.map((s: any) => ({
                id: s.id,
                name: s.title,
                relatedItem: s.projectTitle || "Unknown Project",
                subRelatedItem: s.taskName || "Unknown Task",
                assignedUser: s.assignedTo || "Unassigned",
                completionDate: s.updatedAt || s.createdAt,
                department: "General",
                type: "Subtask",
                raw: s,
            })));
        } catch (e) {
            console.error("Failed to fetch completed subtasks:", e);
        }
    }

    // Fetch cancelled subtasks separately (different response shape)
    async function fetchCancelledSubtasks() {
        try {
            const res = await apiFetch("/api/subtasks/cancelled/bulk");
            if (!res.ok) return;
            const data: any[] = await res.json();
            if (!Array.isArray(data)) return;
            setCancelledSubtasks(data.map((s: any) => ({
                id: s.id,
                name: s.title,
                relatedItem: s.projectTitle || "Unknown Project",
                subRelatedItem: s.taskName || "Unknown Task",
                assignedUser: s.assignedTo || "Unassigned",
                completionDate: s.updatedAt || s.createdAt,
                department: "General",
                type: "Subtask",
                raw: s,
            })));
        } catch (e) {
            console.error("Failed to fetch cancelled subtasks:", e);
        }
    }

    useEffect(() => {
        fetchData();
        fetchSubtasks();
        fetchCancelledSubtasks();
    }, []);

    const handleReopenSubtask = async (subtaskId: string) => {
        // Optimistic: remove from list immediately
        setCompletedSubtasks(prev => prev.filter(s => s.id !== subtaskId));
        try {
            const res = await apiFetch(`/api/subtasks/${subtaskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isCompleted: false, progress: 0 }),
            });
            if (!res.ok) {
                // Revert optimistic update by re-fetching
                const reRes = await apiFetch("/api/subtasks/completed/bulk");
                if (reRes.ok) {
                    const data: any[] = await reRes.json();
                    if (Array.isArray(data)) {
                        setCompletedSubtasks(data.map((s: any) => ({
                            id: s.id,
                            name: s.title,
                            relatedItem: s.projectTitle || "Unknown Project",
                            subRelatedItem: s.taskName || "Unknown Task",
                            assignedUser: s.assignedTo || "Unassigned",
                            completionDate: s.updatedAt || s.createdAt,
                            department: "General",
                            type: "Subtask",
                            raw: s,
                        })));
                    }
                }
                console.error("Failed to reopen subtask");
            }
        } catch (e) {
            console.error("Reopen subtask error:", e);
        }
    };

    const handleReopenTask = async (taskId: string) => {
        // Optimistic: remove from list immediately
        setCompletedTasks(prev => prev.filter(t => t.id !== taskId));
        try {
            const res = await apiFetch(`/api/tasks/${taskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "pending", progress: 0 }),
            });
            if (!res.ok) {
                // Revert optimistic update by re-fetching
                fetchData();
                console.error("Failed to reopen task");
            }
        } catch (e) {
            console.error("Reopen task error:", e);
        }
    };

    const handleReopenProject = async (projectId: string) => {
        // Optimistic
        setCompletedProjects(prev => prev.filter(p => p.id !== projectId));
        try {
            const res = await apiFetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "In Progress", progress: 0 }),
            });
            if (!res.ok) {
                fetchData();
                console.error("Failed to reopen project");
            } else {
                // Cascading updates in backend might affect tasks/keysteps too
                fetchData();
                fetchSubtasks();
            }
        } catch (e) {
            console.error("Reopen project error:", e);
        }
    };

    const handleReopenKeyStep = async (ksId: string) => {
        // Optimistic
        setCompletedKeySteps(prev => prev.filter(ks => ks.id !== ksId));
        try {
            const res = await apiFetch(`/api/key-steps/${ksId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "in-progress", progress: 0 }),
            });
            if (!res.ok) {
                fetchData();
                console.error("Failed to reopen key step");
            } else {
                // Cascading updates in backend
                fetchData();
                fetchSubtasks();
            }
        } catch (e) {
            console.error("Reopen key step error:", e);
        }
    };

    const handleReopenCancelledSubtask = async (subtaskId: string) => {
        // Optimistic: remove from list immediately
        setCancelledSubtasks(prev => prev.filter(s => s.id !== subtaskId));
        try {
            const res = await apiFetch(`/api/subtasks/${subtaskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "Not Started", isCompleted: false, progress: 0 }),
            });
            if (!res.ok) {
                // Revert optimistic update by re-fetching
                fetchCancelledSubtasks();
                console.error("Failed to reopen cancelled subtask");
            }
        } catch (e) {
            console.error("Reopen cancelled subtask error:", e);
        }
    };

    const handleReopenCancelledTask = async (taskId: string) => {
        // Optimistic: remove from list immediately
        setCancelledTasks(prev => prev.filter(t => t.id !== taskId));
        try {
            const res = await apiFetch(`/api/tasks/${taskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "pending", progress: 0 }),
            });
            if (!res.ok) {
                fetchData();
                console.error("Failed to reopen cancelled task");
            }
        } catch (e) {
            console.error("Reopen cancelled task error:", e);
        }
    };

    const handleReopenCancelledProject = async (projectId: string) => {
        // Optimistic
        setCancelledProjects(prev => prev.filter(p => p.id !== projectId));
        try {
            const res = await apiFetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "In Progress", progress: 0 }),
            });
            if (!res.ok) {
                fetchData();
                console.error("Failed to reopen cancelled project");
            } else {
                // Cascading updates in backend might affect tasks/keysteps too
                fetchData();
                fetchSubtasks();
                fetchCancelledSubtasks();
            }
        } catch (e) {
            console.error("Reopen cancelled project error:", e);
        }
    };

    const handleReopenCancelledKeyStep = async (ksId: string) => {
        // Optimistic
        setCancelledKeySteps(prev => prev.filter(ks => ks.id !== ksId));
        try {
            const res = await apiFetch(`/api/key-steps/${ksId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "in-progress", progress: 0 }),
            });
            if (!res.ok) {
                fetchData();
                console.error("Failed to reopen cancelled key step");
            } else {
                // Cascading updates in backend
                fetchData();
                fetchSubtasks();
                fetchCancelledSubtasks();
            }
        } catch (e) {
            console.error("Reopen cancelled key step error:", e);
        }
    };

    const handleReopenTicket = async (ticketId: string) => {
        // Optimistic
        setClosedTickets(prev => prev.filter(t => t.id !== ticketId));
        try {
            const res = await apiFetch(`/api/tickets/${ticketId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "Open" }),
            });
            if (!res.ok) {
                fetchData();
                console.error("Failed to reopen ticket");
            }
        } catch (e) {
            console.error("Reopen ticket error:", e);
        }
    };

    const handleItemClick = async (item: CompletedItem) => {
        setSelectedItem(item);
        setDetailedItemInfo(item.raw);
    };

    const filterItems = (items: CompletedItem[], query: string) => {
        const q = query.toLowerCase().trim();
        return items.filter(item =>
            !q ||
            item.name.toLowerCase().includes(q) ||
            item.relatedItem?.toLowerCase().includes(q) ||
            item.subRelatedItem?.toLowerCase().includes(q)
        ).sort((a, b) => new Date(b.completionDate).getTime() - new Date(a.completionDate).getTime());
    };

    const totalCompleted = completedProjects.length + completedKeySteps.length + completedTasks.length + completedSubtasks.length + closedTickets.length;
    const totalCancelled = cancelledProjects.length + cancelledKeySteps.length + cancelledTasks.length + cancelledSubtasks.length;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* HEADER SECTION */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Completed Archive</h1>
                    </div>
                    <p className="text-slate-500 font-bold text-lg">Historical record of all finalized projects, tasks, subtasks and closed tickets</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="bg-green-50 px-4 py-2 rounded-lg border border-green-100 items-center flex gap-3">
                        <div className="p-2 bg-green-500 rounded-full">
                            <TrendingUp className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <p className="text-xs text-green-700 font-bold uppercase tracking-wider">Total Finalized</p>
                            <p className="text-2xl font-black text-green-900">{totalCompleted}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* TABS SECTION */}
            <Tabs defaultValue="completed" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2 mb-6 bg-slate-100 p-1">
                    <TabsTrigger value="completed" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        Completed ({totalCompleted})
                    </TabsTrigger>
                    <TabsTrigger value="cancelled" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-red-600">
                        Cancelled ({totalCancelled})
                    </TabsTrigger>
                </TabsList>

                {/* ===================== COMPLETED TAB ===================== */}
                <TabsContent value="completed" className="mt-0">
                    <Tabs defaultValue="projects" className="w-full">
                        <TabsList className="grid w-full max-w-3xl grid-cols-5 mb-6 bg-slate-100 p-1">
                            <TabsTrigger value="projects" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                Projects ({completedProjects.length})
                            </TabsTrigger>
                            <TabsTrigger value="keysteps" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                Key Steps ({completedKeySteps.length})
                            </TabsTrigger>
                            <TabsTrigger value="tasks" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                Tasks ({completedTasks.length})
                            </TabsTrigger>
                            <TabsTrigger value="subtasks" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                Subtasks ({completedSubtasks.length})
                            </TabsTrigger>
                            <TabsTrigger value="tickets" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                Closed Tickets ({closedTickets.length})
                            </TabsTrigger>
                        </TabsList>

                        {/* PROJECTS */}
                        <TabsContent value="projects" className="mt-0">
                            <Card className="border-slate-200 overflow-hidden shadow-sm">
                                <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <Folder className="h-4 w-4 text-blue-500" />
                                            Completed Projects
                                            <span className="text-xs font-normal text-slate-400">({filterItems(completedProjects, projectSearch).length})</span>
                                        </CardTitle>
                                        <div className="relative w-56">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search projects..."
                                                className="pl-8 h-8 text-xs bg-white border-slate-200 focus:border-blue-300 rounded-lg"
                                                value={projectSearch}
                                                onChange={(e) => setProjectSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <ScrollArea className="h-[calc(100vh-410px)] w-full rounded-md border bg-white">
                                    <div className="min-w-[1000px]">
                                        <div className="divide-y divide-slate-100">
                                            {isLoading ? (
                                                <LoadingSpinner color="blue" label="Loading projects..." />
                                            ) : filterItems(completedProjects, projectSearch).length === 0 ? (
                                                <EmptyState icon={<Folder className="h-8 w-8 mx-auto mb-2 opacity-20" />} label={projectSearch ? `No projects match "${projectSearch}"` : "No completed projects found"} />
                                            ) : (
                                                filterItems(completedProjects, projectSearch).map(item => (
                                                    <CompletedTableRow
                                                        key={item.id}
                                                        item={item}
                                                        onClick={() => handleItemClick(item)}
                                                        onReopen={() => handleReopenProject(item.id)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </Card>
                        </TabsContent>

                        {/* KEY STEPS */}
                        <TabsContent value="keysteps" className="mt-0">
                            <Card className="border-slate-200 overflow-hidden shadow-sm">
                                <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <Layers className="h-4 w-4 text-amber-500" />
                                            Completed Key Steps
                                            <span className="text-xs font-normal text-slate-400">({filterItems(completedKeySteps, keystepSearch).length})</span>
                                        </CardTitle>
                                        <div className="relative w-56">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search key steps..."
                                                className="pl-8 h-8 text-xs bg-white border-slate-200 focus:border-amber-300 rounded-lg"
                                                value={keystepSearch}
                                                onChange={(e) => setKeystepSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <ScrollArea className="h-[calc(100vh-410px)] w-full rounded-md border bg-white">
                                    <div className="min-w-[1000px]">
                                        <div className="divide-y divide-slate-100">
                                            {isLoading ? (
                                                <LoadingSpinner color="amber" label="Loading key steps..." />
                                            ) : filterItems(completedKeySteps, keystepSearch).length === 0 ? (
                                                <EmptyState icon={<Layers className="h-8 w-8 mx-auto mb-2 opacity-20" />} label={keystepSearch ? `No key steps match "${keystepSearch}"` : "No completed key steps"} />
                                            ) : (
                                                filterItems(completedKeySteps, keystepSearch).map(item => (
                                                    <CompletedTableRow
                                                        key={item.id}
                                                        item={item}
                                                        onClick={() => handleItemClick(item)}
                                                        onReopen={() => handleReopenKeyStep(item.id)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </Card>
                        </TabsContent>

                        {/* TASKS */}
                        <TabsContent value="tasks" className="mt-0">
                            <Card className="border-slate-200 overflow-hidden shadow-sm">
                                <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <CheckSquare className="h-4 w-4 text-indigo-500" />
                                            Completed Tasks
                                            <span className="text-xs font-normal text-slate-400">({filterItems(completedTasks, taskSearch).length})</span>
                                        </CardTitle>
                                        <div className="relative w-56">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search tasks..."
                                                className="pl-8 h-8 text-xs bg-white border-slate-200 focus:border-indigo-300 rounded-lg"
                                                value={taskSearch}
                                                onChange={(e) => setTaskSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <ScrollArea className="h-[calc(100vh-410px)] w-full rounded-md border bg-white">
                                    <div className="min-w-[1000px]">
                                        <div className="divide-y divide-slate-100">
                                            {isLoading ? (
                                                <LoadingSpinner color="indigo" label="Loading tasks..." />
                                            ) : filterItems(completedTasks, taskSearch).length === 0 ? (
                                                <EmptyState icon={<CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />} label={taskSearch ? `No tasks match "${taskSearch}"` : "No completed tasks yet"} />
                                            ) : (
                                                filterItems(completedTasks, taskSearch).map(item => (
                                                    <CompletedTableRow
                                                        key={item.id}
                                                        item={item}
                                                        onClick={() => handleItemClick(item)}
                                                        onReopen={() => handleReopenTask(item.id)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </Card>
                        </TabsContent>

                        {/* SUBTASKS */}
                        <TabsContent value="subtasks" className="mt-0">
                            <Card className="border-slate-200 overflow-hidden shadow-sm">
                                <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <ListChecks className="h-4 w-4 text-emerald-500" />
                                            Completed Subtasks
                                            <span className="text-xs font-normal text-slate-400">({filterItems(completedSubtasks, subtaskSearch).length})</span>
                                        </CardTitle>
                                        <div className="relative w-56">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search subtasks..."
                                                className="pl-8 h-8 text-xs bg-white border-slate-200 focus:border-emerald-300 rounded-lg"
                                                value={subtaskSearch}
                                                onChange={(e) => setSubtaskSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <ScrollArea className="h-[calc(100vh-410px)] w-full rounded-md border bg-white">
                                    <div className="min-w-[1000px]">
                                        <div className="divide-y divide-slate-100">
                                            {isLoading ? (
                                                <LoadingSpinner color="emerald" label="Loading subtasks..." />
                                            ) : filterItems(completedSubtasks, subtaskSearch).length === 0 ? (
                                                <EmptyState icon={<ListChecks className="h-8 w-8 mx-auto mb-2 opacity-20" />} label={subtaskSearch ? `No subtasks match "${subtaskSearch}"` : "No completed subtasks yet"} />
                                            ) : (
                                                filterItems(completedSubtasks, subtaskSearch).map(item => (
                                                    <SubtaskCompletedRow
                                                        key={item.id}
                                                        item={item}
                                                        onClick={() => handleItemClick(item)}
                                                        onReopen={() => handleReopenSubtask(item.id)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </Card>
                        </TabsContent>

                        {/* CLOSED TICKETS */}
                        <TabsContent value="tickets" className="mt-0">
                            <Card className="border-slate-200 overflow-hidden shadow-sm">
                                <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <Ticket className="h-4 w-4 text-purple-600" />
                                            Closed Tickets
                                            <span className="text-xs font-normal text-slate-400">({filterItems(closedTickets, ticketSearch).length})</span>
                                        </CardTitle>
                                        <div className="relative w-56">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search closed tickets..."
                                                className="pl-8 h-8 text-xs bg-white border-slate-200 focus:border-purple-300 rounded-lg"
                                                value={ticketSearch}
                                                onChange={(e) => setTicketSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <ScrollArea className="h-[calc(100vh-410px)] w-full rounded-md border bg-white">
                                    <div className="min-w-[1000px]">
                                        <div className="divide-y divide-slate-100">
                                            {isLoading ? (
                                                <LoadingSpinner color="purple" label="Loading closed tickets..." />
                                            ) : filterItems(closedTickets, ticketSearch).length === 0 ? (
                                                <EmptyState icon={<Ticket className="h-8 w-8 mx-auto mb-2 opacity-20" />} label={ticketSearch ? `No tickets match "${ticketSearch}"` : "No closed tickets found"} />
                                            ) : (
                                                filterItems(closedTickets, ticketSearch).map(item => (
                                                    <CompletedTableRow
                                                        key={item.id}
                                                        item={item}
                                                        onClick={() => handleItemClick(item)}
                                                        onReopen={() => handleReopenTicket(item.id)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                {/* ===================== CANCELLED TAB ===================== */}
                <TabsContent value="cancelled" className="mt-0">
                    <Tabs defaultValue="cancelled-projects" className="w-full">
                        <TabsList className="grid w-full max-w-2xl grid-cols-4 mb-6 bg-red-50 p-1">
                            <TabsTrigger value="cancelled-projects" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                Projects ({cancelledProjects.length})
                            </TabsTrigger>
                            <TabsTrigger value="cancelled-keysteps" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                Key Steps ({cancelledKeySteps.length})
                            </TabsTrigger>
                            <TabsTrigger value="cancelled-tasks" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                Tasks ({cancelledTasks.length})
                            </TabsTrigger>
                            <TabsTrigger value="cancelled-subtasks" className="font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                Subtasks ({cancelledSubtasks.length})
                            </TabsTrigger>
                        </TabsList>

                        {/* CANCELLED PROJECTS */}
                        <TabsContent value="cancelled-projects" className="mt-0">
                            <Card className="border-red-100 overflow-hidden shadow-sm">
                                <CardHeader className="bg-red-50/50 border-b border-red-100 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <Folder className="h-4 w-4 text-red-500" />
                                            Cancelled Projects
                                            <span className="text-xs font-normal text-slate-400">({filterItems(cancelledProjects, cancelledProjectSearch).length})</span>
                                        </CardTitle>
                                        <div className="relative w-56">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search cancelled projects..."
                                                className="pl-8 h-8 text-xs bg-white border-slate-200 focus:border-red-300 rounded-lg"
                                                value={cancelledProjectSearch}
                                                onChange={(e) => setCancelledProjectSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <ScrollArea className="h-[calc(100vh-410px)] w-full rounded-md border bg-white">
                                    <div className="min-w-[1000px]">
                                        <div className="divide-y divide-slate-100">
                                            {isLoading ? (
                                                <LoadingSpinner color="red" label="Loading cancelled projects..." />
                                            ) : filterItems(cancelledProjects, cancelledProjectSearch).length === 0 ? (
                                                <EmptyState icon={<Folder className="h-8 w-8 mx-auto mb-2 opacity-20" />} label={cancelledProjectSearch ? `No projects match "${cancelledProjectSearch}"` : "No cancelled projects"} />
                                            ) : (
                                                filterItems(cancelledProjects, cancelledProjectSearch).map(item => (
                                                    <CancelledTableRow
                                                        key={item.id}
                                                        item={item}
                                                        onClick={() => handleItemClick(item)}
                                                        onReopen={() => handleReopenCancelledProject(item.id)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </Card>
                        </TabsContent>

                        {/* CANCELLED KEY STEPS */}
                        <TabsContent value="cancelled-keysteps" className="mt-0">
                            <Card className="border-red-100 overflow-hidden shadow-sm">
                                <CardHeader className="bg-red-50/50 border-b border-red-100 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <Layers className="h-4 w-4 text-red-500" />
                                            Cancelled Key Steps
                                            <span className="text-xs font-normal text-slate-400">({filterItems(cancelledKeySteps, cancelledKeystepSearch).length})</span>
                                        </CardTitle>
                                        <div className="relative w-56">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search cancelled key steps..."
                                                className="pl-8 h-8 text-xs bg-white border-slate-200 focus:border-red-300 rounded-lg"
                                                value={cancelledKeystepSearch}
                                                onChange={(e) => setCancelledKeystepSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <ScrollArea className="h-[calc(100vh-410px)] w-full rounded-md border bg-white">
                                    <div className="min-w-[1000px]">
                                        <div className="divide-y divide-slate-100">
                                            {isLoading ? (
                                                <LoadingSpinner color="red" label="Loading cancelled key steps..." />
                                            ) : filterItems(cancelledKeySteps, cancelledKeystepSearch).length === 0 ? (
                                                <EmptyState icon={<Layers className="h-8 w-8 mx-auto mb-2 opacity-20" />} label={cancelledKeystepSearch ? `No key steps match "${cancelledKeystepSearch}"` : "No cancelled key steps"} />
                                            ) : (
                                                filterItems(cancelledKeySteps, cancelledKeystepSearch).map(item => (
                                                    <CancelledTableRow
                                                        key={item.id}
                                                        item={item}
                                                        onClick={() => handleItemClick(item)}
                                                        onReopen={() => handleReopenCancelledKeyStep(item.id)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </Card>
                        </TabsContent>

                        {/* CANCELLED TASKS */}
                        <TabsContent value="cancelled-tasks" className="mt-0">
                            <Card className="border-red-100 overflow-hidden shadow-sm">
                                <CardHeader className="bg-red-50/50 border-b border-red-100 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <CheckSquare className="h-4 w-4 text-red-500" />
                                            Cancelled Tasks
                                            <span className="text-xs font-normal text-slate-400">({filterItems(cancelledTasks, cancelledTaskSearch).length})</span>
                                        </CardTitle>
                                        <div className="relative w-56">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search cancelled tasks..."
                                                className="pl-8 h-8 text-xs bg-white border-slate-200 focus:border-red-300 rounded-lg"
                                                value={cancelledTaskSearch}
                                                onChange={(e) => setCancelledTaskSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <ScrollArea className="h-[calc(100vh-410px)] w-full rounded-md border bg-white">
                                    <div className="min-w-[1000px]">
                                        <div className="divide-y divide-slate-100">
                                            {isLoading ? (
                                                <LoadingSpinner color="red" label="Loading cancelled tasks..." />
                                            ) : filterItems(cancelledTasks, cancelledTaskSearch).length === 0 ? (
                                                <EmptyState icon={<CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />} label={cancelledTaskSearch ? `No tasks match "${cancelledTaskSearch}"` : "No cancelled tasks"} />
                                            ) : (
                                                filterItems(cancelledTasks, cancelledTaskSearch).map(item => (
                                                    <CancelledTableRow
                                                        key={item.id}
                                                        item={item}
                                                        onClick={() => handleItemClick(item)}
                                                        onReopen={() => handleReopenCancelledTask(item.id)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </Card>
                        </TabsContent>

                        {/* CANCELLED SUBTASKS */}
                        <TabsContent value="cancelled-subtasks" className="mt-0">
                            <Card className="border-red-100 overflow-hidden shadow-sm">
                                <CardHeader className="bg-red-50/50 border-b border-red-100 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <ListChecks className="h-4 w-4 text-red-500" />
                                            Cancelled Subtasks
                                            <span className="text-xs font-normal text-slate-400">({filterItems(cancelledSubtasks, cancelledSubtaskSearch).length})</span>
                                        </CardTitle>
                                        <div className="relative w-56">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search cancelled subtasks..."
                                                className="pl-8 h-8 text-xs bg-white border-slate-200 focus:border-red-300 rounded-lg"
                                                value={cancelledSubtaskSearch}
                                                onChange={(e) => setCancelledSubtaskSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <ScrollArea className="h-[calc(100vh-410px)] w-full rounded-md border bg-white">
                                    <div className="min-w-[1000px]">
                                        <div className="divide-y divide-slate-100">
                                            {isLoading ? (
                                                <LoadingSpinner color="red" label="Loading cancelled subtasks..." />
                                            ) : filterItems(cancelledSubtasks, cancelledSubtaskSearch).length === 0 ? (
                                                <EmptyState icon={<ListChecks className="h-8 w-8 mx-auto mb-2 opacity-20" />} label={cancelledSubtaskSearch ? `No subtasks match "${cancelledSubtaskSearch}"` : "No cancelled subtasks"} />
                                            ) : (
                                                filterItems(cancelledSubtasks, cancelledSubtaskSearch).map(item => (
                                                    <CancelledSubtaskRow
                                                        key={item.id}
                                                        item={item}
                                                        onClick={() => handleItemClick(item)}
                                                        onReopen={() => handleReopenCancelledSubtask(item.id)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </TabsContent>
            </Tabs>

            {/* DETAILS DIALOG */}
            <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center gap-2 mb-2">
                            <Badge className={
                                selectedItem?.type === "Project" ? "bg-blue-500" :
                                    selectedItem?.type === "Key Step" ? "bg-amber-500" :
                                        selectedItem?.type === "Subtask" ? "bg-emerald-500" :
                                            selectedItem?.type === "Ticket" ? "bg-purple-600" :
                                                "bg-indigo-500"
                            }>
                                {selectedItem?.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">Archive Record #{selectedItem?.id.slice(0, 8)}</span>
                        </div>
                        <DialogTitle className="text-2xl font-bold">{selectedItem?.name}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground uppercase font-bold">
                                    {selectedItem?.type === 'Project' ? 'Client' : selectedItem?.type === 'Subtask' ? 'Project' : selectedItem?.type === 'Ticket' ? 'Company / Project' : 'Project'}
                                </Label>
                                <p className="font-semibold text-slate-700">{selectedItem?.relatedItem}</p>
                            </div>
                            {selectedItem?.type === 'Subtask' && selectedItem?.subRelatedItem && (
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground uppercase font-bold">Parent Task</Label>
                                    <p className="font-semibold text-slate-700 flex items-center gap-1">
                                        <CheckSquare className="h-3.5 w-3.5 text-indigo-400" />
                                        {selectedItem.subRelatedItem}
                                    </p>
                                </div>
                            )}
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground uppercase font-bold">Completion Date</Label>
                                <div className="flex items-center gap-1.5 font-semibold text-green-600">
                                    <CheckCircle2 className="h-4 w-4" />
                                    {selectedItem && formatDate(selectedItem.completionDate)}
                                </div>
                            </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground uppercase font-bold">Description</Label>
                            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100 italic">
                                {detailedItemInfo?.description || "No description provided for this item."}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground uppercase font-bold">Assigned By</Label>
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback>{selectedItem?.assignedUser?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm font-medium">{selectedItem?.assignedUser}</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground uppercase font-bold">Timeline</Label>
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>Started: {detailedItemInfo?.startDate ? formatDate(detailedItemInfo.startDate) : "N/A"}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>Target End: {detailedItemInfo?.endDate ? formatDate(detailedItemInfo.endDate) : "N/A"}</span>
                                </div>
                            </div>
                        </div>

                        {selectedItem?.type === "Project" && detailedItemInfo && (
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground uppercase font-bold">Project Details</Label>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-slate-50 p-2 rounded border text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase">Code</p>
                                        <p className="text-xs font-bold">{detailedItemInfo.projectCode}</p>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded border text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                                        <p className="text-xs font-bold text-green-600">Finalized</p>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded border text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase">Progress</p>
                                        <p className="text-xs font-bold">100%</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedItem?.type === "Ticket" && detailedItemInfo && (
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground uppercase font-bold">Ticket Details</Label>
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="bg-slate-50 p-2 rounded border text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase">Ticket Code</p>
                                        <p className="text-xs font-bold">{detailedItemInfo.ticketCode}</p>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded border text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase">Category</p>
                                        <p className="text-xs font-bold">{detailedItemInfo.category}</p>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded border text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase">Priority</p>
                                        <p className="text-xs font-bold">{detailedItemInfo.priority}</p>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded border text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                                        <p className="text-xs font-bold text-purple-600">Closed</p>
                                    </div>
                                </div>
                                {detailedItemInfo.closeReason && (
                                    <div className="mt-2 bg-gray-50 p-3 rounded border text-xs">
                                        <span className="font-bold text-gray-700">Close Reason: </span>
                                        <span className="text-gray-600">{detailedItemInfo.closeReason}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* ---------------- SHARED SUB-COMPONENTS ---------------- */

function LoadingSpinner({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <div className={`animate-spin rounded-full h-8 w-8 border-b-2 border-${color}-500 mb-2`}></div>
            <p className="text-sm">{label}</p>
        </div>
    );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <div className="text-center py-12 text-slate-400">
            {icon}
            <p className="text-sm">{label}</p>
        </div>
    );
}

function CompletedTableRow({ item, onClick, onReopen }: { item: CompletedItem, onClick: () => void, onReopen?: () => void }) {
    const [reopening, setReopening] = useState(false);

    const handleReopen = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onReopen) return;
        setReopening(true);
        await onReopen();
        setReopening(false);
    };

    return (
        <div
            onClick={onClick}
            className="grid grid-cols-[1fr_120px_100px_120px_130px] items-center gap-4 px-6 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer group"
        >
            {/* Title & Project Info */}
            <div className="flex items-center gap-4 min-w-0">
                <div className="p-2 rounded-lg bg-slate-100 text-slate-500 flex-shrink-0">
                    {item.type === "Project" ? <Folder size={20} /> :
                        item.type === "Key Step" ? <Layers size={20} /> :
                            item.type === "Ticket" ? <Ticket size={20} /> :
                                <CheckSquare size={20} />}
                </div>
                <div className="min-w-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <p className="font-bold text-slate-900 text-base truncate cursor-default">{item.name}</p>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{item.name}</p>
                        </TooltipContent>
                    </Tooltip>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                            item.type === "Project" ? "text-blue-600 bg-blue-50 border-blue-100" :
                            item.type === "Key Step" ? "text-amber-600 bg-amber-50 border-amber-100" :
                            item.type === "Ticket" ? "text-purple-600 bg-purple-50 border-purple-100" :
                            "text-indigo-600 bg-indigo-50 border-indigo-100"
                        }`}>{item.type}</span>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className="text-[13px] font-bold text-slate-500 truncate cursor-default">{item.relatedItem}</p>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{item.relatedItem}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            </div>

            {/* Department */}
            <div className="flex justify-center">
                <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-black text-[10px] py-1 px-3">
                    {item.department || "General"}
                </Badge>
            </div>

            {/* Assigned User */}
            <div className="flex justify-center">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-black uppercase tracking-tight">
                    {item.assignedUser?.split(" ")[0]}
                </div>
            </div>

            {/* Status & Date */}
            <div className="flex flex-col items-center">
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none font-black text-[9px] px-2 h-5 mb-1 flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    {item.type === "Project" ? "FINALIZED" : item.type === "Key Step" ? "CLOSED" : item.type === "Ticket" ? "CLOSED" : "RELEASED"}
                </Badge>
                <div className="flex items-center gap-1 text-slate-600 font-bold text-xs">
                    <Calendar size={12} className="text-slate-400" />
                    {formatDate(item.completionDate)}
                </div>
            </div>

            {/* Reopen Action */}
            <div className="flex justify-end pr-2">
                {onReopen && (
                    <button
                        onClick={handleReopen}
                        disabled={reopening}
                        title={`Reopen — mark this ${item.type.toLowerCase()} and its related items as pending`}
                        className={`group/btn relative flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all ${item.type === "Project" ? "bg-blue-500 hover:bg-blue-600 shadow-blue-200" :
                            item.type === "Key Step" ? "bg-amber-500 hover:bg-amber-600 shadow-amber-200" :
                                item.type === "Ticket" ? "bg-purple-600 hover:bg-purple-700 shadow-purple-200" :
                                    "bg-indigo-500 hover:bg-indigo-600 shadow-indigo-200"
                            } text-white active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden w-[110px]`}
                    >
                        {reopening ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <RotateCcw size={14} className="group-hover/btn:rotate-[-180deg] transition-transform duration-500" />
                                <span>REOPEN</span>
                            </>
                        )}
                    </button>
                )}
            </div>

        </div>
    );
}

function SubtaskCompletedRow({ item, onClick, onReopen }: { item: CompletedItem; onClick: () => void; onReopen: () => void }) {
    const [reopening, setReopening] = useState(false);

    const handleReopen = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setReopening(true);
        await onReopen();
        setReopening(false);
    };

    return (
        <div
            onClick={onClick}
            className="grid items-center px-4 py-3 hover:bg-emerald-50/40 transition-colors cursor-pointer border-b border-slate-100"
            style={{ gridTemplateColumns: "40px 1fr auto" }}
        >
            {/* Icon */}
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 w-8 h-8 flex items-center justify-center">
                <CheckCircle2 size={15} />
            </div>

            {/* Content — title + breadcrumb */}
            <div className="min-w-0 px-3">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <p className="font-semibold text-slate-900 text-sm truncate cursor-default">{item.name}</p>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{item.name}</p>
                    </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 min-w-0">
                    <Folder size={10} className="text-blue-400 flex-shrink-0" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="truncate max-w-[120px] cursor-default">{item.relatedItem}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{item.relatedItem}</p>
                        </TooltipContent>
                    </Tooltip>
                    <span className="text-slate-300 flex-shrink-0">›</span>
                    <CheckSquare size={10} className="text-indigo-400 flex-shrink-0" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="truncate max-w-[160px] cursor-default">{item.subRelatedItem}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{item.subRelatedItem}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Right: date + DONE badge + Reopen button — all in a fixed-width flex row */}
            <div
                className="flex items-center gap-2 flex-shrink-0"
                onClick={e => e.stopPropagation()}
            >
                <span className="text-[11px] text-slate-500 whitespace-nowrap hidden sm:inline">
                    {formatDate(item.completionDate) || "—"}
                </span>
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none text-[10px] font-bold whitespace-nowrap">
                    DONE
                </Badge>
                <button
                    onClick={handleReopen}
                    disabled={reopening}
                    title="Reopen — mark this subtask as pending again"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                    {reopening ? (
                        <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin inline-block" />
                    ) : (
                        <RotateCcw size={12} />
                    )}
                    {reopening ? "Reopening…" : "Reopen"}
                </button>
            </div>
        </div>
    );
}

/* ---------------- CANCELLED SUB-COMPONENTS ---------------- */

function CancelledTableRow({ item, onClick, onReopen }: { item: CompletedItem, onClick: () => void, onReopen?: () => void }) {
    const [reopening, setReopening] = useState(false);

    const handleReopen = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onReopen) return;
        setReopening(true);
        await onReopen();
        setReopening(false);
    };

    const typeIcon = item.type === "Project" ? <Folder size={20} /> :
        item.type === "Key Step" ? <Layers size={20} /> :
            <CheckSquare size={20} />;

    return (
        <div
            onClick={onClick}
            className="grid grid-cols-[1fr_120px_100px_120px_130px] items-center gap-4 px-6 py-4 border-b border-slate-100 hover:bg-red-50/40 transition-colors cursor-pointer group"
        >
            {/* Title & Project Info */}
            <div className="flex items-center gap-4 min-w-0">
                <div className="p-2 rounded-lg bg-red-50 text-red-500 flex-shrink-0">
                    {typeIcon}
                </div>
                <div className="min-w-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <p className="font-bold text-slate-900 text-base truncate cursor-default">{item.name}</p>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{item.name}</p>
                        </TooltipContent>
                    </Tooltip>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-black text-red-600 uppercase tracking-widest bg-red-50 px-1.5 py-0.5 rounded border border-red-100">{item.type}</span>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className="text-[13px] font-bold text-slate-500 truncate cursor-default">{item.relatedItem}</p>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{item.relatedItem}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            </div>

            {/* Department */}
            <div className="flex justify-center">
                <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-black text-[10px] py-1 px-3">
                    {item.department || "General"}
                </Badge>
            </div>

            {/* Assigned User */}
            <div className="flex justify-center">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-black uppercase tracking-tight">
                    {item.assignedUser?.split(" ")[0]}
                </div>
            </div>

            {/* Status & Date */}
            <div className="flex flex-col items-center">
                <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none font-black text-[9px] px-2 h-5 mb-1 flex items-center gap-1">
                    <AlertCircle size={10} />
                    CANCELLED
                </Badge>
                <div className="flex items-center gap-1 text-slate-600 font-bold text-xs">
                    <Calendar size={12} className="text-slate-400" />
                    {formatDate(item.completionDate)}
                </div>
            </div>

            {/* Reopen Action */}
            <div className="flex justify-end pr-2">
                {onReopen && (
                    <button
                        onClick={handleReopen}
                        disabled={reopening}
                        title={`Reopen — restore this ${item.type.toLowerCase()} to active status`}
                        className="group/btn relative flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all bg-slate-700 hover:bg-slate-800 text-white active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden w-[110px]"
                    >
                        {reopening ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <RotateCcw size={14} className="group-hover/btn:rotate-[-180deg] transition-transform duration-500" />
                                <span>REOPEN</span>
                            </>
                        )}
                    </button>
                )}
            </div>

        </div>
    );
}

function CancelledSubtaskRow({ item, onClick, onReopen }: { item: CompletedItem; onClick: () => void; onReopen: () => void }) {
    const [reopening, setReopening] = useState(false);

    const handleReopen = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setReopening(true);
        await onReopen();
        setReopening(false);
    };

    return (
        <div
            onClick={onClick}
            className="grid items-center px-4 py-3 hover:bg-red-50/40 transition-colors cursor-pointer border-b border-slate-100"
            style={{ gridTemplateColumns: "40px 1fr auto" }}
        >
            {/* Icon */}
            <div className="p-1.5 rounded-lg bg-red-100 text-red-600 w-8 h-8 flex items-center justify-center">
                <AlertCircle size={15} />
            </div>

            {/* Content — title + breadcrumb */}
            <div className="min-w-0 px-3">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <p className="font-semibold text-slate-900 text-sm truncate cursor-default">{item.name}</p>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{item.name}</p>
                    </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 min-w-0">
                    <Folder size={10} className="text-blue-400 flex-shrink-0" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="truncate max-w-[120px] cursor-default">{item.relatedItem}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{item.relatedItem}</p>
                        </TooltipContent>
                    </Tooltip>
                    <span className="text-slate-300 flex-shrink-0">›</span>
                    <CheckSquare size={10} className="text-indigo-400 flex-shrink-0" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="truncate max-w-[160px] cursor-default">{item.subRelatedItem}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{item.subRelatedItem}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Right: date + CANCELLED badge + Reopen button — all in a fixed-width flex row */}
            <div
                className="flex items-center gap-2 flex-shrink-0"
                onClick={e => e.stopPropagation()}
            >
                <span className="text-[11px] text-slate-500 whitespace-nowrap hidden sm:inline">
                    {formatDate(item.completionDate) || "—"}
                </span>
                <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none text-[10px] font-bold whitespace-nowrap">
                    CANCELLED
                </Badge>
                <button
                    onClick={handleReopen}
                    disabled={reopening}
                    title="Reopen — restore this subtask to active status"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                    {reopening ? (
                        <span className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin inline-block" />
                    ) : (
                        <RotateCcw size={12} />
                    )}
                    {reopening ? "Reopening…" : "Reopen"}
                </button>
            </div>
        </div>
    );
}