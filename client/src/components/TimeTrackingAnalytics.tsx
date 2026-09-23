import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiClient";
import { Clock, Users, TrendingUp, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from "recharts";

interface TimeEntry {
  employeeId: string;
  email: string;
  name: string;
  hoursSpent: number;
  entriesCount: number;
  tasks: string[];
}

interface TimeTrackingData {
  projectId: string;
  projectTitle: string;
  totalMembers: number;
  totalHours: number;
  timeEntries: TimeEntry[];
  lastWorkedAt?: string | null;
}

export function TimeTrackingAnalytics({ projectId }: { projectId: string }) {
  const [data, setData] = useState<TimeTrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    const fetchTimeEntries = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await apiFetch(`/api/projects/${projectId}/time-entries`);

        if (!response.ok) {
          if (response.status === 404) {
            setError("Project not found");
          } else {
            setError("Failed to fetch time tracking data");
          }
          setData(null);
          return;
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error("Error fetching time entries:", err);
        setError("Failed to load time tracking data");
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTimeEntries();
  }, [projectId]);

  if (loading) {
    return (
      <div className="pt-4 border-t border-muted/40 space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Time Tracking</p>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground animate-pulse" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-4 border-t border-muted/40 space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Time Tracking</p>
        <div className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 border border-amber-200">
          {error}
        </div>
        <p className="text-xs text-muted-foreground">Note: Make sure Timestrap database is configured and contains time entries for this project.</p>
      </div>
    );
  }

  if (!data || data.totalMembers === 0) {
    return (
      <div className="pt-4 border-t border-muted/40 space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Time Tracking</p>
        <div className="text-xs text-muted-foreground">No time entries found for this project</div>
      </div>
    );
  }

  const topContributor = data.timeEntries[0];
  const totalHours = data.totalHours;
  const pieData = data.timeEntries.map((entry) => ({
    name: entry.name || entry.email,
    value: entry.hoursSpent,
  }));

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };
  const chartColors = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#F97316", "#22C55E"];

  return (
    <div className="pt-4 border-t border-muted/40 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Time Tracking</p>
          {data.lastWorkedAt ? (
            <p className="text-xs text-slate-500">Last worked: {formatRelativeDate(data.lastWorkedAt)}</p>
          ) : (
            <p className="text-xs text-slate-500">No recent Timestrap activity found</p>
          )}
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs hover:bg-blue-50"
            >
              View Details
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Time Tracking Details</DialogTitle>
              <DialogDescription>
                Team members' time spent on {data.projectTitle}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Card className="col-span-1">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground mb-1">Members</p>
                      <p className="text-2xl font-bold text-blue-600">{data.totalMembers}</p>
                    </CardContent>
                  </Card>
                  <Card className="col-span-1">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground mb-1">Total Hours</p>
                      <p className="text-2xl font-bold text-emerald-600">{totalHours.toFixed(1)}</p>
                    </CardContent>
                  </Card>
                  <Card className="col-span-1">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground mb-1">Avg/Member</p>
                      <p className="text-2xl font-bold text-amber-600">
                        {(totalHours / data.totalMembers).toFixed(1)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-900">Hours Distribution</p>
                    <p className="text-xs text-slate-500">Share of hours by team member</p>
                  </div>
                  <div className="flex justify-center">
                    <PieChart width={180} height={150}>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={67}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: number) => [`${value.toFixed(1)} hrs`, "Hours"]}
                        wrapperStyle={{ fontSize: 12 }}
                      />
                    </PieChart>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {pieData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-700 shadow-sm">
                        <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                        <span className="truncate">{entry.name}: {entry.value.toFixed(1)} hrs</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900 mb-3">Team Member Breakdown</p>
                <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">
                  {data.timeEntries.map((entry, index) => (
                    <div
                      key={entry.employeeId}
                      className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">
                            {entry.name || entry.email}
                          </span>
                          {index === 0 && (
                            <Badge className="bg-amber-100 text-amber-700 text-xs">
                              Top Contributor
                            </Badge>
                          )}
                        </div>

                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Hours Logged:</span>
                            <span className="font-semibold text-emerald-600">
                              {entry.hoursSpent.toFixed(1)} hrs
                            </span>
                          </div>
                          <Progress
                            value={(entry.hoursSpent / totalHours) * 100}
                            className="h-2"
                          />
                          <div className="flex justify-between items-center text-xs text-muted-foreground">
                            <span>{((entry.hoursSpent / totalHours) * 100).toFixed(0)}% of total</span>
                            <span>{entry.entriesCount} entries</span>
                          </div>
                        </div>

                        {entry.tasks && entry.tasks.length > 0 && (
                          <div className="mt-2 text-xs text-slate-600">
                            <span className="font-medium">Tasks: </span>
                            {entry.tasks.slice(0, 2).join(", ")}
                            {entry.tasks.length > 2 && ` +${entry.tasks.length - 2} more`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
          </Dialog>
      </div>

      {/* Quick Summary Card */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
        <CardContent className="pt-4">
          <div className="space-y-3">
            {/* Total Hours */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-slate-700">Total Hours</span>
              </div>
              <span className="text-lg font-bold text-blue-600">{totalHours.toFixed(1)}</span>
            </div>

            {/* Team Members */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium text-slate-700">Team Members</span>
              </div>
              <span className="text-lg font-bold text-emerald-600">{data.totalMembers}</span>
            </div>

            {/* Top Contributor */}
            {data.lastWorkedAt && (
              <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                <div className="text-sm font-medium text-slate-700">Last Worked</div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-900">
                    {formatRelativeDate(data.lastWorkedAt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(data.lastWorkedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
            )}
            {topContributor && (
              <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-slate-700">Top Contributor</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-amber-700">
                    {topContributor.name || "Unknown"}
                  </p>
                  <p className="text-xs text-amber-600 font-medium">
                    {topContributor.hoursSpent.toFixed(1)} hrs
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* List Preview (if multiple members) */}
      {data.totalMembers > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Team Contribution</p>
          <div className="space-y-1.5">
            {data.timeEntries.slice(0, 3).map((entry) => (
              <div key={entry.employeeId} className="flex items-center gap-2 text-xs">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">
                    {entry.name?.charAt(0) || entry.email?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{entry.name || entry.email}</p>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700 text-xs" variant="secondary">
                  {entry.hoursSpent.toFixed(1)} hrs
                </Badge>
              </div>
            ))}
            {data.totalMembers > 3 && (
              <p className="text-xs text-muted-foreground text-center py-1">
                +{data.totalMembers - 3} more members
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
