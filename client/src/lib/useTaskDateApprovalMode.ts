import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

/**
 * Whether the admin setting "No Approval Required for Task Date Changes" is ON.
 * Used only to shape the UI (the server enforces the actual behaviour).
 * Defaults to false (existing approval workflow) until loaded or on error.
 */
export function useTaskDateNoApproval(): boolean {
  const [noApproval, setNoApproval] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/task-date-approval-mode", { bypassCache: true } as any);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setNoApproval(Boolean(data?.noApprovalRequired));
        }
      } catch {
        /* keep default */
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return noApproval;
}