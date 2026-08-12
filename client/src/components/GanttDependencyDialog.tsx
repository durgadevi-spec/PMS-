import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    Maximize2,
    Minimize2,
    Loader2,
    Link2,
    Trash2,
    Target,
    Calendar as CalendarIcon,
    Layers,
    Search,
    X,
    ChevronDown,
} from "lucide-react";
import { apiFetch, invalidateCache } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ============================================================
   Types
============================================================ */
interface TaskItem {
    id: string;
    projectId?: string | number;
    taskName: string;
    startDate?: string | null;
    endDate?: string | null;
    status: string;
    progress?: number;
    keyStepId?: string;
}

interface DependencyEdge {
    id: string;
    projectId: string;
    predecessorId: string;
    successorId: string;
    type: string; // FS, SS, FF, SF
    lagDays: number;
}

interface KeyStepOption {
    id: string;
    title: string;
}

interface GanttDependencyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string;
    projectTitle?: string;
    tasks: TaskItem[];
    employees?: any[];
    keySteps?: KeyStepOption[];
    onDependencyChange?: () => void;
}

/* ============================================================
   Date helpers
============================================================ */
const toDateOnly = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val === "string") {
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
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/* ============================================================
   Constants
============================================================ */
const ROW_HEIGHT = 40;
const NAME_COL_WIDTH = 300;
const PX_PER_DAY = 28;
const BAR_HEIGHT = 22;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const HANDLE_RADIUS = 6;

const STATUS_COLORS: Record<string, { bar: string; bg: string }> = {
    completed: { bar: "#22c55e", bg: "#dcfce7" },
    "in progress": { bar: "#3b82f6", bg: "#dbeafe" },
    "on hold": { bar: "#f59e0b", bg: "#fef3c7" },
    delayed: { bar: "#ef4444", bg: "#fee2e2" },
    pending: { bar: "#94a3b8", bg: "#f1f5f9" },
    cancelled: { bar: "#6b7280", bg: "#f3f4f6" },
};

function getBarColors(status: string) {
    const s = (status || "").toLowerCase();
    for (const [key, colors] of Object.entries(STATUS_COLORS)) {
        if (s.includes(key)) return colors;
    }
    return STATUS_COLORS.pending;
}

/* ============================================================
   SVG Arrow path builder (right-angle connector with arrowhead)
============================================================ */
function buildArrowPath(
    x1: number, y1: number,
    x2: number, y2: number,
): string {
    const midX = x1 + (x2 - x1) / 2;
    // Right-angle connector: go right, then turn, then arrive
    if (x2 > x1 + 20) {
        return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
    }
    // If successor is to the left or too close, route around
    const detour = 15;
    const yDir = y2 > y1 ? 1 : -1;
    const midY = y1 + yDir * Math.max(Math.abs(y2 - y1) / 2, ROW_HEIGHT / 2);
    return `M ${x1} ${y1} H ${x1 + detour} V ${midY} H ${x2 - detour} V ${y2} H ${x2}`;
}

/* ============================================================
   Main Component
============================================================ */
export default function GanttDependencyDialog({
    open,
    onOpenChange,
    projectId,
    projectTitle,
    tasks,
    employees = [],
    keySteps = [],
    onDependencyChange,
}: GanttDependencyDialogProps) {
    const { toast } = useToast();
    const [fullscreen, setFullscreen] = useState(false);
    const [dependencies, setDependencies] = useState<DependencyEdge[]>([]);
    const [loading, setLoading] = useState(false);
    const [hoveredDep, setHoveredDep] = useState<string | null>(null);

    // Key Step filter state
    const [selectedKsFilter, setSelectedKsFilter] = useState<string>("all");
    const [ksDropdownOpen, setKsDropdownOpen] = useState(false);
    const [ksSearch, setKsSearch] = useState("");
    const ksDropdownRef = useRef<HTMLDivElement>(null);
    const ksSearchInputRef = useRef<HTMLInputElement>(null);

    // Close key step dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ksDropdownRef.current && !ksDropdownRef.current.contains(e.target as Node)) {
                setKsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Drag state
    const [dragging, setDragging] = useState(false);
    const [dragFrom, setDragFrom] = useState<string | null>(null); // task id
    const [dragMousePos, setDragMousePos] = useState<{ x: number; y: number } | null>(null);
    const [dragOverTask, setDragOverTask] = useState<string | null>(null);

    // Link-type selection (shown right after a drop, before the dependency is created)
    const [pendingLink, setPendingLink] = useState<{ predecessorId: string; successorId: string } | null>(null);
    const [linkMode, setLinkMode] = useState<"standard" | "continuous">("standard");
    const [creatingDep, setCreatingDep] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const ganttAreaRef = useRef<HTMLDivElement>(null);
    const ganttBodyRef = useRef<HTMLDivElement>(null);

    // Filter tasks to those with valid dates, then by selected Key Step
    const validTasks = useMemo(() => {
        return tasks
            .filter(t => t.startDate && t.endDate && toDateOnly(t.startDate) && toDateOnly(t.endDate))
            .filter(t => {
                if (projectId && projectId !== "all") {
                    return String(t.projectId) === String(projectId);
                }
                return true;
            })
            .filter(t => {
                if (selectedKsFilter === "all") return true;
                if (selectedKsFilter === "none") return !t.keyStepId;
                return String(t.keyStepId) === selectedKsFilter;
            })
            .sort((a, b) => {
                const da = toDateOnly(a.startDate)!.getTime();
                const db = toDateOnly(b.startDate)!.getTime();
                return da - db;
            });
    }, [tasks, selectedKsFilter, projectId]);

    // Project-specific key steps (filter by tasks present in data)
    const projectKeySteps = useMemo(() => {
        const filteredTasks = projectId && projectId !== "all"
            ? tasks.filter(t => String(t.projectId) === String(projectId))
            : tasks;
        const ksIdsInTasks = new Set(filteredTasks.map(t => t.keyStepId).filter(Boolean));
        return keySteps.filter(ks => ksIdsInTasks.has(ks.id));
    }, [keySteps, tasks, projectId]);

    const filteredKsOptions = projectKeySteps.filter(ks =>
        ks.title.toLowerCase().includes(ksSearch.toLowerCase())
    );

    const activeKs = selectedKsFilter === "all" || selectedKsFilter === "none"
        ? null
        : projectKeySteps.find(ks => ks.id === selectedKsFilter);

    // Compute date bounds
    const { minDate, maxDate, totalDays } = useMemo(() => {
        if (validTasks.length === 0) {
            const now = new Date();
            return { minDate: now, maxDate: new Date(now.getTime() + 30 * 86400000), totalDays: 30 };
        }
        const allDates: Date[] = [];
        validTasks.forEach(t => {
            const s = toDateOnly(t.startDate);
            const e = toDateOnly(t.endDate);
            if (s) allDates.push(s);
            if (e) allDates.push(e);
        });
        let minD = new Date(Math.min(...allDates.map(d => d.getTime())));
        let maxD = new Date(Math.max(...allDates.map(d => d.getTime())));
        // Pad
        minD = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate() - 2);
        maxD = new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate() + 3);
        const totalD = Math.max(7, dayDiff(maxD, minD));
        return { minDate: minD, maxDate: maxD, totalDays: totalD };
    }, [validTasks]);

    const timelineWidth = totalDays * PX_PER_DAY;
    const today = toDateOnly(new Date())!;
    const todayPx = dayDiff(today, minDate) * PX_PER_DAY;

    // Task row index map (taskId -> row index)
    const taskRowMap = useMemo(() => {
        const map = new Map<string, number>();
        validTasks.forEach((t, i) => map.set(t.id, i));
        return map;
    }, [validTasks]);

    // Bar position calculator
    const getBarRect = useCallback((task: TaskItem) => {
        const rowIdx = taskRowMap.get(task.id);
        if (rowIdx === undefined) return null;
        const start = toDateOnly(task.startDate);
        const end = toDateOnly(task.endDate);
        if (!start || !end) return null;
        const x = dayDiff(start, minDate) * PX_PER_DAY;
        const w = Math.max(PX_PER_DAY * 0.5, (dayDiff(end, start) + 1) * PX_PER_DAY);
        const y = rowIdx * ROW_HEIGHT + BAR_Y_OFFSET;
        return { x, y, w, h: BAR_HEIGHT };
    }, [taskRowMap, minDate]);

    // Fetch dependencies
    const loadDeps = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            // Add cache-busting timestamp to prevent browser from caching the GET request
            const timestamp = Date.now();
            const res = await apiFetch(`/api/projects/${projectId}/dependencies?_t=${timestamp}`, { bypassCache: true, cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setDependencies(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Failed to load project dependencies", err);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (open && projectId) loadDeps();
    }, [open, projectId, loadDeps]);

    // Handle dependency deletion
    const handleDeleteDep = async (depId: string) => {
        // Optimistic UI update: instantly hide the line
        setDependencies(prev => prev.filter(d => d.id !== depId));
        setHoveredDep(null);

        try {
            const res = await apiFetch(`/api/task-dependencies/${depId}`, {
                method: "DELETE"
            });
            if (res.ok) {
                toast({ title: "Dependency removed" });
                invalidateCache(`/api/projects/${projectId}/dependencies`);
                await loadDeps();
                onDependencyChange?.();
            } else {
                toast({ variant: "destructive", title: "Failed to remove dependency" });
                // Revert optimistic update on failure
                await loadDeps();
            }
        } catch (err) {
            console.error("Delete dependency error:", err);
            toast({ variant: "destructive", title: "Error removing dependency" });
            // Revert optimistic update on failure
            await loadDeps();
        }
    };

    // Reset state on close
    useEffect(() => {
        if (!open) {
            setFullscreen(false);
            setDragging(false);
            setDragFrom(null);
            setDragMousePos(null);
            setDragOverTask(null);
            setHoveredDep(null);
            setPendingLink(null);
            setLinkMode("standard");
            setCreatingDep(false);
        }
    }, [open]);

    // Auto-scroll to today
    useEffect(() => {
        if (!open || validTasks.length === 0) return;
        const raf = requestAnimationFrame(() => {
            const el = ganttAreaRef.current;
            if (!el) return;
            const target = Math.max(0, NAME_COL_WIDTH + todayPx - el.clientWidth / 2);
            el.scrollTo({ left: target, behavior: "smooth" });
        });
        return () => cancelAnimationFrame(raf);
    }, [open, todayPx, validTasks.length]);

    // Month header segments
    const monthSegments = useMemo(() => {
        const segs: { label: string; startPx: number; widthPx: number }[] = [];
        const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        while (cursor.getTime() <= maxDate.getTime()) {
            const segStart = cursor.getTime() < minDate.getTime() ? minDate : new Date(cursor);
            const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            const segEnd = nextMonth.getTime() > maxDate.getTime() ? new Date(maxDate.getTime() + 86400000) : nextMonth;
            const startPx = Math.max(0, dayDiff(segStart, minDate) * PX_PER_DAY);
            const widthPx = Math.max(2, dayDiff(segEnd, segStart) * PX_PER_DAY);
            segs.push({
                label: cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
                startPx,
                widthPx,
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }
        return segs;
    }, [minDate, maxDate]);

    // Day ticks
    const dayTicks = useMemo(() => {
        const ticks: { date: Date; px: number; isWeekend: boolean; isToday: boolean }[] = [];
        const cursor = new Date(minDate);
        let i = 0;
        while (cursor.getTime() <= maxDate.getTime()) {
            const dow = cursor.getDay();
            ticks.push({
                date: new Date(cursor),
                px: i * PX_PER_DAY,
                isWeekend: dow === 0 || dow === 6,
                isToday: dayDiff(cursor, today) === 0,
            });
            cursor.setDate(cursor.getDate() + 1);
            i++;
        }
        return ticks;
    }, [minDate, maxDate, today]);

    /* ----------------------------------------------------------
       Drag-to-link handlers
    ---------------------------------------------------------- */
    const handleDragStart = useCallback((taskId: string, e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Capture pointer to track dragging outside the container
        e.currentTarget.setPointerCapture(e.pointerId);

        setDragging(true);
        setDragFrom(taskId);
        setDragOverTask(null);

        const bodyEl = ganttBodyRef.current;
        if (bodyEl) {
            const rect = bodyEl.getBoundingClientRect();
            setDragMousePos({ x: e.clientX - rect.left - NAME_COL_WIDTH, y: e.clientY - rect.top });
        }
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging || !ganttBodyRef.current) return;
        const rect = ganttBodyRef.current.getBoundingClientRect();

        const rawX = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setDragMousePos({ x: rawX - NAME_COL_WIDTH, y });

        // Determine which task row we're over
        const rowIdx = Math.floor(y / ROW_HEIGHT);
        if (rowIdx >= 0 && rowIdx < validTasks.length) {
            const overTask = validTasks[rowIdx];
            if (overTask.id !== dragFrom) {
                setDragOverTask(overTask.id);
            } else {
                setDragOverTask(null);
            }
        } else {
            setDragOverTask(null);
        }
    }, [dragging, dragFrom, validTasks]);

    const handlePointerUp = useCallback(async () => {
        if (!dragging || !dragFrom) {
            setDragging(false);
            setDragFrom(null);
            setDragMousePos(null);
            setDragOverTask(null);
            return;
        }

        const targetId = dragOverTask;
        setDragging(false);
        setDragFrom(null);
        setDragMousePos(null);
        setDragOverTask(null);

        if (!targetId || targetId === dragFrom) return;

        // Instead of creating immediately, ask which kind of dependency to use.
        setLinkMode("standard");
        setPendingLink({ predecessorId: dragFrom, successorId: targetId });
    }, [dragging, dragFrom, dragOverTask]);

    // Actually create the dependency once the user confirms the link type
    // in the picker dialog opened by handlePointerUp above.
    const confirmCreateDependency = useCallback(async () => {
        if (!pendingLink) return;
        setCreatingDep(true);
        try {
            const res = await apiFetch("/api/task-dependencies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId,
                    predecessorId: pendingLink.predecessorId,
                    successorId: pendingLink.successorId,
                    type: "FS",
                    // "standard" keeps today's existing behavior (successor starts the
                    // day after the predecessor finishes). "continuous" is the new
                    // dependency type: the predecessor's end date becomes the
                    // successor's start date exactly, with everything else unchanged.
                    lagDays: linkMode === "continuous" ? -1 : 0,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({
                    variant: "destructive",
                    title: "Cannot create dependency",
                    description: body.message || "Failed to create dependency",
                });
                return;
            }
            toast({
                title: "Dependency created",
                description:
                    linkMode === "continuous"
                        ? "Continuous link added — the end date will always match the start date."
                        : "Finish-to-Start (FS) link added.",
            });
            invalidateCache(`/api/projects/${projectId}/dependencies`);
            await loadDeps();
            onDependencyChange?.();
            setPendingLink(null);
        } catch (err) {
            toast({ variant: "destructive", title: "Error", description: "Failed to create dependency" });
        } finally {
            setCreatingDep(false);
        }
    }, [pendingLink, linkMode, projectId, toast, loadDeps, onDependencyChange]);


    // Scroll to today
    const scrollToToday = () => {
        const el = scrollRef.current;
        if (!el) return;
        const target = Math.max(0, todayPx - el.clientWidth / 3);
        el.scrollTo({ left: target, behavior: "smooth" });
    };

    const bodyHeight = validTasks.length * ROW_HEIGHT;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className={cn(
                        "flex flex-col p-0 gap-0 overflow-hidden transition-[width,height,border-radius] duration-150",
                        fullscreen
                            ? "max-w-none w-screen h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 rounded-none sm:rounded-none border-0"
                            : "max-w-[96vw] w-[1400px] h-[85vh]"
                    )}
                >
                    <DialogHeader className="px-5 py-3 border-b border-muted/40 shrink-0 flex-row items-center justify-between space-y-0">
                        <div>
                            <DialogTitle className="flex items-center gap-2 text-base">
                                <Link2 className="h-4 w-4 text-primary" />
                                Dependency Manager{projectTitle ? ` — ${projectTitle}` : ""}
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                                Drag from the <span className="font-semibold text-primary">●</span> handle on the right of a task bar to another task to create a dependency (you'll be asked to pick the type). Click an arrow to delete it.
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] gap-1"
                                onClick={scrollToToday}
                            >
                                <Target className="h-3 w-3" /> Today
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 mr-8 shrink-0"
                                onClick={() => setFullscreen(f => !f)}
                                title={fullscreen ? "Exit full screen" : "Full screen"}
                            >
                                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                            </Button>
                        </div>
                    </DialogHeader>

                    {loading ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading dependencies...
                        </div>
                    ) : validTasks.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm flex-col gap-2">
                            <CalendarIcon className="h-8 w-8 opacity-40" />
                            <p>No tasks with valid dates in this project.</p>
                            <p className="text-xs">Set start and end dates on tasks to use the dependency manager.</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-hidden flex flex-col">
                            {/* Legend + Key Step Filter bar */}
                            <div className="flex flex-wrap items-center gap-4 px-5 py-2 border-b border-muted/30 text-[10px] text-muted-foreground shrink-0 bg-muted/10">
                                {/* Color legend items */}
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-sm" style={{ background: "#3b82f6" }} /> In Progress
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-sm" style={{ background: "#22c55e" }} /> Completed
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-sm" style={{ background: "#94a3b8" }} /> Pending
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-sm" style={{ background: "#ef4444" }} /> Delayed
                                </span>
                                <span className="flex items-center gap-1.5 ml-4">
                                    <span className="w-0.5 h-3 bg-rose-500 inline-block" /> Today
                                </span>
                                <span className="flex items-center gap-1.5 ml-4">
                                    <svg width="28" height="12"><path d="M 0 6 H 20" stroke="#7c3aed" strokeWidth="2" fill="none" /><polygon points="20,2 28,6 20,10" fill="#7c3aed" /></svg>
                                    Dependency
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full border-2 border-primary bg-background inline-block" />
                                    Drag handle
                                </span>

                                {/* Key Step filter — only shown when there are key steps */}
                                {projectKeySteps.length > 0 && (
                                    <div ref={ksDropdownRef} className="relative ml-auto flex items-center gap-2">
                                        <Layers className="h-3 w-3 text-indigo-500 shrink-0" />
                                        <span className="font-medium text-[10px] text-slate-500 whitespace-nowrap">Key Step:</span>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setKsDropdownOpen(o => !o);
                                                    if (!ksDropdownOpen) setTimeout(() => ksSearchInputRef.current?.focus(), 50);
                                                }}
                                                className={cn(
                                                    "flex items-center gap-1.5 h-6 px-2 rounded-md border text-[11px] bg-white transition-colors",
                                                    "hover:border-indigo-400 hover:bg-indigo-50",
                                                    ksDropdownOpen ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300" : "border-slate-200",
                                                    selectedKsFilter !== "all" && "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium"
                                                )}
                                            >
                                                <span className="max-w-[160px] truncate">
                                                    {selectedKsFilter === "all"
                                                        ? "All Key Steps"
                                                        : selectedKsFilter === "none"
                                                        ? "No Key Step"
                                                        : (activeKs?.title ?? "Key Step")}
                                                </span>
                                                {selectedKsFilter !== "all" && (
                                                    <X
                                                        className="h-2.5 w-2.5 text-indigo-400 hover:text-indigo-700 cursor-pointer shrink-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedKsFilter("all");
                                                            setKsDropdownOpen(false);
                                                        }}
                                                    />
                                                )}
                                                <ChevronDown className={cn("h-2.5 w-2.5 text-slate-400 shrink-0 transition-transform", ksDropdownOpen && "rotate-180")} />
                                            </button>

                                            {ksDropdownOpen && (
                                                <div className="absolute right-0 top-full mt-1 z-[9999] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden" style={{ minWidth: 220 }}>
                                                    {/* Search */}
                                                    <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-slate-100">
                                                        <Search className="h-3 w-3 text-slate-400 shrink-0" />
                                                        <input
                                                            ref={ksSearchInputRef}
                                                            type="text"
                                                            value={ksSearch}
                                                            onChange={e => setKsSearch(e.target.value)}
                                                            placeholder="Search key steps..."
                                                            className="flex-1 text-[11px] bg-transparent outline-none placeholder:text-slate-400"
                                                        />
                                                        {ksSearch && (
                                                            <X
                                                                className="h-2.5 w-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                                                                onClick={() => setKsSearch("")}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="max-h-52 overflow-y-auto py-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => { setSelectedKsFilter("all"); setKsDropdownOpen(false); setKsSearch(""); }}
                                                            className={cn("w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-50 transition-colors flex items-center gap-2", selectedKsFilter === "all" && "bg-indigo-50 text-indigo-700 font-semibold")}
                                                        >
                                                            <Layers className="h-3 w-3 opacity-50" /> All Key Steps
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setSelectedKsFilter("none"); setKsDropdownOpen(false); setKsSearch(""); }}
                                                            className={cn("w-full text-left px-3 py-1.5 text-[11px] italic text-slate-500 hover:bg-slate-50 transition-colors", selectedKsFilter === "none" && "bg-indigo-50 text-indigo-700 font-semibold not-italic")}
                                                        >
                                                            No Key Step
                                                        </button>
                                                        {filteredKsOptions.length === 0 && ksSearch && (
                                                            <p className="px-3 py-2 text-[11px] text-muted-foreground">No matches for "{ksSearch}"</p>
                                                        )}
                                                        {filteredKsOptions.map(ks => (
                                                            <button
                                                                key={ks.id}
                                                                type="button"
                                                                onClick={() => { setSelectedKsFilter(ks.id); setKsDropdownOpen(false); setKsSearch(""); }}
                                                                className={cn(
                                                                    "w-full text-left px-3 py-1.5 text-[11px] hover:bg-indigo-50 hover:text-indigo-700 transition-colors truncate",
                                                                    selectedKsFilter === ks.id && "bg-indigo-50 text-indigo-700 font-semibold"
                                                                )}
                                                            >
                                                                {ks.title}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {/* Footer */}
                                                    <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50">
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {validTasks.length} task{validTasks.length !== 1 ? "s" : ""} shown
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Gantt area */}
                            <div
                                ref={ganttAreaRef}
                                className="flex-1 overflow-auto relative select-none"
                                style={{ cursor: dragging ? "grabbing" : "default" }}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={() => {
                                    if (dragging) {
                                        setDragging(false);
                                        setDragFrom(null);
                                        setDragMousePos(null);
                                        setDragOverTask(null);
                                    }
                                }}
                            >
                                <div style={{ width: NAME_COL_WIDTH + timelineWidth, minHeight: bodyHeight + 60 }} className="relative">
                                    {/* ---- HEADER ---- */}
                                    <div className="flex sticky top-0 z-20 bg-background border-b border-muted/40">
                                        {/* Name column header */}
                                        <div
                                            className="shrink-0 sticky left-0 z-30 bg-background px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-r border-muted/30 flex items-end pb-1.5 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]"
                                            style={{ width: NAME_COL_WIDTH }}
                                        >
                                            Task Name
                                        </div>
                                        {/* Timeline header */}
                                        <div className="shrink-0 relative" style={{ width: timelineWidth }}>
                                            {/* Month row */}
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
                                            {/* Day row */}
                                            <div className="relative h-5">
                                                {dayTicks.map((t, i) => (
                                                    <div
                                                        key={i}
                                                        className={cn(
                                                            "absolute top-0 bottom-0 border-l border-muted/15 flex items-center justify-center text-[8px] leading-none font-medium",
                                                            t.isWeekend && "bg-muted/25",
                                                            t.isToday && "bg-rose-100/70 text-rose-600 font-bold"
                                                        )}
                                                        style={{ left: t.px, width: PX_PER_DAY }}
                                                    >
                                                        {t.date.getDate()}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ---- BODY ---- */}
                                    <div ref={ganttBodyRef} className="relative" style={{ height: bodyHeight }}>
                                        {/* Weekend shading */}
                                        <div className="absolute top-0 bottom-0 pointer-events-none z-0" style={{ left: NAME_COL_WIDTH, width: timelineWidth }}>
                                            {dayTicks.filter(t => t.isWeekend).map((t, i) => (
                                                <div key={i} className="absolute top-0 bottom-0 bg-muted/10" style={{ left: t.px, width: PX_PER_DAY }} />
                                            ))}
                                        </div>

                                        {/* Today marker */}
                                        <div
                                            className="absolute top-0 bottom-0 border-l-2 border-rose-500/70 z-[5] pointer-events-none"
                                            style={{ left: NAME_COL_WIDTH + todayPx }}
                                        />

                                        {/* Task rows */}
                                        {validTasks.map((task, idx) => {
                                            const bar = getBarRect(task);
                                            const colors = getBarColors(task.status);
                                            const isHighlighted = dragOverTask === task.id;
                                            return (
                                                <div
                                                    key={task.id}
                                                    className={cn(
                                                        "flex absolute w-full border-b border-muted/15",
                                                        isHighlighted && "bg-primary/5"
                                                    )}
                                                    style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}
                                                >
                                                    {/* Name column */}
                                                    <div
                                                        className="shrink-0 sticky left-0 z-10 bg-background border-r border-muted/30 px-3 flex items-center gap-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]"
                                                        style={{ width: NAME_COL_WIDTH }}
                                                    >
                                                        <span className="text-xs truncate font-medium" title={task.taskName}>
                                                            {task.taskName}
                                                        </span>
                                                        <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 shrink-0">
                                                            {task.status}
                                                        </Badge>
                                                    </div>

                                                    {/* Bar area */}
                                                    <div className="relative" style={{ width: timelineWidth }}>
                                                        {bar && (
                                                            <>
                                                                {/* Bar background (faded) */}
                                                                <div
                                                                    className="absolute rounded shadow-sm border border-black/5 overflow-hidden"
                                                                    style={{
                                                                        left: bar.x,
                                                                        top: BAR_Y_OFFSET,
                                                                        width: bar.w,
                                                                        height: BAR_HEIGHT,
                                                                        background: colors.bg,
                                                                    }}
                                                                    title={`${task.taskName}\n${fmt(task.startDate)} → ${fmt(task.endDate)}\nStatus: ${task.status}\nProgress: ${task.progress || 0}%`}
                                                                >
                                                                    {/* Progress fill */}
                                                                    <div
                                                                        style={{
                                                                            width: `${Math.min(100, Math.max(0, task.progress || 0))}%`,
                                                                            height: "100%",
                                                                            background: colors.bar,
                                                                            opacity: 0.7,
                                                                        }}
                                                                    />
                                                                </div>

                                                                {/* Drag handle (right edge circle) */}
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <circle
                                                                            r={1}
                                                                            style={{ display: "none" }}
                                                                        />
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top" className="text-[10px]">
                                                                        Drag to create dependency
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                                <div
                                                                    className={cn(
                                                                        "absolute rounded-full border-2 border-primary bg-background cursor-grab z-10 transition-transform hover:scale-125",
                                                                        dragging && dragFrom === task.id && "scale-125 ring-2 ring-primary/30"
                                                                    )}
                                                                    style={{
                                                                        left: bar.x + bar.w - HANDLE_RADIUS,
                                                                        top: BAR_Y_OFFSET + BAR_HEIGHT / 2 - HANDLE_RADIUS,
                                                                        width: HANDLE_RADIUS * 2,
                                                                        height: HANDLE_RADIUS * 2,
                                                                    }}
                                                                    title="Drag to create dependency"
                                                                    onPointerDown={(e) => handleDragStart(task.id, e)}
                                                                />
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* ---- SVG OVERLAY for dependency arrows ---- */}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="absolute top-0 left-0 pointer-events-none z-[6]"
                                            style={{ width: NAME_COL_WIDTH + timelineWidth, height: bodyHeight, overflow: 'visible' }}
                                        >
                                            {dependencies.map(dep => {
                                                const predTask = validTasks.find(t => String(t.id) === String(dep.predecessorId));
                                                const succTask = validTasks.find(t => String(t.id) === String(dep.successorId));

                                                // Fallback console log for debugging missing tasks
                                                if (!predTask || !succTask) {
                                                    console.warn("Dependency task not found in validTasks:", dep);
                                                    return null;
                                                }

                                                const predBar = getBarRect(predTask);
                                                const succBar = getBarRect(succTask);
                                                if (!predBar || !succBar) return null;

                                                // FS: predecessor finish (right) -> successor start (left)
                                                const x1 = NAME_COL_WIDTH + predBar.x + predBar.w;
                                                const y1 = predBar.y + BAR_HEIGHT / 2;
                                                const x2 = NAME_COL_WIDTH + succBar.x;
                                                const y2 = succBar.y + BAR_HEIGHT / 2;

                                                const isHovered = hoveredDep === dep.id;
                                                const pathD = buildArrowPath(x1, y1, x2, y2);

                                                return (
                                                    <g key={dep.id}>
                                                        {/* Invisible wider hit area for clicking */}
                                                        <path
                                                            d={pathD}
                                                            stroke="transparent"
                                                            strokeWidth={14}
                                                            fill="none"
                                                            className="pointer-events-auto cursor-pointer"
                                                            onPointerEnter={() => setHoveredDep(dep.id)}
                                                            onPointerLeave={() => setHoveredDep(null)}
                                                            onClick={() => handleDeleteDep(dep.id)}
                                                        />
                                                        {/* Visible line */}
                                                        <path
                                                            d={pathD}
                                                            stroke={isHovered ? "#ef4444" : "#7c3aed"}
                                                            strokeWidth={isHovered ? 3 : 2}
                                                            fill="none"
                                                            strokeDasharray={isHovered ? "6 3" : "none"}
                                                            className="transition-all duration-150"
                                                        />
                                                        {/* Arrowhead */}
                                                        <polygon
                                                            points={`${x2},${y2 - 4} ${x2 + 8},${y2} ${x2},${y2 + 4}`}
                                                            fill={isHovered ? "#ef4444" : "#7c3aed"}
                                                            className="transition-all duration-150"
                                                        />
                                                        {/* Delete icon on hover */}
                                                        {isHovered && (
                                                            <g
                                                                className="pointer-events-auto cursor-pointer"
                                                                onClick={() => handleDeleteDep(dep.id)}
                                                            >
                                                                <circle
                                                                    cx={(x1 + x2) / 2}
                                                                    cy={(y1 + y2) / 2}
                                                                    r={10}
                                                                    fill="#ef4444"
                                                                />
                                                                <text
                                                                    x={(x1 + x2) / 2}
                                                                    y={(y1 + y2) / 2}
                                                                    textAnchor="middle"
                                                                    dominantBaseline="central"
                                                                    fill="white"
                                                                    fontSize="11"
                                                                    fontWeight="bold"
                                                                >
                                                                    ×
                                                                </text>
                                                            </g>
                                                        )}
                                                        {/* Type label */}
                                                        <text
                                                            x={(x1 + x2) / 2 + (isHovered ? 16 : 0)}
                                                            y={(y1 + y2) / 2 - 8}
                                                            textAnchor="middle"
                                                            fill={isHovered ? "#ef4444" : "#7c3aed"}
                                                            fontSize="9"
                                                            fontWeight="600"
                                                            className="pointer-events-none"
                                                        >
                                                            {dep.type === "FS" && dep.lagDays === -1 ? "Continuous" : dep.type}
                                                        </text>
                                                    </g>
                                                );
                                            })}

                                            {/* Temporary drag line */}
                                            {dragging && dragFrom && dragMousePos && (() => {
                                                const fromTask = validTasks.find(t => t.id === dragFrom);
                                                if (!fromTask) return null;
                                                const fromBar = getBarRect(fromTask);
                                                if (!fromBar) return null;
                                                const x1 = NAME_COL_WIDTH + fromBar.x + fromBar.w;
                                                const y1 = fromBar.y + BAR_HEIGHT / 2;
                                                const x2 = NAME_COL_WIDTH + dragMousePos.x;
                                                const y2 = dragMousePos.y;
                                                return (
                                                    <line
                                                        x1={x1}
                                                        y1={y1}
                                                        x2={x2}
                                                        y2={y2}
                                                        stroke={dragOverTask ? "#22c55e" : "#7c3aed"}
                                                        strokeWidth={2}
                                                        strokeDasharray="6 4"
                                                        className="pointer-events-none"
                                                    />
                                                );
                                            })()}
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Link-type picker — shown right after dragging one task onto another,
            so the user can choose how the two tasks should stay in sync. */}
            <Dialog open={!!pendingLink} onOpenChange={(o) => !o && !creatingDep && setPendingLink(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <Link2 className="h-4 w-4 text-primary" />
                            Choose Dependency Type
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            {(() => {
                                const predName = tasks.find(t => t.id === pendingLink?.predecessorId)?.taskName || "Task 1";
                                const succName = tasks.find(t => t.id === pendingLink?.successorId)?.taskName || "Task 2";
                                return `Linking "${predName}" → "${succName}". Everything else about both tasks stays the same.`;
                            })()}
                        </DialogDescription>
                    </DialogHeader>

                    <RadioGroup value={linkMode} onValueChange={(v) => setLinkMode(v as "standard" | "continuous")} className="space-y-3 py-1">
                        <div className="flex items-start space-x-2 border rounded-md p-3">
                            <RadioGroupItem value="standard" id="link-standard" className="mt-0.5" />
                            <Label htmlFor="link-standard" className="font-normal cursor-pointer">
                                <div className="font-medium text-sm">Standard (existing)</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    Task 2 starts the day after Task 1 finishes.
                                </div>
                            </Label>
                        </div>
                        <div className="flex items-start space-x-2 border rounded-md p-3">
                            <RadioGroupItem value="continuous" id="link-continuous" className="mt-0.5" />
                            <Label htmlFor="link-continuous" className="font-normal cursor-pointer">
                                <div className="font-medium text-sm">Continuous (new)</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    Task 1's end date automatically becomes Task 2's start date — no gap in between.
                                </div>
                            </Label>
                        </div>
                    </RadioGroup>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" disabled={creatingDep} onClick={() => setPendingLink(null)}>
                            Cancel
                        </Button>
                        <Button size="sm" disabled={creatingDep} onClick={confirmCreateDependency}>
                            {creatingDep ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                            Create Dependency
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}