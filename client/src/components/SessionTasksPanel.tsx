import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, X, ListChecks, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import TaskPreviewPanel from "@/components/TaskPreviewPanel";
import SessionTasksListView from "@/components/SessionTasksListView";

interface SessionTask {
    id: string;
    form: any;
    subtasks: any[];
    savedAt: string;
}

interface SessionTasksPanelProps {
    tasks: SessionTask[];
    projects: any[];
    keySteps: any[];
    employees: any[];
    tags: any[];
    expandedId: string | null;
    onToggleExpand: (id: string) => void;
    onEditTask: (id: string) => void;
    onClose?: () => void;
    activeId?: string | null;
}

function getStatusStyle(status: string) {
    const s = String(status || "").toLowerCase();
    if (s === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "in progress" || s === "in-progress") return "bg-sky-50 text-sky-700 border-sky-200";
    if (s === "pending" || s === "planned") return "bg-indigo-50 text-indigo-700 border-indigo-200";
    if (s === "on hold" || s === "on-hold") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "cancelled" || s === "canceled") return "bg-red-50 text-red-700 border-red-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
}

function getPriorityStyle(priority: string) {
    const p = String(priority || "").toLowerCase();
    if (p === "high") return "bg-red-50 text-red-700 border-red-200";
    if (p === "low") return "bg-slate-50 text-slate-600 border-slate-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
}

const STATUS_LABELS: Record<string, string> = {
    pending: "Planned",
    "not started": "Not Started",
    "in-progress": "In Progress",
    "on hold": "On Hold",
    completed: "Completed",
    cancelled: "Cancelled",
};

function cnjoin(...classes: (string | false | undefined)[]) {
    return classes.filter(Boolean).join(" ");
}

export default function SessionTasksPanel({
    tasks,
    projects,
    keySteps,
    employees,
    tags,
    expandedId,
    onToggleExpand,
    onEditTask,
    onClose,
    activeId,
}: SessionTasksPanelProps) {
    const [viewMode, setViewMode] = useState<"chevron" | "list">("list");

    return (
        <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
            {/* Header */}
            <div className="bg-indigo-50 border-b border-indigo-200 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm">
                    <ListChecks size={16} />
                    Tasks Added ({tasks.length})
                </div>
                <div className="flex items-center gap-2">
                    {/* View Mode Toggle */}
                    <div className="flex gap-1 bg-indigo-100 rounded-md p-1">
                        <button
                            onClick={() => setViewMode("chevron")}
                            title="Chevron view"
                            className={cnjoin(
                                "flex items-center justify-center px-2 py-1.5 rounded text-sm transition-colors",
                                viewMode === "chevron"
                                    ? "bg-white text-indigo-700 font-semibold shadow-sm"
                                    : "text-indigo-600 hover:text-indigo-700"
                            )}
                        >
                            <ChevronRight size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode("list")}
                            title="List view"
                            className={cnjoin(
                                "flex items-center justify-center px-2 py-1.5 rounded text-sm transition-colors",
                                viewMode === "list"
                                    ? "bg-white text-indigo-700 font-semibold shadow-sm"
                                    : "text-indigo-600 hover:text-indigo-700"
                            )}
                        >
                            <List size={16} />
                        </button>
                    </div>
                    {onClose && (
                        <button
                            onClick={onClose}
                            title="Hide list"
                            className="flex items-center justify-center w-7 h-7 rounded-md text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                        >
                            <X size={15} />
                        </button>
                    )}
                </div>
            </div>

            {/* Content - Display based on view mode */}
            {viewMode === "chevron" ? (
                // Chevron/Expandable View
                <div className="max-h-[75vh] overflow-y-auto divide-y divide-slate-100">
                    {tasks.map((t) => {
                        const isExpanded = expandedId === t.id;
                        const isActive = activeId === t.id;
                        return (
                            <div key={t.id} className={cnjoin(isActive && "bg-indigo-50/50")}>
                                <button
                                    onClick={() => onToggleExpand(t.id)}
                                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                                >
                                    {isExpanded ? (
                                        <ChevronDown size={15} className="text-slate-400 shrink-0" />
                                    ) : (
                                        <ChevronRight size={15} className="text-slate-400 shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                                            {t.form.taskName || <span className="text-slate-400 italic font-normal">Untitled task</span>}
                                            {isActive && (
                                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">
                                                    editing
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <Badge variant="outline" className={cnjoin("text-[10px] font-bold px-2 py-0 rounded-full border capitalize", getStatusStyle(t.form.status))}>
                                                {STATUS_LABELS[t.form.status] || t.form.status}
                                            </Badge>
                                            <Badge variant="outline" className={cnjoin("text-[10px] font-bold px-2 py-0 rounded-full border capitalize", getPriorityStyle(t.form.priority))}>
                                                {t.form.priority}
                                            </Badge>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditTask(t.id);
                                        }}
                                        title="Edit this task"
                                        className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:bg-indigo-100 hover:text-indigo-700 transition-colors shrink-0"
                                    >
                                        <Pencil size={13} />
                                    </button>
                                </button>

                                {isExpanded && (
                                    <div className="px-3 pb-3 -mt-1">
                                        <TaskPreviewPanel
                                            form={t.form}
                                            subtasks={t.subtasks}
                                            projects={projects}
                                            keySteps={keySteps}
                                            employees={employees}
                                            tags={tags}
                                            savedAt={t.savedAt}
                                            onEdit={() => onEditTask(t.id)}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                // List View
                <div className="p-3">
                    <SessionTasksListView
                        tasks={tasks}
                        onEditTask={onEditTask}
                        activeId={activeId}
                    />
                </div>
            )}
        </div>
    );
}