import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/apiClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useFreeze } from "@/context/FreezeContext";

// Local YYYY-MM-DD (avoids UTC off-by-one from toISOString())
function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AddKeyStep() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Parse URL params from location
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const projectId = params.get("projectId");
  const keyStepId = params.get("keyStepId"); // For editing

  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);

  const [form, setForm] = useState({
    title: "",
    status: "pending" as "not started" | "pending" | "in-progress" | "completed" | "cancelled",
    startDate: todayStr(),
    endDate: todayStr(),
  });

  // Load projects
  useEffect(() => {
    setLoading(true);
    apiFetch("/api/projects")
      .then(r => {
        if (!r.ok) throw new Error(`API error: ${r.status}`);
        return r.json();
      })
      .then(data => setProjects(Array.isArray(data) ? data : []))
      .catch(err => {
        console.error("Failed to load projects:", err);
        setProjects([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const { frozenProjectId } = useFreeze();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectId && projectId !== "all"
      ? projectId
      : frozenProjectId != null
        ? String(frozenProjectId)
        : null
  );

  // If the URL didn't specify a project (e.g. opened from a general "Add Key Step"
  // entry point) and a project is frozen, auto-select it once it's known.
  useEffect(() => {
    if (!keyStepId && (!projectId || projectId === "all") && frozenProjectId != null) {
      setSelectedProjectId((prev) => prev ?? String(frozenProjectId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenProjectId, keyStepId]);

  // Load existing keystep if editing
  useEffect(() => {
    if (keyStepId) {
      apiFetch(`/api/key-steps/${keyStepId}`)
        .then(r => {
          if (!r.ok) throw new Error(`API error: ${r.status}`);
          return r.json();
        })
        .then((data: any) => {
          setSelectedProjectId(data.projectId);
          setForm({
            title: data.title || "",
            status: data.status || "pending",
            startDate: data.startDate || "",
            endDate: data.endDate || "",
          });
        })
        .catch(err => {
          console.error("Failed to load keystep:", err);
          toast({ variant: "destructive", title: "Error", description: "Failed to load keystep" });
        });
    }
  }, [keyStepId, toast]);

  const handleSave = async () => {
    if (!form.title) {
      toast({ variant: "destructive", title: "Validation Error", description: "Title is required" });
      return;
    }

    if (!selectedProjectId) {
      toast({ variant: "destructive", title: "Error", description: "Project ID is required" });
      return;
    }

    setLoading(true);

    try {
      const payload = {
        title: form.title,
        status: form.status,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        projectId: selectedProjectId,
      };

      const method = keyStepId ? "PATCH" : "POST";
      const url = keyStepId ? `/api/key-steps/${keyStepId}` : "/api/key-steps";

      const response = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server Error (${response.status}): ${errText}`);
      }

      // Grab the created/updated keystep and store it for instant UI injection
      try {
        const newStep = await response.json();
        if (!keyStepId) {
          // Signal the keysteps list to prepend this new item immediately
          sessionStorage.setItem("__newKeyStep", JSON.stringify(newStep));
        } else {
          sessionStorage.setItem("__updatedKeyStep", JSON.stringify(newStep));
        }
      } catch { /* ignore if body already consumed */ }

      toast({
        title: "Success",
        description: keyStepId ? "Key step updated successfully!" : "Key step created successfully!",
      });

      // Navigate back immediately — no delay
      const backUrl = selectedProjectId ? `/key-steps?projectId=${selectedProjectId}` : "/key-steps";
      setLocation(backUrl);
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const selectedProjectObj = projects.find((p: any) => String(p.id) === String(selectedProjectId));
  const projectName = selectedProjectObj?.title || "Unknown Project";

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => {
              const backUrl = selectedProjectId ? `/key-steps?projectId=${selectedProjectId}` : "/key-steps";
              setLocation(backUrl);
            }}
            className="hover:bg-slate-200 p-2 rounded-lg"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">{keyStepId ? "Edit Key Step" : "Create New Key Step"}</h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium">
              {keyStepId ? `Project: ${projectName}` : "Step Details"}
            </p>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-lg border p-8 shadow-sm">
          <div className="space-y-6">

            {/* Project Selection (only for new steps) */}
            {!keyStepId && (
              <div className="grid gap-2">
                <Label htmlFor="projectId">Project *</Label>
                <Select
                  value={selectedProjectId || ""}
                  onValueChange={(val) => setSelectedProjectId(val)}
                >
                  <SelectTrigger className={!selectedProjectId ? "border-red-200 shadow-sm" : "shadow-sm"}>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {projects.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedProjectId && <p className="text-[10px] text-red-500 font-medium">Please select a project to attach this step to</p>}
              </div>
            )}

            {/* Title Field */}
            <div className="grid gap-2">
              <Label htmlFor="title">Step Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Initial Design Review"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={!form.title ? "border-red-200" : ""}
              />
              <p className="text-xs text-muted-foreground">Required field</p>
            </div>



            {/* Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select value={form.status} onValueChange={(val: any) => setForm({ ...form, status: val })}>
                  <SelectTrigger>
                    <SelectValue>
                      {form.status
                        ? form.status.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())
                        : "Select status"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not started">Not Started</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="grid gap-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  type="date"
                  id="startDate"
                  value={form.startDate}
                  onChange={(e) => {
                    const newStartDate = e.target.value;
                    setForm((f) => ({
                      ...f,
                      startDate: newStartDate,
                      endDate:
                        f.endDate && newStartDate && f.endDate < newStartDate
                          ? newStartDate
                          : f.endDate,
                    }));
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  type="date"
                  id="endDate"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(e) => {
                    const newEndDate = e.target.value;
                    setForm((f) => ({
                      ...f,
                      endDate:
                        f.startDate && newEndDate && newEndDate < f.startDate
                          ? f.startDate
                          : newEndDate,
                    }));
                  }}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => {
                const backUrl = selectedProjectId ? `/key-steps?projectId=${selectedProjectId}` : "/key-steps";
                setLocation(backUrl);
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
              className="bg-primary hover:bg-primary/90"
            >
              {loading ? "Saving..." : keyStepId ? "Save Changes" : "Create Step"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}