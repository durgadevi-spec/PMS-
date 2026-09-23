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
    clearable?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    calendarSize?: "default" | "lg";
    popoverSide?: "top" | "bottom" | "left" | "right";
    popoverAlign?: "start" | "center" | "end";
}

/**
 * A native date field that uses the browser's built-in date picker.
 */
export default function DateField({
    value,
    onChange,
    min,
    className,
    disabled,
}: DateFieldProps) {
    return (
        <input
            type="date"
            value={value || ""}
            min={min || undefined}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
        />
    );
}