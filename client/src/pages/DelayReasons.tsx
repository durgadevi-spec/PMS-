import React, { useEffect, useState } from "react";
import { useAuth } from "@/components/Layout";
import { apiFetch } from "@/lib/apiClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface DelayReason {
  id: number;
  taskId: string;
  projectId: string;
  reason: string;
  delayDate: string;
  recordedBy: string;
  createdAt: string;
  taskName: string;
  employeeName: string;
}

export default function DelayReasons() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.employeeCode === "E0001";
  const { toast } = useToast();
  const [reasons, setReasons] = useState<DelayReason[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;

    let isMounted = true;
    setLoading(true);

    apiFetch("/api/delay-reasons")
      .then(r => r.json())
      .then((data) => {
        if (!isMounted) return;
        setReasons(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("Failed to load delay reasons:", err);
        toast({ title: "Failed to load data", variant: "destructive" });
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isAdmin, toast]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Delay Reasons</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading delay reasons...</div>
          ) : reasons.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No delay reasons submitted yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Task Name</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reasons.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{r.employeeName || `User ${r.recordedBy}`}</TableCell>
                    <TableCell>{r.taskName || `Task ${r.taskId}`}</TableCell>
                    <TableCell className="max-w-md whitespace-pre-wrap">{r.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
