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

interface ProjectFiltersProps {
    clientFilter: string[];
    setClientFilter: (clients: string[]) => void;
    clients: string[];

    departmentFilter: string[];
    setDepartmentFilter: (depts: string[]) => void;
    departments: string[];

    statusFilter: string[];
    setStatusFilter: (statuses: string[]) => void;

    priorityFilter: string;
    setPriorityFilter: (priority: string) => void;

    searchQuery: string;
    setSearchQuery: (query: string) => void;

    customFilters: CustomFilter[];
    setCustomFilters: React.Dispatch<React.SetStateAction<CustomFilter[]>>;

    onClearAll: () => void;
    onApply: () => void;

    savedFilterSets: Record<string, any>;
    setSavedFilterSets: React.Dispatch<React.SetStateAction<Record<string, any>>>;

    employeeFilter: string[];
    setEmployeeFilter: (emps: string[]) => void;
    employees: any[];

    // Date filters
    startDate: string;
    setStartDate: (d: string) => void;
    endDate: string;
    setEndDate: (d: string) => void;
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
    { label: "Client", value: "clientName" },
    { label: "Start Date", value: "startDate" },
    { label: "End Date", value: "endDate" },
    { label: "Progress", value: "progress" },
];

export function ProjectFilters({
    clientFilter,
    setClientFilter,
    clients,
    departmentFilter,
    setDepartmentFilter,
    departments,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    searchQuery,
    setSearchQuery,
    customFilters,
    setCustomFilters,
    onClearAll,
    onApply,
    savedFilterSets,
    setSavedFilterSets,
    employeeFilter,
    setEmployeeFilter,
    employees,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
}: ProjectFiltersProps) {
    const [open, setOpen] = useState(false);
    const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
    const [employeePopoverOpen, setEmployeePopoverOpen] = useState(false);
    
    const [saveName, setSaveName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Sort options alphabetically for standard dropdown lists
    const sortedClients = React.useMemo(() => [...clients].sort((a, b) => a.localeCompare(b)), [clients]);
    const sortedDepartments = React.useMemo(() => [...departments].sort((a, b) => a.localeCompare(b)), [departments]);
    const sortedEmployees = React.useMemo(() => [...employees].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [employees]);

    const handleSaveFilter = () => {
        if (!saveName.trim()) return;
        const newSet = {
            clientFilter,
            departmentFilter,
            statusFilter,
            priorityFilter,
            searchQuery,
            customFilters,
            employeeFilter,
            startDate,
            endDate,
        };
        setSavedFilterSets(prev => ({ ...prev, [saveName.trim()]: newSet }));
        setSaveName("");
        setIsSaving(false);
    };

    const applySavedFilter = (name: string) => {
        const set = savedFilterSets[name];
        if (!set) return;
        setClientFilter(set.clientFilter || []);
        setDepartmentFilter(set.departmentFilter || []);
        setStatusFilter(set.statusFilter || []);
        setPriorityFilter(set.priorityFilter || "all");
        setSearchQuery(set.searchQuery);
        setCustomFilters(set.customFilters);
        setEmployeeFilter(set.employeeFilter || []);
        setStartDate(set.startDate ?? set.startDateFrom ?? "");
        setEndDate(set.endDate ?? set.endDateTo ?? "");
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
        searchQuery,
        clientFilter.length > 0 ? clientFilter.length : "",
        departmentFilter.length > 0 ? departmentFilter.length : "",
        statusFilter.length > 0 ? statusFilter.length : "",
        priorityFilter !== "all" ? priorityFilter : "",
        employeeFilter.length > 0 ? employeeFilter.length : "",
        startDate,
        endDate,
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
                        <SheetTitle className="text-2xl font-bold text-slate-900">Project Filters</SheetTitle>
                        <SheetDescription className="text-slate-500">
                            Refine your project list with advanced filtering options.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="py-8 space-y-8">
                        {/* Search */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <Search className="h-4 w-4 text-slate-400" />
                                Search Projects
                            </label>
                            <Input
                                placeholder="Project name, code, client..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                            />
                        </div>

                        {/* Standard Filters */}
                        <div className="grid grid-cols-1 gap-6">
                            {/* Client */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-700">Client</label>
                                <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between bg-slate-50 border-slate-200 font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                        >
                                            <span className="truncate">
                                                {clientFilter.length === 0 ? "All Clients" : `${clientFilter.length} selected`}
                                            </span>
                                            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[350px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search client..." />
                                            <CommandList>
                                                <CommandEmpty>No client found.</CommandEmpty>
                                                <CommandGroup>
                                                    {sortedClients.map((c) => (
                                                        <CommandItem
                                                            key={c}
                                                            onSelect={() => {
                                                                setClientFilter(
                                                                    clientFilter.includes(c)
                                                                        ? clientFilter.filter(item => item !== c)
                                                                        : [...clientFilter, c]
                                                                );
                                                            }}
                                                        >
                                                            <Check className={cn("mr-2 h-4 w-4", clientFilter.includes(c) ? "opacity-100" : "opacity-0")} />
                                                            {c}
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
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between bg-slate-50 border-slate-200 font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                        >
                                            <span className="truncate">
                                                {statusFilter.length === 0 ? "All Status" : `${statusFilter.length} selected`}
                                            </span>
                                            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[350px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search status..." />
                                            <CommandList>
                                                <CommandEmpty>No status found.</CommandEmpty>
                                                <CommandGroup>
                                                    {["Planned", "In Progress", "Completed", "On Hold", "Cancelled"].map((s) => (
                                                        <CommandItem
                                                            key={s}
                                                            onSelect={() => {
                                                                setStatusFilter(
                                                                    statusFilter.includes(s)
                                                                        ? statusFilter.filter(item => item !== s)
                                                                        : [...statusFilter, s]
                                                                );
                                                            }}
                                                        >
                                                            <Check className={cn("mr-2 h-4 w-4", statusFilter.includes(s) ? "opacity-100" : "opacity-0")} />
                                                            {s}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
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
 
                            {/* Department */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-700">Department</label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between bg-slate-50 border-slate-200 font-normal text-slate-700 hover:bg-slate-100 transition-colors"
                                        >
                                            <span className="truncate">
                                                {departmentFilter.length === 0 ? "All Departments" : `${departmentFilter.length} selected`}
                                            </span>
                                            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[350px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search department..." />
                                            <CommandList>
                                                <CommandEmpty>No department found.</CommandEmpty>
                                                <CommandGroup>
                                                    {sortedDepartments.map((d) => (
                                                        <CommandItem
                                                            key={d}
                                                            onSelect={() => {
                                                                setDepartmentFilter(
                                                                    departmentFilter.includes(d)
                                                                        ? departmentFilter.filter(item => item !== d)
                                                                        : [...departmentFilter, d]
                                                                );
                                                            }}
                                                        >
                                                            <Check className={cn("mr-2 h-4 w-4", departmentFilter.includes(d) ? "opacity-100" : "opacity-0")} />
                                                            {d}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
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
                                                {employeeFilter.length === 0
                                                    ? "All Employees / Assignees"
                                                    : `${employeeFilter.length} selected`}
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
                                                    {sortedEmployees.map((emp) => (
                                                        <CommandItem
                                                            key={emp.id}
                                                            onSelect={() => {
                                                                setEmployeeFilter(
                                                                    employeeFilter.includes(String(emp.id))
                                                                        ? employeeFilter.filter(item => item !== String(emp.id))
                                                                        : [...employeeFilter, String(emp.id)]
                                                                );
                                                            }}
                                                        >
                                                            <Check className={cn("mr-2 h-4 w-4", employeeFilter.includes(String(emp.id)) ? "opacity-100" : "opacity-0")} />
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

                            
                        </div>

                        {/* Date Filters */}
                        <div className="space-y-4 pt-4 border-t">
                            <label className="text-sm font-bold text-slate-900 uppercase tracking-wider">Date Filters</label>

                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-slate-700">Start Date</label>
                                <div className="space-y-1">
                                    <span className="text-[10px] text-slate-400 font-semibold ml-1">Show projects starting on or after</span>
                                    <Input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="bg-slate-50 border-slate-200 h-9 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-slate-700">End Date</label>
                                <div className="space-y-1">
                                    <span className="text-[10px] text-slate-400 font-semibold ml-1">Show projects ending on or before</span>
                                    <Input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="bg-slate-50 border-slate-200 h-9 text-xs"
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
