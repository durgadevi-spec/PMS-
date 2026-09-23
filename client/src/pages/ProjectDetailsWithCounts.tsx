import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/apiClient";
import { Users, Hash, Upload, FileIcon, Percent } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { TimeTrackingAnalytics } from "@/components/TimeTrackingAnalytics";

export function ProjectDetailsWithCounts({ project }: { project: any }) {
  const [keysteps, setKeysteps] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      apiFetch(`/api/projects/${project.id}/key-steps`).then(r => r.json()).catch(() => []),
      apiFetch(`/api/tasks/${project.id}`).then(r => r.json()).catch(() => []),
    ]).then(([ks, ts]) => {
      if (mounted) {
        setKeysteps(Array.isArray(ks) ? ks : []);
        setTasks(Array.isArray(ts) ? ts : []);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [project.id]);

  const inProgressKeysteps = keysteps.filter((k: any) => k.status === "in-progress");
  const inProgressTasks = tasks.filter((t: any) => t.status === "In Progress" || t.status === "in-progress");

  return (
    <div className="pt-4 border-t border-muted/40 space-y-6">

      {/* Time Tracking Analytics from Timestrap DB */}
      <TimeTrackingAnalytics projectId={project.id} />
    </div>
  );
}
