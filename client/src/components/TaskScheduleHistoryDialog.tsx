import { useState } from "react";
import { History, User, Zap, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/apiClient";
import { exportScheduleHistoryToPDF, SCHEDULE_HISTORY_COLUMNS } from "@/lib/pdfExport";

// This dialog is for a single task, so the Task column never applies.
const EXPORT_COLUMNS = SCHEDULE_HISTORY_COLUMNS.filter((c) => !c.taskOnly);

interface Props {
    taskId: string;
    taskName?: string;
    /** Compact styling for use inside dense table rows (Tasks list Manage column) */
    compact?: boolean;
}

function formatDate(d?: string | null) {
    if (!d) return "—";
    try {
        return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    } catch {
        return d;
    }
}

export default function TaskScheduleHistoryDialog({ taskId, taskName, compact }: Props) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState<any[]>([]);
    const [exportColSelOpen, setExportColSelOpen] = useState(false);
    const [selectedExportCols, setSelectedExportCols] = useState<string[]>(
        EXPORT_COLUMNS.map((c) => c.id)
    );

    const handleOpen = async () => {
        setOpen(true);
        setLoading(true);
        try {
            const res = await apiFetch(`/api/tasks/${taskId}/schedule-history`, { bypassCache: true });
            if (res.ok) setEntries(await res.json());
        } catch (err) {
            console.error("Failed to load task schedule history", err);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPdf = () => {
        setExportColSelOpen(false);
        exportScheduleHistoryToPDF(
            `Schedule History${taskName ? ` — ${taskName}` : ""}`,
            entries.map((e) => ({ ...e, taskName })),
            {
                showTaskColumn: false,
                fileName: `Schedule_History_${(taskName || taskId).replace(/[^a-z0-9]+/gi, "_")}.pdf`,
                selectedColumns: selectedExportCols,
            }
        );
    };

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                title="Schedule History"
                onClick={handleOpen}
                className={compact ? "h-6 w-6 text-slate-600 hover:text-slate-700 hover:bg-slate-100" : undefined}
            >
                <History className={compact ? "h-3 w-3" : "h-4 w-4"} />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
                        <DialogTitle>Schedule History{taskName ? ` — ${taskName}` : ""}</DialogTitle>
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
                    <ScrollArea className="max-h-[60vh] pr-3">
                        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
                        {!loading && entries.length === 0 && (
                            <p className="text-sm text-muted-foreground">No schedule changes recorded yet.</p>
                        )}
                        <div className="space-y-3">
                            {entries.map((e) => (
                                <div key={e.id} className="border rounded-md p-3 text-sm space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(e.changedAt).toLocaleString()}
                                        </span>
                                        {e.changeType === "Manual" ? (
                                            <Badge variant="secondary" className="gap-1">
                                                <User className="h-3 w-3" /> {e.changedByName || "User"}
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="gap-1">
                                                <Zap className="h-3 w-3" /> {e.changeType}
                                            </Badge>
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
                                    {(e.previousDuration !== e.newDuration) && (
                                        <div>
                                            Duration: {e.previousDuration ?? "—"} → {e.newDuration ?? "—"} days
                                        </div>
                                    )}
                                    <div className="text-muted-foreground">Reason: {e.reason || "—"}</div>
                                    {e.changeType === "Dependency Cascade" && e.triggeredByTaskName && (
                                        <div className="text-xs text-muted-foreground">
                                            Parent Task: {e.triggeredByTaskName}
                                            {typeof e.shiftedByDays === "number" && ` · Shifted by ${e.shiftedByDays} day(s)`}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </>
    );
}