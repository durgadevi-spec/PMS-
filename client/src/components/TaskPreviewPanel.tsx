import { useEffect, useState } from "react";
import { Pencil, Eye, Trash2, Check, X, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DateField from "@/components/DateField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export interface TaskPreviewForm {
  taskName: string;
  description: string;
  projectId: string;
  keyStepId: string;
  startDate: string;
  endDate: string;
  completionDate: string;
  status: string;
  priority: "low" | "medium" | "high";
  assignerId: string;
  taskOwnerId: string;
  taskMembers: string[];
  tagIds: string[];
  taskPeriod: string;
  reminderFrequency: string;
  isAddon: boolean;
  isIssue: boolean;
}

interface TaskPreviewPanelProps {
  form: TaskPreviewForm;
  subtasks: any[];
  // Denormalized display strings captured at save time — a single task's
  // preview card must render correctly even while the main form is scoped
  // to a *different* task's project, so we don't rely on shared
  // projects/keySteps arrays for lookups here.
  projectTitle: string;
  keyStepTitle: string | null;
  employees: any[];
  tags: any[];
  savedAt?: string | null;
  // Whether this is the task currently loaded into the main edit form.
  isActive?: boolean;
  // Persists an inline edit (called with the full draft form). Should
  // throw/reject on failure so the panel can stay in edit mode.
  onSave: (updatedForm: TaskPreviewForm) => Promise<void> | void;
  // Loads this task into the full page form (for subtasks, project changes, etc).
  onEditFull?: () => void;
  onDelete?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Planned",
  "not started": "Not Started",
  "in-progress": "In Progress",
  "on hold": "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_OPTIONS = [
  { value: "not started", label: "Not Started" },
  { value: "pending", label: "Planned" },
  { value: "in-progress", label: "In Progress" },
  { value: "on hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PERIOD_OPTIONS = [
  { value: "custom", label: "Custom" },
  { value: "today", label: "Today" },
  { value: "1 week", label: "1 Week" },
  { value: "fortnight", label: "Fortnight (15 Days)" },
  { value: "1 month", label: "1 Month" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half yearly", label: "Half Yearly" },
  { value: "annual", label: "Annual" },
];

const FREQUENCY_OPTIONS = [
  { value: "1 time", label: "1 Time" },
  { value: "2 times", label: "2 Times" },
  { value: "4 times", label: "4 Times" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
];

function computePeriodDates(period: string) {
  const today = new Date();
  const startStr = today.toISOString().split("T")[0];
  const endDate = new Date(today);
  if (period === "1 week") endDate.setDate(endDate.getDate() + 7);
  else if (period === "fortnight") endDate.setDate(endDate.getDate() + 15);
  else if (period === "1 month") endDate.setMonth(endDate.getMonth() + 1);
  else if (period === "quarterly") endDate.setMonth(endDate.getMonth() + 3);
  else if (period === "half yearly") endDate.setMonth(endDate.getMonth() + 6);
  else if (period === "annual") endDate.setFullYear(endDate.getFullYear() + 1);
  return { startDate: startStr, endDate: endDate.toISOString().split("T")[0] };
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

function formatDateShort(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function cnjoin(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      title={name}
      className="relative inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500 border border-white text-[9px] font-bold text-white shadow-sm ring-1 ring-slate-900/5"
    >
      {initialsOf(name)}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 px-4 grid grid-cols-[110px_1fr] gap-3 items-center border-b border-slate-100 last:border-b-0">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function TaskPreviewPanel({
  form,
  subtasks,
  projectTitle,
  keyStepTitle,
  employees,
  tags,
  savedAt,
  isActive,
  onSave,
  onEditFull,
  onDelete,
}: TaskPreviewPanelProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<TaskPreviewForm>(form);
  const [saving, setSaving] = useState(false);

  // Keep the draft in sync with upstream changes as long as we're not
  // actively editing (e.g. this same task got updated elsewhere).
  useEffect(() => {
    if (!isEditing) setDraft(form);
  }, [form, isEditing]);

  const startEdit = () => {
    setDraft(form);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraft(form);
    setIsEditing(false);
  };

  const saveEdit = async () => {
    if (!draft.taskName.trim()) {
      toast({ variant: "destructive", title: "Task name is required" });
      return;
    }
    if (!draft.assignerId || !draft.taskOwnerId) {
      toast({ variant: "destructive", title: "Assigned By and Task Owner are required" });
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setIsEditing(false);
    } catch {
      // Parent is responsible for surfacing the error (toast); keep editing open.
    } finally {
      setSaving(false);
    }
  };

  const owner = employees.find((e) => String(e.id) === String((isEditing ? draft : form).taskOwnerId));
  const assigner = employees.find((e) => String(e.id) === String((isEditing ? draft : form).assignerId));
  const members = ((isEditing ? draft : form).taskMembers || [])
    .map((id) => employees.find((e) => String(e.id) === String(id)))
    .filter(Boolean) as any[];
  const selectedTags = ((isEditing ? draft : form).tagIds || [])
    .map((id) => tags.find((t) => String(t.id) === String(id)))
    .filter(Boolean) as any[];

  return (
    <div
      className={cnjoin(
        "bg-white rounded-xl border-2 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200",
        isActive ? "border-indigo-400 ring-2 ring-indigo-200" : "border-indigo-200"
      )}
    >
      {/* Header */}
      <div className="bg-indigo-50 border-b border-indigo-200 px-5 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm min-w-0">
          <Eye size={16} className="shrink-0" />
          <span className="truncate">{isEditing ? "Editing" : "Task Preview"}</span>
          {savedAt && <span className="text-xs font-normal text-indigo-400 shrink-0">· saved {savedAt}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isEditing ? (
            <>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <X size={13} />
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1 text-xs font-semibold text-white bg-indigo-600 rounded-md px-2.5 py-1.5 hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <Check size={13} />
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <>
              {onEditFull && (
                <button
                  onClick={onEditFull}
                  title="Open in full editor"
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-md px-2.5 py-1.5 hover:bg-indigo-100 transition-colors"
                >
                  <ExternalLink size={13} />
                  Full Editor
                </button>
              )}
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-md px-2.5 py-1.5 hover:bg-indigo-100 transition-colors"
              >
                <Pencil size={13} />
                Edit
              </button>
              {onDelete && (
                <button
                  onClick={() => {
                    if (window.confirm(`Delete task "${form.taskName || "Untitled task"}"? This cannot be undone.`)) {
                      onDelete();
                    }
                  }}
                  title="Delete task"
                  className="flex items-center justify-center w-7 h-7 rounded-md text-indigo-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Task name / description / status / priority / flags */}
      <div className="px-5 py-4 border-b border-slate-100 space-y-3">
        {isEditing ? (
          <>
            <Input
              value={draft.taskName}
              onChange={(e) => setDraft((d) => ({ ...d, taskName: e.target.value }))}
              placeholder="Task name"
              className="h-9 text-sm font-semibold"
            />
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Description (optional)"
              rows={2}
              className="text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={draft.priority} onValueChange={(v) => setDraft((d) => ({ ...d, priority: v as any }))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.isAddon}
                  onChange={(e) => setDraft((d) => ({ ...d, isAddon: e.target.checked }))}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                Addon
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-red-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.isIssue}
                  onChange={(e) => setDraft((d) => ({ ...d, isIssue: e.target.checked }))}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                />
                Issue
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Task Name</div>
            <div className="text-base font-bold text-slate-900 break-words">
              {form.taskName || <span className="text-slate-400 font-normal italic">Untitled task</span>}
            </div>
            {form.description && (
              <div className="text-sm text-slate-600 whitespace-pre-wrap break-words">{form.description}</div>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className={cnjoin("text-[11px] font-bold px-2.5 py-0.5 rounded-full border capitalize", getStatusStyle(form.status))}>
                {STATUS_LABELS[form.status] || form.status}
              </Badge>
              <Badge variant="outline" className={cnjoin("text-[11px] font-bold px-2.5 py-0.5 rounded-full border capitalize", getPriorityStyle(form.priority))}>
                {form.priority}
              </Badge>
              {form.isAddon && (
                <Badge variant="outline" className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                  Addon
                </Badge>
              )}
              {form.isIssue && (
                <Badge variant="outline" className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">
                  Issue
                </Badge>
              )}
            </div>
          </>
        )}
      </div>

      {/* Table-style field rows, mirroring the Tasks list columns */}
      <div className="max-h-[65vh] overflow-y-auto">
        <Field label="Project">
          <span className="text-sm font-medium text-slate-700 truncate block">{projectTitle || "—"}</span>
        </Field>

        <Field label="Key Step">
          {keyStepTitle ? (
            <Badge variant="outline" className="text-[11px] bg-indigo-50 text-indigo-700 border-indigo-200 px-2 py-0.5 rounded-full font-medium truncate max-w-[220px] inline-block">
              {keyStepTitle}
            </Badge>
          ) : (
            <span className="text-sm text-slate-400 italic">No Key Step</span>
          )}
        </Field>

        <Field label="Period">
          {isEditing ? (
            <Select
              value={draft.taskPeriod}
              onValueChange={(v) => {
                if (v !== "custom") {
                  setDraft((d) => ({ ...d, taskPeriod: v, ...computePeriodDates(v) }));
                } else {
                  setDraft((d) => ({ ...d, taskPeriod: "custom" }));
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="text-[11px] capitalize bg-blue-50/70 text-blue-700 border-blue-200/60 rounded-full font-semibold">
              {form.taskPeriod === "custom" ? "—" : form.taskPeriod}
            </Badge>
          )}
        </Field>

        <Field label="Frequency">
          {isEditing ? (
            <Select value={draft.reminderFrequency} onValueChange={(v) => setDraft((d) => ({ ...d, reminderFrequency: v }))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="text-[11px] capitalize bg-amber-50/70 text-amber-700 border-amber-200/60 rounded-full font-semibold">
              {form.reminderFrequency}
            </Badge>
          )}
        </Field>

        <Field label="Assigned By">
          {isEditing ? (
            <Select value={draft.assignerId} onValueChange={(v) => setDraft((d) => ({ ...d, assignerId: v }))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                {employees.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : assigner ? (
            <div className="flex items-center gap-2">
              <Avatar name={assigner.name} />
              <span className="text-sm text-slate-700 truncate">{assigner.name}</span>
            </div>
          ) : (
            <span className="text-sm text-slate-400">—</span>
          )}
        </Field>

        <Field label="Task Owner">
          {isEditing ? (
            <Select value={draft.taskOwnerId} onValueChange={(v) => setDraft((d) => ({ ...d, taskOwnerId: v }))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                {employees.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : owner ? (
            <div className="flex items-center gap-2">
              <Avatar name={owner.name} />
              <span className="text-sm text-slate-700 truncate">{owner.name}</span>
            </div>
          ) : (
            <span className="text-sm text-slate-400">—</span>
          )}
        </Field>

        <Field label="Assignees">
          {isEditing ? (
            <div className="space-y-2">
              <Select
                value=""
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    taskMembers: Array.from(new Set([...(d.taskMembers || []), v])),
                  }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Add assignee..." />
                </SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-1.5">
                {(draft.taskMembers || []).map((id) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="text-[11px] cursor-pointer"
                    onClick={() =>
                      setDraft((d) => ({ ...d, taskMembers: d.taskMembers.filter((x) => x !== id) }))
                    }
                  >
                    {employees.find((e) => String(e.id) === String(id))?.name || id} ✕
                  </Badge>
                ))}
              </div>
            </div>
          ) : members.length > 0 ? (
            <div className="flex items-center -space-x-1.5">
              {members.slice(0, 6).map((m: any) => (
                <Avatar key={m.id} name={m.name} />
              ))}
              {members.length > 6 && (
                <div className="relative inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 border border-white text-[9px] font-bold text-slate-600">
                  +{members.length - 6}
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm text-slate-400">—</span>
          )}
        </Field>

        <Field label="Tags">
          {isEditing ? (
            <div className="space-y-2">
              <Select
                value=""
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    tagIds: Array.from(new Set([...(d.tagIds || []), v])),
                  }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Add tag..." />
                </SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  {tags.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-1.5">
                {(draft.tagIds || []).map((id) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="text-[11px] cursor-pointer"
                    onClick={() => setDraft((d) => ({ ...d, tagIds: d.tagIds.filter((x) => x !== id) }))}
                  >
                    {tags.find((t) => String(t.id) === String(id))?.name || id} ✕
                  </Badge>
                ))}
              </div>
            </div>
          ) : selectedTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map((t: any) => (
                <Badge key={t.id} variant="outline" className="text-[11px] bg-indigo-50 text-indigo-700 border-indigo-200 px-2 py-0.5 rounded-full font-medium">
                  {t.name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-slate-400">—</span>
          )}
        </Field>

        <Field label="Start Date">
          {isEditing ? (
            <DateField
              value={draft.startDate}
              onChange={(v: string) =>
                setDraft((d) => ({
                  ...d,
                  taskPeriod: "custom",
                  startDate: v,
                  endDate: d.endDate && v && d.endDate < v ? v : d.endDate,
                }))
              }
              className="h-8 text-xs"
            />
          ) : (
            <span className="text-sm text-slate-700">{formatDateShort(form.startDate)}</span>
          )}
        </Field>

        <Field label="Due Date">
          {isEditing ? (
            <DateField
              value={draft.endDate}
              min={draft.startDate || undefined}
              onChange={(v: string) => setDraft((d) => ({ ...d, taskPeriod: "custom", endDate: v }))}
              className="h-8 text-xs"
            />
          ) : (
            <span className="text-sm text-slate-700">{formatDateShort(form.endDate)}</span>
          )}
        </Field>

        <Field label="Completion">
          {isEditing ? (
            <DateField
              value={draft.completionDate}
              clearable
              onChange={(v: string) => setDraft((d) => ({ ...d, completionDate: v }))}
              className="h-8 text-xs"
            />
          ) : (
            <span className="text-sm text-slate-700">{formatDateShort(form.completionDate)}</span>
          )}
        </Field>

        {subtasks.length > 0 && (
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Subtasks ({subtasks.length})
              </div>
              {isEditing && onEditFull && (
                <button onClick={onEditFull} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">
                  Edit in full editor
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {subtasks.map((st, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded-md px-3 py-2">
                  <span
                    className={cnjoin(
                      "w-2 h-2 rounded-full shrink-0",
                      st.isCompleted ? "bg-emerald-500" : "bg-slate-300"
                    )}
                  />
                  <span className="text-slate-700 truncate">
                    {st.title || <span className="text-slate-400 italic">Untitled subtask</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}