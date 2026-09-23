
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  FileText, 
  Upload, 
  Send, 
  CheckCircle2, 
  Loader2, 
  X,
  Plus,
  Mail,
  ArrowRight,
  History,
  Calendar,
  ExternalLink,
  Eye
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/components/Layout";

type Project = {
  id: string;
  title: string;
  projectCode: string;
};

type Task = {
  id: string;
  taskName: string;
};

type Subtask = {
  id: string;
  title: string;
};

type UploadedFile = {
  id?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageUrl: string;
};

type SiteReport = {
  id: string;
  notes: string;
  clientEmail: string | null;
  createdAt: string;
  projectName: string;
  engineerName: string;
  taskName: string | null;
  subtaskName: string | null;
  attachments: UploadedFile[];
};

export default function SiteEngineerReport() {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [selectedSubtaskId, setSelectedSubtaskId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("new");
  const [groupName, setGroupName] = useState("");
  const [isSaveGroupDialogOpen, setIsSaveGroupDialogOpen] = useState(false);

  // Queries
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks", selectedProjectId],
    enabled: !!selectedProjectId,
  });

  const { data: subtasks = [] } = useQuery<Subtask[]>({
    queryKey: ["/api/subtasks", selectedTaskId],
    enabled: !!selectedTaskId,
  });

  const { data: reportHistory = [], isLoading: isLoadingHistory } = useQuery<SiteReport[]>({
    queryKey: ["/api/site-reports"],
  });

  const { data: groups = [] } = useQuery<any[]>({
    queryKey: ["/api/email-groups"],
  });

  // Mutations
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/site-reports/upload", {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem("knockturn_token")}`,
        },
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json() as Promise<UploadedFile[]>;
    },
    onSuccess: (data) => {
      setAttachments(prev => [...prev, ...data]);
      toast({ title: "Success", description: `${data.length} files uploaded` });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to upload files" });
    },
    onSettled: () => setIsUploading(false),
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/site-reports", data);
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({ 
        title: "Report Submitted", 
        description: variables.sendEmail ? "Report saved and email sent to client" : "Report saved successfully" 
      });
      // Reset form
      setNotes("");
      setClientEmail("");
      setAttachments([]);
      setSelectedSubtaskId("");
      queryClient.invalidateQueries({ queryKey: ["/api/site-reports"] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to submit report" });
    },
  });

  const saveGroupMutation = useMutation({
    mutationFn: async (data: { name: string, emails: string }) => {
      const res = await apiRequest("POST", "/api/email-groups", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Group Saved", description: "Email group created successfully" });
      setIsSaveGroupDialogOpen(false);
      setGroupName("");
      queryClient.invalidateQueries({ queryKey: ["/api/email-groups"] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to save group" });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    uploadMutation.mutate(formData);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (sendEmail: boolean) => {
    if (!selectedProjectId) {
      toast({ variant: "destructive", title: "Error", description: "Please select a project" });
      return;
    }
    if (sendEmail && !clientEmail) {
      toast({ variant: "destructive", title: "Error", description: "Recipient email is required to send report" });
      return;
    }

    submitMutation.mutate({
      projectId: selectedProjectId,
      taskId: selectedTaskId,
      subtaskId: selectedSubtaskId,
      notes,
      clientEmail,
      attachments,
      sendEmail
    });
  };

  const isFormValid = selectedProjectId && notes.trim();

  return (
    <div className="container max-w-6xl py-8 space-y-8 animate-in fade-in duration-500">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Site Engineer Dashboard
            </h1>
            <p className="text-muted-foreground text-sm">
              Document site progress, attach evidence, and communicate with clients.
            </p>
          </div>
          <TabsList className="grid grid-cols-2 w-full md:w-auto">
            <TabsTrigger value="new" className="gap-2">
              <Plus className="h-4 w-4" />
              New Report
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="new" className="mt-0 space-y-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Selection Column */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-none shadow-md bg-muted/30">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Context Selection
                </CardTitle>
                <CardDescription>Specify which project and task you're reporting for</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Select value={selectedProjectId} onValueChange={(val) => { setSelectedProjectId(val); setSelectedTaskId(""); setSelectedSubtaskId(""); }}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select Project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.title} ({p.projectCode})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className={!selectedProjectId ? "opacity-50" : ""}>Task (Optional)</Label>
                  <Select value={selectedTaskId} onValueChange={(val) => { setSelectedTaskId(val); setSelectedSubtaskId(""); }} disabled={!selectedProjectId}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={selectedProjectId ? "Select Task" : "Select Project First"} />
                    </SelectTrigger>
                    <SelectContent>
                      {tasks.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.taskName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className={!selectedTaskId ? "opacity-50" : ""}>Subtask (Optional)</Label>
                  <Select value={selectedSubtaskId} onValueChange={setSelectedSubtaskId} disabled={!selectedTaskId}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={selectedTaskId ? "Select Subtask" : "Select Task First"} />
                    </SelectTrigger>
                    <SelectContent>
                      {subtasks.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                   <Calendar className="h-4 w-4" />
                   Reporting Period
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{format(new Date(), "PP")}</p>
                <p className="text-xs text-muted-foreground mt-1">Logged as {user?.name || "Self"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Form Column */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-lg border-primary/10 overflow-hidden">
              <div className="h-1 bg-primary w-full" />
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Observations & Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea 
                    id="notes"
                    placeholder="Enter today's updates, site conditions, issues, or specific milestones achieved..."
                    className="min-h-[120px] resize-none focus-visible:ring-primary border-muted-foreground/20"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      Attachments 
                      <Badge variant="outline" className="text-[10px] uppercase">{attachments.length}</Badge>
                    </Label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 gap-2 border-dashed hover:bg-primary/5"
                      onClick={() => document.getElementById("file-upload")?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Add Evidence / Docs
                    </Button>
                    <input 
                      type="file" 
                      id="file-upload" 
                      multiple 
                      hidden 
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                      onChange={handleFileUpload}
                    />
                  </div>

                  {attachments.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {attachments.map((file, idx) => (
                        <div key={idx} className="flex flex-col gap-2 p-2 bg-muted/40 rounded-xl group relative border border-border/50">
                          <div className="aspect-video shrink-0 bg-background rounded-lg flex items-center justify-center shadow-sm overflow-hidden">
                            {file.mimeType.includes("image") ? (
                               <img src={file.storageUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                            ) : (
                               <div className="flex flex-col items-center gap-1">
                                 <FileText className="h-8 w-8 text-primary/40" />
                                 <span className="text-[10px] font-bold opacity-30 uppercase">
                                   {file.mimeType.includes("pdf") ? "PDF" : 
                                    file.mimeType.includes("sheet") || file.mimeType.includes("excel") ? "XLS" :
                                    file.mimeType.includes("word") || file.mimeType.includes("officedocument") ? "DOC" : "FILE"}
                                 </span>
                               </div>
                            )}
                          </div>
                          <div className="px-1 flex items-center justify-between">
                            <p className="text-[10px] font-medium truncate max-w-[80px]">{file.fileName}</p>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-5 w-5 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeAttachment(idx)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border border-dashed rounded-xl p-8 text-center bg-muted/5 group hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => document.getElementById("file-upload")?.click()}>
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-20 group-hover:scale-110 transition-transform" />
                      <p className="text-sm text-muted-foreground italic">Drag and drop or click to upload</p>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <Label htmlFor="email">Email Distribution</Label>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <Input 
                        id="email"
                        type="text"
                        placeholder="client@clientcompany.com, boss@company.com"
                        value={clientEmail}
                        onChange={e => setClientEmail(e.target.value)}
                        className="flex-1 focus-visible:ring-primary"
                      />
                      
                      <Dialog open={isSaveGroupDialogOpen} onOpenChange={setIsSaveGroupDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={!clientEmail}>
                            Save Group
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Save Email Group</DialogTitle>
                            <DialogDescription>Enter a name for this group of emails.</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>Group Name</Label>
                              <Input 
                                placeholder="e.g. Client Team, Management"
                                value={groupName}
                                onChange={e => setGroupName(e.target.value)}
                              />
                            </div>
                            <Button 
                              className="w-full" 
                              onClick={() => saveGroupMutation.mutate({ name: groupName, emails: clientEmail })}
                              disabled={!groupName || saveGroupMutation.isPending}
                            >
                              {saveGroupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                              Save Group
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {groups.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-[10px] text-muted-foreground self-center">Load Group:</span>
                        {groups.map(g => (
                          <Badge 
                            key={g.id} 
                            variant="secondary" 
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                            onClick={() => {
                              const existing = clientEmail ? clientEmail.split(',').map(e => e.trim()) : [];
                              const newEmails = g.emails.split(',').map((e: string) => e.trim());
                              const merged = Array.from(new Set([...existing, ...newEmails])).filter(Boolean).join(', ');
                              setClientEmail(merged);
                            }}
                          >
                            {g.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Recipients will receive a professional HTML summary with all attachments.</p>
                </div>
              </CardContent>
              <div className="px-6 py-4 bg-muted/30 border-t flex flex-col sm:flex-row gap-3">
                <Button 
                  variant="secondary" 
                  className="flex-1"
                  onClick={() => handleSubmit(false)}
                  disabled={!isFormValid || submitMutation.isPending}
                >
                  {submitMutation.isPending && !clientEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Internal Log
                </Button>
                <Button 
                  className="flex-1 gap-2 shadow-lg shadow-primary/20"
                  onClick={() => handleSubmit(true)}
                  disabled={!isFormValid || !clientEmail || submitMutation.isPending}
                >
                  {submitMutation.isPending && clientEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Finalize & Dispatch Report
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="history" className="mt-0">
        <Card className="shadow-md border-none bg-muted/10">
          <CardHeader>
            <CardTitle>Recent Internal Reports</CardTitle>
            <CardDescription>Browse through previously logged site updates and dispatched emails.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Fetching your reporting history...</p>
              </div>
            ) : reportHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 border-2 border-dashed rounded-2xl">
                <History className="h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No reports found yet. Start by logging your first site visit.</p>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("new")}>Create Your First Report</Button>
              </div>
            ) : (
              <div className="rounded-xl border bg-background overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[120px]">Date</TableHead>
                      <TableHead>Project & Task</TableHead>
                      <TableHead className="hidden md:table-cell">Observations</TableHead>
                      <TableHead className="w-[100px]">Evidence</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportHistory.map((report) => (
                      <TableRow key={report.id} className="group hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">
                          {format(new Date(report.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-foreground">{report.projectName}</span>
                            {report.taskName && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <ArrowRight className="h-2.5 w-2.5" />
                                {report.taskName}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell max-w-[300px]">
                          <p className="text-xs text-muted-foreground line-clamp-2 italic">
                            "{report.notes}"
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex -space-x-2 overflow-hidden">
                            {report.attachments.slice(0, 3).map((att, i) => (
                              <div key={i} className="inline-block h-6 w-6 rounded-full ring-2 ring-background bg-muted overflow-hidden border border-border/50">
                                {att.mimeType.includes("image") ? (
                                  <img src={att.storageUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <FileText className="h-full w-full p-1 text-primary/60" />
                                )}
                              </div>
                            ))}
                            {report.attachments.length > 3 && (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-background bg-primary/10 text-[8px] font-bold text-primary border border-primary/20">
                                +{report.attachments.length - 3}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {report.clientEmail ? (
                            <Badge variant="secondary" className="text-[9px] uppercase bg-green-500/10 text-green-600 border-green-500/20">
                              <Mail className="h-2 w-2 mr-1" />
                              Emailed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] uppercase opacity-50">
                              Internal
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <div className="flex items-center justify-between border-b pb-4 mb-4">
                                  <div>
                                    <DialogTitle className="text-xl">{report.projectName}</DialogTitle>
                                    <DialogDescription>
                                      Reported on {format(new Date(report.createdAt), "PPP")} by {report.engineerName}
                                    </DialogDescription>
                                  </div>
                                  <div className="text-right">
                                    {report.clientEmail && (
                                      <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20">
                                        Dispatched to: {report.clientEmail}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </DialogHeader>

                              <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                  {report.taskName && (
                                    <div className="space-y-1">
                                      <Label className="text-[10px] uppercase text-muted-foreground">Task</Label>
                                      <p className="text-sm font-medium">{report.taskName}</p>
                                    </div>
                                  )}
                                  {report.subtaskName && (
                                    <div className="space-y-1">
                                      <Label className="text-[10px] uppercase text-muted-foreground">Subtask</Label>
                                      <p className="text-sm font-medium">{report.subtaskName}</p>
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-[10px] uppercase text-muted-foreground">Progress Notes</Label>
                                  <div className="p-4 bg-muted/30 rounded-lg text-sm leading-relaxed whitespace-pre-wrap">
                                    {report.notes}
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <Label className="text-[10px] uppercase text-muted-foreground">Evidence/Attachments ({report.attachments.length})</Label>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {report.attachments.map((att, i) => (
                                      <div key={i} className="group relative aspect-video bg-muted rounded-lg overflow-hidden border">
                                        {att.mimeType.includes("image") ? (
                                          <img src={att.storageUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-110" />
                                        ) : (
                                          <div className="h-full w-full flex flex-col items-center justify-center gap-2">
                                            <FileText className="h-8 w-8 text-primary/40" />
                                            <span className="text-[10px] font-bold opacity-30 uppercase">
                                              {att.mimeType.includes("pdf") ? "PDF" : 
                                               att.mimeType.includes("sheet") || att.mimeType.includes("excel") ? "XLS" :
                                               att.mimeType.includes("word") || att.mimeType.includes("officedocument") ? "DOC" : "FILE"}
                                            </span>
                                          </div>
                                        )}
                                        <a 
                                          href={att.storageUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                                        >
                                          <Button size="sm" variant="secondary" className="h-8 gap-2">
                                            <ExternalLink className="h-3 w-3" />
                                            Open
                                          </Button>
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>
    </div>
  );
}
