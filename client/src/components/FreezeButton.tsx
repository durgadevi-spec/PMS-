import { useState, useEffect } from "react";
import { Snowflake, X, Check, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/apiClient";
import { useFreeze, FrozenItem } from "@/context/FreezeContext";
import { useToast } from "@/hooks/use-toast";

/**
 * Global "Freeze" control. Rendered once in the app Layout header, so it
 * shows up on every project-related page automatically without touching
 * any page-level filter code. Selecting a project here sets the app-wide
 * frozen project context (see FreezeContext); existing filters on each
 * page are completely untouched.
 *
 * Kept icon-only (no text label) to stay compact in the header. The
 * project/keystep/task name is available as a tooltip and inside the
 * dropdown itself.
 */
export default function FreezeButton() {
    const { frozenProject, isFrozen, freezeProject, clearFreeze } = useFreeze();

    return (
        <div className="flex items-center gap-1">
            <ProjectFreezeControl frozenProject={frozenProject} isFrozen={isFrozen} freezeProject={freezeProject} clearFreeze={clearFreeze} />
            {isFrozen && <ItemFreezeControl />}
        </div>
    );
}

function ProjectFreezeControl({ frozenProject, isFrozen, freezeProject, clearFreeze }: {
    frozenProject: ReturnType<typeof useFreeze>["frozenProject"];
    isFrozen: boolean;
    freezeProject: ReturnType<typeof useFreeze>["freezeProject"];
    clearFreeze: ReturnType<typeof useFreeze>["clearFreeze"];
}) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        apiFetch("/api/projects?status=all", { bypassCache: true })
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                const list = Array.isArray(data) ? data : data?.projects || [];
                setProjects(list);
            })
            .catch(() => setProjects([]))
            .finally(() => setLoading(false));
    }, [open]);

    const getProjectName = (p: any) => p?.title || p?.name || "Untitled Project";

    const filtered = projects.filter((p) =>
        getProjectName(p).toLowerCase().includes(search.toLowerCase())
    );

    const handleFreeze = (project: any) => {
        const projectName = getProjectName(project);
        freezeProject({ id: project.id, name: projectName });
        setOpen(false);
        toast({
            title: "Project Frozen",
            description: `"${projectName}" is now your active context across all pages.`,
        });
    };

    const handleClear = () => {
        clearFreeze();
        setOpen(false);
        toast({ title: "Freeze Cleared", description: "All pages have returned to normal view." });
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={isFrozen ? "default" : "ghost"}
                    size={isFrozen ? "sm" : "icon"}
                    className={isFrozen ? "relative gap-1.5 bg-sky-600 hover:bg-sky-700 text-white px-2" : "relative"}
                    data-testid="button-freeze"
                    title={isFrozen ? `Frozen: ${frozenProject?.name}` : "Freeze a project as your active context"}
                >
                    <Snowflake className={`h-4 w-4 ${isFrozen ? "" : "text-muted-foreground"}`} />
                    {isFrozen && (
                        <span className="max-w-[120px] truncate">{frozenProject?.name}</span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span>{isFrozen ? frozenProject?.name : "Freeze Project Context"}</span>
                    {isFrozen && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
                            onClick={handleClear}
                            data-testid="button-clear-freeze"
                        >
                            <X className="h-3 w-3 mr-1" /> Clear
                        </Button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                    <Input
                        placeholder="Search projects..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="h-8"
                        data-testid="input-freeze-search"
                        autoFocus
                    />
                </div>
                <div className="max-h-64 overflow-y-auto">
                    {loading && <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>}
                    {!loading && filtered.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No projects found</div>
                    )}
                    {!loading &&
                        filtered.map((p) => (
                            <DropdownMenuItem
                                key={p.id}
                                onClick={() => handleFreeze(p)}
                                className="flex items-center justify-between cursor-pointer"
                                data-testid={`option-freeze-${p.id}`}
                            >
                                <span className="truncate">{getProjectName(p)}</span>
                                {String(frozenProject?.id) === String(p.id) && <Check className="h-4 w-4 text-sky-600" />}
                            </DropdownMenuItem>
                        ))}
                </div>
                {isFrozen && (
                    <>
                        <DropdownMenuSeparator />
                        <p className="px-3 py-1.5 text-xs text-muted-foreground">
                            Every page now shows only "{frozenProject?.name}" data. New items default to this project.
                        </p>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * Second, small icon that only appears once a project is frozen. Lets the
 * user narrow the freeze down further to one particular Key Step or Task
 * inside that project. Purely additive — existing project-level freeze
 * behavior is untouched, this just layers an optional extra filter on top.
 */
function ItemFreezeControl() {
    const { frozenProjectId, frozenProject, frozenItem, isItemFrozen, freezeItem, clearFreezeItem } = useFreeze();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [tab, setTab] = useState<"keystep" | "task">("keystep");
    const [keySteps, setKeySteps] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !frozenProjectId) return;
        setLoading(true);
        Promise.all([
            apiFetch("/api/keysteps/bulk?status=all")
                .then((r) => (r.ok ? r.json() : []))
                .catch(() => []),
            apiFetch("/api/tasks/bulk?status=all")
                .then((r) => (r.ok ? r.json() : []))
                .catch(() => []),
        ])
            .then(([ksData, taskData]) => {
                const ksList = Array.isArray(ksData) ? ksData : [];
                const taskList = Array.isArray(taskData) ? taskData : [];
                setKeySteps(ksList.filter((k: any) => String(k.projectId) === String(frozenProjectId)));
                setTasks(taskList.filter((t: any) => String(t.projectId) === String(frozenProjectId)));
            })
            .finally(() => setLoading(false));
    }, [open, frozenProjectId]);

    const filteredKeySteps = keySteps.filter((k) =>
        String(k.title || "").toLowerCase().includes(search.toLowerCase())
    );
    const filteredTasks = tasks.filter((t) =>
        String(t.taskName || t.title || "").toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (item: FrozenItem) => {
        freezeItem(item);
        setOpen(false);
        toast({
            title: item.type === "keystep" ? "Key Step Selected" : "Task Selected",
            description: `Pages will now narrow further to "${item.name}".`,
        });
    };

    const handleClear = () => {
        clearFreezeItem();
        setOpen(false);
        toast({ title: "Selection Cleared", description: `Back to showing all of "${frozenProject?.name}".` });
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={isItemFrozen ? "default" : "ghost"}
                    size="icon"
                    className={isItemFrozen ? "relative bg-sky-600 hover:bg-sky-700 text-white" : "relative"}
                    data-testid="button-freeze-item"
                    title={isItemFrozen ? `Narrowed to: ${frozenItem?.name}` : "Optionally narrow to one Key Step or Task"}
                >
                    <ListChecks className={`h-4 w-4 ${isItemFrozen ? "" : "text-muted-foreground"}`} />
                    {isItemFrozen && (
                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-background" />
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span className="truncate">{isItemFrozen ? frozenItem?.name : "Narrow Selection"}</span>
                    {isItemFrozen && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
                            onClick={handleClear}
                            data-testid="button-clear-freeze-item"
                        >
                            <X className="h-3 w-3 mr-1" /> Clear
                        </Button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <Tabs value={tab} onValueChange={(v) => setTab(v as "keystep" | "task")}>
                    <div className="px-2 pt-1.5">
                        <TabsList className="grid w-full grid-cols-2 h-8">
                            <TabsTrigger value="keystep" className="text-xs">Key Steps</TabsTrigger>
                            <TabsTrigger value="task" className="text-xs">Tasks</TabsTrigger>
                        </TabsList>
                    </div>
                    <div className="px-2 py-1.5">
                        <Input
                            placeholder={tab === "keystep" ? "Search key steps..." : "Search tasks..."}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="h-8"
                            data-testid="input-freeze-item-search"
                        />
                    </div>
                    <TabsContent value="keystep" className="mt-0">
                        <div className="max-h-56 overflow-y-auto">
                            {loading && <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>}
                            {!loading && filteredKeySteps.length === 0 && (
                                <div className="px-3 py-2 text-sm text-muted-foreground">No key steps found</div>
                            )}
                            {!loading &&
                                filteredKeySteps.map((k) => (
                                    <DropdownMenuItem
                                        key={k.id}
                                        onClick={() => handleSelect({ id: k.id, name: k.title, type: "keystep" })}
                                        className="flex items-center justify-between cursor-pointer"
                                        data-testid={`option-freeze-keystep-${k.id}`}
                                    >
                                        <span className="truncate">{k.title}</span>
                                        {frozenItem?.type === "keystep" && String(frozenItem?.id) === String(k.id) && (
                                            <Check className="h-4 w-4 text-sky-600" />
                                        )}
                                    </DropdownMenuItem>
                                ))}
                        </div>
                    </TabsContent>
                    <TabsContent value="task" className="mt-0">
                        <div className="max-h-56 overflow-y-auto">
                            {loading && <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>}
                            {!loading && filteredTasks.length === 0 && (
                                <div className="px-3 py-2 text-sm text-muted-foreground">No tasks found</div>
                            )}
                            {!loading &&
                                filteredTasks.map((t) => (
                                    <DropdownMenuItem
                                        key={t.id}
                                        onClick={() => handleSelect({ id: t.id, name: t.taskName || t.title, type: "task" })}
                                        className="flex items-center justify-between cursor-pointer"
                                        data-testid={`option-freeze-task-${t.id}`}
                                    >
                                        <span className="truncate">{t.taskName || t.title}</span>
                                        {frozenItem?.type === "task" && String(frozenItem?.id) === String(t.id) && (
                                            <Check className="h-4 w-4 text-sky-600" />
                                        )}
                                    </DropdownMenuItem>
                                ))}
                        </div>
                    </TabsContent>
                </Tabs>
                {isItemFrozen && (
                    <>
                        <DropdownMenuSeparator />
                        <p className="px-3 py-1.5 text-xs text-muted-foreground">
                            Task/Key Step pages now narrow further to just "{frozenItem?.name}".
                        </p>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}