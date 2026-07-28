import { useEffect, useRef, useState } from "react";
import { Link2, Plus, Trash2, Search, ChevronDown, X, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, invalidateCache } from "@/lib/apiClient";
import { cn } from "@/lib/utils";

const DEPENDENCY_TYPE_LABELS: Record<string, string> = {
    FS: "Finish-to-Start (FS)",
    SS: "Start-to-Start (SS)",
    FF: "Finish-to-Finish (FF)",
    SF: "Start-to-Finish (SF)",
};

function isContinuous(dep: { type?: string; lagDays?: number }) {
    return dep.type === "FS" && dep.lagDays === -1;
}

interface TaskOption {
    id: string;
    taskName: string;
    keyStepId: string | null;
}

interface KeyStepOption {
    id: string;
    title: string;
}

interface Props {
    projectId: string;
    taskId: string;
    projectTasks: TaskOption[];
    keySteps?: KeyStepOption[];
}

// ─── Searchable Task Picker ────────────────────────────────────────────────
interface SearchableTaskPickerProps {
    tasks: TaskOption[];
    keySteps: KeyStepOption[];
    value: string;
    onChange: (id: string) => void;
    placeholder?: string;
}

function SearchableTaskPicker({
    tasks,
    keySteps,
    value,
    onChange,
    placeholder = "Add a predecessor task...",
}: SearchableTaskPickerProps) {
    const [open, setOpen] = useState(false);
    const [taskSearch, setTaskSearch] = useState("");
    const [selectedKeyStepId, setSelectedKeyStepId] = useState<string>("all");
    const [ksSearch, setKsSearch] = useState("");
    const [ksDropdownOpen, setKsDropdownOpen] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const taskInputRef = useRef<HTMLInputElement>(null);
    const ksInputRef = useRef<HTMLInputElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setKsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Focus task search when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => taskInputRef.current?.focus(), 50);
        }
    }, [open]);

    const selectedTask = tasks.find((t) => t.id === value);

    // Key Step filter dropdown content
    const filteredKeySteps = keySteps.filter((ks) =>
        ks.title.toLowerCase().includes(ksSearch.toLowerCase())
    );

    const activeKeyStep =
        selectedKeyStepId === "all"
            ? null
            : keySteps.find((ks) => ks.id === selectedKeyStepId);

    // Filter tasks: by key step and by search text
    const filteredTasks = tasks.filter((t) => {
        const matchesKs =
            selectedKeyStepId === "all" ||
            selectedKeyStepId === "none"
                ? selectedKeyStepId === "none"
                    ? !t.keyStepId
                    : true
                : t.keyStepId === selectedKeyStepId;
        const matchesSearch = t.taskName
            .toLowerCase()
            .includes(taskSearch.toLowerCase());
        return matchesKs && matchesSearch;
    });

    // Group tasks by key step for display
    const groups: { keyStepId: string | null; label: string; tasks: TaskOption[] }[] = [];
    if (selectedKeyStepId !== "all") {
        groups.push({ keyStepId: selectedKeyStepId === "none" ? null : selectedKeyStepId, label: "", tasks: filteredTasks });
    } else {
        // Group by keystep
        const groupMap = new Map<string, TaskOption[]>();
        filteredTasks.forEach((t) => {
            const k = t.keyStepId || "__none__";
            if (!groupMap.has(k)) groupMap.set(k, []);
            groupMap.get(k)!.push(t);
        });
        groupMap.forEach((groupTasks, ksId) => {
            const ks = keySteps.find((k) => k.id === ksId);
            groups.push({
                keyStepId: ksId === "__none__" ? null : ksId,
                label: ks?.title || (ksId === "__none__" ? "No Key Step" : ksId),
                tasks: groupTasks,
            });
        });
    }

    const hasNoTasks = filteredTasks.length === 0;

    return (
        <div ref={containerRef} className="relative flex-1">
            {/* Trigger button */}
            <button
                type="button"
                onClick={() => {
                    setOpen((o) => !o);
                    setKsDropdownOpen(false);
                }}
                className={cn(
                    "w-full h-8 flex items-center justify-between gap-1 px-3 rounded-md border text-xs",
                    "bg-white hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300",
                    open ? "ring-2 ring-slate-300 border-slate-400" : "border-slate-200"
                )}
            >
                <span className={cn("truncate", !selectedTask && "text-muted-foreground")}>
                    {selectedTask ? selectedTask.taskName : placeholder}
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>

            {/* Dropdown panel */}
            {open && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden" style={{ minWidth: 280 }}>
                    {/* Key Step Filter Row */}
                    {keySteps.length > 0 && (
                        <div className="border-b border-slate-100 p-2 bg-slate-50">
                            <div className="flex items-center gap-1.5 mb-1">
                                <Layers className="h-3 w-3 text-slate-400" />
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Filter by Key Step</span>
                            </div>
                            {/* Key Step searchable dropdown */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setKsDropdownOpen((o) => !o);
                                        setTimeout(() => ksInputRef.current?.focus(), 50);
                                    }}
                                    className={cn(
                                        "w-full h-7 flex items-center justify-between gap-1 px-2 rounded border text-xs bg-white",
                                        "hover:bg-slate-50 transition-colors focus:outline-none",
                                        ksDropdownOpen ? "ring-2 ring-indigo-300 border-indigo-400" : "border-slate-200"
                                    )}
                                >
                                    <span className="flex items-center gap-1 truncate">
                                        {selectedKeyStepId === "all" ? (
                                            <span className="text-muted-foreground">All Key Steps</span>
                                        ) : selectedKeyStepId === "none" ? (
                                            <span className="italic text-slate-500">No Key Step</span>
                                        ) : (
                                            <span className="font-medium text-indigo-700 truncate">{activeKeyStep?.title}</span>
                                        )}
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {selectedKeyStepId !== "all" && (
                                            <X
                                                className="h-3 w-3 text-muted-foreground hover:text-destructive"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedKeyStepId("all");
                                                    setKsDropdownOpen(false);
                                                }}
                                            />
                                        )}
                                        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", ksDropdownOpen && "rotate-180")} />
                                    </div>
                                </button>

                                {ksDropdownOpen && (
                                    <div
                                        className="absolute left-0 right-0 top-full mt-0.5 z-[60] bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* Key Step search input */}
                                        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100">
                                            <Search className="h-3 w-3 text-slate-400 shrink-0" />
                                            <input
                                                ref={ksInputRef}
                                                type="text"
                                                value={ksSearch}
                                                onChange={(e) => setKsSearch(e.target.value)}
                                                placeholder="Search key steps..."
                                                className="flex-1 text-xs bg-transparent outline-none placeholder:text-slate-400"
                                            />
                                            {ksSearch && (
                                                <X
                                                    className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                                                    onClick={() => setKsSearch("")}
                                                />
                                            )}
                                        </div>
                                        <div className="max-h-36 overflow-y-auto">
                                            <button
                                                type="button"
                                                onClick={() => { setSelectedKeyStepId("all"); setKsDropdownOpen(false); setKsSearch(""); }}
                                                className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors", selectedKeyStepId === "all" && "bg-indigo-50 text-indigo-700 font-medium")}
                                            >
                                                All Key Steps
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setSelectedKeyStepId("none"); setKsDropdownOpen(false); setKsSearch(""); }}
                                                className={cn("w-full text-left px-3 py-1.5 text-xs italic text-slate-500 hover:bg-slate-50 transition-colors", selectedKeyStepId === "none" && "bg-indigo-50 text-indigo-700 font-medium")}
                                            >
                                                No Key Step
                                            </button>
                                            {filteredKeySteps.length === 0 && ksSearch && (
                                                <p className="px-3 py-2 text-xs text-muted-foreground">No key steps match.</p>
                                            )}
                                            {filteredKeySteps.map((ks) => (
                                                <button
                                                    key={ks.id}
                                                    type="button"
                                                    onClick={() => { setSelectedKeyStepId(ks.id); setKsDropdownOpen(false); setKsSearch(""); }}
                                                    className={cn(
                                                        "w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors truncate",
                                                        selectedKeyStepId === ks.id && "bg-indigo-50 text-indigo-700 font-medium"
                                                    )}
                                                >
                                                    {ks.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Task search */}
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100">
                        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <input
                            ref={taskInputRef}
                            type="text"
                            value={taskSearch}
                            onChange={(e) => setTaskSearch(e.target.value)}
                            placeholder="Search tasks..."
                            className="flex-1 text-xs bg-transparent outline-none placeholder:text-slate-400"
                        />
                        {taskSearch && (
                            <X
                                className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                                onClick={() => setTaskSearch("")}
                            />
                        )}
                    </div>

                    {/* Task list */}
                    <div className="max-h-52 overflow-y-auto">
                        {hasNoTasks && (
                            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                                {taskSearch
                                    ? `No tasks match "${taskSearch}"`
                                    : "No available tasks"}
                            </p>
                        )}

                        {groups.map((group, gi) => (
                            <div key={group.keyStepId ?? `group-${gi}`}>
                                {/* Group header — only show when not filtered to single key step */}
                                {selectedKeyStepId === "all" && keySteps.length > 0 && group.label && (
                                    <div className="px-3 pt-2 pb-0.5">
                                        <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide flex items-center gap-1">
                                            <Layers className="h-2.5 w-2.5" />
                                            {group.label}
                                        </span>
                                    </div>
                                )}
                                {selectedKeyStepId === "all" && keySteps.length > 0 && !group.label && (
                                    <div className="px-3 pt-2 pb-0.5">
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide italic">
                                            No Key Step
                                        </span>
                                    </div>
                                )}
                                {group.tasks.map((task) => (
                                    <button
                                        key={task.id}
                                        type="button"
                                        onClick={() => {
                                            onChange(task.id);
                                            setOpen(false);
                                            setTaskSearch("");
                                        }}
                                        className={cn(
                                            "w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 hover:text-indigo-800 transition-colors truncate",
                                            value === task.id && "bg-indigo-50 text-indigo-700 font-medium",
                                            selectedKeyStepId === "all" && keySteps.length > 0 && "pl-5"
                                        )}
                                    >
                                        {task.taskName}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Footer count */}
                    <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""} available
                        </span>
                        {(taskSearch || selectedKeyStepId !== "all") && (
                            <button
                                type="button"
                                onClick={() => { setTaskSearch(""); setSelectedKeyStepId("all"); }}
                                className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function TaskDependencyManager({ projectId, taskId, projectTasks, keySteps = [] }: Props) {
    const { toast } = useToast();
    const [predecessors, setPredecessors] = useState<any[]>([]);
    const [successors, setSuccessors] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [newPredecessorId, setNewPredecessorId] = useState("");
    const [newType, setNewType] = useState("FS");
    const [newContinuous, setNewContinuous] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        if (!taskId) return;
        setLoading(true);
        try {
            const res = await apiFetch(`/api/tasks/${taskId}/dependencies`, { bypassCache: true });
            if (res.ok) {
                const data = await res.json();
                setPredecessors(data.predecessors || []);
                setSuccessors(data.successors || []);
            }
        } catch (err) {
            console.error("Failed to load dependencies", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId]);

    if (!taskId) {
        return (
            <div className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/30">
                Save the task first to configure dependencies with other tasks in this project.
            </div>
        );
    }

    const availablePredecessors = projectTasks.filter(
        (t) => t.id !== taskId && !predecessors.some((p) => p.task?.id === t.id)
    );

    const handleAdd = async () => {
        if (!newPredecessorId) {
            toast({ variant: "destructive", title: "Select a task", description: "Choose a predecessor task first." });
            return;
        }
        setSaving(true);
        try {
            const res = await apiFetch("/api/task-dependencies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId,
                    predecessorId: newPredecessorId,
                    successorId: taskId,
                    type: newType,
                    lagDays: newType === "FS" && newContinuous ? -1 : 0,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({ variant: "destructive", title: "Could not add dependency", description: body.message || "Failed" });
                return;
            }
            invalidateCache(`/api/tasks/${taskId}/dependencies`);
            setNewPredecessorId("");
            setNewContinuous(false);
            await load();
            toast({ title: "Dependency added" });
        } catch (err) {
            toast({ variant: "destructive", title: "Error", description: "Failed to add dependency" });
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (dependencyId: string) => {
        try {
            const res = await apiFetch(`/api/task-dependencies/${dependencyId}`, { method: "DELETE" });
            if (!res.ok) {
                toast({ variant: "destructive", title: "Failed to remove dependency" });
                return;
            }
            invalidateCache(`/api/tasks/${taskId}/dependencies`);
            await load();
        } catch (err) {
            toast({ variant: "destructive", title: "Error removing dependency" });
        }
    };

    const handleTypeChange = async (dependencyId: string, type: string) => {
        try {
            const res = await apiFetch(`/api/task-dependencies/${dependencyId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type }),
            });
            if (!res.ok) {
                toast({ variant: "destructive", title: "Failed to update dependency type" });
                return;
            }
            invalidateCache(`/api/tasks/${taskId}/dependencies`);
            await load();
        } catch (err) {
            toast({ variant: "destructive", title: "Error updating dependency" });
        }
    };

    return (
        <div className="space-y-4 border rounded-md p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
                <Link2 className="h-4 w-4" />
                Task Dependencies
            </div>

            {/* Predecessors */}
            <div>
                <Label className="text-xs text-muted-foreground">Predecessors (this task waits on)</Label>
                <div className="space-y-2 mt-1">
                    {predecessors.length === 0 && (
                        <p className="text-xs text-muted-foreground">No predecessors configured.</p>
                    )}
                    {predecessors.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                                <Badge variant="outline" className="shrink-0">
                                    {isContinuous(p) ? "Continuous" : p.type}
                                </Badge>
                                <span className="truncate text-sm">{p.task?.taskName || "Unknown task"}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <Select value={p.type} onValueChange={(v) => handleTypeChange(p.id, v)}>
                                    <SelectTrigger className="h-7 w-[90px] text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.keys(DEPENDENCY_TYPE_LABELS).map((k) => (
                                            <SelectItem key={k} value={k}>
                                                {k}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(p.id)}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Add new predecessor — searchable with Key Step filter */}
                <div className="flex items-center gap-2 mt-2">
                    <SearchableTaskPicker
                        tasks={availablePredecessors}
                        keySteps={keySteps}
                        value={newPredecessorId}
                        onChange={setNewPredecessorId}
                        placeholder="Add a predecessor task..."
                    />
                    <Select value={newType} onValueChange={setNewType}>
                        <SelectTrigger className="h-8 w-[90px] text-xs shrink-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.keys(DEPENDENCY_TYPE_LABELS).map((k) => (
                                <SelectItem key={k} value={k}>
                                    {k}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleAdd} disabled={saving || !newPredecessorId}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                {newType === "FS" && (
                    <div className="flex items-center gap-2 mt-2">
                        <Checkbox
                            id="continuous-link"
                            checked={newContinuous}
                            onCheckedChange={(v) => setNewContinuous(v === true)}
                        />
                        <Label htmlFor="continuous-link" className="text-xs font-normal cursor-pointer text-muted-foreground">
                            Continuous link — the predecessor's end date automatically becomes this task's start date (no gap)
                        </Label>
                    </div>
                )}
            </div>

            {/* Successors (read-only) */}
            <div>
                <Label className="text-xs text-muted-foreground">Successors (tasks that depend on this one)</Label>
                <div className="space-y-1 mt-1">
                    {successors.length === 0 && (
                        <p className="text-xs text-muted-foreground">No successor tasks depend on this one.</p>
                    )}
                    {successors.map((s: any) => (
                        <div key={s.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                            <Badge variant="outline">{isContinuous(s) ? "Continuous" : s.type}</Badge>
                            <span className="truncate text-sm">{s.task?.taskName || "Unknown task"}</span>
                        </div>
                    ))}
                </div>
            </div>
            {loading && <p className="text-xs text-muted-foreground">Loading dependencies…</p>}
        </div>
    );
}