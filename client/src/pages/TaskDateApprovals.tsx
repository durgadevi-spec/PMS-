import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type DateExtensionRequest = {
  id: string;
  taskId: string;
  projectId: string;
  employeeName: string;
  projectName: string;
  taskName: string;
  originalStartDate: string | null;
  originalEndDate: string | null;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedAt: string;
};

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

const formatRange = (start: string | null, end: string | null) => {
  if (!start && !end) return "—";
  return `${formatDate(start)} – ${formatDate(end)}`;
};

export default function TaskDateApprovals() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<DateExtensionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [taskFilter, setTaskFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiFetch("/api/admin/task-date-extension-requests", { bypassCache: true });
      if (!response.ok) throw new Error("Unable to load task date requests.");
      setRequests(await response.json());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load task date requests.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const filteredRequests = useMemo(() => requests.filter((request) => {
    const requestedDate = request.requestedAt?.slice(0, 10) || "";
    return (
      (!employeeFilter || request.employeeName.toLowerCase().includes(employeeFilter.toLowerCase())) &&
      (!projectFilter || request.projectName.toLowerCase().includes(projectFilter.toLowerCase())) &&
      (!taskFilter || request.taskName.toLowerCase().includes(taskFilter.toLowerCase())) &&
      (!fromDate || requestedDate >= fromDate) &&
      (!toDate || requestedDate <= toDate) &&
      (statusFilter === "All" || request.status === statusFilter)
    );
  }), [requests, employeeFilter, projectFilter, taskFilter, fromDate, toDate, statusFilter]);

  const reviewRequest = async (request: DateExtensionRequest, action: "approve" | "reject") => {
    setBusyRequestId(request.id);
    try {
      const response = await apiFetch(`/api/admin/task-date-extension-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to review this request.");
      toast({
        title: action === "approve" ? "Request approved" : "Request rejected",
        description: action === "approve"
          ? "The task dates and dependent schedule have been updated."
          : "The original task dates were retained.",
      });
      await loadRequests();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Review failed",
        description: error instanceof Error ? error.message : "Unable to review this request.",
      });
    } finally {
      setBusyRequestId(null);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Task Date Approvals</h1>
        <p className="text-sm text-slate-500 mt-1">Review task date changes that require Admin approval.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Input aria-label="Filter by employee" placeholder="Employee" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} />
          <Input aria-label="Filter by project" placeholder="Project" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} />
          <Input aria-label="Filter by task" placeholder="Task" value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} />
          <label className="space-y-1 text-xs text-slate-500">
            <span>Submitted from</span>
            <Input aria-label="Submitted from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-slate-500">
            <span>Submitted to</span>
            <Input aria-label="Submitted to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <select
            aria-label="Approval status"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {["All", "Pending", "Approved", "Rejected"].map((status) => <option key={status}>{status}</option>)}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Loading requests…</p>
          ) : loadError ? (
            <div className="p-6 text-sm text-red-700">
              <p>{loadError}</p>
              <Button className="mt-3" variant="outline" onClick={() => void loadRequests()}>Retry</Button>
            </div>
          ) : filteredRequests.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No date extension requests match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1150px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Project / Task</th>
                    <th className="px-4 py-3">Original dates</th>
                    <th className="px-4 py-3">Requested dates</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-slate-800">{request.employeeName}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{request.projectName}</div>
                        <div className="text-xs text-slate-500">{request.taskName}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatRange(request.originalStartDate, request.originalEndDate)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium">{formatRange(request.requestedStartDate, request.requestedEndDate)}</td>
                      <td className="px-4 py-3 max-w-xs whitespace-pre-wrap">{request.reason}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(request.requestedAt)}</td>
                      <td className="px-4 py-3">
                        <Badge className={
                          request.status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                            request.status === "Rejected" ? "bg-rose-100 text-rose-800" :
                              "bg-amber-100 text-amber-800"
                        }>{request.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {request.status === "Pending" ? (
                          <div className="flex gap-2">
                            <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" disabled={busyRequestId === request.id} onClick={() => void reviewRequest(request, "approve")}>
                              <Check size={14} className="mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-rose-700" disabled={busyRequestId === request.id} onClick={() => void reviewRequest(request, "reject")}>
                              <X size={14} className="mr-1" /> Reject
                            </Button>
                          </div>
                        ) : <span className="text-xs text-slate-400">Reviewed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
