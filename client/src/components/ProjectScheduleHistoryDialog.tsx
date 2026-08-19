import { useEffect, useState } from "react";
import { History, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/apiClient";
import { exportScheduleHistoryToPDF, SCHEDULE_HISTORY_COLUMNS } from "@/lib/pdfExport";

// This dialog always shows the Task column (it lists changes across every
// task in the project), so every column is a candidate for export.
const EXPORT_COLUMNS = SCHEDULE_HISTORY_COLUMNS;

interface Props {
    projectId: string;
    projectTitle?: string;
}

function formatDate(d?: string | null) {
    if (!d) return "—";
    try {
        return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    } catch {
        return d;
    }
}

export default function ProjectScheduleHistoryDialog({ projectId, projectTitle }: Props) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState<any[]>([]);
    const [taskFilter, setTaskFilter] = useState<string>("all");
    const [taskSearch, setTaskSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [exportColSelOpen, setExportColSelOpen] = useState(false);
    const [selectedExportCols, setSelectedExportCols] = useState<string[]>(
        EXPORT_COLUMNS.map((c) => c.id)
    );

    const load = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (taskFilter !== "all") params.set("taskId", taskFilter);
            if (typeFilter !== "all") params.set("changeType", typeFilter);
            const res = await apiFetch(`/api/projects/${projectId}/schedule-history?${params.toString()}`, {
                bypassCache: true,
            });
            if (res.ok) setEntries(await res.json());
        } catch (err) {
            console.error("Failed to load project schedule history", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, taskFilter, typeFilter]);

    const taskOptions = Array.from(
        new Map(entries.map((e) => [e.taskId, e.taskName || "Unknown task"])).entries()
    );
    const filteredTaskOptions = taskOptions.filter(([, name]) =>
        name.toLowerCase().includes(taskSearch.trim().toLowerCase())
    );

    const handleDownloadPdf = () => {
        setExportColSelOpen(false);
        exportScheduleHistoryToPDF(
            `Project Schedule History${projectTitle ? ` — ${projectTitle}` : ""}`,
            entries,
            {
                subtitle:
                    (taskFilter !== "all" || typeFilter !== "all")
                        ? "Filters applied: " +
                        [
                            taskFilter !== "all" ? `Task = ${taskOptions.find(([id]) => id === taskFilter)?.[1] || taskFilter}` : null,
                            typeFilter !== "all" ? `Change Type = ${typeFilter}` : null,
                        ]
                            .filter(Boolean)
                            .join(", ")
                        : undefined,
                fileName: `Project_Schedule_History_${(projectTitle || projectId).replace(/[^a-z0-9]+/gi, "_")}.pdf`,
                selectedColumns: selectedExportCols,
            }
        );
    };

    return (
        <>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
                <History className="h-4 w-4" />
                Project History
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
                        <DialogTitle>Project Schedule History{projectTitle ? ` — ${projectTitle}` : ""}</DialogTitle>
                        <Popover open={exportColSelOpen} onOpenChange={setExportColSelOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1.5 text-xs shrink-0"
                                    disabled={loading || entries.length === 0}
                                >
                                    <Download className="h-3.5 w-3.5" /> Download PDF
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-60 p-3" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-semibold text-xs">Select Columns to Export</h4>
                                        <label className="text-[11px] flex items-center gap-1 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedExportCols.length === EXPORT_COLUMNS.length}
                                                onChange={(e) => {
                                                    setSelectedExportCols(e.target.checked ? EXPORT_COLUMNS.map((c) => c.id) : []);
                                                }}
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                            />
                                            All
                                        </label>
                                    </div>
                                    <div className="max-h-[200px] overflow-y-auto space-y-1.5 p-1">
                                        {EXPORT_COLUMNS.map((col) => (
                                            <div key={col.id} className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedExportCols.includes(col.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedExportCols((prev) => [...prev, col.id]);
                                                        } else {
                                                            setSelectedExportCols((prev) => prev.filter((id) => id !== col.id));
                                                        }
                                                    }}
                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                                />
                                                <span className="text-xs">{col.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <Button
                                        size="sm"
                                        className="w-full text-xs"
                                        onClick={handleDownloadPdf}
                                        disabled={selectedExportCols.length === 0}
                                    >
                                        <Download className="h-3.5 w-3.5 mr-1" /> Download PDF
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </DialogHeader>

                    <div className="flex gap-2">
                        <Select
                            value={taskFilter}
                            onValueChange={(value) => {
                                setTaskFilter(value);
                                setTaskSearch("");
                            }}
                        >
                            <SelectTrigger className="h-8 text-xs w-[200px]">
                                <SelectValue placeholder="Filter by task" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[200px] [&_[data-radix-select-viewport]]:h-auto [&_[data-radix-select-viewport]]:max-h-[200px]">
                                <div className="sticky top-0 z-10 bg-popover p-1">
                                    <input
                                        value={taskSearch}
                                        onChange={(e) => setTaskSearch(e.target.value)}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        placeholder="Search tasks..."
                                        aria-label="Search tasks"
                                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                                    />
                                </div>
                                <SelectItem value="all">All Tasks</SelectItem>
                                {filteredTaskOptions.map(([id, name]) => (
                                    <SelectItem key={id} value={id}>
                                        {name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="h-8 text-xs w-[200px]">
                                <SelectValue placeholder="Filter by change type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Manual + Automatic</SelectItem>
                                <SelectItem value="Manual">Manual Changes</SelectItem>
                                <SelectItem value="Dependency Cascade">Automatic Dependency Changes</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <ScrollArea className="max-h-[55vh] pr-3">
                        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
                        {!loading && entries.length === 0 && (
                            <p className="text-sm text-muted-foreground">No schedule changes recorded yet.</p>
                        )}
                        <div className="space-y-3">
                            {entries.map((e) => (
                                <div key={e.id} className="border rounded-md p-3 text-sm space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{e.taskName || "Unknown task"}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(e.changedAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={e.changeType === "Manual" ? "secondary" : "outline"}>{e.changeType}</Badge>
                                        {e.changedByName && (
                                            <span className="text-xs text-muted-foreground">by {e.changedByName}</span>
                                        )}
                                    </div>
                                    {(e.previousStartDate !== e.newStartDate) && (
                                        <div>
                                            Start: {formatDate(e.previousStartDate)} → {formatDate(e.newStartDate)}
                                        </div>
                                    )}
                                    {(e.previousEndDate !== e.newEndDate) && (
                                        <div>
                                            End: {formatDate(e.previousEndDate)} → {formatDate(e.newEndDate)}
                                        </div>
                                    )}
                                    <div className="text-muted-foreground">Reason: {e.reason || "—"}</div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </>
    );
}