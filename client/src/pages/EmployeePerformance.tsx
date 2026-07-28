import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/components/Layout";
import { apiFetch } from "@/lib/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import {
  Trophy, Star, CheckCircle2, Clock, AlertTriangle, TrendingUp, Users, Briefcase, Download, ArrowLeft
} from "lucide-react";

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a855f7", "#3b82f6", "#ec4899"];

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <Card className="relative overflow-hidden border-0 shadow-md bg-white dark:bg-slate-900">
      <div className={`absolute inset-0 opacity-5 ${color}`} />
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`p-3 rounded-xl ${color} bg-opacity-15`}>
          <Icon className={`h-6 w-6 ${color.replace("bg-", "text-")}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const POINT_COLORS: Record<number, string> = { 5: "bg-emerald-500", 4: "bg-blue-500", 3: "bg-amber-400", 2: "bg-orange-400", 1: "bg-red-500", 0: "bg-slate-300" };
const POINT_LABELS: Record<number, string> = { 5: "Early", 4: "On Time", 3: "Grace", 2: "Late", 1: "Very Late", 0: "N/A" };

export default function EmployeePerformance() {
  const params = useParams<{ employeeId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [employeeId, setEmployeeId] = useState(params.employeeId || user?.employeeId || "");
  const [employees, setEmployees] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdmin) apiFetch("/api/employees").then(r => r.ok ? r.json() : []).then(setEmployees).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    apiFetch(`/api/performance/employee/${employeeId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [employeeId]);

  const barData = (data?.projectBreakdown || []).map((p: any) => ({ name: p.projectName.slice(0, 18), hours: p.hours }));
  const pieData = (data?.projectBreakdown || []).map((p: any) => ({ name: p.projectName.slice(0, 18), value: p.hours }));

  const handleExport = () => {
    if (!data) return;
    const rows = [
      ["Employee", data.employee?.name],
      ["Department", data.employee?.department],
      ["Total Points", data.totalPoints],
      ["Avg Points / Task", data.avgPoints],
      ["Completed Tasks", data.completedTasks],
      ["Delayed Tasks", data.delayedTasks],
      ["Ownership Success Rate", `${data.ownershipSuccessRate}%`],
      ["Contribution Hours", data.contributionHours],
      ["Projects Contributed", data.projectsContributed],
      ["Tasks Worked", data.tasksWorked],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `performance_${data.employee?.name}.csv`; a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl">
              <Trophy className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Employee Performance</h1>
              <p className="text-sm text-muted-foreground">Ownership, contribution & scoring dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select Employee…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!data}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64 text-muted-foreground">Loading performance data…</div>
        )}

        {!loading && !data && (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {isAdmin ? "Select an employee to view their performance." : "No performance data found."}
          </div>
        )}

        {!loading && data && (
          <>
            {/* Employee Info */}
            <Card className="border-0 shadow-md bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
              <CardContent className="p-6 flex items-center gap-6">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
                  {data.employee?.name?.[0]}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{data.employee?.name}</h2>
                  <p className="text-indigo-200">{data.employee?.designation || "—"} · {data.employee?.department || "—"}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Star className="h-8 w-8 text-yellow-300" />
                  <div>
                    <p className="text-3xl font-black">{data.totalPoints}</p>
                    <p className="text-xs text-indigo-200">Total Points</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Star} label="Total Points" value={data.totalPoints} sub={`Avg ${data.avgPoints} / task`} color="bg-yellow-400" />
              <StatCard icon={CheckCircle2} label="Completed Tasks" value={data.completedTasks} sub={`of ${data.totalOwnedTasks} owned`} color="bg-emerald-500" />
              <StatCard icon={AlertTriangle} label="Delayed Tasks" value={data.delayedTasks} color="bg-orange-500" />
              <StatCard icon={TrendingUp} label="Success Rate" value={`${data.ownershipSuccessRate}%`} sub="Ownership completion" color="bg-indigo-500" />
              <StatCard icon={Clock} label="Hours Contributed" value={`${data.contributionHours}h`} sub="From TimeStrap" color="bg-cyan-500" />
              <StatCard icon={Briefcase} label="Projects Worked" value={data.projectsContributed} color="bg-purple-500" />
              <StatCard icon={Users} label="Tasks Worked" value={data.tasksWorked} sub="As team member" color="bg-pink-500" />
              <StatCard icon={Trophy} label="Avg Points" value={data.avgPoints} sub="Per completed task" color="bg-amber-500" />
            </div>

            {/* Performance Points Scale */}
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Performance Score Scale</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-3 flex-wrap">
                {[5, 4, 3, 2, 1, 0].map(pts => (
                  <div key={pts} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${POINT_COLORS[pts]}`} />
                    <span className="text-xs text-muted-foreground">{pts} pts — {POINT_LABELS[pts]}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Charts Row */}
            {barData.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-0 shadow-md">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Contribution Hours by Project</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={barData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="hours" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-md">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Contribution Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${name} (${Math.round(percent * 100)}%)`} labelLine={false}>
                          {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Project Breakdown Table */}
            {data.projectBreakdown?.length > 0 && (
              <Card className="border-0 shadow-md">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Project Contribution Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs uppercase">
                          <th className="text-left py-2 px-3">Project</th>
                          <th className="text-right py-2 px-3">Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.projectBreakdown.map((p: any, i: number) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 px-3 font-medium">{p.projectName}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{p.hours}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
