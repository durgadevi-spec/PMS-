import { useState, useEffect } from "react";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface KeyStepData {
  id?: string;
  projectId: string;
  title: string;
  status: "pending" | "in-progress" | "completed" | "not started" | "cancelled";
  startDate: string;
  endDate: string;
  description?: string | null;
  header?: string | null;
  progress?: number;
}

interface KeyStepSlideDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingStep: KeyStepData | null;
  projects: any[];
  defaultProjectId: string;
  onSave: (stepData: {
    title: string;
    header: string;
    projectId: string;
    status: KeyStepData["status"];
    startDate: string;
    endDate: string;
    progress: number;
    description: string;
  }) => Promise<void>;
  isSaving: boolean;
}

const isoDateOnly = (d: Date) => d.toISOString().split("T")[0];

export function KeyStepSlideDrawer({
  open,
  onOpenChange,
  editingStep,
  projects,
  defaultProjectId,
  onSave,
  isSaving,
}: KeyStepSlideDrawerProps) {
  // Local form state isolated to this component so parent table never re-renders while typing
  const [form, setForm] = useState({
    title: "",
    header: "",
    projectId: defaultProjectId,
    status: "pending" as KeyStepData["status"],
    startDate: isoDateOnly(new Date()),
    endDate: isoDateOnly(new Date()),
    progress: 0,
    description: "",
  });

  useEffect(() => {
    if (editingStep) {
      setForm({
        title: editingStep.title || "",
        header: editingStep.header || "",
        projectId: String(editingStep.projectId),
        status: editingStep.status || "pending",
        startDate: editingStep.startDate || isoDateOnly(new Date()),
        endDate: editingStep.endDate || isoDateOnly(new Date()),
        progress: editingStep.progress || 0,
        description: editingStep.description || "",
      });
    } else {
      setForm({
        title: "",
        header: "",
        projectId: defaultProjectId && defaultProjectId !== "all" ? defaultProjectId : (projects[0]?.id ? String(projects[0].id) : ""),
        status: "pending",
        startDate: isoDateOnly(new Date()),
        endDate: isoDateOnly(new Date()),
        progress: 0,
        description: "",
      });
    }
  }, [editingStep, defaultProjectId, open, projects]);

  const handleSubmit = async () => {
    await onSave(form);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        overlayClassName="bg-black/40 backdrop-blur-[1px]"
        className="w-full sm:max-w-[480px] p-0 flex flex-col h-full bg-gradient-to-b from-[#F5F1FE] via-[#FAF7FE] to-[#F3EEFE] dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden font-sans z-[100]"
      >
        {/* Header & Top Floating Doodles (Seamless single card matching Image 2 reference) */}
        <div className="relative z-10 px-6 pt-6 pb-2 flex-shrink-0">
          {/* Top Right Floating Vector Doodles matching Image 2 */}
          <svg
            className="absolute right-12 top-4 w-44 h-16 pointer-events-none select-none"
            viewBox="0 0 180 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Document / Clipboard */}
            <g opacity="0.75" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="20" y="8" width="18" height="24" rx="3" />
              <line x1="24" y1="15" x2="33" y2="15" />
              <line x1="24" y1="19" x2="33" y2="19" />
              <line x1="24" y1="23" x2="30" y2="23" />
            </g>
            {/* Mail / Envelope */}
            <g opacity="0.7" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="62" y="16" width="22" height="15" rx="2.5" />
              <path d="M 62 18 L 73 25 L 84 18" />
            </g>
            {/* Check Circle */}
            <g opacity="0.75" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="114" cy="24" r="9" />
              <path d="M 110 24 L 113 27 L 118 21" />
            </g>
            {/* Capsule / Pill */}
            <rect x="138" y="10" width="18" height="8" rx="4" transform="rotate(-35 147 14)" opacity="0.65" stroke="#A78BFA" strokeWidth="1.5" />
            {/* Micro Sparkles */}
            <circle cx="10" cy="28" r="2" opacity="0.6" stroke="#C4B5FD" strokeWidth="1" />
            <circle cx="52" cy="10" r="1.5" opacity="0.7" fill="#A78BFA" />
            <circle cx="100" cy="8" r="2" opacity="0.5" stroke="#C4B5FD" strokeWidth="1" />
          </svg>

          {/* Header Title & Icon */}
          <div className="flex items-center gap-3 pr-14">
            <div className="h-10 w-10 rounded-xl bg-[#EEF0FF] dark:bg-indigo-950/60 border border-[#E0E2FE] dark:border-indigo-800/40 flex items-center justify-center text-[#5D5FEF] shadow-2xs flex-shrink-0">
              <Plus className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <SheetTitle className="text-lg font-bold font-display text-slate-900 dark:text-slate-100 tracking-tight">
                {editingStep ? "Edit Key Step" : "Create New Key Step"}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {editingStep ? "Update the details and schedule for this phase." : "Add a new key step and define its phase details."}
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Form Body - Scrollable */}
        <div className="relative z-10 flex-1 overflow-y-auto px-6 py-2 space-y-4">
          {/* Project Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Project <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.projectId}
              onValueChange={(val) => setForm((prev) => ({ ...prev, projectId: val }))}
            >
              <SelectTrigger className="h-9 text-xs rounded-xl border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent className="max-h-[250px] rounded-xl z-[110]">
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-xs">
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step Title */}
          <div className="space-y-1.5">
            <Label htmlFor="stepTitle" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Step Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="stepTitle"
              placeholder="e.g., Initial Design Review"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="h-9 text-xs rounded-xl border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs focus-visible:ring-[#5D5FEF]"
            />
          </div>

          {/* Status Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Status
            </Label>
            <Select
              value={form.status}
              onValueChange={(val: any) => setForm((prev) => ({ ...prev, status: val }))}
            >
              <SelectTrigger className="h-9 text-xs rounded-xl border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl z-[110]">
                <SelectItem value="pending">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Pending</span>
                  </div>
                </SelectItem>
                <SelectItem value="in-progress">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    <span>In Progress</span>
                  </div>
                </SelectItem>
                <SelectItem value="completed">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Completed</span>
                  </div>
                </SelectItem>
                <SelectItem value="not started">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    <span>Not Started</span>
                  </div>
                </SelectItem>
                <SelectItem value="cancelled">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span>Cancelled</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Timeline: Start Date & End Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stepStartDate" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Start Date
              </Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  id="stepStartDate"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      startDate: newStart,
                      endDate: prev.endDate && newStart && prev.endDate < newStart ? newStart : prev.endDate,
                    }));
                  }}
                  className="pl-8 h-9 text-xs rounded-xl border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stepEndDate" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                End Date
              </Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  id="stepEndDate"
                  type="date"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="pl-8 h-9 text-xs rounded-xl border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="stepDesc" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Description <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="stepDesc"
              placeholder="Describe this key step goals and deliverables..."
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="min-h-[85px] text-xs rounded-xl border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs resize-none focus-visible:ring-[#5D5FEF]"
            />
          </div>

          {/* Bottom Floating Vector Doodles matching Image 2 */}
          <div className="pt-2 pb-1">
            <svg
              className="w-full h-16 pointer-events-none select-none"
              viewBox="0 0 420 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Target Bullseye */}
              <g opacity="0.7" stroke="#A78BFA" strokeWidth="1.5">
                <circle cx="38" cy="32" r="13" />
                <circle cx="38" cy="32" r="6" />
                <circle cx="38" cy="32" r="1.5" fill="#A78BFA" />
              </g>

              {/* Rocket */}
              <g transform="translate(130, 32) rotate(40)" opacity="0.7" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 0 -13 C 4.5 -9 6 -2 6 5 L -6 5 C -6 -2 -4.5 -9 0 -13 Z" />
                <circle cx="0" cy="-2" r="2" />
                <path d="M -6 1 L -10 6 L -6 7 Z" />
                <path d="M 6 1 L 10 6 L 6 7 Z" />
              </g>

              {/* Folder */}
              <g opacity="0.65" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 215 22 L 225 22 L 227.5 25.5 L 241 25.5 A 2 2 0 0 1 243 27.5 L 243 42 A 2 2 0 0 1 241 44 L 215 44 A 2 2 0 0 1 213 42 L 213 24 A 2 2 0 0 1 215 22 Z" />
              </g>

              {/* Clock / Timer */}
              <g opacity="0.65" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="305" cy="32" r="11" />
                <path d="M 305 26 L 305 32 L 309 35" />
              </g>

              {/* Check Circle */}
              <g opacity="0.7" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="385" cy="32" r="10" />
                <path d="M 381 32 L 384 35 L 389 29" />
              </g>

              {/* Micro Sparkles */}
              <circle cx="80" cy="18" r="2" opacity="0.5" stroke="#C4B5FD" strokeWidth="1" />
              <circle cx="170" cy="42" r="2.5" opacity="0.6" fill="#A78BFA" />
              <circle cx="265" cy="16" r="2" opacity="0.5" stroke="#C4B5FD" strokeWidth="1" />
              <circle cx="348" cy="42" r="2" opacity="0.6" fill="#A78BFA" />
            </svg>
          </div>
        </div>

        {/* Drawer Actions Footer - Seamless Single Card */}
        <div className="relative z-10 px-6 py-4 flex items-center justify-end gap-3 flex-shrink-0 bg-transparent">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-10 px-5 text-xs font-semibold rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={isSaving}
            onClick={handleSubmit}
            className="bg-[#5D5FEF] hover:bg-[#4E50E6] text-white font-semibold h-10 px-6 text-xs rounded-xl shadow-md shadow-[#5D5FEF]/25 active:scale-95 transition-all cursor-pointer"
          >
            {isSaving ? "Saving..." : editingStep ? "Update Step" : "+ Create Step"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
