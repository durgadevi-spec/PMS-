import React, { useState } from "react";
import {
    Filter,
    X,
    Plus,
    Save,
    Trash2,
    Search,
    Check,
    ChevronDown,
    ChevronsUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetFooter,
} from "@/components/ui/sheet";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface CustomFilter {
    id: string;
    field: string;
    operator: string;
    value: string;
}

interface TaskFiltersProps {
    // Standard Filters
    projectId: string;
    setProjectId: (id: string) => void;
    projects: any[];

    clientFilter: string;
    setClientFilter: (client: string) => void;
    clients: string[];

    selectedKeyStepId: string;
    setSelectedKeyStepId: (keyStepId: string) => void;
    keySteps: any[];

    departmentFilter: string;
    setDepartmentFilter: (dept: string) => void;
    departments: string[];

    statusFilter: string;
    setStatusFilter: (status: string) => void;

    assigneeFilter: string;
    setAssigneeFilter: (assignee: string) => void;
    employees: any[];

    priorityFilter: string;
    setPriorityFilter: (priority: string) => void;

    progressFilter: string;
    setProgressFilter: (progress: string) => void;
    uniqueProgressValues: number[];

    pinnedFilters: Record<string, string>;
    setPinnedFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    tasks: any[];

    searchQuery: string;
    setSearchQuery: (query: string) => void;

    // Custom Filters
    customFilters: CustomFilter[];
    setCustomFilters: React.Dispatch<React.SetStateAction<CustomFilter[]>>;

    // Actions
    onClearAll: () => void;
    onApply: () => void;

    // Saved Filters
    savedFilterSets: Record<string, any>;
    setSavedFilterSets: React.Dispatch<React.SetStateAction<Record<string, any>>>;

    // Grouping
    groupBy: string;
    setGroupBy: (field: string) => void;

    // Period Filter
    periodFilter: string;
    setPeriodFilter: (period: string) => void;
    startDateFilter: string;
    setStartDateFilter: (date: string) => void;
    endDateFilter: string;
    setEndDateFilter: (date: string) => void;
    tagFilter: string;
    setTagFilter: (tagId: string) => void;
    allTags: any[];
}

const OPERATORS = [
    { label: "equals", value: "==" },
    { label: "not equals", value: "!=" },
    { label: "contains", value: "contains" },
    { label: "greater than", value: ">" },
    { label: "less than", value: "<" },
];

const FIELDS = [
    { label: "Status", value: "status" },
    { label: "Priority", value: "priority" },
    { label: "Progress", value: "progress" },
    { label: "Start Date", value: "startDate" },
    { label: "End Date", value: "endDate" },
];

const GROUP_OPTIONS = [
    { label: "Client", value: "clientName" },
    { label: "Key Step", value: "keyStep" },
    { label: "Progress", value: "progress" },
    { label: "Start Date", value: "startDate" },
    { label: "End Date", value: "endDate" },
];

export function TaskFilters({
    projectId,
    setProjectId,
    projects,
    clientFilter,
    setClientFilter,
    clients,
    selectedKeyStepId,
    setSelectedKeyStepId,
    keySteps,
    departmentFilter,
    setDepartmentFilter,
    departments,
    statusFilter,
    setStatusFilter,
    assigneeFilter,
    setAssigneeFilter,
    employees,
    priorityFilter,
    setPriorityFilter,
    progressFilter,
    setProgressFilter,
    uniqueProgressValues,
    pinnedFilters,
    setPinnedFilters,
    tasks,
    searchQuery,
    setSearchQuery,
    customFilters,
    setCustomFilters,
    onClearAll,
    onApply,
    savedFilterSets,
    setSavedFilterSets,
    groupBy,
    setGroupBy,
    periodFilter,
    setPeriodFilter,
    startDateFilter,
    setStartDateFilter,
    endDateFilter,
    setEndDateFilter,
    tagFilter,
    setTagFilter,
    allTags,
}: TaskFiltersProps) {
    const [open, setOpen] = useState(false);
    const sortedClients = [...clients].sort((a, b) => a.localeCompare(b));
    const [keyStepPopoverOpen, setKeyStepPopoverOpen] = useState(false);

    // Custom styles for scrollbar
    const scrollbarStyles = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #e2e8f0;
      border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #cbd5e1;
    }
  `;

    const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);
    const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
    const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
    const [saveName, setSaveName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const handleSaveFilter = () => {
        if (!saveName.trim()) return;
        const newSet = {
            projectId,
            clientFilter,
            selectedKeyStepId,
            departmentFilter,
            statusFilter,
            assigneeFilter,
            priorityFilter,
            progressFilter,
            pinnedFilters,
            searchQuery,
            customFilters,
            periodFilter,
            startDateFilter,
            endDateFilter,
        };
        setSavedFilterSets(prev => ({ ...prev, [saveName.trim()]: newSet }));
        setSaveName("");
        setIsSaving(false);
    };

    const applySavedFilter = (name: string) => {
        const set = savedFilterSets[name];
        if (!set) return;
        setProjectId(set.projectId);
        setClientFilter(set.clientFilter);
        setSelectedKeyStepId(set.selectedKeyStepId || "");
        setDepartmentFilter(set.departmentFilter);
        setStatusFilter(set.statusFilter);
        setAssigneeFilter(set.assigneeFilter);
        setPriorityFilter(set.priorityFilter || "all");
        setProgressFilter(set.progressFilter || "all");
        setPinnedFilters(set.pinnedFilters || {});
        setSearchQuery(set.searchQuery);
        setCustomFilters(set.customFilters);
        setPeriodFilter(set.periodFilter || "all");
        setStartDateFilter(set.startDateFilter || "");
        setEndDateFilter(set.endDateFilter || "");
    };

    const deleteSavedFilter = (name: string) => {
        setSavedFilterSets(prev => {
            const updated = { ...prev };
            delete updated[name];
            return updated;
        });
    };

    const addPinnedFilter = (field: string) => {
        if (pinnedFilters[field]) return;
        setPinnedFilters(prev => ({ ...prev, [field]: "all" }));
    };

    const removePinnedFilter = (field: string) => {
        setPinnedFilters(prev => {
            const updated = { ...prev };
            delete updated[field];
            return updated;
        });
    };

    const updatePinnedValue = (field: string, value: string) => {
        setPinnedFilters(prev => ({ ...prev, [field]: value }));
    };

    const getUniqueValues = (field: string) => {
        return Array.from(new Set(tasks.map(t => String(t[field] || "N/A")))).sort();
    };

    const addCustomFilter = () => {
        const newFilter: CustomFilter = {
            id: Math.random().toString(36).substr(2, 9),
            field: "status",
            operator: "==",
            value: "",
        };
        setCustomFilters([...customFilters, newFilter]);
    };

    const removeCustomFilter = (id: string) => {
        setCustomFilters(customFilters.filter((f) => f.id !== id));
    };

    const updateCustomFilter = (id: string, updates: Partial<CustomFilter>) => {
        setCustomFilters(
            customFilters.map((f) => (f.id === id ? { ...f, ...updates } : f))
        );
    };

    const activeCount = [
        projectId,
        searchQuery,
        clientFilter !== "all" ? clientFilter : "",
        selectedKeyStepId,
        departmentFilter !== "all" ? departmentFilter : "",
        statusFilter !== "all" ? statusFilter : "",
        assigneeFilter !== "all" ? assigneeFilter : "",
        periodFilter !== "all" ? periodFilter : "",
        startDateFilter,
        endDateFilter,
    ].filter(Boolean).length + customFilters.length;

    return (
        <div className="flex items-center gap-2">
            <style>{scrollbarStyles}</style>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="relative gap-2 bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm transition-all duration-200">
                        <Filter className="h-4 w-4" />
                        <span className="font-medium">Filters</span>
                        {activeCount > 0 && (
                            <Badge variant="default" className="ml-1 h-5 min-w-5 flex items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold">
                                {activeCount}
                            </Badge>
                        )}
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[900px] p-0 shadow-2xl border-slate-200 bg-white rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Filter className="h-5 w-5 text-blue-600" />
                            Search & Filter
                        </DialogTitle>
                        <DialogDescription>
                            Refine your task list by applying project, status, and custom filters.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 overflow-y-auto custom-scrollbar flex-1">
                        {/* COLUMN 1: FILTERS */}
                        <div className="p-6 space-y-6">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                                <Filter className="h-4 w-4 text-blue-600" />
                                <span className="text-sm font-bold text-slate-900 uppercase tracking-wider">Filters</span>
                            </div>

                            <div className="space-y-5">
                                {/* Search & Project (Primary) */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Search Tasks</label>
                                        <div className="relative group">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                            <Input
                                                placeholder="Name, description..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="pl-8 h-9 text-xs bg-slate-50/50 border-slate-200 focus:bg-white transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Project</label>
                                        <Popover open={projectPopoverOpen} onOpenChange={setProjectPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="h-9 w-full justify-between bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                                >
                                                    <span className="truncate">
                                                        {projectId
                                                            ? projects.find((p) => String(p.id) === projectId)?.title
                                                            : "All Projects"}
                                                    </span>
                                                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent
                                                className="w-[300px] p-0 shadow-xl border-slate-200 max-h-[min(320px,var(--radix-popover-content-available-height))] flex flex-col"
                                                align="start"
                                            >
                                                <Command className="max-h-full">
                                                    <CommandInput placeholder="Search project..." className="h-9 text-xs" />
                                                    <CommandList className="max-h-[260px] overflow-y-auto overscroll-contain">
                                                        <CommandEmpty className="py-4 text-xs text-slate-400 text-center">No project found.</CommandEmpty>
                                                        <CommandGroup>
                                                            <CommandItem
                                                                onSelect={() => {
                                                                    setProjectId("");
                                                                    setProjectPopoverOpen(false);
                                                                }}
                                                                className="text-xs"
                                                            >
                                                                <Check className={cn("mr-2 h-3 w-3", !projectId ? "opacity-100" : "opacity-0")} />
                                                                All Projects
                                                            </CommandItem>
                                                            {projects.map((p) => (
                                                                <CommandItem
                                                                    key={p.id}
                                                                    onSelect={() => {
                                                                        setProjectId(String(p.id));
                                                                        setProjectPopoverOpen(false);
                                                                    }}
                                                                    className="text-xs"
                                                                >
                                                                    <Check className={cn("mr-2 h-3 w-3", projectId === String(p.id) ? "opacity-100" : "opacity-0")} />
                                                                    {p.title}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Client</label>
                                        <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className="h-9 w-full justify-between bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                                >
                                                    <span className="truncate">
                                                        {clientFilter === "all" ? "All Clients" : clientFilter}
                                                    </span>
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-64 p-0 shadow-xl border-slate-200" align="start">
                                                <Command>
                                                    <CommandInput placeholder="Search client..." className="h-8 text-[10px]" />
                                                    <CommandList>
                                                        <CommandEmpty className="py-4 text-xs text-slate-400 text-center">No client found.</CommandEmpty>
                                                        <CommandGroup>
                                                            <CommandItem
                                                                onSelect={() => {
                                                                    setClientFilter("all");
                                                                    setClientPopoverOpen(false);
                                                                }}
                                                                className="text-xs"
                                                            >
                                                                <Check className={cn("mr-2 h-3 w-3", clientFilter === "all" ? "opacity-100" : "opacity-0")} />
                                                                All Clients
                                                            </CommandItem>
                                                            {sortedClients.map((client) => (
                                                                <CommandItem
                                                                    key={client}
                                                                    onSelect={() => {
                                                                        setClientFilter(client);
                                                                        setClientPopoverOpen(false);
                                                                    }}
                                                                    className="text-xs"
                                                                >
                                                                    <Check className={cn("mr-2 h-3 w-3", clientFilter === client ? "opacity-100" : "opacity-0")} />
                                                                    {client}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Key Step</label>
                                        <Popover open={keyStepPopoverOpen} onOpenChange={setKeyStepPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className="h-9 w-full justify-between bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                                >
                                                    <span className="truncate">
                                                        {selectedKeyStepId
                                                            ? keySteps.find((step) => String(step.id) === String(selectedKeyStepId))?.title || "Selected Key Step"
                                                            : "All Key Steps"}
                                                    </span>
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-64 p-0 shadow-xl border-slate-200" align="start">
                                                <Command>
                                                    <CommandInput placeholder="Search key step..." className="h-8 text-[10px]" />
                                                    <CommandList>
                                                        <CommandEmpty className="py-4 text-xs text-slate-400 text-center">No key step found.</CommandEmpty>
                                                        <CommandGroup>
                                                            <CommandItem
                                                                onSelect={() => {
                                                                    setSelectedKeyStepId("");
                                                                    setKeyStepPopoverOpen(false);
                                                                }}
                                                                className="text-xs"
                                                            >
                                                                <Check className={cn("mr-2 h-3 w-3", !selectedKeyStepId ? "opacity-100" : "opacity-0")} />
                                                                All Key Steps
                                                            </CommandItem>
                                                            {keySteps.map((step) => (
                                                                <CommandItem
                                                                    key={step.id}
                                                                    onSelect={() => {
                                                                        setSelectedKeyStepId(String(step.id));
                                                                        setKeyStepPopoverOpen(false);
                                                                    }}
                                                                    className="text-xs"
                                                                >
                                                                    <Check className={cn("mr-2 h-3 w-3", selectedKeyStepId === String(step.id) ? "opacity-100" : "opacity-0")} />
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-xs">{step.title || step.name || "Untitled Key Step"}</span>
                                                                        {step.projectId && <span className="text-[10px] text-muted-foreground">Project {step.projectId}</span>}
                                                                    </div>
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>

                                {/* Standard Filters */}
                                <div className="space-y-4 pt-4 border-t border-slate-50">
                                    {/* Status */}
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Status</label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className="h-9 w-full justify-between bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                                >
                                                    <span className="truncate">
                                                        {statusFilter === "all" ? "All Status" : statusFilter}
                                                    </span>
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-48 p-0 shadow-xl border-slate-200" align="start">
                                                <Command>
                                                    <CommandInput placeholder="Search status..." className="h-8 text-[10px]" />
                                                    <CommandList>
                                                        <CommandGroup>
                                                            {["all", "Not Started", "Planned", "In Progress", "Completed", "On Hold", "Cancelled"].map((s) => (
                                                                <CommandItem
                                                                    key={s}
                                                                    value={s}
                                                                    onSelect={() => setStatusFilter(s)}
                                                                    className="text-xs"
                                                                >
                                                                    <Check className={cn("mr-2 h-3 w-3", statusFilter === s ? "opacity-100" : "opacity-0")} />
                                                                    {s === "all" ? "All Status" : s}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    {/* Assignee */}
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Assignee</label>
                                        <Popover open={assigneePopoverOpen} onOpenChange={setAssigneePopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className="h-9 w-full justify-between bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                                >
                                                    <span className="truncate">
                                                        {assigneeFilter === "all"
                                                            ? "All Assignees"
                                                            : employees.find((emp) => String(emp.id) === assigneeFilter)?.name || "Unknown"}
                                                    </span>
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-48 p-0 shadow-xl border-slate-200" align="start">
                                                <Command>
                                                    <CommandInput placeholder="Search assignee..." className="h-8 text-[10px]" />
                                                    <CommandList className="max-h-[200px] overflow-y-auto">
                                                        <CommandGroup>
                                                            <CommandItem
                                                                onSelect={() => setAssigneeFilter("all")}
                                                                className="text-xs"
                                                            >
                                                                <Check className={cn("mr-2 h-3 w-3", assigneeFilter === "all" ? "opacity-100" : "opacity-0")} />
                                                                All Assignees
                                                            </CommandItem>
                                                            {employees.map((emp) => (
                                                                <CommandItem
                                                                    key={emp.id}
                                                                    onSelect={() => setAssigneeFilter(String(emp.id))}
                                                                    className="text-xs"
                                                                >
                                                                    <Check className={cn("mr-2 h-3 w-3", assigneeFilter === String(emp.id) ? "opacity-100" : "opacity-0")} />
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-xs">{emp.name}</span>
                                                                        {emp.department && <span className="text-[10px] text-muted-foreground">{emp.department}</span>}
                                                                    </div>
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    {/* Priority */}
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Priority</label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className="h-9 w-full justify-between bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                                >
                                                    <span className="truncate">
                                                        {priorityFilter === "all" ? "All Priorities" : priorityFilter.charAt(0).toUpperCase() + priorityFilter.slice(1)}
                                                    </span>
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-48 p-0 shadow-xl border-slate-200" align="start">
                                                <Command>
                                                    <CommandInput placeholder="Search priority..." className="h-8 text-[10px]" />
                                                    <CommandList>
                                                        <CommandGroup>
                                                            {["all", "low", "medium", "high"].map((p) => (
                                                                <CommandItem
                                                                    key={p}
                                                                    value={p}
                                                                    onSelect={() => setPriorityFilter(p)}
                                                                    className="text-xs capitalize"
                                                                >
                                                                    <Check className={cn("mr-2 h-3 w-3", priorityFilter === p ? "opacity-100" : "opacity-0")} />
                                                                    {p === "all" ? "All Priorities" : p}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    {/* Task Period (Timeline) */}
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Task Period</label>
                                        <Select value={periodFilter} onValueChange={setPeriodFilter}>
                                            <SelectTrigger className="h-9 w-full bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors">
                                                <SelectValue placeholder="Select Range" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Time</SelectItem>
                                                <SelectItem value="1">Today</SelectItem>
                                                <SelectItem value="7">1 Week</SelectItem>
                                                <SelectItem value="15">Fortnight (15 Days)</SelectItem>
                                                <SelectItem value="30">1 Month</SelectItem>
                                                <SelectItem value="90">Quarterly</SelectItem>
                                                <SelectItem value="180">Half Yearly</SelectItem>
                                                <SelectItem value="365">Annual</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Start & End Date */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Start Date</label>
                                            <Input
                                                type="date"
                                                value={startDateFilter}
                                                onChange={(e) => setStartDateFilter(e.target.value)}
                                                className="h-9 bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">End Date</label>
                                            <Input
                                                type="date"
                                                value={endDateFilter}
                                                onChange={(e) => setEndDateFilter(e.target.value)}
                                                className="h-9 bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                            />
                                        </div>
                                    </div>

                                    {/* Tags */}
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Tag</label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className="h-9 w-full justify-between bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                                >
                                                    <span className="truncate">
                                                        {tagFilter === "all" ? "All Tags" : (allTags.find((t) => String(t.id) === String(tagFilter))?.name || "All Tags")}
                                                    </span>
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-48 p-0 shadow-xl border-slate-200" align="start">
                                                <Command>
                                                    <CommandInput placeholder="Search tags..." className="h-8 text-[10px]" />
                                                    <CommandList>
                                                        <CommandEmpty className="text-xs text-center py-2 text-slate-400">No tags found.</CommandEmpty>
                                                        <CommandGroup>
                                                            <CommandItem
                                                                value="all"
                                                                onSelect={() => setTagFilter("all")}
                                                                className="text-xs"
                                                            >
                                                                <Check className={cn("mr-2 h-3 w-3", tagFilter === "all" ? "opacity-100" : "opacity-0")} />
                                                                All Tags
                                                            </CommandItem>
                                                            {allTags.map((tag) => (
                                                                <CommandItem
                                                                    key={tag.id}
                                                                    value={tag.name}
                                                                    onSelect={() => setTagFilter(String(tag.id))}
                                                                    className="text-xs"
                                                                >
                                                                    <Check className={cn("mr-2 h-3 w-3", String(tagFilter) === String(tag.id) ? "opacity-100" : "opacity-0")} />
                                                                    {tag.name}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    {/* Dynamic Pinned Filters */}
                                    {Object.entries(pinnedFilters).map(([field, value]) => (
                                        <div key={field} className="space-y-2 relative group/pinned">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">
                                                    {FIELDS.find(f => f.value === field)?.label || field}
                                                </label>
                                                <button
                                                    onClick={() => removePinnedFilter(field)}
                                                    className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover/pinned:opacity-100"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        role="combobox"
                                                        className="h-9 w-full justify-between bg-slate-50/50 border-slate-200 text-xs font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                                    >
                                                        <span className="truncate">
                                                            {value === "all" ? `All ${FIELDS.find(f => f.value === field)?.label || field}` : value}
                                                        </span>
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-48 p-0 shadow-xl border-slate-200" align="start">
                                                    <Command>
                                                        <CommandInput placeholder="Search..." className="h-8 text-[10px]" />
                                                        <CommandList className="max-h-[200px] overflow-y-auto">
                                                            <CommandGroup>
                                                                <CommandItem
                                                                    value="all"
                                                                    onSelect={() => updatePinnedValue(field, "all")}
                                                                    className="text-xs"
                                                                >
                                                                    <Check className={cn("mr-2 h-3 w-3", value === "all" ? "opacity-100" : "opacity-0")} />
                                                                    All {FIELDS.find(f => f.value === field)?.label || field}
                                                                </CommandItem>
                                                                {getUniqueValues(field).map((val) => (
                                                                    <CommandItem
                                                                        key={val}
                                                                        value={val}
                                                                        onSelect={() => updatePinnedValue(field, val)}
                                                                        className="text-xs"
                                                                    >
                                                                        <Check className={cn("mr-2 h-3 w-3", value === val ? "opacity-100" : "opacity-0")} />
                                                                        {val}
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    ))}
                                </div>

                                {/* Filter Row Actions */}

                                {/* Filter Row Actions */}
                                <div className="pt-2 border-t border-slate-50 grid grid-cols-1 gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full justify-start text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-2 h-8 px-2"
                                            >
                                                <Plus className="h-3 w-3" />
                                                ADD PERMANENT FILTER ROW
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-48 p-0 shadow-xl border-slate-200" align="start">
                                            <Command className="rounded-lg">
                                                <CommandInput placeholder="Search field..." className="h-8 text-[10px]" />
                                                <CommandList>
                                                    <CommandEmpty className="py-4 text-[10px] text-slate-400 text-center">No fields.</CommandEmpty>
                                                    <CommandGroup heading="Available Fields">
                                                        {FIELDS.filter(f => !pinnedFilters[f.value]).map(f => (
                                                            <CommandItem
                                                                key={f.value}
                                                                onSelect={() => addPinnedFilter(f.value)}
                                                                className="text-[10px] cursor-pointer"
                                                            >
                                                                <Plus className="mr-2 h-2.5 w-2.5 opacity-50" />
                                                                {f.label}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={addCustomFilter}
                                        className="w-full justify-start text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 gap-2 h-8 px-2"
                                    >
                                        <Plus className="h-3 w-3" />
                                        ADD CUSTOM CONDITION
                                    </Button>
                                </div>

                                {/* Custom Filter Conditions */}
                                <div className="space-y-3">
                                    {customFilters.map((filter) => (
                                        <div key={filter.id} className="p-3 bg-slate-50/50 rounded-lg border border-slate-100 space-y-2 relative group animate-in fade-in duration-200">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Custom Condition</span>
                                                <button onClick={() => removeCustomFilter(filter.id)} className="text-slate-300 hover:text-red-500">
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="h-7 w-full justify-between text-[10px] bg-white border-slate-200 font-normal px-2">
                                                            <span className="truncate">{FIELDS.find(f => f.value === filter.field)?.label || filter.field}</span>
                                                            <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="p-0 w-32" align="start">
                                                        <Command>
                                                            <CommandList>
                                                                <CommandGroup>
                                                                    {FIELDS.map((f) => (
                                                                        <CommandItem key={f.value} onSelect={() => updateCustomFilter(filter.id, { field: f.value })} className="text-[10px]">
                                                                            <Check className={cn("mr-2 h-3 w-3", filter.field === f.value ? "opacity-100" : "opacity-0")} />
                                                                            {f.label}
                                                                        </CommandItem>
                                                                    ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>

                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="h-7 w-full justify-between text-[10px] bg-white border-slate-200 font-normal px-2">
                                                            <span className="truncate">{OPERATORS.find(o => o.value === filter.operator)?.label || filter.operator}</span>
                                                            <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="p-0 w-32" align="start">
                                                        <Command>
                                                            <CommandList>
                                                                <CommandGroup>
                                                                    {OPERATORS.map((o) => (
                                                                        <CommandItem key={o.value} onSelect={() => updateCustomFilter(filter.id, { operator: o.value })} className="text-[10px]">
                                                                            <Check className={cn("mr-2 h-3 w-3", filter.operator === o.value ? "opacity-100" : "opacity-0")} />
                                                                            {o.label}
                                                                        </CommandItem>
                                                                    ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                            <Input
                                                placeholder="Value..."
                                                value={filter.value}
                                                onChange={(e) => updateCustomFilter(filter.id, { value: e.target.value })}
                                                className="h-7 text-[10px] bg-white border-slate-200"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* COLUMN 2: GROUP BY */}
                        <div className="p-6 space-y-6 bg-slate-50/30">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                                <ChevronDown className="h-4 w-4 text-purple-600" />
                                <span className="text-sm font-bold text-slate-900 uppercase tracking-wider">Group By</span>
                            </div>

                            <div className="space-y-1">
                                {[
                                    { label: "None", value: "none" },
                                    { label: "Project", value: "projectId" },
                                    { label: "Status", value: "status" },
                                    { label: "Assignee", value: "assignee" },
                                    { label: "Priority", value: "priority" },
                                    { label: "Department", value: "department" },
                                    // Show current custom group if it's not in the defaults
                                    ...(!["none", "projectId", "status", "assignee", "priority", "department"].includes(groupBy) && groupBy !== ""
                                        ? [{ label: GROUP_OPTIONS.find(o => o.value === groupBy)?.label || groupBy, value: groupBy }]
                                        : [])
                                ].map((item) => (
                                    <button
                                        key={item.value}
                                        onClick={() => setGroupBy(item.value)}
                                        className={cn(
                                            "w-full text-left px-3 py-2 text-xs rounded-md transition-all font-medium flex items-center justify-between",
                                            groupBy === item.value
                                                ? "bg-white text-blue-600 shadow-sm border border-slate-100"
                                                : "text-slate-600 hover:bg-white hover:text-blue-600"
                                        )}
                                    >
                                        <span className="capitalize">{item.label}</span>
                                        {groupBy === item.value && <Check className="h-3 w-3" />}
                                    </button>
                                ))}
                                <div className="pt-4 mt-2 border-t border-slate-100">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full justify-start text-[11px] font-bold text-purple-600 hover:text-purple-700 hover:bg-purple-50 gap-2 h-8 px-2"
                                            >
                                                <Plus className="h-3 w-3" />
                                                ADD CUSTOM GROUP
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-48" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search fields..." className="h-8 text-xs" />
                                                <CommandList>
                                                    <CommandEmpty className="py-2 text-[10px] text-center">No fields found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {GROUP_OPTIONS.map((option) => (
                                                            <CommandItem
                                                                key={option.value}
                                                                value={option.value}
                                                                onSelect={() => {
                                                                    setGroupBy(option.value);
                                                                }}
                                                                className="text-xs"
                                                            >
                                                                <Check className={cn("mr-2 h-3 w-3", groupBy === option.value ? "opacity-100" : "opacity-0")} />
                                                                {option.label}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </div>

                        {/* COLUMN 3: FAVORITES */}
                        <div className="p-6 space-y-6">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-50">
                                <div className="flex items-center gap-2">
                                    <Save className="h-4 w-4 text-amber-500" />
                                    <span className="text-sm font-bold text-slate-900 uppercase tracking-wider">Favorites</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* Save Form */}
                                {isSaving ? (
                                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-3">
                                        <label className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">Filter Name</label>
                                        <Input
                                            placeholder="e.g. My Urgent Tasks"
                                            value={saveName}
                                            onChange={(e) => setSaveName(e.target.value)}
                                            className="h-8 text-xs bg-white"
                                            autoFocus
                                        />
                                        <div className="flex gap-2">
                                            <Button size="sm" className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700" onClick={handleSaveFilter}>Save</Button>
                                            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setIsSaving(false)}>Cancel</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsSaving(true)}
                                        className="w-full border-dashed border-slate-300 text-slate-500 hover:text-blue-600 hover:border-blue-300 gap-2 h-9 text-xs"
                                    >
                                        <Save className="h-3.5 w-3.5" />
                                        Save Current Search
                                    </Button>
                                )}

                                {/* Saved List */}
                                <div className="space-y-1">
                                    {Object.keys(savedFilterSets).length === 0 ? (
                                        <div className="py-8 text-center">
                                            <p className="text-[11px] text-slate-400 italic">No favorites saved yet.</p>
                                        </div>
                                    ) : (
                                        Object.keys(savedFilterSets).map(name => (
                                            <div key={name} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-md group/fav transition-colors">
                                                <button
                                                    onClick={() => applySavedFilter(name)}
                                                    className="text-xs font-medium text-slate-600 hover:text-blue-600 truncate flex-1 text-left"
                                                >
                                                    {name}
                                                </button>
                                                <button
                                                    onClick={() => deleteSavedFilter(name)}
                                                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover/fav:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* FOOTER */}
                    <div className="p-4 bg-slate-50 border-t flex items-center justify-between">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClearAll}
                            className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all font-semibold"
                        >
                            CLEAR ALL
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setOpen(false)}
                                className="text-xs font-semibold text-slate-600"
                            >
                                Close
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    onApply();
                                    setOpen(false);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-8 shadow-lg shadow-blue-100"
                            >
                                APPLY FILTERS
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}