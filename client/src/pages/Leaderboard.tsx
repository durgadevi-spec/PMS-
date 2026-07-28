import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/components/Layout";
import { apiFetch } from "@/lib/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Medal, Search, Download, Star, CheckCircle2, Clock, ExternalLink } from "lucide-react";

const RANK_STYLES: Record<number, { bg: string; text: string; icon: string }> = {
  1: { bg: "bg-gradient-to-r from-yellow-400 to-amber-500", text: "text-white", icon: "🥇" },
  2: { bg: "bg-gradient-to-r from-slate-300 to-slate-400", text: "text-white", icon: "🥈" },
  3: { bg: "bg-gradient-to-r from-amber-600 to-orange-500", text: "text-white", icon: "🥉" },
};

function RankBadge({ rank }: { rank: number }) {
  const style = RANK_STYLES[rank];
  if (style) {
    return (
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-lg font-bold shadow-md ${style.bg} ${style.text}`}>
        {style.icon}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-muted text-muted-foreground text-sm font-bold">
      {rank}
    </span>
  );
}

function PointsBar({ points, max }: { points: number; max: number }) {
  const pct = max > 0 ? Math.round((points / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{points}</span>
    </div>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [department, setDepartment] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = department && department !== "all" ? `?department=${encodeURIComponent(department)}` : "";
    apiFetch(`/api/performance/leaderboard${params}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        setLeaderboard(data);
        const depts = Array.from(new Set(data.map((d: any) => d.department).filter(Boolean))).sort();
        setDepartments(depts as string[]);
      })
      .catch(() => setLeaderboard([]))
      .finally(() => setLoading(false));
  }, [department]);

  const filtered = leaderboard.filter(e =>
    !search || e.name?.toLowerCase().includes(search.toLowerCase())
  );

  const maxPoints = leaderboard[0]?.totalPoints || 1;

  const handleExportCSV = () => {
    const header = ["Rank", "Name", "Department", "Total Points", "Tasks Completed", "Total Tasks"];
    const rows = filtered.map(e => [e.rank, e.name, e.department, e.totalPoints, e.tasksCompleted, e.totalTasks]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "leaderboard.csv"; a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-indigo-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 py-6">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-yellow-400/20 rounded-full">
              <Trophy className="h-12 w-12 text-yellow-400" />
            </div>
          </div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 bg-clip-text text-transparent">
            Performance Leaderboard
          </h1>
          <p className="text-purple-300 text-sm">Ranked by total performance points — top performers across the organization</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employee…"
              className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-purple-300 focus:border-purple-400"
            />
          </div>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-52 bg-white/10 border-white/20 text-white">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="border-white/20 text-white hover:bg-white/10">
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>

        {/* Top 3 Podium */}
        {!loading && filtered.length >= 3 && (
          <div className="grid grid-cols-3 gap-4 mb-2">
            {[filtered[1], filtered[0], filtered[2]].map((e, i) => {
              const realRank = i === 0 ? 2 : i === 1 ? 1 : 3;
              const heights = ["h-28", "h-36", "h-24"];
              return (
                <div key={e.employeeId} className={`flex flex-col items-center justify-end ${heights[i]}`}>
                  <div className={`w-full rounded-t-2xl p-4 text-center ${RANK_STYLES[realRank].bg}`}>
                    <div className="text-2xl mb-1">{RANK_STYLES[realRank].icon}</div>
                    <p className="font-bold text-sm text-white truncate">{e.name}</p>
                    <p className="text-xs text-white/80">{e.totalPoints} pts</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Leaderboard Table */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-48 text-purple-300">Loading leaderboard…</div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-purple-300">No employees found.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {filtered.map((e) => (
                  <div
                    key={e.employeeId}
                    className={`flex items-center gap-4 px-6 py-4 transition-colors hover:bg-white/5 ${e.rank <= 3 ? "bg-white/5" : ""}`}
                  >
                    <RankBadge rank={e.rank} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white truncate">{e.name}</p>
                        {e.rank === 1 && <Star className="h-4 w-4 text-yellow-400 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-purple-300">{e.department}</p>
                    </div>

                    <div className="w-40 hidden md:block">
                      <PointsBar points={e.totalPoints} max={maxPoints} />
                    </div>

                    <div className="flex items-center gap-4 text-right flex-shrink-0">
                      <div className="hidden sm:block">
                        <p className="text-xs text-purple-300">Completed</p>
                        <p className="text-sm font-semibold text-white">{e.tasksCompleted}<span className="text-purple-400 text-xs">/{e.totalTasks}</span></p>
                      </div>
                      <div>
                        <p className="text-xs text-purple-300">Points</p>
                        <p className="text-lg font-black text-yellow-400">{e.totalPoints}</p>
                      </div>
                      {isAdmin && (
                        <Link to={`/performance/${e.employeeId}`}>
                          <Button variant="ghost" size="icon" className="text-purple-300 hover:text-white hover:bg-white/10 h-8 w-8">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-purple-400 pb-4">
          Points are auto-calculated when tasks are completed · Max 5 pts per task
        </p>
      </div>
    </div>
  );
}
