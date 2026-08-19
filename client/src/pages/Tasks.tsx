import { useState, useEffect, Fragment, useMemo, useRef } from "react";
import { useFreeze } from "@/context/FreezeContext";
import { useAuth } from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Edit,
  Search,
  Copy,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  CheckCircle2,
  Circle,
  X,
  Check,
  ChevronsUpDown,
  Percent,
  MessageSquare,
  GripVertical,
  EyeOff,
  RotateCcw,
  Settings2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  Key,
  Users,
  Hash,
  UserCog,
  Link2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/apiClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn, formatDate } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskFilters, CustomFilter } from "@/components/TaskFilters";
import GanttDependencyDialog from "@/components/GanttDependencyDialog";
import { useScheduleChangeReason } from "@/components/ScheduleChangeReasonDialog";
import TaskScheduleHistoryDialog from "@/components/TaskScheduleHistoryDialog";
import logoImg from "./logo.jpg";

/* ================= TYPES ================= */

interface Subtask {
  id?: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  assignedTo: string[]; // array of employee IDs
  startDate?: string | null;
  endDate?: string | null;
  progress?: number;
  isAddon?: boolean;
  isIssue?: boolean;
  taskOwnerId?: string | null;
  priority?: "low" | "medium" | "high";
  status?: string;
  ccMembers?: string[];
  // Full field-parity with Task (Key Step, Period, Frequency, Assigned By,
  // Duration, Completion Date, Tags) so subtask rows can be inline-edited
  // exactly like task rows.
  keyStepId?: string | null;
  taskPeriod?: string;
  reminderFrequency?: string;
  assignerId?: string | null;
  durationDays?: number | null;
  completionDate?: string | null;
  tags?: Tag[];
}

interface Task {
  id: string;
  projectId: string;
  keyStepId?: string;
  taskName: string;
  description?: string;
  status: string;
  priority: "low" | "medium" | "high";
  startDate?: string;
  endDate?: string;
  assignerId: string;
  taskOwnerId?: string;
  taskMembers?: string[];
  ccMembers?: string[];
  subtasks?: Subtask[];
  // Count of subtasks as reported by the server. For the admin "all tasks"
  // bulk view, `subtasks` itself is intentionally NOT sent up front (only
  // this count) to keep the payload small; the full list is fetched lazily
  // via GET /api/tasks/:id/subtasks the first time a row is expanded.
  subtaskCount?: number;
  progress?: number;
  taskPeriod?: string;
  reminderFrequency?: string;
  ticketId?: string;
  sortOrder?: number;
  isAddon?: boolean;
  isIssue?: boolean;
  createdAt?: string;
  completedAt?: string;
  completionDate?: string;
  durationDays?: number | null;
  tags?: Tag[];
  parentTaskId?: string | null;
}

/* ================= COMPONENT ================= */

export interface Tag {
  id: string;
  name: string;
  createdAt?: string;
}

interface Chip {
  type: string;
  label: string;
  id?: string;
}


// ----------------- COLUMN CONFIGURATION -----------------
export type ColumnId = "serial" | "taskName" | "assignedBy" | "taskOwner" | "project" | "keyStep" | "period" | "frequency" | "assignees" | "ccMembers" | "tags" | "startDate" | "endDate" | "completionDate" | "durationDays" | "priority" | "status" | "progress" | "remarks" | "flags";

export interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
}

const defaultColumns: ColumnConfig[] = [
  { id: "serial", label: "#", visible: true },
  { id: "taskName", label: "Task Name", visible: true },
  { id: "project", label: "Project", visible: true },
  { id: "keyStep", label: "Key Step", visible: true },
  { id: "period", label: "Period", visible: true },
  { id: "frequency", label: "Frequency", visible: true },
  { id: "assignedBy", label: "Assigned By", visible: true },
  { id: "taskOwner", label: "Task Owner", visible: true },
  { id: "assignees", label: "Assignees", visible: true },
  { id: "ccMembers", label: "CC", visible: false },
  { id: "tags", label: "Tags", visible: true },
  { id: "startDate", label: "Start Date", visible: true },
  { id: "endDate", label: "Due Date", visible: true },
  { id: "completionDate", label: "Completion Date", visible: true },
  { id: "durationDays", label: "Duration (Days)", visible: true },
  { id: "priority", label: "Priority", visible: true },
  { id: "status", label: "Status", visible: true },
  { id: "progress", label: "Progress", visible: true },
  { id: "remarks", label: "Delayed By", visible: true },
  { id: "flags", label: "Flags", visible: true },
];

import { ManageColumns } from "@/components/ManageColumns";
// --------------------------------------------------------


function InlineTagCell({ task, allTags, setAllTags, setTasks }: { task: any, allTags: any[], setAllTags: any, setTasks: any }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [pendingTagIds, setPendingTagIds] = useState<Set<string>>(new Set());
  const taskTags = task.tags || [];

  const handleToggle = async (tag: any) => {
    const tagId = String(tag.id);
    if (pendingTagIds.has(tagId)) return; // ignore rapid double-clicks on the same tag while a request is in flight

    const isAssigned = taskTags.some((t: any) => String(t.id) === tagId);
    const action = isAssigned ? "remove" : "add";

    // Optimistic update: flip this task's tags locally immediately
    setTasks((prev: any[]) => prev.map((t: any) => {
      if (t.id !== task.id) return t;
      const currentTags = t.tags || [];
      const nextTags = isAssigned
        ? currentTags.filter((t2: any) => String(t2.id) !== tagId)
        : [...currentTags, tag];
      return { ...t, tags: nextTags };
    }));

    setPendingTagIds(prev => new Set(prev).add(tagId));
    try {
      const res = await apiFetch("/api/tasks/bulk-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: [task.id], tagIds: [tag.id], action })
      });
      if (!res.ok) throw new Error();
    } catch {
      // Roll back the optimistic update on failure
      setTasks((prev: any[]) => prev.map((t: any) => {
        if (t.id !== task.id) return t;
        const currentTags = t.tags || [];
        const revertedTags = isAssigned
          ? [...currentTags, tag]
          : currentTags.filter((t2: any) => String(t2.id) !== tagId);
        return { ...t, tags: revertedTags };
      }));
      toast({ title: `Failed to ${action} tag`, variant: "destructive" });
    } finally {
      setPendingTagIds(prev => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
    }
  };

  const handleCreateAndAssign = async (e?: any) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!newTagName.trim()) return;
    try {
      const res = await apiFetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() })
      });
      if (!res.ok) throw new Error();
      const newTag = await res.json();
      setAllTags((prev: any[]) => [...prev, newTag]);
      setNewTagName("");

      // Optimistic update for the new tag too
      setTasks((prev: any[]) => prev.map((t: any) => t.id === task.id ? { ...t, tags: [...(t.tags || []), newTag] } : t));

      const resAssign = await apiFetch("/api/tasks/bulk-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: [task.id], tagIds: [newTag.id], action: "add" })
      });
      if (!resAssign.ok) throw new Error();
    } catch {
      toast({ title: "Failed to create/assign tag", variant: "destructive" });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex flex-wrap gap-1 cursor-pointer hover:bg-slate-50 min-h-[24px] p-1 rounded group w-full h-full" onClick={(e) => e.stopPropagation()}>
          {taskTags.map((tag: any) => (
            <Badge key={tag.id} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal bg-slate-100 text-slate-600 border border-slate-200">
              {tag.name}
            </Badge>
          ))}
          <div className="opacity-0 group-hover:opacity-100 flex items-center justify-center border border-dashed border-slate-300 rounded px-1 text-slate-400">
            <Plus className="h-3 w-3" />
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <h4 className="font-semibold text-xs text-slate-700">Tags</h4>
          <div className="flex gap-2">
            <Input className="h-7 text-xs" placeholder="New tag name..." value={newTagName} onChange={e => setNewTagName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateAndAssign(e)} />
            <Button className="h-7 text-xs" size="sm" onClick={handleCreateAndAssign}>Add</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <Input
              className="h-7 text-xs pl-7"
              placeholder="Search tags..."
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {allTags
              .filter((tag: any) => tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase()))
              .map((tag: any) => {
                const assigned = taskTags.some((t: any) => String(t.id) === String(tag.id));
                const isPending = pendingTagIds.has(String(tag.id));
                return (
                  <div
                    key={tag.id}
                    className={`flex items-center space-x-2 py-1 px-1 hover:bg-slate-50 rounded cursor-pointer ${isPending ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={() => handleToggle(tag)}
                  >
                    <input type="checkbox" checked={assigned} readOnly className="cursor-pointer" />
                    <label className="text-xs text-slate-700 cursor-pointer">{tag.name}</label>
                  </div>
                );
              })}
            {allTags.filter((tag: any) => tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase())).length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">No tags found.</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}


function InlineSubtaskTagCell({ taskId, subtask, allTags, setAllTags, setTasks }: { taskId: string, subtask: any, allTags: any[], setAllTags: any, setTasks: any }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [pendingTagIds, setPendingTagIds] = useState<Set<string>>(new Set());
  const subtaskTags = subtask.tags || [];

  const updateSubtaskTags = (nextTags: any[]) => {
    setTasks((prev: any[]) => prev.map((t: any) => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        subtasks: (t.subtasks || []).map((s: any) => s.id === subtask.id ? { ...s, tags: nextTags } : s),
      };
    }));
  };

  const handleToggle = async (tag: any) => {
    const tagId = String(tag.id);
    if (pendingTagIds.has(tagId)) return;

    const isAssigned = subtaskTags.some((t: any) => String(t.id) === tagId);
    const action = isAssigned ? "remove" : "add";

    const nextTags = isAssigned
      ? subtaskTags.filter((t2: any) => String(t2.id) !== tagId)
      : [...subtaskTags, tag];
    updateSubtaskTags(nextTags);

    setPendingTagIds(prev => new Set(prev).add(tagId));
    try {
      const res = await apiFetch("/api/subtasks/bulk-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtaskIds: [subtask.id], tagIds: [tag.id], action })
      });
      if (!res.ok) throw new Error();
    } catch {
      // Roll back on failure
      const revertedTags = isAssigned
        ? [...subtaskTags, tag]
        : subtaskTags.filter((t2: any) => String(t2.id) !== tagId);
      updateSubtaskTags(revertedTags);
      toast({ title: `Failed to ${action} tag`, variant: "destructive" });
    } finally {
      setPendingTagIds(prev => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
    }
  };

  const handleCreateAndAssign = async (e?: any) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!newTagName.trim()) return;
    try {
      const res = await apiFetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() })
      });
      if (!res.ok) throw new Error();
      const newTag = await res.json();
      setAllTags((prev: any[]) => [...prev, newTag]);
      setNewTagName("");

      updateSubtaskTags([...subtaskTags, newTag]);

      const resAssign = await apiFetch("/api/subtasks/bulk-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtaskIds: [subtask.id], tagIds: [newTag.id], action: "add" })
      });
      if (!resAssign.ok) throw new Error();
    } catch {
      toast({ title: "Failed to create/assign tag", variant: "destructive" });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex flex-wrap gap-1 cursor-pointer hover:bg-slate-50 min-h-[20px] p-0.5 rounded group w-full h-full" onClick={(e) => e.stopPropagation()}>
          {subtaskTags.map((tag: any) => (
            <Badge key={tag.id} variant="secondary" className="text-[9px] px-1 py-0 font-normal bg-slate-100 text-slate-600 border border-slate-200">
              {tag.name}
            </Badge>
          ))}
          <div className="opacity-0 group-hover:opacity-100 flex items-center justify-center border border-dashed border-slate-300 rounded px-1 text-slate-400">
            <Plus className="h-2.5 w-2.5" />
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <h4 className="font-semibold text-xs text-slate-700">Tags</h4>
          <div className="flex gap-2">
            <Input className="h-7 text-xs" placeholder="New tag name..." value={newTagName} onChange={e => setNewTagName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateAndAssign(e)} />
            <Button className="h-7 text-xs" size="sm" onClick={handleCreateAndAssign}>Add</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <Input
              className="h-7 text-xs pl-7"
              placeholder="Search tags..."
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {allTags
              .filter((tag: any) => tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase()))
              .map((tag: any) => {
                const assigned = subtaskTags.some((t: any) => String(t.id) === String(tag.id));
                const isPending = pendingTagIds.has(String(tag.id));
                return (
                  <div
                    key={tag.id}
                    className={`flex items-center space-x-2 py-1 px-1 hover:bg-slate-50 rounded cursor-pointer ${isPending ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={() => handleToggle(tag)}
                  >
                    <input type="checkbox" checked={assigned} readOnly className="cursor-pointer" />
                    <label className="text-xs text-slate-700 cursor-pointer">{tag.name}</label>
                  </div>
                );
              })}
            {allTags.filter((tag: any) => tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase())).length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">No tags found.</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}


function ManageTagsDialog({ allTags, setAllTags, setTasks }: { allTags: any[], setAllTags: any, setTasks?: any }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [deleteTagTarget, setDeleteTagTarget] = useState<{ id: string; name: string } | null>(null);

  const handleCreate = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await apiFetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() })
      });
      if (!res.ok) throw new Error();
      const newTag = await res.json();
      setAllTags((prev: any[]) => [...prev, newTag]);
      setNewTagName("");
      toast({ title: "Tag created successfully" });
    } catch {
      toast({ title: "Failed to create tag", variant: "destructive" });
    }
  };

  const startEditingTag = (tag: any) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
  };

  const cancelEditingTag = () => {
    setEditingTagId(null);
    setEditingTagName("");
  };

  const handleUpdateTag = async (tagId: string) => {
    if (!editingTagName.trim()) return;
    try {
      const res = await apiFetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingTagName.trim() })
      });
      if (!res.ok) throw new Error();
      const updatedTag = await res.json();
      setAllTags((prev: any[]) => prev.map((t) => (t.id === tagId ? updatedTag : t)));
      window.dispatchEvent(new CustomEvent('tag.updated', { detail: { tag: updatedTag } }));
      cancelEditingTag();
      toast({ title: "Tag updated successfully" });
    } catch {
      toast({ title: "Failed to update tag", variant: "destructive" });
    }
  };

  const handleDeleteTag = async () => {
    if (!deleteTagTarget) return;
    const { id } = deleteTagTarget;
    try {
      const res = await apiFetch(`/api/tags/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAllTags((prev: any[]) => prev.filter((t) => t.id !== id));
      window.dispatchEvent(new CustomEvent('tag.deleted', { detail: { tagId: id } }));
      toast({ title: "Tag deleted successfully" });
    } catch {
      toast({ title: "Failed to delete tag", variant: "destructive" });
    } finally {
      setDeleteTagTarget(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 min-w-[110px] justify-center gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-md shadow-sm transition-all duration-150"
        >
          <Settings2 size={14} className="text-slate-500" />
          <span className="hidden sm:inline">Manage Tags</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage Tags</DialogTitle>
          <DialogDescription>Create, edit, or delete tags here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter new tag name..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate}>Create</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search tags..."
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
            />
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {allTags.filter(tag => tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase())).map(tag => (
              <div key={tag.id} className="flex justify-between items-center p-2 border rounded-md gap-2 transition-colors hover:bg-slate-50">
                {editingTagId === tag.id ? (
                  <>
                    <Input
                      className="h-8 text-sm"
                      value={editingTagName}
                      onChange={(e) => setEditingTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateTag(tag.id);
                        if (e.key === 'Escape') cancelEditingTag();
                      }}
                      autoFocus
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-green-600 hover:bg-green-50 hover:text-green-700"
                        onClick={() => handleUpdateTag(tag.id)}
                      >
                        <Check size={14} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-500 hover:bg-slate-100"
                        onClick={cancelEditingTag}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{tag.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        onClick={() => startEditingTag(tag)}
                        title="Edit tag"
                      >
                        <Edit size={14} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                        onClick={() => setDeleteTagTarget({ id: tag.id, name: tag.name })}
                        title="Delete tag"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {allTags.length === 0 && <p className="text-xs text-slate-500 text-center">No tags yet.</p>}
            {allTags.length > 0 && allTags.filter(tag => tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase())).length === 0 && (
              <p className="text-xs text-slate-500 text-center">No tags match "{tagSearchQuery}".</p>
            )}
          </div>
        </div>
      </DialogContent>

      {/* DELETE TAG CONFIRM DIALOG */}
      <Dialog open={!!deleteTagTarget} onOpenChange={(o) => !o && setDeleteTagTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tag</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Delete <span className="font-bold">{deleteTagTarget?.name}</span>? This will remove it from all tasks.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTagTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTag}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

interface TasksProps {
  // When true, the page is locked to showing only tasks where the current
  // user is either assigned (taskMembers) or the creator (assignerId).
  // Used by AdminTasks.tsx to render a "My Tasks" view without forking
  // any of the underlying data-fetching, filtering, or rendering logic.
  myTasksOnly?: boolean;
}

export default function Tasks({ myTasksOnly = false }: TasksProps = {}) {
  const { isFrozen, frozenProject, frozenProjectId, isItemFrozen, frozenItem } = useFreeze();



  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isAdmin = user?.role === "ADMIN" || user?.employeeCode === "E0001";
  // Task Dependency & Automatic Schedule Management: centralized mandatory
  // "why are you changing this schedule?" popup, shared by every inline
  // date/duration edit on this page.
  const { requestReason, ReasonDialog } = useScheduleChangeReason();

  // Helper: normalize department strings for robust matching
  function normalizeDept(input?: string | null) {
    if (!input) return "";
    let v = String(input).trim().toLowerCase().replace(/\s+/g, " ");
    if (v === 'presales') return v;
    if (v.length > 3 && v.endsWith("s")) v = v.slice(0, -1);
    return v;
  }

  // Data
  const [employees, setEmployees] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  // True while the tasks + key-steps parallel fetch is in flight. Surfaces a
  // visible loading indicator instead of the table silently sitting empty/stale
  // — this was especially noticeable for admins, whose global "all projects"
  // view fetches a much larger dataset than a single-project view.
  const [tasksLoading, setTasksLoading] = useState(false);
  const [keySteps, setKeySteps] = useState<any[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);

  // Filters / UI state
  const [projectId, setProjectId] = useState<string>(() => {
    // Priority 1: URL query param (when navigating from KeySteps / Projects)
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("project_id") || params.get("projectId");
    if (fromUrl) {
      localStorage.setItem("tasks_projectId", fromUrl);
      localStorage.setItem("selectedProjectId", fromUrl);
      return fromUrl;
    }
    return localStorage.getItem("tasks_projectId") || "";
  });
  const [selectedKeyStepId, setSelectedKeyStepId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("keyStepId") || params.get("keystep_id");
    if (fromUrl) {
      localStorage.setItem("tasks_keyStepId", fromUrl);
      return fromUrl;
    }
    return localStorage.getItem("tasks_keyStepId") || "";
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("taskId") || params.get("task_id");
    if (fromUrl) {
      localStorage.setItem("tasks_selectedTaskId", fromUrl);
      return fromUrl;
    }
    return localStorage.getItem("tasks_selectedTaskId") || "";
  });
  const [expandedTasks, setExpandedTasks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>(() => localStorage.getItem("tasks_searchQuery") || "");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>(() => localStorage.getItem("tasks_searchQuery") || "");
  const [clientFilter, setClientFilter] = useState<string>(() => localStorage.getItem("tasks_clientFilter") || "all");
  const [departmentFilter, setDepartmentFilter] = useState<string>(() => localStorage.getItem("tasks_departmentFilter") || "all");
  const [statusFilter, setStatusFilter] = useState<string>(() => localStorage.getItem("tasks_statusFilter") || "all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>(() => localStorage.getItem("tasks_assigneeFilter") || "all");
  const [priorityFilter, setPriorityFilter] = useState<string>(() => localStorage.getItem("tasks_priorityFilter") || "all");
  const [progressFilter, setProgressFilter] = useState<string>(() => localStorage.getItem("tasks_progressFilter") || "all");
  const [periodFilter, setPeriodFilter] = useState<string>(() => localStorage.getItem("tasks_periodFilter") || "all");
  const [overdueFilter, setOverdueFilter] = useState<string>(() => localStorage.getItem("tasks_overdueFilter") || "all");
  const [tagFilter, setTagFilter] = useState<string>(() => localStorage.getItem("tasks_tagFilter") || "all");
  const [startDateFilter, setStartDateFilter] = useState<string>(() => localStorage.getItem("tasks_startDateFilter") || "");
  const [endDateFilter, setEndDateFilter] = useState<string>(() => localStorage.getItem("tasks_endDateFilter") || "");
  const [exportIncludeGantt, setExportIncludeGantt] = useState(false);

  // My Tasks tab state (for admin only)
  const [showMyTasks, setShowMyTasks] = useState<boolean>(() => {
    if (!isAdmin) return false;
    const saved = localStorage.getItem("tasks_showMyTasks");
    return saved ? JSON.parse(saved) : false;
  });

  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [deptPopoverOpen, setDeptPopoverOpen] = useState(false);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const [depDialogOpen, setDepDialogOpen] = useState(false);
  const [pendingFlagTask, setPendingFlagTask] = useState<{ id: string, flag: 'isIssue' | 'isAddon', projectId: string } | null>(null);
  const [selectedParentTaskId, setSelectedParentTaskId] = useState<string>("");
  const [parentTaskPopoverOpen, setParentTaskPopoverOpen] = useState(false);

  // Custom Filters state
  const [columnsConfig, setColumnsConfig] = useState<ColumnConfig[]>(() => {
    // Try DB settings first
    const dbColumns = user?.filterSettings?.columnsConfig;
    const saved: ColumnConfig[] | null = dbColumns && dbColumns.length > 0
      ? dbColumns
      : (() => { const s = localStorage.getItem("tasks_columnsConfig_v2"); return s ? JSON.parse(s) : null; })();

    if (!saved) return defaultColumns;

    // Merge: keep saved config (order/visibility) but always sync label from defaultColumns
    // so renamed columns (e.g. "Remarks" -> "Delayed By") don't get stuck on old saved labels
    const defaultsById = new Map(defaultColumns.map((d) => [d.id, d]));
    const savedIds = new Set(saved.map((c: ColumnConfig) => c.id));
    const merged = saved.map((c: ColumnConfig) => {
      const def = defaultsById.get(c.id);
      return def ? { ...c, label: def.label } : c;
    });
    defaultColumns.forEach((def) => {
      if (!savedIds.has(def.id)) merged.push(def); // Append new columns
    });

    // Auto-fix: if completionDate is stuck at the very beginning (due to previous bug), move it next to endDate
    const cdIdx = merged.findIndex(c => c.id === 'completionDate');
    if (cdIdx === 0) {
      const cd = merged.splice(cdIdx, 1)[0];
      const edIdx = merged.findIndex(c => c.id === 'endDate');
      merged.splice(edIdx !== -1 ? edIdx + 1 : merged.length, 0, cd);
    }

    return merged;
  });

  useEffect(() => {
    localStorage.setItem("tasks_columnsConfig_v2", JSON.stringify(columnsConfig));
  }, [columnsConfig]);

  // Sort config (declared here, before the hydrate/sync effects below, since
  // they read and write it)
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(() => {
    const dbSortConfig = user?.filterSettings?.sortConfig;
    if (dbSortConfig !== undefined) return dbSortConfig;
    const saved = localStorage.getItem("tasks_sortConfig");
    return saved ? JSON.parse(saved) : null;
  });


  const [customFilters, setCustomFilters] = useState<CustomFilter[]>(() => {
    const saved = localStorage.getItem("tasks_customFilters");
    return saved ? JSON.parse(saved) : [];
  });

  // Group By state
  const [groupBy, setGroupBy] = useState<string>("none");

  // Saved filter sets (Favorites)
  const [savedFilterSets, setSavedFilterSets] = useState<Record<string, any>>(() => {
    // Try DB settings first
    const dbFavorites = user?.filterSettings?.savedFilterSets;
    if (dbFavorites && Object.keys(dbFavorites).length > 0) return dbFavorites;

    const saved = localStorage.getItem("tasks_savedFilterSets");
    return saved ? JSON.parse(saved) : {};
  });

  // Pinned Filters (Users can add their own permanent-like filters)
  const [pinnedFilters, setPinnedFilters] = useState<Record<string, string>>(() => {
    // Try DB settings first
    const dbSettings = user?.filterSettings?.pinnedFilters;
    if (dbSettings && Object.keys(dbSettings).length > 0) return dbSettings;

    // Fallback to local storage
    const saved = localStorage.getItem("tasks_pinnedFilters");
    return saved ? JSON.parse(saved) : {};
  });

  // Guards the sync-to-DB effect below from firing with stale/default local
  // state the instant `user` finishes loading. Without this, every refresh,
  // redeploy, or re-login would silently overwrite the correctly saved
  // column/sort preferences with whatever this component's local state
  // happened to be before the user's real settings arrived from the server —
  // this was the root cause of "Manage Columns" and sort order resetting.
  const hydratedFromServerRef = useRef(false);

  // Once the logged-in user's record (and their saved filterSettings) arrives
  // from /api/me, pull columnsConfig / sortConfig / pinnedFilters /
  // savedFilterSets from it so the UI reflects what was actually saved. This
  // covers the common case where Tasks.tsx mounted (and read localStorage or
  // defaults) before that async call had resolved — e.g. on a hard refresh,
  // right after logging back in, or right after a redeploy.
  useEffect(() => {
    if (!user?.id || hydratedFromServerRef.current) return;
    hydratedFromServerRef.current = true;
    const fs = user.filterSettings;
    if (!fs) return;

    if (Array.isArray(fs.columnsConfig) && fs.columnsConfig.length > 0) {
      const defaultsById = new Map(defaultColumns.map((d) => [d.id, d]));
      const savedIds = new Set(fs.columnsConfig.map((c: ColumnConfig) => c.id));
      const merged = fs.columnsConfig.map((c: ColumnConfig) => {
        const def = defaultsById.get(c.id);
        return def ? { ...c, label: def.label } : c;
      });
      defaultColumns.forEach((def) => {
        if (!savedIds.has(def.id)) merged.push(def);
      });
      setColumnsConfig(merged);
    }

    if (fs.sortConfig !== undefined) {
      setSortConfig(fs.sortConfig);
    }

    if (fs.pinnedFilters && Object.keys(fs.pinnedFilters).length > 0) {
      setPinnedFilters(fs.pinnedFilters);
    }

    if (fs.savedFilterSets && Object.keys(fs.savedFilterSets).length > 0) {
      setSavedFilterSets(fs.savedFilterSets);
    }
  }, [user?.id, user?.filterSettings]);

  // Sync Pinned Filters, Saved Filter Sets, Columns Config & Sort Config to DB when changed
  useEffect(() => {
    // Always keep local storage as an offline-friendly fallback.
    localStorage.setItem("tasks_pinnedFilters", JSON.stringify(pinnedFilters));
    localStorage.setItem("tasks_savedFilterSets", JSON.stringify(savedFilterSets));
    localStorage.setItem("tasks_columnsConfig_v2", JSON.stringify(columnsConfig));
    localStorage.setItem("tasks_sortConfig", JSON.stringify(sortConfig));

    // Don't push to the server until the hydration effect above has had a
    // chance to load the user's actually-saved settings first — otherwise
    // this would immediately overwrite them with stale default/local state.
    if (!hydratedFromServerRef.current || !user?.id) return;

    apiFetch("/api/users/filter-settings", {
      method: "PATCH",
      body: JSON.stringify({
        settings: {
          ...user.filterSettings,
          pinnedFilters,
          savedFilterSets,
          columnsConfig,
          sortConfig
        }
      })
    }).catch(err => console.error("Failed to sync filters to DB:", err));
  }, [pinnedFilters, savedFilterSets, columnsConfig, sortConfig, user?.id]);

  // Explicit "Save" action for the Manage Columns popover.
  // Column changes already auto-persist in the effect above, but this gives
  // the user a clear, deliberate save action with confirmation feedback.
  const handleSaveColumns = () => {
    localStorage.setItem("tasks_columnsConfig_v2", JSON.stringify(columnsConfig));
    if (user?.id) {
      apiFetch("/api/users/filter-settings", {
        method: "PATCH",
        body: JSON.stringify({
          settings: {
            ...user.filterSettings,
            pinnedFilters,
            savedFilterSets,
            columnsConfig,
          },
        }),
      })
        .then(() => toast({ title: "Column settings saved" }))
        .catch((err) => {
          console.error("Failed to save column settings:", err);
          toast({ title: "Failed to save column settings", variant: "destructive" });
        });
    } else {
      toast({ title: "Column settings saved" });
    }
  };

  // Persistent standard filters (LocalStorage only)
  useEffect(() => {
    localStorage.setItem("tasks_projectId", projectId);
    localStorage.setItem("tasks_searchQuery", searchQuery);
    localStorage.setItem("tasks_clientFilter", clientFilter);
    localStorage.setItem("tasks_departmentFilter", departmentFilter);
    localStorage.setItem("tasks_statusFilter", statusFilter);
    localStorage.setItem("tasks_assigneeFilter", assigneeFilter);
    localStorage.setItem("tasks_priorityFilter", priorityFilter);
    localStorage.setItem("tasks_progressFilter", progressFilter);
    localStorage.setItem("tasks_periodFilter", periodFilter);
    localStorage.setItem("tasks_overdueFilter", overdueFilter);
    localStorage.setItem("tasks_tagFilter", tagFilter);
    localStorage.setItem("tasks_startDateFilter", startDateFilter);
    localStorage.setItem("tasks_endDateFilter", endDateFilter);
    localStorage.setItem("tasks_showMyTasks", JSON.stringify(showMyTasks));
  }, [projectId, searchQuery, clientFilter, departmentFilter, statusFilter, assigneeFilter, priorityFilter, progressFilter, periodFilter, overdueFilter, showMyTasks, startDateFilter, endDateFilter]);

  // Sync with URL on mount or location change — handles navigation from Projects page (matches KeySteps behavior)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("project_id") || params.get("projectId");
    if (fromUrl && fromUrl !== projectId) {
      setTasks([]); // Clear stale data before loading new project's tasks
      setSelectedKeyStepId("");
      setProjectId(fromUrl);
      localStorage.setItem("tasks_projectId", fromUrl);
      localStorage.setItem("selectedProjectId", fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.location.search]);

  // Multi-select state for tasks
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // Bulk assign state
  const [bulkAssignMembers, setBulkAssignMembers] = useState<string[]>([]);
  const [bulkAssignPopoverOpen, setBulkAssignPopoverOpen] = useState(false);
  const [bulkAssignDepartment, setBulkAssignDepartment] = useState("");
  const [bulkAssignStartDate, setBulkAssignStartDate] = useState<string>("");
  const [bulkAssignEndDate, setBulkAssignEndDate] = useState<string>("");
  const [bulkAssignCompletionDate, setBulkAssignCompletionDate] = useState<string>("");
  // Departments now come from the real departments master table (Settings →
  // Departments) instead of being hardcoded, so any department created there
  // shows up here immediately — even before any employee/task uses it.
  const [departments, setDepartments] = useState<string[]>([]);
  useEffect(() => {
    apiFetch("/api/departments")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to fetch departments", err));
  }, []);

  // Delete dialog state
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Tasks the user has explicitly chosen to move off this page into the Completed
  // archive. Marking a task "Completed" no longer removes it automatically — it stays
  // visible here until the user clicks "Move to Completed" and confirms.
  const [movedToCompletedIds, setMovedToCompletedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("tasks_movedToCompleted");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [taskToMove, setTaskToMove] = useState<Task | null>(null);
  const [openMoveDialog, setOpenMoveDialog] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("tasks_movedToCompleted", JSON.stringify(Array.from(movedToCompletedIds)));
    } catch {
      // ignore storage errors
    }
  }, [movedToCompletedIds]);

  const askMoveToCompleted = (t: Task) => {
    setTaskToMove(t);
    setOpenMoveDialog(true);
  };

  const confirmMoveToCompleted = () => {
    if (!taskToMove) return;
    setMovedToCompletedIds(prev => {
      const next = new Set(prev);
      next.add(taskToMove.id);
      return next;
    });
    setOpenMoveDialog(false);
    setTaskToMove(null);
    toast({ title: "Moved", description: "Task moved to the Completed page." });
  };

  // Bulk Delete
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  // Bulk Key Step
  const [bulkKeyStepId, setBulkKeyStepId] = useState<string>("");
  const [bulkKeyStepPopoverOpen, setBulkKeyStepPopoverOpen] = useState(false);

  // Bulk CC
  const [bulkAssignTagsList, setBulkAssignTagsList] = useState<string[]>([]);
  const [bulkTagPopoverOpen, setBulkTagPopoverOpen] = useState(false);

  // Bulk Task Owner
  const [bulkTaskOwnerId, setBulkTaskOwnerId] = useState<string>("");
  const [bulkTaskOwnerPopoverOpen, setBulkTaskOwnerPopoverOpen] = useState(false);


  // Show completed
  const [showCompleted, setShowCompleted] = useState<boolean>(() => {
    const saved = localStorage.getItem("tasks_showCompleted");
    return saved ? JSON.parse(saved) : false;
  });

  // Addon / Issue filter
  const [addonFilter, setAddonFilter] = useState<string>("all"); // all | addon | issue

  // Drag & drop for task reordering
  const dragTaskId = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  // Fix: the row previously had `draggable` set unconditionally, which in
  // every major browser blocks native click-and-drag text selection for
  // anything inside it (task name, dates, assignees, etc. all became
  // impossible to select/copy). Instead, only arm dragging while the grip
  // handle itself is being pressed, so normal text stays selectable.
  const [dragReadyTaskId, setDragReadyTaskId] = useState<string | null>(null);

  // Delay reason
  const [delayReasonOpen, setDelayReasonOpen] = useState(false);
  const [delayReasonTask, setDelayReasonTask] = useState<Task | null>(null);
  const [delayReasonText, setDelayReasonText] = useState("");
  const [delayReasonSaving, setDelayReasonSaving] = useState(false);
  const [pendingNavigateTask, setPendingNavigateTask] = useState<Task | null>(null);

  // Move to position
  const [moveToPositionTaskId, setMoveToPositionTaskId] = useState<string | null>(null);
  const [moveToPositionValue, setMoveToPositionValue] = useState("");

  // Export
  const [exportColSelOpen, setExportColSelOpen] = useState(false);
  const [exportType, setExportType] = useState<'pdf' | 'excel' | null>(null);
  const [exportSelectedCols, setExportSelectedCols] = useState<string[]>([]);

  // Quick Add Task
  const [quickAddTaskOpen, setQuickAddTaskOpen] = useState(false);
  const [quickTaskName, setQuickTaskName] = useState("");
  const [quickAddTaskProjectId, setQuickAddTaskProjectId] = useState<string>("");
  const [quickAddTaskKeyStepId, setQuickAddTaskKeyStepId] = useState<string>("");
  // Defaults to today, same behavior as the full Add Task page, so a task
  // created from this quick dialog always has a Start Date saved.
  const [quickAddTaskStartDate, setQuickAddTaskStartDate] = useState<string>(() => new Date().toISOString().split("T")[0]);


  // Compact inline quick add task
  const [newQuickTaskName, setNewQuickTaskName] = useState("");
  const [newQuickTaskProjectId, setNewQuickTaskProjectId] = useState("");

  // Sync quick add project with current project filter
  useEffect(() => {
    if (projectId) {
      setNewQuickTaskProjectId(projectId);
    }
  }, [projectId]);

  // Sync showCompleted to localStorage
  useEffect(() => {
    localStorage.setItem("tasks_showCompleted", JSON.stringify(showCompleted));
  }, [showCompleted]);

  const submitQuickTaskAtTop = async () => {
    const trimmedName = newQuickTaskName.trim();
    if (!trimmedName) {
      toast({ title: "Please enter a task name", variant: "destructive" });
      return;
    }
    const targetProjId = (newQuickTaskProjectId && newQuickTaskProjectId !== "all")
      ? newQuickTaskProjectId
      : (projectId && projectId !== "all" ? projectId : "");
    if (!targetProjId) {
      toast({ title: "Please select a project first", variant: "destructive" });
      return;
    }
    // Optimistic UI
    const tempId = `tmp-${Date.now()}`;
    const optimisticTask: Task = {
      id: tempId,
      projectId: targetProjId,
      taskName: trimmedName,
      status: "pending",
      priority: "medium",
      assignerId: user?.employeeId ?? "",
      subtasks: [],
      progress: 0,
    };
    setTasks(prev => [optimisticTask, ...prev]);
    setNewQuickTaskName("");
    try {
      const res = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: targetProjId,
          taskName: trimmedName,
          description: "",
          status: "pending",
          priority: "medium",
          assignerId: user?.employeeId ?? null,
          taskOwnerId: user?.employeeId ?? null,
          taskMembers: [],
          subtasks: [],
          taskPeriod: "custom",
          reminderFrequency: "1 Time",
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error("[QUICK-ADD] Failed:", errBody);
        setTasks(prev => prev.filter(t => t.id !== tempId));
        toast({ title: `Failed to create task: ${errBody?.error || errBody?.details?.[0]?.message || "Unknown error"}`, variant: "destructive" });
        return;
      }
      toast({ title: "Task created" });
      refreshTasks();
    } catch (err) {
      console.error("[QUICK-ADD] Error:", err);
      setTasks(prev => prev.filter(t => t.id !== tempId));
      toast({ title: "Failed to create task", variant: "destructive" });
    }
  };

  // Quick Add Subtask (kept, even if UI not shown here)
  const [quickAddSubtaskOpen, setQuickAddSubtaskOpen] = useState(false);
  const [quickSubtaskTaskId, setQuickSubtaskTaskId] = useState("");
  const [quickSubtaskTitle, setQuickSubtaskTitle] = useState("");
  const [quickSubtaskStartDate, setQuickSubtaskStartDate] = useState("");
  const [quickSubtaskEndDate, setQuickSubtaskEndDate] = useState("");
  const [quickSubtaskCompleted, setQuickSubtaskCompleted] = useState(false);

  // Clone modals
  const [cloneTaskOpen, setCloneTaskOpen] = useState(false);
  const [cloneTaskData, setCloneTaskData] = useState<{ id: string; name: string } | null>(null);
  const [cloneTaskNewName, setCloneTaskNewName] = useState("");

  const [cloneSubtaskOpen, setCloneSubtaskOpen] = useState(false);
  const [cloneSubtaskData, setCloneSubtaskData] = useState<{ id: string; title: string } | null>(null);
  const [cloneSubtaskNewTitle, setCloneSubtaskNewTitle] = useState("");

  // Inline add-subtask form state (per-task)
  const [subtaskForms, setSubtaskForms] = useState<Record<string, { title: string; startDate: string; endDate: string; status: string; isCompleted: boolean }>>({});

  const updateSubtaskForm = (taskId: string, field: string, value: any) => {
    setSubtaskForms(prev => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        [field]: value,
      },
    }));
  };

  const addInlineSubtask = async (taskId: string) => {
    const form = subtaskForms[taskId] || { title: "", startDate: "", endDate: "", status: "Planned", isCompleted: false };
    if (!form.title || form.title.trim() === "") {
      alert("Subtask name is required");
      return;
    }

    // optimistic UI: add temporary subtask (id = temp)
    const tempId = `tmp-${Date.now()}`;
    const newSubtask: Subtask = {
      id: tempId,
      title: form.title.trim(),
      description: "",
      isCompleted: !!form.isCompleted,
      assignedTo: [],
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      taskOwnerId: null,
      priority: "medium",
      status: form.isCompleted ? "Completed" : "Not Started",
      ccMembers: [],
    };

    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, subtasks: [...(t.subtasks || []), newSubtask] } : t)));

    // reset form
    setSubtaskForms(prev => ({ ...prev, [taskId]: { title: "", startDate: "", endDate: "", status: "Planned", isCompleted: false } }));

    // persist
    try {
      const res = await apiFetch(`/api/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          title: newSubtask.title,
          startDate: newSubtask.startDate || null,
          endDate: newSubtask.endDate || null,
          completed: newSubtask.isCompleted,
        }),
      });

      if (!res.ok) throw new Error("Failed to create subtask");

      const created = await res.json().catch(() => null);
      const realId = created?.id;
      if (realId) {
        // Swap the temp ID for the real one in place — no need to refetch
        // the whole task list (which would wipe out other expanded rows'
        // subtasks) just to learn this one new ID.
        setTasks(prev => prev.map(t => (t.id === taskId
          ? { ...t, subtasks: (t.subtasks || []).map(s => s.id === tempId ? { ...s, id: realId } : s) }
          : t)));
      } else {
        // Fallback: we don't know the real ID, so resync from the server.
        refreshTasks();
      }
    } catch (err) {
      // revert optimistic
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, subtasks: (t.subtasks || []).filter(s => s.id !== tempId) } : t)));
      console.error(err);
      alert("Failed to add subtask");
    }
  };
  const toggleSubtaskCompletion = async (taskId: string, subtaskId: string, currentlyCompleted?: boolean) => {
    const targetVal = typeof currentlyCompleted !== 'undefined' ? !currentlyCompleted : true;
    const newProgress = targetVal ? 100 : 0;
    const newStatus = targetVal ? "Completed" : "Not Started";

    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: t.subtasks?.map(s => s.id === subtaskId ? { ...s, isCompleted: targetVal, progress: newProgress, status: newStatus } : s)
        };
      }
      return t;
    }));

    try {
      const res = await apiFetch(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: newProgress, status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update subtask");
      if (targetVal) sessionStorage.setItem("__completedRefresh", Date.now().toString());
    } catch (err) {
      console.error(err);
      alert("Failed to update subtask status");
      refreshTasks();
    }
  };

  const toggleSubtaskFlag = async (taskId: string, subtaskId: string, field: 'isAddon' | 'isIssue', value: boolean) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, subtasks: t.subtasks?.map(s => s.id === subtaskId ? { ...s, [field]: value } : s) }
        : t
    ));
    try {
      const res = await apiFetch(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error("Failed to update subtask flag");
    } catch {
      // Revert on failure
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, subtasks: t.subtasks?.map(s => s.id === subtaskId ? { ...s, [field]: !value } : s) }
          : t
      ));
      alert("Failed to update subtask flag");
    }
  };

  const updateSubtaskProgress = async (taskId: string, subtaskId: string, value: number) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: t.subtasks?.map(s => s.id === subtaskId ? { ...s, progress: value, isCompleted: value === 100 } : s)
        };
      }
      return t;
    }));

    try {
      const res = await apiFetch(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: value }),
      });
      if (!res.ok) throw new Error("Failed to update subtask progress");
    } catch (err) {
      console.error(err);
      refreshTasks();
    }
  };

  // Inline edit state for subtask fields (mirrors editingTaskField/tempTaskValue,
  // but keyed by subtaskId so it doesn't collide with the parent task's own
  // in-progress edit).
  const [editingSubtaskField, setEditingSubtaskField] = useState<{ subtaskId: string; field: string } | null>(null);
  const [tempSubtaskValue, setTempSubtaskValue] = useState<string>("");

  const startEditingSubtask = (subtaskId: string, field: string, initialValue: string) => {
    setEditingSubtaskField({ subtaskId, field });
    if (!initialValue && field === "completionDate") {
      setTempSubtaskValue(getTodayStr());
    } else {
      setTempSubtaskValue(initialValue || "");
    }
  };

  // Generic inline update for a subtask field (Owner, Priority, Status, CC Members, etc).
  // Mirrors handleInlineTaskUpdate's optimistic-update + PATCH pattern, but scoped to
  // the lighter-weight /api/subtasks/:id endpoint (no schedule-change-reason prompt).
  const handleInlineSubtaskUpdate = async (taskId: string, subtaskId: string, field: string, value: any) => {
    const isCompletingStatus = field === "status" && (value === "Completed" || value === "completed");
    const isReopeningStatus = field === "status" && value !== "Completed" && value !== "completed" && value !== "Cancelled" && value !== "cancelled";

    // Duration (Number of Days): recompute End Date = Start Date + durationDays,
    // same instant-feedback pattern as handleInlineTaskUpdate.
    let computedEndDateForDuration: string | undefined;
    if (field === "durationDays") {
      const currentTask = tasks.find(t => t.id === taskId);
      const currentSubtask = currentTask?.subtasks?.find(s => s.id === subtaskId);
      const durationNum = value === "" || value === null || typeof value === 'undefined' ? null : Number(value);
      if (durationNum !== null && !isNaN(durationNum) && currentSubtask?.startDate) {
        const startD = new Date(currentSubtask.startDate);
        if (!isNaN(startD.getTime())) {
          const newEnd = new Date(startD);
          newEnd.setDate(newEnd.getDate() + durationNum);
          computedEndDateForDuration = newEnd.toISOString().split("T")[0];
        }
      }
    }

    // Optimistic update
    setTasks(prev => prev.map(t => t.id !== taskId ? t : {
      ...t,
      subtasks: (t.subtasks || []).map(s => s.id === subtaskId ? {
        ...s,
        [field]: value,
        ...(typeof computedEndDateForDuration !== 'undefined' ? { endDate: computedEndDateForDuration } : {}),
        ...(isCompletingStatus ? { isCompleted: true, progress: 100 } : {}),
        ...(isReopeningStatus ? { isCompleted: false } : {}),
      } : s),
    }));
    setEditingSubtaskField(null);

    try {
      const res = await apiFetch(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error("Failed to update subtask");
      if (["status", "priority", "taskOwnerId"].includes(field)) {
        toast({ title: "Updated", description: `Subtask ${field === "taskOwnerId" ? "owner" : field} has been saved.` });
      }
    } catch (err) {
      console.error("Failed to update subtask field:", field, err);
      toast({ variant: "destructive", title: "Error", description: "Failed to update subtask. Please try again." });
      refreshTasks();
    }
  };

  const toggleSubtaskCcMember = async (taskId: string, subtaskId: string, currentCc: string[], employeeId: string) => {
    const isAssigned = currentCc.some(id => String(id) === String(employeeId));
    const newCc = isAssigned ? currentCc.filter(id => String(id) !== String(employeeId)) : [...currentCc, employeeId];
    await handleInlineSubtaskUpdate(taskId, subtaskId, "ccMembers", newCc);
  };

  const [editingTaskField, setEditingTaskField] = useState<{ taskId: string; field: string } | null>(null);
  // Guards against the same inline edit firing twice in a row (e.g. Enter
  // triggering onKeyDown AND the native date input's own onBlur almost
  // simultaneously), which previously could race with the schedule-change
  // reason dialog and silently drop one of the two attempts.
  const inlineUpdateInFlightRef = useRef<string | null>(null);

  // Prevent the browser's native "scroll focused element into view" behavior
  // from jumping the table around when zoomed in or clicking any cell/control.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const restoreScroll = () => {
      const left = el.scrollLeft;
      const top = el.scrollTop;
      // Run after the browser's native scrollIntoView has fired, then snap back.
      requestAnimationFrame(() => {
        if (el.scrollLeft !== left) el.scrollLeft = left;
        if (el.scrollTop !== top) el.scrollTop = top;
      });
    };
    el.addEventListener("focusin", restoreScroll, true);
    el.addEventListener("click", restoreScroll, true);
    return () => {
      el.removeEventListener("focusin", restoreScroll, true);
      el.removeEventListener("click", restoreScroll, true);
    };
  }, []);
  const [tempTaskValue, setTempTaskValue] = useState<string>("");

  // ----- Generic resizable column widths (all columns) -----
  const DEFAULT_COL_WIDTHS: Record<string, number> = {
    taskName: 280, assignedBy: 130, taskOwner: 130, project: 140, keyStep: 130,
    period: 90, frequency: 110, assignees: 130, ccMembers: 130, tags: 150,
    startDate: 95, endDate: 95, completionDate: 110, durationDays: 90,
    priority: 90, status: 110, progress: 120, remarks: 90, flags: 100,
  };
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("tasks_columnWidths_v1");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const colResizeRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);
  useEffect(() => {
    localStorage.setItem("tasks_columnWidths_v1", JSON.stringify(colWidths));
  }, [colWidths]);
  const getColWidth = (colId: string) => colWidths[colId] ?? DEFAULT_COL_WIDTHS[colId] ?? 120;
  const MANAGE_COL_WIDTH = 210;
  const visibleResizableColumns = columnsConfig.filter(c => c.visible && c.id !== 'serial');
  const tableWidth = 40 + 24 + 32 + 32 + MANAGE_COL_WIDTH + visibleResizableColumns.reduce(
    (total, column) => total + getColWidth(column.id),
    0,
  );

  const handleColResizeStart = (e: React.MouseEvent, colId: string) => {
    e.preventDefault();
    e.stopPropagation();
    colResizeRef.current = { colId, startX: e.clientX, startWidth: getColWidth(colId) };
    let latestWidth = colResizeRef.current.startWidth;
    const onMove = (moveEvent: MouseEvent) => {
      if (!colResizeRef.current) return;
      const { startX, startWidth } = colResizeRef.current;
      const delta = moveEvent.clientX - startX;
      latestWidth = Math.min(800, Math.max(60, startWidth + delta));
      setColWidths(prev => ({ ...prev, [colId]: latestWidth }));
    };
    const onUp = () => {
      colResizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setColWidths(prev => ({ ...prev, [colId]: latestWidth }));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  // Backward-compatible alias (taskName column) still used by a few older call sites
  const taskNameColWidth = getColWidth("taskName");
  const handleTaskNameResizeStart = (e: React.MouseEvent) => handleColResizeStart(e, "taskName");

  // For date fields, clicking into inline edit with no existing value should
  // default to today's date (still fully editable/changeable by the user),
  // instead of opening blank and forcing a manual pick every time.
  const getTodayStr = () => new Date().toISOString().split("T")[0];

  const startEditingTask = (taskId: string, field: string, initialValue: string) => {
    setEditingTaskField({ taskId, field });
    if (!initialValue && (field === "startDate" || field === "endDate" || field === "completionDate")) {
      setTempTaskValue(getTodayStr());
    } else {
      setTempTaskValue(initialValue || "");
    }
  };

  const handleInlineTaskUpdate = async (
    taskId: string,
    field: string,
    value: any,
    scheduleReasonOptions?: { skipPrompt?: boolean; forcedReason?: { reason: string; reasonCategory: string } }
  ) => {
    // Task Dependency & Automatic Schedule Management: a manual change to
    // Start Date, End Date, or Duration made here (inline, in the Tasks
    // table) requires a reason — but only when it's an actual *change* to a
    // date that was already set. Filling in a date/duration that was
    // previously empty ("----") is a first-time entry, not a reschedule, so
    // no reason is needed for that.
    const isScheduleField = field === "startDate" || field === "endDate" || field === "durationDays";
    const taskBeforeEdit = tasks.find(t => t.id === taskId);
    const hadExistingValue = taskBeforeEdit
      ? (taskBeforeEdit as any)[field] !== null && (taskBeforeEdit as any)[field] !== undefined && (taskBeforeEdit as any)[field] !== ""
      : false;

    // Dedupe: the same edit can be triggered twice in a row for one user
    // action — e.g. pressing Enter fires onKeyDown AND blurs the native
    // date input, which also fires onBlur. Without this guard, both calls
    // could race to open the reason dialog, and the second call would
    // silently steal the first call's pending promise, leaving the first
    // call awaiting forever and never saving.
    const updateKey = `${taskId}:${field}`;
    if (inlineUpdateInFlightRef.current === updateKey) {
      return;
    }

    // No-op guard: if the value hasn't actually changed, don't require a
    // reschedule reason or hit the API at all — just close the editor.
    // Previously ANY blur (even without changing the date) would trigger
    // the mandatory "why are you changing this schedule?" popup, which
    // made it look like a normal click-away edit wasn't taking effect.
    if (isScheduleField && !scheduleReasonOptions?.forcedReason) {
      const isDateField = field === "startDate" || field === "endDate";
      const normalize = (v: any) => {
        if (v === null || v === undefined || v === "") return "";
        if (isDateField) {
          const d = new Date(v);
          return isNaN(d.getTime()) ? String(v) : d.toISOString().split("T")[0];
        }
        return String(v);
      };
      const beforeVal = taskBeforeEdit ? normalize((taskBeforeEdit as any)[field]) : "";
      if (normalize(value) === beforeVal) {
        setEditingTaskField(null);
        return;
      }
    }

    let scheduleReasonPayload = scheduleReasonOptions?.forcedReason || null;
    if (isScheduleField && hadExistingValue && !scheduleReasonPayload && !scheduleReasonOptions?.skipPrompt) {
      inlineUpdateInFlightRef.current = updateKey;
      try {
        const result = await requestReason();
        scheduleReasonPayload = { reason: result.reason, reasonCategory: result.reasonCategory };
      } catch {
        // User cancelled the reason prompt — abort this edit entirely,
        // nothing is changed locally or on the server.
        setEditingTaskField(null);
        return;
      } finally {
        if (inlineUpdateInFlightRef.current === updateKey) {
          inlineUpdateInFlightRef.current = null;
        }
      }
    }

    // Validate start/end date relationship: end date cannot be before start date
    // Compare as actual Date objects so this works regardless of whether the
    // stored value is "YYYY-MM-DD" or a full ISO datetime string.
    const currentTask = taskBeforeEdit;
    const toDateOnly = (v: any) => {
      if (!v) return null;
      const d = new Date(v);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().split("T")[0];
    };
    if (field === "endDate") {
      const startD = toDateOnly(currentTask?.startDate);
      const endD = toDateOnly(value);
      if (startD && endD && endD < startD) {
        value = currentTask!.startDate;
      }
    }
    if (field === "startDate") {
      const newStartD = toDateOnly(value);
      const endD = toDateOnly(currentTask?.endDate);
      if (newStartD && endD && endD < newStartD) {
        // Push the end date forward too, so it never ends up before the new start date
        handleInlineTaskUpdate(taskId, "endDate", value, {
          skipPrompt: true,
          forcedReason: scheduleReasonPayload || undefined,
        });
      }
    }

    // Duration (Number of Days): recompute End Date = Start Date + durationDays
    // immediately, client-side, for instant feedback (server recomputes/saves the
    // authoritative value too).
    let computedEndDateForDuration: string | undefined;
    if (field === "durationDays") {
      const durationNum = value === "" || value === null || typeof value === 'undefined' ? null : Number(value);
      if (durationNum !== null && !isNaN(durationNum) && currentTask?.startDate) {
        const startD = new Date(currentTask.startDate);
        if (!isNaN(startD.getTime())) {
          const newEnd = new Date(startD);
          newEnd.setDate(newEnd.getDate() + durationNum);
          computedEndDateForDuration = newEnd.toISOString().split("T")[0];
        }
      }
    }

    // When marking a task Completed via inline edit, the server auto-sets
    // progress to 100% — reflect that immediately in the optimistic update too,
    // so the progress bar/column updates right away instead of only after a refresh.
    const isCompletingStatus = field === "status" && (value === "Completed" || value === "completed");

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? {
      ...t,
      [field]: value,
      ...(typeof computedEndDateForDuration !== 'undefined' ? { endDate: computedEndDateForDuration } : {}),
      ...(isCompletingStatus ? { progress: 100 } : {}),
    } : t));
    setEditingTaskField(null);

    // Notify other components in the same window to update their local caches
    try {
      const payloadField = field === "taskMembers" ? "assignedMembers" : field;
      window.dispatchEvent(new CustomEvent('task.updated', { detail: { taskId, field: payloadField, value } }));
    } catch (err) {
      // ignore
    }

    // NOTE: Completed tasks are no longer auto-removed from this page. They stay
    // visible (struck-through) until the user explicitly clicks "Move to Completed"
    // in the Manage column and confirms.

    try {
      // Backend mapping: UI 'taskMembers' -> Backend 'assignedMembers'
      const payloadField = field === "taskMembers" ? "assignedMembers" : field;

      const res = await apiFetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [payloadField]: value,
          ...(scheduleReasonPayload
            ? { scheduleChangeReason: scheduleReasonPayload.reason, reasonCategory: scheduleReasonPayload.reasonCategory }
            : {}),
        }),
      });

      if (!res.ok) throw new Error("Update failed");

      // Show success toast for important field updates
      if (["status", "priority", "keyStepId", "taskMembers"].includes(field)) {
        toast({
          title: "Updated",
          description: `Task ${field} has been saved.`,
        });
      }

      // Task Dependency & Automatic Schedule Management: a Start/End/Duration
      // edit can cascade and shift OTHER tasks' dates on the server. The
      // optimistic update above only touched this one field on this one
      // task, so re-sync the full task list here to pick up any cascaded
      // successors — this keeps both the table and the Gantt/Dependency
      // view correct immediately, without needing a manual page refresh.
      if (isScheduleField) {
        refreshTasks();
      }
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update task. Please try again.",
      });
      refreshTasks(); // Revert/sync with server
      try { window.dispatchEvent(new CustomEvent('task.update.failed', { detail: { taskId, field, value } })); } catch (e) { /* ignore */ }
    }
  };

  const handleMemberToggle = (taskId: string, memberId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const currentMembers = Array.isArray(task.taskMembers) ? task.taskMembers : [];
    const isMember = currentMembers.some(id => String(id) === String(memberId));

    let newMembers;
    if (isMember) {
      newMembers = currentMembers.filter(id => String(id) !== String(memberId));
    } else {
      newMembers = [...currentMembers, memberId];
    }

    // Optimistic UI update - immediate visual feedback
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, taskMembers: newMembers } : t));

    // Dispatch event immediately for cross-page sync
    window.dispatchEvent(new CustomEvent('task.updated', {
      detail: { taskId, field: 'assignedMembers', value: newMembers }
    }));

    // Backend call happens in background, no await
    apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedMembers: newMembers }),
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to update task members");
        toast({
          title: "Success",
          description: "Team member assigned successfully"
        });
      })
      .catch((err) => {
        // Revert optimistic update on failure only
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, taskMembers: currentMembers } : t));

        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to assign member. Changes reverted."
        });
      });
  };

  /* ================= LOAD INITIAL DATA ================= */

  useEffect(() => {
    apiFetch("/api/projects")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setProjects(arr);
        // Derive unique clients from projects
        const clientSet = new Set<string>();
        arr.forEach((p: any) => { if (p.clientName) clientSet.add(String(p.clientName)); });
        setClients(Array.from(clientSet));
      })
      .catch(() => setProjects([]));

    // Load tags
    apiFetch("/api/tags")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setAllTags(Array.isArray(data) ? data : []))
      .catch(() => setAllTags([]));

    // Load discussions to show comment counts
    apiFetch("/api/discussions")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setDiscussions(Array.isArray(data) ? data : []))
      .catch(() => setDiscussions([]));

    // Initially load all employees if no project is selected (global view)
    if (!projectId) {
      apiFetch("/api/employees")
        .then((r) => r.ok ? r.json() : [])
        .then((data) => {
          const arr = Array.isArray(data) ? data : [];
          setEmployees(arr);
          setAllEmployees(arr);
        })
        .catch(() => {
          setEmployees([]);
          setAllEmployees([]);
        });
    } else {
      // Still need all employees for lookup even if a project is selected
      apiFetch("/api/employees")
        .then((r) => r.ok ? r.json() : [])
        .then((data) => setAllEmployees(Array.isArray(data) ? data : []))
        .catch(() => setAllEmployees([]));
    }
  }, []);

  /* ================= LOAD PROJECT-SPECIFIC DATA (PARALLEL) ================= */

  // Load tasks and keysteps in parallel when projectId changes
  useEffect(() => {
    setSelectedTaskIds([]);
    const statusParam = statusFilter === "all" ? (showCompleted ? "all" : "") : statusFilter;

    const loadProjectData = async () => {
      setTasksLoading(true);
      try {
        const [tasksData, keystepsData] = await Promise.all([
          apiFetch(
            projectId
              ? `/api/tasks/${projectId}?status=${statusParam}`
              : `/api/tasks/bulk?status=${statusParam}`
            // NOTE: bypassCache removed on purpose. apiClient already caches GETs
            // for 5 minutes AND already clears the entire cache automatically on
            // any POST/PUT/DELETE (see apiClient.ts). So re-visiting the same
            // project/filter combo now reuses the cached response instantly
            // instead of re-hitting the network + DB every single time, while
            // task mutations still always show fresh data since they wipe cache.
          ).then((r) => r.ok ? r.json() : []),
          apiFetch(
            projectId
              ? `/api/projects/${projectId}/key-steps`
              : `/api/keysteps/bulk?status=all`
          ).then((r) => r.ok ? r.json() : []),
        ]);

        console.log("[TASKS DEBUG] Parallel load completed - tasks:", tasksData.length, "keysteps:", keystepsData.length);
        setTasks(normalizeTasks(tasksData));
        setKeySteps(Array.isArray(keystepsData) ? keystepsData : []);
      } catch (err) {
        console.error("[TASKS DEBUG] Parallel fetch failed:", err);
        setTasks([]);
        setKeySteps([]);
      } finally {
        setTasksLoading(false);
      }
    };

    loadProjectData();
  }, [projectId, statusFilter, showCompleted]);

  // Load members separately with retry fallback
  useEffect(() => {
    if (!projectId) {
      // Global view: use all employees
      if (allEmployees.length > 0) {
        setEmployees(allEmployees);
      }
      return;
    }

    // Project-specific members
    apiFetch(`/api/projects/${projectId}/members`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        const memberList = Array.isArray(data) ? data : [];
        console.log(`[TASKS-MEMBERS] Loaded ${memberList.length} members for project ${projectId}`);
        // If no project members found, fallback to all employees
        if (memberList.length === 0 && allEmployees.length > 0) {
          console.log(`[TASKS-MEMBERS] No project members found, falling back to all employees (${allEmployees.length})`);
          setEmployees(allEmployees);
        } else {
          setEmployees(memberList);
        }
      })
      .catch((err) => {
        console.error("[TASKS-MEMBERS] Failed to fetch project members:", err);
        // Fallback to all employees
        apiFetch("/api/employees")
          .then(r => r.ok ? r.json() : [])
          .then(data => setEmployees(Array.isArray(data) ? data : []));
      });
  }, [projectId, allEmployees]);

  /* ================= PERSIST FILTERS TO LOCALSTORAGE (COMBINED) ================= */

  // Batch all filter persistence into a single useEffect to reduce re-renders
  useEffect(() => {
    localStorage.setItem("tasks_projectId", projectId);
    localStorage.setItem("tasks_keyStepId", selectedKeyStepId);
    localStorage.setItem("tasks_selectedTaskId", selectedTaskId);
    localStorage.setItem("tasks_searchQuery", searchQuery);
    localStorage.setItem("tasks_clientFilter", clientFilter);
    localStorage.setItem("tasks_departmentFilter", departmentFilter);
    localStorage.setItem("tasks_statusFilter", statusFilter);
    localStorage.setItem("tasks_assigneeFilter", assigneeFilter);
    localStorage.setItem("tasks_priorityFilter", priorityFilter);
    localStorage.setItem("tasks_progressFilter", progressFilter);
    localStorage.setItem("tasks_customFilters", JSON.stringify(customFilters));
    localStorage.setItem("tasks_savedFilterSets", JSON.stringify(savedFilterSets));
    localStorage.setItem("tasks_pinnedFilters", JSON.stringify(pinnedFilters));
  }, [projectId, selectedKeyStepId, selectedTaskId, searchQuery, clientFilter, departmentFilter, statusFilter, assigneeFilter, priorityFilter, progressFilter, customFilters, savedFilterSets, pinnedFilters]);

  // Listen for new tasks created in keysteps page
  useEffect(() => {
    const handleTaskCreated = (ev: any) => {
      const newTask = ev?.detail?.task;
      if (!newTask) return;

      // Run it through the same field-normalizing logic used everywhere else
      // (handles startDate/start_date, assignedMembers/taskMembers, etc.) so
      // a freshly-created task (e.g. with today's auto-selected date) shows
      // up correctly without needing a manual page refresh.
      const [normalized] = normalizeTasks([newTask]);
      if (!normalized) return;

      // Add to tasks list immediately
      setTasks((prev) => [normalized, ...prev]);
    };

    const handleTaskEdited = (ev: any) => {
      const updated = ev?.detail?.task;
      if (!updated) return;

      const [normalized] = normalizeTasks([updated]);
      if (!normalized) return;

      setTasks((prev) => {
        const exists = prev.some(t => t.id === normalized.id);
        if (exists) {
          // Preserve any locally-loaded subtasks if the event payload didn't
          // include them (normalizeTasks would otherwise reset to []).
          return prev.map(t => t.id === normalized.id
            ? {
              ...t,
              ...normalized,
              subtasks: (Array.isArray(normalized.subtasks) && normalized.subtasks.length > 0)
                ? normalized.subtasks
                : t.subtasks,
            }
            : t);
        }
        return [normalized, ...prev]; // in case it's not in current filtered view yet
      });
    };

    const handleSubtaskCreated = (ev: any) => {
      const { subtask, taskId } = ev?.detail || {};
      if (!subtask || !taskId) return;

      // Subtasks are handled at the task detail level, no action needed here
      // but we listen to this event for awareness
    };

    const handleKeystepDeleted = (ev: any) => {
      const { keyStepId } = ev?.detail || {};
      if (!keyStepId) return;

      // Remove tasks associated with deleted keystep
      setTasks((prev) => prev.filter((t) => t.keyStepId !== keyStepId));
    };

    const handleProjectDeleted = (ev: any) => {
      const { projectId } = ev?.detail || {};
      if (!projectId) return;

      // Remove all tasks associated with deleted project
      setTasks((prev) => prev.filter((t) => t.projectId !== projectId));
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setKeySteps((prev) => prev.filter((k) => k.projectId !== projectId));
    };

    const handleTagUpdated = (ev: any) => {
      const { tag } = ev?.detail || {};
      if (!tag?.id) return;

      // Patch the tag's name wherever it appears in already-loaded tasks
      setTasks((prev) => prev.map((t) => {
        if (!t.tags || t.tags.length === 0) return t;
        const hasTag = t.tags.some((tg: any) => String(tg.id) === String(tag.id));
        if (!hasTag) return t;
        return {
          ...t,
          tags: t.tags.map((tg: any) => String(tg.id) === String(tag.id) ? { ...tg, name: tag.name } : tg),
        };
      }));
    };

    const handleTagDeleted = (ev: any) => {
      const { tagId } = ev?.detail || {};
      if (!tagId) return;

      // Remove the deleted tag from any already-loaded tasks
      setTasks((prev) => prev.map((t) => {
        if (!t.tags || t.tags.length === 0) return t;
        const hasTag = t.tags.some((tg: any) => String(tg.id) === String(tagId));
        if (!hasTag) return t;
        return { ...t, tags: t.tags.filter((tg: any) => String(tg.id) !== String(tagId)) };
      }));
    };

    window.addEventListener('task.created', handleTaskCreated as EventListener);
    window.addEventListener('task.edited', handleTaskEdited as EventListener);
    window.addEventListener('subtask.created', handleSubtaskCreated as EventListener);
    window.addEventListener('keystep.deleted', handleKeystepDeleted as EventListener);
    window.addEventListener('project.deleted', handleProjectDeleted as EventListener);
    window.addEventListener('tag.updated', handleTagUpdated as EventListener);
    window.addEventListener('tag.deleted', handleTagDeleted as EventListener);

    return () => {
      window.removeEventListener('task.created', handleTaskCreated as EventListener);
      window.removeEventListener('task.edited', handleTaskEdited as EventListener);
      window.removeEventListener('subtask.created', handleSubtaskCreated as EventListener);
      window.removeEventListener('keystep.deleted', handleKeystepDeleted as EventListener);
      window.removeEventListener('project.deleted', handleProjectDeleted as EventListener);
      window.removeEventListener('tag.updated', handleTagUpdated as EventListener);
      window.removeEventListener('tag.deleted', handleTagDeleted as EventListener);
    };
  }, []);

  // Debounce search query to reduce filter computations (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // User must select at minimum a Department OR a Project before tasks are shown
  // UNLESS the user is an Admin, who sees everything by default.
  // UPDATE: User wants to see tasks even if "All Projects" is selected.
  const hasRequiredFilter = true; // Always show tasks but apply filters

  /* ================= FILTER HELPERS ================= */

  const projectMap = useMemo(() => new Map<string, any>(projects.map((p: any) => [String(p.id), p])), [projects]);
  const employeeMap = useMemo(() => new Map<string, any>(allEmployees.map((e: any) => [String(e.id), e])), [allEmployees]);
  const keyStepMap = useMemo(() => new Map<string, any>(keySteps.map((k: any) => [String(k.id), k])), [keySteps]);

  // Pre-compute filter constants to avoid recomputation in every filter check
  const filterConstants = useMemo(() => ({
    searchLower: debouncedSearchQuery.toLowerCase(),
    filterDeptNorm: normalizeDept(departmentFilter),
    selectedEmployeeObj: employeeMap.get(String(assigneeFilter)),
    statusFilterLower: statusFilter.toLowerCase(),
    priorityFilterLower: priorityFilter.toLowerCase(),
    clientFilterLower: clientFilter.toLowerCase(),
  }), [debouncedSearchQuery, departmentFilter, assigneeFilter, statusFilter, priorityFilter, clientFilter, employeeMap]);

  // Pre-compute task data for faster filtering
  const enrichedTasks = useMemo(() => {
    return tasks.map((t) => ({
      task: t,
      project: projectMap.get(String(t.projectId)),
      memberNames: (t.taskMembers || [])
        .map(mId => employeeMap.get(String(mId))?.name || "")
        .join(" "),
      taskStatusLower: (t.status || "").toLowerCase(),
      taskPriorityLower: (t.priority || "").toLowerCase(),
      projectDepts: projectMap.get(String(t.projectId))?.department || [],
      memberDepts: (t.taskMembers || []).flatMap((memberId: string) => {
        const emp = employeeMap.get(String(memberId));
        return emp?.department ? [emp.department as string] : [];
      }),
    }));
  }, [tasks, projectMap, employeeMap]);

  /* ================= FILTERED TASKS ================= */

  const uniqueProgressValues = useMemo(
    () => Array.from(new Set(tasks.map(t => t.progress || 0))).sort((a, b) => a - b),
    [tasks]
  );

  const filteredTasks: Task[] = useMemo(() => {
    if (!hasRequiredFilter) return [];

    const { searchLower, filterDeptNorm, selectedEmployeeObj, statusFilterLower, priorityFilterLower, clientFilterLower } = filterConstants;
    const empDept = selectedEmployeeObj ? normalizeDept(selectedEmployeeObj.department) : "";
    const periodMap: Record<string, string> = {
      "1": "today",
      "7": "1 week",
      "15": "fortnight",
      "30": "1 month",
      "90": "quarterly",
      "180": "half yearly",
      "365": "annual"
    };

    const filtered = enrichedTasks.map(e => e.task).filter((t, idx) => {
      const enriched = enrichedTasks[idx];
      const { project, memberNames, taskStatusLower, taskPriorityLower, projectDepts, memberDepts } = enriched;
      const allDepts = [...projectDepts, ...memberDepts];

      // Search filter
      const matchesSearch = !searchLower ||
        (t.taskName || "").toLowerCase().includes(searchLower) ||
        (project && project.title && project.title.toLowerCase().includes(searchLower)) ||
        memberNames.toLowerCase().includes(searchLower) ||
        taskStatusLower.includes(searchLower) ||
        (t.description && t.description.toLowerCase().includes(searchLower)) ||
        taskPriorityLower.includes(searchLower);

      // Key step filter
      const matchesKey = !selectedKeyStepId || String(t.keyStepId) === String(selectedKeyStepId);

      // Client filter
      const matchesClient = clientFilter === "all" ||
        (project && project.clientName && project.clientName.toLowerCase() === clientFilterLower);

      // Department filter
      const matchesDepartment = departmentFilter === "all" ||
        allDepts.some((d: string) => normalizeDept(d) === filterDeptNorm);

      // Status filter
      const matchesStatus = statusFilter === "all" || taskStatusLower === statusFilterLower;

      // Assignee filter
      const matchesAssignee = assigneeFilter === "all" || (() => {
        const isAssigned = (t.taskMembers || []).some((id: string) => String(id) === String(assigneeFilter)) ||
          String(t.assignerId) === String(assigneeFilter);

        const allDeptsNorm = allDepts.map(d => normalizeDept(d));
        const isDeptRelated = empDept && allDeptsNorm.some(d => d === empDept);

        return isAssigned || isDeptRelated;
      })();

      // Priority filter
      const matchesPriority = priorityFilter === "all" || taskPriorityLower === priorityFilterLower;

      // Progress filter
      const matchesProgress = progressFilter === "all" || String(t.progress || 0) === progressFilter;

      // Period filter
      let matchesPeriod = true;
      if (periodFilter !== "all") {
        const mappedPeriod = periodMap[periodFilter];
        if (mappedPeriod && t.taskPeriod === mappedPeriod) {
          matchesPeriod = true;
        } else {
          const days = parseInt(periodFilter);
          if (!isNaN(days)) {
            const now = new Date();
            const targetDate = new Date();
            targetDate.setDate(now.getDate() - days);

            const taskStart = t.startDate ? new Date(t.startDate) : null;
            const taskEnd = t.endDate ? new Date(t.endDate) : null;

            if (days === 1) {
              const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
              matchesPeriod = !!((taskStart && taskStart <= endOfToday) && (taskEnd && taskEnd >= startOfToday));
            } else {
              matchesPeriod = !!((taskStart && taskStart >= targetDate) || (taskEnd && taskEnd >= targetDate));
            }
          }
        }
      }

      // Start / End Date filters
      if (startDateFilter || endDateFilter) {
        const tStart = t.startDate ? new Date(t.startDate) : null;
        if (tStart) { tStart.setHours(0, 0, 0, 0); }

        if (startDateFilter && !endDateFilter) {
          const filterStart = new Date(startDateFilter);
          filterStart.setHours(0, 0, 0, 0);
          if (!tStart || tStart.getTime() !== filterStart.getTime()) {
            matchesPeriod = false;
          }
        } else if (startDateFilter && endDateFilter) {
          const filterStart = new Date(startDateFilter);
          filterStart.setHours(0, 0, 0, 0);
          const filterEnd = new Date(endDateFilter);
          filterEnd.setHours(23, 59, 59, 999);
          if (!tStart || tStart < filterStart || tStart > filterEnd) {
            matchesPeriod = false;
          }
        }
      }

      // Overdue filter
      let matchesOverdue = true;
      if (overdueFilter !== "all") {
        const now = new Date();
        const end = t.endDate ? new Date(t.endDate) : null;
        const isCompleted = taskStatusLower === "completed";
        // A task is only overdue once its End Date is strictly before today —
        // not merely "before tomorrow", which incorrectly flagged tasks that
        // end today as overdue.
        const isOverdue = !!(end && end < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && !isCompleted);
        matchesOverdue = overdueFilter === "overdue" ? isOverdue : true;
      }

      // Custom filters
      const matchesCustom = customFilters.every(cf => {
        if (!cf.value) return true;
        let taskValue: any = t[cf.field as keyof Task];
        if (cf.field === "startDate" || cf.field === "endDate") {
          if (!taskValue) return false;
        }
        const val = String(taskValue || "").toLowerCase();
        const filterVal = cf.value.toLowerCase();
        switch (cf.operator) {
          case "==": return val === filterVal;
          case "!=": return val !== filterVal;
          case "contains": return val.includes(filterVal);
          case ">": return Number(taskValue || 0) > Number(cf.value);
          case "<": return Number(taskValue || 0) < Number(cf.value);
          default: return true;
        }
      });

      // Pinned filters
      const matchesPinned = Object.entries(pinnedFilters).every(([field, value]) => {
        if (!value || value === "all") return true;
        const taskValue = t[field as keyof Task];
        return String(taskValue || "").toLowerCase() === value.toLowerCase();
      });

      // My Tasks filter - STRICT: only show if user is in members
      let matchesMyTasks = true;
      if (myTasksOnly && user?.employeeId) {
        // AdminTasks.tsx locks this on for its whole lifetime: show only
        // tasks the current user is assigned to OR created (assignerId).
        const uid = String(user.employeeId).trim();
        const memberIds = Array.isArray(t.taskMembers) ? t.taskMembers.map(m => String(m).trim()) : [];
        const isAssignedTo = memberIds.includes(uid);
        const isCreatedBy = String(t.assignerId || "").trim() === uid;
        matchesMyTasks = isAssignedTo || isCreatedBy;
      } else if (showMyTasks && isAdmin && user?.employeeId) {
        const adminId = String(user.employeeId).trim();

        // Check taskMembers array
        const memberIds = Array.isArray(t.taskMembers) ? t.taskMembers.map(m => String(m).trim()) : [];
        const isInMembers = memberIds.includes(adminId);

        // ONLY show if user is assigned to the task
        matchesMyTasks = isInMembers;
      }

      // Addon/Issue filter
      let matchesAddon = true;
      if (addonFilter === "addon") matchesAddon = !!t.isAddon;
      else if (addonFilter === "issue") matchesAddon = !!t.isIssue;

      // Tag filter
      const matchesTag = tagFilter === "all" || (t.tags || []).some(tag => String(tag.id) === String(tagFilter));

      // Completed filter
      // Completed tasks stay visible on this page (struck-through) by default.
      // They're only hidden once the user explicitly moves them via the Manage
      // column's "Move to Completed" action. Ticking "Completed" reveals moved
      // tasks again too.
      const matchesCompleted = showCompleted ? true : !movedToCompletedIds.has(t.id);

      // Cancelled filter
      // Cancelled tasks are hidden by default, unless explicitly requested via the status filter.
      let matchesCancelled = true;
      if (taskStatusLower === "cancelled") {
        matchesCancelled = (statusFilterLower === "cancelled");
      }

      // Global Freeze: when a project is frozen, scope everything to it on
      // top of whatever the existing filters already narrowed down to.
      let matchesFreeze = !isFrozen || frozenProjectId == null || String(t.projectId) === String(frozenProjectId);

      // Optional further narrowing to one selected Key Step or Task.
      if (matchesFreeze && isItemFrozen && frozenItem) {
        if (frozenItem.type === "task") {
          matchesFreeze = String(t.id) === String(frozenItem.id);
        } else if (frozenItem.type === "keystep") {
          matchesFreeze = String(t.keyStepId) === String(frozenItem.id);
        }
      }

      return matchesSearch && matchesKey && matchesClient && matchesDepartment && matchesStatus && matchesAssignee && matchesCustom && matchesPriority && matchesProgress && matchesPinned && matchesPeriod && matchesOverdue && matchesMyTasks && matchesAddon && matchesCompleted && matchesCancelled && matchesTag && matchesFreeze;
    });

    // Sort the result if sortConfig is active.
    //
    // IMPORTANT: this used to call `.find()` on the full projects/keySteps/
    // allEmployees arrays *inside* the sort comparator. Array.prototype.sort
    // calls its comparator roughly O(n log n) times, so for admin-sized task
    // lists (hundreds to a couple thousand tasks, since admins see every
    // project) this became hundreds of thousands of linear array scans —
    // recomputed from scratch on every keystroke in the search box (since
    // this whole memo re-runs whenever the debounced search term changes).
    // That's what froze the browser tab. Precomputing each task's sort key
    // once (O(n), using the O(1) maps we already have) and sorting on that
    // fixes it regardless of list size.
    // Compute the ordered flat list first (either sorted, or default sortOrder)
    let orderedFlat: Task[];
    if (sortConfig) {
      const { column, direction } = sortConfig;
      const isDateCol = column === 'startDate' || column === 'endDate' || column === 'completionDate' || column === 'createdAt' || column === 'completedAt';
      const keyed = filtered.map((t) => {
        let key: any = t[column as keyof Task];
        let hasValue = true;
        if (column === 'project') {
          key = projectMap.get(String(t.projectId))?.title || "";
        } else if (column === 'keyStep') {
          key = keyStepMap.get(String(t.keyStepId))?.title || "";
        } else if (isDateCol) {
          if (key) {
            key = new Date(key).getTime();
          } else {
            hasValue = false;
            key = direction === 'asc' ? Infinity : -Infinity;
          }
        } else if (column === 'taskOwner') {
          key = employeeMap.get(String(t.taskOwnerId))?.name || "";
        } else if (column === 'assignedBy') {
          key = employeeMap.get(String(t.assignerId))?.name || "";
        } else if (column === 'tags') {
          key = (t.tags || []).map((tg: any) => tg.name).sort().join(', ');
        }
        return { t, key, hasValue };
      });
      keyed.sort((a, b) => {
        // Push items without values to the end regardless of direction
        if (!a.hasValue && !b.hasValue) return 0;
        if (!a.hasValue) return 1;
        if (!b.hasValue) return -1;
        if (a.key < b.key) return direction === 'asc' ? -1 : 1;
        if (a.key > b.key) return direction === 'asc' ? 1 : -1;
        return 0;
      });
      orderedFlat = keyed.map((k) => k.t);
    } else {
      // Default sort by sortOrder then fallback to original order
      filtered.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      orderedFlat = filtered;
    }

    // Group tasks: place tasks with parentTaskId immediately under their parent —
    // now applied regardless of whether a column sort is active, so Addon/Issue
    // tasks always nest under their chosen parent like a subtask.
    const childMap = new Map<string, Task[]>();
    const topLevel: Task[] = [];

    for (const t of orderedFlat) {
      if (t.parentTaskId) {
        const children = childMap.get(t.parentTaskId) || [];
        children.push(t);
        childMap.set(t.parentTaskId, children);
      } else {
        topLevel.push(t);
      }
    }

    // If a parent is filtered out but its child is not, treat child as top-level
    for (const t of orderedFlat) {
      if (t.parentTaskId && !orderedFlat.find(p => p.id === t.parentTaskId)) {
        topLevel.push(t);
        childMap.delete(t.parentTaskId); // Prevent duplicate pushing
      }
    }

    const grouped: Task[] = [];
    for (const t of topLevel) {
      grouped.push(t);
      const children = childMap.get(t.id);
      if (children) {
        grouped.push(...children);
      }
    }

    return grouped;
  }, [enrichedTasks, filterConstants, selectedKeyStepId, clientFilter, departmentFilter, statusFilter, assigneeFilter, priorityFilter, progressFilter, periodFilter, overdueFilter, customFilters, pinnedFilters, hasRequiredFilter, showMyTasks, myTasksOnly, isAdmin, user?.employeeId, user?.id, user?.employeeCode, allEmployees, tasks.length, addonFilter, sortConfig, showCompleted, movedToCompletedIds, projectMap, keyStepMap, employeeMap, isFrozen, frozenProjectId, isItemFrozen, frozenItem]);

  /* ================= PAGINATION =================
     Rendering hundreds/thousands of task rows (each with inline-editable
     cells, dropdowns, avatars, tag pills) as real DOM nodes all at once is
     the main reason the page feels slow even though the backend is fast.
     Instead of a full virtualization rewrite (risky to do blind), we cap
     how many rows are actually mounted at a time via simple pagination. */
  const TASKS_PAGE_SIZE = 100;
  const [currentTasksPage, setCurrentTasksPage] = useState(1);

  // Reset to page 1 whenever the filtered result set changes (new filters,
  // new project, new search, etc.) so we never get stuck on an empty page.
  useEffect(() => {
    setCurrentTasksPage(1);
  }, [projectId, selectedKeyStepId, clientFilter, departmentFilter, statusFilter, assigneeFilter, priorityFilter, progressFilter, periodFilter, overdueFilter, customFilters, showMyTasks, addonFilter, searchQuery, groupBy]);

  const totalTasksPages = Math.max(1, Math.ceil(filteredTasks.length / TASKS_PAGE_SIZE));

  // Clamp in case filters shrink the result set below the current page.
  const safeCurrentTasksPage = Math.min(currentTasksPage, totalTasksPages);

  const paginatedTasks: Task[] = useMemo(() => {
    const start = (safeCurrentTasksPage - 1) * TASKS_PAGE_SIZE;
    return filteredTasks.slice(start, start + TASKS_PAGE_SIZE);
  }, [filteredTasks, safeCurrentTasksPage]);

  // Select all tasks in current filtered view
  const allSelected =
    filteredTasks.length > 0 &&
    filteredTasks.every((t) => selectedTaskIds.includes(t.id));

  const toggleSelectAll = () => {
    if (allSelected) setSelectedTaskIds([]);
    else setSelectedTaskIds(filteredTasks.map((t) => t.id));
  };

  const toggleSelectTask = (id: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  /* ================= HELPERS ================= */

  const toggleExpand = (id: string) => {
    const willExpand = !expandedTasks.includes(id);
    setExpandedTasks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

    if (!willExpand) return;

    // Lazy-load: the bulk/admin view only sends a subtaskCount up front, not
    // the full subtask objects. If we're expanding a task that has subtasks
    // (count > 0) but we haven't fetched the real list for it yet, fetch it
    // now and merge it in. Tasks loaded from the per-project endpoint (which
    // still sends full subtasks eagerly, for now) already have a populated
    // array, so this is a no-op for them.
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    const hasCount = (target.subtaskCount ?? 0) > 0;
    const alreadyLoaded = Array.isArray(target.subtasks) && target.subtasks.length > 0;
    if (!hasCount || alreadyLoaded) return;

    apiFetch(`/api/tasks/${id}/subtasks`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const loaded = Array.isArray(data) ? data : [];
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                ...t,
                subtasks: loaded.map((st: any) => ({
                  ...st,
                  isCompleted: !!st.isCompleted,
                  progress: st.progress || 0,
                  isAddon: !!(st.isAddon || st.is_addon),
                  isIssue: !!(st.isIssue || st.is_issue),
                  keyStepId: st.keyStepId || st.key_step_id || null,
                  taskPeriod: st.taskPeriod || st.task_period || "custom",
                  reminderFrequency: st.reminderFrequency || st.reminder_frequency || "1 time",
                  assignerId: st.assignerId || st.assigner_id || null,
                  durationDays: typeof st.durationDays === 'number' ? st.durationDays : (typeof st.duration_days === 'number' ? st.duration_days : null),
                  completionDate: st.completionDate || st.completion_date || null,
                  tags: st.tags || [],
                })),
              }
              : t
          )
        );
      })
      .catch(() => {
        /* leave subtasks empty; expand chevron still shows the count badge */
      });
  };

  const openAdd = () => {
    if (projectId && projectId !== "") {
      navigate(`/add-task?projectId=${projectId}`);
    } else {
      navigate(`/add-task`);
    }
  };

  const askDelete = (t: Task) => {
    setTaskToDelete(t);
    setOpenDeleteDialog(true);
  };

  const normalizeTasks = (arr: any[]): Task[] => {
    return (Array.isArray(arr) ? arr : []).map((t: any) => ({
      id: t.id,
      projectId: t.projectId,
      keyStepId: t.keyStepId ?? t.key_step_id ?? null,
      taskName: t.taskName || t.task_name || "",
      description: t.description || "",
      status: t.status || "",
      priority: t.priority || "medium",
      startDate: t.startDate || t.start_date || null,
      endDate: t.endDate || t.end_date || null,
      durationDays: typeof t.durationDays === 'number' ? t.durationDays : (typeof t.duration_days === 'number' ? t.duration_days : null),
      assignerId: t.assignerId || t.assigner_id || null,
      taskOwnerId: t.taskOwnerId || t.task_owner_id || null,
      // backend returns `assignedMembers`; UI expects `taskMembers`
      taskMembers: t.taskMembers || t.assignedMembers || t.assigned_members || [],
      ccMembers: t.ccMembers || t.cc_members || [],
      tags: t.tags || [],
      progress: t.progress || 0,
      taskPeriod: t.taskPeriod || t.task_period || "custom",
      reminderFrequency: t.reminderFrequency || t.reminder_frequency || "4 times",
      sortOrder: t.sortOrder ?? t.sort_order ?? 0,
      isAddon: !!(t.isAddon || t.is_addon),
      isIssue: !!(t.isIssue || t.is_issue),
      parentTaskId: t.parentTaskId || t.parent_task_id || null,
      createdAt: t.createdAt || t.created_at || null,
      completedAt: t.completedAt || t.completed_at || null,
      completionDate: t.completionDate || t.completion_date || t.completedAt || t.completed_at || null,
      // Prefer an explicit subtaskCount from the server (bulk/admin view);
      // fall back to the length of a full subtasks array when the endpoint
      // sends one (per-project view still does, for now).
      subtaskCount: typeof t.subtaskCount === "number" ? t.subtaskCount : (Array.isArray(t.subtasks) ? t.subtasks.length : 0),
      subtasks: (Array.isArray(t.subtasks) ? t.subtasks : []).map((st: any) => ({
        ...st,
        isCompleted: !!st.isCompleted,
        progress: st.progress || 0,
        isAddon: !!(st.isAddon || st.is_addon),
        isIssue: !!(st.isIssue || st.is_issue),
        keyStepId: st.keyStepId || st.key_step_id || null,
        taskPeriod: st.taskPeriod || st.task_period || "custom",
        reminderFrequency: st.reminderFrequency || st.reminder_frequency || "1 time",
        assignerId: st.assignerId || st.assigner_id || null,
        durationDays: typeof st.durationDays === 'number' ? st.durationDays : (typeof st.duration_days === 'number' ? st.duration_days : null),
        completionDate: st.completionDate || st.completion_date || null,
        tags: st.tags || [],
      })),
    }));
  };

  const refreshTasks = async () => {
    try {
      const statusParam = statusFilter === "all" ? (showCompleted ? "all" : "") : statusFilter;
      const url = projectId
        ? `/api/tasks/${projectId}?status=${statusParam}`
        : `/api/tasks/bulk?status=${statusParam}`;
      const updated = await apiFetch(url, { bypassCache: true }).then((r) => r.ok ? r.json() : []);
      setTasks(normalizeTasks(updated));
    } catch {
      setTasks([]);
    }
  };

  // (removed: old useEffect that called setProjectId("") on mount
  //  which conflicted with localStorage-based navigation)

  /* ================= BULK ASSIGN ================= */

  const handleBulkAssign = async () => {
    if (selectedTaskIds.length === 0) return;
    if (bulkAssignMembers.length === 0 && !bulkAssignDepartment && !bulkAssignStartDate && !bulkAssignEndDate && !bulkAssignCompletionDate) {
      alert("Please select at least one member, department, or date.");
      return;
    }

    // Store original state for rollback in case of error
    const originalTasks = tasks;

    try {
      // OPTIMISTIC UPDATE: Update UI immediately before API call
      setTasks(prev => prev.map(task => {
        if (selectedTaskIds.includes(task.id)) {
          const updatedTask = { ...task };

          // Update dates if provided
          if (bulkAssignStartDate) updatedTask.startDate = bulkAssignStartDate;
          if (bulkAssignEndDate) updatedTask.endDate = bulkAssignEndDate;
          if (bulkAssignCompletionDate) updatedTask.completionDate = bulkAssignCompletionDate;

          // ADD members to existing ones (don't replace)
          if (bulkAssignMembers.length > 0) {
            const existingMembers = updatedTask.taskMembers || [];
            const memberSet = new Set(existingMembers);
            bulkAssignMembers.forEach(m => memberSet.add(m));
            updatedTask.taskMembers = Array.from(memberSet);
          }

          return updatedTask;
        }
        return task;
      }));

      // Then call the API
      const res = await apiFetch("/api/tasks/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskIds: selectedTaskIds,
          employeeIds: bulkAssignMembers,
          startDate: bulkAssignStartDate || null,
          endDate: bulkAssignEndDate || null,
          completionDate: bulkAssignCompletionDate || null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Bulk assign failed");
      }

      const data = await res.json();
      alert(data.message || "Tasks assigned successfully");

      setBulkAssignMembers([]);
      setBulkAssignPopoverOpen(false);
      setBulkAssignDepartment("");
      setBulkAssignStartDate("");
      setBulkAssignEndDate("");
      setBulkAssignCompletionDate("");
      setSelectedTaskIds([]);

      // Refresh tasks from server to sync all changes
      await refreshTasks();
    } catch (err) {
      console.error("Bulk assign error:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to bulk assign tasks";
      alert(errorMsg);
      // ROLLBACK: Revert to original state on error
      setTasks(originalTasks);
    }
  };

  // Bulk-remove the selected assignees from every selected task (the multi-select
  // "Assignees" bulk action previously only supported adding people, with no way
  // to remove them from many tasks at once).
  const handleBulkRemoveAssignees = async () => {
    if (selectedTaskIds.length === 0 || bulkAssignMembers.length === 0) return;

    const originalTasks = tasks;
    const removeSet = new Set(bulkAssignMembers.map(String));

    try {
      // OPTIMISTIC UPDATE
      setTasks(prev => prev.map(task => {
        if (!selectedTaskIds.includes(task.id)) return task;
        const existingMembers = Array.isArray(task.taskMembers) ? task.taskMembers : [];
        return { ...task, taskMembers: existingMembers.filter(m => !removeSet.has(String(m))) };
      }));

      const res = await apiFetch("/api/tasks/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskIds: selectedTaskIds,
          employeeIds: bulkAssignMembers,
          mode: "remove",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Bulk remove failed");
      }

      const data = await res.json();
      alert(data.message || "Assignees removed successfully");

      setBulkAssignMembers([]);
      setBulkAssignPopoverOpen(false);
      setSelectedTaskIds([]);

      await refreshTasks();
    } catch (err) {
      console.error("Bulk remove assignees error:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to remove assignees";
      alert(errorMsg);
      setTasks(originalTasks);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTaskIds.length === 0) return;

    // Store original state for rollback
    const originalTasks = tasks;

    try {
      // Optimistic update
      setTasks(prev => prev.filter(t => !selectedTaskIds.includes(t.id)));

      const res = await apiFetch("/api/tasks/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: selectedTaskIds }),
      });

      if (!res.ok) throw new Error("Bulk delete failed");

      toast({ title: "Tasks deleted successfully" });
      setSelectedTaskIds([]);
      setBulkDeleteConfirmOpen(false);
      refreshTasks();
    } catch (err) {
      toast({ title: "Failed to delete tasks", variant: "destructive" });
      setTasks(originalTasks); // Rollback
    }
  };

  const handleBulkUpdateKeyStep = async () => {
    if (selectedTaskIds.length === 0 || !bulkKeyStepId) return;

    const originalTasks = tasks;

    try {
      // Optimistic update
      setTasks(prev => prev.map(t =>
        selectedTaskIds.includes(t.id) ? { ...t, keyStepId: bulkKeyStepId } : t
      ));

      const res = await apiFetch("/api/tasks/bulk-update-keystep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: selectedTaskIds, keyStepId: bulkKeyStepId }),
      });

      if (!res.ok) throw new Error("Bulk keystep update failed");

      toast({ title: "Key steps assigned successfully" });
      setBulkKeyStepPopoverOpen(false);
      setBulkKeyStepId("");
      setSelectedTaskIds([]);
      refreshTasks();
    } catch (err) {
      toast({ title: "Failed to assign key steps", variant: "destructive" });
      setTasks(originalTasks);
    }
  };


  const [newTagName, setNewTagName] = useState("");
  const [bulkTagSearchQuery, setBulkTagSearchQuery] = useState("");
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await apiFetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() })
      });
      if (!res.ok) throw new Error("Failed to create tag");
      const newTag = await res.json();
      setAllTags(prev => [...prev, newTag]);
      setBulkAssignTagsList(prev => [...prev, newTag.id]);
      setNewTagName("");
      toast({ title: "Tag created successfully" });
    } catch (err) {
      toast({ title: "Failed to create tag", variant: "destructive" });
    }
  };

  const handleBulkAssignTags = async (action: "add" | "remove") => {
    if (selectedTaskIds.length === 0 || bulkAssignTagsList.length === 0) return;
    try {
      const res = await apiFetch("/api/tasks/bulk-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskIds: selectedTaskIds,
          tagIds: bulkAssignTagsList,
          action
        })
      });
      if (!res.ok) throw new Error("Bulk tag failed");
      toast({ title: `Tags ${action}ed successfully` });
      setBulkTagPopoverOpen(false);
      setBulkAssignTagsList([]);
      refreshTasks();
    } catch (err) {
      toast({ title: `Failed to ${action} tags`, variant: "destructive" });
    }
  };

  const handleBulkAssignTaskOwner = async () => {
    if (selectedTaskIds.length === 0 || !bulkTaskOwnerId) return;

    const originalTasks = tasks;

    try {
      // Optimistic update
      setTasks(prev => prev.map(t =>
        selectedTaskIds.includes(t.id) ? { ...t, taskOwnerId: bulkTaskOwnerId } : t
      ));

      const res = await apiFetch("/api/tasks/bulk-assign-task-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: selectedTaskIds, taskOwnerId: bulkTaskOwnerId }),
      });

      if (!res.ok) throw new Error("Bulk task owner assign failed");

      toast({ title: "Task owner assigned successfully" });
      setBulkTaskOwnerPopoverOpen(false);
      setBulkTaskOwnerId("");
      setSelectedTaskIds([]);
      refreshTasks();
    } catch (err) {
      toast({ title: "Failed to assign task owner", variant: "destructive" });
      setTasks(originalTasks);
    }
  };

  /* ================= REORDER HANDLERS ================= */

  const handleTaskDragStart = (e: React.DragEvent, id: string) => {
    dragTaskId.current = id;
    isDraggingRef.current = true;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleTaskDragEnd = () => {
    setDragReadyTaskId(null);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  };

  const handleTaskDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragTaskId.current !== id) {
      setDragOverTaskId(id);
    }
  };

  const handleTaskDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverTaskId(null);
    const sourceId = dragTaskId.current;
    if (!sourceId || sourceId === targetId) return;

    dragTaskId.current = null;
    await executeReorder(sourceId, targetId);
  };

  const handleMoveToPosition = async (sourceId: string, targetId: string) => {
    await executeReorder(sourceId, targetId);
  };

  const executeReorder = async (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    // Clear sortConfig to ensure manual sort order is visible
    setSortConfig(null);

    const currentOrder = filteredTasks.map(t => t.id);
    const sourceIndex = currentOrder.indexOf(sourceId);
    const targetIndex = currentOrder.indexOf(targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    // Create new order array
    const newOrder = [...currentOrder];
    newOrder.splice(sourceIndex, 1);
    newOrder.splice(targetIndex, 0, sourceId);

    // Optimistic update - we need to update the sortOrder of all affected tasks
    const updatedTasks = [...tasks];
    newOrder.forEach((id, index) => {
      const t = updatedTasks.find(t => t.id === id);
      if (t) t.sortOrder = index;
    });
    setTasks(updatedTasks);

    try {
      await apiFetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: newOrder }),
      });
    } catch (err) {
      toast({ title: "Failed to reorder tasks", variant: "destructive" });
      refreshTasks(); // Revert on failure
    }
  };

  /* ================= DELAY REASON ================= */

  const submitDelayReason = async () => {
    if (!delayReasonTask || !delayReasonText.trim()) return;

    setDelayReasonSaving(true);
    try {
      const res = await apiFetch(`/api/tasks/${delayReasonTask.id}/delay-reason`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: delayReasonText }),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast({ title: "Reason saved successfully" });
      setDelayReasonOpen(false);
      setDelayReasonText("");

      // If they were trying to navigate to it, do it now
      if (pendingNavigateTask) {
        navigate(`/edit-task?id=${pendingNavigateTask.id}&projectId=${pendingNavigateTask.projectId}`);
        setPendingNavigateTask(null);
      }
    } catch (err) {
      toast({ title: "Failed to save reason", variant: "destructive" });
    } finally {
      setDelayReasonSaving(false);
    }
  };

  const handleTaskClick = (task: Task, e: React.MouseEvent) => {
    // If clicking on checkboxes, buttons, or inputs, don't navigate
    const target = e.target as HTMLElement;
    if (
      isDraggingRef.current ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("[role='dialog']") ||
      target.closest(".no-navigate") // Custom class for things that shouldn't trigger row click
    ) {
      return;
    }

    // Check if task is overdue
    const end = task.endDate ? new Date(task.endDate) : null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isOverdue = !!(end && end < today && task.status !== "Completed" && task.status !== "completed");

    if (isOverdue) {
      // Show delay reason popup
      setDelayReasonTask(task);
      setPendingNavigateTask(task);
      setDelayReasonOpen(true);
    } else {
      navigate(`/edit-task?id=${task.id}&projectId=${task.projectId}`);
    }
  };

  /* ================= EXPORT ================= */

  // Shared visual language for both PDF & Excel exports (matches the reference project-plan report)
  const EXPORT_NAVY: [number, number, number] = [31, 78, 120];       // 1F4E78
  const EXPORT_SUBBAND: [number, number, number] = [46, 117, 182];   // 2E75B6
  const EXPORT_PHASE_COLORS: [number, number, number][] = [
    [31, 78, 120],   // 1F4E78 navy
    [132, 60, 12],   // 843C0C brown
    [55, 86, 35],    // 375623 green
    [74, 35, 90],    // 4A235A purple
    [26, 73, 113],   // 1A4971 steel blue
    [44, 62, 80],    // 2C3E50 slate
  ];
  const EXPORT_STRIPE: [number, number, number] = [245, 248, 252];   // F5F8FC
  const EXPORT_STATUS_COLORS: Record<string, { bg: [number, number, number]; fg: [number, number, number] }> = {
    "Completed": { bg: [212, 237, 218], fg: [21, 87, 36] },
    "In Progress": { bg: [255, 243, 205], fg: [133, 100, 4] },
    "Not Started": { bg: [233, 236, 239], fg: [73, 80, 87] },
    "On Hold": { bg: [233, 236, 239], fg: [73, 80, 87] },
    "Planned": { bg: [222, 235, 250], fg: [42, 88, 138] },
    "Cancelled": { bg: [248, 215, 218], fg: [114, 28, 36] },
    "Pending": { bg: [233, 236, 239], fg: [73, 80, 87] },
  };
  const EXPORT_HEX = {
    navy: "FF1F4E78", subband: "FF2E75B6", white: "FFFFFFFF", stripe: "FFF5F8FC",
    phases: ["FF1F4E78", "FF843C0C", "FF375623", "FF4A235A", "FF1A4971", "FF2C3E50"],
    ganttDone: "FF70AD47", ganttProgress: "FFFFC000", ganttPlanned: "FF9DC3E6", ganttDelayed: "FFD62828",
    ganttWeekend: "FFE8E8E8", ganttHeadWeekend: "FF3D6B8C",
    status: {
      "Completed": { bg: "FFD4EDDA", fg: "FF155724" },
      "In Progress": { bg: "FFFFF3CD", fg: "FF856404" },
      "Not Started": { bg: "FFE9ECEF", fg: "FF495057" },
      "On Hold": { bg: "FFE9ECEF", fg: "FF495057" },
      "Planned": { bg: "FFDEEBFA", fg: "FF2A588A" },
      "Cancelled": { bg: "FFF8D7DA", fg: "FF721C24" },
      "Pending": { bg: "FFE9ECEF", fg: "FF495057" },
    } as Record<string, { bg: string; fg: string }>,
  };
  const loadLogo = (): Promise<{ img: HTMLImageElement; aspect: number }> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ img, aspect: img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1 });
      img.onerror = () => resolve({ img, aspect: 1 });
      img.src = logoImg;
    });
  const fmtExportDate = (d?: string | Date) => {
    if (!d) return "";
    const date = typeof d === "string" ? new Date(d) : d;
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "-");
  };
  const dayIndex = (d: Date, base: Date) => Math.round((d.getTime() - base.getTime()) / 86400000);

  const handleExport = async () => {
    if (!exportType || exportSelectedCols.length === 0) return;

    // The bulk/admin view only sends a `subtaskCount` up front (not the full
    // subtask list) to keep the payload small — a task's `subtasks` array is
    // only populated once its row has been expanded in the UI. Since the
    // Addon/Issue export grouping below now depends on each subtask's own
    // tick (isAddon/isIssue), we need to make sure every task that has
    // subtasks has them loaded before we decide who goes in which group.
    const tasksNeedingSubtasks = filteredTasks.filter(
      t => (t.subtaskCount ?? 0) > 0 && !(Array.isArray(t.subtasks) && t.subtasks.length > 0)
    );
    const fetchedSubtasksMap: Record<string, Subtask[]> = {};
    if (tasksNeedingSubtasks.length > 0) {
      await Promise.all(
        tasksNeedingSubtasks.map(async (t) => {
          try {
            const res = await apiFetch(`/api/tasks/${t.id}/subtasks`);
            const data = res.ok ? await res.json() : [];
            fetchedSubtasksMap[t.id] = (Array.isArray(data) ? data : []).map((st: any) => ({
              ...st,
              isCompleted: !!st.isCompleted,
              progress: st.progress || 0,
              isAddon: !!(st.isAddon || st.is_addon),
              isIssue: !!(st.isIssue || st.is_issue),
            }));
          } catch {
            fetchedSubtasksMap[t.id] = [];
          }
        })
      );
      // Cache what we fetched on the task list so re-exporting (or expanding
      // the row afterwards) doesn't need to hit the API again.
      setTasks(prev => prev.map(t => (
        fetchedSubtasksMap[t.id] ? { ...t, subtasks: fetchedSubtasksMap[t.id] } : t
      )));
    }
    const getSubtasksFor = (t: Task): Subtask[] =>
      (Array.isArray(t.subtasks) && t.subtasks.length > 0) ? t.subtasks : (fetchedSubtasksMap[t.id] || []);
    // A subtask's own Addon/Issue tick pulls its parent Task into the
    // Addon/Issue export section, even when the Task itself isn't flagged.
    // If no subtask is ticked, the task is left exactly where it was.
    const hasFlaggedSubtask = (t: Task) => getSubtasksFor(t).some(s => s.isAddon || s.isIssue);

    const activeColumnsConfig = columnsConfig.filter(c => exportSelectedCols.includes(c.id));
    // "Category" in the exported report maps to the task's Tags field
    const headerLabels = activeColumnsConfig.map(c => c.id === 'tags' ? 'Category' : c.label);

    const regularTasks = filteredTasks.filter(t => !t.isAddon && !t.isIssue && !hasFlaggedSubtask(t));
    const addonIssueTasks = filteredTasks.filter(t => t.isAddon || t.isIssue || hasFlaggedSubtask(t));

    const getCategory = (t: Task) => (t.tags || []).map(tag => tag.name).filter(Boolean).join(", ") || "N/A";
    const getKeyStepTitle = (t: Task) => keySteps.find(k => String(k.id) === String(t.keyStepId))?.title || "No Key Step";

    const mapTaskToRow = (t: Task, idx: number) => {
      const rowData: any[] = [];
      activeColumnsConfig.forEach(col => {
        let val = "";
        switch (col.id) {
          case 'serial': val = String(idx + 1); break;
          case 'taskName': val = t.taskName; break;
          case 'project': val = projects.find(p => p.id === t.projectId)?.title || "N/A"; break;
          case 'keyStep': val = getKeyStepTitle(t); break;
          case 'period': val = t.taskPeriod || "N/A"; break;
          case 'frequency': val = t.reminderFrequency || "N/A"; break;
          case 'assignedBy': val = allEmployees.find((e: any) => String(e.id) === String(t.assignerId))?.name || "N/A"; break;
          case 'taskOwner': val = allEmployees.find((e: any) => String(e.id) === String(t.taskOwnerId))?.name || "N/A"; break;
          case 'assignees': val = (t.taskMembers || []).map(id => allEmployees.find(e => e.id === id)?.name).filter(Boolean).join(", "); break;
          case 'ccMembers': val = (t.ccMembers || []).map(id => allEmployees.find(e => e.id === id)?.name).filter(Boolean).join(", "); break;
          case 'tags': val = getCategory(t); break;
          case 'startDate': val = formatDate(t.startDate) || ""; break;
          case 'endDate': val = formatDate(t.endDate) || ""; break;
          case 'completionDate': val = formatDate(t.completionDate) || ""; break;
          case 'durationDays': val = t.durationDays != null ? String(t.durationDays) : ""; break;
          case 'priority': val = t.priority; break;
          case 'status': val = t.status; break;
          case 'progress': val = `${t.progress}%`; break;
          case 'remarks': val = computeRemarks(t); break;
          case 'flags':
            const subFlags = getSubtasksFor(t);
            const flags = [];
            if (t.isAddon || subFlags.some(s => s.isAddon)) flags.push("Addon");
            if (t.isIssue || subFlags.some(s => s.isIssue)) flags.push("Issue");
            val = flags.join(", ");
            break;
        }
        rowData.push(val);
      });
      return rowData;
    };

    const regularData = regularTasks.map(mapTaskToRow);
    const addonIssueData = addonIssueTasks.map(mapTaskToRow);
    const statusColIdx = activeColumnsConfig.findIndex(c => c.id === 'status');

    // Group regular tasks by Key Step (used as "Phase" bands, matching the reference report)
    type PhaseGroup = { name: string; taskIndexes: number[] };
    const phaseGroups: PhaseGroup[] = [];
    regularTasks.forEach((t, idx) => {
      const name = getKeyStepTitle(t);
      let g = phaseGroups.find(g => g.name === name);
      if (!g) { g = { name, taskIndexes: [] }; phaseGroups.push(g); }
      g.taskIndexes.push(idx);
    });

    // Data for the Gantt chart view — every task (regular + addon/issue) with valid start & end dates
    const ganttTodayForDelay = new Date();
    ganttTodayForDelay.setHours(0, 0, 0, 0);
    const ganttTasks = filteredTasks
      .filter(t => t.startDate && t.endDate)
      .map(t => {
        const endD = new Date(t.endDate as string);
        const statusLower = (t.status || "").toLowerCase();
        const isCompletedStatus = statusLower === "completed";
        const isCancelledStatus = statusLower === "cancelled" || statusLower === "canceled";
        return {
          keyStep: getKeyStepTitle(t),
          category: getCategory(t),
          name: t.taskName,
          status: t.status,
          start: new Date(t.startDate as string),
          end: endD,
          isDelayed: !isCompletedStatus && !isCancelledStatus && endD < ganttTodayForDelay,
        };
      });
    const ganttGroups: { name: string; rows: typeof ganttTasks }[] = [];
    ganttTasks.forEach(gt => {
      let g = ganttGroups.find(g => g.name === gt.keyStep);
      if (!g) { g = { name: gt.keyStep, rows: [] }; ganttGroups.push(g); }
      g.rows.push(gt);
    });

    if (exportType === 'pdf') {
      try {
        const { default: jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 28;
        const { img: logoElement, aspect } = await loadLogo();

        const drawHeader = (title: string) => {
          doc.setFillColor(...EXPORT_NAVY);
          doc.rect(0, 0, pageWidth, 46, "F");
          doc.setFillColor(...EXPORT_SUBBAND);
          doc.rect(0, 46, pageWidth, 18, "F");

          const logoSize = 32;
          try {
            doc.addImage(logoElement, "PNG", 28, 7, logoSize, logoSize / (aspect || 1));
          } catch { /* logo failed to decode; continue without it */ }

          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(15);
          doc.text(title, 28 + logoSize + 12, 27);

          doc.setFont("helvetica", "italic");
          doc.setFontSize(8.5);
          doc.text(
            `Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
            28 + logoSize + 12, 58
          );
          return 74;
        };

        const drawFooter = (pageLabel: string) => {
          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
          doc.setFont("helvetica", "normal");
          doc.text("Concept Trunk Interiors", margin, pageHeight - 14);
          doc.text(pageLabel, pageWidth - margin, pageHeight - 14, { align: "right" });
        };

        const statusStyleCell = (data: any) => {
          if (data.section === "body" && statusColIdx >= 0 && data.column.index === statusColIdx) {
            const s = EXPORT_STATUS_COLORS[data.cell.raw];
            if (s) {
              data.cell.styles.fillColor = s.bg;
              data.cell.styles.textColor = s.fg;
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.halign = "center";
            }
          }
        };

        let y = drawHeader("TASK LIST");

        if (phaseGroups.length === 0) {
          doc.setTextColor(120, 120, 120);
          doc.setFontSize(10);
          doc.text("No regular tasks match the current filters.", margin, y + 10);
        }

        phaseGroups.forEach((group, gi) => {
          const bandColor = EXPORT_PHASE_COLORS[gi % EXPORT_PHASE_COLORS.length];

          // page-break guard before drawing a phase band
          if (y > pageHeight - 100) {
            drawFooter(`Page ${(doc.internal as any).getNumberOfPages()}`);
            doc.addPage();
            y = drawHeader("TASK LIST (contd.)");
          }

          doc.setFillColor(...bandColor);
          doc.rect(margin, y, pageWidth - margin * 2, 16, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text(`Phase ${gi + 1} — ${group.name}`, margin + 6, y + 11);
          y += 16;

          const body = group.taskIndexes.map(idx => regularData[idx]);

          autoTable(doc, {
            head: [headerLabels],
            body,
            startY: y,
            margin: { left: margin, right: margin, bottom: 30 },
            theme: "plain",
            styles: { fontSize: 7.5, cellPadding: 4, lineColor: [225, 230, 235], lineWidth: 0.5, overflow: "linebreak" },
            headStyles: { fillColor: EXPORT_NAVY, textColor: [255, 255, 255], fontStyle: "bold" },
            alternateRowStyles: { fillColor: EXPORT_STRIPE },
            didParseCell: statusStyleCell,
          });

          y = (doc as any).lastAutoTable.finalY + 10;
        });

        if (addonIssueTasks.length > 0) {
          if (y > pageHeight - 100) {
            drawFooter(`Page ${(doc.internal as any).getNumberOfPages()}`);
            doc.addPage();
            y = drawHeader("TASK LIST (contd.)");
          }
          doc.setFillColor(230, 126, 34);
          doc.rect(margin, y, pageWidth - margin * 2, 16, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text("Add-ons & Issues", margin + 6, y + 11);
          y += 16;

          autoTable(doc, {
            head: [headerLabels],
            body: addonIssueData,
            startY: y,
            margin: { left: margin, right: margin, bottom: 30 },
            theme: "plain",
            styles: { fontSize: 7.5, cellPadding: 4, lineColor: [225, 230, 235], lineWidth: 0.5, overflow: "linebreak" },
            headStyles: { fillColor: [230, 126, 34], textColor: [255, 255, 255], fontStyle: "bold" },
            alternateRowStyles: { fillColor: EXPORT_STRIPE },
            didParseCell: (data: any) => {
              statusStyleCell(data);
              if (data.section === "body") {
                const task = addonIssueTasks[data.row.index];
                if (task && (statusColIdx < 0 || data.column.index !== statusColIdx)) {
                  if (task.isIssue) data.cell.styles.fillColor = [255, 235, 235];
                  else if (task.isAddon) data.cell.styles.fillColor = [255, 245, 230];
                }
              }
            },
          });
          y = (doc as any).lastAutoTable.finalY + 10;
        }

        drawFooter(`Page ${(doc.internal as any).getNumberOfPages()} of ${(doc.internal as any).getNumberOfPages()}`);

        // ---- Gantt Chart page ----
        if (exportIncludeGantt && ganttGroups.length > 0) {
          doc.addPage();
          let gy = drawHeader("GANTT CHART");

          const allDates = ganttTasks.flatMap(t => [t.start, t.end]);
          const rangeStart = new Date(Math.min(...allDates.map(d => d.getTime())));
          const rangeEnd = new Date(Math.max(...allDates.map(d => d.getTime())));
          const totalDays = Math.max(dayIndex(rangeEnd, rangeStart) + 1, 1);

          const labelColW = 170;
          const slColW = 20;
          const chartLeft = margin + slColW + labelColW;
          const chartWidth = pageWidth - margin * 2 - slColW - labelColW;
          const dayW = Math.max(chartWidth / totalDays, 4);
          const rowH = 15;
          const headH = 20;

          const drawGanttHeaderRow = () => {
            doc.setFillColor(...EXPORT_NAVY);
            doc.rect(margin, gy, slColW + labelColW, headH, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text("Sl", margin + slColW / 2, gy + 13, { align: "center" });
            doc.text("Task", margin + slColW + 6, gy + 13);
            for (let d = 0; d < totalDays; d++) {
              const date = new Date(rangeStart.getTime() + d * 86400000);
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              doc.setFillColor(...(isWeekend ? ([61, 107, 140] as [number, number, number]) : EXPORT_NAVY));
              doc.rect(chartLeft + d * dayW, gy, dayW, headH, "F");
              if (dayW > 7) {
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(6);
                doc.text(String(date.getDate()).padStart(2, "0"), chartLeft + d * dayW + dayW / 2, gy + 13, { align: "center" });
              }
            }
            gy += headH;
          };

          drawGanttHeaderRow();

          let gSl = 1;
          ganttGroups.forEach((group, gi) => {
            const bandColor = EXPORT_PHASE_COLORS[gi % EXPORT_PHASE_COLORS.length];

            if (gy > pageHeight - 60) {
              drawFooter(`Page ${(doc.internal as any).getNumberOfPages()}`);
              doc.addPage();
              gy = drawHeader("GANTT CHART (contd.)");
              drawGanttHeaderRow();
            }

            doc.setFillColor(...bandColor);
            doc.rect(margin, gy, pageWidth - margin * 2, 13, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.text(`Phase ${gi + 1} — ${group.name}`, margin + 6, gy + 9.5);
            gy += 13;

            group.rows.forEach((t) => {
              if (gy > pageHeight - 60) {
                drawFooter(`Page ${(doc.internal as any).getNumberOfPages()}`);
                doc.addPage();
                gy = drawHeader("GANTT CHART (contd.)");
                drawGanttHeaderRow();
              }
              const striped = gSl % 2 === 0;
              doc.setFillColor(...(striped ? EXPORT_STRIPE : ([255, 255, 255] as [number, number, number])));
              doc.rect(margin, gy, slColW + labelColW, rowH, "F");
              for (let d = 0; d < totalDays; d++) {
                const date = new Date(rangeStart.getTime() + d * 86400000);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                doc.setFillColor(...(isWeekend ? ([232, 232, 232] as [number, number, number]) : (striped ? EXPORT_STRIPE : ([255, 255, 255] as [number, number, number]))));
                doc.rect(chartLeft + d * dayW, gy, dayW, rowH, "F");
              }
              doc.setDrawColor(230, 230, 230);
              doc.setLineWidth(0.3);
              doc.line(margin, gy, pageWidth - margin, gy);

              doc.setTextColor(50, 50, 50);
              doc.setFont("helvetica", "normal");
              doc.setFontSize(7);
              doc.text(String(gSl), margin + slColW / 2, gy + rowH / 2 + 2.5, { align: "center" });
              doc.text(t.name, margin + slColW + 6, gy + rowH / 2 + 2.5, { maxWidth: labelColW - 10 });

              const barStart = dayIndex(t.start, rangeStart);
              const barEnd = dayIndex(t.end, rangeStart);
              const barColor: [number, number, number] = t.isDelayed ? [214, 40, 40] : t.status === "Completed" ? [112, 173, 71] : t.status === "In Progress" ? [255, 192, 0] : [157, 195, 230];
              doc.setFillColor(...barColor);
              const bx = chartLeft + barStart * dayW + 1;
              const bw = Math.max((barEnd - barStart + 1) * dayW - 2, 3);
              doc.roundedRect(bx, gy + 2, bw, rowH - 4, 1.2, 1.2, "F");

              gy += rowH;
              gSl++;
            });
          });

          gy += 14;
          const legendItems: { label: string; color: [number, number, number] }[] = [
            { label: "Completed", color: [112, 173, 71] },
            { label: "In Progress", color: [255, 192, 0] },
            { label: "Planned / Other", color: [157, 195, 230] },
            { label: "Delayed", color: [214, 40, 40] },
            { label: "Weekend", color: [232, 232, 232] },
          ];
          let lx = margin;
          legendItems.forEach((item) => {
            doc.setFillColor(...item.color);
            doc.rect(lx, gy, 10, 10, "F");
            doc.setTextColor(60, 60, 60);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.text(item.label, lx + 14, gy + 8);
            lx += 14 + doc.getTextWidth(item.label) + 20;
          });

          drawFooter(`Page ${(doc.internal as any).getNumberOfPages()}`);
        }

        doc.save("tasks_export.pdf");
      } catch (err) {
        console.error("PDF Export error", err);
        toast({ title: "Failed to generate PDF", variant: "destructive" });
      }
    } else if (exportType === 'excel') {
      try {
        const ExcelJS = await import("exceljs");
        const wb = new ExcelJS.Workbook();
        wb.creator = "PMS";
        wb.created = new Date();

        const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: hex } });

        // ================= TASKS SHEET =================
        const ws = wb.addWorksheet("Tasks", { views: [{ showGridLines: false }] });
        ws.columns = activeColumnsConfig.map(c => ({ width: c.id === 'taskName' ? 32 : c.id === 'remarks' ? 20 : c.id === 'serial' ? 6 : 16 }));

        ws.mergeCells(1, 1, 1, headerLabels.length);
        ws.getCell(1, 1).value = "TASK LIST";
        ws.getCell(1, 1).font = { name: "Arial", bold: true, size: 16, color: { argb: EXPORT_HEX.white } };
        ws.getCell(1, 1).fill = fill(EXPORT_HEX.navy);
        ws.getCell(1, 1).alignment = { vertical: "middle", indent: 1 };
        ws.getRow(1).height = 30;

        ws.mergeCells(2, 1, 2, headerLabels.length);
        ws.getCell(2, 1).value = `Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
        ws.getCell(2, 1).font = { name: "Arial", italic: true, size: 10, color: { argb: EXPORT_HEX.white } };
        ws.getCell(2, 1).fill = fill(EXPORT_HEX.subband);
        ws.getCell(2, 1).alignment = { vertical: "middle", indent: 1 };
        ws.getRow(2).height = 18;

        let row = 4;
        const writePhaseSection = (title: string, bandColorHex: string, headerColorHex: string, rows: any[][], statusIdx: number, extraFillPerRow?: (rIdx: number) => string | undefined) => {
          ws.mergeCells(row, 1, row, headerLabels.length);
          const bandCell = ws.getCell(row, 1);
          bandCell.value = title;
          bandCell.font = { name: "Arial", bold: true, size: 11, color: { argb: EXPORT_HEX.white } };
          bandCell.fill = fill(bandColorHex);
          bandCell.alignment = { vertical: "middle", indent: 1 };
          ws.getRow(row).height = 20;
          row++;

          headerLabels.forEach((h, i) => {
            const cell = ws.getCell(row, i + 1);
            cell.value = h;
            cell.font = { name: "Arial", bold: true, size: 10, color: { argb: EXPORT_HEX.white } };
            cell.fill = fill(headerColorHex);
            cell.alignment = { vertical: "middle", horizontal: i === 0 ? "center" : "left", indent: i === 0 ? 0 : 1 };
          });
          ws.getRow(row).height = 18;
          row++;

          rows.forEach((r, rIdx) => {
            const striped = rIdx % 2 === 1;
            const overrideFill = extraFillPerRow?.(rIdx);
            r.forEach((v, i) => {
              const cell = ws.getCell(row, i + 1);
              cell.value = v;
              cell.font = { name: "Arial", size: 10, color: { argb: "FF212529" } };
              cell.alignment = { vertical: "middle", horizontal: (i === 0 || i === statusIdx) ? "center" : "left", indent: (i === 0 || i === statusIdx) ? 0 : 1 };
              cell.border = { bottom: { style: "thin", color: { argb: "FFE1E6EB" } } };
              if (striped) cell.fill = fill(EXPORT_HEX.stripe);
              if (overrideFill) cell.fill = fill(overrideFill);
              if (i === statusIdx && EXPORT_HEX.status[v]) {
                cell.fill = fill(EXPORT_HEX.status[v].bg);
                cell.font = { name: "Arial", bold: true, size: 10, color: { argb: EXPORT_HEX.status[v].fg } };
                cell.alignment = { vertical: "middle", horizontal: "center" };
              }
            });
            row++;
          });
          row++; // spacer
        };

        phaseGroups.forEach((group, gi) => {
          const rows = group.taskIndexes.map(idx => regularData[idx]);
          writePhaseSection(`Phase ${gi + 1} — ${group.name}`, EXPORT_HEX.phases[gi % EXPORT_HEX.phases.length], EXPORT_HEX.navy, rows, statusColIdx);
        });

        if (addonIssueTasks.length > 0) {
          writePhaseSection(
            "Add-ons & Issues",
            "FFE67E22",
            EXPORT_HEX.navy,
            addonIssueData,
            statusColIdx,
            (rIdx) => addonIssueTasks[rIdx]?.isIssue ? "FFFFEBEB" : addonIssueTasks[rIdx]?.isAddon ? "FFFFF5E6" : undefined
          );
        }

        ws.views = [{ state: "frozen", ySplit: 3 }];

        // ================= GANTT CHART SHEET =================
        if (exportIncludeGantt && ganttGroups.length > 0) {
          const allDates = ganttTasks.flatMap(t => [t.start, t.end]);
          const rangeStart = new Date(Math.min(...allDates.map(d => d.getTime())));
          const rangeEnd = new Date(Math.max(...allDates.map(d => d.getTime())));
          const totalDays = Math.max(dayIndex(rangeEnd, rangeStart) + 1, 1);

          const gc = wb.addWorksheet("Gantt Chart", { views: [{ showGridLines: false }] });
          gc.getColumn(1).width = 4;
          gc.getColumn(2).width = 18;
          gc.getColumn(3).width = 34;
          for (let d = 0; d < totalDays; d++) gc.getColumn(4 + d).width = 3;
          const totalCols = 3 + totalDays;

          gc.mergeCells(1, 1, 1, totalCols);
          gc.getCell(1, 1).value = `GANTT CHART  (${fmtExportDate(rangeStart)} – ${fmtExportDate(rangeEnd)})`;
          gc.getCell(1, 1).font = { name: "Arial", bold: true, size: 14, color: { argb: EXPORT_HEX.white } };
          gc.getCell(1, 1).fill = fill(EXPORT_HEX.navy);
          gc.getCell(1, 1).alignment = { vertical: "middle", indent: 1 };
          gc.getRow(1).height = 26;

          const headRow = 2;
          ["#", "Category", "Task"].forEach((h, i) => {
            const cell = gc.getCell(headRow, i + 1);
            cell.value = h;
            cell.font = { name: "Arial", bold: true, size: 9, color: { argb: EXPORT_HEX.white } };
            cell.fill = fill(EXPORT_HEX.navy);
            cell.alignment = { vertical: "middle", horizontal: "center" };
          });
          for (let d = 0; d < totalDays; d++) {
            const date = new Date(rangeStart.getTime() + d * 86400000);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const cell = gc.getCell(headRow, 4 + d);
            cell.value = date.getDate();
            cell.font = { name: "Arial", bold: true, size: 8, color: { argb: EXPORT_HEX.white } };
            cell.fill = fill(isWeekend ? EXPORT_HEX.ganttHeadWeekend : EXPORT_HEX.navy);
            cell.alignment = { vertical: "middle", horizontal: "center" };
          }
          gc.getRow(headRow).height = 18;

          let gRow = 3;
          let gSl = 1;
          ganttGroups.forEach((group, gi) => {
            gc.mergeCells(gRow, 1, gRow, totalCols);
            const bandCell = gc.getCell(gRow, 1);
            bandCell.value = `Phase ${gi + 1} — ${group.name}`;
            bandCell.font = { name: "Arial", bold: true, size: 9, color: { argb: EXPORT_HEX.white } };
            bandCell.fill = fill(EXPORT_HEX.phases[gi % EXPORT_HEX.phases.length]);
            bandCell.alignment = { vertical: "middle", indent: 1 };
            gc.getRow(gRow).height = 15;
            gRow++;

            group.rows.forEach((t, rIdx) => {
              const striped = rIdx % 2 === 1;
              gc.getCell(gRow, 1).value = gSl++;
              gc.getCell(gRow, 2).value = t.category;
              gc.getCell(gRow, 3).value = t.name;
              [1, 2, 3].forEach((c) => {
                const cell = gc.getCell(gRow, c);
                cell.font = { name: "Arial", size: 8, color: { argb: "FF212529" } };
                cell.alignment = { vertical: "middle", horizontal: c === 1 ? "center" : "left", indent: c === 1 ? 0 : 1 };
                if (striped) cell.fill = fill(EXPORT_HEX.stripe);
              });

              const barStart = dayIndex(t.start, rangeStart);
              const barEnd = dayIndex(t.end, rangeStart);
              const barColor = t.isDelayed ? EXPORT_HEX.ganttDelayed : t.status === "Completed" ? EXPORT_HEX.ganttDone : t.status === "In Progress" ? EXPORT_HEX.ganttProgress : EXPORT_HEX.ganttPlanned;

              for (let d = 0; d < totalDays; d++) {
                const date = new Date(rangeStart.getTime() + d * 86400000);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const cell = gc.getCell(gRow, 4 + d);
                if (d >= barStart && d <= barEnd) cell.fill = fill(barColor);
                else if (isWeekend) cell.fill = fill(EXPORT_HEX.ganttWeekend);
                else if (striped) cell.fill = fill(EXPORT_HEX.stripe);
              }
              gc.getRow(gRow).height = 15;
              gRow++;
            });
          });

          gRow += 1;
          const legend = [
            { label: "Completed", color: EXPORT_HEX.ganttDone },
            { label: "In Progress", color: EXPORT_HEX.ganttProgress },
            { label: "Planned / Other", color: EXPORT_HEX.ganttPlanned },
            { label: "Delayed", color: EXPORT_HEX.ganttDelayed },
            { label: "Weekend", color: EXPORT_HEX.ganttWeekend },
          ];
          legend.forEach((item, i) => {
            const c = 1 + i * 2;
            gc.getCell(gRow, c).fill = fill(item.color);
            gc.getCell(gRow, c + 1).value = item.label;
            gc.getCell(gRow, c + 1).font = { name: "Arial", size: 8, color: { argb: "FF495057" } };
          });

          gc.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];
        }

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "tasks_export.xlsx";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Excel Export error", err);
        toast({ title: "Failed to generate Excel", variant: "destructive" });
      }
    }

    setExportColSelOpen(false);
  };

  const computeRemarks = (task: Task): string => {
    if (!task.endDate) return "";
    const due = new Date(task.endDate);
    // Strip time for accurate date comparison
    due.setHours(0, 0, 0, 0);

    // Prefer an explicit completion date; fall back to legacy completedAt field.
    const completionRaw = task.completionDate || task.completedAt;

    if (completionRaw) {
      // Delay is calculated between Due Date and Completion Date.
      const completed = new Date(completionRaw);
      completed.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil(Math.abs(completed.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      if (completed < due) return `-${diffDays} Days`;
      if (completed.getTime() === due.getTime()) return "0 Days";
      return `+${diffDays} Days`;
    }

    // No completion date yet -> calculate between Start Date and Due Date.
    const start = task.startDate ? new Date(task.startDate) : new Date();
    start.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil(Math.abs(start.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    if (start < due) return `-${diffDays} Days`;
    if (start.getTime() === due.getTime()) return "0 Days";
    return `+${diffDays} Days`;
  };

  /* ================= API ACTIONS ================= */

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    const deletedId = taskToDelete.id;

    // Close dialog and remove from local state immediately (optimistic UI)
    setOpenDeleteDialog(false);
    setTasks(prev => prev.filter(t => t.id !== deletedId));
    setTaskToDelete(null);

    try {
      const res = await apiFetch(`/api/tasks/${deletedId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      // refresh just in case anything else changed
      refreshTasks();
    } catch {
      alert("Delete failed");
      refreshTasks(); // revert by fetching again
    }
  };

  /* ================= QUICK ADD HANDLERS ================= */

  // Reset the chosen key step whenever the target project changes, since key
  // steps are scoped to a single project and a stale selection from a
  // different project would otherwise get silently submitted.
  useEffect(() => {
    setQuickAddTaskKeyStepId("");
  }, [quickAddTaskProjectId]);

  // Inline Quick Add Row (table-top "type name + Enter" creation) — separate
  // from the Quick Add dialog above. Always scoped to whichever single
  // project is currently selected in the filters; every other field is left
  // blank/default so it can be filled in via inline edit right after.
  const [inlineQuickAddName, setInlineQuickAddName] = useState("");
  const [inlineQuickAddSubmitting, setInlineQuickAddSubmitting] = useState(false);
  // Only used when viewing "All Projects" (Freeze/global view), where there's
  // no single project already implied by the page's filters.
  const [inlineQuickAddProjectId, setInlineQuickAddProjectId] = useState<string>("");

  const handleInlineQuickAddTask = async () => {
    const targetProjectId = (projectId && projectId !== "all") ? projectId : inlineQuickAddProjectId;
    if (!targetProjectId) {
      alert("Please select a project first.");
      return;
    }
    const name = inlineQuickAddName.trim();
    if (!name || inlineQuickAddSubmitting) return;

    setInlineQuickAddSubmitting(true);
    const startDate = new Date().toISOString().split("T")[0];
    const selfId = user?.employeeId ?? user?.id ?? "";

    // Optimistic row so the new task appears instantly at the top of the
    // list. Shaped to match exactly what the server will return (same
    // assignerId/taskOwnerId/taskMembers as the real POST body below) so it
    // can't accidentally get hidden by an active filter (My Tasks, Assignee,
    // Status, etc.) only to "pop in" once refreshTasks() runs.
    const tempId = `tmp-${Date.now()}`;
    const newTask: Task = {
      id: tempId,
      projectId: targetProjectId,
      keyStepId: undefined,
      taskName: name,
      description: "",
      status: "pending",
      priority: "medium",
      assignerId: selfId,
      taskOwnerId: selfId,
      taskMembers: [],
      ccMembers: [],
      tags: [],
      startDate,
      endDate: undefined,
      subtasks: [],
      progress: 0,
      taskPeriod: "custom",
      reminderFrequency: "1 Time",
      sortOrder: 0,
      isAddon: false,
      isIssue: false,
    };
    setTasks(prev => [newTask, ...prev]);
    setInlineQuickAddName("");

    try {
      const res = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: targetProjectId,
          keyStepId: null,
          taskName: name,
          description: "",
          status: "pending",
          priority: "medium",
          startDate,
          assignerId: user?.employeeId ?? null,
          taskOwnerId: user?.employeeId ?? null,
          taskMembers: [],
          subtasks: [],
          taskPeriod: "custom",
          reminderFrequency: "1 Time",
        }),
      });

      if (!res.ok) throw new Error("Failed");
      refreshTasks();
    } catch {
      alert("Failed to create task");
      setTasks(prev => prev.filter(t => t.id !== tempId));
    } finally {
      setInlineQuickAddSubmitting(false);
    }
  };

  const handleQuickAddTask = async () => {
    const targetProjectId = quickAddTaskProjectId || projectId;
    if (!targetProjectId || targetProjectId === "all") {
      alert("Please select a project first.");
      return;
    }
    if (!quickTaskName.trim()) {
      alert("Please enter a task name");
      return;
    }

    const name = quickTaskName.trim();
    const startDate = quickAddTaskStartDate || new Date().toISOString().split("T")[0];
    const keyStepId = quickAddTaskKeyStepId || null;
    setQuickTaskName("");
    setQuickAddTaskProjectId("");
    setQuickAddTaskKeyStepId("");
    setQuickAddTaskStartDate(new Date().toISOString().split("T")[0]);
    setQuickAddTaskOpen(false);

    // optimistic
    const tempId = `tmp-${Date.now()}`;
    const newTask: Task = {
      id: tempId,
      projectId: targetProjectId,
      keyStepId: keyStepId || undefined,
      taskName: name,
      status: "pending",
      priority: "medium",
      assignerId: user?.id ?? "",
      startDate,
      subtasks: [],
      progress: 0,
    };
    setTasks(prev => [newTask, ...prev]);

    try {
      const res = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: targetProjectId,
          keyStepId,
          taskName: name,
          description: "",
          status: "pending",
          priority: "medium",
          startDate,
          assignerId: user?.employeeId ?? null,
          taskOwnerId: user?.employeeId ?? null,
          taskMembers: [],
          subtasks: [],
          taskPeriod: "custom",
          reminderFrequency: "1 Time",
        }),
      });

      if (!res.ok) throw new Error("Failed");
      refreshTasks();
    } catch {
      alert("Failed to create task");
      setTasks(prev => prev.filter(t => t.id !== tempId));
    }
  };

  const handleQuickAddSubtask = async () => {
    if (!quickSubtaskTaskId) {
      alert("Select a task first");
      return;
    }
    if (!quickSubtaskTitle.trim()) {
      alert("Please enter a subtask title");
      return;
    }

    try {
      await apiFetch(`/api/subtasks`, {
        method: "POST",
        body: JSON.stringify({
          taskId: quickSubtaskTaskId,
          title: quickSubtaskTitle.trim(),
          startDate: quickSubtaskStartDate || null,
          endDate: quickSubtaskEndDate || null,
          completed: quickSubtaskCompleted,
        }),
      });

      setQuickAddSubtaskOpen(false);
      setQuickSubtaskTaskId("");
      setQuickSubtaskTitle("");
      setQuickSubtaskStartDate("");
      setQuickSubtaskEndDate("");
      setQuickSubtaskCompleted(false);

      refreshTasks();
    } catch {
      alert("Failed to add subtask");
    }
  };

  /* ================= CLONE HANDLERS ================= */

  const handleCloneTask = async () => {
    if (!cloneTaskData) return;

    const finalName = cloneTaskNewName.trim() || `${cloneTaskData.name} (Copy)`;
    const sourceTask = tasks.find(t => t.id === cloneTaskData.id);

    // Close the dialog and show the cloned task immediately with the name the
    // user actually typed — don't wait for the server round-trip first.
    setCloneTaskOpen(false);
    setCloneTaskNewName("");
    const tempId = `tmp-clone-${Date.now()}`;
    if (sourceTask) {
      setTasks(prev => [{ ...sourceTask, id: tempId, taskName: finalName }, ...prev]);
    }

    try {
      const response = await apiFetch(`/api/tasks/${cloneTaskData.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: finalName }),
      });

      if (!response.ok) throw new Error("Clone failed");

      await refreshTasks();
      setCloneTaskData(null);
    } catch {
      alert("Failed to clone task");
      setTasks(prev => prev.filter(t => t.id !== tempId));
      setCloneTaskData(null);
    }
  };

  const handleCloneSubtask = async () => {
    if (!cloneSubtaskData) return;

    try {
      const response = await apiFetch(`/api/subtasks/${cloneSubtaskData.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newTitle: cloneSubtaskNewTitle.trim() || undefined }),
      });

      if (!response.ok) throw new Error("Clone failed");

      await refreshTasks();
      setCloneSubtaskNewTitle("");
      setCloneSubtaskOpen(false);
      setCloneSubtaskData(null);
      alert("Subtask cloned successfully!");
    } catch {
      alert("Failed to clone subtask");
    }
  };

  /* ================= UI HELPERS ================= */

  const getTaskHierarchy = (task: Task, includeSubtaskCount = false): string => {
    const proj = projects.find(p => String(p.id) === String(task.projectId));
    const projectTitle = proj?.title || "";
    const keyStep = keySteps.find(k => String(k.id) === String(task.keyStepId));
    const keyStepTitle = keyStep?.title || "";

    const parts: string[] = [];
    if (projectTitle) parts.push(projectTitle);
    if (keyStepTitle) parts.push(keyStepTitle);
    if (task.taskName) parts.push(task.taskName);

    return parts.join(" / ");
  };

  const getDiscussionCountForTask = (task: Task): number => {
    const hierarchy = getTaskHierarchy(task);
    return discussions.filter(d => String(d.title).includes(hierarchy) || String(d.title).includes(task.taskName)).length;
  };

  const getStatusStyle = (status: string) => {
    const s = String(status || "").toLowerCase();
    if (s === "completed") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (s === "in progress" || s === "in-progress") {
      return "bg-sky-50 text-sky-700 border-sky-200";
    }
    if (s === "planned") {
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
    if (s === "on hold" || s === "on-hold") {
      return "bg-amber-50 text-amber-700 border-amber-200";
    }
    if (s === "cancelled" || s === "canceled") {
      return "bg-red-50 text-red-700 border-red-200";
    }
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  const StatusBadge = ({ task }: { task: Task }) => (
    <Popover open={editingTaskField?.taskId === task.id && editingTaskField?.field === "status"}
      onOpenChange={(open) => open ? startEditingTask(task.id, "status", task.status) : setEditingTaskField(null)}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 transition-opacity">
          <Badge
            variant="outline"
            className={cn("text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex justify-center min-w-[95px] border whitespace-nowrap", getStatusStyle(task.status))}
          >
            {task.status || "—"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-40" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command>
          <CommandList>
            <CommandGroup>
              {["Not Started", "Planned", "In Progress", "On Hold", "Completed", "Cancelled"].map((s) => (
                <CommandItem
                  key={s}
                  onSelect={() => handleInlineTaskUpdate(task.id, "status", s)}
                >
                  <Check className={cn("mr-2 h-4 w-4", task.status === s ? "opacity-100" : "opacity-0")} />
                  {s}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  const PriorityBadge = ({ task }: { task: Task }) => (
    <Popover open={editingTaskField?.taskId === task.id && editingTaskField?.field === "priority"}
      onOpenChange={(open) => open ? startEditingTask(task.id, "priority", task.priority) : setEditingTaskField(null)}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 transition-opacity">
          <Badge
            variant="outline"
            className={cn(
              "text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex justify-center min-w-[75px] border capitalize whitespace-nowrap",
              task.priority === "high"
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : task.priority === "medium"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
            )}
          >
            {task.priority || "—"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-32" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command>
          <CommandList>
            <CommandGroup>
              {["low", "medium", "high"].map((p) => (
                <CommandItem
                  key={p}
                  onSelect={() => handleInlineTaskUpdate(task.id, "priority", p)}
                  className="capitalize"
                >
                  <Check className={cn("mr-2 h-4 w-4", task.priority === p ? "opacity-100" : "opacity-0")} />
                  {p}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  const KeyStepBadge = ({ task }: { task: Task }) => {
    const ks = keySteps.find(k => String(k.id) === String(task.keyStepId));
    return (
      <Popover open={editingTaskField?.taskId === task.id && editingTaskField?.field === "keyStepId"}
        onOpenChange={(open) => open ? startEditingTask(task.id, "keyStepId", task.keyStepId || "") : setEditingTaskField(null)}>
        <PopoverTrigger asChild>
          <button className="cursor-pointer hover:opacity-80 transition-opacity text-left max-w-full truncate block">
            {ks ? (
              <Badge variant="outline" className="text-[11px] bg-indigo-50 text-indigo-700 border-indigo-200 px-2 py-0.5 rounded-full font-medium truncate max-w-[150px] inline-block">
                {ks.title}
              </Badge>
            ) : (
              <span className="text-[10px] text-slate-400 italic">No Key Step</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-64" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Command>
            <CommandInput placeholder="Search key step..." className="h-8 text-xs" />
            <CommandList className="max-h-48 overflow-y-auto">
              <CommandEmpty className="p-2 text-xs text-slate-400 text-center">No milestones found.</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => handleInlineTaskUpdate(task.id, "keyStepId", null)}>
                  <Check className={cn("mr-2 h-4 w-4", !task.keyStepId ? "opacity-100" : "opacity-0")} />
                  No Key Step
                </CommandItem>
                {keySteps.filter((k) => String(k.projectId) === String(task.projectId)).map((k) => (
                  <CommandItem
                    key={k.id}
                    onSelect={() => handleInlineTaskUpdate(task.id, "keyStepId", k.id)}
                  >
                    <Check className={cn("mr-2 h-4 w-4", String(task.keyStepId) === String(k.id) ? "opacity-100" : "opacity-0")} />
                    {k.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  const PeriodBadge = ({ task }: { task: Task }) => (
    <Popover open={editingTaskField?.taskId === task.id && editingTaskField?.field === "taskPeriod"}
      onOpenChange={(open) => open ? startEditingTask(task.id, "taskPeriod", task.taskPeriod || "custom") : setEditingTaskField(null)}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 transition-opacity">
          {task.taskPeriod && task.taskPeriod !== "custom" ? (
            <Badge variant="outline" className="text-[11px] capitalize bg-blue-50/70 text-blue-700 border-blue-200/60 rounded-full font-semibold">
              {task.taskPeriod}
            </Badge>
          ) : (
            <span className="text-slate-400 font-medium">—</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-40" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command>
          <CommandList>
            <CommandGroup>
              {["custom", "today", "1 week", "fortnight", "1 month", "quarterly", "half yearly", "annual"].map((p) => (
                <CommandItem
                  key={p}
                  onSelect={() => handleInlineTaskUpdate(task.id, "taskPeriod", p)}
                  className="capitalize"
                >
                  <Check className={cn("mr-2 h-4 w-4", (task.taskPeriod || "custom") === p ? "opacity-100" : "opacity-0")} />
                  {p}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  const FrequencyBadge = ({ task }: { task: Task }) => (
    <Popover open={editingTaskField?.taskId === task.id && editingTaskField?.field === "reminderFrequency"}
      onOpenChange={(open) => open ? startEditingTask(task.id, "reminderFrequency", task.reminderFrequency || "4 times") : setEditingTaskField(null)}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 transition-opacity">
          <Badge variant="outline" className="text-[11px] capitalize bg-amber-50/70 text-amber-700 border-amber-200/60 rounded-full font-semibold">
            {task.reminderFrequency || "4 Times"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-40" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command>
          <CommandList>
            <CommandGroup>
              {["1 time", "2 times", "4 times", "daily", "weekly", "monthly", "custom"].map((f) => (
                <CommandItem
                  key={f}
                  onSelect={() => handleInlineTaskUpdate(task.id, "reminderFrequency", f)}
                  className="capitalize"
                >
                  <Check className={cn("mr-2 h-4 w-4", (task.reminderFrequency || "4 times") === f ? "opacity-100" : "opacity-0")} />
                  {f}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );


  // Subtask equivalents of KeyStepBadge/PeriodBadge/FrequencyBadge above —
  // same interaction pattern, scoped to editingSubtaskField/handleInlineSubtaskUpdate
  // and keyed by (taskId, subtask) since a subtask update needs its parent taskId.
  const SubtaskKeyStepBadge = ({ taskId, subtask }: { taskId: string; subtask: Subtask }) => {
    const ks = keySteps.find(k => String(k.id) === String(subtask.keyStepId));
    const parentTask = tasks.find(t => t.id === taskId);
    return (
      <Popover open={editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "keyStepId"}
        onOpenChange={(open) => open ? startEditingSubtask(String(subtask.id), "keyStepId", subtask.keyStepId || "") : setEditingSubtaskField(null)}>
        <PopoverTrigger asChild>
          <button className="cursor-pointer hover:opacity-80 transition-opacity text-left max-w-full truncate block">
            {ks ? (
              <Badge variant="outline" className="text-[9px] bg-indigo-50 text-indigo-700 border-indigo-200 px-1.5 py-0 rounded-full font-medium truncate max-w-[110px] inline-block">
                {ks.title}
              </Badge>
            ) : (
              <span className="text-[9px] text-slate-400 italic">No Key Step</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-64" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Command>
            <CommandInput placeholder="Search key step..." className="h-8 text-xs" />
            <CommandList className="max-h-48 overflow-y-auto">
              <CommandEmpty className="p-2 text-xs text-slate-400 text-center">No milestones found.</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => handleInlineSubtaskUpdate(taskId, String(subtask.id), "keyStepId", null)}>
                  <Check className={cn("mr-2 h-4 w-4", !subtask.keyStepId ? "opacity-100" : "opacity-0")} />
                  No Key Step
                </CommandItem>
                {keySteps.filter((k) => String(k.projectId) === String(parentTask?.projectId)).map((k) => (
                  <CommandItem
                    key={k.id}
                    onSelect={() => handleInlineSubtaskUpdate(taskId, String(subtask.id), "keyStepId", k.id)}
                  >
                    <Check className={cn("mr-2 h-4 w-4", String(subtask.keyStepId) === String(k.id) ? "opacity-100" : "opacity-0")} />
                    {k.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  const SubtaskPeriodBadge = ({ taskId, subtask }: { taskId: string; subtask: Subtask }) => (
    <Popover open={editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "taskPeriod"}
      onOpenChange={(open) => open ? startEditingSubtask(String(subtask.id), "taskPeriod", subtask.taskPeriod || "custom") : setEditingSubtaskField(null)}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 transition-opacity">
          {subtask.taskPeriod && subtask.taskPeriod !== "custom" ? (
            <Badge variant="outline" className="text-[9px] capitalize bg-blue-50/70 text-blue-700 border-blue-200/60 rounded-full font-semibold">
              {subtask.taskPeriod}
            </Badge>
          ) : (
            <span className="text-slate-400 font-medium text-[9px]">—</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-40" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command>
          <CommandList>
            <CommandGroup>
              {["custom", "today", "1 week", "fortnight", "1 month", "quarterly", "half yearly", "annual"].map((p) => (
                <CommandItem
                  key={p}
                  onSelect={() => handleInlineSubtaskUpdate(taskId, String(subtask.id), "taskPeriod", p)}
                  className="capitalize"
                >
                  <Check className={cn("mr-2 h-4 w-4", (subtask.taskPeriod || "custom") === p ? "opacity-100" : "opacity-0")} />
                  {p}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  const SubtaskFrequencyBadge = ({ taskId, subtask }: { taskId: string; subtask: Subtask }) => (
    <Popover open={editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "reminderFrequency"}
      onOpenChange={(open) => open ? startEditingSubtask(String(subtask.id), "reminderFrequency", subtask.reminderFrequency || "4 times") : setEditingSubtaskField(null)}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 transition-opacity">
          <Badge variant="outline" className="text-[9px] capitalize bg-amber-50/70 text-amber-700 border-amber-200/60 rounded-full font-semibold">
            {subtask.reminderFrequency || "4 Times"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-40" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command>
          <CommandList>
            <CommandGroup>
              {["1 time", "2 times", "4 times", "daily", "weekly", "monthly", "custom"].map((f) => (
                <CommandItem
                  key={f}
                  onSelect={() => handleInlineSubtaskUpdate(taskId, String(subtask.id), "reminderFrequency", f)}
                  className="capitalize"
                >
                  <Check className={cn("mr-2 h-4 w-4", (subtask.reminderFrequency || "4 times") === f ? "opacity-100" : "opacity-0")} />
                  {f}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );


  // Grouping logic
  const groupedTasks = useMemo(() => {
    if (!groupBy || groupBy === "none") {
      if (assigneeFilter !== "all") {
        const selectedEmployeeObj = allEmployees.find(e => String(e.id) === String(assigneeFilter));
        const employeeName = selectedEmployeeObj ? selectedEmployeeObj.name : "";

        const assignedGroup: Task[] = [];
        const deptGroup: Task[] = [];

        paginatedTasks.forEach(t => {
          const isAssigned = (t.taskMembers || []).some((id: string) => String(id) === String(assigneeFilter)) ||
            String(t.assignerId) === String(assigneeFilter);

          if (isAssigned) {
            assignedGroup.push(t);
          } else {
            deptGroup.push(t);
          }
        });

        const groups: Record<string, Task[]> = {};
        if (assignedGroup.length > 0) {
          groups[`Assigned to ${employeeName}`] = assignedGroup;
        }
        if (deptGroup.length > 0) {
          groups[`Department Related`] = deptGroup;
        }
        return groups;
      }
      return { "": paginatedTasks };
    }

    const groups: Record<string, typeof paginatedTasks> = {};

    paginatedTasks.forEach(task => {
      let groupName = "Unknown";
      const taskProject = projects.find(p => String(p.id) === String(task.projectId));

      switch (groupBy) {
        case "projectId":
          groupName = taskProject?.title || "No Project";
          break;
        case "clientName":
          groupName = taskProject?.clientName || "No Client";
          break;
        case "status":
          groupName = task.status || "No Status";
          break;
        case "assignee": {
          const members = Array.isArray(task.taskMembers) ? task.taskMembers : [];
          if (members.length === 0) {
            groupName = "Unassigned";
          } else {
            // Take first assignee for grouping simplicity
            const firstId = members[0];
            groupName = allEmployees.find(e => String(e.id) === String(firstId))?.name || "Unknown Assignee";
          }
          break;
        }
        case "priority":
          groupName = (task.priority || "No Priority").charAt(0).toUpperCase() + (task.priority || "No Priority").slice(1);
          break;
        case "department": {
          const projectDepts = taskProject?.department || [];
          const memberDepts: string[] = (task.taskMembers || []).flatMap((memberId: string) => {
            const emp = allEmployees.find((e: any) => String(e.id) === String(memberId));
            return emp?.department ? [emp.department as string] : [];
          });
          const allDepts = Array.from(new Set([...projectDepts, ...memberDepts]));
          groupName = allDepts.length > 0 ? allDepts.join(", ") : "No Department";
          break;
        }
        case "keyStep":
          groupName = keySteps.find(ks => String(ks.id) === String(task.keyStepId))?.title || "No Key Step";
          break;
        case "progress":
          groupName = `Progress: ${task.progress || 0}%`;
          break;
        case "startDate":
        case "endDate": {
          const dateStr = task[groupBy as keyof Task] as string;
          if (!dateStr) {
            groupName = "No Date";
          } else {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) {
              groupName = "Invalid Date";
            } else {
              groupName = d.toLocaleString('default', { month: 'long', year: 'numeric' });
            }
          }
          break;
        }
        default:
          groupName = "Other";
      }

      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(task);
    });

    // Prioritize assigned tasks within each custom group
    if (assigneeFilter !== "all") {
      Object.keys(groups).forEach(key => {
        groups[key].sort((a, b) => {
          const aAssigned = (a.taskMembers || []).some((id: string) => String(id) === String(assigneeFilter)) || String(a.assignerId) === String(assigneeFilter);
          const bAssigned = (b.taskMembers || []).some((id: string) => String(id) === String(assigneeFilter)) || String(b.assignerId) === String(assigneeFilter);
          if (aAssigned && !bAssigned) return -1;
          if (!aAssigned && bAssigned) return 1;
          return 0;
        });
      });
    }

    return groups;
  }, [paginatedTasks, groupBy, projects, employees, keySteps, assigneeFilter]);

  const handleClearFilters = () => {
    setProjectId("");
    setSearchQuery("");
    setClientFilter("all");
    setDepartmentFilter("all");
    setStatusFilter("all");
    setAssigneeFilter("all");
    setPriorityFilter("all");
    setProgressFilter("all");
    setPinnedFilters({});
    setSelectedKeyStepId("");
    setCustomFilters([]);
    setGroupBy("none");
    setPeriodFilter("all");
    setShowMyTasks(false);
    setOverdueFilter("all");
    setTagFilter("all");
    setStartDateFilter("");
    setEndDateFilter("");
  };

  const removeFilterChip = (type: string, id?: string) => {
    switch (type) {
      case "project": setProjectId(""); break;
      case "client": setClientFilter("all"); break;
      case "keystep": setSelectedKeyStepId(""); break;
      case "department": setDepartmentFilter("all"); break;
      case "status": setStatusFilter("all"); break;
      case "assignee": setAssigneeFilter("all"); break;
      case "priority": setPriorityFilter("all"); break;
      case "progress": setProgressFilter("all"); break;
      case "pinned":
        if (id) {
          setPinnedFilters(prev => ({ ...prev, [id]: "all" }));
        }
        break;
      case "search": setSearchQuery(""); break;
      case "period": setPeriodFilter("all"); break;
      case "custom": setCustomFilters(prev => prev.filter(f => f.id !== id)); break;
      case "mytasks": setShowMyTasks(false); break;
      case "overdue": setOverdueFilter("all"); break;
      case "tag": setTagFilter("all"); break;
      case "dateRange":
        setStartDateFilter("");
        setEndDateFilter("");
        break;
      case "startDate":
        setStartDateFilter("");
        break;
      case "endDate":
        setEndDateFilter("");
        break;
    }
  };

  // Derived, mutually-exclusive "view mode" that drives the tab bar below.
  // This is purely a thin UI layer on top of the existing showMyTasks /
  // departmentFilter state — no new filtering logic, no duplicated data.
  const taskViewMode: "all" | "my" | "department" =
    showMyTasks && isAdmin ? "my" : departmentFilter !== "all" ? "department" : "all";

  const handleViewModeChange = (mode: string) => {
    if (mode === "my") {
      setShowMyTasks(true);
      setDepartmentFilter("all");
    } else if (mode === "department") {
      setShowMyTasks(false);
      // Default to the first available department if none picked yet
      if (departmentFilter === "all" && departments.length > 0) {
        setDepartmentFilter(departments[0]);
      }
    } else {
      setShowMyTasks(false);
      setDepartmentFilter("all");
    }
  };

  /* ================= RENDER ================= */

  return (
    <div className="space-y-6 p-6 bg-slate-50 min-h-screen">
      {/* HEADER */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          {myTasksOnly && (
            <Button variant="ghost" size="icon" onClick={() => navigate("/workspace")}>
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold">{myTasksOnly ? "My Tasks" : "Tasks"}</h1>
            <p className="text-sm text-muted-foreground">
              {myTasksOnly
                ? "Tasks assigned to you or created by you"
                : projectId ? "Manage project tasks" : "View all tasks"}
            </p>
          </div>
        </div>

        {/* VIEW MODE TABS — All Project Tasks / My Tasks / Department Tasks.
            These simply drive the existing showMyTasks + departmentFilter
            state, so every existing filter, column, and action below keeps
            working exactly as before. Hidden on the AdminTasks page since
            myTasksOnly already locks the view to "my tasks". */}
        {!myTasksOnly && (
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={taskViewMode} onValueChange={handleViewModeChange}>
              <TabsList>
                <TabsTrigger value="all">All Project Tasks</TabsTrigger>
                {isAdmin && <TabsTrigger value="my">My Tasks</TabsTrigger>}
                <TabsTrigger value="department">Department Tasks</TabsTrigger>
              </TabsList>
            </Tabs>

            {taskViewMode === "department" && (
              <Select value={departmentFilter === "all" ? undefined : departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* ROW 1 — Primary actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={openAdd}
              className="h-9 px-3 min-w-[110px] justify-center bg-blue-600 hover:bg-blue-700 hover:shadow-md text-white shadow-sm transition-all duration-150"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Task
            </Button>

            <Button
              onClick={() => setQuickAddTaskOpen(true)}
              variant="outline"
              className="h-9 px-3 min-w-[110px] justify-center border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300 hover:shadow-md shadow-sm transition-all duration-150"
            >
              <Plus className="h-4 w-4 mr-1" /> Quick Add
            </Button>

            <ManageColumns columns={columnsConfig} setColumns={setColumnsConfig} defaultColumns={defaultColumns} onSave={handleSaveColumns} />
            <ManageTagsDialog allTags={allTags} setAllTags={setAllTags} />
            <Button
              variant="outline"
              onClick={() => setDepDialogOpen(true)}
              disabled={!(projectId && projectId !== "all") && !(isFrozen && frozenProjectId)}
              title={(!projectId || projectId === "all") && isFrozen && frozenProjectId ? `Manage dependencies for frozen project` : undefined}
              className="h-9 px-3 min-w-[110px] justify-center text-primary border-primary/20 hover:bg-primary/5 transition-all duration-150"
            >
              <Link2 className="h-4 w-4 mr-1" /> Dependencies
            </Button>
          </div>

          {/* ROW 2 — Filters & search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <TaskFilters
                projectId={projectId}
                setProjectId={setProjectId}
                projects={projects}
                clientFilter={clientFilter}
                setClientFilter={setClientFilter}
                clients={clients}
                selectedKeyStepId={selectedKeyStepId}
                setSelectedKeyStepId={setSelectedKeyStepId}
                keySteps={keySteps}
                departmentFilter={departmentFilter}
                setDepartmentFilter={setDepartmentFilter}
                departments={departments}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                assigneeFilter={assigneeFilter}
                setAssigneeFilter={setAssigneeFilter}
                employees={employees}
                priorityFilter={priorityFilter}
                setPriorityFilter={setPriorityFilter}
                progressFilter={progressFilter}
                setProgressFilter={setProgressFilter}
                uniqueProgressValues={uniqueProgressValues}
                pinnedFilters={pinnedFilters}
                setPinnedFilters={setPinnedFilters}
                tasks={tasks} // Needed to calculate unique values for pinned fields
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                customFilters={customFilters}
                setCustomFilters={setCustomFilters}
                savedFilterSets={savedFilterSets}
                setSavedFilterSets={setSavedFilterSets}
                groupBy={groupBy}
                setGroupBy={setGroupBy}
                onClearAll={handleClearFilters}
                onApply={refreshTasks} // Fetch fresh tasks when filters are applied
                periodFilter={periodFilter}
                setPeriodFilter={setPeriodFilter}
                tagFilter={tagFilter}
                setTagFilter={setTagFilter}
                startDateFilter={startDateFilter}
                setStartDateFilter={setStartDateFilter}
                endDateFilter={endDateFilter}
                setEndDateFilter={setEndDateFilter}
                allTags={allTags}
              />

              <Button
                onClick={() => setOverdueFilter(prev => prev === "overdue" ? "all" : "overdue")}
                className={cn(
                  "h-9 px-3 min-w-[100px] justify-center text-xs flex items-center gap-2 shadow-sm transition-all duration-150 hover:shadow-md",
                  overdueFilter === "overdue" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                )}
              >
                <span>Overdue</span>
              </Button>

              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-md border border-slate-200 h-9 hover:border-slate-300 hover:shadow-sm transition-all duration-150">
                <input
                  type="checkbox"
                  id="showCompleted"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <label htmlFor="showCompleted" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Completed
                </label>
              </div>

              <Popover open={exportColSelOpen} onOpenChange={setExportColSelOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 px-3 min-w-[110px] justify-center border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-md shadow-sm transition-all duration-150"
                  >
                    <Download className="h-4 w-4 mr-1" /> Export
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">Select Columns to Export</h4>
                      <label className="text-xs flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportSelectedCols.length === columnsConfig.filter(c => c.visible).length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExportSelectedCols(columnsConfig.filter(c => c.visible).map(c => c.id));
                            } else {
                              setExportSelectedCols([]);
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        Select All
                      </label>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto space-y-1 p-1">
                      {columnsConfig.filter(c => c.visible).map(col => (
                        <div key={col.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={exportSelectedCols.includes(col.id)}
                            onChange={(e) => {
                              if (e.target.checked) setExportSelectedCols(prev => [...prev, col.id]);
                              else setExportSelectedCols(prev => prev.filter(id => id !== col.id));
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                          />
                          <span className="text-xs">{col.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={exportIncludeGantt}
                        onChange={(e) => setExportIncludeGantt(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-medium">Include Gantt Chart</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 text-xs" onClick={() => { setExportType('pdf'); handleExport(); }}>
                        <FileText className="h-3 w-3 mr-1" /> PDF
                      </Button>
                      <Button size="sm" className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => { setExportType('excel'); handleExport(); }}>
                        <FileSpreadsheet className="h-3 w-3 mr-1" /> Excel
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Select value={addonFilter} onValueChange={setAddonFilter}>
                <SelectTrigger className="w-28 h-9 bg-white hover:border-slate-300 transition-colors duration-150">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="addon">Addons</SelectItem>
                  <SelectItem value="issue">Issues</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <Input
                  className="pl-9 w-64 bg-white border-slate-200 focus:ring-2 focus:ring-blue-100 hover:border-slate-300 transition-all duration-150"
                  placeholder="Quick search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ACTIVE FILTER CHIPS (Odoo Style) */}
        {(() => {
          const chips: Chip[] = [];
          if (projectId) chips.push({ type: "project", label: `Project: ${projects.find(p => String(p.id) === projectId)?.title || projectId}` });
          if (clientFilter !== "all") chips.push({ type: "client", label: `Client: ${clientFilter}` });
          if (selectedKeyStepId) {
            const keyStepLabel = keySteps.find(ks => String(ks.id) === String(selectedKeyStepId))?.title || selectedKeyStepId;
            chips.push({ type: "keystep", label: `Key Step: ${keyStepLabel}` });
          }
          if (departmentFilter !== "all") chips.push({ type: "department", label: `Dept: ${departmentFilter}` });
          if (statusFilter !== "all") chips.push({ type: "status", label: `Status: ${statusFilter}` });
          if (priorityFilter !== "all") chips.push({ type: "priority", label: `Priority: ${priorityFilter}` });
          if (progressFilter !== "all") chips.push({ type: "progress", label: `Progress: ${progressFilter}%` });

          Object.entries(pinnedFilters).forEach(([field, value]) => {
            if (value && value !== "all") {
              chips.push({ type: "pinned", id: field, label: `${field}: ${value}` });
            }
          });

          if (assigneeFilter !== "all") chips.push({ type: "assignee", label: `Assigned: ${employees.find(e => String(e.id) === assigneeFilter)?.name || assigneeFilter}` });
          if (overdueFilter !== "all") chips.push({ type: "overdue", label: `Overdue: ${overdueFilter}` });
          if (tagFilter !== "all") chips.push({ type: "tag", label: `Tag: ${allTags.find(t => String(t.id) === String(tagFilter))?.name || tagFilter}` });
          if (showMyTasks && isAdmin) chips.push({ type: "mytasks", label: "My Tasks" });
          if (periodFilter !== "all") {
            const periodLabels: Record<string, string> = {
              "1": "Today",
              "7": "1 Week",
              "15": "Fortnight",
              "30": "1 Month",
              "90": "Quarterly",
              "180": "Half Yearly",
              "365": "Annual"
            };
            chips.push({ type: "period", label: `Period: ${periodLabels[periodFilter] || periodFilter}` });
          }
          if (searchQuery) chips.push({ type: "search", label: `Search: ${searchQuery}` });

          if (startDateFilter && endDateFilter) {
            chips.push({ type: "dateRange", label: `Dates: ${startDateFilter} to ${endDateFilter}` });
          } else if (startDateFilter) {
            chips.push({ type: "startDate", label: `Start Date: ${startDateFilter}` });
          } else if (endDateFilter) {
            chips.push({ type: "endDate", label: `End Date: ${endDateFilter}` });
          }

          customFilters.forEach(cf => {
            if (cf.value) {
              chips.push({ type: "custom", id: cf.id, label: `${cf.field} ${cf.operator} ${cf.value}` });
            }
          });

          if (chips.length === 0) return null;

          return (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Active Filters:</span>
              {(chips as Chip[]).map((chip, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="bg-white border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors px-2 py-1 flex items-center gap-1.5 shadow-sm rounded-md"
                >
                  <span className="text-xs font-medium">{chip.label}</span>
                  <button
                    onClick={() => removeFilterChip(chip.type, chip.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-7 px-2 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 font-semibold"
              >
                Clear All
              </Button>
            </div>
          );
        })()}
      </div>

      {/* BULK ASSIGN UI */}
      {selectedTaskIds.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-sm whitespace-nowrap">Bulk Assign:</span>

            {/* Bulk Assign to Person (Multi-select Assignees) */}
            <Popover open={bulkAssignPopoverOpen} onOpenChange={setBulkAssignPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 text-xs bg-white border border-slate-300 px-3">
                  <Users className="h-3 w-3 mr-1" /> Assignees
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-3">
                  <h4 className="font-semibold text-xs">Assign to Selected</h4>
                  <Select value="" onValueChange={(id) => {
                    if (!bulkAssignMembers.includes(id)) {
                      setBulkAssignMembers(prev => [...prev, id]);
                    }
                  }}>
                    <SelectTrigger className="w-full text-xs h-8">
                      <SelectValue placeholder="Add Assignee..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {allEmployees.map((e) => (
                        <SelectItem key={e.id} value={e.id} className="text-xs">
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1">
                    {bulkAssignMembers.map(id => (
                      <Badge key={id} variant="secondary" className="text-[10px] py-0 cursor-pointer" onClick={() => setBulkAssignMembers(prev => prev.filter(x => x !== id))}>
                        {allEmployees.find(e => e.id === id)?.name} ✕
                      </Badge>
                    ))}
                  </div>
                  {/* Bulk remove: take the people picked above and remove them
                      from every selected task in one go (adding is handled by
                      the main "Assign" button below, this just covers removal,
                      which wasn't possible before). */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={bulkAssignMembers.length === 0}
                    onClick={handleBulkRemoveAssignees}
                    title="Remove the selected people from all selected tasks"
                  >
                    Remove Selected from Tasks
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Bulk Assign Start Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-8 text-xs bg-white border border-slate-300 px-2"
                >
                  Start: {bulkAssignStartDate ? new Date(bulkAssignStartDate).toLocaleDateString('en-GB') : 'Pick date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-2">
                  <Input
                    type="date"
                    lang="en-GB"
                    value={bulkAssignStartDate}
                    onChange={(e) => {
                      const newStartDate = e.target.value;
                      setBulkAssignStartDate(newStartDate);
                      if (bulkAssignEndDate && newStartDate && bulkAssignEndDate < newStartDate) {
                        setBulkAssignEndDate(newStartDate);
                      }
                    }}
                    className="w-full h-8 text-xs"
                  />
                  {bulkAssignStartDate && (
                    <div className="text-xs text-slate-500 text-center">
                      {new Date(bulkAssignStartDate).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Bulk Assign End Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-8 text-xs bg-white border border-slate-300 px-2"
                >
                  End: {bulkAssignEndDate ? new Date(bulkAssignEndDate).toLocaleDateString('en-GB') : 'Pick date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-2">
                  <Input
                    type="date"
                    lang="en-GB"
                    value={bulkAssignEndDate}
                    min={bulkAssignStartDate || undefined}
                    onChange={(e) => {
                      const newEndDate = e.target.value;
                      setBulkAssignEndDate(
                        bulkAssignStartDate && newEndDate && newEndDate < bulkAssignStartDate
                          ? bulkAssignStartDate
                          : newEndDate
                      );
                    }}
                    className="w-full h-8 text-xs"
                  />
                  {bulkAssignEndDate && (
                    <div className="text-xs text-slate-500 text-center">
                      {new Date(bulkAssignEndDate).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Bulk Assign Completion Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-8 text-xs bg-white border border-slate-300 px-2"
                >
                  Completion: {bulkAssignCompletionDate ? new Date(bulkAssignCompletionDate).toLocaleDateString('en-GB') : 'Pick date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-2">
                  <Input
                    type="date"
                    lang="en-GB"
                    value={bulkAssignCompletionDate}
                    onChange={(e) => setBulkAssignCompletionDate(e.target.value)}
                    className="w-full h-8 text-xs"
                  />
                  {bulkAssignCompletionDate && (
                    <div className="text-xs text-slate-500 text-center">
                      {new Date(bulkAssignCompletionDate).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>


            <Button
              onClick={handleBulkAssign}
              disabled={bulkAssignMembers.length === 0 && !bulkAssignDepartment && !bulkAssignStartDate && !bulkAssignEndDate}
              className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm h-8 px-3 text-xs"
            >
              Assign
            </Button>

            <div className="h-6 w-[1px] bg-amber-300 mx-2" />

            {/* Bulk Assign Key Step */}
            <Popover open={bulkKeyStepPopoverOpen} onOpenChange={setBulkKeyStepPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 text-xs bg-white border border-slate-300 px-3">
                  <Key className="h-3 w-3 mr-1" /> Key Step
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-3">
                  <h4 className="font-semibold text-xs">Assign Key Step to Selected</h4>
                  <Select value={bulkKeyStepId} onValueChange={setBulkKeyStepId}>
                    <SelectTrigger className="w-full text-xs h-8">
                      <SelectValue placeholder="Select Key Step" />
                    </SelectTrigger>
                    <SelectContent>
                      {keySteps.filter(ks => !projectId || ks.projectId === projectId).map(ks => (
                        <SelectItem key={ks.id} value={ks.id} className="text-xs">{ks.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleBulkUpdateKeyStep} className="w-full h-8 text-xs" disabled={!bulkKeyStepId}>
                    Apply Key Step
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Bulk Assign CC */}
            <Popover open={bulkTagPopoverOpen} onOpenChange={setBulkTagPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 text-xs bg-white border border-slate-300 px-3">
                  <Hash className="h-3 w-3 mr-1" /> Tags
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="start">
                <div className="space-y-4">
                  <div className="flex gap-2 mb-4">
                    <Input
                      placeholder="New tag name..."
                      className="h-8 text-xs"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateTag();
                        }
                      }}
                    />
                    <Button size="sm" onClick={handleCreateTag} className="h-8 text-xs shrink-0">Create</Button>
                  </div>
                  <h4 className="font-semibold text-sm">Manage Tags</h4>
                  <div className="space-y-2">
                    <Label className="text-xs">Select Tags</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                      <Input
                        className="h-7 text-xs pl-7"
                        placeholder="Search tags..."
                        value={bulkTagSearchQuery}
                        onChange={(e) => setBulkTagSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto p-1 border rounded-md">
                      {allTags.filter(tag => tag.name.toLowerCase().includes(bulkTagSearchQuery.toLowerCase())).map(tag => {
                        const isSelected = bulkAssignTagsList.includes(tag.id);
                        return (
                          <Badge
                            key={tag.id}
                            variant={isSelected ? "default" : "outline"}
                            className="cursor-pointer text-xs font-normal px-2 py-0.5"
                            onClick={() => {
                              setBulkAssignTagsList(prev =>
                                isSelected ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                              );
                            }}
                          >
                            {tag.name}
                          </Badge>
                        );
                      })}
                      {allTags.length === 0 && <span className="text-xs text-muted-foreground p-1">No tags available</span>}
                      {allTags.length > 0 && allTags.filter(tag => tag.name.toLowerCase().includes(bulkTagSearchQuery.toLowerCase())).length === 0 && (
                        <span className="text-xs text-muted-foreground p-1">No tags match "{bulkTagSearchQuery}"</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handleBulkAssignTags("add")}
                      disabled={bulkAssignTagsList.length === 0}
                    >
                      Add Tags
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 text-xs"
                      onClick={() => handleBulkAssignTags("remove")}
                      disabled={bulkAssignTagsList.length === 0}
                    >
                      Remove Tags
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Bulk Assign Task Owner */}
            <Popover open={bulkTaskOwnerPopoverOpen} onOpenChange={setBulkTaskOwnerPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 text-xs bg-white border border-slate-300 px-3">
                  <UserCog className="h-3 w-3 mr-1" /> Task Owner
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-3">
                  <h4 className="font-semibold text-xs">Assign Task Owner to Selected</h4>
                  <Select value={bulkTaskOwnerId} onValueChange={setBulkTaskOwnerId}>
                    <SelectTrigger className="w-full text-xs h-8">
                      <SelectValue placeholder="Select Task Owner..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {allEmployees.map((e) => (
                        <SelectItem key={e.id} value={e.id} className="text-xs">
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleBulkAssignTaskOwner} className="w-full h-8 text-xs" disabled={!bulkTaskOwnerId}>
                    Apply Task Owner
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <div className="h-6 w-[1px] bg-amber-300 mx-2" />

            <Button
              onClick={() => setBulkDeleteConfirmOpen(true)}
              variant="destructive"
              className="h-8 px-3 text-xs shadow-sm"
            >
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </div>
        </div>
      )}
      {/* MAIN TABLE CONTAINER */}
      <div ref={tableScrollRef} className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm max-h-[calc(100vh-220px)] custom-scrollbar relative">
        <table className="w-max border-collapse table-fixed text-xs" style={{ width: tableWidth, minWidth: tableWidth }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 24 }} />
            <col style={{ width: 32 }} />
            <col style={{ width: 32 }} />
            {visibleResizableColumns.map(col => (
              <col key={col.id} data-resize-col={col.id} style={{ width: getColWidth(col.id) }} />
            ))}
            <col style={{ width: MANAGE_COL_WIDTH }} />
          </colgroup>

          {/* Sticky Table Header */}

          <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-md z-30 border-b border-slate-200 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
            <tr>
              <th className="px-2 py-2.5 align-middle border-r border-slate-200 w-10 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">#</th>
              <th className="px-1 py-2.5 align-middle border-r border-slate-200 w-6 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider"><GripVertical size={12} className="mx-auto" /></th>
              <th className="px-2 py-2.5 align-middle border-r border-slate-200 w-8 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all tasks"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-2 py-2.5 align-middle border-r border-slate-200 w-8 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {/* Collapse / Expand icon */}
              </th>
              {columnsConfig.filter(c => c.visible).map(col => {
                const isSortable = ['serial', 'taskName', 'project', 'keyStep', 'startDate', 'endDate', 'completionDate', 'createdAt', 'completedAt', 'taskOwner', 'tags'].includes(col.id);
                const isActiveSort = sortConfig?.column === col.id;

                const handleSort = () => {
                  if (!isSortable) return;
                  setSortConfig(prev => {
                    if (prev?.column === col.id) {
                      return prev.direction === 'asc' ? { column: col.id, direction: 'desc' } : null;
                    }
                    return { column: col.id, direction: 'asc' };
                  });
                };

                const thClass = cn(
                  "px-3 py-2.5 min-w-0 text-left align-middle text-[10px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-200 select-none transition-colors relative overflow-visible",
                  isSortable && "cursor-pointer hover:bg-slate-100/70 hover:text-slate-700",
                  isActiveSort && "bg-slate-100/60 text-slate-700"
                );

                const renderHeader = (label: string) => (
                  <th key={col.id} data-resize-col={col.id} className={thClass} style={{ width: getColWidth(col.id), minWidth: 0 }} onClick={handleSort}>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
                      {isSortable && (
                        <span className={cn("flex items-center shrink-0", isActiveSort ? "text-slate-600" : "text-slate-350")}>
                          {isActiveSort ? (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={10} />}
                        </span>
                      )}
                    </div>
                    {/* Drag handle to resize this column */}
                    <div
                      onMouseDown={(e) => handleColResizeStart(e, col.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/60 z-10"
                      title="Drag to resize column"
                    />
                  </th>
                );

                switch (col.id) {
                  case 'serial': return null;
                  case 'taskName': return renderHeader("Task Name");
                  case 'assignedBy': return renderHeader("Assigned By");
                  case 'taskOwner': return renderHeader("Task Owner");
                  case 'project': return renderHeader("Project");
                  case 'keyStep': return renderHeader("Key Step");
                  case 'period': return renderHeader("Period");
                  case 'frequency': return renderHeader("Frequency");
                  case 'assignees': return renderHeader("Assignees");
                  case 'ccMembers': return renderHeader("CC");
                  case 'tags': return renderHeader("Tags");
                  case 'startDate': return renderHeader("Start Date");
                  case 'endDate': return renderHeader("Due Date");
                  case 'completionDate': return renderHeader("Completion Date");
                  case 'durationDays': return renderHeader("Duration (Days)");
                  case 'priority': return renderHeader("Priority");
                  case 'status': return renderHeader("Status");
                  case 'progress': return renderHeader("Progress");
                  case 'remarks': return renderHeader("Delayed By");
                  case 'flags': return renderHeader("Flags");
                  default: return null;
                }
              })}
              <th className="w-[210px] min-w-[210px] max-w-[210px] px-2 py-2.5 align-middle text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Manage
              </th>
            </tr>
          </thead>


          <tbody>
            {/* Inline Quick Add Row — type a task name and press Enter to
                create the task instantly (scoped to the currently selected
                project). Every other field is left blank/default and can be
                filled in afterwards via the normal inline edit on the new row. */}
            {/* Inline Quick Add Row — type a task name and press Enter to
                create the task instantly. Scoped to the currently selected
                project when one is active; otherwise (e.g. "All Projects" /
                Freeze view) an inline project picker appears in the Project
                column so a project can still be chosen without leaving the
                table. Every other field is left blank/default and can be
                filled in afterwards via the normal inline edit on the new row. */}
            <tr className="border-b-2 border-dashed border-blue-200 bg-blue-50/40 h-9">
              <td className="px-2 py-1 border-r text-center" colSpan={4}>
                <Plus size={12} className="mx-auto text-blue-400" />
              </td>
              {columnsConfig.filter(c => c.visible).map(col => {
                // 'serial' is a fixed column rendered separately above (the
                // "#" cell) — skip it here too, exactly like the header and
                // real task rows do, so cells line up with the right headers.
                if (col.id === 'serial') return null;
                if (col.id === 'taskName') {
                  return (
                    <td key="inline-quick-add-taskName" className="px-3 py-1 border-r">
                      <Input
                        value={inlineQuickAddName}
                        onChange={(e) => setInlineQuickAddName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleInlineQuickAddTask();
                        }}
                        placeholder="Type a task name and press Enter…"
                        disabled={inlineQuickAddSubmitting}
                        className="h-7 text-xs p-1 focus:ring-1 focus:ring-blue-500 w-full bg-white"
                      />
                    </td>
                  );
                }
                if (col.id === 'project' && (!projectId || projectId === "all")) {
                  return (
                    <td key="inline-quick-add-project" className="px-2 py-1 border-r" onClick={(e) => e.stopPropagation()}>
                      <Select value={inlineQuickAddProjectId} onValueChange={setInlineQuickAddProjectId}>
                        <SelectTrigger className="h-7 text-[10px] p-1 w-full bg-white"><SelectValue placeholder="Select project…" /></SelectTrigger>
                        <SelectContent className="max-h-[200px] overflow-y-auto">
                          {projects.map(p => (
                            <SelectItem key={p.id} value={String(p.id)} className="text-[10px]">{p.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  );
                }
                return <td key={`inline-quick-add-${col.id}`} className="px-3 py-1 border-r" />;
              })}
              <td className="px-2 py-1 text-center text-[10px] text-slate-400 italic">
                {inlineQuickAddSubmitting ? "Adding…" : "New task"}
              </td>
            </tr>
            {/* 2. TASK LIST AND SUBTASK HIERARCHY */}
            {tasksLoading && tasks.length === 0 ? (
              <tr>
                <td colSpan={14}>
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
                    <p className="text-sm font-medium text-slate-500">Loading tasks…</p>
                  </div>
                </td>
              </tr>
            ) : !hasRequiredFilter ? (
              <tr>
                <td colSpan={14}>
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 text-slate-400">
                      <Search size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">Select a Department or Project to view tasks</p>
                      <p className="text-xs text-slate-400">Narrow down tasks using the filters above.</p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={14} className="p-12 text-center text-slate-505 italic">
                  No tasks found for the selected filters
                </td>
              </tr>
            ) : (
              Object.entries(groupedTasks).map(([groupName, tasksInGroup]) => {
                // PERF: build the "move to position" dropdown options ONCE per
                // group instead of re-building a full N-item list inside every
                // single row (that was O(rows^2) — up to ~10,000 element
                // allocations per render for a 100-row page).
                const positionItems = tasksInGroup.map((_, i) => (
                  <SelectItem key={i} value={String(i + 1)} className="text-[11px]">
                    {i + 1}
                  </SelectItem>
                ));

                return (
                  <Fragment key={groupName}>
                    {/* Category Headers (if grouped) */}
                    {((groupBy !== "none" && groupBy !== "") || assigneeFilter !== "all") && groupName && (
                      <tr className={groupName.startsWith("Assigned") ? "bg-blue-50/30 border-y border-blue-100" : "bg-slate-100/60 border-y border-slate-200"}>
                        <td colSpan={14} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                          <div className="flex items-center gap-2">
                            <ChevronDown size={12} className="text-slate-400" />
                            <span>{groupName}</span>
                            <span className="font-normal text-slate-400 normal-case">({tasksInGroup.length} {tasksInGroup.length === 1 ? 'task' : 'tasks'})</span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Render Task Rows */}
                    {tasksInGroup.map((task: Task, taskIndex: number) => {
                      const isExpanded = expandedTasks.includes(task.id);
                      const totalSubtasksCount = typeof task.subtaskCount === "number" ? task.subtaskCount : (Array.isArray(task.subtasks) ? task.subtasks.length : 0);
                      const isTaskCompleted = (task.status || "").toLowerCase() === "completed";
                      const isTaskCancelled = ["cancelled", "canceled"].includes((task.status || "").toLowerCase());
                      const taskProject = projects.find(p => String(p.id) === String(task.projectId));
                      const nowDate = new Date();
                      const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
                      const taskEnd = task.endDate ? new Date(task.endDate) : null;
                      const isTaskOverdue = !!(taskEnd && taskEnd < today && !isTaskCompleted);

                      return (
                        <Fragment key={task.id}>
                          {/* Parent Task Row */}
                          <tr
                            data-task-id={task.id}
                            draggable={dragReadyTaskId === task.id}
                            onDragStart={(e) => handleTaskDragStart(e, task.id)}
                            onDragOver={(e) => handleTaskDragOver(e, task.id)}
                            onDrop={(e) => handleTaskDrop(e, task.id)}
                            onDragEnd={handleTaskDragEnd}
                            className={cn(
                              "border-b border-slate-150 hover:bg-slate-50/80 transition-colors h-9 cursor-pointer",
                              dragOverTaskId === task.id ? "border-t-2 border-t-blue-500" : "",
                              isTaskCompleted ? "opacity-75 bg-emerald-50/20" : "",
                              (!isTaskCompleted && task.isIssue) ? "bg-rose-50 border-l-4 border-rose-400" : "",
                              (!isTaskCompleted && task.isAddon && !task.isIssue) ? "bg-orange-50 border-l-4 border-orange-400" : "",
                              (!isTaskCompleted && !task.isIssue && !task.isAddon && isTaskOverdue) ? "bg-red-50/60 border-l-4 border-red-500" : "",
                              (task.parentTaskId && task.isAddon) ? "!bg-amber-100 border-l-4 border-amber-500" : "",
                              (task.parentTaskId && task.isIssue) ? "!bg-pink-50 border-l-4 border-pink-400" : "",
                              (task.parentTaskId && !task.isAddon && !task.isIssue) ? "!bg-slate-300 border-l-4 border-slate-600" : ""
                            )}>

                            {/* Fixed: Serial # column with dropdown */}
                            <td className="px-2 py-1 border-r w-12 text-center text-[11px] font-bold text-slate-500 select-none no-navigate relative" onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={String(taskIndex + 1)}
                                onValueChange={(val) => {
                                  const targetIndex = parseInt(val) - 1;
                                  const targetTaskId = tasksInGroup[targetIndex]?.id;
                                  if (targetTaskId) {
                                    handleMoveToPosition(task.id, targetTaskId);
                                  }
                                }}
                              >
                                <SelectTrigger className="h-6 w-full text-[11px] font-bold px-1 py-0 border-0 bg-transparent hover:bg-slate-100 shadow-none focus:ring-0 [&>svg]:opacity-0 hover:[&>svg]:opacity-100">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-h-[250px]">
                                  {positionItems}
                                </SelectContent>
                              </Select>
                            </td>

                            {/* Fixed: Drag Handle */}
                            <td
                              className="px-1 py-1 text-center border-r w-6 cursor-grab active:cursor-grabbing hover:bg-slate-100 transition-colors no-navigate"
                              onMouseDown={() => setDragReadyTaskId(task.id)}
                              onMouseUp={() => setDragReadyTaskId(null)}
                              onMouseLeave={() => setDragReadyTaskId(null)}
                            >
                              <GripVertical size={14} className="text-slate-300 hover:text-slate-500 transition-colors mx-auto pointer-events-none" />
                            </td>

                            {/* Selection Checkbox */}
                            <td className="px-2 py-1 text-center border-r">
                              <input
                                type="checkbox"
                                checked={selectedTaskIds.includes(task.id)}
                                onChange={() => toggleSelectTask(task.id)}
                                aria-label={`Select task ${task.taskName}`}
                                className="rounded border-slate-350 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                              />
                            </td>

                            {/* Expand chevron */}
                            <td className="px-2 py-1 text-center border-r">
                              <button
                                onClick={() => toggleExpand(task.id)}
                                className={cn(
                                  "flex items-center justify-center mx-auto rounded p-0.5 transition-colors",
                                  totalSubtasksCount > 0 ? "text-blue-600 hover:bg-blue-50" : "text-slate-300"
                                )}
                                title={totalSubtasksCount > 0 ? (isExpanded ? "Collapse subtasks" : "Expand subtasks") : "No subtasks"}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </td>


                            {columnsConfig.filter(c => c.visible).map(col => {
                              switch (col.id) {
                                case 'serial': return null; /* serial is now a fixed column, skip in map */
                                case 'assignedBy': return (
                                  <td key="assignedBy" className="px-3 py-1 border-r no-navigate" onClick={(e) => e.stopPropagation()}>
                                    {editingTaskField?.taskId === task.id && editingTaskField?.field === "assignerId" ? (
                                      <Select
                                        defaultOpen
                                        onOpenChange={(open) => { if (!open) setEditingTaskField(null); }}
                                        value={task.assignerId || ""}
                                        onValueChange={(val) => handleInlineTaskUpdate(task.id, "assignerId", val)}
                                      >
                                        <SelectTrigger className="h-7 text-[10px] p-1 w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
                                        <SelectContent className="max-h-[200px]">
                                          {allEmployees.map(e => <SelectItem key={e.id} value={e.id} className="text-[10px]">{e.name}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <span
                                        className="cursor-pointer hover:bg-slate-200 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[100px] inline-block transition-colors"
                                        onClick={(e) => { e.stopPropagation(); startEditingTask(task.id, "assignerId", task.assignerId || ""); }}
                                      >
                                        {allEmployees.find((e: any) => String(e.id) === String(task.assignerId))?.name || <span className="text-slate-400 italic">None</span>}
                                      </span>
                                    )}
                                  </td>
                                );
                                case 'taskOwner': return (
                                  <td key="taskOwner" className="px-3 py-1 border-r no-navigate" onClick={(e) => e.stopPropagation()}>
                                    {editingTaskField?.taskId === task.id && editingTaskField?.field === "taskOwnerId" ? (
                                      <Select
                                        defaultOpen
                                        onOpenChange={(open) => { if (!open) setEditingTaskField(null); }}
                                        value={task.taskOwnerId || "__none__"}
                                        onValueChange={(val) => handleInlineTaskUpdate(task.id, "taskOwnerId", val === "__none__" ? "" : val)}
                                      >
                                        <SelectTrigger className="h-7 text-[10px] p-1 w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
                                        <SelectContent className="max-h-[200px]">
                                          <SelectItem value="__none__" className="text-[10px] text-slate-400 italic">None</SelectItem>
                                          {allEmployees.map(e => <SelectItem key={e.id} value={e.id} className="text-[10px]">{e.name}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <span
                                        className="cursor-pointer hover:bg-slate-200 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[100px] inline-block transition-colors"
                                        onClick={(e) => { e.stopPropagation(); startEditingTask(task.id, "taskOwnerId", task.taskOwnerId || ""); }}
                                      >
                                        {allEmployees.find((e: any) => String(e.id) === String(task.taskOwnerId))?.name || <span className="text-slate-400 italic">None</span>}
                                      </span>
                                    )}
                                  </td>
                                );
                                case 'taskName': {
                                  const parentTaskOfRow = task.parentTaskId ? tasks.find(t => t.id === task.parentTaskId) : null;
                                  return (
                                    <Fragment key="taskName">
                                      {/* Task Name (Inline editable) */}
                                      <td className={cn("px-3 py-1 border-r font-medium text-slate-900 overflow-hidden", task.parentTaskId ? "pl-1" : "")}>
                                        {editingTaskField?.taskId === task.id && editingTaskField?.field === "taskName" ? (
                                          <Input
                                            autoFocus
                                            className="h-7 text-xs p-1 focus:ring-1 focus:ring-blue-500 w-full"
                                            value={tempTaskValue}
                                            onChange={(e) => setTempTaskValue(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleInlineTaskUpdate(task.id, "taskName", tempTaskValue);
                                              if (e.key === 'Escape') setEditingTaskField(null);
                                            }}
                                            onBlur={() => handleInlineTaskUpdate(task.id, "taskName", tempTaskValue)}
                                          />
                                        ) : (
                                          <div className="flex items-center gap-1.5 justify-between group">
                                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                              {/* Child-of-task indicator: arrow + SUB badge, same visual language as
                                                real subtask rows, colored by THIS task's own isIssue/isAddon flag
                                                (not the parent's), so it clearly marks what this child is flagged as. */}
                                              {parentTaskOfRow && (
                                                <>
                                                  <span className="font-mono text-slate-400 select-none text-[10px] shrink-0">
                                                    └─
                                                  </span>
                                                  <span className={cn(
                                                    "text-[7px] font-bold uppercase tracking-wider rounded px-1 py-0 whitespace-nowrap border shrink-0",
                                                    task.isIssue
                                                      ? "text-pink-600 bg-pink-100 border-pink-200"
                                                      : task.isAddon
                                                        ? "text-amber-600 bg-amber-100 border-amber-200"
                                                        : "text-indigo-500 bg-indigo-100 border-indigo-200"
                                                  )}>
                                                    Sub
                                                  </span>
                                                </>
                                              )}
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span
                                                    className={cn("cursor-pointer hover:underline truncate", isTaskOverdue ? "text-red-700 font-semibold" : "", (isTaskCompleted || isTaskCancelled) ? "line-through text-slate-400" : "")}
                                                    onClick={(e) => { e.stopPropagation(); startEditingTask(task.id, "taskName", task.taskName); }}
                                                  >
                                                    {task.taskName}
                                                  </span>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-sm bg-slate-900 text-white text-[11px] p-2 rounded" side="top">
                                                  <div className="font-semibold text-blue-200 mb-1">{getTaskHierarchy(task)}</div>
                                                  <div className="text-slate-200">{task.description || "No description"}</div>
                                                  {parentTaskOfRow && (
                                                    <div className="text-slate-400 mt-1">Under: {parentTaskOfRow.taskName}</div>
                                                  )}
                                                </TooltipContent>
                                              </Tooltip>
                                              {getDiscussionCountForTask(task) > 0 && (
                                                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] px-1.5 py-0 font-semibold shrink-0 flex items-center gap-0.5">
                                                  <MessageSquare size={10} />
                                                  {getDiscussionCountForTask(task)}
                                                </Badge>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                              {task.ticketId && (
                                                <Badge
                                                  variant="secondary"
                                                  className="cursor-pointer bg-emerald-50 text-emerald-750 border-emerald-200 text-[8px] px-1 py-0.5 uppercase"
                                                  onClick={() => window.location.href = `/tickets?tab=manage`}
                                                >
                                                  Ticket
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </td>
                                    </Fragment>
                                  );
                                }
                                case 'project': return (
                                  <Fragment key="project">
                                    {/* Project Column */}
                                    <td className="px-3 py-1 border-r text-slate-700 font-semibold truncate max-w-[140px] no-navigate" onClick={(e) => e.stopPropagation()}>
                                      {editingTaskField?.taskId === task.id && editingTaskField?.field === "projectId" ? (
                                        <Select
                                          defaultOpen
                                          onOpenChange={(open) => { if (!open) setEditingTaskField(null); }}
                                          value={task.projectId || ""}
                                          onValueChange={(val) => handleInlineTaskUpdate(task.id, "projectId", val)}
                                        >
                                          <SelectTrigger className="h-7 text-[10px] p-1 w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
                                          <SelectContent className="max-h-[200px]">
                                            {projects.map(p => <SelectItem key={p.id} value={p.id} className="text-[10px]">{p.title}</SelectItem>)}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <span
                                          className="cursor-pointer hover:bg-slate-100 p-0.5 rounded text-slate-600 font-medium block w-full truncate transition-colors"
                                          title={taskProject?.title}
                                          onClick={(e) => { e.stopPropagation(); startEditingTask(task.id, "projectId", task.projectId); }}
                                        >
                                          {taskProject ? taskProject.title : <span className="text-[10px] text-slate-400 italic">No Project</span>}
                                        </span>
                                      )}
                                    </td>
                                  </Fragment>
                                );
                                case 'keyStep': return (
                                  <Fragment key="keyStep">
                                    {/* Key Step Column */}
                                    <td className="px-3 py-1 border-r">
                                      <KeyStepBadge task={task} />
                                    </td>
                                  </Fragment>
                                );
                                case 'period': return (
                                  <Fragment key="period">
                                    {/* Period Column */}
                                    <td className="px-3 py-1 border-r text-center">
                                      <PeriodBadge task={task} />
                                    </td>
                                  </Fragment>
                                );
                                case 'frequency': return (
                                  <Fragment key="frequency">
                                    {/* Frequency Column */}
                                    <td className="px-3 py-1 border-r text-center">
                                      <FrequencyBadge task={task} />
                                    </td>
                                  </Fragment>
                                );
                                case 'assignees': return (
                                  <Fragment key="assignees">
                                    {/* Assignees Column (overlapping circular badges) */}
                                    <td className="px-3 py-1 border-r no-navigate" onClick={(e) => e.stopPropagation()}>
                                      {(() => {
                                        const members = Array.isArray(task.taskMembers) ? task.taskMembers : [];
                                        return (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <div className="flex -space-x-1.5 overflow-hidden hover:space-x-1 transition-all duration-300 cursor-pointer p-0.5">
                                                {members.length === 0 ? (
                                                  <span className="text-[10px] text-slate-350 italic">Unassigned</span>
                                                ) : (
                                                  members.map((memberId: string, idx: number) => {
                                                    const emp = allEmployees.find((e: any) => String(e.id) === String(memberId));
                                                    const name = emp?.name || memberId;
                                                    const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

                                                    if (idx > 3) return null;
                                                    if (idx === 3 && members.length > 4) {
                                                      return (
                                                        <div key="extra" className="relative inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 border border-white text-[8px] font-bold text-slate-655 z-0">
                                                          +{members.length - 3}
                                                        </div>
                                                      );
                                                    }

                                                    return (
                                                      <div
                                                        key={memberId}
                                                        className="relative inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500 border border-white text-[8px] font-bold text-white shadow-sm ring-1 ring-slate-900/5 transition-transform hover:z-10 hover:scale-110"
                                                        title={name}
                                                      >
                                                        {initials}
                                                      </div>
                                                    );
                                                  })
                                                )}
                                              </div>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-64 p-0 shadow-xl border-slate-200" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                              <Command>
                                                <CommandInput placeholder="Search member..." className="h-8 text-xs" />
                                                <CommandList className="max-h-[300px] overflow-y-auto">
                                                  <CommandEmpty className="py-2 text-xs text-slate-400 text-center">No member found.</CommandEmpty>
                                                  <CommandGroup heading="Assign Members">
                                                    {allEmployees.map((emp) => {
                                                      const isAssigned = members.some(mId => String(mId) === String(emp.id));
                                                      return (
                                                        <CommandItem
                                                          key={emp.id}
                                                          onSelect={() => handleMemberToggle(task.id, String(emp.id))}
                                                          className="text-xs cursor-pointer"
                                                        >
                                                          <div className={cn(
                                                            "mr-2 flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-primary",
                                                            isAssigned ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                                                          )}>
                                                            <Check className="h-2.5 w-2.5" />
                                                          </div>
                                                          <span className="flex-1 text-[11px]">{emp.name}</span>
                                                          {emp.department && <span className="text-[9px] text-slate-400 bg-slate-100 px-1 rounded">{emp.department}</span>}
                                                        </CommandItem>
                                                      );
                                                    })}
                                                  </CommandGroup>
                                                </CommandList>
                                              </Command>
                                            </PopoverContent>
                                          </Popover>
                                        );
                                      })()}
                                    </td>
                                  </Fragment>
                                );
                                case 'startDate': return (
                                  <Fragment key="startDate">
                                    {/* Start Date Column */}
                                    <td className="px-2 py-1 text-center border-r font-medium text-slate-700">
                                      {editingTaskField?.taskId === task.id && editingTaskField?.field === "startDate" ? (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="date"
                                            lang="en-GB"
                                            autoFocus
                                            className="h-7 text-[10px] p-0.5"
                                            value={tempTaskValue}
                                            onChange={(e) => setTempTaskValue(e.target.value)}
                                            onBlur={() => handleInlineTaskUpdate(task.id, "startDate", tempTaskValue)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleInlineTaskUpdate(task.id, "startDate", tempTaskValue);
                                              if (e.key === 'Escape') setEditingTaskField(null);
                                            }}
                                          />
                                          {tempTaskValue && (
                                            <>
                                              <button
                                                type="button"
                                                title="Save date"
                                                className="text-emerald-500 hover:text-emerald-600 shrink-0"
                                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleInlineTaskUpdate(task.id, "startDate", tempTaskValue); }}
                                              >
                                                <Check size={12} />
                                              </button>
                                              <button
                                                type="button"
                                                title="Clear date"
                                                className="text-slate-400 hover:text-red-500 shrink-0"
                                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setTempTaskValue(""); handleInlineTaskUpdate(task.id, "startDate", ""); }}
                                              >
                                                <X size={12} />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      ) : (
                                        <span
                                          className="cursor-pointer hover:bg-slate-100 p-0.5 rounded inline-flex items-center gap-1 group/date"
                                          onClick={(e) => { e.stopPropagation(); startEditingTask(task.id, "startDate", task.startDate || ""); }}
                                        >
                                          {formatDate(task.startDate) || "—"}
                                          {task.startDate && (
                                            <X
                                              size={10}
                                              className="text-slate-400 hover:text-red-500 opacity-0 group-hover/date:opacity-100 transition-opacity shrink-0"
                                              onClick={(e) => { e.stopPropagation(); handleInlineTaskUpdate(task.id, "startDate", ""); }}
                                            />
                                          )}
                                        </span>
                                      )}
                                    </td>
                                  </Fragment>
                                );
                                case 'endDate': return (
                                  <Fragment key="endDate">
                                    {/* End Date Column */}
                                    <td className="px-2 py-1 text-center border-r font-medium text-slate-700">
                                      {editingTaskField?.taskId === task.id && editingTaskField?.field === "endDate" ? (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="date"
                                            lang="en-GB"
                                            autoFocus
                                            className="h-7 text-[10px] p-0.5"
                                            value={tempTaskValue}
                                            min={task.startDate ? new Date(task.startDate).toISOString().split("T")[0] : undefined}
                                            onChange={(e) => {
                                              const newVal = e.target.value;
                                              const startD = task.startDate ? new Date(task.startDate).toISOString().split("T")[0] : null;
                                              setTempTaskValue(startD && newVal && newVal < startD ? startD : newVal);
                                            }}
                                            onBlur={() => handleInlineTaskUpdate(task.id, "endDate", tempTaskValue)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleInlineTaskUpdate(task.id, "endDate", tempTaskValue);
                                              if (e.key === 'Escape') setEditingTaskField(null);
                                            }}
                                          />
                                          {tempTaskValue && (
                                            <>
                                              <button
                                                type="button"
                                                title="Save date"
                                                className="text-emerald-500 hover:text-emerald-600 shrink-0"
                                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleInlineTaskUpdate(task.id, "endDate", tempTaskValue); }}
                                              >
                                                <Check size={12} />
                                              </button>
                                              <button
                                                type="button"
                                                title="Clear date"
                                                className="text-slate-400 hover:text-red-500 shrink-0"
                                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setTempTaskValue(""); handleInlineTaskUpdate(task.id, "endDate", ""); }}
                                              >
                                                <X size={12} />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      ) : (
                                        <span
                                          className="cursor-pointer hover:bg-slate-100 p-0.5 rounded inline-flex items-center gap-1 group/date"
                                          onClick={(e) => { e.stopPropagation(); startEditingTask(task.id, "endDate", task.endDate || ""); }}
                                        >
                                          {formatDate(task.endDate) || "—"}
                                          {task.endDate && (
                                            <X
                                              size={10}
                                              className="text-slate-400 hover:text-red-500 opacity-0 group-hover/date:opacity-100 transition-opacity shrink-0"
                                              onClick={(e) => { e.stopPropagation(); handleInlineTaskUpdate(task.id, "endDate", ""); }}
                                            />
                                          )}
                                        </span>
                                      )}
                                    </td>
                                  </Fragment>
                                );
                                case 'completionDate': return (
                                  <Fragment key="completionDate">
                                    {/* Completion Date Column */}
                                    <td className="px-2 py-1 text-center border-r font-medium text-slate-700">
                                      {editingTaskField?.taskId === task.id && editingTaskField?.field === "completionDate" ? (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="date"
                                            lang="en-GB"
                                            autoFocus
                                            className="h-7 text-[10px] p-0.5"
                                            value={tempTaskValue}
                                            onChange={(e) => setTempTaskValue(e.target.value)}
                                            onBlur={() => handleInlineTaskUpdate(task.id, "completionDate", tempTaskValue)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleInlineTaskUpdate(task.id, "completionDate", tempTaskValue);
                                              if (e.key === 'Escape') setEditingTaskField(null);
                                            }}
                                          />
                                          {tempTaskValue && (
                                            <button
                                              type="button"
                                              title="Clear date"
                                              className="text-slate-400 hover:text-red-500 shrink-0"
                                              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setTempTaskValue(""); handleInlineTaskUpdate(task.id, "completionDate", ""); }}
                                            >
                                              <X size={12} />
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        <span
                                          className="cursor-pointer hover:bg-slate-100 p-0.5 rounded inline-flex items-center gap-1 group/date"
                                          onClick={(e) => { e.stopPropagation(); startEditingTask(task.id, "completionDate", task.completionDate || ""); }}
                                        >
                                          {formatDate(task.completionDate) || "—"}
                                          {task.completionDate && (
                                            <X
                                              size={10}
                                              className="text-slate-400 hover:text-red-500 opacity-0 group-hover/date:opacity-100 transition-opacity shrink-0"
                                              onClick={(e) => { e.stopPropagation(); handleInlineTaskUpdate(task.id, "completionDate", ""); }}
                                            />
                                          )}
                                        </span>
                                      )}
                                    </td>
                                  </Fragment>
                                );
                                case 'durationDays': return (
                                  <Fragment key="durationDays">
                                    {/* Duration (Number of Days) — auto-computes End Date = Start Date + N days */}
                                    <td className="px-2 py-1 text-center border-r font-medium text-slate-700" onClick={(e) => e.stopPropagation()}>
                                      {editingTaskField?.taskId === task.id && editingTaskField?.field === "durationDays" ? (
                                        <Input
                                          type="number"
                                          min={0}
                                          autoFocus
                                          className="h-7 text-[10px] p-0.5 text-center w-16 mx-auto"
                                          value={tempTaskValue}
                                          onChange={(e) => setTempTaskValue(e.target.value)}
                                          onBlur={() => handleInlineTaskUpdate(task.id, "durationDays", tempTaskValue === "" ? null : Number(tempTaskValue))}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleInlineTaskUpdate(task.id, "durationDays", tempTaskValue === "" ? null : Number(tempTaskValue));
                                            if (e.key === 'Escape') setEditingTaskField(null);
                                          }}
                                          title={!task.startDate ? "Set a Start Date first so the End Date can be calculated" : undefined}
                                        />
                                      ) : (
                                        <span
                                          className="cursor-pointer hover:bg-slate-100 p-0.5 rounded inline-flex items-center gap-1"
                                          onClick={(e) => { e.stopPropagation(); startEditingTask(task.id, "durationDays", typeof task.durationDays === 'number' ? String(task.durationDays) : ""); }}
                                          title={!task.startDate ? "Set a Start Date first so the End Date can be calculated" : "Days from Start Date — End Date auto-updates"}
                                        >
                                          {typeof task.durationDays === 'number' ? `${task.durationDays}d` : "—"}
                                        </span>
                                      )}
                                    </td>
                                  </Fragment>
                                );
                                case 'priority': return (
                                  <Fragment key="priority">
                                    {/* Priority Column */}
                                    <td className="px-3 py-1 border-r text-center">
                                      <PriorityBadge task={task} />
                                    </td>
                                  </Fragment>
                                );
                                case 'status': return (
                                  <Fragment key="status">
                                    {/* Status Column */}
                                    <td className="px-3 py-1 border-r text-center">
                                      <StatusBadge task={task} />
                                    </td>
                                  </Fragment>
                                );
                                case 'progress': return (
                                  <Fragment key="progress">
                                    {/* Progress Column */}
                                    <td className="px-3 py-1 border-r text-center">
                                      {isAdmin ? (
                                        <div className="flex items-center gap-1.5 w-full">
                                          <Progress value={task.progress || 0} className="h-1.5 flex-1 bg-slate-100" />
                                          <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            defaultValue={task.progress || 0}
                                            key={`progress-${task.id}-${task.progress || 0}`}
                                            onBlur={(e) => {
                                              let val = parseInt(e.target.value, 10);
                                              if (isNaN(val)) val = 0;
                                              val = Math.max(0, Math.min(100, val));
                                              if (val !== (task.progress || 0)) {
                                                handleInlineTaskUpdate(task.id, "progress", val);
                                              } else {
                                                e.target.value = String(val);
                                              }
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                (e.target as HTMLInputElement).blur();
                                              }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-[10px] font-bold text-slate-600 shrink-0 w-12 text-right border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                          />
                                          <span className="text-[10px] font-bold text-slate-600 shrink-0">%</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1.5 w-full">
                                          <Progress value={task.progress || 0} className="h-1.5 flex-1 bg-slate-100" />
                                          <span className="text-[10px] font-bold text-slate-600 shrink-0 w-8 text-right">{task.progress || 0}%</span>
                                        </div>
                                      )}
                                    </td>
                                  </Fragment>
                                );
                                case 'tags': return (
                                  <Fragment key="tags">
                                    <td className="px-3 py-1 border-r">
                                      <InlineTagCell task={task} allTags={allTags} setAllTags={setAllTags} setTasks={setTasks} />
                                    </td>
                                  </Fragment>
                                );
                                case 'ccMembers': return (
                                  <Fragment key="ccMembers">
                                    {/* CC Members Column */}
                                    <td className="px-3 py-1 border-r">
                                      {(() => {
                                        const members = Array.isArray(task.ccMembers) ? task.ccMembers : [];
                                        if (members.length === 0) return <span className="text-[10px] text-slate-350 italic">None</span>;

                                        return (
                                          <div className="flex flex-wrap gap-1">
                                            {members.map(memberId => {
                                              const emp = allEmployees.find((e: any) => String(e.id) === String(memberId));
                                              const name = emp?.name || memberId;
                                              return (
                                                <span key={memberId} className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded border border-slate-200 truncate max-w-[80px]" title={name}>
                                                  {name}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        );
                                      })()}
                                    </td>
                                  </Fragment>
                                );
                                case 'remarks': return (
                                  <Fragment key="remarks">
                                    {/* Remarks Column */}
                                    <td className="px-3 py-1 border-r text-center">
                                      {(() => {
                                        const remarks = computeRemarks(task);
                                        if (!remarks) return <span className="text-[10px] text-slate-400">—</span>;
                                        const isDelayed = remarks.includes('+');
                                        return (
                                          <span className={cn(
                                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                            isDelayed ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                                          )}>
                                            {remarks}
                                          </span>
                                        );
                                      })()}
                                    </td>
                                  </Fragment>
                                );
                                case 'flags': return (
                                  <Fragment key="flags">
                                    {/* Flags Column */}
                                    <td className="px-3 py-1 border-r text-center no-navigate" onClick={(e) => e.stopPropagation()}>
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className="flex items-center justify-center gap-1 w-full hover:bg-slate-50 py-1 rounded transition-colors cursor-pointer min-h-[24px]">
                                            {task.isAddon && (
                                              <span className="text-[9px] font-bold uppercase bg-blue-100 text-blue-700 border border-blue-200 px-1 rounded">Addon</span>
                                            )}
                                            {task.isIssue && (
                                              <span className="text-[9px] font-bold uppercase bg-orange-100 text-orange-700 border border-orange-200 px-1 rounded flex items-center gap-0.5">
                                                <AlertTriangle size={8} /> Issue
                                              </span>
                                            )}
                                            {!task.isAddon && !task.isIssue && <span className="text-slate-300 text-[10px]">—</span>}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-48 p-0" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                                          <Command>
                                            <CommandList>
                                              <CommandGroup>
                                                <CommandItem onSelect={() => {
                                                  if (!task.isAddon) {
                                                    setPendingFlagTask({ id: task.id, flag: 'isAddon', projectId: task.projectId });
                                                  } else {
                                                    handleInlineTaskUpdate(task.id, 'isAddon', false);
                                                    handleInlineTaskUpdate(task.id, 'parentTaskId', null);
                                                  }
                                                }} className="cursor-pointer">
                                                  <Check className={cn("mr-2 h-4 w-4", task.isAddon ? "opacity-100" : "opacity-0")} />
                                                  <span className="text-blue-700 font-semibold">Addon</span>
                                                </CommandItem>
                                                <CommandItem onSelect={() => {
                                                  if (!task.isIssue) {
                                                    setPendingFlagTask({ id: task.id, flag: 'isIssue', projectId: task.projectId });
                                                  } else {
                                                    handleInlineTaskUpdate(task.id, 'isIssue', false);
                                                    handleInlineTaskUpdate(task.id, 'parentTaskId', null);
                                                  }
                                                }} className="cursor-pointer">
                                                  <Check className={cn("mr-2 h-4 w-4", task.isIssue ? "opacity-100" : "opacity-0")} />
                                                  <span className="text-orange-700 font-semibold flex items-center gap-1"><AlertTriangle size={12} /> Mark as Issue</span>
                                                </CommandItem>
                                              </CommandGroup>
                                            </CommandList>
                                          </Command>
                                        </PopoverContent>
                                      </Popover>
                                    </td>
                                  </Fragment>
                                );
                                default: return null;
                              }
                            })}
                            {/* Actions Column */}
                            <td className="w-[210px] min-w-[210px] max-w-[210px] px-2 py-1 text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                {/* Move Task Up / Down: reorders within the current group using
                                    the same executeReorder logic that powers drag-and-drop. */}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const targetTaskId = tasksInGroup[taskIndex - 1]?.id;
                                    if (targetTaskId) executeReorder(task.id, targetTaskId);
                                  }}
                                  disabled={taskIndex === 0}
                                  title="Move Up"
                                >
                                  <ArrowUp size={12} />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const targetTaskId = tasksInGroup[taskIndex + 1]?.id;
                                    if (targetTaskId) executeReorder(task.id, targetTaskId);
                                  }}
                                  disabled={taskIndex === tasksInGroup.length - 1}
                                  title="Move Down"
                                >
                                  <ArrowDown size={12} />
                                </Button>

                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  onClick={() => navigate(`/add-task?id=${task.id}&projectId=${task.projectId}`)}
                                  title="Edit Task"
                                >
                                  <Edit size={12} />
                                </Button>

                                {/* Task Dependency & Automatic Schedule Management: view this task's
                                    full schedule history right from the list, without opening Edit Task. */}
                                <TaskScheduleHistoryDialog taskId={task.id} taskName={task.taskName} compact />

                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => {
                                    setCloneTaskData({ id: task.id, name: task.taskName });
                                    setCloneTaskNewName(`${task.taskName} (Copy)`);
                                    setCloneTaskOpen(true);
                                  }}
                                  title="Clone Task"
                                >
                                  <Copy size={12} />
                                </Button>

                                {isTaskCompleted && !movedToCompletedIds.has(task.id) && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                    onClick={() => askMoveToCompleted(task)}
                                    title="Move to Completed page"
                                  >
                                    <CheckCircle2 size={12} />
                                  </Button>
                                )}

                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  onClick={() => {
                                    const proj = projects.find(p => String(p.id) === String(task.projectId));
                                    const projectTitle = proj?.title || "";
                                    const keyStep = keySteps.find(k => String(k.id) === String(task.keyStepId));
                                    const keyStepTitle = keyStep?.title || "";
                                    const params = new URLSearchParams();
                                    if (task.projectId) params.set("projectId", String(task.projectId));
                                    if (projectTitle) params.set("projectTitle", String(projectTitle));
                                    if (task.keyStepId) params.set("keyStepId", String(task.keyStepId));
                                    if (keyStepTitle) params.set("keyStepTitle", String(keyStepTitle));
                                    if (task.id) params.set("taskId", String(task.id));
                                    if (task.taskName) params.set("taskName", String(task.taskName));
                                    // Navigate to discussion with metadata so Discussion can open the right thread
                                    navigate(`/discussion?${params.toString()}`);
                                  }}
                                  title="Discuss Task"
                                >
                                  <MessageSquare size={12} />
                                </Button>

                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-red-650 hover:text-red-750 hover:bg-red-50"
                                  onClick={() => askDelete(task)}
                                  title="Delete Task"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                            </td>
                          </tr>

                          {/* Render Nested Expandable Subtask Rows */}
                          {isExpanded && (
                            <>
                              {Array.isArray(task.subtasks) && task.subtasks.map((subtask, subIndex) => {
                                const isSubtaskCompleted = !!subtask.isCompleted;
                                const members = Array.isArray(subtask.assignedTo) ? subtask.assignedTo : [];

                                return (
                                  <tr
                                    key={subtask.id || subIndex}
                                    className={cn(
                                      "hover:brightness-95 border-b border-slate-200 transition-colors h-8 text-[11px] border-l-4",
                                      isSubtaskCompleted
                                        ? "opacity-70 bg-green-50/60 border-l-green-400"
                                        : subtask.isIssue
                                          ? "bg-pink-50 border-l-pink-400"
                                          : subtask.isAddon
                                            ? "bg-amber-50 border-l-amber-400"
                                            : "bg-indigo-50/60 border-l-indigo-300"
                                    )}
                                  >
                                    {/* Fixed: serial # placeholder for subtask */}
                                    <td className="px-2 py-0.5 border-r text-center text-slate-300 text-[9px]">—</td>

                                    {/* Empty bullet (drag placeholder) */}
                                    <td className="px-2 py-0.5 text-center border-r text-slate-400">
                                      <span className="text-[9px] font-bold select-none">•</span>
                                    </td>

                                    {/* Subtask tree line symbol + badge */}
                                    <td className="px-1 py-0.5 text-center border-r font-mono text-indigo-400 select-none text-[10px]">
                                      └─
                                    </td>
                                    <td className="px-1 py-0.5 border-r">
                                      <span className="text-[7px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-100 border border-indigo-200 rounded px-1 py-0 whitespace-nowrap">
                                        Sub
                                      </span>
                                    </td>


                                    {columnsConfig.filter(c => c.visible).map(col => {
                                      switch (col.id) {
                                        case 'serial': return null;
                                        case 'assignedBy': return (
                                          <td key="assignedBy" className="px-3 py-0.5 border-r no-navigate" onClick={(e) => e.stopPropagation()}>
                                            {editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "assignerId" ? (
                                              <Select
                                                defaultOpen
                                                onOpenChange={(open) => { if (!open) setEditingSubtaskField(null); }}
                                                value={subtask.assignerId || ""}
                                                onValueChange={(val) => handleInlineSubtaskUpdate(task.id, String(subtask.id), "assignerId", val)}
                                              >
                                                <SelectTrigger className="h-6 text-[10px] p-1 w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
                                                <SelectContent className="max-h-[200px]">
                                                  {allEmployees.map(e => <SelectItem key={e.id} value={e.id} className="text-[10px]">{e.name}</SelectItem>)}
                                                </SelectContent>
                                              </Select>
                                            ) : (
                                              <span
                                                className="cursor-pointer hover:bg-slate-200 text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[90px] inline-block transition-colors"
                                                onClick={(e) => { e.stopPropagation(); startEditingSubtask(String(subtask.id), "assignerId", subtask.assignerId || ""); }}
                                              >
                                                {allEmployees.find((e: any) => String(e.id) === String(subtask.assignerId))?.name || <span className="text-slate-400 italic">None</span>}
                                              </span>
                                            )}
                                          </td>
                                        );
                                        case 'taskOwner': return (
                                          <td key="taskOwner" className="px-3 py-0.5 border-r no-navigate" onClick={(e) => e.stopPropagation()}>
                                            {editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "taskOwnerId" ? (
                                              <Select
                                                defaultOpen
                                                onOpenChange={(open) => { if (!open) setEditingSubtaskField(null); }}
                                                value={subtask.taskOwnerId || "__none__"}
                                                onValueChange={(val) => handleInlineSubtaskUpdate(task.id, String(subtask.id), "taskOwnerId", val === "__none__" ? null : val)}
                                              >
                                                <SelectTrigger className="h-6 text-[10px] p-1 w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
                                                <SelectContent className="max-h-[200px]">
                                                  <SelectItem value="__none__" className="text-[10px] text-slate-400 italic">None</SelectItem>
                                                  {allEmployees.map(e => <SelectItem key={e.id} value={e.id} className="text-[10px]">{e.name}</SelectItem>)}
                                                </SelectContent>
                                              </Select>
                                            ) : (
                                              <span
                                                className="cursor-pointer hover:bg-slate-200 text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[90px] inline-block transition-colors"
                                                onClick={(e) => { e.stopPropagation(); startEditingSubtask(String(subtask.id), "taskOwnerId", subtask.taskOwnerId || ""); }}
                                              >
                                                {allEmployees.find((e: any) => String(e.id) === String(subtask.taskOwnerId))?.name || <span className="text-slate-400 italic">None</span>}
                                              </span>
                                            )}
                                          </td>
                                        );
                                        case 'taskName': return (
                                          <Fragment key="taskName">
                                            {/* Subtask Title (Inline editable) & Completion Checkbox */}
                                            <td className="px-3 py-0.5 border-r font-medium overflow-hidden">
                                              <div className="flex items-center gap-2 pl-4">
                                                <button
                                                  onClick={() => toggleSubtaskCompletion(task.id, String(subtask.id), isSubtaskCompleted)}
                                                  className="p-0 hover:scale-110 transition-transform flex-shrink-0"
                                                  title={isSubtaskCompleted ? "Mark pending" : "Mark completed"}
                                                >
                                                  {isSubtaskCompleted ? (
                                                    <CheckCircle2 size={14} className="text-green-500" />
                                                  ) : (
                                                    <Circle size={14} className="text-slate-400 hover:text-blue-500" />
                                                  )}
                                                </button>
                                                {editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "title" ? (
                                                  <Input
                                                    autoFocus
                                                    className="h-6 text-xs p-1 focus:ring-1 focus:ring-blue-500 w-full max-w-[240px]"
                                                    value={tempSubtaskValue}
                                                    onChange={(e) => setTempSubtaskValue(e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') handleInlineSubtaskUpdate(task.id, String(subtask.id), "title", tempSubtaskValue);
                                                      if (e.key === 'Escape') setEditingSubtaskField(null);
                                                    }}
                                                    onBlur={() => handleInlineSubtaskUpdate(task.id, String(subtask.id), "title", tempSubtaskValue)}
                                                  />
                                                ) : (
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <span
                                                        className={cn(
                                                          "truncate cursor-pointer hover:underline",
                                                          isSubtaskCompleted ? "line-through text-slate-400" : "text-slate-700"
                                                        )}
                                                        onClick={(e) => { e.stopPropagation(); startEditingSubtask(String(subtask.id), "title", subtask.title); }}
                                                      >
                                                        {subtask.title}
                                                      </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-sm bg-slate-900 text-white text-[11px] p-2 rounded" side="top">
                                                      <div className="font-semibold text-blue-200 mb-1">{getTaskHierarchy(task)} / {subtask.title}</div>
                                                      <div className="text-slate-200">{subtask.description || "No description"}</div>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                )}
                                                {discussions.some(d => String(d.title).includes(subtask.title)) && (
                                                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] px-1 py-0 font-semibold shrink-0 flex items-center gap-0.5">
                                                    <MessageSquare size={9} />
                                                    {discussions.filter(d => String(d.title).includes(subtask.title)).length}
                                                  </Badge>
                                                )}
                                              </div>
                                            </td>
                                          </Fragment>
                                        );
                                        case 'project': return (
                                          <Fragment key="project">
                                            {/* Inherited Project */}
                                            <td className="px-3 py-0.5 border-r text-slate-400 italic text-[10px] truncate max-w-[140px]">
                                              {taskProject?.title || "—"}
                                            </td>
                                          </Fragment>
                                        );
                                        case 'keyStep': return (
                                          <Fragment key="keyStep">
                                            {/* Milestone / Key Step (inline editable, mirrors task row) */}
                                            <td className="px-3 py-0.5 border-r no-navigate" onClick={(e) => e.stopPropagation()}>
                                              <SubtaskKeyStepBadge taskId={task.id} subtask={subtask} />
                                            </td>
                                          </Fragment>
                                        );
                                        case 'period': return (
                                          <Fragment key="period">
                                            {/* Period (inline editable, mirrors task row) */}
                                            <td className="px-3 py-0.5 border-r no-navigate text-center" onClick={(e) => e.stopPropagation()}>
                                              <SubtaskPeriodBadge taskId={task.id} subtask={subtask} />
                                            </td>
                                          </Fragment>
                                        );
                                        case 'frequency': return (
                                          <Fragment key="frequency">
                                            {/* Frequency (inline editable, mirrors task row) */}
                                            <td className="px-3 py-0.5 border-r no-navigate text-center" onClick={(e) => e.stopPropagation()}>
                                              <SubtaskFrequencyBadge taskId={task.id} subtask={subtask} />
                                            </td>
                                          </Fragment>
                                        );
                                        case 'assignees': return (
                                          <Fragment key="assignees">
                                            {/* Subtask Assignees */}
                                            <td className="px-3 py-0.5 border-r">
                                              {(() => {
                                                return (
                                                  <Popover>
                                                    <PopoverTrigger asChild>
                                                      <div className="flex -space-x-1.5 overflow-hidden hover:space-x-1 transition-all duration-300 cursor-pointer p-0.5">
                                                        {members.length === 0 ? (
                                                          <div className="w-4.5 h-4.5 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-400 transition-colors">
                                                            <Plus size={8} />
                                                          </div>
                                                        ) : (
                                                          members.map((memberId: string, idx: number) => {
                                                            const emp = allEmployees.find((e: any) => String(e.id) === String(memberId));
                                                            const name = emp?.name || memberId;
                                                            const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

                                                            if (idx > 2) return null;
                                                            if (idx === 2 && members.length > 3) {
                                                              return (
                                                                <div key="extra" className="relative inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-slate-200 border border-white text-[7px] font-bold text-slate-655 z-0">
                                                                  +{members.length - 2}
                                                                </div>
                                                              );
                                                            }

                                                            return (
                                                              <div
                                                                key={memberId}
                                                                className="relative inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-slate-400 border border-white text-[7px] font-bold text-white shadow-sm ring-1 ring-slate-900/5 transition-transform hover:z-10 hover:scale-110"
                                                                title={name}
                                                              >
                                                                {initials}
                                                              </div>
                                                            );
                                                          })
                                                        )}
                                                      </div>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-56 p-0 shadow-xl border-slate-200" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                                      <Command>
                                                        <CommandInput placeholder="Search member..." className="h-8 text-xs" />
                                                        <CommandList className="max-h-48 overflow-y-auto">
                                                          <CommandEmpty className="py-2 text-[10px] text-slate-400 text-center">No member found.</CommandEmpty>
                                                          <CommandGroup heading="Subtask Members">
                                                            {allEmployees.map((emp) => {
                                                              const isAssigned = members.some(mId => String(mId) === String(emp.id));
                                                              return (
                                                                <CommandItem
                                                                  key={emp.id}
                                                                  onSelect={async () => {
                                                                    const newAssigned = isAssigned
                                                                      ? members.filter(id => String(id) !== String(emp.id))
                                                                      : [...members, String(emp.id)];

                                                                    // Optimistic update — avoid a full refreshTasks() so
                                                                    // other expanded rows' subtasks don't get wiped out.
                                                                    setTasks(prev => prev.map(t => t.id !== task.id ? t : {
                                                                      ...t,
                                                                      subtasks: (t.subtasks || []).map(s => s.id === subtask.id ? { ...s, assignedTo: newAssigned } : s),
                                                                    }));

                                                                    try {
                                                                      const res = await apiFetch(`/api/subtasks/${subtask.id}`, {
                                                                        method: "PATCH",
                                                                        headers: { "Content-Type": "application/json" },
                                                                        body: JSON.stringify({ assignedTo: newAssigned }),
                                                                      });
                                                                      if (!res.ok) throw new Error("Failed to update subtask assignee");
                                                                    } catch (err) {
                                                                      console.error("Subtask member update failed:", err);
                                                                      toast({ variant: "destructive", title: "Error", description: "Failed to update subtask assignee. Please try again." });
                                                                      refreshTasks();
                                                                    }
                                                                  }}
                                                                  className="text-xs cursor-pointer"
                                                                >
                                                                  <div className={cn(
                                                                    "mr-2 flex h-3 w-3 items-center justify-center rounded-sm border border-primary",
                                                                    isAssigned ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                                                                  )}>
                                                                    <Check className="h-2 w-2" />
                                                                  </div>
                                                                  <span className="flex-1 text-[11px]">{emp.name}</span>
                                                                </CommandItem>
                                                              );
                                                            })}
                                                          </CommandGroup>
                                                        </CommandList>
                                                      </Command>
                                                    </PopoverContent>
                                                  </Popover>
                                                );
                                              })()}
                                            </td>
                                          </Fragment>
                                        );
                                        case 'ccMembers': return (
                                          <Fragment key="ccMembers">
                                            {/* Subtask CC Members */}
                                            <td className="px-3 py-0.5 border-r no-navigate" onClick={(e) => e.stopPropagation()}>
                                              {(() => {
                                                const ccList = Array.isArray(subtask.ccMembers) ? subtask.ccMembers : [];
                                                return (
                                                  <Popover>
                                                    <PopoverTrigger asChild>
                                                      <button className="flex flex-wrap gap-1 max-w-[110px] hover:bg-slate-100 rounded px-0.5 py-0.5 transition-colors">
                                                        {ccList.length === 0 ? (
                                                          <span className="text-[9px] text-slate-350 italic">None</span>
                                                        ) : (
                                                          ccList.slice(0, 2).map((memberId: string) => {
                                                            const emp = allEmployees.find((e: any) => String(e.id) === String(memberId));
                                                            return (
                                                              <span key={memberId} className="text-[8px] bg-slate-100 text-slate-600 px-1 rounded border border-slate-200 truncate max-w-[60px]" title={emp?.name || memberId}>
                                                                {emp?.name || memberId}
                                                              </span>
                                                            );
                                                          })
                                                        )}
                                                        {ccList.length > 2 && (
                                                          <span className="text-[8px] text-slate-400 font-bold">+{ccList.length - 2}</span>
                                                        )}
                                                      </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-56 p-0 shadow-xl border-slate-200" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                                      <Command>
                                                        <CommandInput placeholder="Search member..." className="h-8 text-xs" />
                                                        <CommandList className="max-h-48 overflow-y-auto">
                                                          <CommandEmpty className="py-2 text-[10px] text-slate-400 text-center">No member found.</CommandEmpty>
                                                          <CommandGroup heading="CC Members">
                                                            {allEmployees.map((emp) => {
                                                              const isAssigned = ccList.some((mId: string) => String(mId) === String(emp.id));
                                                              return (
                                                                <CommandItem
                                                                  key={emp.id}
                                                                  onSelect={() => toggleSubtaskCcMember(task.id, String(subtask.id), ccList, String(emp.id))}
                                                                  className="text-xs cursor-pointer"
                                                                >
                                                                  <div className={cn(
                                                                    "mr-2 flex h-3 w-3 items-center justify-center rounded-sm border border-primary",
                                                                    isAssigned ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                                                                  )}>
                                                                    <Check className="h-2 w-2" />
                                                                  </div>
                                                                  <span className="flex-1 text-[11px]">{emp.name}</span>
                                                                </CommandItem>
                                                              );
                                                            })}
                                                          </CommandGroup>
                                                        </CommandList>
                                                      </Command>
                                                    </PopoverContent>
                                                  </Popover>
                                                );
                                              })()}
                                            </td>
                                          </Fragment>
                                        );
                                        case 'tags': return (
                                          <Fragment key="tags">
                                            {/* Tags (inline editable, mirrors task row) */}
                                            <td className="px-3 py-0.5 border-r">
                                              <InlineSubtaskTagCell taskId={task.id} subtask={subtask} allTags={allTags} setAllTags={setAllTags} setTasks={setTasks} />
                                            </td>
                                          </Fragment>
                                        );
                                        case 'startDate': return (
                                          <Fragment key="startDate">
                                            {/* Subtask Start Date */}
                                            <td className="px-2 py-0.5 text-center border-r font-medium text-slate-600">
                                              {editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "startDate" ? (
                                                <Input
                                                  type="date"
                                                  lang="en-GB"
                                                  autoFocus
                                                  className="h-6 text-[10px] p-0.5 w-full bg-transparent border-none text-slate-700 text-center"
                                                  value={tempSubtaskValue}
                                                  onChange={(e) => setTempSubtaskValue(e.target.value)}
                                                  onBlur={async () => {
                                                    const newStartDate = tempSubtaskValue || null;
                                                    const updatedSubtasks = (task.subtasks || []).map(s => {
                                                      if (s.id === subtask.id) {
                                                        const updated = { ...s, startDate: newStartDate };
                                                        if (s.endDate && newStartDate && s.endDate < newStartDate) {
                                                          updated.endDate = newStartDate;
                                                        }
                                                        return updated;
                                                      }
                                                      return s;
                                                    });

                                                    // Recalculate parent task dates
                                                    const validStarts = updatedSubtasks.map(s => s.startDate).filter(Boolean) as string[];
                                                    const validEnds = updatedSubtasks.map(s => s.endDate).filter(Boolean) as string[];

                                                    const newParentStart = validStarts.length > 0 ? validStarts.reduce((min, cur) => cur < min ? cur : min) : null;
                                                    const newParentEnd = validEnds.length > 0 ? validEnds.reduce((max, cur) => cur > max ? cur : max) : null;

                                                    let durationDays = task.durationDays;
                                                    if (newParentStart && newParentEnd) {
                                                      const sD = new Date(newParentStart);
                                                      const eD = new Date(newParentEnd);
                                                      if (!isNaN(sD.getTime()) && !isNaN(eD.getTime())) {
                                                        const diff = Math.round((eD.getTime() - sD.getTime()) / (1000 * 60 * 60 * 24));
                                                        if (diff >= 0) durationDays = diff;
                                                      }
                                                    }

                                                    setTasks(prev => prev.map(t => t.id !== task.id ? t : {
                                                      ...t,
                                                      startDate: newParentStart || undefined,
                                                      endDate: newParentEnd || undefined,
                                                      durationDays,
                                                      subtasks: updatedSubtasks,
                                                    }));
                                                    setEditingSubtaskField(null);

                                                    const body: any = { startDate: newStartDate };
                                                    const targetSub = updatedSubtasks.find(s => s.id === subtask.id);
                                                    if (targetSub && targetSub.endDate !== subtask.endDate) {
                                                      body.endDate = targetSub.endDate;
                                                    }

                                                    try {
                                                      const res = await apiFetch(`/api/subtasks/${subtask.id}`, {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify(body),
                                                      });
                                                      if (!res.ok) throw new Error("Failed to update subtask date");
                                                    } catch (err) {
                                                      console.error(err);
                                                      toast({ variant: "destructive", title: "Error", description: "Failed to update subtask date. Please try again." });
                                                      refreshTasks();
                                                    }
                                                  }}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Escape') setEditingSubtaskField(null);
                                                    if (e.key === 'Enter') e.currentTarget.blur();
                                                  }}
                                                />
                                              ) : (
                                                <span
                                                  className="cursor-pointer hover:bg-slate-100 p-0.5 rounded inline-block w-full text-center text-xs"
                                                  onClick={(e) => { e.stopPropagation(); startEditingSubtask(String(subtask.id), "startDate", subtask.startDate || ""); }}
                                                >
                                                  {formatDate(subtask.startDate) || "—"}
                                                </span>
                                              )}
                                            </td>
                                          </Fragment>
                                        );
                                        case 'endDate': return (
                                          <Fragment key="endDate">
                                            {/* Subtask End Date */}
                                            <td className="px-2 py-0.5 text-center border-r font-medium text-slate-600">
                                              {editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "endDate" ? (
                                                <Input
                                                  type="date"
                                                  lang="en-GB"
                                                  autoFocus
                                                  className="h-6 text-[10px] p-0.5 w-full bg-transparent border-none text-slate-700 text-center"
                                                  value={tempSubtaskValue}
                                                  min={subtask.startDate || undefined}
                                                  onChange={(e) => setTempSubtaskValue(e.target.value)}
                                                  onBlur={async () => {
                                                    const newEndDate = subtask.startDate && tempSubtaskValue && tempSubtaskValue < subtask.startDate
                                                      ? subtask.startDate
                                                      : (tempSubtaskValue || null);

                                                    const updatedSubtasks = (task.subtasks || []).map(s => s.id === subtask.id ? { ...s, endDate: newEndDate } : s);

                                                    // Recalculate parent task dates
                                                    const validStarts = updatedSubtasks.map(s => s.startDate).filter(Boolean) as string[];
                                                    const validEnds = updatedSubtasks.map(s => s.endDate).filter(Boolean) as string[];

                                                    const newParentStart = validStarts.length > 0 ? validStarts.reduce((min, cur) => cur < min ? cur : min) : null;
                                                    const newParentEnd = validEnds.length > 0 ? validEnds.reduce((max, cur) => cur > max ? cur : max) : null;

                                                    let durationDays = task.durationDays;
                                                    if (newParentStart && newParentEnd) {
                                                      const sD = new Date(newParentStart);
                                                      const eD = new Date(newParentEnd);
                                                      if (!isNaN(sD.getTime()) && !isNaN(eD.getTime())) {
                                                        const diff = Math.round((eD.getTime() - sD.getTime()) / (1000 * 60 * 60 * 24));
                                                        if (diff >= 0) durationDays = diff;
                                                      }
                                                    }

                                                    setTasks(prev => prev.map(t => t.id !== task.id ? t : {
                                                      ...t,
                                                      startDate: newParentStart || undefined,
                                                      endDate: newParentEnd || undefined,
                                                      durationDays,
                                                      subtasks: updatedSubtasks,
                                                    }));
                                                    setEditingSubtaskField(null);

                                                    try {
                                                      const res = await apiFetch(`/api/subtasks/${subtask.id}`, {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ endDate: newEndDate }),
                                                      });
                                                      if (!res.ok) throw new Error("Failed to update subtask date");
                                                    } catch (err) {
                                                      console.error(err);
                                                      toast({ variant: "destructive", title: "Error", description: "Failed to update subtask date. Please try again." });
                                                      refreshTasks();
                                                    }
                                                  }}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Escape') setEditingSubtaskField(null);
                                                    if (e.key === 'Enter') e.currentTarget.blur();
                                                  }}
                                                />
                                              ) : (
                                                <span
                                                  className="cursor-pointer hover:bg-slate-100 p-0.5 rounded inline-block w-full text-center text-xs"
                                                  onClick={(e) => { e.stopPropagation(); startEditingSubtask(String(subtask.id), "endDate", subtask.endDate || ""); }}
                                                >
                                                  {formatDate(subtask.endDate) || "—"}
                                                </span>
                                              )}
                                            </td>
                                          </Fragment>
                                        );
                                        case 'priority': return (
                                          <Fragment key="priority">
                                            {/* Subtask Priority Badge */}
                                            <td className="px-3 py-0.5 border-r text-center no-navigate" onClick={(e) => e.stopPropagation()}>
                                              <Popover open={editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "priority"}
                                                onOpenChange={(open) => open ? startEditingSubtask(String(subtask.id), "priority", subtask.priority || "medium") : setEditingSubtaskField(null)}>
                                                <PopoverTrigger asChild>
                                                  <button className="cursor-pointer hover:opacity-80 transition-opacity">
                                                    <Badge
                                                      variant="outline"
                                                      className={cn(
                                                        "text-[9px] font-bold px-1.5 py-0 rounded-full inline-flex justify-center min-w-[55px] border capitalize whitespace-nowrap",
                                                        subtask.priority === "high"
                                                          ? "bg-rose-50 text-rose-700 border-rose-200"
                                                          : subtask.priority === "low"
                                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                            : "bg-amber-50 text-amber-700 border-amber-200"
                                                      )}
                                                    >
                                                      {subtask.priority || "medium"}
                                                    </Badge>
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="p-0 w-28" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                                                  <Command>
                                                    <CommandList>
                                                      <CommandGroup>
                                                        {["low", "medium", "high"].map((p) => (
                                                          <CommandItem
                                                            key={p}
                                                            onSelect={() => handleInlineSubtaskUpdate(task.id, String(subtask.id), "priority", p)}
                                                            className="capitalize text-xs cursor-pointer"
                                                          >
                                                            <Check className={cn("mr-2 h-3 w-3", (subtask.priority || "medium") === p ? "opacity-100" : "opacity-0")} />
                                                            {p}
                                                          </CommandItem>
                                                        ))}
                                                      </CommandGroup>
                                                    </CommandList>
                                                  </Command>
                                                </PopoverContent>
                                              </Popover>
                                            </td>
                                          </Fragment>
                                        );
                                        case 'status': return (
                                          <Fragment key="status">
                                            {/* Subtask Status Badge */}
                                            <td className="px-3 py-0.5 border-r text-center no-navigate" onClick={(e) => e.stopPropagation()}>
                                              <Popover open={editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "status"}
                                                onOpenChange={(open) => open ? startEditingSubtask(String(subtask.id), "status", subtask.status || (isSubtaskCompleted ? "Completed" : "Not Started")) : setEditingSubtaskField(null)}>
                                                <PopoverTrigger asChild>
                                                  <button
                                                    className={cn(
                                                      "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap border cursor-pointer hover:opacity-80 transition-all",
                                                      getStatusStyle(subtask.status || (isSubtaskCompleted ? "Completed" : "Not Started"))
                                                    )}
                                                  >
                                                    {subtask.status || (isSubtaskCompleted ? "Completed" : "Not Started")}
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="p-0 w-36" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                                                  <Command>
                                                    <CommandList>
                                                      <CommandGroup>
                                                        {["Not Started", "Planned", "In Progress", "On Hold", "Completed", "Cancelled"].map((s) => (
                                                          <CommandItem
                                                            key={s}
                                                            onSelect={() => handleInlineSubtaskUpdate(task.id, String(subtask.id), "status", s)}
                                                            className="text-xs cursor-pointer"
                                                          >
                                                            <Check className={cn("mr-2 h-3 w-3", (subtask.status || (isSubtaskCompleted ? "Completed" : "Not Started")) === s ? "opacity-100" : "opacity-0")} />
                                                            {s}
                                                          </CommandItem>
                                                        ))}
                                                      </CommandGroup>
                                                    </CommandList>
                                                  </Command>
                                                </PopoverContent>
                                              </Popover>
                                            </td>
                                          </Fragment>
                                        );
                                        case 'progress': return (
                                          <Fragment key="progress">
                                            {/* Subtask Progress bar */}
                                            <td className="px-3 py-0.5 border-r text-center">
                                              <div className="flex items-center gap-1 w-full justify-center">
                                                <Progress value={isSubtaskCompleted ? 100 : (subtask.progress || 0)} className="h-1 bg-slate-100 flex-1" />
                                                <span className="text-[9px] font-bold text-slate-500 w-6 shrink-0 text-right">
                                                  {isSubtaskCompleted ? 100 : (subtask.progress || 0)}%
                                                </span>
                                              </div>
                                            </td>
                                          </Fragment>
                                        );
                                        case 'completionDate': return (
                                          <Fragment key="completionDate">
                                            {/* Completion Date (inline editable, mirrors task row) */}
                                            <td className="px-2 py-0.5 text-center border-r font-medium text-slate-700" onClick={(e) => e.stopPropagation()}>
                                              {editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "completionDate" ? (
                                                <div className="flex items-center gap-1 justify-center">
                                                  <Input
                                                    type="date"
                                                    lang="en-GB"
                                                    autoFocus
                                                    className="h-6 text-[10px] p-0.5"
                                                    value={tempSubtaskValue}
                                                    onChange={(e) => setTempSubtaskValue(e.target.value)}
                                                    onBlur={() => handleInlineSubtaskUpdate(task.id, String(subtask.id), "completionDate", tempSubtaskValue)}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') handleInlineSubtaskUpdate(task.id, String(subtask.id), "completionDate", tempSubtaskValue);
                                                      if (e.key === 'Escape') setEditingSubtaskField(null);
                                                    }}
                                                  />
                                                  {tempSubtaskValue && (
                                                    <button
                                                      type="button"
                                                      title="Clear date"
                                                      className="text-slate-400 hover:text-red-500 shrink-0"
                                                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setTempSubtaskValue(""); handleInlineSubtaskUpdate(task.id, String(subtask.id), "completionDate", ""); }}
                                                    >
                                                      <X size={10} />
                                                    </button>
                                                  )}
                                                </div>
                                              ) : (
                                                <span
                                                  className="cursor-pointer hover:bg-slate-100 p-0.5 rounded inline-flex items-center gap-1 group/date text-[10px]"
                                                  onClick={(e) => { e.stopPropagation(); startEditingSubtask(String(subtask.id), "completionDate", subtask.completionDate || ""); }}
                                                >
                                                  {formatDate(subtask.completionDate) || "—"}
                                                  {subtask.completionDate && (
                                                    <X
                                                      size={9}
                                                      className="text-slate-400 hover:text-red-500 opacity-0 group-hover/date:opacity-100 transition-opacity shrink-0"
                                                      onClick={(e) => { e.stopPropagation(); handleInlineSubtaskUpdate(task.id, String(subtask.id), "completionDate", ""); }}
                                                    />
                                                  )}
                                                </span>
                                              )}
                                            </td>
                                          </Fragment>
                                        );
                                        case 'durationDays': return (
                                          <Fragment key="durationDays">
                                            {/* Duration (Number of Days) — inline editable, mirrors task row */}
                                            <td className="px-2 py-0.5 text-center border-r font-medium text-slate-700" onClick={(e) => e.stopPropagation()}>
                                              {editingSubtaskField?.subtaskId === subtask.id && editingSubtaskField?.field === "durationDays" ? (
                                                <Input
                                                  type="number"
                                                  min={0}
                                                  autoFocus
                                                  className="h-6 text-[10px] p-0.5 text-center w-14 mx-auto"
                                                  value={tempSubtaskValue}
                                                  onChange={(e) => setTempSubtaskValue(e.target.value)}
                                                  onBlur={() => handleInlineSubtaskUpdate(task.id, String(subtask.id), "durationDays", tempSubtaskValue === "" ? null : Number(tempSubtaskValue))}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleInlineSubtaskUpdate(task.id, String(subtask.id), "durationDays", tempSubtaskValue === "" ? null : Number(tempSubtaskValue));
                                                    if (e.key === 'Escape') setEditingSubtaskField(null);
                                                  }}
                                                  title={!subtask.startDate ? "Set a Start Date first so the End Date can be calculated" : undefined}
                                                />
                                              ) : (
                                                <span
                                                  className="cursor-pointer hover:bg-slate-100 p-0.5 rounded inline-flex items-center gap-1 text-[10px]"
                                                  onClick={(e) => { e.stopPropagation(); startEditingSubtask(String(subtask.id), "durationDays", typeof subtask.durationDays === 'number' ? String(subtask.durationDays) : ""); }}
                                                  title={!subtask.startDate ? "Set a Start Date first so the End Date can be calculated" : "Days from Start Date — End Date auto-updates"}
                                                >
                                                  {typeof subtask.durationDays === 'number' ? `${subtask.durationDays}d` : "—"}
                                                </span>
                                              )}
                                            </td>
                                          </Fragment>
                                        );
                                        case 'remarks': return (
                                          <Fragment key="remarks">
                                            {/* Delayed By (dashed) */}
                                            <td className="px-3 py-0.5 border-r text-slate-400 text-center">—</td>
                                          </Fragment>
                                        );
                                        case 'flags': return (
                                          <Fragment key="flags">
                                            {/* Subtask Flags Column (distinct amber/pink styling from task flags) */}
                                            <td className="px-3 py-0.5 border-r text-center no-navigate" onClick={(e) => e.stopPropagation()}>
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="flex items-center justify-center gap-1 w-full hover:bg-slate-50 py-0.5 rounded transition-colors cursor-pointer min-h-[20px]">
                                                    {subtask.isAddon && (
                                                      <span className="text-[8px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-200 border-dashed px-1 rounded">Addon</span>
                                                    )}
                                                    {subtask.isIssue && (
                                                      <span className="text-[8px] font-bold uppercase bg-pink-100 text-pink-700 border border-pink-200 border-dashed px-1 rounded flex items-center gap-0.5">
                                                        <AlertTriangle size={7} /> Issue
                                                      </span>
                                                    )}
                                                    {!subtask.isAddon && !subtask.isIssue && <span className="text-slate-300 text-[9px]">—</span>}
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-48 p-0" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                                                  <Command>
                                                    <CommandList>
                                                      <CommandGroup>
                                                        <CommandItem onSelect={() => toggleSubtaskFlag(task.id, String(subtask.id), 'isAddon', !subtask.isAddon)} className="cursor-pointer">
                                                          <Check className={cn("mr-2 h-4 w-4", subtask.isAddon ? "opacity-100" : "opacity-0")} />
                                                          <span className="text-amber-700 font-semibold">Mark as Add-on</span>
                                                        </CommandItem>
                                                        <CommandItem onSelect={() => toggleSubtaskFlag(task.id, String(subtask.id), 'isIssue', !subtask.isIssue)} className="cursor-pointer">
                                                          <Check className={cn("mr-2 h-4 w-4", subtask.isIssue ? "opacity-100" : "opacity-0")} />
                                                          <span className="text-pink-700 font-semibold flex items-center gap-1"><AlertTriangle size={12} /> Mark as Issue</span>
                                                        </CommandItem>
                                                      </CommandGroup>
                                                    </CommandList>
                                                  </Command>
                                                </PopoverContent>
                                              </Popover>
                                            </td>
                                          </Fragment>
                                        );
                                        default: return null;
                                      }
                                    })}
                                    {/* Subtask actions (delete/clone) */}
                                    <td className="w-[210px] min-w-[210px] max-w-[210px] px-2 py-0.5 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-5 w-5 text-green-600 hover:text-green-755"
                                          onClick={() => {
                                            setCloneSubtaskData({ id: subtask.id!, title: subtask.title });
                                            setCloneSubtaskNewTitle(`${subtask.title} (Copy)`);
                                            setCloneSubtaskOpen(true);
                                          }}
                                          title="Clone Subtask"
                                        >
                                          <Copy size={10} />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-5 w-5 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                          onClick={() => {
                                            const proj = projects.find(p => String(p.id) === String(task.projectId));
                                            const projectTitle = proj?.title || "";
                                            const keyStep = keySteps.find(k => String(k.id) === String(task.keyStepId));
                                            const keyStepTitle = keyStep?.title || "";
                                            const params = new URLSearchParams();
                                            if (task.projectId) params.set("projectId", String(task.projectId));
                                            if (projectTitle) params.set("projectTitle", String(projectTitle));
                                            if (task.keyStepId) params.set("keyStepId", String(task.keyStepId));
                                            if (keyStepTitle) params.set("keyStepTitle", String(keyStepTitle));
                                            if (task.id) params.set("taskId", String(task.id));
                                            if (task.taskName) params.set("taskName", String(task.taskName));
                                            if (subtask.id) params.set("subtaskId", String(subtask.id));
                                            if (subtask.title) params.set("subtaskName", String(subtask.title));
                                            navigate(`/discussion?${params.toString()}`);
                                          }}
                                          title="Discuss Subtask"
                                        >
                                          <MessageSquare size={10} />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}

                              {/* 3. INLINE FAST SUBTASK CREATION ROW (shown for expanded task) */}
                              <tr className="bg-blue-50/10 border-b border-slate-100 text-[11px] h-8">
                                {/* serial placeholder */}
                                <td className="px-2 py-0.5 border-r" />
                                {/* drag placeholder */}
                                <td className="px-2 py-0.5 text-center border-r" />
                                <td className="px-2 py-0.5 text-center border-r font-mono text-slate-400 select-none text-[10px]">
                                  └─+
                                </td>
                                <td className="px-2 py-0.5 border-r" />

                                {columnsConfig.filter(c => c.visible).map(col => {
                                  switch (col.id) {
                                    case 'serial': return null;
                                    case 'taskName': return (
                                      <td key="taskName" className="px-3 py-0.5 border-r" colSpan={3}>
                                        <div className="flex items-center pl-4 w-full">
                                          <Input
                                            placeholder="Add subtask title... Press Enter to create"
                                            className="h-6 text-xs bg-slate-55/50 border-dashed border-slate-200 focus:bg-white focus:border-blue-500 w-full max-w-[500px]"
                                            value={subtaskForms[task.id]?.title || ""}
                                            onChange={(e) => updateSubtaskForm(task.id, "title", e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addInlineSubtask(task.id);
                                              }
                                            }}
                                          />
                                        </div>
                                      </td>
                                    );
                                    case 'project': return null;
                                    case 'keyStep': return null;
                                    case 'period': return <td key="period" className="px-3 py-0.5 border-r" />;
                                    case 'frequency': return <td key="frequency" className="px-3 py-0.5 border-r" />;
                                    case 'assignedBy': return <td key="assignedBy" className="px-3 py-0.5 border-r" />;
                                    case 'taskOwner': return <td key="taskOwner" className="px-3 py-0.5 border-r" />;
                                    case 'assignees': return <td key="assignees" className="px-3 py-0.5 border-r" />;
                                    case 'ccMembers': return <td key="ccMembers" className="px-3 py-0.5 border-r" />;
                                    case 'tags': return <td key="tags" className="px-3 py-0.5 border-r" />;
                                    case 'startDate': return <td key="startDate" className="px-2 py-0.5 border-r" />;
                                    case 'endDate': return <td key="endDate" className="px-2 py-0.5 border-r" />;
                                    case 'completionDate': return <td key="completionDate" className="px-2 py-0.5 border-r" />;
                                    case 'durationDays': return <td key="durationDays" className="px-2 py-0.5 border-r" />;
                                    case 'priority': return <td key="priority" className="px-3 py-0.5 border-r" />;
                                    case 'status': return <td key="status" className="px-3 py-0.5 border-r" />;
                                    case 'progress': return <td key="progress" className="px-3 py-0.5 border-r" />;
                                    case 'remarks': return <td key="remarks" className="px-3 py-0.5 border-r" />;
                                    case 'flags': return <td key="flags" className="px-3 py-0.5 border-r" />;
                                    default: return null;
                                  }
                                })}
                                <td className="w-[210px] min-w-[210px] max-w-[210px] px-2 py-0.5 text-center">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => addInlineSubtask(task.id)}
                                    className="h-5 px-1.5 text-[9px] text-blue-600 hover:bg-blue-50 font-bold"
                                  >
                                    Add
                                  </Button>
                                </td>
                              </tr>
                            </>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION — keeps only ~100 task rows mounted at a time so the
          page stays responsive even with hundreds/thousands of tasks. */}
      {hasRequiredFilter && filteredTasks.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-slate-200 bg-white text-xs text-slate-500">
          <span>
            Showing {((safeCurrentTasksPage - 1) * TASKS_PAGE_SIZE) + 1}
            {"–"}
            {Math.min(safeCurrentTasksPage * TASKS_PAGE_SIZE, filteredTasks.length)} of {filteredTasks.length} tasks
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safeCurrentTasksPage <= 1}
              onClick={() => setCurrentTasksPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="font-medium text-slate-600">
              Page {safeCurrentTasksPage} of {totalTasksPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safeCurrentTasksPage >= totalTasksPages}
              onClick={() => setCurrentTasksPage((p) => Math.min(totalTasksPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}


      <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Delete <span className="font-bold">{taskToDelete?.taskName}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MOVE TO COMPLETED DIALOG */}
      <Dialog open={openMoveDialog} onOpenChange={setOpenMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Completed</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Move <span className="font-bold">{taskToMove?.taskName}</span> to the Completed page? It will no longer appear on this Tasks page (you can still find it, with its completion date, on the Completed page).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenMoveDialog(false); setTaskToMove(null); }}>
              Cancel
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={confirmMoveToCompleted}>
              Move to Completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BULK DELETE CONFIRM DIALOG */}
      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedTaskIds.length} Tasks?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Are you sure you want to delete the selected {selectedTaskIds.length} tasks? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELAY REASON DIALOG */}
      <Dialog open={delayReasonOpen} onOpenChange={setDelayReasonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              âš ï¸ Sir is noticing!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm font-medium text-slate-700">
              This task is overdue. Please provide a reason for the delay:
            </p>
            <div className="bg-slate-50 p-3 rounded border border-slate-100 mb-2">
              <p className="text-sm font-semibold">{delayReasonTask?.taskName}</p>
              <p className="text-xs text-slate-500">Due: {delayReasonTask?.endDate ? formatDate(delayReasonTask.endDate) : 'None'}</p>
            </div>

            <div className="space-y-2">
              <Label>Reason for Delay <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Explain why this task is delayed..."
                className="min-h-[100px]"
                value={delayReasonText}
                onChange={(e) => setDelayReasonText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelayReasonOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitDelayReason} disabled={!delayReasonText.trim() || delayReasonSaving} className="bg-amber-600 hover:bg-amber-700">
              {delayReasonSaving ? "Submitting..." : "Submit Reason"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QUICK ADD TASK DIALOG */}
      <Dialog open={quickAddTaskOpen} onOpenChange={setQuickAddTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Add Task</DialogTitle>
            <DialogDescription>Add a new task quickly to your project.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {(!projectId || projectId === "all") && (
              <div>
                <label className="text-sm font-medium">Project *</label>
                <Select value={quickAddTaskProjectId} onValueChange={setQuickAddTaskProjectId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px] overflow-y-auto">
                    {projects.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Task Name *</label>
              <Input
                placeholder="Enter task name..."
                value={quickTaskName}
                onChange={(e) => setQuickTaskName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuickAddTask()}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                lang="en-GB"
                value={quickAddTaskStartDate}
                onChange={(e) => setQuickAddTaskStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            {(() => {
              const resolvedProjectId = quickAddTaskProjectId || (projectId && projectId !== "all" ? projectId : "");
              const availableKeySteps = resolvedProjectId
                ? keySteps.filter((k: any) => String(k.projectId) === String(resolvedProjectId))
                : [];
              if (!resolvedProjectId) return null;
              return (
                <div>
                  <label className="text-sm font-medium">Key Step</label>
                  <Select value={quickAddTaskKeyStepId} onValueChange={setQuickAddTaskKeyStepId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="No Key Step" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px] overflow-y-auto">
                      {availableKeySteps.map((k: any) => (
                        <SelectItem key={k.id} value={String(k.id)}>{k.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableKeySteps.length === 0 && (
                    <p className="text-xs text-slate-400 mt-1">No key steps for this project yet.</p>
                  )}
                </div>
              );
            })()}
            <p className="text-xs text-slate-500">
              Description can be added later by editing the task.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAddTaskOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuickAddTask}>Create Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QUICK ADD SUBTASK DIALOG */}
      <Dialog open={quickAddSubtaskOpen} onOpenChange={setQuickAddSubtaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Add Subtask</DialogTitle>
            <DialogDescription>Add a subtask to an existing task.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Subtask Title *</label>
              <Input
                placeholder="Enter subtask title..."
                value={quickSubtaskTitle}
                onChange={(e) => setQuickSubtaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuickAddSubtask()}
              />
            </div>
            <p className="text-xs text-slate-500">
              Description can be added later by editing the subtask.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAddSubtaskOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuickAddSubtask}>Create Subtask</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLONE TASK DIALOG */}
      <Dialog open={cloneTaskOpen} onOpenChange={setCloneTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Task</DialogTitle>
            <DialogDescription>Create a copy of this task with the same configuration.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Cloning: <span className="font-bold">{cloneTaskData?.name}</span>
            </div>

            <div>
              <label className="text-sm font-medium">New Task Name</label>
              <Input
                placeholder="Enter new task name..."
                value={cloneTaskNewName}
                onChange={(e) => setCloneTaskNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCloneTask()}
              />
            </div>

            <p className="text-xs text-slate-500">
              All subtasks and team members will be cloned.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneTaskOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCloneTask}>Clone Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* CLONE SUBTASK DIALOG */}
      < Dialog open={cloneSubtaskOpen} onOpenChange={setCloneSubtaskOpen} >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Subtask</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Cloning: <span className="font-bold">{cloneSubtaskData?.title}</span>
            </div>

            <div>
              <label className="text-sm font-medium">New Subtask Title</label>
              <Input
                placeholder="Enter new task title..."
                value={cloneSubtaskNewTitle}
                onChange={(e) => setCloneSubtaskNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCloneSubtask()}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneSubtaskOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCloneSubtask}>Clone Subtask</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* Dependency Dialog */}
      <GanttDependencyDialog
        open={depDialogOpen}
        onOpenChange={setDepDialogOpen}
        projectId={(projectId && projectId !== "all") ? projectId : (isFrozen && frozenProjectId ? String(frozenProjectId) : projectId)}
        projectTitle={
          projects.find((p) => p.id === ((projectId && projectId !== "all") ? projectId : String(frozenProjectId)))?.title
          || (isFrozen ? frozenProject?.name : undefined)
        }
        tasks={tasks}
        employees={allEmployees}
        keySteps={keySteps}
        onDependencyChange={refreshTasks}
      />
      {ReasonDialog}
      <Dialog open={!!pendingFlagTask} onOpenChange={(open) => {
        if (!open) {
          setPendingFlagTask(null);
          setSelectedParentTaskId("");
          setParentTaskPopoverOpen(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Parent Task</DialogTitle>
            <DialogDescription>
              Choose a task under which this {pendingFlagTask?.flag === 'isIssue' ? 'issue' : 'add on'} will be associated.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Popover open={parentTaskPopoverOpen} onOpenChange={setParentTaskPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={parentTaskPopoverOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedParentTaskId
                    ? tasks.find(t => t.id === selectedParentTaskId)?.taskName
                    : "Select a task..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                <Command>
                  <CommandInput placeholder="Search task..." className="h-8 text-xs" />
                  <CommandList className="max-h-48 overflow-y-auto">
                    <CommandEmpty className="p-2 text-xs text-slate-400 text-center">No tasks found.</CommandEmpty>
                    <CommandGroup>
                      {tasks.filter(t => t.projectId === pendingFlagTask?.projectId && t.id !== pendingFlagTask?.id).map(t => (
                        <CommandItem
                          key={t.id}
                          value={t.taskName}
                          onSelect={() => {
                            setSelectedParentTaskId(t.id);
                            setParentTaskPopoverOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedParentTaskId === t.id ? "opacity-100" : "opacity-0")} />
                          {t.taskName}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPendingFlagTask(null);
              setSelectedParentTaskId("");
              setParentTaskPopoverOpen(false);
            }}>Cancel</Button>
            <Button onClick={async () => {
              if (pendingFlagTask && selectedParentTaskId) {
                const taskId = pendingFlagTask.id;
                const flag = pendingFlagTask.flag;
                // Close dialog immediately
                setPendingFlagTask(null);
                setSelectedParentTaskId("");
                setParentTaskPopoverOpen(false);
                // Optimistic update: set both fields at once
                setTasks(prev => prev.map(t => t.id === taskId ? {
                  ...t,
                  [flag]: true,
                  parentTaskId: selectedParentTaskId,
                } : t));
                // Send both updates to the server sequentially
                await handleInlineTaskUpdate(taskId, flag, true);
                await handleInlineTaskUpdate(taskId, 'parentTaskId', selectedParentTaskId);
              }
            }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}