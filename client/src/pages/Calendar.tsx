import { useState } from "react";
import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  CalendarDays
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PROJECTS, USERS } from "@/lib/mockData";

export default function Projects() {
  const [projects, setProjects] = useState(PROJECTS);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openDialog, setOpenDialog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [newProject, setNewProject] = useState({
    title: "",
    clientName: "",
    description: "",
    startDate: "",
    endDate: "",
    startTime: "09:00",
    endTime: "17:00",
    team: [] as string[]
  });

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateProject = () => {
    if (!newProject.title || !newProject.startDate) return;

    const project = {
      id: `p${projects.length + 1}`,
      title: newProject.title,
      clientName: newProject.clientName,
      description: newProject.description,
      status: 'open' as const,
      progress: 0,
      startDate: newProject.startDate,
      endDate: newProject.endDate,
      startTime: newProject.startTime, // Added
      endTime: newProject.endTime,     // Added
      team: newProject.team.length > 0 ? newProject.team : ['u1'],
      milestones: []
    };

    setProjects([...projects, project]);
    setNewProject({ title: "", clientName: "", description: "", startDate: "", endDate: "", startTime: "09:00", endTime: "17:00", team: [] });
    setOpenDialog(false);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage schedules and project timelines.</p>
        </div>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Project</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>Set project duration and daily working hours.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Project Name</Label>
                  <Input value={newProject.title} onChange={(e) => setNewProject({ ...newProject, title: e.target.value })} placeholder="Project name" />
                </div>
                <div className="space-y-2">
                  <Label>Client Name</Label>
                  <Input value={newProject.clientName} onChange={(e) => setNewProject({ ...newProject, clientName: e.target.value })} placeholder="Client" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border p-3 rounded-md bg-muted/20">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase flex items-center gap-1"><Clock className="h-3 w-3" /> Start Time</Label>
                  <Input type="time" value={newProject.startTime} onChange={(e) => setNewProject({ ...newProject, startTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase flex items-center gap-1"><Clock className="h-3 w-3" /> End Time</Label>
                  <Input type="time" value={newProject.endTime} onChange={(e) => setNewProject({ ...newProject, endTime: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={newProject.startDate}
                    onChange={(e) => {
                      const newStartDate = e.target.value;
                      setNewProject((p) => ({
                        ...p,
                        startDate: newStartDate,
                        endDate: p.endDate && newStartDate && p.endDate < newStartDate ? newStartDate : p.endDate,
                      }));
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={newProject.endDate}
                    min={newProject.startDate || undefined}
                    onChange={(e) => {
                      const newEndDate = e.target.value;
                      setNewProject((p) => ({
                        ...p,
                        endDate: p.startDate && newEndDate && newEndDate < p.startDate ? p.startDate : newEndDate,
                      }));
                    }}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateProject} className="w-full">Create Project</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Main List */}
      <div className="grid gap-3">
        {filteredProjects.map(project => {
          const isExpanded = expandedId === project.id;
          return (
            <Card key={project.id} className="overflow-hidden">
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/10"
                onClick={() => setExpandedId(isExpanded ? null : project.id)}
              >
                <div className="flex items-center gap-4">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      {project.title}
                      <Badge variant="outline" className="text-[10px] uppercase">{(project as any).clientName}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      <CalendarDays className="h-3 w-3" /> {project.startDate} — {project.endDate}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden md:block">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Working Hours</p>
                    <p className="text-xs font-medium">{(project as any).startTime || "09:00"} - {(project as any).endTime || "17:00"}</p>
                  </div>
                  <Progress value={project.progress} className="w-20 h-1.5" />
                </div>
              </div>

              {isExpanded && (
                <CardContent className="border-t bg-muted/5 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Time & Duration Column */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold uppercase text-primary border-b pb-1">Schedule Details</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center bg-background p-2 rounded border">
                          <span className="text-xs text-muted-foreground">Daily Shift</span>
                          <span className="text-sm font-semibold">{(project as any).startTime || "09:00"} - {(project as any).endTime || "17:00"}</span>
                        </div>
                        <div className="flex justify-between items-center bg-background p-2 rounded border">
                          <span className="text-xs text-muted-foreground">Total Milestones</span>
                          <span className="text-sm font-semibold">{project.milestones.length}</span>
                        </div>
                      </div>
                    </div>

                    {/* Description Column */}
                    <div className="md:col-span-2 space-y-4">
                      <h4 className="text-xs font-bold uppercase text-primary border-b pb-1">Project Overview</h4>
                      <p className="text-sm text-muted-foreground">{project.description}</p>
                      <div className="flex gap-2">
                        {project.team.map(userId => {
                          const user = USERS.find(u => u.id === userId);
                          return (
                            <Avatar key={userId} className="h-7 w-7 border">
                              <AvatarImage src={user?.avatar} />
                              <AvatarFallback>{user?.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}