import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateFieldProps {
    /** Stored value in yyyy-MM-dd (ISO date) form, or "" when empty. */
    value: string;
    /** Called with the new value in yyyy-MM-dd form, or "" when cleared. */
    onChange: (value: string) => void;
    placeholder?: string;
    /** Earliest selectable date, in yyyy-MM-dd form. */
    min?: string;
    className?: string;
    disabled?: boolean;
    /** Show a small "Clear" action in the calendar popover footer. */
    clearable?: boolean;
    /** Open the calendar popover as soon as this field mounts (used for inline table-cell editing). */
    defaultOpen?: boolean;
    /** Notified whenever the popover opens/closes — e.g. to exit an inline "editing" state on close. */
    onOpenChange?: (open: boolean) => void;
}

/**
 * A date field that always displays and accepts dates in DD/MM/YYYY order,
 * regardless of the browser's or OS's locale settings. Native
 * `<input type="date">` elements render their text using the browser/OS
 * locale (often MM/DD/YYYY in the US, even when `lang="en-GB"` is set on
 * some browsers), so we render our own trigger + calendar dropdown instead
 * and only use `yyyy-MM-dd` internally for storage/API compatibility.
 */
export default function DateField({
    value,
    onChange,
    placeholder = "dd/mm/yyyy",
    min,
    className,
    disabled,
    clearable,
    defaultOpen,
    onOpenChange,
}: DateFieldProps) {
    const [open, setOpen] = useState(!!defaultOpen);
    const handleOpenChange = (o: boolean) => {
        setOpen(o);
        onOpenChange?.(o);
    };

    const parsed = value ? parseISO(value) : undefined;
    const displayDate = parsed && isValid(parsed) ? format(parsed, "dd/MM/yyyy") : "";
    const minDate = min ? parseISO(min) : undefined;
    const hasValidMin = !!(minDate && isValid(minDate));

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    className={cn("w-full h-10 justify-between font-normal px-3", className)}
                >
                    <span className={displayDate ? "text-foreground" : "text-muted-foreground"}>
                        {displayDate || placeholder}
                    </span>
                    <CalendarIcon className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                <Calendar
                    mode="single"
                    captionLayout="dropdown"
                    selected={parsed && isValid(parsed) ? parsed : undefined}
                    disabled={hasValidMin ? { before: minDate as Date } : undefined}
                    onSelect={(date) => {
                        if (date) {
                            onChange(format(date, "yyyy-MM-dd"));
                            handleOpenChange(false);
                        }
                    }}
                />
                {clearable && value && (
                    <div className="border-t p-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-slate-500 hover:text-red-600"
                            onClick={() => {
                                onChange("");
                                handleOpenChange(false);
                            }}
                        >
                            Clear date
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}