import { useCallback, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

export const SCHEDULE_CHANGE_REASONS = [
    "Requirement changed",
    "Client request",
    "Resource unavailable",
    "Delay due to dependency",
    "Testing delay",
    "Waiting for approval",
    "Other",
] as const;

export interface ScheduleChangeReasonResult {
    reasonCategory: string;
    reason: string;
}

/**
 * Centralized hook for the mandatory schedule-change reason popup.
 * Any screen that lets a user manually change Start Date, End Date, or
 * Duration should call `requestReason()` before saving, and only proceed
 * with the save if it resolves (it rejects if the user cancels).
 *
 * Usage:
 *   const { requestReason, ReasonDialog } = useScheduleChangeReason();
 *   ...
 *   const { reason } = await requestReason();
 *   // include `reason` in the save payload as scheduleChangeReason
 *   ...
 *   return <>{ReasonDialog}...</>
 */
export function useScheduleChangeReason() {
    const [open, setOpen] = useState(false);
    const [category, setCategory] = useState<string>(SCHEDULE_CHANGE_REASONS[0]);
    const [customText, setCustomText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const resolverRef = useRef<{
        resolve: (v: ScheduleChangeReasonResult) => void;
        reject: () => void;
    } | null>(null);

    const requestReason = useCallback((): Promise<ScheduleChangeReasonResult> => {
        // Guard: if a previous call is still waiting on the user, don't let
        // a second call silently replace resolverRef's resolve/reject pair.
        // That used to orphan the first caller's promise forever (it would
        // never resolve or reject), which made an earlier inline edit look
        // like it "did nothing" until the user tried again.
        if (resolverRef.current) {
            return Promise.reject(new Error("A schedule change reason request is already pending."));
        }
        setCategory(SCHEDULE_CHANGE_REASONS[0]);
        setCustomText("");
        setError(null);
        setOpen(true);
        return new Promise((resolve, reject) => {
            resolverRef.current = { resolve, reject };
        });
    }, []);

    const handleConfirm = () => {
        const isOther = category === "Other";
        const finalReason = isOther ? customText.trim() : category;
        if (!finalReason) {
            setError(
                isOther
                    ? "Please enter a reason."
                    : "Please select a reason."
            );
            return;
        }
        setOpen(false);
        resolverRef.current?.resolve({ reasonCategory: category, reason: finalReason });
        resolverRef.current = null;
    };

    const handleCancel = () => {
        setOpen(false);
        resolverRef.current?.reject();
        resolverRef.current = null;
    };

    const ReasonDialog = (
        <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
            <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Why are you changing this schedule?</DialogTitle>
                    <DialogDescription>
                        A reason is required whenever a task's Start Date, End Date, or Duration is
                        changed manually.
                    </DialogDescription>
                </DialogHeader>

                <RadioGroup value={category} onValueChange={setCategory} className="space-y-2 py-2">
                    {SCHEDULE_CHANGE_REASONS.map((r) => (
                        <div key={r} className="flex items-center space-x-2">
                            <RadioGroupItem value={r} id={`reason-${r}`} />
                            <Label htmlFor={`reason-${r}`} className="font-normal cursor-pointer">
                                {r}
                            </Label>
                        </div>
                    ))}
                </RadioGroup>

                {category === "Other" && (
                    <Textarea
                        placeholder="Enter a custom reason..."
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        rows={3}
                    />
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm}>Confirm & Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    return { requestReason, ReasonDialog };
}

/**
 * Compares a previous and next {startDate, endDate, durationDays} snapshot
 * and returns true if any of them actually changed — the single check every
 * date-editing surface should use to decide whether to show the popup.
 */
export function scheduleFieldsChanged(
    before: { startDate?: string | null; endDate?: string | null; durationDays?: number | null },
    after: { startDate?: string | null; endDate?: string | null; durationDays?: number | null }
): boolean {
    const norm = (v: any) => (v === undefined || v === null || v === "" ? null : v);
    return (
        norm(before.startDate) !== norm(after.startDate) ||
        norm(before.endDate) !== norm(after.endDate) ||
        norm(before.durationDays) !== norm(after.durationDays)
    );
}