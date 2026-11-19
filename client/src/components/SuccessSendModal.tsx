import React, { useEffect, useRef } from "react";
import lottie, { AnimationItem } from "lottie-web";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import successSendAnimData from "@/assets/success-send-animation.json";

interface SuccessSendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  itemName?: string;
  description?: string;
  autoCloseMs?: number;
  actionText?: string;
}

export function SuccessSendModal({
  open,
  onOpenChange,
  title = "Key Step Created!",
  itemName,
  description = "Successfully scheduled and added to the project roadmap.",
  autoCloseMs = 2600,
  actionText = "Got it",
}: SuccessSendModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!open) {
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (containerRef.current) {
        if (animRef.current) {
          animRef.current.destroy();
        }
        animRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: false,
          autoplay: true,
          animationData: successSendAnimData,
        });
        animRef.current.setSpeed(1.2);
      }
    }, 40);

    let closeTimer: NodeJS.Timeout | null = null;
    if (autoCloseMs && autoCloseMs > 0) {
      closeTimer = setTimeout(() => {
        onOpenChange(false);
      }, autoCloseMs);
    }

    return () => {
      clearTimeout(timer);
      if (closeTimer) clearTimeout(closeTimer);
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [open, autoCloseMs, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] rounded-3xl border border-[#EAE5FF] dark:border-slate-800 bg-white dark:bg-slate-900 p-7 shadow-[0_20px_50px_rgba(118,82,232,0.18)] font-sans text-center overflow-hidden">
        <DialogHeader className="flex flex-col items-center text-center">
          {/* Centered Lottie Paper Airplane Launch */}
          <div className="relative w-40 h-40 flex items-center justify-center -mt-2 -mb-1 overflow-hidden select-none pointer-events-none">
            <div ref={containerRef} className="w-full h-full scale-[1.1]" />
          </div>

          <DialogTitle className="text-lg font-bold font-display text-[#172033] dark:text-slate-100 tracking-tight">
            {title}
          </DialogTitle>

          {itemName && (
            <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-[#F5F1FF] dark:bg-purple-950/60 border border-[#DDD5FA] dark:border-purple-800/50 text-xs font-semibold text-[#7047EB] dark:text-purple-300 max-w-full truncate">
              <span className="truncate">{itemName}</span>
            </div>
          )}

          <DialogDescription className="text-xs text-[#71809A] dark:text-slate-400 mt-2 leading-relaxed max-w-[320px]">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex items-center justify-center">
          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-9 px-6 text-xs font-semibold rounded-xl bg-[#7652E8] hover:bg-[#6241D4] text-white shadow-md shadow-purple-500/25 active:scale-95 transition-all cursor-pointer"
          >
            {actionText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

