import React, { useEffect, useRef, useState } from "react";
import lottie, { AnimationItem } from "lottie-web";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import blueDeleteAnimData from "@/assets/blue-delete-animation.json";

interface DeleteConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  itemName?: string;
  description?: string;
  onConfirm: () => Promise<void> | void;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export function DeleteConfirmModal({
  open,
  onOpenChange,
  title = "Delete Task?",
  itemName,
  description = "Are you sure you want to delete this? This action cannot be undone.",
  onConfirm,
  confirmText = "Delete",
  cancelText = "Cancel",
  isLoading = false,
}: DeleteConfirmModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
      return;
    }

    // Small delay to ensure the DOM element inside Radix Dialog is rendered
    const timer = setTimeout(() => {
      if (containerRef.current) {
        if (animRef.current) {
          animRef.current.destroy();
        }
        animRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: blueDeleteAnimData,
        });
        animRef.current.setSpeed(1.75);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [open]);

  const handleConfirm = async () => {
    if (animRef.current) {
      // Speed up animation on deletion for kinetic sweep feedback
      animRef.current.setSpeed(2.75);
    }
    setInternalLoading(true);
    try {
      await onConfirm();
    } finally {
      setInternalLoading(false);
    }
  };

  const busy = isLoading || internalLoading;

  return (
    <Dialog open={open} onOpenChange={busy ? () => {} : onOpenChange}>
      <DialogContent className="max-w-[420px] rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
        <DialogHeader className="flex flex-col items-center text-center">
          {/* Centered Lottie Animated Sweep/Delete Receptacle */}
          <div className="relative w-36 h-36 flex items-center justify-center -mt-2 -mb-2 overflow-hidden select-none pointer-events-none">
            <div ref={containerRef} className="w-full h-full scale-[1.15]" />
          </div>

          <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 font-display mt-1">
            {title}
          </DialogTitle>

          {itemName && (
            <div className="mt-2 max-w-full px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate shadow-2xs">
              {itemName}
            </div>
          )}

          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium leading-relaxed px-2">
            {description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-5 flex flex-row items-center justify-center gap-3 sm:gap-3 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-9 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-xs shadow-2xs"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1 h-9 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-2xs transition-all active:scale-[0.98]"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deleting...
              </span>
            ) : (
              confirmText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export default DeleteConfirmModal;

