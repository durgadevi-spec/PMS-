import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { isTaskInInitialSetup } from "@shared/taskInitialSetup";

function useInitialSetupActive(expiresAt: string | Date | null | undefined) {
  const [active, setActive] = useState(() => isTaskInInitialSetup(expiresAt));

  useEffect(() => {
    const expiresAtMs = expiresAt instanceof Date
      ? expiresAt.getTime()
      : expiresAt
        ? Date.parse(expiresAt)
        : Number.NaN;
    const activeAtNow = isTaskInInitialSetup(expiresAt);
    setActive(activeAtNow);
    if (!activeAtNow || !Number.isFinite(expiresAtMs)) return;

    const timer = window.setTimeout(
      () => setActive(false),
      Math.max(expiresAtMs - Date.now(), 0) + 1
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  return active;
}

export function TaskInitialSetupBadge({ expiresAt }: { expiresAt?: string | Date | null }) {
  if (!useInitialSetupActive(expiresAt)) return null;

  return (
    <Badge className="shrink-0 border border-sky-200 bg-sky-50 px-1.5 py-0 text-[9px] font-semibold text-sky-700">
      Initial Setup
    </Badge>
  );
}

export function TaskInitialSetupNotice({ expiresAt }: { expiresAt?: string | Date | null }) {
  if (!useInitialSetupActive(expiresAt)) return null;
  const expiration = expiresAt instanceof Date ? expiresAt : expiresAt ? new Date(expiresAt) : null;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <p className="font-semibold">Initial Setup phase</p>
      <p className="mt-1">
        You can adjust this task&apos;s dates without a reason or Admin approval until{" "}
        {expiration && !Number.isNaN(expiration.getTime()) ? expiration.toLocaleString() : "the phase ends"}.
      </p>
    </div>
  );
}
