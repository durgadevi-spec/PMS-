// server/dependencyService.ts
//
// Task Dependency & Automatic Schedule Management
// -------------------------------------------------
// Self-contained module. Nothing here is imported by any existing route
// unless explicitly wired in, so it cannot change behavior for projects/
// tasks that don't use dependencies.

import { db } from "./db.ts";
import { eq, and, or, inArray } from "drizzle-orm";
import {
    projectTasks,
    taskDependencies,
    taskScheduleHistory,
    type ProjectTask,
} from "../shared/schema.ts";

export type DependencyType = "FS" | "SS" | "FF" | "SF";
export const DEPENDENCY_TYPES: DependencyType[] = ["FS", "SS", "FF", "SF"];

export type ChangeType = "Manual" | "Dependency Cascade" | "System";

export class DependencyValidationError extends Error {
    code: string;
    constructor(message: string, code = "VALIDATION_ERROR") {
        super(message);
        this.code = code;
    }
}

/* -----------------------------------------------------------------
   Date helpers — all dates are stored/handled as "YYYY-MM-DD" strings
   to avoid timezone drift, matching the existing `date` columns.
------------------------------------------------------------------ */
const DAY_MS = 24 * 60 * 60 * 1000;

function toUTCDate(dateStr: string): Date {
    // Force midnight UTC so day-diff math is not affected by local TZ.
    return new Date(`${dateStr}T00:00:00.000Z`);
}

function toDateStr(d: Date): string {
    return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
    const d = toUTCDate(dateStr);
    d.setUTCDate(d.getUTCDate() + days);
    return toDateStr(d);
}

function diffDays(a: string, b: string): number {
    // a - b, in whole days
    return Math.round((toUTCDate(a).getTime() - toUTCDate(b).getTime()) / DAY_MS);
}

/** Inclusive day-count duration, e.g. 10 Jul -> 12 Jul = 3 days. Minimum 1. */
export function durationFromDates(startDate: string, endDate: string): number {
    return Math.max(1, diffDays(endDate, startDate) + 1);
}

/** Given a start date + inclusive duration (days), compute the end date. */
export function endDateFromDuration(startDate: string, durationDays: number): string {
    return addDays(startDate, Math.max(1, durationDays) - 1);
}

/* -----------------------------------------------------------------
   Dependency CRUD + validation
------------------------------------------------------------------ */

export interface AddDependencyInput {
    projectId: string;
    predecessorId: string;
    successorId: string;
    type: DependencyType;
    lagDays?: number;
    createdBy?: string | null;
}

export async function getProjectDependencyEdges(projectId: string) {
    return db.select().from(taskDependencies).where(eq(taskDependencies.projectId, projectId));
}

/** BFS check: would adding predecessor->successor create a cycle? */
function wouldCreateCycle(
    edges: { predecessorId: string; successorId: string }[],
    newPredecessorId: string,
    newSuccessorId: string
): boolean {
    // A cycle exists if, starting from `newSuccessorId`, we can already reach
    // `newPredecessorId` by following existing successor edges.
    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
        if (!adjacency.has(e.predecessorId)) adjacency.set(e.predecessorId, []);
        adjacency.get(e.predecessorId)!.push(e.successorId);
    }

    const visited = new Set<string>();
    const queue = [newSuccessorId];
    while (queue.length) {
        const current = queue.shift()!;
        if (current === newPredecessorId) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const next of adjacency.get(current) || []) {
            if (!visited.has(next)) queue.push(next);
        }
    }
    return false;
}

export async function validateAndAddDependency(input: AddDependencyInput) {
    const { projectId, predecessorId, successorId } = input;
    const type = input.type || "FS";
    const lagDays = input.lagDays ?? 0;

    if (predecessorId === successorId) {
        throw new DependencyValidationError("A task cannot depend on itself.", "SELF_DEPENDENCY");
    }
    if (!DEPENDENCY_TYPES.includes(type)) {
        throw new DependencyValidationError("Invalid dependency type.", "INVALID_TYPE");
    }

    const [predTask] = await db.select().from(projectTasks).where(eq(projectTasks.id, predecessorId));
    const [succTask] = await db.select().from(projectTasks).where(eq(projectTasks.id, successorId));
    if (!predTask || !succTask) {
        throw new DependencyValidationError("Both tasks must exist.", "NOT_FOUND");
    }
    if (predTask.projectId !== projectId || succTask.projectId !== projectId) {
        throw new DependencyValidationError("Both tasks must belong to the specified project.", "PROJECT_MISMATCH");
    }
    if (predTask.projectId !== succTask.projectId) {
        throw new DependencyValidationError("Cross-project dependencies are not allowed.", "CROSS_PROJECT");
    }

    const edges = await getProjectDependencyEdges(projectId);

    const isDuplicate = edges.some(
        (e) => e.predecessorId === predecessorId && e.successorId === successorId && e.type === type
    );
    if (isDuplicate) {
        throw new DependencyValidationError("This dependency already exists.", "DUPLICATE");
    }

    if (wouldCreateCycle(edges, predecessorId, successorId)) {
        throw new DependencyValidationError(
            "This dependency would create a circular reference.",
            "CIRCULAR_DEPENDENCY"
        );
    }

    const [created] = await db
        .insert(taskDependencies)
        .values({
            projectId,
            predecessorId,
            successorId,
            type,
            lagDays,
            createdBy: input.createdBy || null,
        })
        .returning();

    // Enforce the new constraint immediately
    const [pred] = await db.select().from(projectTasks).where(eq(projectTasks.id, predecessorId));
    const [succ] = await db.select().from(projectTasks).where(eq(projectTasks.id, successorId));

    if (pred && succ && pred.startDate && pred.endDate && succ.startDate && succ.endDate) {
        let requiredStart: string | undefined;
        let requiredEnd: string | undefined;
        const lag = lagDays || 0;

        switch (type as DependencyType) {
            case "FS":
                requiredStart = addDays(pred.endDate, 1 + lag);
                break;
            case "SS":
                requiredStart = addDays(pred.startDate, lag);
                break;
            case "FF":
                requiredEnd = addDays(pred.endDate, lag);
                break;
            case "SF":
                requiredEnd = addDays(pred.startDate, lag);
                break;
        }

        // "Continuous" link: predecessor's end date becomes the successor's
        // start date exactly. Unlike the other dependency types (which only
        // push the successor forward when the current date violates the
        // minimum gap), this one always snaps the successor to the exact
        // required date — even if that means pulling it earlier — because
        // the whole point is that the two dates stay glued together.
        const isContinuous = type === "FS" && lag === -1;

        let shift = 0;
        let changePayload: any = {};

        if (isContinuous && requiredStart) {
            shift = diffDays(requiredStart, succ.startDate);
            changePayload = { startDate: requiredStart };
        } else if (requiredStart && diffDays(requiredStart, succ.startDate) > 0) {
            shift = diffDays(requiredStart, succ.startDate);
            changePayload = { startDate: addDays(succ.startDate, shift) };
        } else if (requiredEnd && diffDays(requiredEnd, succ.endDate) > 0) {
            shift = diffDays(requiredEnd, succ.endDate);
            changePayload = { endDate: addDays(succ.endDate, shift) };
        }

        if (shift !== 0) {
            await applyScheduleChange(
                successorId,
                changePayload,
                {
                    changeType: "Dependency Cascade",
                    reason: "Enforcing newly created dependency",
                    changedBy: input.createdBy || null,
                    triggeredByTaskId: predecessorId,
                    shiftedByDays: shift,
                }
            );
        }
    }

    return created;
}

export async function removeDependency(dependencyId: string) {
    const [removed] = await db.delete(taskDependencies).where(eq(taskDependencies.id, dependencyId)).returning();
    return removed;
}

export async function updateDependency(dependencyId: string, changes: { type?: DependencyType; lagDays?: number }) {
    const updateData: any = {};
    if (changes.type) {
        if (!DEPENDENCY_TYPES.includes(changes.type)) {
            throw new DependencyValidationError("Invalid dependency type.", "INVALID_TYPE");
        }
        updateData.type = changes.type;
    }
    if (typeof changes.lagDays === "number") updateData.lagDays = changes.lagDays;
    if (Object.keys(updateData).length === 0) return undefined;

    const [updated] = await db
        .update(taskDependencies)
        .set(updateData)
        .where(eq(taskDependencies.id, dependencyId))
        .returning();
    return updated;
}

export async function getPredecessors(taskId: string) {
    return db
        .select({
            dependency: taskDependencies,
            task: projectTasks,
        })
        .from(taskDependencies)
        .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.predecessorId))
        .where(eq(taskDependencies.successorId, taskId));
}

export async function getSuccessors(taskId: string) {
    return db
        .select({
            dependency: taskDependencies,
            task: projectTasks,
        })
        .from(taskDependencies)
        .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.successorId))
        .where(eq(taskDependencies.predecessorId, taskId));
}

/* -----------------------------------------------------------------
   Schedule change + cascade engine
------------------------------------------------------------------ */

export interface ScheduleChangeMeta {
    reason?: string | null;
    changeType: ChangeType;
    changedBy?: string | null;
    triggeredByTaskId?: string | null;
    shiftedByDays?: number | null;
}

export interface ScheduleChangeInput {
    startDate?: string;
    endDate?: string;
    durationDays?: number;
}

/**
 * Applies a start/end/duration change to a single task, records history,
 * and (only for the originating manual/system change) cascades the
 * resulting shift to dependent downstream tasks. Only tasks actually
 * affected by the change are touched (BFS from the changed task).
 */
export async function applyScheduleChange(
    taskId: string,
    changes: ScheduleChangeInput,
    meta: ScheduleChangeMeta
) {
    const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, taskId));
    if (!task) throw new DependencyValidationError("Task not found.", "NOT_FOUND");

    if (meta.changeType === "Manual" && (!meta.reason || !meta.reason.trim())) {
        throw new DependencyValidationError(
            "A reason is required when manually changing a task's schedule.",
            "REASON_REQUIRED"
        );
    }

    const oldStart = task.startDate as string | null;
    const oldEnd = task.endDate as string | null;
    const oldDuration = task.durationDays ?? (oldStart && oldEnd ? durationFromDates(oldStart, oldEnd) : null);

    let newStart = changes.startDate ?? oldStart ?? undefined;
    let newEnd = changes.endDate ?? oldEnd ?? undefined;
    let newDuration = oldDuration ?? undefined;

    if (changes.durationDays) {
        newDuration = changes.durationDays;
        if (newStart) {
            // Duration changed explicitly -> recompute end date from it.
            newEnd = endDateFromDuration(newStart, newDuration);
        }
    } else if (changes.startDate && changes.endDate) {
        newDuration = durationFromDates(changes.startDate, changes.endDate);
    } else if (changes.startDate && !changes.endDate && oldDuration) {
        // Start moved but end wasn't given explicitly -> preserve duration.
        newEnd = endDateFromDuration(changes.startDate, oldDuration);
    } else if (changes.endDate && !changes.startDate && oldDuration) {
        newStart = addDays(changes.endDate, -(oldDuration - 1));
    }

    const noop =
        newStart === oldStart &&
        newEnd === oldEnd &&
        (newDuration ?? null) === (oldDuration ?? null);
    if (noop) return { task, historyEntry: null, cascaded: [] as any[] };

    const [updated] = await db
        .update(projectTasks)
        .set({
            startDate: newStart || null,
            endDate: newEnd || null,
            durationDays: newDuration ?? null,
            updatedAt: new Date(),
        } as any)
        .where(eq(projectTasks.id, taskId))
        .returning();

    const [historyEntry] = await db
        .insert(taskScheduleHistory)
        .values({
            taskId,
            projectId: task.projectId,
            previousStartDate: oldStart,
            newStartDate: newStart || null,
            previousEndDate: oldEnd,
            newEndDate: newEnd || null,
            previousDuration: oldDuration ?? null,
            newDuration: newDuration ?? null,
            reason:
                meta.changeType === "Manual"
                    ? meta.reason!.trim()
                    : meta.reason?.trim() || "Dependency Cascade",
            changeType: meta.changeType,
            triggeredByTaskId: meta.triggeredByTaskId || null,
            shiftedByDays: meta.shiftedByDays ?? null,
            changedBy: meta.changedBy || null,
        })
        .returning();

    // Compute how much the finish/start actually moved, then cascade only
    // to the tasks that depend on this one.
    const deltaStart = oldStart && newStart ? diffDays(newStart, oldStart) : 0;
    const deltaEnd = oldEnd && newEnd ? diffDays(newEnd, oldEnd) : 0;

    const cascaded: any[] = [];
    if (deltaStart !== 0 || deltaEnd !== 0) {
        await cascadeToSuccessors(taskId, deltaStart, deltaEnd, meta.changedBy || null, new Set([taskId]), cascaded);
    }

    return { task: updated, historyEntry, cascaded };
}

/**
 * Recursively (breadth-first, cycle-safe) shifts downstream tasks that
 * depend on `taskId`, based on how much its start/finish moved.
 */
async function cascadeToSuccessors(
    taskId: string,
    deltaStart: number,
    deltaEnd: number,
    changedBy: string | null,
    visited: Set<string>,
    results: any[]
) {
    const links = await getSuccessors(taskId);
    if (!links.length) return;

    for (const link of links) {
        const { dependency, task: successor } = link;
        if (visited.has(successor.id)) continue; // defensive cycle guard

        const lag = dependency.lagDays || 0;
        let shift = 0;
        switch (dependency.type as DependencyType) {
            case "FS": // successor start depends on predecessor finish
            case "FF": // successor finish depends on predecessor finish
                shift = deltaEnd;
                break;
            case "SS": // successor start depends on predecessor start
            case "SF": // successor finish depends on predecessor start
                shift = deltaStart;
                break;
        }
        if (lag) {
            // Lag itself doesn't change dynamically here; it's already baked
            // into the original schedule. Only propagate the actual shift.
        }
        if (shift === 0) continue;

        visited.add(successor.id);

        const oldStart = successor.startDate as string | null;
        const oldEnd = successor.endDate as string | null;
        if (!oldStart && !oldEnd) continue;

        const shiftedStart = oldStart ? addDays(oldStart, shift) : undefined;
        const shiftedEnd = oldEnd ? addDays(oldEnd, shift) : undefined;

        const { task: updatedSuccessor, historyEntry } = await applyScheduleChange(
            successor.id,
            { startDate: shiftedStart, endDate: shiftedEnd },
            {
                changeType: "Dependency Cascade",
                reason: "Dependency Cascade",
                changedBy,
                triggeredByTaskId: taskId,
                shiftedByDays: shift,
            }
        );

        results.push({ task: updatedSuccessor, historyEntry });

        // The recursive call inside applyScheduleChange already cascades
        // further downstream, so nothing more to do here.
    }
}

/**
 * Lightweight variant used by existing task update endpoints (PUT/PATCH
 * /api/tasks/:id) that already perform the actual date/duration column
 * update themselves. This only records the history row for the change
 * that already happened and cascades it to dependent successors.
 */
export async function recordManualChangeAndCascade(
    taskId: string,
    projectId: string,
    before: { startDate: string | null; endDate: string | null; duration: number | null },
    after: { startDate: string | null; endDate: string | null; duration: number | null },
    meta: { reason?: string | null; changedBy?: string | null; changeType?: ChangeType }
) {
    const noop =
        before.startDate === after.startDate &&
        before.endDate === after.endDate &&
        (before.duration ?? null) === (after.duration ?? null);
    if (noop) return { historyEntry: null, cascaded: [] as any[] };

    const changeType: ChangeType = meta.changeType || "Manual";
    if (changeType === "Manual" && (!meta.reason || !meta.reason.trim())) {
        throw new DependencyValidationError(
            "A reason is required when manually changing a task's schedule.",
            "REASON_REQUIRED"
        );
    }

    const [historyEntry] = await db
        .insert(taskScheduleHistory)
        .values({
            taskId,
            projectId,
            previousStartDate: before.startDate,
            newStartDate: after.startDate,
            previousEndDate: before.endDate,
            newEndDate: after.endDate,
            previousDuration: before.duration,
            newDuration: after.duration,
            reason: changeType === "Manual" ? meta.reason!.trim() : meta.reason?.trim() || "Dependency Cascade",
            changeType,
            changedBy: meta.changedBy || null,
        })
        .returning();

    const deltaStart = before.startDate && after.startDate ? diffDays(after.startDate, before.startDate) : 0;
    const deltaEnd = before.endDate && after.endDate ? diffDays(after.endDate, before.endDate) : 0;

    const cascaded: any[] = [];
    if (deltaStart !== 0 || deltaEnd !== 0) {
        await cascadeToSuccessors(taskId, deltaStart, deltaEnd, meta.changedBy || null, new Set([taskId]), cascaded);
    }

    return { historyEntry, cascaded };
}

/* -----------------------------------------------------------------
   History retrieval
------------------------------------------------------------------ */

export async function getTaskScheduleHistory(taskId: string) {
    const rows = await db
        .select()
        .from(taskScheduleHistory)
        .where(eq(taskScheduleHistory.taskId, taskId));
    return rows.sort((a, b) => (b.changedAt?.getTime?.() ?? 0) - (a.changedAt?.getTime?.() ?? 0));
}

export async function getProjectScheduleHistory(
    projectId: string,
    filters?: { taskId?: string; changedBy?: string; changeType?: string; from?: string; to?: string }
) {
    const rows = await db
        .select()
        .from(taskScheduleHistory)
        .where(eq(taskScheduleHistory.projectId, projectId));

    let filtered = rows;
    if (filters?.taskId) filtered = filtered.filter((r) => r.taskId === filters.taskId);
    if (filters?.changedBy) filtered = filtered.filter((r) => r.changedBy === filters.changedBy);
    if (filters?.changeType) filtered = filtered.filter((r) => r.changeType === filters.changeType);
    if (filters?.from) filtered = filtered.filter((r) => r.changedAt && r.changedAt >= new Date(filters.from!));
    if (filters?.to) filtered = filtered.filter((r) => r.changedAt && r.changedAt <= new Date(filters.to!));

    return filtered.sort((a, b) => (b.changedAt?.getTime?.() ?? 0) - (a.changedAt?.getTime?.() ?? 0));
}