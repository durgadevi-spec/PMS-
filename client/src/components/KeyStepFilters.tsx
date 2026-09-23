import React, { useState } from "react";
import {
    Filter,
    X,
    Plus,
    Save,
    Trash2,
    Search,
    Check,
    ChevronDown
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
import { cn } from "@/lib/utils";

export interface CustomFilter {
    id: string;
    field: string;
    operator: string;
    value: string;
}

interface KeyStepFiltersProps {
    projectId: string;
    setProjectId: (id: string) => void;
    projects: any[];

    statusFilter: string;
    setStatusFilter: (status: string) => void;

    clientFilter: string;
    setClientFilter: (client: string) => void;
    clients: string[];

    priorityFilter: string;
    setPriorityFilter: (priority: string) => void;

    searchQuery: string;
    setSearchQuery: (query: string) => void;

    startDateFilter: string;
    setStartDateFilter: (date: string) => void;

    endDateFilter: string;
    setEndDateFilter: (date: string) => void;

    customFilters: CustomFilter[];
    setCustomFilters: React.Dispatch<React.SetStateAction<CustomFilter[]>>;

    onClearAll: () => void;
    onApply: () => void;

    savedFilterSets: Record<string, any>;
    setSavedFilterSets: React.Dispatch<React.SetStateAction<Record<string, any>>>;

    employeeFilter: string;
    setEmployeeFilter: (empId: string) => void;
    employees: any[];
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
    { label: "Title", value: "title" },
    { label: "Header", value: "header" },
    { label: "Phase", value: "phase" },
    { label: "Start Date", value: "startDate" },
    { label: "End Date", value: "endDate" },
    { label: "Progress", value: "progress" },
];

export function KeyStepFilters({
    projectId,
    setProjectId,
    projects,
    statusFilter,
    setStatusFilter,
    clientFilter,
    setClientFilter,
    clients,
    priorityFilter,
    setPriorityFilter,
    searchQuery,
    setSearchQuery,
    startDateFilter,
    setStartDateFilter,
    endDateFilter,
    setEndDateFilter,
    customFilters,
    setCustomFilters,
    onClearAll,
    onApply,
    savedFilterSets,
    setSavedFilterSets,
    employeeFilter,
    setEmployeeFilter,
    employees,
}: KeyStepFiltersProps) {
    const [open, setOpen] = useState(false);
    const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);
    const [employeePopoverOpen, setEmployeePopoverOpen] = useState(false);
    const [saveName, setSaveName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const handleSaveFilter = () => {
        if (!saveName.trim()) return;
        const newSet = {
            projectId,
            statusFilter,
            clientFilter,
            priorityFilter,
            searchQuery,
            startDateFilter,
            endDateFilter,
            customFilters,
            employeeFilter,
        };
        setSavedFilterSets(prev => ({ ...prev, [saveName.trim()]: newSet }));
        setSaveName("");
        setIsSaving(false);
    };

    const applySavedFilter = (name: string) => {
        const set = savedFilterSets[name];
        if (!set) return;
        setProjectId(set.projectId);
        setStatusFilter(set.statusFilter);
        setClientFilter(set.clientFilter || "all");
        setPriorityFilter(set.priorityFilter || "all");
        setSearchQuery(set.searchQuery);
        setStartDateFilter(set.startDateFilter || "");
        setEndDateFilter(set.endDateFilter || "");
        setCustomFilters(set.customFilters);
        setEmployeeFilter(set.employeeFilter || "all");
    };

    const deleteSavedFilter = (name: string) => {
        setSavedFilterSets(prev => {
            const updated = { ...prev };
            delete updated[name];
            return updated;
        });
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
        projectId && projectId !== "all" ? projectId : "",
        searchQuery,
        statusFilter !== "all" ? statusFilter : "",
        clientFilter !== "all" ? clientFilter : "",
        priorityFilter !== "all" ? priorityFilter : "",
        startDateFilter,
        endDateFilter,
        employeeFilter !== "all" ? employeeFilter : "",
    ].filter(Boolean).length + customFilters.length;

    return (
        <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                    <Button variant="outline" className="relative gap-2 bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm transition-all duration-200">
                        <Filter className="h-4 w-4" />
                        <span className="font-medium">Filters</span>
                        {activeCount > 0 && (
                            <Badge variant="default" className="ml-1 h-5 min-w-5 flex items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold">
                                {activeCount}
                            </Badge>
                        )}
                    </Button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[450px] overflow-y-auto bg-white border-l shadow-2xl">
                    <SheetHeader className="pb-6 border-b">
                        <SheetTitle className="text-2xl font-bold text-slate-900">Key Step Filters</SheetTitle>
                        <SheetDescription className="text-slate-500">
                            Refine your key steps with advanced filtering options.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="py-8 space-y-8">
                        {/* Search */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <Search className="h-4 w-4 text-slate-400" />
                                Search Key Steps
                            </label>
                            <Input
                                placeholder="Header, title..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                            />
                        </div>

                        {/* Standard Filters */}
                        <div className="grid grid-cols-1 gap-6">
                            {/* Project */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-700">Project</label>
                                <Popover open={projectPopoverOpen} onOpenChange={setProjectPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between bg-slate-50 border-slate-200 font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                        >
                                            <span className="truncate">
                                                {projectId
                                                    ? projects.find((p) => String(p.id) === projectId)?.title
                                                    : "All Projects"}
                                            </span>
                                            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[350px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search project..." />
                                            <CommandList>
                                                <CommandEmpty>No project found.</CommandEmpty>
                                                <CommandGroup>
                                                    <CommandItem
                                                        onSelect={() => {
                                                            setProjectId("");
                                                            setProjectPopoverOpen(false);
                                                        }}
                                                    >
                                                        <Check className={cn("mr-2 h-4 w-4", !projectId ? "opacity-100" : "opacity-0")} />
                                                        All Projects
                                                    </CommandItem>
                                                    {projects.map((p) => (
                                                        <CommandItem
                                                            key={p.id}
                                                            onSelect={() => {
                                                                setProjectId(String(p.id));
                                                                setProjectPopoverOpen(false);
                                                            }}
                                                        >
                                                            <Check className={cn("mr-2 h-4 w-4", projectId === String(p.id) ? "opacity-100" : "opacity-0")} />
                                                            {p.title}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Status */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-700">Status</label>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-700">
                                        <SelectValue placeholder="All Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="in-progress">In Progress</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                        <SelectItem value="cancelled">Cancelled</SelectItem>
                                        <SelectItem value="not started">Not Started</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Client */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-700">Client</label>
                                <Select value={clientFilter} onValueChange={setClientFilter}>
                                    <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-700">
                                        <SelectValue placeholder="All Clients" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Clients</SelectItem>
                                        {clients.map((client) => (
                                            <SelectItem key={client} value={client}>
                                                {client}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Priority */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-700">Priority</label>
                                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                                    <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-700">
                                        <SelectValue placeholder="All Priorities" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Priorities</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Employee / Assignee */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-700">Employee / Assignee</label>
                                <Popover open={employeePopoverOpen} onOpenChange={setEmployeePopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between bg-slate-50 border-slate-200 font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                        >
                                            <span className="truncate">
                                                {employeeFilter === "all"
                                                    ? "All Employees / Assignees"
                                                    : employees.find((emp) => String(emp.id) === employeeFilter)?.name || "Unknown Employee"}
                                            </span>
                                            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[350px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search employee..." />
                                            <CommandList className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                <CommandEmpty>No employee found.</CommandEmpty>
                                                <CommandGroup>
                                                    <CommandItem
                                                        onSelect={() => {
                                                            setEmployeeFilter("all");
                                                            setEmployeePopoverOpen(false);
                                                        }}
                                                    >
                                                        <Check className={cn("mr-2 h-4 w-4", employeeFilter === "all" ? "opacity-100" : "opacity-0")} />
                                                        All Employees / Assignees
                                                    </CommandItem>
                                                    {employees.map((emp) => (
                                                        <CommandItem
                                                            key={emp.id}
                                                            onSelect={() => {
                                                                setEmployeeFilter(String(emp.id));
                                                                setEmployeePopoverOpen(false);
                                                            }}
                                                        >
                                                            <Check className={cn("mr-2 h-4 w-4", employeeFilter === String(emp.id) ? "opacity-100" : "opacity-0")} />
                                                            {emp.name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <label className="text-sm font-semibold text-slate-700">Start Date</label>
                                    <Input
                                        type="date"
                                        value={startDateFilter}
                                        onChange={(e) => setStartDateFilter(e.target.value)}
                                        className="bg-slate-50 border-slate-200 text-slate-700"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-sm font-semibold text-slate-700">End Date</label>
                                    <Input
                                        type="date"
                                        value={endDateFilter}
                                        onChange={(e) => setEndDateFilter(e.target.value)}
                                        className="bg-slate-50 border-slate-200 text-slate-700"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Custom Filters Section */}
                        <div className="space-y-4 pt-4 border-t">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-bold text-slate-900 uppercase tracking-wider">Custom Filters</label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={addCustomFilter}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1 h-8 px-2"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add Filter
                                </Button>
                            </div>

                            {customFilters.length === 0 ? (
                                <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                    <p className="text-xs text-slate-400 font-medium">No custom filters added.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {customFilters.map((filter) => (
                                        <div key={filter.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3 relative group animate-in fade-in slide-in-from-top-1 duration-200">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Filter Condition</span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all rounded-md flex gap-1 items-center"
                                                    onClick={() => removeCustomFilter(filter.id)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                    Remove
                                                </Button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-semibold text-slate-400 ml-1">Field</label>
                                                    <Select
                                                        value={filter.field}
                                                        onValueChange={(val) => updateCustomFilter(filter.id, { field: val })}
                                                    >
                                                        <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 focus:bg-white transition-all">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {FIELDS.map((f) => (
                                                                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-semibold text-slate-400 ml-1">Operator</label>
                                                    <Select
                                                        value={filter.operator}
                                                        onValueChange={(val) => updateCustomFilter(filter.id, { operator: val })}
                                                    >
                                                        <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 focus:bg-white transition-all">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {OPERATORS.map((o) => (
                                                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] font-semibold text-slate-400 ml-1">Value</label>
                                                <Input
                                                    placeholder="Enter value..."
                                                    value={filter.value}
                                                    onChange={(e) => updateCustomFilter(filter.id, { value: e.target.value })}
                                                    className="h-9 text-xs bg-slate-50 border-slate-200 focus:bg-white transition-all"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Saved Filters Section */}
                        <div className="space-y-4 pt-4 border-t">
                            <label className="text-sm font-bold text-slate-900 uppercase tracking-wider">Favorites</label>

                            {isSaving ? (
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Filter name..."
                                        value={saveName}
                                        onChange={(e) => setSaveName(e.target.value)}
                                        className="h-9 text-xs"
                                        autoFocus
                                    />
                                    <Button size="sm" onClick={handleSaveFilter}>Save</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setIsSaving(false)}>Cancel</Button>
                                </div>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsSaving(true)}
                                    className="w-full border-dashed border-slate-300 text-slate-500 hover:text-blue-600 hover:border-blue-300 gap-2 h-9"
                                >
                                    <Save className="h-3.5 w-3.5" />
                                    Save Current Filter
                                </Button>
                            )}

                            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                {Object.keys(savedFilterSets).length === 0 ? (
                                    <p className="text-[10px] text-slate-400 text-center italic">No saved filters yet.</p>
                                ) : (
                                    Object.keys(savedFilterSets).map(name => (
                                        <div key={name} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200 group/fav">
                                            <button
                                                onClick={() => applySavedFilter(name)}
                                                className="text-xs font-medium text-slate-700 hover:text-blue-600 truncate flex-1 text-left"
                                            >
                                                {name}
                                            </button>
                                            <button
                                                onClick={() => deleteSavedFilter(name)}
                                                className="text-slate-400 hover:text-red-500 opacity-0 group-hover/fav:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <SheetFooter className="mt-8 pt-6 border-t flex-col sm:flex-col gap-3">
                        <div className="flex gap-3 w-full">
                            <Button
                                variant="outline"
                                onClick={onClearAll}
                                className="flex-1 border-slate-200 hover:bg-slate-100 text-slate-600 h-11"
                            >
                                Clear All
                            </Button>
                            <Button
                                onClick={() => {
                                    onApply();
                                    setOpen(false);
                                }}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200 h-11"
                            >
                                Apply Filters
                            </Button>
                        </div>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    );
}