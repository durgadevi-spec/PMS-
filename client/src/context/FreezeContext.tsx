import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";

/**
 * Global Project Freeze context.
 *
 * Lets a user "freeze" a single project as the active working context for
 * the whole app. While frozen, pages can read `frozenProjectId` and scope
 * their own data/queries to it, and default new Task/Key Step/etc creation
 * forms to that project. This is purely additive — it does not touch any
 * existing filter state, it just sits alongside it.
 *
 * Persisted to localStorage so it survives refreshes and stays active for
 * the whole session until the user explicitly clears it.
 */

const STORAGE_KEY = "pms_frozen_project";
const ITEM_STORAGE_KEY = "pms_frozen_item";

export interface FrozenProject {
    id: string | number;
    name: string;
}

/** A single, optional narrowing of the frozen project down to one particular
 * Key Step or Task within it. Purely additive on top of project-level freeze. */
export interface FrozenItem {
    id: string | number;
    name: string;
    type: "keystep" | "task";
}

interface FreezeContextValue {
    frozenProject: FrozenProject | null;
    frozenProjectId: string | number | null;
    isFrozen: boolean;
    freezeProject: (project: FrozenProject) => void;
    clearFreeze: () => void;
    /** Given a list of items with a projectId field, returns only the ones
     * belonging to the frozen project. If nothing is frozen, returns the
     * list untouched. Purely a convenience helper — using it is optional. */
    applyFreezeFilter: <T extends Record<string, any>>(
        items: T[],
        projectIdKey?: string
    ) => T[];

    /** Optional narrower selection within the frozen project. */
    frozenItem: FrozenItem | null;
    frozenItemId: string | number | null;
    isItemFrozen: boolean;
    freezeItem: (item: FrozenItem) => void;
    clearFreezeItem: () => void;
}

const FreezeContext = createContext<FreezeContextValue | undefined>(undefined);

function readStoredFreeze(): FrozenProject | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id != null && parsed.name) return parsed;
        return null;
    } catch {
        return null;
    }
}

function readStoredFreezeItem(): FrozenItem | null {
    try {
        const raw = localStorage.getItem(ITEM_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id != null && parsed.name && parsed.type) return parsed;
        return null;
    } catch {
        return null;
    }
}

export function FreezeProvider({ children }: { children: ReactNode }) {
    const [frozenProject, setFrozenProject] = useState<FrozenProject | null>(() => readStoredFreeze());
    const [frozenItem, setFrozenItem] = useState<FrozenItem | null>(() => readStoredFreezeItem());

    // Keep other tabs/pages in sync if storage changes elsewhere.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) {
                setFrozenProject(readStoredFreeze());
            }
            if (e.key === ITEM_STORAGE_KEY) {
                setFrozenItem(readStoredFreezeItem());
            }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    const clearFreezeItem = useCallback(() => {
        setFrozenItem(null);
        try {
            localStorage.removeItem(ITEM_STORAGE_KEY);
        } catch {
            // ignore
        }
        window.dispatchEvent(new CustomEvent("pms-freeze-item-changed", { detail: null }));
    }, []);

    const freezeProject = useCallback((project: FrozenProject) => {
        setFrozenProject((prev) => {
            // Switching to a different project invalidates any Key Step/Task
            // that was narrowed down within the previous project.
            if (!prev || String(prev.id) !== String(project.id)) {
                setFrozenItem(null);
                try {
                    localStorage.removeItem(ITEM_STORAGE_KEY);
                } catch {
                    // ignore
                }
            }
            return project;
        });
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
        } catch {
            // ignore quota / private-mode errors, in-memory state still works
        }
        window.dispatchEvent(new CustomEvent("pms-freeze-changed", { detail: project }));
    }, []);

    const clearFreeze = useCallback(() => {
        setFrozenProject(null);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
        window.dispatchEvent(new CustomEvent("pms-freeze-changed", { detail: null }));
        // Clearing the project also clears any Key Step/Task narrowed within it.
        clearFreezeItem();
    }, [clearFreezeItem]);

    const freezeItem = useCallback((item: FrozenItem) => {
        setFrozenItem(item);
        try {
            localStorage.setItem(ITEM_STORAGE_KEY, JSON.stringify(item));
        } catch {
            // ignore
        }
        window.dispatchEvent(new CustomEvent("pms-freeze-item-changed", { detail: item }));
    }, []);

    const applyFreezeFilter = useCallback(
        <T extends Record<string, any>>(items: T[], projectIdKey: string = "projectId"): T[] => {
            if (!frozenProject || !Array.isArray(items)) return items;
            return items.filter((item) => String(item?.[projectIdKey]) === String(frozenProject.id));
        },
        [frozenProject]
    );

    const value = useMemo<FreezeContextValue>(
        () => ({
            frozenProject,
            frozenProjectId: frozenProject?.id ?? null,
            isFrozen: !!frozenProject,
            freezeProject,
            clearFreeze,
            applyFreezeFilter,
            frozenItem,
            frozenItemId: frozenItem?.id ?? null,
            isItemFrozen: !!frozenItem,
            freezeItem,
            clearFreezeItem,
        }),
        [frozenProject, freezeProject, clearFreeze, applyFreezeFilter, frozenItem, freezeItem, clearFreezeItem]
    );

    return <FreezeContext.Provider value={value}>{children}</FreezeContext.Provider>;
}

export function useFreeze() {
    const ctx = useContext(FreezeContext);
    if (!ctx) {
        throw new Error("useFreeze must be used within a FreezeProvider");
    }
    return ctx;
}