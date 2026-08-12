import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";

interface Employee {
  id: string;
  empCode: string | null;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
}

interface UserRow {
  id: string;
  username: string;
  role: string;
  employeeId: string | null;
  employee: Employee | null;
}

type SortKey = "name" | "department" | "designation";

export default function AdminSettings() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (bypassCache = false) => {
    try {
      const [empRes, userRes, deptRes] = await Promise.all([
        apiFetch("/api/employees", { bypassCache }),
        apiFetch("/api/users", { bypassCache }),
        apiFetch("/api/departments", { bypassCache }),
      ]);
      if (empRes.ok) setEmployees(await empRes.json());
      if (userRes.ok) setUsers(await userRes.json());
      if (deptRes.ok) setDepartments(await deptRes.json());
    } catch (err: any) {
      toast({ title: "Failed to load settings data", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Centralized management for Departments, Employees, and User accounts.
        </p>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="users">User Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="mt-4">
          <EmployeesTab employees={employees} departments={departments} onChanged={() => load(true)} />
        </TabsContent>

        <TabsContent value="departments" className="mt-4">
          <DepartmentsTab departments={departments} employees={employees} onChanged={() => load(true)} />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersTab users={users} employees={employees} onChanged={() => load(true)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ===============================
   Employees Tab
================================ */
function EmployeesTab({
  employees,
  departments,
  onChanged,
}: {
  employees: Employee[];
  departments: string[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);

  const filtered = useMemo(() => {
    let list = [...employees];
    if (deptFilter !== "all") list = list.filter((e) => e.department === deptFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.empCode?.toLowerCase().includes(q) ||
          e.email?.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => (a[sortKey] || "").localeCompare(b[sortKey] || ""));
    return list;
  }, [employees, search, deptFilter, sortKey]);

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await apiFetch(`/api/employees/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to delete employee");
      }
      toast({ title: "Employee deleted" });
      onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't delete employee", description: err?.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex flex-col md:flex-row gap-3 flex-1 w-full">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-full md:w-44">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="department">Sort: Department</SelectItem>
              <SelectItem value="designation">Sort: Designation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-2 h-4 w-4" /> Add Employee
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Emp Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.empCode || "—"}</TableCell>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{e.designation || "—"}</TableCell>
                  <TableCell>{e.department ? <Badge variant="outline">{e.department}</Badge> : "—"}</TableCell>
                  <TableCell>{e.email || "—"}</TableCell>
                  <TableCell>{e.phone || "—"}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(e)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(e)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No employees found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <EmployeeDialog
          employee={editing === "new" ? null : editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleting?.name}. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmployeeDialog({
  employee,
  departments,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  departments: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [empCode, setEmpCode] = useState(employee?.empCode || "");
  const [name, setName] = useState(employee?.name || "");
  const [designation, setDesignation] = useState(employee?.designation || "");
  const [department, setDepartment] = useState(employee?.department || "");
  const [email, setEmail] = useState(employee?.email || "");
  const [phone, setPhone] = useState(employee?.phone || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = { empCode: empCode || null, name, designation, department, email, phone };
      const res = employee
        ? await apiFetch(`/api/employees/${employee.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetch("/api/employees", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to save employee");
      }
      toast({ title: employee ? "Employee updated" : "Employee created" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Couldn't save employee", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{employee ? "Edit Employee" : "Add Employee"}</DialogTitle>
          <DialogDescription>Manage master employee details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Employee Code</Label>
              <Input value={empCode} onChange={(e) => setEmpCode(e.target.value)} placeholder="E0001" />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Designation</Label>
              <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
            </div>
            <div>
              <Label>Department</Label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Engineering"
                list="dept-suggestions"
              />
              <datalist id="dept-suggestions">
                {departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===============================
   Departments Tab
================================ */
function DepartmentsTab({
  departments,
  employees,
  onChanged,
}: {
  departments: string[];
  employees: Employee[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDept, setCreateDept] = useState("");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    employees.forEach((e) => {
      if (e.department) m.set(e.department, (m.get(e.department) || 0) + 1);
    });
    return m;
  }, [employees]);

  const filtered = departments.filter((d) => d.toLowerCase().includes(search.trim().toLowerCase()));

  const submitRename = async () => {
    if (!renaming || !newName.trim()) return;
    try {
      const res = await apiFetch("/api/departments/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: renaming, newName: newName.trim() }),
      });
      if (!res.ok) throw new Error("Rename failed");
      toast({ title: "Department renamed" });
      setRenaming(null);
      onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't rename department", description: err?.message, variant: "destructive" });
    }
  };

  const submitDelete = async () => {
    if (!deleting) return;
    try {
      const res = await apiFetch(`/api/departments/${encodeURIComponent(deleting)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "Department removed" });
      setDeleting(null);
      onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't remove department", description: err?.message, variant: "destructive" });
    }
  };

  const submitCreate = async () => {
    if (!createDept.trim()) {
      toast({ title: "Enter a department name", variant: "destructive" });
      return;
    }
    try {
      const res = await apiFetch(`/api/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createDept.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to create department");
      }
      toast({ title: "Department created" });
      setCreating(false);
      setCreateDept("");
      onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't create department", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search departments..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Department
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d}>
                  <TableCell className="font-medium">{d}</TableCell>
                  <TableCell>{counts.get(d) || 0}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => { setRenaming(d); setNewName(d); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(d)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    No departments found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Department</DialogTitle>
            <DialogDescription>Updates the department record and every employee or project assigned to "{renaming}".</DialogDescription>
          </DialogHeader>
          <div>
            <Label>New Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button onClick={submitRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Department</DialogTitle>
            <DialogDescription>
              Saved permanently — it will be available in every department dropdown right away, even before any employee or project uses it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Department Name</Label>
              <Input value={createDept} onChange={(e) => setCreateDept(e.target.value)} placeholder="e.g. Quality Assurance" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={submitCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove department?</AlertDialogTitle>
            <AlertDialogDescription>
              {counts.get(deleting || "") ? `${counts.get(deleting || "")} employee(s) will be unassigned from "${deleting}".` : "This department has no employees."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ===============================
   Users Tab
================================ */
function UsersTab({
  users,
  employees,
  onChanged,
}: {
  users: UserRow[];
  employees: Employee[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);

  const filtered = useMemo(() => {
    let list = [...users];
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (u) => u.username.toLowerCase().includes(q) || u.employee?.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, search, roleFilter]);

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await apiFetch(`/api/users/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to delete user");
      }
      toast({ title: "User deleted" });
      onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't delete user", description: err?.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex flex-col md:flex-row gap-3 flex-1 w-full">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="EMPLOYEE">Employee</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-2 h-4 w-4" /> Add User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Linked Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>{u.employee?.name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "ADMIN" ? "default" : "outline"}>{u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(u)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <UserDialog
          user={editing === "new" ? null : editing}
          employees={employees}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.username} will lose access to log in. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UserDialog({
  user,
  employees,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [username, setUsername] = useState(user?.username || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user?.role || "EMPLOYEE");
  const [employeeId, setEmployeeId] = useState(user?.employeeId || "none");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!username.trim() || (!user && !password)) {
      toast({ title: "Username and password are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        username: username.trim(),
        role,
        employeeId: employeeId === "none" ? null : employeeId,
      };
      if (password) body.password = password;

      const res = user
        ? await apiFetch(`/api/users/${user.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to save user");
      }
      toast({ title: user ? "User updated" : "User created" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Couldn't save user", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? "Edit User" : "Add User"}</DialogTitle>
          <DialogDescription>Manage login accounts and role assignment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <Label>{user ? "New Password (leave blank to keep current)" : "Password"}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="EMPLOYEE">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Linked Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
