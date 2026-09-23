import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/apiClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function AddSubMilestone() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Parse URL params from location
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const parentId = params.get("parentId");
  const projectId = params.get("projectId");

  const [parentKeyStep, setParentKeyStep] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    requirements: "",
    phase: "1",
    status: "pending" as "pending" | "in-progress" | "completed",
    startDate: "",
    endDate: "",
  });

  // Load parent keystep data
  useEffect(() => {
    if (!parentId) {
      toast({ variant: "destructive", title: "Error", description: "Parent milestone ID not found" });
      setLocation("/key-steps");
      return;
    }

    apiFetch(`/api/key-steps/${parentId}`)
      .then(r => r.json())
      .then((data: any) => {
        setParentKeyStep(data);
        // Auto-populate from parent (but NOT description/requirements for submilestones)
        setForm({
          title: "", // User needs to enter this
          description: "", // Submilestones don't have their own descriptions
          requirements: "", // Submilestones don't have their own requirements
          phase: String(data.phase) || "1",
          status: "pending",
          startDate: data.startDate || "",
          endDate: data.endDate || "",
        });
      })
      .catch(err => {
        console.error("Failed to load parent keystep:", err);
        toast({ variant: "destructive", title: "Error", description: "Failed to load parent milestone" });
      });
  }, [parentId, setLocation, toast]);

  const handleSave = async () => {
    if (!form.title || !form.startDate || !form.endDate) {
      toast({ variant: "destructive", title: "Validation Error", description: "Title, Start Date, and End Date are required" });
      return;
    }

    if (!projectId || !parentId) {
      toast({ variant: "destructive", title: "Error", description: "Project or Parent ID missing" });
      return;
    }

    setLoading(true);

    try {
      const payload = {
        projectId,
        parentKeyStepId: parentId,
        header: "",                 // ✅ empty string, NOT null
        title: form.title.trim(),
        description: "",            // ✅ empty string
        requirements: "",           // ✅ empty string
        phase: Number(form.phase),
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate,
      };

      console.log("🔵 ADDSUBMILESTONE PAYLOAD:", payload);

      const response = await apiFetch("/api/key-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server Error (${response.status}): ${errText}`);
      }

      toast({
        title: "Created",
        description: "Sub-milestone created successfully!",
      });

      // Navigate back after a short delay
      setTimeout(() => setLocation("/key-steps"), 1000);
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setLocation("/key-steps")} className="hover:bg-slate-200 p-2 rounded-lg">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Add Sub-Milestone</h1>
            {parentKeyStep && (
              <p className="text-sm text-muted-foreground mt-1">Under: <span className="font-semibold">{parentKeyStep.title}</span></p>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg border p-8 space-y-6">
          {/* Parent Info Display */}
          {parentKeyStep && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-blue-900">Inherited from Parent Milestone:</p>
              {parentKeyStep.description && (
                <div className="text-sm text-blue-800">
                  <span className="font-medium">Description:</span> {parentKeyStep.description}
                </div>
              )}
              {parentKeyStep.requirements && (
                <div className="text-sm text-blue-800">
                  <span className="font-medium">Requirements:</span> {parentKeyStep.requirements}
                </div>
              )}
            </div>
          )}

          {/* Title (Required) */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Sub-Milestone Title *</Label>
            <Input
              placeholder="Enter sub-milestone title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="h-10"
            />
          </div>

          {/* Status and Phase */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold mb-2 block">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as any }))}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not started">Not Started</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block">Phase</Label>
              <Input
                type="number"
                min="1"
                value={form.phase}
                onChange={e => setForm(f => ({ ...f, phase: e.target.value }))}
                className="h-10"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold mb-2 block">Start Date *</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={e => {
                  const newStartDate = e.target.value;
                  setForm(f => ({
                    ...f,
                    startDate: newStartDate,
                    endDate:
                      f.endDate && newStartDate && f.endDate < newStartDate
                        ? newStartDate
                        : f.endDate,
                  }));
                }}
                className="h-10"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block">End Date *</Label>
              <Input
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={e => {
                  const newEndDate = e.target.value;
                  setForm(f => ({
                    ...f,
                    endDate:
                      f.startDate && newEndDate && newEndDate < f.startDate
                        ? f.startDate
                        : newEndDate,
                  }));
                }}
                className="h-10"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-4 justify-end border-t pt-6">
            <Button
              variant="outline"
              onClick={() => setLocation("/key-steps")}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Sub-Milestone"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}