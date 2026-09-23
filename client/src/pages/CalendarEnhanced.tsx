import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  format,
  addDays,
  addMonths,
  subMonths,
  addYears,
  startOfWeek,
  startOfMonth,
  startOfDay,
  endOfDay,
  isSameDay,
  isSameMonth,
  isToday as isTodayFn,
  parseISO,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  formatDistanceToNow,
} from "date-fns";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Menu,
  MapPin,
  Video,
  X,
  Trash2,
  Bell,
  Briefcase,
  ListTodo,
  Globe,
  Lock,
  EyeOff,
  Download,
  ExternalLink,
  UserPlus,
  Mail,
  Loader2,
  Users,
  Check,
  Clock,
  CalendarClock,
  Square,
  CheckSquare2,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/components/Layout";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewMode = "day" | "week" | "month";
type RepeatRule = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
type CustomRepeatUnit = "daily" | "weekly" | "monthly" | "yearly";

interface Guest {
  id: string;
  name: string;
  email: string;
  isExternal: boolean;
  optional: boolean;
  // RSVP — set by the server once the guest responds (Accept/Decline/Propose new time).
  status?: "needsAction" | "accepted" | "declined" | "proposed";
  proposedDate?: string | null;
  proposedStartTime?: string | null;
  proposedEndTime?: string | null;
  proposedNote?: string | null;
  respondedAt?: string | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  videoLink: string;
  allDay: boolean;
  date: string; // yyyy-MM-dd start date
  endDate: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  calendarType: string;
  colorKey: string;
  guests: Guest[];
  guestsCanModify: boolean;
  guestsCanInvite: boolean;
  guestsCanSeeGuestList: boolean;
  projectId: string;
  projectTitle: string;
  taskId: string;
  taskTitle: string;
  repeat: RepeatRule;
  customRepeatInterval?: number;
  customRepeatUnit?: CustomRepeatUnit;
  repeatUntil: string | null; // yyyy-MM-dd; null = repeats indefinitely
  reminders: number[];
  visibility: "default" | "public" | "private";
  busy: boolean;
  createdAt: string;
  // Present when this event was added to your calendar because someone
  // invited you as a guest; absent/true for events you organize yourself.
  isOrganizer?: boolean;
  organizerName?: string;
  organizerEmail?: string;
  // Your own RSVP status, present on a guest's copy of the event (see Guest above).
  responseStatus?: "needsAction" | "accepted" | "declined" | "proposed";
  proposedDate?: string | null;
  proposedStartTime?: string | null;
  proposedEndTime?: string | null;
  proposedNote?: string | null;
}

interface Occurrence extends CalendarEvent {
  occurrenceDate: string;
  isRecurring: boolean;
}

interface ProjectOption {
  id: string;
  title: string;
}

interface TaskOption {
  id: string;
  taskName: string;
}

interface EmployeeOption {
  id: string;
  name: string;
  email: string;
  department?: string;
  designation?: string;
}

interface ModalState {
  mode: "new" | "edit";
  draft: CalendarEvent;
}

// A lightweight view of a real PMS project task (from /api/tasks/bulk), used
// to render the Google-Calendar-style "Tasks" strip on each day. This is
// intentionally separate from CalendarEvent — it's not a calendar event, it's
// a project task that happens to have a due date.
interface PmsTask {
  id: string;
  taskName: string;
  description?: string | null;
  status: string | null;
  priority: string | null;
  startDate: string | null;
  endDate: string | null;
  projectId: string;
  projectTitle?: string;
  taskOwnerId: string | null;
  assignerId: string;
  assignedMembers?: string[];
}

interface TaskModalState {
  date: string; // yyyy-MM-dd
}

// A task created from the Calendar page itself (Google-Calendar-"Tasks"
// style). This is intentionally its OWN record, stored separately from PMS
// project tasks — adding, completing, editing, or deleting one here never
// touches /api/tasks or the Tasks page. It lives only on the calendar.
interface CalendarTask {
  id: string;
  title: string;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm, "" if not set
  endTime: string; // HH:mm, "" if not set
  allDay: boolean;
  notes: string;
  done: boolean;
  createdAt: string;
}

// One row in a day's "Tasks" strip — either a calendar-only task (fully
// editable from here) or a real PMS project task shown for visibility only
// (read-only: view details, but no complete/delete from the calendar — that
// stays on the Tasks page, which owns that data).
type DayTaskItem =
  | { kind: "calendar"; id: string; title: string; done: boolean; data: CalendarTask }
  | { kind: "project"; id: string; title: string; done: boolean; data: PmsTask };

// ─── Constants ──────────────────────────────────────────────────────────────

const CALENDAR_TYPES: { key: string; label: string; color: string }[] = [
  { key: "meeting", label: "Meetings", color: "#3C5A73" },
  { key: "deadline", label: "Deadlines", color: "#8C4A3D" },
  { key: "task", label: "Tasks", color: "#D1A339" },
  { key: "milestone", label: "Project milestones", color: "#3F6B52" },
  { key: "personal", label: "Personal", color: "#6E4368" },
];

// Named after job-site materials rather than Google's paint-swatch names
// (Tomato/Peacock/Basil…) — same underlying keys are kept so events saved
// before this redesign keep their original color.
const EVENT_COLORS: Record<string, { label: string; hex: string }> = {
  tomato: { label: "Brick", hex: "#8C4A3D" },
  flamingo: { label: "Copper", hex: "#B4623A" },
  tangerine: { label: "Ochre", hex: "#C08A2E" },
  banana: { label: "Amber", hex: "#D1A339" },
  sage: { label: "Moss", hex: "#6B8A5A" },
  basil: { label: "Pine", hex: "#3F6B52" },
  peacock: { label: "Slate", hex: "#3C5A73" },
  blueberry: { label: "Denim", hex: "#43608C" },
  lavender: { label: "Wisteria", hex: "#7C6FA6" },
  grape: { label: "Plum", hex: "#6E4368" },
  graphite: { label: "Graphite", hex: "#5B5F66" },
};

const DEFAULT_COLOR_BY_TYPE: Record<string, string> = {
  meeting: "peacock",
  deadline: "tomato",
  task: "banana",
  milestone: "basil",
  personal: "grape",
};

const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "At time of event" },
  { value: 5, label: "5 minutes before" },
  { value: 10, label: "10 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
  { value: 10080, label: "1 week before" },
];

const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const ROW_H = 48;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Helpers ────────────────────────────────────────────────────────────────

const uid = () => `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const guestUid = () => `gst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const toMin = (t: string): number => {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const fmtHour = (h: number): string => {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
};

// Formats minutes-since-midnight as "9:15 AM" — used for the live drag-select label.
const fmtMinutes = (totalMin: number): string => {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
};

const activeTypesStorageKey = (userId?: string) =>
  userId ? `pms_calendar_active_types_${userId}` : "pms_calendar_active_types_guest";

// Load which calendar-type checkboxes are active. Defaults to "all on" so a
// brand-new user (or missing/corrupt storage) sees every event, matching
// Google Calendar's default of having every calendar checked.
const loadActiveTypes = (userId?: string): Set<string> => {
  const allKeys = CALENDAR_TYPES.map((t) => t.key);
  if (typeof window === "undefined") return new Set(allKeys);
  try {
    const raw = window.localStorage.getItem(activeTypesStorageKey(userId));
    if (!raw) return new Set(allKeys);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(allKeys);
    // Only keep keys that still correspond to a real calendar type
    const filtered = parsed.filter((k) => allKeys.includes(k));
    return new Set(filtered);
  } catch {
    return new Set(allKeys);
  }
};

const persistActiveTypes = (userId: string | undefined, activeTypes: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(activeTypesStorageKey(userId), JSON.stringify(Array.from(activeTypes)));
  } catch {
    /* ignore quota errors */
  }
};

// ─── Calendar-only tasks (separate from the Tasks page) ────────────────────
// These live entirely in the browser, keyed per user, and never touch
// /api/tasks — the real PMS project tasks table. This keeps "Add task" on
// the Calendar page fully independent of the Tasks page, as requested: the
// calendar can still SHOW that day's real project tasks (read-only, pulled
// live from the Tasks page's data), but anything created/completed/deleted
// via the calendar's own task UI only affects this separate store.
const calendarTasksStorageKey = (userId?: string) =>
  userId ? `pms_calendar_own_tasks_${userId}` : "pms_calendar_own_tasks_guest";

const loadCalendarTasks = (userId?: string): CalendarTask[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(calendarTasksStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistCalendarTasks = (userId: string | undefined, tasks: CalendarTask[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(calendarTasksStorageKey(userId), JSON.stringify(tasks));
  } catch {
    /* ignore quota errors */
  }
};

const blankDraft = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => {
  const type = overrides.calendarType || "meeting";
  return {
    id: uid(),
    title: "",
    description: "",
    location: "",
    videoLink: "",
    allDay: false,
    date: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:00",
    calendarType: type,
    colorKey: DEFAULT_COLOR_BY_TYPE[type] || "peacock",
    guests: [],
    guestsCanModify: false,
    guestsCanInvite: true,
    guestsCanSeeGuestList: true,
    projectId: "",
    projectTitle: "",
    taskId: "",
    taskTitle: "",
    repeat: "none",
    customRepeatInterval: 1,
    customRepeatUnit: "weekly",
    repeatUntil: null,
    reminders: [30],
    visibility: "default",
    busy: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
};

// Expand recurring events into visible occurrences within [rangeStart, rangeEnd]
function expandOccurrences(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const out: Occurrence[] = [];

  const advance = (date: Date, event: CalendarEvent) => {
    const interval = Math.max(1, event.customRepeatInterval || 1);
    if (event.repeat === "custom") {
      if (event.customRepeatUnit === "daily") return addDays(date, interval);
      if (event.customRepeatUnit === "monthly") return addMonths(date, interval);
      if (event.customRepeatUnit === "yearly") return addYears(date, interval);
      return addDays(date, interval * 7);
    }
    if (event.repeat === "daily") return addDays(date, 1);
    if (event.repeat === "weekly") return addDays(date, 7);
    if (event.repeat === "monthly") return addMonths(date, 1);
    return addYears(date, 1);
  };

  events.forEach((evt) => {
    if (!evt.repeat || evt.repeat === "none") {
      const d = parseISO(evt.date);
      if (d >= rangeStart && d <= rangeEnd) {
        out.push({ ...evt, occurrenceDate: evt.date, isRecurring: false });
      }
      return;
    }

    const originalStart = parseISO(evt.date);
    let cursor = originalStart;

    if (cursor < rangeStart) {
      if (evt.repeat === "daily") {
        cursor = rangeStart;
      } else if (evt.repeat === "weekly") {
        const daysSince = differenceInCalendarDays(rangeStart, originalStart);
        const weeksToAdd = Math.max(0, Math.floor(daysSince / 7));
        cursor = addDays(originalStart, weeksToAdd * 7);
        while (cursor < rangeStart) cursor = addDays(cursor, 7);
      } else if (evt.repeat === "monthly") {
        const monthsSince = differenceInCalendarMonths(rangeStart, originalStart);
        cursor = addMonths(originalStart, Math.max(0, monthsSince - 1));
        while (cursor < rangeStart) cursor = addMonths(cursor, 1);
      } else if (evt.repeat === "yearly") {
        const yearsSince = rangeStart.getFullYear() - originalStart.getFullYear();
        cursor = addYears(originalStart, Math.max(0, yearsSince - 1));
        while (cursor < rangeStart) cursor = addYears(cursor, 1);
      } else if (evt.repeat === "custom") {
        while (cursor < rangeStart) cursor = advance(cursor, evt);
      }
    }

    const untilDate = evt.repeatUntil ? parseISO(evt.repeatUntil) : null;
    const effectiveRangeEnd = untilDate && untilDate < rangeEnd ? untilDate : rangeEnd;

    let count = 0;
    while (cursor <= effectiveRangeEnd && count < 60) {
      if (cursor >= originalStart) {
        out.push({
          ...evt,
          date: format(cursor, "yyyy-MM-dd"),
          occurrenceDate: format(cursor, "yyyy-MM-dd"),
          isRecurring: true,
        });
      }
      count++;
      cursor = advance(cursor, evt);
    }
  });

  return out;
}

function buildGoogleCalendarUrl(evt: CalendarEvent): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  let datesParam = "";

  if (evt.allDay) {
    const start = evt.date.replace(/-/g, "");
    const end = format(addDays(parseISO(evt.endDate || evt.date), 1), "yyyyMMdd");
    datesParam = `${start}/${end}`;
  } else {
    const [sh, sm] = evt.startTime.split(":").map(Number);
    const [eh, em] = evt.endTime.split(":").map(Number);
    const start = `${evt.date.replace(/-/g, "")}T${pad(sh)}${pad(sm)}00`;
    const end = `${(evt.endDate || evt.date).replace(/-/g, "")}T${pad(eh)}${pad(em)}00`;
    datesParam = `${start}/${end}`;
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: evt.title || "Untitled event",
    dates: datesParam,
    details: evt.description || "",
    location: evt.location || evt.videoLink || "",
  });

  const guestEmails = evt.guests.map((g) => g.email).filter(Boolean);
  if (guestEmails.length) params.set("add", guestEmails.join(","));

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz) params.set("ctz", tz);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const escapeICS = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");

const toICSDate = (dateStr: string, timeStr?: string) => {
  if (!timeStr) return dateStr.replace(/-/g, ""); // All day event

  // Parse as local time, convert to UTC string
  const dateObj = new Date(`${dateStr}T${timeStr}:00`);
  const y = dateObj.getUTCFullYear();
  const mo = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getUTCDate()).padStart(2, "0");
  const h = String(dateObj.getUTCHours()).padStart(2, "0");
  const m = String(dateObj.getUTCMinutes()).padStart(2, "0");
  const s = String(dateObj.getUTCSeconds()).padStart(2, "0");

  return `${y}${mo}${d}T${h}${m}${s}Z`;
};

function buildICS(events: CalendarEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PMS//Calendar//EN", "CALSCALE:GREGORIAN"];
  const freqMap: Record<string, string> = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };

  events.forEach((evt) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${evt.id}@pms.local`);
    lines.push(`SUMMARY:${escapeICS(evt.title || "Untitled event")}`);
    if (evt.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toICSDate(evt.date)}`);
      lines.push(`DTEND;VALUE=DATE:${toICSDate(evt.endDate || evt.date)}`);
    } else {
      lines.push(`DTSTART:${toICSDate(evt.date, evt.startTime)}`);
      lines.push(`DTEND:${toICSDate(evt.endDate || evt.date, evt.endTime)}`);
    }
    if (evt.location) lines.push(`LOCATION:${escapeICS(evt.location)}`);
    if (evt.description) lines.push(`DESCRIPTION:${escapeICS(evt.description)}`);
    evt.guests.forEach((g) => {
      if (g.email) lines.push(`ATTENDEE;CN=${escapeICS(g.name || g.email)}:mailto:${g.email}`);
    });
    if (evt.repeat !== "none") {
      const customUnit = evt.customRepeatUnit || "weekly";
      const frequency = evt.repeat === "custom" ? freqMap[customUnit] : freqMap[evt.repeat];
      const interval = evt.repeat === "custom" ? Math.max(1, evt.customRepeatInterval || 1) : 1;
      let rrule = `RRULE:FREQ=${frequency}${interval > 1 ? `;INTERVAL=${interval}` : ""}`;
      if (evt.repeatUntil) rrule += `;UNTIL=${toICSDate(evt.repeatUntil)}`;
      lines.push(rrule);
    }
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadFile(filename: string, content: string, mime = "text/calendar") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const typeColor = (key: string) => CALENDAR_TYPES.find((t) => t.key === key)?.color || "#3C5A73";
const eventHex = (evt: CalendarEvent) => EVENT_COLORS[evt.colorKey]?.hex || typeColor(evt.calendarType);

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

// Turns a hex color into a soft rgba tint, used for the spine-card fill.
const hexToRgba = (hex: string, alpha: number) => {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ─── Small presentational pieces ───────────────────────────────────────────

function EventChip({
  occ,
  compact,
  onClick,
  draggable,
  onDragStart,
}: {
  occ: Occurrence;
  compact?: boolean;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const hex = eventHex(occ);
  const isGuestCopy = occ.isOrganizer === false;
  const myDecline = isGuestCopy && occ.responseStatus === "declined";
  // On the organizer's own card, only show "declined" styling once every
  // invited guest has said no — a single decline out of many guests
  // shouldn't grey out a meeting other people are still attending.
  const allGuestsDeclined = !isGuestCopy && (occ.guests?.length || 0) > 0 && occ.guests!.every((g) => g.status === "declined");
  const isDeclined = myDecline || allGuestsDeclined;
  // Declined events get a red-tinted border + bold strike-through, at full
  // opacity, so they still read clearly instead of fading into the background.
  const declinedTextHex = "#6B7280"; // gray-500 — legible on light backgrounds
  const declinedBorderHex = "#DC2626"; // red-600
  const displayHex = isDeclined ? declinedTextHex : hex;
  const guestCount = occ.guests?.length || 0;
  const visibleGuests = occ.guests?.slice(0, 3) || [];
  const rsvpIcon =
    isGuestCopy && occ.responseStatus === "accepted" ? { Icon: Check, color: "#16a34a", label: "You accepted" } :
      isGuestCopy && occ.responseStatus === "declined" ? { Icon: X, color: "#dc2626", label: "You declined" } :
        isGuestCopy && occ.responseStatus === "proposed" ? { Icon: Clock, color: "#d97706", label: "You proposed a new time" } :
          isGuestCopy ? { Icon: null, color: displayHex, label: "You were invited" } :
            allGuestsDeclined ? { Icon: X, color: "#dc2626", label: "All guests declined" } : null;

  return (
    <motion.div
      layout
      initial={prefersReducedMotion ? false : { opacity: 0, y: 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -1, transition: { duration: 0.12 } }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      draggable={draggable}
      onDragStartCapture={onDragStart}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "group relative overflow-hidden rounded-md border-l-[3px] select-none cursor-pointer",
        compact ? "px-1.5 py-0.5 mb-0.5" : "px-2 py-1 h-full"
      )}
      style={{
        borderLeftColor: isDeclined ? declinedBorderHex : displayHex,
        background: isDeclined ? "rgba(220, 38, 38, 0.07)" : hexToRgba(displayHex, compact ? 0.14 : 0.12),
      }}
      title={occ.title}
    >
      <div className={cn("flex items-start gap-1", compact ? "text-[11px]" : "text-xs")}>
        <div className="min-w-0 flex-1">
          <div
            className={cn("font-semibold truncate leading-tight", isDeclined && "line-through decoration-2 decoration-red-500/70")}
            style={{ color: displayHex }}
          >
            {occ.title || "Untitled event"}
          </div>
          {!compact && !occ.allDay && (
            <div className="font-mono text-[10px] leading-tight text-muted-foreground/80 mt-0.5">
              {occ.startTime}–{occ.endTime}
            </div>
          )}
        </div>
        {rsvpIcon && !compact && (
          rsvpIcon.Icon ? (
            <span
              className="shrink-0 h-3.5 w-3.5 rounded-full mt-0.5 flex items-center justify-center"
              style={{ background: hexToRgba(rsvpIcon.color, 0.18) }}
              title={rsvpIcon.label}
            >
              <rsvpIcon.Icon className="h-2.5 w-2.5" style={{ color: rsvpIcon.color }} strokeWidth={3} />
            </span>
          ) : (
            <span className="shrink-0 h-1.5 w-1.5 rounded-full mt-0.5" style={{ background: rsvpIcon.color }} title={rsvpIcon.label} />
          )
        )}
      </div>

      {!compact && guestCount > 0 && (
        <div className="flex items-center -space-x-1.5 mt-1">
          {visibleGuests.map((g) => (
            <Avatar key={g.id} className="h-4 w-4 border border-background shrink-0">
              <AvatarFallback className="text-[7px] font-semibold" style={{ background: hexToRgba(displayHex, 0.3), color: displayHex }}>
                {initials(g.name)}
              </AvatarFallback>
            </Avatar>
          ))}
          {guestCount > 3 && (
            <span className="h-4 w-4 rounded-full border border-background bg-muted flex items-center justify-center text-[6px] font-semibold text-muted-foreground shrink-0">
              +{guestCount - 3}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

// A single task pill on a calendar day, in the spirit of Google Calendar's
// "Tasks" strip — a checkbox + title, visually distinct (dashed left edge)
// from event chips so the two are never confused.
const TASK_HEX = "#0E8A7D";

function TaskChip({
  item,
  compact,
  onToggle,
  onOpenTask,
  onDelete,
}: {
  item: DayTaskItem;
  compact?: boolean;
  onToggle: () => void;
  onOpenTask: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const done = item.done;
  const isProject = item.kind === "project";
  const priority = item.kind === "project" ? item.data.priority : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <motion.div
          layout
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -1 }}
          className={cn(
            "group relative flex items-center gap-1 overflow-hidden rounded-md border-l-[3px] border-dashed select-none cursor-pointer",
            compact ? "px-1.5 py-0.5 mb-0.5" : "px-2 py-1"
          )}
          style={{
            borderLeftColor: TASK_HEX,
            background: hexToRgba(TASK_HEX, compact ? 0.1 : 0.08),
          }}
          title={isProject ? `${item.title} (from Tasks page — view only)` : item.title}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          {isProject ? (
            // Project tasks are read-only on the calendar — a small
            // briefcase marks it as coming from the Tasks page, with no
            // checkbox to toggle here.
            <Briefcase className="h-3 w-3 shrink-0 text-[#0E8A7D]/70" />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="shrink-0 text-[#0E8A7D]/80 hover:text-[#0E8A7D]"
              title={done ? "Mark task incomplete" : "Mark task complete"}
            >
              {done ? <CheckSquare2 className="h-3 w-3" /> : <Square className="h-3 w-3" />}
            </button>
          )}
          <span
            className={cn(
              "font-semibold truncate leading-tight",
              compact ? "text-[11px]" : "text-xs",
              done && "line-through decoration-2 text-muted-foreground/70"
            )}
            style={done ? undefined : { color: TASK_HEX }}
          >
            {item.title || "Untitled task"}
          </span>
        </motion.div>
      </PopoverTrigger>

      {/* Google-Calendar-style task detail popover: a quick summary plus
          Open / Complete / Delete actions, instead of jumping straight to
          the full edit-task page on every click. Project tasks only get
          "View details" — they're read-only from the calendar. */}
      <PopoverContent
        className="w-64 p-3 border-[#E2DFD6]"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 mb-3">
          {isProject ? (
            <Briefcase className="h-4 w-4 shrink-0 mt-0.5 text-[#0E8A7D]/70" />
          ) : (
            <button
              type="button"
              onClick={() => onToggle()}
              className="shrink-0 mt-0.5 text-[#0E8A7D]/80 hover:text-[#0E8A7D]"
              title={done ? "Mark task incomplete" : "Mark task complete"}
            >
              {done ? <CheckSquare2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className={cn("text-sm font-semibold leading-snug", done && "line-through text-muted-foreground")}>
              {item.title || "Untitled task"}
            </div>
            {isProject ? (
              <div className="text-[10px] text-muted-foreground mt-0.5">From the Tasks page · view only</div>
            ) : (
              priority && <div className="text-[10px] text-muted-foreground capitalize mt-0.5">{priority} priority</div>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs border-[#E2DFD6]"
            onClick={() => {
              setOpen(false);
              onOpenTask();
            }}
          >
            View details
          </Button>
          {!isProject && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-destructive hover:text-destructive"
              title="Delete task"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MiniCalendar({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [month, setMonth] = useState<Date>(startOfMonth(value));

  useEffect(() => {
    setMonth((prev) => (isSameMonth(prev, value) ? prev : startOfMonth(value)));
  }, [value]);

  const monthStart = startOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(calStart, i));
  const today = new Date();

  return (
    <div className="px-3 py-2 select-none">
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => setMonth((m) => subMonths(m, 1))}
          className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold font-display tracking-tight">{format(month, "MMMM yyyy")}</span>
        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 justify-items-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-[10px] font-mono text-muted-foreground/70 h-6 flex items-center justify-center w-6">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const isSel = isSameDay(day, value);
          const isTod = isTodayFn(day);
          const inMonth = isSameMonth(day, month);
          return (
            <motion.div
              key={day.toISOString()}
              whileTap={{ scale: 0.85 }}
              onClick={() => {
                onChange(day);
                setMonth(day);
              }}
              className={cn(
                "w-6 h-6 rounded-md flex items-center justify-center text-[11px] cursor-pointer transition-colors font-mono",
                isSel && "bg-[#3C5A73] text-white font-semibold shadow-sm",
                !isSel && isTod && "text-[#D1A339] font-bold ring-1 ring-[#D1A339]/50",
                !isSel && !isTod && inMonth && "text-foreground hover:bg-muted",
                !isSel && !isTod && !inMonth && "text-muted-foreground/40 hover:bg-muted"
              )}
            >
              {format(day, "d")}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Live clock (drives the current-time red line) ─────────────────────────

function useNowMinutes(): number {
  const compute = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  };
  const [minutes, setMinutes] = useState<number>(compute);

  useEffect(() => {
    const id = setInterval(() => setMinutes(compute()), 30000);
    return () => clearInterval(id);
  }, []);

  return minutes;
}

// Google-Calendar-style red "now" indicator: a dot + line at the current time,
// only rendered on the column that represents today.
function CurrentTimeLine({ nowMinutes }: { nowMinutes: number }) {
  const prefersReducedMotion = useReducedMotion();
  const top = (nowMinutes / 60) * ROW_H;
  const NOW_COLOR = "#C1443C";
  return (
    <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top }}>
      <div className="relative">
        <motion.div
          className="absolute -left-[5px] -top-[5px] w-[10px] h-[10px] rounded-full"
          style={{ background: NOW_COLOR }}
          animate={prefersReducedMotion ? {} : { scale: [1, 1.35, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="h-[1.5px] w-full" style={{ background: NOW_COLOR }} />
      </div>
    </div>
  );
}

// ─── Overlap layout (Google-Calendar-style side-by-side columns) ────────────

interface LayoutInfo {
  column: number;
  totalColumns: number;
  widthPct: number;
  leftPct: number;
}

/**
 * Given a list of timed (non-all-day) occurrences for a single day, groups
 * overlapping events into clusters and assigns each event a column index so
 * they render side-by-side instead of stacking behind each other.
 *
 * Algorithm:
 * 1. Sort events by start time (ties broken by longer duration first).
 * 2. Walk through, grouping events whose time ranges overlap into clusters.
 * 3. Within each cluster, greedily assign the lowest available column.
 * 4. Compute width = 100% / totalColumns, left = column * width.
 */
function computeOverlapLayout(timed: Occurrence[]): Map<string, LayoutInfo> {
  const result = new Map<string, LayoutInfo>();
  if (timed.length === 0) return result;

  // Sort: earliest start first; if equal, longer events first (so they get col 0)
  const sorted = [...timed].sort((a, b) => {
    const diff = toMin(a.startTime) - toMin(b.startTime);
    if (diff !== 0) return diff;
    return (toMin(b.endTime) - toMin(b.startTime)) - (toMin(a.endTime) - toMin(a.startTime));
  });

  // Build clusters of mutually overlapping events
  type ClusterItem = { occ: Occurrence; startMin: number; endMin: number };
  const clusters: ClusterItem[][] = [];
  let currentCluster: ClusterItem[] = [];
  let clusterEnd = -1;

  for (const occ of sorted) {
    const s = toMin(occ.startTime);
    const e = Math.max(s + 15, toMin(occ.endTime));
    if (currentCluster.length === 0 || s < clusterEnd) {
      // Overlaps with current cluster
      currentCluster.push({ occ, startMin: s, endMin: e });
      clusterEnd = Math.max(clusterEnd, e);
    } else {
      clusters.push(currentCluster);
      currentCluster = [{ occ, startMin: s, endMin: e }];
      clusterEnd = e;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  // Assign columns within each cluster
  for (const cluster of clusters) {
    const columnEnds: number[] = []; // tracks the endMin of each column
    const assignments: { occ: Occurrence; col: number }[] = [];

    for (const item of cluster) {
      // Find the lowest column where the event fits (i.e., column's last event ends before this starts)
      let placed = false;
      for (let c = 0; c < columnEnds.length; c++) {
        if (columnEnds[c] <= item.startMin) {
          columnEnds[c] = item.endMin;
          assignments.push({ occ: item.occ, col: c });
          placed = true;
          break;
        }
      }
      if (!placed) {
        assignments.push({ occ: item.occ, col: columnEnds.length });
        columnEnds.push(item.endMin);
      }
    }

    const totalColumns = columnEnds.length;
    for (const { occ, col } of assignments) {
      const key = `${occ.id}-${occ.occurrenceDate}`;
      result.set(key, {
        column: col,
        totalColumns,
        widthPct: 100 / totalColumns,
        leftPct: (col / totalColumns) * 100,
      });
    }
  }

  return result;
}

// ─── Day column (used by week + day views) ─────────────────────────────────

const SNAP_MIN = 1; // resize/drag-select snapping granularity, in minutes — exact, follows the cursor
const MIN_EVENT_MIN = 15; // shortest an event can be resized down to
const CLICK_VS_DRAG_THRESHOLD_MIN = 5; // minimum drag distance (minutes) before it's treated as a range-select instead of a plain click

function DayColumn({
  dayStr,
  occurrences,
  onSlotClick,
  onRangeSelect,
  onEventClick,
  onDrop,
  onResize,
}: {
  dayStr: string;
  occurrences: Occurrence[];
  onSlotClick: (hour: number) => void;
  // Google Calendar-style click-and-drag across empty slots to pick an exact
  // start/end time for a new event. Optional so nothing breaks if a caller
  // doesn't pass it — falls back to onSlotClick's fixed-duration behavior.
  onRangeSelect?: (startMin: number, endMin: number) => void;
  onEventClick: (occ: Occurrence) => void;
  onDrop: (eventId: string, hour: number) => void;
  onResize: (eventId: string, newEndMin: number) => void;
}) {
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);
  const [resizing, setResizing] = useState<{
    id: string;
    startY: number;
    startMin: number;
    origEndMin: number;
    deltaMin: number;
  } | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const [selecting, setSelecting] = useState<{ startMin: number; currentMin: number } | null>(null);

  const minuteFromClientY = (clientY: number) => {
    const rect = columnRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const offsetY = clientY - rect.top;
    const rawMin = (offsetY / ROW_H) * 60;
    return Math.max(0, Math.min(24 * 60, Math.round(rawMin / SNAP_MIN) * SNAP_MIN));
  };

  // Track the in-progress range selection with mousemove/mouseup on the
  // window, mirroring the resize-drag pattern below so it keeps working even
  // if the cursor leaves the column.
  useEffect(() => {
    if (!selecting) return;

    const handleMove = (e: MouseEvent) => {
      const snapped = minuteFromClientY(e.clientY);
      setSelecting((s) => (s ? { ...s, currentMin: snapped } : s));
    };

    const handleUp = () => {
      setSelecting((s) => {
        if (s) {
          const moved = Math.abs(s.currentMin - s.startMin);
          // Distinguish a genuine drag from a plain click using a fixed
          // threshold — this is intentionally independent of SNAP_MIN
          // (which is now 1, i.e. exact-cursor precision) so a quick click
          // still registers as a click instead of a 1-minute "drag".
          if (moved < CLICK_VS_DRAG_THRESHOLD_MIN) {
            // Barely moved — treat like the old single click behavior.
            onSlotClick(Math.floor(s.startMin / 60));
          } else if (onRangeSelect) {
            onRangeSelect(Math.min(s.startMin, s.currentMin), Math.max(s.startMin, s.currentMin));
          } else {
            onSlotClick(Math.floor(Math.min(s.startMin, s.currentMin) / 60));
          }
        }
        return null;
      });
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecting, onRangeSelect, onSlotClick]);
  const timed = useMemo(() => occurrences.filter((o) => !o.allDay), [occurrences]);
  const overlapLayout = useMemo(() => computeOverlapLayout(timed), [timed]);
  const nowMinutes = useNowMinutes();
  const isTodayCol = isTodayFn(parseISO(dayStr));

  // Track the in-progress resize with mousemove/mouseup on the window, so the
  // drag keeps working even if the cursor leaves the event chip.
  useEffect(() => {
    if (!resizing) return;

    const handleMove = (e: MouseEvent) => {
      const deltaPx = e.clientY - resizing.startY;
      const rawDeltaMin = (deltaPx / ROW_H) * 60;
      const snapped = Math.round(rawDeltaMin / SNAP_MIN) * SNAP_MIN;
      setResizing((r) => (r ? { ...r, deltaMin: snapped } : r));
    };

    const handleUp = () => {
      setResizing((r) => {
        if (r) {
          const proposedEnd = r.origEndMin + r.deltaMin;
          const clampedEnd = Math.max(r.startMin + MIN_EVENT_MIN, Math.min(24 * 60, proposedEnd));
          onResize(r.id, clampedEnd);
        }
        return null;
      });
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [resizing, onResize]);

  return (
    <div ref={columnRef} className="flex-1 min-w-0 relative border-l select-none">
      {HOURS.map((hour) => (
        <div
          key={hour}
          onMouseDown={(e) => {
            e.preventDefault();
            const snapped = minuteFromClientY(e.clientY);
            setSelecting({ startMin: snapped, currentMin: snapped });
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverHour(hour);
          }}
          onDragLeave={() => setDragOverHour(null)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverHour(null);
            const id = e.dataTransfer.getData("text/plain");
            if (id) onDrop(id, hour);
          }}
          className={cn(
            "border-b border-border/60 box-border cursor-pointer hover:bg-muted/40 transition-colors",
            dragOverHour === hour && "bg-[#3C5A73]/10"
          )}
          style={{ height: ROW_H }}
        />
      ))}

      {selecting && (
        <div
          className="absolute left-0 right-0 z-30 rounded-sm pointer-events-none border-l-[3px]"
          style={{
            top: (Math.min(selecting.startMin, selecting.currentMin) / 60) * ROW_H,
            height: Math.max(3, (Math.abs(selecting.currentMin - selecting.startMin) / 60) * ROW_H),
            background: hexToRgba("#3C5A73", 0.15),
            borderLeftColor: "#3C5A73",
          }}
        >
          {Math.abs(selecting.currentMin - selecting.startMin) >= SNAP_MIN && (
            <span className="absolute left-1 top-0.5 text-[10px] font-mono font-medium text-[#3C5A73] bg-background/90 px-1 rounded">
              {fmtMinutes(Math.min(selecting.startMin, selecting.currentMin))} –{" "}
              {fmtMinutes(Math.max(selecting.startMin, selecting.currentMin))}
            </span>
          )}
        </div>
      )}

      {isTodayCol && <CurrentTimeLine nowMinutes={nowMinutes} />}

      {timed.map((occ) => {
        const startMin = toMin(occ.startTime);
        const baseEndMin = Math.max(startMin + 15, toMin(occ.endTime));
        const isResizingThis = resizing?.id === occ.id;
        const liveEndMin = isResizingThis
          ? Math.max(startMin + MIN_EVENT_MIN, Math.min(24 * 60, baseEndMin + resizing.deltaMin))
          : baseEndMin;
        const top = (startMin / 60) * ROW_H;
        const height = Math.max(18, ((liveEndMin - startMin) / 60) * ROW_H - 2);
        const canEdit = !occ.isRecurring;
        const layoutKey = `${occ.id}-${occ.occurrenceDate}`;
        const layout = overlapLayout.get(layoutKey);
        const leftPct = layout?.leftPct ?? 0;
        const widthPct = layout?.widthPct ?? 100;
        return (
          <div
            key={layoutKey}
            className={cn("absolute transition-shadow", isResizingThis ? "z-20 drop-shadow-lg" : "z-10")}
            style={{
              top,
              height,
              left: `calc(${leftPct}% + 1px)`,
              width: `calc(${widthPct}% - 2px)`,
            }}
          >
            <div className="relative h-full group">
              <EventChip
                occ={occ}
                onClick={() => onEventClick(occ)}
                draggable={canEdit && !isResizingThis}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", occ.id)}
              />
              {canEdit && !occ.allDay && (
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setResizing({
                      id: occ.id,
                      startY: e.clientY,
                      startMin,
                      origEndMin: baseEndMin,
                      deltaMin: 0,
                    });
                  }}
                  className="absolute -bottom-1.5 left-0 right-0 h-3 cursor-ns-resize flex items-end justify-center z-20"
                  title="Drag to change duration"
                >
                  <div
                    className="w-8 h-1 rounded-full mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: eventHex(occ) }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function CalendarEnhanced() {
  const { user } = useAuth();
  const { toast } = useToast();

  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(CALENDAR_TYPES.map((t) => t.key))
  );
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Tasks-on-the-calendar ────────────────────────────────────────────────
  // Two fully independent sources feed the "Tasks" strip:
  //
  //  1. `myTasks` — real PMS project tasks, fetched from /api/tasks so that
  //     day's real tasks show up (as the Tasks page owns them). This feed is
  //     READ-ONLY from the calendar: no complete/delete/edit here, only
  //     "View details" — editing that task stays on the Tasks page.
  //
  //  2. `myCalendarTasks` — tasks created via the calendar's own "Add task",
  //     stored separately (see loadCalendarTasks/persistCalendarTasks) and
  //     never touching /api/tasks. Adding, completing, editing, or deleting
  //     one of these only ever affects the calendar — the Tasks page never
  //     sees it.
  const [myTasks, setMyTasks] = useState<PmsTask[]>([]);
  const [myCalendarTasks, setMyCalendarTasks] = useState<CalendarTask[]>([]);
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null);
  const [taskDetail, setTaskDetail] = useState<DayTaskItem | null>(null);

  const loadMyTasks = () => {
    if (!user?.employeeId) {
      setMyTasks([]);
      return;
    }
    Promise.all([
      apiFetch("/api/tasks/bulk?status=all", { bypassCache: true }).then((res) => res.json()),
      apiFetch("/api/projects").then((res) => res.json()).catch(() => []),
    ])
      .then(([data, projectData]) => {
        const list = Array.isArray(data) ? data : [];
        const projects = Array.isArray(projectData) ? projectData : [];
        const projectTitleById = new Map<string, string>(
          projects.map((p: any) => [p.id, p.title || p.projectCode || "Untitled project"])
        );
        // Only tasks where you're actually the owner or an assignee show up
        // on your calendar — a task you merely created (as assigner) for
        // someone else doesn't belong on your own calendar.
        const mine = list
          .filter(
            (t: any) =>
              t.taskOwnerId === user.employeeId ||
              (Array.isArray(t.assignedMembers) && t.assignedMembers.includes(user.employeeId))
          )
          .map((t: any) => ({ ...t, projectTitle: projectTitleById.get(t.projectId) || "" }));
        setMyTasks(mine);
      })
      .catch((err) => console.error("Failed to load tasks:", err));
  };

  useEffect(() => {
    loadMyTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.employeeId]);

  // Load calendar-only tasks from local storage whenever the user changes,
  // and persist them back on every change. Entirely separate from the
  // /api/tasks calls above.
  useEffect(() => {
    setMyCalendarTasks(loadCalendarTasks(user?.id));
  }, [user?.id]);

  useEffect(() => {
    persistCalendarTasks(user?.id, myCalendarTasks);
  }, [user?.id, myCalendarTasks]);

  // Completed tasks are left out entirely, matching Google Calendar Tasks —
  // once you check a task off, it disappears from the calendar rather than
  // sticking around with a strikethrough.
  const isTaskDone = (t: PmsTask) => t.status === "Completed" || t.status === "completed";

  // Group both task sources across every day they span. Real project tasks
  // span Start Date → End Date inclusive; calendar-only tasks live on a
  // single date. Each entry is tagged with its `kind` so the UI knows
  // whether it's editable (calendar) or view-only (project).
  const tasksByDate = useMemo(() => {
    const map: Record<string, DayTaskItem[]> = {};

    myTasks.forEach((t) => {
      if (isTaskDone(t)) return;
      const startStr = t.startDate ? String(t.startDate).slice(0, 10) : null;
      const endStr = t.endDate ? String(t.endDate).slice(0, 10) : null;
      const rawStart = startStr || endStr;
      const rawEnd = endStr || startStr;
      if (!rawStart || !rawEnd) return;
      const [firstStr, lastStr] = rawStart <= rawEnd ? [rawStart, rawEnd] : [rawEnd, rawStart];
      let cursor = parseISO(firstStr);
      const last = parseISO(lastStr);
      let count = 0;
      // Safety cap so a bad/very-far-apart date pair can't loop forever.
      while (cursor <= last && count < 90) {
        const dateKey = format(cursor, "yyyy-MM-dd");
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push({ kind: "project", id: t.id, title: t.taskName, done: false, data: t });
        cursor = addDays(cursor, 1);
        count++;
      }
    });

    myCalendarTasks.forEach((t) => {
      if (t.done) return;
      if (!t.date) return;
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push({ kind: "calendar", id: t.id, title: t.title, done: t.done, data: t });
    });

    Object.values(map).forEach((arr) => arr.sort((a, b) => a.title.localeCompare(b.title)));
    return map;
  }, [myTasks, myCalendarTasks]);

  const openNewTask = (date: Date) => {
    setTaskModal({ date: format(date, "yyyy-MM-dd") });
  };

  // Opens task details right inside the calendar — the Tasks page is a
  // separate part of the app, so clicking a task here should never leave
  // the calendar. Project tasks open in a read-only view; calendar tasks
  // open fully editable.
  const openTask = (item: DayTaskItem) => {
    setTaskDetail(item);
  };

  const toggleCalendarTaskDone = (task: CalendarTask) => {
    setMyCalendarTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
  };

  const deleteCalendarTask = (task: CalendarTask) => {
    setMyCalendarTasks((prev) => prev.filter((t) => t.id !== task.id));
    toast({ title: "Task deleted" });
  };

  // Branch on kind so the render call sites don't need to know the
  // difference — but a project task's toggle/delete is a no-op, since
  // those stay read-only from the calendar.
  const toggleDayTask = (item: DayTaskItem) => {
    if (item.kind === "calendar") toggleCalendarTaskDone(item.data);
  };

  const deleteDayTask = (item: DayTaskItem) => {
    if (item.kind === "calendar") deleteCalendarTask(item.data);
  };

  const handleTaskCreated = (task: CalendarTask) => {
    setMyCalendarTasks((prev) => [...prev, task]);
    setTaskModal(null);
    toast({ title: "Task added", description: `"${task.title}" was added to your calendar (calendar-only, not on the Tasks page).` });
  };

  // Load / persist events for this user
  useEffect(() => {
    setActiveTypes(loadActiveTypes(user?.id));
    if (user?.id) {
      apiFetch("/api/calendar-events")
        .then((res) => res.json())
        .then((data) => setEvents(Array.isArray(data) ? data : []))
        .catch((err) => console.error("Failed to load events:", err));
    } else {
      setEvents([]);
    }
  }, [user?.id]);

  // Scroll the hourly grid to a sensible default (7am) on view change
  useEffect(() => {
    if ((viewMode === "day" || viewMode === "week") && gridRef.current) {
      gridRef.current.scrollTop = 7 * ROW_H - 40;
    }
  }, [viewMode]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!activeTypes.has(e.calendarType)) return false;
      if (!searchTerm.trim()) return true;
      const kw = searchTerm.toLowerCase();
      return [e.title, e.description, e.projectTitle, e.taskTitle, e.location]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(kw));
    });
  }, [events, activeTypes, searchTerm]);

  const rangeStart = viewMode === "month" ? monthDays[0] : viewMode === "week" ? weekDays[0] : startOfDay(selectedDate);
  const rangeEnd = viewMode === "month" ? monthDays[41] : viewMode === "week" ? weekDays[6] : endOfDay(selectedDate);

  const occurrences = useMemo(
    () => expandOccurrences(filteredEvents, rangeStart, rangeEnd),
    [filteredEvents, rangeStart, rangeEnd]
  );

  // NOTE: this now uses `filteredEvents` (respecting the MY CALENDARS checkboxes
  // and search box) instead of the raw `events` array, so the sidebar list stays
  // consistent with what's shown on the day/week/month grid — matching how
  // Google Calendar hides an unchecked calendar everywhere, not just on the grid.
  const upcoming = useMemo(() => {
    const todayStr = format(today, "yyyy-MM-dd");
    return expandOccurrences(filteredEvents, today, addMonths(today, 2))
      .filter((o) => o.occurrenceDate >= todayStr)
      .sort((a, b) => (a.occurrenceDate + a.startTime).localeCompare(b.occurrenceDate + b.startTime))
      .slice(0, 6);
  }, [filteredEvents, today]);

  const headerLabel =
    viewMode === "month"
      ? format(selectedDate, "MMMM yyyy")
      : viewMode === "week"
        ? `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], isSameMonth(weekDays[0], weekDays[6]) ? "d, yyyy" : "MMM d, yyyy")}`
        : format(selectedDate, "EEEE, MMMM d, yyyy");

  const navigate = (dir: number) => {
    if (viewMode === "day") setSelectedDate((d) => addDays(d, dir));
    else if (viewMode === "week") setSelectedDate((d) => addDays(d, dir * 7));
    else setSelectedDate((d) => (dir > 0 ? addMonths(d, 1) : subMonths(d, 1)));
  };

  const openNew = (date: Date, hour?: number) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const DEFAULT_DURATION = 30; // minutes

    let startMinutes: number;
    if (hour !== undefined) {
      const slotStart = hour * 60;
      const slotEnd = slotStart + 60;

      // Find events on this day that overlap the clicked hour slot
      const dayEvents = filteredEvents.filter((e) => e.date === dateStr && !e.allDay);
      let latestEnd = slotStart; // default: top of the hour

      for (const evt of dayEvents) {
        const evtStart = toMin(evt.startTime);
        const evtEnd = Math.max(evtStart + 15, toMin(evt.endTime));
        // Event overlaps this slot if it starts before slot ends AND ends after slot starts
        if (evtStart < slotEnd && evtEnd > slotStart) {
          latestEnd = Math.max(latestEnd, evtEnd);
        }
      }

      startMinutes = latestEnd;
    } else {
      startMinutes = 9 * 60; // 9:00 AM default
    }

    const endMinutes = Math.min(24 * 60 - 1, startMinutes + DEFAULT_DURATION);
    const startTime = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

    setModalState({
      mode: "new",
      draft: blankDraft({
        date: dateStr,
        endDate: dateStr,
        startTime,
        endTime,
      }),
    });
  };

  // Opens the new-event dialog pre-filled with an exact start/end time picked
  // via click-and-drag on the day/week grid (Google Calendar-style), instead
  // of openNew's fixed 30-minute default.
  const openNewRange = (date: Date, startMin: number, endMin: number) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const clampedStart = Math.max(0, Math.min(24 * 60 - MIN_EVENT_MIN, startMin));
    const clampedEnd = Math.max(clampedStart + MIN_EVENT_MIN, Math.min(24 * 60, endMin));
    const toHHMM = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

    setModalState({
      mode: "new",
      draft: blankDraft({
        date: dateStr,
        endDate: dateStr,
        startTime: toHHMM(clampedStart),
        endTime: toHHMM(clampedEnd),
      }),
    });
  };

  const openEdit = (occ: Occurrence) => {
    const original = events.find((e) => e.id === occ.id);
    if (original) setModalState({ mode: "edit", draft: { ...original } });
  };

  const saveEvent = async (evt: CalendarEvent) => {
    try {
      const exists = events.some((e) => e.id === evt.id);
      const payload = { ...evt, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      let res: Response;
      if (exists && !evt.id.startsWith("evt_")) {
        res = await apiFetch(`/api/calendar-events/${evt.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch("/api/calendar-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const savedEvt = await res.json();
      if (!res.ok) {
        // Don't let a failed save corrupt local state with an error payload —
        // surface the real problem instead.
        throw new Error(savedEvt?.error || `Save failed (${res.status})`);
      }

      setEvents((prev) => {
        const next = exists ? prev.map((e) => (e.id === evt.id || e.id === savedEvt.id ? savedEvt : e)) : [...prev, savedEvt];
        return next;
      });
      // If the event's type happens to be unchecked in MY CALENDARS, auto-enable
      // it so a newly saved event doesn't silently vanish from every view.
      setActiveTypes((prev) => {
        if (prev.has(evt.calendarType)) return prev;
        const next = new Set(prev);
        next.add(evt.calendarType);
        persistActiveTypes(user?.id, next);
        return next;
      });
      setModalState(null);
      toast({ title: "Event saved", description: `"${savedEvt.title || "Untitled event"}" was saved to your calendar.` });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Failed to save event", description: err?.message, variant: "destructive" });
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      if (!id.startsWith("evt_")) {
        await apiFetch(`/api/calendar-events/${id}`, { method: "DELETE" });
      }
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setModalState(null);
      toast({ title: "Event deleted" });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to delete event", variant: "destructive" });
    }
  };

  // Guest RSVP — Accept / Decline / Propose a new time on an event you were invited to.
  const respondToEvent = async (
    id: string,
    status: "accepted" | "declined" | "proposed",
    proposal?: { proposedDate: string; proposedStartTime: string; proposedEndTime: string; proposedNote?: string }
  ) => {
    try {
      const res = await apiFetch(`/api/calendar-events/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...proposal }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Failed (${res.status})`);
      }
      setEvents((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
              ...e,
              responseStatus: status,
              proposedDate: proposal?.proposedDate ?? null,
              proposedStartTime: proposal?.proposedStartTime ?? null,
              proposedEndTime: proposal?.proposedEndTime ?? null,
              proposedNote: proposal?.proposedNote ?? null,
            }
            : e
        )
      );
      setModalState(null);
      toast({
        title: status === "accepted" ? "You accepted" : status === "declined" ? "You declined" : "New time proposed",
        description: "The organizer has been notified.",
      });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Failed to send your response", description: err?.message, variant: "destructive" });
    }
  };

  // Organizer accepts or declines a guest's proposed new time.
  const resolveProposal = async (eventId: string, guestEmail: string, action: "accept" | "decline") => {
    try {
      const res = await apiFetch(`/api/calendar-events/${eventId}/resolve-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestEmail, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      if (data.event) {
        setEvents((prev) => prev.map((e) => (e.id === eventId ? data.event : e)));
        setModalState((m) => (m && m.draft.id === eventId ? { ...m, draft: data.event } : m));
      } else {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === eventId
              ? { ...e, guests: e.guests.map((g) => (g.email.toLowerCase() === guestEmail.toLowerCase() ? { ...g, status: "needsAction", proposedDate: null, proposedStartTime: null, proposedEndTime: null, proposedNote: null } : g)) }
              : e
          )
        );
        setModalState((m) =>
          m && m.draft.id === eventId
            ? { ...m, draft: { ...m.draft, guests: m.draft.guests.map((g) => (g.email.toLowerCase() === guestEmail.toLowerCase() ? { ...g, status: "needsAction", proposedDate: null, proposedStartTime: null, proposedEndTime: null, proposedNote: null } : g)) } }
            : m
        );
      }
      toast({
        title: action === "accept" ? "Proposed time accepted" : "Proposal declined",
        description: action === "accept" ? "The event was moved and everyone was re-notified." : "The guest has been notified.",
      });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Failed to resolve proposal", description: err?.message, variant: "destructive" });
    }
  };

  const rescheduleToHour = async (eventId: string, dateStr: string, hour: number) => {
    const originalEvent = events.find(e => e.id === eventId);
    if (!originalEvent || originalEvent.allDay) return;

    const duration = Math.max(15, toMin(originalEvent.endTime) - toMin(originalEvent.startTime));
    const newStart = `${String(hour).padStart(2, "0")}:00`;
    const newEndMin = Math.min(23 * 60 + 59, hour * 60 + duration);
    const newEnd = `${String(Math.floor(newEndMin / 60)).padStart(2, "0")}:${String(newEndMin % 60).padStart(2, "0")}`;
    const deltaDays = differenceInCalendarDays(parseISO(dateStr), parseISO(originalEvent.date));
    const newEndDate = format(addDays(parseISO(originalEvent.endDate || originalEvent.date), deltaDays), "yyyy-MM-dd");

    const updatedEvent = { ...originalEvent, date: dateStr, endDate: newEndDate, startTime: newStart, endTime: newEnd, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };

    try {
      if (!eventId.startsWith("evt_")) {
        await apiFetch(`/api/calendar-events/${eventId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedEvent)
        });
      }
      setEvents((prev) => prev.map((e) => e.id === eventId ? updatedEvent : e));
      toast({ title: "Event moved" });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to move event", variant: "destructive" });
    }
  };

  const rescheduleToDay = async (eventId: string, dateStr: string) => {
    const originalEvent = events.find(e => e.id === eventId);
    if (!originalEvent) return;

    const deltaDays = differenceInCalendarDays(parseISO(dateStr), parseISO(originalEvent.date));
    const newEndDate = format(addDays(parseISO(originalEvent.endDate || originalEvent.date), deltaDays), "yyyy-MM-dd");
    const updatedEvent = { ...originalEvent, date: dateStr, endDate: newEndDate, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };

    try {
      if (!eventId.startsWith("evt_")) {
        await apiFetch(`/api/calendar-events/${eventId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedEvent)
        });
      }
      setEvents((prev) => prev.map((e) => e.id === eventId ? updatedEvent : e));
      toast({ title: "Event moved" });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to move event", variant: "destructive" });
    }
  };

  // Applied when the user drags an event's bottom edge in day/week view to
  // extend or shrink its duration. newEndMin is minutes-since-midnight.
  const resizeEvent = async (eventId: string, newEndMin: number) => {
    const originalEvent = events.find(e => e.id === eventId);
    if (!originalEvent || originalEvent.allDay) return;

    const startMin = toMin(originalEvent.startTime);
    const clampedEnd = Math.max(startMin + 15, Math.min(24 * 60 - 1, newEndMin));
    const newEnd = `${String(Math.floor(clampedEnd / 60)).padStart(2, "0")}:${String(clampedEnd % 60).padStart(2, "0")}`;
    const updatedEvent = { ...originalEvent, endTime: newEnd, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };

    try {
      if (!eventId.startsWith("evt_")) {
        await apiFetch(`/api/calendar-events/${eventId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedEvent)
        });
      }
      setEvents((prev) => prev.map((e) => e.id === eventId ? updatedEvent : e));
      toast({ title: "Event duration updated" });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to update duration", variant: "destructive" });
    }
  };

  const toggleType = (key: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistActiveTypes(user?.id, next);
      return next;
    });
  };

  const exportAll = () => {
    if (events.length === 0) {
      toast({ title: "Nothing to export", description: "Create an event first." });
      return;
    }
    downloadFile(`pms-calendar-${format(today, "yyyy-MM-dd")}.ics`, buildICS(events));
    toast({ title: "Calendar exported", description: "Import the .ics file into Google Calendar, Outlook, or Apple Calendar." });
  };

  // ── Google Calendar two-way sync ──────────────────────────────────────────
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email?: string; lastSyncedAt?: string | null } | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const refreshGoogleStatus = () => {
    apiFetch("/api/google/status", { bypassCache: true })
      .then((res) => res.json())
      .then((data) => setGoogleStatus(data))
      .catch((err) => console.error("Failed to load Google status:", err));
  };

  const reloadEvents = () => {
    apiFetch("/api/calendar-events", { bypassCache: true })
      .then((res) => res.json())
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to reload events:", err));
  };

  useEffect(() => {
    if (!user?.id) return;
    refreshGoogleStatus();

    // Handle the redirect back from /api/google/callback
    const params = new URLSearchParams(window.location.search);
    const googleParam = params.get("google");
    if (googleParam) {
      if (googleParam === "connected") {
        toast({ title: "Google Calendar connected", description: "Your events will now sync automatically." });
        reloadEvents();
        refreshGoogleStatus();
      } else if (googleParam === "denied") {
        toast({ title: "Connection cancelled", description: "You didn't grant access to Google Calendar." });
      } else if (googleParam === "error") {
        toast({ title: "Connection failed", description: "Something went wrong connecting Google Calendar.", variant: "destructive" });
      }
      // Clean the query param out of the URL
      params.delete("google");
      const newSearch = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const connectGoogle = () => {
    const token = localStorage.getItem("knockturn_token") || "";
    // Full-page navigation so Google's consent screen can load —
    // token is passed as a query param since headers can't attach here.
    window.location.href = `/api/google/connect?token=${encodeURIComponent(token)}`;
  };

  const disconnectGoogleCalendar = async () => {
    setGoogleBusy(true);
    try {
      await apiFetch("/api/google/disconnect", { method: "POST" });
      setGoogleStatus({ connected: false });
      toast({ title: "Google Calendar disconnected" });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to disconnect", variant: "destructive" });
    } finally {
      setGoogleBusy(false);
    }
  };

  const syncGoogleNow = async (silent = false) => {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      const res = await apiFetch("/api/google/sync-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const data = await res.json();
      reloadEvents();

      if (!silent) {
        if (data.pullError || data.pushError) {
          console.error("Google sync errors:", { pullError: data.pullError, pushError: data.pushError });
          toast({
            title: "Sync had errors",
            description: (data.pullError || data.pushError || "").slice(0, 200),
            variant: "destructive",
          });
        } else {
          toast({
            title: "Synced",
            description: `Pulled ${data.synced ?? 0}, pushed ${data.pushed ?? 0} event(s).${data.failed ? ` ${data.failed} push(es) failed — check console.` : ""
              }`,
          });
        }
      }

      if (!data.pullError && !data.pushError) {
        setGoogleStatus(prev => prev ? { ...prev, lastSyncedAt: new Date().toISOString() } : prev);
      }
    } catch (err) {
      console.error(err);
      if (!silent) toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setGoogleBusy(false);
    }
  };

  useEffect(() => {
    if (!googleStatus?.connected) return;

    const intervalId = setInterval(() => {
      syncGoogleNow(true);
    }, 30000);

    return () => clearInterval(intervalId);
  }, [googleStatus?.connected, googleBusy]);

  return (
    <div
      className="flex h-[calc(100vh-7.5rem)] min-h-[560px] border border-[#E2DFD6] rounded-xl bg-[#FAF9F6] overflow-hidden shadow-sm"
      style={{ ["--font-mono" as any]: "'IBM Plex Mono', ui-monospace, monospace" }}
    >
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="border-r border-[#E2DFD6] flex flex-col shrink-0 overflow-y-auto overflow-x-hidden bg-white"
          >
            <div className="w-64 p-3 space-y-1.5">
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={() => openNew(selectedDate, 9)}
                  className="w-full justify-start gap-2 rounded-lg shadow-sm bg-[#3C5A73] hover:bg-[#33506A] text-white border-0"
                >
                  <Plus className="h-4 w-4" /> Create event
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={() => openNewTask(selectedDate)}
                  variant="outline"
                  className="w-full justify-start gap-2 rounded-lg border-[#E2DFD6] hover:border-[#0E8A7D] hover:text-[#0E8A7D]"
                >
                  <ListChecks className="h-4 w-4" /> Add task
                </Button>
              </motion.div>
            </div>

            <div className="w-64">
              <MiniCalendar value={selectedDate} onChange={setSelectedDate} />
            </div>

            <div className="w-64 px-3 py-2">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search events…"
                className="h-8 rounded-lg text-xs border-[#E2DFD6]"
              />
            </div>

            <div className="w-64 px-3 py-3 border-t border-[#E2DFD6] mt-1">
              <div className="text-[10px] font-display font-semibold text-muted-foreground tracking-[0.12em] mb-2">MY CALENDARS</div>
              {CALENDAR_TYPES.map((t) => (
                <label key={t.key} className="flex items-center gap-2 py-1 text-xs cursor-pointer group">
                  <Checkbox
                    checked={activeTypes.has(t.key)}
                    onCheckedChange={() => toggleType(t.key)}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-[3px] shrink-0 transition-transform group-hover:scale-125"
                    style={{ background: t.color }}
                  />
                  <span className="group-hover:text-foreground transition-colors">{t.label}</span>
                </label>
              ))}
            </div>

            <div className="w-64 px-3 py-3 border-t border-[#E2DFD6] mt-1">
              <div className="text-[10px] font-display font-semibold text-muted-foreground tracking-[0.12em] mb-2">GOOGLE CALENDAR</div>

              {googleStatus === null ? (
                <p className="text-[11px] text-muted-foreground">Checking connection…</p>
              ) : googleStatus.connected ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Synced with <span className="font-medium text-foreground">{googleStatus.email}</span>. New events
                    push to Google automatically, and Google events pull in when you sync.
                    {googleStatus.lastSyncedAt && (
                      <span className="block mt-1 text-[#3C5A73] font-medium">Last synced {formatDistanceToNow(new Date(googleStatus.lastSyncedAt))} ago</span>
                    )}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-2 text-xs border-[#E2DFD6] hover:bg-[#3C5A73]/5 hover:text-[#3C5A73]"
                    onClick={() => syncGoogleNow(false)}
                    disabled={googleBusy}
                  >
                    {googleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    {googleBusy ? "Syncing..." : "Sync now"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full gap-2 text-xs text-muted-foreground"
                    onClick={disconnectGoogleCalendar}
                    disabled={googleBusy}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground leading-snug mb-1">
                    Connect your Google account to automatically sync events both ways.
                  </p>
                  <Button size="sm" className="w-full gap-2 text-xs bg-[#3C5A73] hover:bg-[#33506A] text-white" onClick={connectGoogle}>
                    <ExternalLink className="h-3.5 w-3.5" /> Connect Google Calendar
                  </Button>
                </div>
              )}

              <Button size="sm" variant="outline" className="w-full gap-2 text-xs mt-2 border-[#E2DFD6]" onClick={exportAll}>
                <Download className="h-3.5 w-3.5" /> Export all events (.ics)
              </Button>
            </div>

            <div className="w-64 px-3 py-3 border-t border-[#E2DFD6] mt-1 pb-4">
              <div className="text-[10px] font-display font-semibold text-muted-foreground tracking-[0.12em] mb-2">UPCOMING</div>
              {upcoming.length === 0 && (
                <p className="text-xs text-muted-foreground">No upcoming events.</p>
              )}
              <AnimatePresence mode="popLayout">
                {upcoming.map((evt, i) => (
                  <motion.div
                    key={`${evt.id}-${evt.occurrenceDate}`}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.18, delay: i * 0.03 }}
                    onClick={() => openEdit(evt)}
                    className="py-1.5 pl-2 border-l-2 mb-1.5 cursor-pointer rounded-r-md hover:bg-muted/50 transition-colors"
                    style={{ borderLeftColor: eventHex(evt) }}
                  >
                    <span className="text-xs font-medium truncate block">{evt.title || "Untitled event"}</span>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      {format(parseISO(evt.occurrenceDate), "MMM d")}
                      {!evt.allDay && ` · ${evt.startTime}–${evt.endTime}`}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Top bar */}
        <div className="flex items-center h-14 px-4 border-b border-[#E2DFD6] gap-2 shrink-0">
          <button onClick={() => setSidebarOpen((o) => !o)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-lg font-display font-semibold tracking-tight ml-1 hidden sm:inline text-[#14151A]">Calendar</span>
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button variant="outline" size="sm" className="ml-3 h-8 border-[#E2DFD6]" onClick={() => setSelectedDate(today)}>
              Today
            </Button>
          </motion.div>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => navigate(-1)}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => navigate(1)}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </motion.button>
          <AnimatePresence mode="wait">
            <motion.h2
              key={headerLabel}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="text-base font-medium flex-1 truncate text-[#14151A]"
            >
              {headerLabel}
            </motion.h2>
          </AnimatePresence>
          <div className="relative flex bg-[#F2F1EC] rounded-lg p-0.5 gap-0.5">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors z-10",
                  viewMode === mode ? "text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {viewMode === mode && (
                  <motion.div
                    layoutId="view-switcher-pill"
                    className="absolute inset-0 bg-[#3C5A73] rounded-md -z-10"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div ref={gridRef} className="flex-1 overflow-auto flex flex-col">
          {viewMode === "month" && (
            <div className="flex-1 flex flex-col">
              <div className="grid grid-cols-7 border-b border-[#E2DFD6] shrink-0 bg-[#FAF9F6]">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="py-1.5 text-center text-[10px] font-display font-semibold tracking-[0.1em] text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: "minmax(96px, 1fr)" }}>
                {monthDays.map((day) => {
                  const dayStr = format(day, "yyyy-MM-dd");
                  const dayOccs = occurrences
                    .filter((o) => o.occurrenceDate === dayStr)
                    .sort((a, b) => (a.allDay ? -1 : toMin(a.startTime) - toMin(b.startTime)));
                  const dayTasks = tasksByDate[dayStr] || [];
                  const inMonth = isSameMonth(day, selectedDate);
                  const isTod = isTodayFn(day);
                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => openNew(day, 9)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain");
                        if (id) rescheduleToDay(id, dayStr);
                      }}
                      className={cn(
                        "border border-[#E2DFD6]/70 p-1 overflow-hidden cursor-pointer transition-colors hover:bg-[#3C5A73]/[0.04]",
                        !inMonth && "bg-[#FAF9F6]/60"
                      )}
                    >
                      <div className="flex items-center justify-between mb-0.5 px-0.5 group/day">
                        <span className="w-4" />
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(day);
                            setViewMode("day");
                          }}
                          className={cn(
                            "w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono transition-transform hover:scale-110",
                            isTod && "bg-[#3C5A73] text-white font-semibold shadow-sm",
                            !isTod && inMonth && "text-foreground",
                            !isTod && !inMonth && "text-muted-foreground/40"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openNewTask(day);
                          }}
                          className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/0 group-hover/day:text-[#0E8A7D] hover:bg-[#0E8A7D]/10 transition-colors"
                          title="Add task"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      {dayTasks.slice(0, 2).map((t) => (
                        <TaskChip
                          key={t.id}
                          item={t}
                          compact
                          onToggle={() => toggleDayTask(t)}
                          onOpenTask={() => openTask(t)}
                          onDelete={() => deleteDayTask(t)}
                        />
                      ))}
                      {dayOccs.slice(0, 3).map((occ) => (
                        <EventChip
                          key={`${occ.id}-${occ.occurrenceDate}`}
                          occ={occ}
                          compact
                          onClick={() => openEdit(occ)}
                          draggable={!occ.isRecurring}
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", occ.id)}
                        />
                      ))}
                      {(dayOccs.length > 3 || dayTasks.length > 2) && (
                        <div className="text-[10px] font-medium text-[#3C5A73] pl-1.5">
                          +{Math.max(0, dayOccs.length - 3) + Math.max(0, dayTasks.length - 2)} more
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "week" && (
            <div className="flex-1 flex flex-col">
              {/* Day headers row (spans full width, above the hourly grid) */}
              <div className="flex shrink-0">
                <div className="w-12 shrink-0 bg-[#FAF9F6]/60 border-r border-[#E2DFD6]/70" />
                <div className="flex-1 flex h-6 border-b border-[#E2DFD6]">
                  {weekDays.map((day) => {
                    const isTod = isTodayFn(day);
                    return (
                      <div key={day.toISOString()} className="flex-1 flex items-center justify-center gap-1 border-l border-[#E2DFD6]/70">
                        <span className={cn("text-[10px] font-mono", isTod ? "text-[#3C5A73] font-semibold" : "text-muted-foreground")}>
                          {format(day, "EEE").toUpperCase()}
                        </span>
                        <span className={cn("text-xs", isTod && "text-[#3C5A73] font-semibold")}>{format(day, "d")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tasks band — also spans full width, sitting ABOVE the hourly
                  timeline (not inside any hour slot), Google-Calendar-style.
                  Because this row is its own flex row (not nested inside the
                  content column only), the hour gutter below stays aligned
                  with the actual hour rows no matter how tall this gets. */}
              {Object.keys(tasksByDate).length > 0 && (
                <div className="flex shrink-0">
                  <div className="w-12 shrink-0 bg-[#FAF9F6]/60 border-r border-[#E2DFD6]/70" />
                  <div className="flex-1 flex border-b border-[#E2DFD6]/70 bg-[#0E8A7D]/[0.03]">
                    {weekDays.map((day) => {
                      const dayStr = format(day, "yyyy-MM-dd");
                      const dayTasks = tasksByDate[dayStr] || [];
                      return (
                        <div key={day.toISOString()} className="flex-1 border-l border-[#E2DFD6]/70 px-1 py-1 min-w-0">
                          {dayTasks.map((t) => (
                            <TaskChip
                              key={t.id}
                              item={t}
                              compact
                              onToggle={() => toggleDayTask(t)}
                              onOpenTask={() => openTask(t)}
                              onDelete={() => deleteDayTask(t)}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Hourly timeline — gutter + day columns scroll and align together */}
              <div className="flex flex-1">
                <div className="w-12 shrink-0 bg-[#FAF9F6]/60 border-r border-[#E2DFD6]/70">
                  <div className="relative" style={{ height: HOURS.length * ROW_H }}>
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="absolute right-0 flex items-center gap-1"
                        style={{ top: h * ROW_H, transform: "translateY(-50%)" }}
                      >
                        <span className="text-[9px] font-mono text-muted-foreground/70">{fmtHour(h)}</span>
                        <span className="block w-1.5 h-px bg-[#E2DFD6]" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex min-w-0">
                  {weekDays.map((day) => {
                    const dayStr = format(day, "yyyy-MM-dd");
                    return (
                      <DayColumn
                        key={day.toISOString()}
                        dayStr={dayStr}
                        occurrences={occurrences.filter((o) => o.occurrenceDate === dayStr)}
                        onSlotClick={(hour) => openNew(day, hour)}
                        onRangeSelect={(startMin, endMin) => openNewRange(day, startMin, endMin)}
                        onEventClick={openEdit}
                        onDrop={(id, hour) => rescheduleToHour(id, dayStr, hour)}
                        onResize={resizeEvent}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {viewMode === "day" && (
            <div className="flex-1 flex flex-col">
              {/* Date header row (spans full width, above the hourly grid) */}
              <div className="flex shrink-0">
                <div className="w-12 shrink-0 bg-[#FAF9F6]/60 border-r border-[#E2DFD6]/70" />
                <div className="flex-1 h-8 border-b border-[#E2DFD6] flex items-center pl-3 gap-2">
                  <span className={cn("text-xs font-mono", isTodayFn(selectedDate) ? "text-[#3C5A73] font-semibold" : "text-muted-foreground")}>
                    {format(selectedDate, "EEE").toUpperCase()}
                  </span>
                  <span
                    className={cn(
                      "w-7 h-7 rounded-md flex items-center justify-center text-sm",
                      isTodayFn(selectedDate) && "bg-[#3C5A73] text-white font-semibold shadow-sm"
                    )}
                  >
                    {format(selectedDate, "d")}
                  </span>
                </div>
              </div>

              {/* Tasks band — also spans full width, sitting ABOVE the hourly
                  timeline (not inside any hour slot), Google-Calendar-style.
                  A separate flex row keeps the hour gutter below aligned with
                  the actual hour rows no matter how many tasks wrap here. */}
              {(() => {
                const dayStr = format(selectedDate, "yyyy-MM-dd");
                const dayTasks = tasksByDate[dayStr] || [];
                return (
                  <div className="flex shrink-0">
                    <div className="w-12 shrink-0 bg-[#FAF9F6]/60 border-r border-[#E2DFD6]/70" />
                    <div className="flex-1 border-b border-[#E2DFD6]/70 bg-[#0E8A7D]/[0.03] px-3 py-1.5 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-display font-semibold text-[#0E8A7D] tracking-[0.1em]">TASKS</span>
                        <button
                          type="button"
                          onClick={() => openNewTask(selectedDate)}
                          className="text-[10px] text-[#0E8A7D] hover:underline flex items-center gap-0.5"
                        >
                          <Plus className="h-3 w-3" /> Add task
                        </button>
                      </div>
                      {dayTasks.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No tasks due today.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {dayTasks.map((t) => (
                            <TaskChip
                              key={t.id}
                              item={t}
                              onToggle={() => toggleDayTask(t)}
                              onOpenTask={() => openTask(t)}
                              onDelete={() => deleteDayTask(t)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Hourly timeline — gutter + day column scroll and align together */}
              <div className="flex flex-1">
                <div className="w-12 shrink-0 bg-[#FAF9F6]/60 border-r border-[#E2DFD6]/70">
                  <div className="relative" style={{ height: HOURS.length * ROW_H }}>
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="absolute right-0 flex items-center gap-1"
                        style={{ top: h * ROW_H, transform: "translateY(-50%)" }}
                      >
                        <span className="text-[9px] font-mono text-muted-foreground/70">{fmtHour(h)}</span>
                        <span className="block w-1.5 h-px bg-[#E2DFD6]" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <DayColumn
                    dayStr={format(selectedDate, "yyyy-MM-dd")}
                    occurrences={occurrences}
                    onSlotClick={(hour) => openNew(selectedDate, hour)}
                    onRangeSelect={(startMin, endMin) => openNewRange(selectedDate, startMin, endMin)}
                    onEventClick={openEdit}
                    onDrop={(id, hour) => rescheduleToHour(id, format(selectedDate, "yyyy-MM-dd"), hour)}
                    onResize={resizeEvent}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {modalState && (
        <EventFormDialog
          key={modalState.draft.id}
          mode={modalState.mode}
          draft={modalState.draft}
          onClose={() => setModalState(null)}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onRespond={respondToEvent}
          onResolveProposal={resolveProposal}
        />
      )}

      {taskModal && (
        <QuickAddTaskDialog
          date={taskModal.date}
          onClose={() => setTaskModal(null)}
          onCreated={handleTaskCreated}
        />
      )}

      {taskDetail && (
        <TaskDetailDialog
          item={taskDetail}
          onClose={() => setTaskDetail(null)}
          onToggle={() => {
            if (taskDetail.kind !== "calendar") return;
            toggleCalendarTaskDone(taskDetail.data);
            setTaskDetail((t) => (t && t.kind === "calendar" ? { ...t, done: !t.done, data: { ...t.data, done: !t.data.done } } : t));
          }}
          onDelete={() => {
            if (taskDetail.kind !== "calendar") return;
            deleteCalendarTask(taskDetail.data);
            setTaskDetail(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Task detail dialog ─────────────────────────────────────────────────────
// Shows a task's details right inside the calendar — the Tasks page is a
// separate part of the app, so clicking a task on the calendar should never
// navigate away from it. Behavior depends on where the task came from:
//   - "calendar" tasks (added from this calendar) are fully editable here:
//     complete / delete, exactly like a Google Calendar Task.
//   - "project" tasks (real PMS tasks, shown for visibility) are read-only:
//     no complete/delete — that stays on the Tasks page, which owns them.

function TaskDetailDialog({
  item,
  onClose,
  onToggle,
  onDelete,
}: {
  item: DayTaskItem;
  onClose: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  if (item.kind === "project") {
    const task = item.data;
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md border-[#E2DFD6] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight flex items-start gap-2">
              <Briefcase className="h-5 w-5 shrink-0 mt-0.5 text-[#0E8A7D]/70" />
              <span>{task.taskName || "Untitled task"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-[11px] text-[#0E8A7D] bg-[#0E8A7D]/[0.06] rounded-md px-2 py-1.5">
              <Lock className="h-3 w-3 shrink-0" />
              <span>From the Tasks page — view only here. Edit or complete it on the Tasks page.</span>
            </div>
            {task.projectTitle && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Briefcase className="h-3.5 w-3.5 shrink-0" />
                <span>{task.projectTitle}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              <span>
                {task.startDate ? format(parseISO(task.startDate), "MMM d") : "—"}
                {" – "}
                {task.endDate ? format(parseISO(task.endDate), "MMM d, yyyy") : "—"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {task.priority && (
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {task.priority} priority
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] border-[#E2DFD6] capitalize">
                {task.status || "Pending"}
              </Badge>
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed pt-1 border-t border-[#E2DFD6]">
                {task.description}
              </p>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" className="border-[#E2DFD6]" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Calendar-only task — fully editable.
  const task = item.data;
  const done = task.done;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-[#E2DFD6] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight flex items-start gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="shrink-0 mt-0.5 text-[#0E8A7D]/80 hover:text-[#0E8A7D]"
              title={done ? "Mark task incomplete" : "Mark task complete"}
            >
              {done ? <CheckSquare2 className="h-5 w-5" /> : <Square className="h-5 w-5" />}
            </button>
            <span className={cn(done && "line-through text-muted-foreground")}>
              {task.title || "Untitled task"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span>
              {format(parseISO(task.date), "EEEE, MMM d, yyyy")}
              {!task.allDay && task.startTime && (
                <>
                  {" · "}
                  {task.startTime}
                  {task.endTime ? `–${task.endTime}` : ""}
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" /> Only me · calendar task (not on the Tasks page)
          </div>
          {task.notes && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed pt-1 border-t border-[#E2DFD6]">
              {task.notes}
            </p>
          )}
        </div>

        <DialogFooter className="mt-2 sm:justify-between">
          <Button variant="ghost" className="text-destructive gap-1.5 justify-self-start" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> Delete task
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="border-[#E2DFD6]" onClick={onClose}>
              Close
            </Button>
            <Button className="bg-[#3C5A73] hover:bg-[#33506A] text-white" onClick={onToggle}>
              {done ? "Mark incomplete" : "Mark completed"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quick-add task dialog ──────────────────────────────────────────────────
// A lightweight "Add task" flow in the spirit of Google Calendar's Tasks
// quick-add. This is entirely local to the calendar — it never calls
// /api/tasks, so it can never create, edit, or otherwise affect anything on
// the real Tasks page. Saved tasks live only in this browser's calendar
// task store (see loadCalendarTasks/persistCalendarTasks).

function QuickAddTaskDialog({
  date,
  onClose,
  onCreated,
}: {
  date: string;
  onClose: () => void;
  onCreated: (task: CalendarTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [taskDate, setTaskDate] = useState(date);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [notes, setNotes] = useState("");

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreated({
      id: uid(),
      title: title.trim(),
      date: taskDate,
      startTime: allDay ? "" : startTime,
      endTime: allDay ? "" : endTime,
      allDay,
      notes: notes.trim(),
      done: false,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-[#E2DFD6] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-[#0E8A7D]" /> Add task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">TITLE</Label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Send client update"
              className="h-9 text-sm mt-1"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">DATE</Label>
              <Input
                type="date"
                value={taskDate}
                onChange={(e) => setTaskDate(e.target.value)}
                className="h-9 text-sm mt-1"
              />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(Boolean(v))} />
                All day
              </label>
            </div>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">START TIME</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="h-9 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">END TIME</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-9 text-sm mt-1"
                />
              </div>
            </div>
          )}

          <div>
            <Label className="text-[11px] text-muted-foreground">DESCRIPTION</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a description (optional)"
              className="text-sm mt-1 min-h-[64px]"
            />
          </div>

          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" /> Calendar task — separate from the Tasks page, visible only to you.
          </p>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" className="border-[#E2DFD6]" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim()}
            className="bg-[#3C5A73] hover:bg-[#33506A] text-white"
          >
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Event form dialog ──────────────────────────────────────────────────────

function EventFormDialog({
  mode,
  draft,
  onClose,
  onSave,
  onDelete,
  onRespond,
  onResolveProposal,
}: {
  mode: "new" | "edit";
  draft: CalendarEvent;
  onClose: () => void;
  onSave: (evt: CalendarEvent) => void;
  onDelete: (id: string) => void;
  onRespond: (
    id: string,
    status: "accepted" | "declined" | "proposed",
    proposal?: { proposedDate: string; proposedStartTime: string; proposedEndTime: string; proposedNote?: string }
  ) => void;
  onResolveProposal: (eventId: string, guestEmail: string, action: "accept" | "decline") => void;
}) {
  const [form, setForm] = useState<CalendarEvent>(draft);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [guestPopoverOpen, setGuestPopoverOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeDate, setProposeDate] = useState(draft.date);
  const [proposeStart, setProposeStart] = useState(draft.startTime);
  const [proposeEnd, setProposeEnd] = useState(draft.endTime);
  const [proposeNote, setProposeNote] = useState("");

  const update = (patch: Partial<CalendarEvent>) => setForm((f) => ({ ...f, ...patch }));

  // Load projects + employees once
  useEffect(() => {
    let mounted = true;
    setLoadingProjects(true);
    apiFetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setProjects(list.map((p: any) => ({ id: p.id, title: p.title || p.projectCode || "Untitled project" })));
      })
      .catch(() => mounted && setProjects([]))
      .finally(() => mounted && setLoadingProjects(false));

    apiFetch("/api/employees")
      .then((r) => r.json())
      .then((data) => mounted && setEmployees(Array.isArray(data) ? data : []))
      .catch(() => mounted && setEmployees([]));

    return () => {
      mounted = false;
    };
  }, []);

  // Load tasks whenever the selected project changes
  useEffect(() => {
    if (!form.projectId) {
      setTasks([]);
      return;
    }
    let mounted = true;
    setLoadingTasks(true);
    apiFetch(`/api/tasks/${form.projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setTasks(list.map((t: any) => ({ id: t.id, taskName: t.taskName || "Untitled task" })));
      })
      .catch(() => mounted && setTasks([]))
      .finally(() => mounted && setLoadingTasks(false));

    return () => {
      mounted = false;
    };
  }, [form.projectId]);

  const dur = Math.max(0, toMin(form.endTime) - toMin(form.startTime));

  const addGuest = (guest: Guest) => {
    if (form.guests.some((g) => g.email.toLowerCase() === guest.email.toLowerCase())) return;
    update({ guests: [...form.guests, guest] });
  };

  const removeGuest = (id: string) => update({ guests: form.guests.filter((g) => g.id !== id) });

  const toggleOptional = (id: string) =>
    update({ guests: form.guests.map((g) => (g.id === id ? { ...g, optional: !g.optional } : g)) });

  const addExternalEmail = () => {
    const email = externalEmail.trim();
    if (!EMAIL_RE.test(email)) return;
    addGuest({ id: guestUid(), name: email, email, isExternal: true, optional: false });
    setExternalEmail("");
  };

  const toggleReminder = (value: number) => {
    update({
      reminders: form.reminders.includes(value)
        ? form.reminders.filter((r) => r !== value)
        : [...form.reminders, value].sort((a, b) => a - b),
    });
  };

  const handleSave = () => {
    if (!form.title.trim()) return;
    const project = projects.find((p) => p.id === form.projectId);
    const task = tasks.find((t) => t.id === form.taskId);
    onSave({
      ...form,
      title: form.title.trim(),
      endDate: form.endDate || form.date,
      projectTitle: project?.title || "",
      taskTitle: task?.taskName || "",
    });
  };

  const availableEmployees = employees.filter(
    (e) =>
      !form.guests.some((g) => g.email.toLowerCase() === (e.email || "").toLowerCase()) &&
      (e.name || "").toLowerCase().includes(guestSearch.toLowerCase())
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border-[#E2DFD6] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight">{mode === "edit" ? "Edit event" : "New event"}</DialogTitle>
          {form.isOrganizer === false && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[8px] bg-[#3C5A73]/10 text-[#3C5A73] font-semibold">
                  {initials(form.organizerName || "?")}
                </AvatarFallback>
              </Avatar>
              Invited by {form.organizerName || "another team member"}
              {form.organizerEmail ? ` (${form.organizerEmail})` : ""}
            </p>
          )}
        </DialogHeader>

        {mode === "edit" && form.isOrganizer === false && (
          <div className="rounded-xl border border-[#E2DFD6] bg-[#FAFAF7] px-4 py-3 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Your response:</span>
                {form.responseStatus === "accepted" && (
                  <Badge className="bg-green-600/10 text-green-700 border-green-600/20 gap-1"><Check className="h-3 w-3" /> Accepted</Badge>
                )}
                {form.responseStatus === "declined" && (
                  <Badge className="bg-red-600/10 text-red-700 border-red-600/20 gap-1"><X className="h-3 w-3" /> Declined</Badge>
                )}
                {form.responseStatus === "proposed" && (
                  <Badge className="bg-amber-600/10 text-amber-700 border-amber-600/20 gap-1"><Clock className="h-3 w-3" /> Proposed new time</Badge>
                )}
                {(!form.responseStatus || form.responseStatus === "needsAction") && (
                  <Badge variant="outline" className="text-muted-foreground gap-1">Awaiting your response</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1 border-green-600/30 text-green-700 hover:bg-green-600/10" onClick={() => onRespond(form.id, "accepted")}>
                  <Check className="h-3.5 w-3.5" /> Accept
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-600/30 text-red-700 hover:bg-red-600/10" onClick={() => onRespond(form.id, "declined")}>
                  <X className="h-3.5 w-3.5" /> Decline
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1 border-[#E2DFD6]" onClick={() => setProposeOpen((v) => !v)}>
                  <CalendarClock className="h-3.5 w-3.5" /> Propose new time
                </Button>
              </div>
            </div>

            {form.responseStatus === "proposed" && form.proposedDate && (
              <p className="text-[11px] text-amber-700">
                You proposed {form.proposedDate} · {form.proposedStartTime}–{form.proposedEndTime}
                {form.proposedNote ? ` — "${form.proposedNote}"` : ""}. Waiting on the organizer.
              </p>
            )}

            {proposeOpen && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#E2DFD6]/70">
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-[10px] text-muted-foreground">Date</Label>
                  <Input type="date" value={proposeDate} onChange={(e) => setProposeDate(e.target.value)} className="h-8 text-xs border-[#E2DFD6]" />
                </div>
                <div className="flex gap-2 col-span-2 sm:col-span-1">
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground">Start</Label>
                    <Input type="time" value={proposeStart} onChange={(e) => setProposeStart(e.target.value)} className="h-8 text-xs border-[#E2DFD6]" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground">End</Label>
                    <Input type="time" value={proposeEnd} onChange={(e) => setProposeEnd(e.target.value)} className="h-8 text-xs border-[#E2DFD6]" />
                  </div>
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Note (optional)</Label>
                  <Input value={proposeNote} onChange={(e) => setProposeNote(e.target.value)} placeholder="Why the new time works better…" className="h-8 text-xs border-[#E2DFD6]" />
                </div>
                <div className="col-span-2 flex justify-end gap-1.5 pt-1">
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setProposeOpen(false)}>Cancel</Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs bg-[#3C5A73] hover:bg-[#2f4a5f]"
                    onClick={() => {
                      onRespond(form.id, "proposed", { proposedDate: proposeDate, proposedStartTime: proposeStart, proposedEndTime: proposeEnd, proposedNote: proposeNote.trim() || undefined });
                      setProposeOpen(false);
                    }}
                  >
                    Send proposal
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <Input
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Add title"
            className="text-lg font-medium h-11 border-[#E2DFD6] focus-visible:ring-[#3C5A73]"
            autoFocus
          />

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                value={form.calendarType}
                onValueChange={(v) => update({ calendarType: v, colorKey: DEFAULT_COLOR_BY_TYPE[v] || form.colorKey })}
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALENDAR_TYPES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground mr-1">Color</Label>
              {Object.entries(EVENT_COLORS).map(([key, c]) => (
                <motion.button
                  key={key}
                  type="button"
                  title={c.label}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => update({ colorKey: key })}
                  className="relative h-5 w-5 rounded-[6px]"
                  style={{ background: c.hex }}
                >
                  {form.colorKey === key && (
                    <motion.div
                      layoutId="color-swatch-ring"
                      className="absolute -inset-[3px] rounded-[8px] ring-2 ring-offset-1"
                      style={{ ["--tw-ring-color" as any]: c.hex }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </motion.button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs ml-auto">
              <Switch checked={form.allDay} onCheckedChange={(v) => update({ allDay: v })} />
              All day
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Start date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => {
                  const v = e.target.value;
                  update({ date: v, endDate: form.endDate < v ? v : form.endDate });
                }}
                className="h-9 text-sm"
              />
            </div>
            {!form.allDay && (
              <div>
                <Label className="text-[11px] text-muted-foreground">Start time</Label>
                <Input type="time" value={form.startTime} onChange={(e) => update({ startTime: e.target.value })} className="h-9 text-sm" />
              </div>
            )}
            <div>
              <Label className="text-[11px] text-muted-foreground">End date</Label>
              <Input
                type="date"
                min={form.date}
                value={form.endDate}
                onChange={(e) => update({ endDate: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            {!form.allDay && (
              <div>
                <Label className="text-[11px] text-muted-foreground">End time</Label>
                <Input type="time" value={form.endTime} onChange={(e) => update({ endTime: e.target.value })} className="h-9 text-sm" />
              </div>
            )}
          </div>
          {!form.allDay && dur > 0 && (
            <div className="text-[11px] text-muted-foreground -mt-2">
              Duration: {Math.floor(dur / 60) > 0 ? `${Math.floor(dur / 60)}h ` : ""}
              {dur % 60 > 0 ? `${dur % 60}m` : ""}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-16 shrink-0">Repeat</Label>
            <Select
              value={form.repeat}
              onValueChange={(v) => update({
                repeat: v as RepeatRule,
                ...(v === "none" ? { repeatUntil: null } : {}),
                ...(v === "custom" ? {
                  customRepeatInterval: Math.max(1, form.customRepeatInterval || 1),
                  customRepeatUnit: form.customRepeatUnit || "weekly",
                } : {}),
              })}
            >
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPEAT_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.repeat === "custom" && (
            <div className="flex items-center gap-2 -mt-1">
              <Label className="text-xs text-muted-foreground w-16 shrink-0">Every</Label>
              <Input
                type="number"
                min={1}
                max={99}
                value={form.customRepeatInterval || 1}
                onChange={(e) => update({ customRepeatInterval: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
                className="h-8 w-16 text-xs"
              />
              <Select
                value={form.customRepeatUnit || "weekly"}
                onValueChange={(v) => update({ customRepeatUnit: v as CustomRepeatUnit })}
              >
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">day(s)</SelectItem>
                  <SelectItem value="weekly">week(s)</SelectItem>
                  <SelectItem value="monthly">month(s)</SelectItem>
                  <SelectItem value="yearly">year(s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {form.repeat !== "none" && (
            <div className="flex items-center gap-2 -mt-1">
              <Label className="text-xs text-muted-foreground w-16 shrink-0">Ends</Label>
              <Select
                value={form.repeatUntil ? "on_date" : "never"}
                onValueChange={(v) =>
                  update({ repeatUntil: v === "never" ? null : (form.repeatUntil || form.date) })
                }
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="on_date">On date</SelectItem>
                </SelectContent>
              </Select>
              {form.repeatUntil && (
                <Input
                  type="date"
                  value={form.repeatUntil}
                  min={form.date}
                  onChange={(e) => update({ repeatUntil: e.target.value })}
                  className="h-8 w-40 text-xs"
                />
              )}
            </div>
          )}

          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                value={form.location}
                onChange={(e) => update({ location: e.target.value })}
                placeholder="Add location"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                value={form.videoLink}
                onChange={(e) => update({ videoLink: e.target.value })}
                placeholder="Add video conferencing link (Meet, Zoom, Teams…)"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 pt-2">
            {/* Left column */}
            <div className="space-y-4">
              <div>
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
                  <Briefcase className="h-3 w-3" /> PROJECT
                </Label>
                <Select
                  value={form.projectId || "__none"}
                  onValueChange={(v) => update({ projectId: v === "__none" ? "" : v, taskId: "", taskTitle: "" })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={loadingProjects ? "Loading…" : "Link a project (optional)"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <div className="p-2 sticky top-0 bg-background z-10 border-b mb-1">
                      <Input
                        placeholder="Search project..."
                        className="h-8 text-xs"
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <SelectItem value="__none">No project</SelectItem>
                    {projects
                      .filter((p) => p.title.toLowerCase().includes(projectSearch.toLowerCase()))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
                  <ListTodo className="h-3 w-3" /> TASK
                </Label>
                <Select
                  value={form.taskId || "__none"}
                  onValueChange={(v) => {
                    const selectedTask = tasks.find((t) => t.id === v);
                    const updates: Partial<CalendarEvent> = {
                      taskId: v === "__none" ? "" : v,
                      taskTitle: selectedTask?.taskName || ""
                    };
                    const prevTask = tasks.find((t) => t.id === form.taskId);
                    if (!form.title || (prevTask && form.title === prevTask.taskName)) {
                      updates.title = selectedTask?.taskName || "";
                    }
                    update(updates);
                  }}
                  disabled={!form.projectId}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue
                      placeholder={!form.projectId ? "Choose a project first" : loadingTasks ? "Loading…" : "Link a task (optional)"}
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <div className="p-2 sticky top-0 bg-background z-10 border-b mb-1">
                      <Input
                        placeholder="Search task..."
                        className="h-8 text-xs"
                        value={taskSearch}
                        onChange={(e) => setTaskSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <SelectItem value="__none">No task</SelectItem>
                    {tasks
                      .filter((t) => t.taskName.toLowerCase().includes(taskSearch.toLowerCase()))
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.taskName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground mb-1 block">DESCRIPTION</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Add description"
                  rows={4}
                  className="text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">BUSY / FREE</Label>
                  <Select value={form.busy ? "busy" : "free"} onValueChange={(v) => update({ busy: v === "busy" })}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="busy">Busy</SelectItem>
                      <SelectItem value="free">Free</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">VISIBILITY</Label>
                  <Select value={form.visibility} onValueChange={(v) => update({ visibility: v as CalendarEvent["visibility"] })}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        <span className="flex items-center gap-1.5"><Globe className="h-3 w-3" /> Default</span>
                      </SelectItem>
                      <SelectItem value="public">
                        <span className="flex items-center gap-1.5"><Globe className="h-3 w-3" /> Public</span>
                      </SelectItem>
                      <SelectItem value="private">
                        <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> Private</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Right column: Guests + reminders */}
            <div className="space-y-4">
              <div>
                <Label className="text-[11px] text-muted-foreground mb-1 block flex items-center gap-1">
                  <Users className="h-3 w-3" /> GUESTS
                </Label>

                <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto pr-1" style={{ maxHeight: '160px', overflowY: 'auto', contain: 'paint' }}>
                  {form.guests.length === 0 && (
                    <p className="text-xs text-muted-foreground">No guests added yet.</p>
                  )}
                  <AnimatePresence initial={false}>
                    {form.guests.map((g, i) => (
                      <motion.div
                        key={g.id}
                        layout
                        initial={{ opacity: 0, scale: 0.85, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30, delay: i * 0.02 }}
                        className="flex items-center gap-2 rounded-md border border-[#E2DFD6] px-2 py-1.5"
                      >
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarFallback
                            className="text-[10px] font-semibold"
                            style={{ background: hexToRgba("#3C5A73", 0.12), color: "#3C5A73" }}
                          >
                            {initials(g.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">{g.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{g.email}</div>
                          {g.status === "proposed" && g.proposedDate && (
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] text-amber-700">
                                Proposed {g.proposedDate} · {g.proposedStartTime}–{g.proposedEndTime}
                              </span>
                              {mode === "edit" && form.isOrganizer !== false && (
                                <>
                                  <button type="button" className="text-[9px] font-semibold text-green-700 hover:underline" onClick={() => onResolveProposal(form.id, g.email, "accept")}>
                                    Accept
                                  </button>
                                  <button type="button" className="text-[9px] font-semibold text-red-700 hover:underline" onClick={() => onResolveProposal(form.id, g.email, "decline")}>
                                    Decline
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        {g.status === "accepted" && (
                          <Badge className="text-[9px] px-1 py-0 h-4 bg-green-600/10 text-green-700 border-green-600/20 gap-0.5"><Check className="h-2.5 w-2.5" />Accepted</Badge>
                        )}
                        {g.status === "declined" && (
                          <Badge className="text-[9px] px-1 py-0 h-4 bg-red-600/10 text-red-700 border-red-600/20 gap-0.5"><X className="h-2.5 w-2.5" />Declined</Badge>
                        )}
                        {g.status === "proposed" && (
                          <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-600/10 text-amber-700 border-amber-600/20 gap-0.5"><Clock className="h-2.5 w-2.5" />Proposed</Badge>
                        )}
                        {g.isExternal && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-[#E2DFD6]">external</Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleOptional(g.id)}
                          className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                          title="Toggle required / optional"
                        >
                          {g.optional ? "Optional" : "Required"}
                        </button>
                        <button type="button" onClick={() => removeGuest(g.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <Popover open={guestPopoverOpen} onOpenChange={setGuestPopoverOpen}>
                  <PopoverTrigger asChild>
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 text-xs border-[#E2DFD6] border-dashed hover:border-[#3C5A73] hover:text-[#3C5A73]">
                        <UserPlus className="h-3.5 w-3.5" /> Add guests
                      </Button>
                    </motion.div>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                    <Command>
                      <CommandInput placeholder="Search team members…" value={guestSearch} onValueChange={setGuestSearch} />
                      <CommandList className="max-h-[200px] overflow-y-auto" style={{ maxHeight: '200px', overflowY: 'auto' }} onWheel={(e) => e.stopPropagation()}>
                        <CommandEmpty>No matching team members.</CommandEmpty>
                        <CommandGroup heading="Team">
                          {availableEmployees.slice(0, 30).map((emp) => (
                            <CommandItem
                              key={emp.id}
                              value={emp.name}
                              onSelect={() => {
                                addGuest({
                                  id: guestUid(),
                                  name: emp.name,
                                  email: emp.email || "",
                                  isExternal: false,
                                  optional: false,
                                });
                              }}
                              className="gap-2"
                            >
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="text-[9px] font-semibold" style={{ background: hexToRgba("#3C5A73", 0.12), color: "#3C5A73" }}>
                                  {initials(emp.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="text-xs truncate">{emp.name}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{emp.designation || emp.department}</div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                    <div className="border-t p-2 flex gap-1.5">
                      <Input
                        value={externalEmail}
                        onChange={(e) => setExternalEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addExternalEmail()}
                        placeholder="Invite by email…"
                        className="h-8 text-xs"
                      />
                      <Button type="button" size="sm" className="h-8 px-2" onClick={addExternalEmail} disabled={!EMAIL_RE.test(externalEmail.trim())}>
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="mt-3 space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">GUEST PERMISSIONS</Label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={form.guestsCanModify} onCheckedChange={(v) => update({ guestsCanModify: Boolean(v) })} />
                    Modify event
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={form.guestsCanInvite} onCheckedChange={(v) => update({ guestsCanInvite: Boolean(v) })} />
                    Invite others
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={form.guestsCanSeeGuestList} onCheckedChange={(v) => update({ guestsCanSeeGuestList: Boolean(v) })} />
                    See guest list
                  </label>
                </div>
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
                  <Bell className="h-3 w-3" /> NOTIFICATIONS
                </Label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {form.reminders.map((r) => (
                    <Badge key={r} variant="secondary" className="text-[10px] gap-1">
                      {REMINDER_OPTIONS.find((o) => o.value === r)?.label || `${r} min before`}
                      <button onClick={() => toggleReminder(r)}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Select onValueChange={(v) => toggleReminder(Number(v))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Add a notification" />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.filter((o) => !form.reminders.includes(o.value)).map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {mode === "edit" && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs border-[#E2DFD6]">
                <a href={buildGoogleCalendarUrl(form)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Add to Google Calendar
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs border-[#E2DFD6]"
                onClick={() => downloadFile(`${(form.title || "event").replace(/\s+/g, "-")}.ics`, buildICS([form]))}
              >
                <Download className="h-3.5 w-3.5" /> Download .ics
              </Button>
            </div>
          )}
        </motion.div>

        <DialogFooter className="mt-2 sm:justify-between">
          {mode === "edit" ? (
            <Button variant="ghost" className="text-destructive gap-1.5 justify-self-start" onClick={() => onDelete(form.id)}>
              <Trash2 className="h-4 w-4" /> Delete event
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="border-[#E2DFD6]" onClick={onClose}>
              Cancel
            </Button>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Button
                onClick={handleSave}
                disabled={!form.title.trim()}
                className="bg-[#3C5A73] hover:bg-[#33506A] text-white"
              >
                Save
              </Button>
            </motion.div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}