import { useState, useEffect } from "react";
import { GripVertical, EyeOff, RotateCcw, Settings2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ColumnConfig {
    id: string;
    label: string;
    visible: boolean;
}

/**
 * Generic "Manage Columns" control: lets the user show/hide and drag-reorder
 * a set of columns. Originally built for the Tasks page, extracted here so
 * the Projects and Key Steps pages can share the exact same UI/behavior.
 */
export function ManageColumns({
    columns,
    setColumns,
    defaultColumns,
    onSave,
}: {
    columns: ColumnConfig[];
    setColumns: React.Dispatch<React.SetStateAction<ColumnConfig[]>>;
    defaultColumns: ColumnConfig[];
    onSave?: (newColumns: ColumnConfig[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const [localColumns, setLocalColumns] = useState<ColumnConfig[]>(columns);

    useEffect(() => {
        if (open) {
            setLocalColumns(columns);
        }
    }, [open, columns]);

    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.setData("colIndex", String(index));
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        const dragIndex = Number(e.dataTransfer.getData("colIndex"));
        if (dragIndex === dropIndex) return;

        const newCols = [...localColumns];
        const [draggedItem] = newCols.splice(dragIndex, 1);
        newCols.splice(dropIndex, 0, draggedItem);
        setLocalColumns(newCols);
    };

    const toggleVisibility = (id: string) => {
        setLocalColumns(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
    };

    const resetToDefault = () => {
        setLocalColumns(defaultColumns);
    };

    const handleSaveClick = () => {
        setColumns(localColumns);
        if (onSave) {
            onSave(localColumns);
        }
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 min-w-[110px] justify-center gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-md shadow-sm transition-all duration-150"
                >
                    <Settings2 size={14} className="text-slate-500" />
                    <span className="hidden sm:inline">Manage Columns</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 z-50" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="flex items-center justify-between mb-3 pb-2 border-b">
                    <h4 className="text-sm font-semibold">Columns</h4>
                    <Button variant="ghost" size="sm" onClick={resetToDefault} className="h-6 px-2 text-[10px] uppercase text-slate-500">
                        <RotateCcw size={12} className="mr-1" /> Reset
                    </Button>
                </div>
                <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                    {localColumns.map((col, index) => (
                        <div
                            key={col.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, index)}
                            className="flex items-center gap-2 p-1.5 rounded-md hover:bg-slate-100 group transition-colors"
                        >
                            <div className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded flex items-center justify-center hover:bg-slate-200 transition-colors">
                                <GripVertical size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                            </div>
                            <div onMouseDown={(e) => e.stopPropagation()} className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={col.visible}
                                    onChange={() => toggleVisibility(col.id)}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                                />
                            </div>
                            <span className="text-xs font-medium text-slate-700 flex-1">{col.label}</span>
                            {!col.visible && <EyeOff size={12} className="text-slate-400" />}
                        </div>
                    ))}
                </div>
                <div className="mt-3 pt-2 border-t flex justify-end">
                    <Button size="sm" onClick={handleSaveClick} className="h-7 px-3 text-xs gap-1">
                        <Check size={12} /> Save
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}