import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

interface SessionTask {
    id: string;
    form: any;
    subtasks: any[];
    savedAt: string;
}

interface SessionTasksListViewProps {
    tasks: SessionTask[];
    onEditTask: (id: string) => void;
    activeId?: string | null;
}

function cnjoin(...classes: (string | false | undefined)[]) {
    return classes.filter(Boolean).join(" ");
}

function formatDateShort(value?: string) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function SessionTasksListView({
    tasks,
    onEditTask,
    activeId,
}: SessionTasksListViewProps) {
    return (
        <TooltipProvider>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {/* Table Header */}
                <div className="bg-slate-50 border-b border-slate-200 grid grid-cols-[2fr_1.2fr_1.2fr] gap-4 px-4 py-3">
                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Task Name</div>
                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Start Date</div>
                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">End Date</div>
                </div>

                {/* Table Body */}
                <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-200">
                    {tasks.length === 0 ? (
                        <div className="px-4 py-8 text-center text-slate-500 text-sm">
                            No tasks added yet
                        </div>
                    ) : (
                        tasks.map((t) => {
                            const isActive = activeId === t.id;
                            const startDate = formatDateShort(t.form.startDate);
                            const endDate = formatDateShort(t.form.endDate);
                            const taskName = t.form.taskName || "Untitled task";

                            return (
                                <div
                                    key={t.id}
                                    className={cnjoin(
                                        "grid grid-cols-[2fr_1.2fr_1.2fr] gap-4 px-4 py-3 items-center hover:bg-slate-50 transition-colors",
                                        isActive && "bg-indigo-50"
                                    )}
                                >
                                    {/* Task Name with Tooltip */}
                                    <div className="min-w-0">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="text-sm font-semibold text-slate-800 truncate cursor-help">
                                                    {t.form.taskName || <span className="text-slate-400 italic font-normal">Untitled task</span>}
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" align="start" className="max-w-xs break-words bg-slate-900 text-white p-2 rounded shadow-lg text-xs">
                                                {taskName}
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>

                                    {/* Start Date */}
                                    <div className="text-sm text-slate-600">
                                        {startDate}
                                    </div>

                                    {/* End Date */}
                                    <div className="text-sm text-slate-600">
                                        {endDate}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
}
