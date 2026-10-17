import { useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export interface FilterOption {
    value: string;
    label: string;
}

interface MultiSelectFilterProps {
    label: string; // e.g. "Project", "Employee"
    options: FilterOption[];
    selected: string[];
    onChange: (next: string[]) => void;
    icon?: ReactNode;
    width?: string; // popover width class
}

/**
 * Multi-select dropdown filter. Click options to tick / untick several at once.
 * Shows "Label" when nothing is selected, the name when one is, "Label (n)" for more.
 */
export function MultiSelectFilter({
    label,
    options,
    selected,
    onChange,
    icon,
    width = "w-64",
}: MultiSelectFilterProps) {
    const [open, setOpen] = useState(false);

    const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);

    const active = selected.length > 0;
    const summary =
        selected.length === 0
            ? label
            : selected.length === 1
                ? options.find((o) => o.value === selected[0])?.label || label
                : `${label} (${selected.length})`;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "h-8 text-xs font-medium justify-between gap-1.5 max-w-[200px] bg-white",
                        active && "border-blue-400 bg-blue-50 text-blue-700"
                    )}
                >
                    {icon}
                    <span className="truncate">{summary}</span>
                    <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className={cn(width, "p-0")} align="start">
                <Command>
                    <CommandInput placeholder={`Search ${label.toLowerCase()}...`} className="h-9 text-xs" />
                    <CommandList className="max-h-[240px] overflow-y-auto">
                        <CommandEmpty>No {label.toLowerCase()} found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((o) => {
                                const isSel = selected.includes(o.value);
                                return (
                                    <CommandItem
                                        key={o.value}
                                        value={o.label}
                                        onSelect={() => toggle(o.value)}
                                        className="text-xs"
                                    >
                                        <span
                                            className={cn(
                                                "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                                                isSel ? "bg-primary text-primary-foreground" : "opacity-50"
                                            )}
                                        >
                                            {isSel && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="truncate">{o.label}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                    <div className="flex items-center justify-between border-t px-2 py-1.5">
                        <button
                            type="button"
                            className="text-[11px] text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline"
                            disabled={options.length === 0}
                            onClick={() => onChange(options.map((o) => o.value))}
                        >
                            Select all
                        </button>
                        <button
                            type="button"
                            className="text-[11px] text-slate-500 hover:underline disabled:opacity-40 disabled:no-underline"
                            disabled={!active}
                            onClick={() => onChange([])}
                        >
                            Clear
                        </button>
                    </div>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function ClearFiltersButton({ onClick }: { onClick: () => void }) {
    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-500 hover:text-red-600 gap-1"
            onClick={onClick}
        >
            <X className="h-3 w-3" /> Clear filters
        </Button>
    );
}