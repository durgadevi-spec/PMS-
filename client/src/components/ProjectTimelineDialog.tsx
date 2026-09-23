import { useEffect, useMemo, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    ChevronDown,
    ChevronRight,
    Calendar as CalendarIcon,
    Clock,
    Users,
    Flag,
    AlertTriangle,
    CheckCircle2,
    Loader2,
    Maximize2,
    Minimize2,
    Search,
    List,
    LayoutGrid,
    CalendarRange,
    Target,
} from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import ProjectScheduleHistoryDialog from "@/components/ProjectScheduleHistoryDialog";

/* ============================================================
   Types
============================================================ */
type TimelineLevel = "project" | "keystep" | "task" | "subtask";
type ViewMode = "gantt" | "list" | "kanban";
type TypeFilter = "all" | "keystep" | "task" | "subtask";
type ZoomLevel = "day" | "week" | "month" | "quarter";

interface TimelineRow {
    id: string;
    level: TimelineLevel;
    parentId: string | null;
    title: string;
    status: string;
    startDate: string | null; // ISO date (yyyy-mm-dd)
    endDate: string | null;
    actualCompletionDate: string | null;
    progress: number;
    isCompleted: boolean;
    assignees: string[]; // employee names
    depth: number;
    hasChildren: boolean;
}

interface ProjectTimelineDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    project: any | null;
    employees: any[];
}

/* ============================================================
   Date helpers (pure, no external deps)
============================================================ */
const toDateOnly = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val === "string") {
        // Parse the literal Y-M-D digits so a "date-only" string like "2026-07-01"
        // (parsed by `new Date()` as UTC midnight) never shifts to the previous or
        // next calendar day when read back with local getters/setters — this was
        // causing delay-day counts (and which bar showed as delayed) to be wrong.
        const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const dayDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);

const fmt = (val: any) => {
    const d = toDateOnly(val);
    if (!d) return "—";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const isCompletedStatus = (status: string) => {
    const s = (status || "").toLowerCase();
    return s.includes("complete") || s === "closed";
};

/* ============================================================
   Zoom presets (pixels of width per calendar day)
============================================================ */
const ZOOM_CONFIG: Record<ZoomLevel, { pxPerDay: number; label: string }> = {
    day: { pxPerDay: 42, label: "Day" },
    week: { pxPerDay: 16, label: "Week" },
    month: { pxPerDay: 6, label: "Month" },
    quarter: { pxPerDay: 2.4, label: "Quarter" },
};

// Preferred left-to-right ordering for Kanban status columns; anything else is appended alphabetically.
const KANBAN_STATUS_ORDER = [
    "pending", "not started", "to do", "open",
    "in progress", "on hold", "to be tested", "in review",
    "delayed", "completed", "closed", "done",
];

/* ============================================================
   Main Component
============================================================ */
export function ProjectTimelineDialog({ open, onOpenChange, project, employees }: ProjectTimelineDialogProps) {
    const [keySteps, setKeySteps] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    // View controls (new)
    const [viewMode, setViewMode] = useState<ViewMode>("gantt");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [search, setSearch] = useState("");
    const [zoom, setZoom] = useState<ZoomLevel>("week");
    const [fullscreen, setFullscreen] = useState(false);
    const ganttScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open || !project?.id) return;
        let mounted = true;
        setLoading(true);
        Promise.all([
            apiFetch(`/api/projects/${project.id}/key-steps?status=all`).then(r => r.json()).catch(() => []),
            apiFetch(`/api/tasks/${project.id}?status=all`).then(r => r.json()).catch(() => []),
        ]).then(([ks, ts]) => {
            if (!mounted) return;
            setKeySteps(Array.isArray(ks) ? ks : []);
            setTasks(Array.isArray(ts) ? ts : []);
            setLoading(false);
        });
        return () => { mounted = false; };
    }, [open, project?.id]);

    // Reset transient UI state whenever the dialog is closed / reopened for a different project
    useEffect(() => {
        if (!open) {
            setFullscreen(false);
            setSearch("");
        }
    }, [open]);

    const employeeName = (id: string) => employees.find((e: any) => String(e.id) === String(id))?.name || "Unknown";

    /* ----------------------------------------------------------
       Build flattened, chronologically-sorted hierarchy
    ---------------------------------------------------------- */
    const { rows, minDate, maxDate } = useMemo(() => {
        if (!project) return { rows: [] as TimelineRow[], minDate: new Date(), maxDate: new Date() };

        const sortByStart = (a: any, b: any) => {
            const da = toDateOnly(a.startDate)?.getTime() ?? Infinity;
            const db = toDateOnly(b.startDate)?.getTime() ?? Infinity;
            return da - db;
        };

        const buildSubtaskRow = (st: any, parentId: string, depth: number): TimelineRow => {
            const completed = !!st.isCompleted;
            return {
                id: `subtask-${st.id}`,
                level: "subtask",
                parentId,
                title: st.title || "Untitled Subtask",
                status: completed ? "Completed" : (st.progress > 0 ? "In Progress" : "Pending"),
                startDate: st.startDate || null,
                endDate: st.endDate || null,
                // Subtasks now have a dedicated completion_date column (same as tasks);
                // only fall back to endDate for older rows that predate that column.
                actualCompletionDate: completed ? (st.completionDate || st.endDate || null) : null,
                progress: completed ? 100 : (st.progress || 0),
                isCompleted: completed,
                assignees: (Array.isArray(st.assignedTo) ? st.assignedTo : (st.assignedTo ? [st.assignedTo] : [])).map(employeeName),
                depth,
                hasChildren: false,
            };
        };

        const buildTaskRow = (t: any, parentId: string, depth: number): TimelineRow => {
            const completed = isCompletedStatus(t.status);
            return {
                id: `task-${t.id}`,
                level: "task",
                parentId,
                title: t.taskName || "Untitled Task",
                status: t.status || "Pending",
                startDate: t.startDate || null,
                endDate: t.endDate || null,
                actualCompletionDate: t.completionDate || t.completedAt || null,
                progress: t.progress || 0,
                isCompleted: completed,
                assignees: (Array.isArray(t.taskMembers) ? t.taskMembers : []).map(employeeName),
                depth,
                hasChildren: !!(t.subtasks && t.subtasks.length),
            };
        };

        const out: TimelineRow[] = [];

        // Root: project row
        out.push({
            id: `project-${project.id}`,
            level: "project",
            parentId: null,
            title: project.title,
            status: project.status || "Planned",
            startDate: project.startDate || null,
            endDate: project.endDate || null,
            actualCompletionDate: project.completedAt || null,
            progress: project.progress || 0,
            isCompleted: isCompletedStatus(project.status),
            assignees: [],
            depth: 0,
            hasChildren: true,
        });

        // Index tasks by keyStepId
        const tasksByKeyStep = new Map<string, any[]>();
        const unassignedTasks: any[] = [];
        tasks.forEach((t: any) => {
            if (t.keyStepId) {
                if (!tasksByKeyStep.has(t.keyStepId)) tasksByKeyStep.set(t.keyStepId, []);
                tasksByKeyStep.get(t.keyStepId)!.push(t);
            } else {
                unassignedTasks.push(t);
            }
        });

        // Top-level key steps only (nested key steps shown under their parent)
        const topKeySteps = keySteps.filter((k: any) => !k.parentKeyStepId).sort(sortByStart);
        const childKeyStepsByParent = new Map<string, any[]>();
        keySteps.filter((k: any) => k.parentKeyStepId).forEach((k: any) => {
            if (!childKeyStepsByParent.has(k.parentKeyStepId)) childKeyStepsByParent.set(k.parentKeyStepId, []);
            childKeyStepsByParent.get(k.parentKeyStepId)!.push(k);
        });

        const pushKeyStep = (ks: any, depth: number) => {
            const stepTasks = (tasksByKeyStep.get(ks.id) || []).slice().sort(sortByStart);
            const nestedSteps = (childKeyStepsByParent.get(ks.id) || []).slice().sort(sortByStart);
            const completed = isCompletedStatus(ks.status);
            out.push({
                id: `keystep-${ks.id}`,
                level: "keystep",
                parentId: `project-${project.id}`,
                title: ks.title,
                status: ks.status || "pending",
                startDate: ks.startDate || null,
                endDate: ks.endDate || null,
                actualCompletionDate: ks.completedAt || null,
                progress: ks.progress || 0,
                isCompleted: completed,
                assignees: [],
                depth,
                hasChildren: stepTasks.length > 0 || nestedSteps.length > 0,
            });

            const ksRowId = `keystep-${ks.id}`;
            if (collapsed[ksRowId]) return;

            stepTasks.forEach((t: any) => {
                const taskRow = buildTaskRow(t, ksRowId, depth + 1);
                out.push(taskRow);
                if (collapsed[taskRow.id]) return;
                (t.subtasks || []).slice().sort(sortByStart).forEach((st: any) => {
                    out.push(buildSubtaskRow(st, taskRow.id, depth + 2));
                });
            });

            nestedSteps.forEach((child: any) => pushKeyStep(child, depth + 1));
        };

        topKeySteps.forEach((ks: any) => pushKeyStep(ks, 1));

        // Unassigned (no key step) tasks, grouped directly under project
        unassignedTasks.sort(sortByStart).forEach((t: any) => {
            const taskRow = buildTaskRow(t, `project-${project.id}`, 1);
            out.push(taskRow);
            if (collapsed[taskRow.id]) return;
            (t.subtasks || []).slice().sort(sortByStart).forEach((st: any) => {
                out.push(buildSubtaskRow(st, taskRow.id, 2));
            });
        });

        // Compute overall date bounds for the Gantt scale
        const allDates: Date[] = [];
        out.forEach(r => {
            const s = toDateOnly(r.startDate);
            const e = toDateOnly(r.endDate);
            if (s) allDates.push(s);
            if (e) allDates.push(e);
        });
        let minD = allDates.length ? new Date(Math.min(...allDates.map(d => d.getTime()))) : toDateOnly(project.startDate) || new Date();
        let maxD = allDates.length ? new Date(Math.max(...allDates.map(d => d.getTime()))) : toDateOnly(project.endDate) || new Date();
        // Pad bounds slightly for readability
        minD = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate() - 1);
        maxD = new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate() + 1);
        if (maxD.getTime() <= minD.getTime()) maxD = new Date(minD.getTime() + 7 * 86400000);

        return { rows: out, minDate: minD, maxDate: maxD };
    }, [project, keySteps, tasks, collapsed, employees]);

    const toggleCollapse = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

    // Filter rows by type + search, without touching the underlying hierarchy-building logic above.
    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (r.level === "project") return true; // always keep the anchor row
            if (typeFilter !== "all" && r.level !== typeFilter) return false;
            if (q && !r.title.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [rows, typeFilter, search]);

    const totalSpanDays = Math.max(1, dayDiff(maxDate, minDate));
    const today = toDateOnly(new Date())!;

    const pxPerDay = ZOOM_CONFIG[zoom].pxPerDay;
    const timelineWidthPx = Math.max(600, Math.round(totalSpanDays * pxPerDay));
    const todayPx = dayDiff(today, minDate) * pxPerDay;

    // Month header segments (top row of the Gantt header, pixel-accurate for the active zoom)
    const monthSegments = useMemo(() => {
        const segs: { label: string; startPx: number; widthPx: number }[] = [];
        const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        while (cursor.getTime() <= maxDate.getTime()) {
            const segStart = cursor.getTime() < minDate.getTime() ? minDate : cursor;
            const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            const segEndBound = nextMonth.getTime() > maxDate.getTime() ? new Date(maxDate.getTime() + 86400000) : nextMonth;
            const startPx = Math.max(0, dayDiff(segStart, minDate) * pxPerDay);
            const widthPx = Math.max(2, dayDiff(segEndBound, segStart) * pxPerDay);
            segs.push({
                label: cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
                startPx,
                widthPx,
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }
        return segs;
    }, [minDate, maxDate, pxPerDay]);

    // Day-level ticks (only rendered when zoomed in enough to be legible)
    const dayTicks = useMemo(() => {
        if (pxPerDay < 10) return [];
        const ticks: { date: Date; px: number; isWeekend: boolean; isToday: boolean }[] = [];
        const cursor = new Date(minDate);
        let i = 0;
        while (cursor.getTime() <= maxDate.getTime()) {
            const dow = cursor.getDay();
            ticks.push({
                date: new Date(cursor),
                px: i * pxPerDay,
                isWeekend: dow === 0 || dow === 6,
                isToday: dayDiff(cursor, today) === 0,
            });
            cursor.setDate(cursor.getDate() + 1);
            i++;
        }
        return ticks;
    }, [minDate, maxDate, pxPerDay, today]);

    const weekendBands = useMemo(
        () => dayTicks.filter(t => t.isWeekend).map(t => ({ left: t.px })),
        [dayTicks]
    );

    const scrollToToday = () => {
        const el = ganttScrollRef.current;
        if (!el) return;
        const target = Math.max(0, todayPx - el.clientWidth / 3);
        el.scrollTo({ left: target, behavior: "smooth" });
    };

    // Auto-center on "today" whenever the Gantt view (re)opens or zoom changes
    useEffect(() => {
        if (!open || viewMode !== "gantt") return;
        const raf = requestAnimationFrame(scrollToToday);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, viewMode, zoom, project?.id, loading]);

    const computeDelay = (row: TimelineRow) => {
        const end = toDateOnly(row.endDate);
        if (!end) return { delayDays: 0, earlyDays: 0 };
        if (row.isCompleted) {
            const actual = toDateOnly(row.actualCompletionDate) || end;
            const diff = dayDiff(actual, end);
            return diff > 0 ? { delayDays: diff, earlyDays: 0 } : { delayDays: 0, earlyDays: -diff };
        }
        const diff = dayDiff(today, end);
        return diff > 0 ? { delayDays: diff, earlyDays: 0 } : { delayDays: 0, earlyDays: 0 };
    };

    const barColor = (row: TimelineRow, delayed: boolean) => {
        if (row.level === "project") return "bg-indigo-500";
        // A delay is a delay whether the item is still open (overdue) or was
        // completed after its due date — always render it red so it's visible
        // in the Gantt chart. Previously `!row.isCompleted` suppressed red for
        // anything already marked complete, which hid every late-completion.
        if (delayed) return "bg-red-500";
        if (row.isCompleted) return "bg-emerald-500";
        const s = (row.status || "").toLowerCase();
        if (s.includes("progress")) return "bg-blue-500";
        if (s.includes("hold")) return "bg-orange-400";
        return "bg-slate-400";
    };

    // NOTE: must be fully OPAQUE (no /alpha suffix) — this background is used on the sticky
    // "Hierarchy & Details" column, which needs to fully mask the Gantt bars scrolling behind it.
    const rowBg = (level: TimelineLevel) =>
        level === "project" ? "bg-indigo-50" : level === "keystep" ? "bg-slate-50" : "bg-background";

    const levelLabel = (level: TimelineLevel) =>
        level === "project" ? "Project" : level === "keystep" ? "Key Step" : level === "task" ? "Task" : "Subtask";

    // Kanban grouping (tasks/subtasks/key steps by status, project row excluded)
    const kanbanColumns = useMemo(() => {
        const groups = new Map<string, TimelineRow[]>();
        filteredRows.filter(r => r.level !== "project").forEach(r => {
            const key = (r.status || "Unspecified").trim() || "Unspecified";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(r);
        });
        const keys = Array.from(groups.keys());
        keys.sort((a, b) => {
            const ia = KANBAN_STATUS_ORDER.indexOf(a.toLowerCase());
            const ib = KANBAN_STATUS_ORDER.indexOf(b.toLowerCase());
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
        return keys.map(k => ({
            status: k,
            items: groups.get(k)!.sort((a, b) => {
                const da = toDateOnly(a.endDate)?.getTime() ?? Infinity;
                const db = toDateOnly(b.endDate)?.getTime() ?? Infinity;
                return da - db;
            }),
        }));
    }, [filteredRows]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    "flex flex-col p-0 gap-0 overflow-hidden transition-[width,height,border-radius] duration-150",
                    fullscreen
                        ? "max-w-none w-screen h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 rounded-none sm:rounded-none border-0"
                        : "max-w-[96vw] w-[1500px] h-[88vh]"
                )}
            >
                <DialogHeader className="px-5 py-3 border-b border-muted/40 shrink-0 flex-row items-center justify-between space-y-0">
                    <div>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <CalendarIcon className="h-4 w-4 text-primary" />
                            Project Timeline — {project?.title}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Chronological breakdown of Key Steps, Tasks, and Subtasks with a synchronized Gantt chart.
                        </DialogDescription>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 mr-8 shrink-0"
                        onClick={() => setFullscreen(f => !f)}
                        title={fullscreen ? "Exit full screen" : "Full screen"}
                    >
                        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                    {project?.id && (
                        <div className="mr-8 shrink-0">
                            <ProjectScheduleHistoryDialog projectId={project.id} projectTitle={project?.title} />
                        </div>
                    )}
                </DialogHeader>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading timeline...
                    </div>
                ) : (
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {/* Toolbar: view switch, type filter, search, zoom */}
                        <div className="flex flex-wrap items-center gap-2 px-5 py-2 border-b border-muted/30 bg-muted/10 shrink-0">
                            <ToggleGroup
                                type="single"
                                value={viewMode}
                                onValueChange={(v) => v && setViewMode(v as ViewMode)}
                                className="bg-background border border-muted/40 rounded-md p-0.5"
                            >
                                <ToggleGroupItem value="gantt" className="h-7 px-2.5 text-[11px] gap-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                                    <CalendarRange className="h-3.5 w-3.5" /> Gantt
                                </ToggleGroupItem>
                                <ToggleGroupItem value="list" className="h-7 px-2.5 text-[11px] gap-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                                    <List className="h-3.5 w-3.5" /> List
                                </ToggleGroupItem>
                                <ToggleGroupItem value="kanban" className="h-7 px-2.5 text-[11px] gap-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                                    <LayoutGrid className="h-3.5 w-3.5" /> Kanban
                                </ToggleGroupItem>
                            </ToggleGroup>

                            <div className="h-5 w-px bg-muted/50 mx-0.5" />

                            <ToggleGroup
                                type="single"
                                value={typeFilter}
                                onValueChange={(v) => setTypeFilter((v as TypeFilter) || "all")}
                                className="bg-background border border-muted/40 rounded-md p-0.5"
                            >
                                <ToggleGroupItem value="all" className="h-7 px-2 text-[11px]">All</ToggleGroupItem>
                                <ToggleGroupItem value="keystep" className="h-7 px-2 text-[11px]">Key Steps</ToggleGroupItem>
                                <ToggleGroupItem value="task" className="h-7 px-2 text-[11px]">Tasks</ToggleGroupItem>
                                <ToggleGroupItem value="subtask" className="h-7 px-2 text-[11px]">Subtasks</ToggleGroupItem>
                            </ToggleGroup>

                            <div className="relative">
                                <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search title..."
                                    className="h-7 w-44 pl-7 text-xs"
                                />
                            </div>

                            <div className="flex-1" />

                            {viewMode === "gantt" && (
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={scrollToToday}>
                                        <Target className="h-3 w-3" /> Today
                                    </Button>
                                    <ToggleGroup
                                        type="single"
                                        value={zoom}
                                        onValueChange={(v) => v && setZoom(v as ZoomLevel)}
                                        className="bg-background border border-muted/40 rounded-md p-0.5"
                                    >
                                        {(Object.keys(ZOOM_CONFIG) as ZoomLevel[]).map((z) => (
                                            <ToggleGroupItem key={z} value={z} className="h-7 px-2.5 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                                                {ZOOM_CONFIG[z].label}
                                            </ToggleGroupItem>
                                        ))}
                                    </ToggleGroup>
                                </div>
                            )}
                        </div>

                        {/* Legend */}
                        {viewMode !== "kanban" && (
                            <div className="flex flex-wrap items-center gap-3 px-5 py-2 border-b border-muted/30 text-[10px] text-muted-foreground shrink-0 bg-muted/10">
                                <LegendDot color="bg-indigo-500" label="Project" />
                                <LegendDot color="bg-slate-400" label="Pending" />
                                <LegendDot color="bg-blue-500" label="In Progress" />
                                <LegendDot color="bg-emerald-500" label="Completed" />
                                <LegendDot color="bg-red-500" label="Delayed" />
                                <LegendDot color="bg-orange-400" label="On Hold" />
                                <span className="flex items-center gap-1 ml-2"><span className="w-0.5 h-3 bg-rose-500 inline-block" /> Today</span>
                            </div>
                        )}

                        {/* ================= GANTT VIEW ================= */}
                        {viewMode === "gantt" && (
                            <div ref={ganttScrollRef} className="flex-1 overflow-auto relative">
                                <div style={{ width: 420 + timelineWidthPx }} className="relative min-w-full">
                                    {/* Header: hierarchy label + month scale + day scale */}
                                    <div className="flex sticky top-0 z-20 bg-background border-b border-muted/40">
                                        <div className="w-[420px] shrink-0 sticky left-0 z-30 bg-background px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-r border-muted/30 flex items-end pb-1.5 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]">
                                            Hierarchy & Details
                                        </div>
                                        <div className="shrink-0 relative" style={{ width: timelineWidthPx }}>
                                            <div className="relative h-5 border-b border-muted/20">
                                                {monthSegments.map((seg, i) => (
                                                    <div
                                                        key={i}
                                                        className="absolute top-0 bottom-0 border-l border-muted/30 text-[9px] font-semibold text-muted-foreground pl-1.5 flex items-center whitespace-nowrap overflow-hidden"
                                                        style={{ left: seg.startPx, width: seg.widthPx }}
                                                    >
                                                        {seg.label}
                                                    </div>
                                                ))}
                                            </div>
                                            {dayTicks.length > 0 && (
                                                <div className="relative h-6">
                                                    {dayTicks.map((t, i) => (
                                                        <div
                                                            key={i}
                                                            className={cn(
                                                                "absolute top-0 bottom-0 border-l border-muted/15 flex flex-col items-center justify-center text-[8px] leading-none",
                                                                t.isWeekend && "bg-muted/25",
                                                                t.isToday && "bg-rose-100/70"
                                                            )}
                                                            style={{ left: t.px, width: pxPerDay }}
                                                        >
                                                            {pxPerDay >= 30 && (
                                                                <span className="text-muted-foreground">
                                                                    {t.date.toLocaleDateString("en-US", { weekday: "narrow" })}
                                                                </span>
                                                            )}
                                                            <span className={cn("font-medium", t.isToday && "text-rose-600 font-bold")}>
                                                                {t.date.getDate()}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Body */}
                                    <div className="relative">
                                        {/* Weekend shading, spanning the full body height */}
                                        {weekendBands.length > 0 && (
                                            <div className="absolute top-0 bottom-0 pointer-events-none z-0" style={{ left: 420, width: timelineWidthPx }}>
                                                {weekendBands.map((b, i) => (
                                                    <div key={i} className="absolute top-0 bottom-0 bg-muted/10" style={{ left: b.left, width: pxPerDay }} />
                                                ))}
                                            </div>
                                        )}
                                        {/* Today marker, spanning the full body height */}
                                        <div
                                            className="absolute top-0 bottom-0 border-l-2 border-rose-500/70 z-[5] pointer-events-none"
                                            style={{ left: 420 + todayPx }}
                                        />

                                        {filteredRows.map((row) => {
                                            const { delayDays, earlyDays } = computeDelay(row);
                                            const delayed = delayDays > 0;
                                            const start = toDateOnly(row.startDate);
                                            const end = toDateOnly(row.endDate);
                                            const leftPx = start ? dayDiff(start, minDate) * pxPerDay : 0;
                                            const widthPx = start && end ? Math.max(pxPerDay * 0.5, (dayDiff(end, start) + 1) * pxPerDay) : 0;
                                            const isMilestone = !!(start && end && dayDiff(end, start) === 0);
                                            const plannedDuration = start && end ? dayDiff(end, start) + 1 : null;
                                            const bg = rowBg(row.level);

                                            return (
                                                <div key={row.id} className="flex border-b border-muted/15 group isolate">
                                                    {/* Left: hierarchy + details */}
                                                    <div
                                                        className={cn("w-[420px] shrink-0 sticky left-0 z-20 px-3 py-2 border-r border-muted/30 flex flex-col gap-1 group-hover:brightness-95 transition-[filter] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]", bg)}
                                                        style={{ paddingLeft: `${12 + row.depth * 18}px` }}
                                                    >
                                                        <div className="flex items-center gap-1.5">
                                                            {row.hasChildren ? (
                                                                <button onClick={() => toggleCollapse(row.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                                                                    {collapsed[row.id] ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                                </button>
                                                            ) : (
                                                                <span className="w-3.5 shrink-0" />
                                                            )}
                                                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 uppercase shrink-0 font-bold tracking-wide">
                                                                {levelLabel(row.level)}
                                                            </Badge>
                                                            <span className={cn("text-xs truncate", row.level === "project" ? "font-bold" : row.level === "keystep" ? "font-semibold" : "font-medium")} title={row.title}>
                                                                {row.title}
                                                            </span>
                                                            {isMilestone && <span title="Checkpoint" className="inline-flex shrink-0"><Flag className="h-3 w-3 text-amber-500" /></span>}
                                                        </div>

                                                        {row.level !== "project" && (
                                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground pl-5">
                                                                <span className="flex items-center gap-1"><CalendarIcon className="h-2.5 w-2.5" /> {fmt(row.startDate)} → {fmt(row.endDate)}</span>
                                                                {plannedDuration !== null && <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {plannedDuration}d planned</span>}
                                                                {row.isCompleted && (
                                                                    <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-2.5 w-2.5" /> Done {fmt(row.actualCompletionDate)}</span>
                                                                )}
                                                                {delayed && (
                                                                    <span className="flex items-center gap-1 text-red-600 font-semibold"><AlertTriangle className="h-2.5 w-2.5" /> {delayDays}d delayed</span>
                                                                )}
                                                                {earlyDays > 0 && (
                                                                    <span className="flex items-center gap-1 text-emerald-600 font-semibold">{earlyDays}d early</span>
                                                                )}
                                                                {row.assignees.length > 0 && (
                                                                    <span className="flex items-center gap-1 truncate max-w-[180px]" title={row.assignees.join(", ")}>
                                                                        <Users className="h-2.5 w-2.5" /> {row.assignees.join(", ")}
                                                                    </span>
                                                                )}
                                                                <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5">{row.status}</Badge>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Right: Gantt bar */}
                                                    <div className={cn("relative py-2 px-0 min-h-[34px] group-hover:brightness-95 transition-[filter]", bg)} style={{ width: timelineWidthPx }}>
                                                        {start && end ? (
                                                            isMilestone ? (
                                                                <div
                                                                    className="absolute top-1/2 -translate-y-1/2 z-10"
                                                                    style={{ left: leftPx - 5 }}
                                                                    title={`${row.title}: ${fmt(row.startDate)}`}
                                                                >
                                                                    <div className={cn("w-3 h-3 rotate-45", barColor(row, delayed))} />
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    className="absolute top-1/2 -translate-y-1/2 h-4 rounded z-10 shadow-sm overflow-hidden border border-black/5"
                                                                    style={{ left: leftPx, width: widthPx, minWidth: 6 }}
                                                                    title={`${row.title}\n${fmt(row.startDate)} → ${fmt(row.endDate)}\nStatus: ${row.status}\nProgress: ${row.progress}%${delayed ? `\nDelayed: ${delayDays}d` : ""}`}
                                                                >
                                                                    <div className={cn("h-full opacity-30 absolute inset-0", barColor(row, delayed))} />
                                                                    <div
                                                                        className={cn("h-full relative", barColor(row, delayed))}
                                                                        style={{ width: `${Math.min(100, Math.max(0, row.progress))}%` }}
                                                                    />
                                                                    {delayed && <div className="absolute inset-0 ring-1 ring-red-600/70 rounded pointer-events-none" />}
                                                                </div>
                                                            )
                                                        ) : (
                                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground italic">No dates set</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {filteredRows.length <= 1 && (
                                            <div className="py-10 text-center text-sm text-muted-foreground">
                                                No key steps or tasks match the current filters.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ================= LIST VIEW ================= */}
                        {viewMode === "list" && (
                            <div className="flex-1 overflow-auto">
                                <div className="min-w-[1100px]">
                                    <div className="flex sticky top-0 z-10 bg-background border-b border-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        <div className="flex-[2.2] min-w-[260px] px-3 py-2">Title</div>
                                        <div className="w-24 px-2 py-2 shrink-0">Type</div>
                                        <div className="w-28 px-2 py-2 shrink-0">Status</div>
                                        <div className="w-24 px-2 py-2 shrink-0">Start</div>
                                        <div className="w-24 px-2 py-2 shrink-0">End</div>
                                        <div className="w-20 px-2 py-2 shrink-0">Duration</div>
                                        <div className="w-32 px-2 py-2 shrink-0">Progress</div>
                                        <div className="w-44 px-2 py-2 shrink-0">Assignees</div>
                                        <div className="w-28 px-2 py-2 shrink-0">Delay</div>
                                    </div>

                                    {filteredRows.map((row) => {
                                        const { delayDays, earlyDays } = computeDelay(row);
                                        const delayed = delayDays > 0;
                                        const start = toDateOnly(row.startDate);
                                        const end = toDateOnly(row.endDate);
                                        const plannedDuration = start && end ? dayDiff(end, start) + 1 : null;

                                        return (
                                            <div
                                                key={row.id}
                                                className={cn(
                                                    "flex border-b border-muted/15 hover:brightness-95 items-center text-xs transition-[filter]",
                                                    rowBg(row.level),
                                                    row.level === "project" && "font-semibold"
                                                )}
                                            >
                                                <div className="flex-[2.2] min-w-[260px] px-3 py-2 flex items-center gap-1.5" style={{ paddingLeft: `${12 + row.depth * 18}px` }}>
                                                    {row.hasChildren ? (
                                                        <button onClick={() => toggleCollapse(row.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                                                            {collapsed[row.id] ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                        </button>
                                                    ) : (
                                                        <span className="w-3.5 shrink-0" />
                                                    )}
                                                    <span className="truncate" title={row.title}>{row.title}</span>
                                                    {start && end && dayDiff(end, start) === 0 && <span title="Checkpoint" className="inline-flex shrink-0"><Flag className="h-3 w-3 text-amber-500" /></span>}
                                                </div>
                                                <div className="w-24 px-2 py-2 shrink-0">
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 uppercase font-bold">{levelLabel(row.level)}</Badge>
                                                </div>
                                                <div className="w-28 px-2 py-2 shrink-0">
                                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 truncate max-w-full">{row.status}</Badge>
                                                </div>
                                                <div className="w-24 px-2 py-2 shrink-0 text-muted-foreground">{fmt(row.startDate)}</div>
                                                <div className="w-24 px-2 py-2 shrink-0 text-muted-foreground">{fmt(row.endDate)}</div>
                                                <div className="w-20 px-2 py-2 shrink-0 text-muted-foreground">{plannedDuration !== null ? `${plannedDuration}d` : "—"}</div>
                                                <div className="w-32 px-2 py-2 shrink-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                                                            <div className={cn("h-full", barColor(row, delayed))} style={{ width: `${Math.min(100, Math.max(0, row.progress))}%` }} />
                                                        </div>
                                                        <span className="text-[9px] text-muted-foreground w-7 text-right shrink-0">{row.progress}%</span>
                                                    </div>
                                                </div>
                                                <div className="w-44 px-2 py-2 shrink-0 truncate text-muted-foreground" title={row.assignees.join(", ")}>
                                                    {row.assignees.join(", ") || "—"}
                                                </div>
                                                <div className="w-28 px-2 py-2 shrink-0">
                                                    {delayed ? (
                                                        <span className="text-red-600 font-semibold flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" />{delayDays}d late</span>
                                                    ) : earlyDays > 0 ? (
                                                        <span className="text-emerald-600 font-semibold">{earlyDays}d early</span>
                                                    ) : (
                                                        <span className="text-muted-foreground">On track</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {filteredRows.length <= 1 && (
                                        <div className="py-10 text-center text-sm text-muted-foreground">
                                            No key steps or tasks match the current filters.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ================= KANBAN VIEW ================= */}
                        {viewMode === "kanban" && (
                            <div className="flex-1 overflow-auto px-4 py-3">
                                <div className="flex gap-3 items-start h-full" style={{ minWidth: Math.max(600, kanbanColumns.length * 264) }}>
                                    {kanbanColumns.map((col) => (
                                        <div key={col.status} className="w-64 shrink-0 flex flex-col bg-muted/10 rounded-lg border border-muted/30 max-h-full">
                                            <div className="px-3 py-2 border-b border-muted/30 flex items-center justify-between shrink-0">
                                                <span className="text-xs font-bold truncate" title={col.status}>{col.status}</span>
                                                <Badge variant="secondary" className="text-[10px] h-5 shrink-0 ml-1">{col.items.length}</Badge>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                                {col.items.map((item) => {
                                                    const { delayDays } = computeDelay(item);
                                                    const delayed = delayDays > 0;
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className={cn(
                                                                "rounded-md border bg-background p-2.5 shadow-sm hover:shadow-md transition-shadow",
                                                                delayed ? "border-red-300" : "border-muted/40"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-1 mb-1">
                                                                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 uppercase font-bold">{levelLabel(item.level)}</Badge>
                                                                {delayed && <span title={`${delayDays}d delayed`} className="inline-flex ml-auto"><AlertTriangle className="h-3 w-3 text-red-500" /></span>}
                                                            </div>
                                                            <div className="text-xs font-medium leading-snug mb-1.5" title={item.title}>{item.title}</div>
                                                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-1.5">
                                                                <CalendarIcon className="h-2.5 w-2.5 shrink-0" /> {fmt(item.startDate)} → {fmt(item.endDate)}
                                                            </div>
                                                            <div className="h-1 rounded-full bg-muted overflow-hidden mb-1.5">
                                                                <div className={cn("h-full", barColor(item, delayed))} style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} />
                                                            </div>
                                                            {item.assignees.length > 0 && (
                                                                <div className="text-[9px] text-muted-foreground truncate flex items-center gap-1" title={item.assignees.join(", ")}>
                                                                    <Users className="h-2.5 w-2.5 shrink-0" />{item.assignees.join(", ")}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {col.items.length === 0 && (
                                                    <div className="text-[10px] text-muted-foreground text-center py-4">No items</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {kanbanColumns.length === 0 && (
                                        <div className="py-10 text-center text-sm text-muted-foreground w-full">
                                            No items match the current filters.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-1">
            <span className={cn("w-2.5 h-2.5 rounded-sm inline-block", color)} />
            {label}
        </span>
    );
}