import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, lazy, Suspense } from "react";

import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Layout, { AuthProvider, useAuth } from "@/components/Layout";
import { FreezeProvider } from "@/context/FreezeContext";

import Login from "@/pages/Login";

// Lazy load all heavy pages - loads only when needed
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Projects = lazy(() => import("@/pages/Projects"));
const Users = lazy(() => import("@/pages/Users"));
const Overview = lazy(() => import("@/pages/Overview"));
const Discussion = lazy(() => import("@/pages/Discussion"));
const Reports = lazy(() => import("@/pages/Reports"));
const CalendarEnhanced = lazy(() => import("@/pages/CalendarEnhanced"));
const Extensions = lazy(() => import("@/pages/Extensions"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const AdminTasks = lazy(() => import("@/pages/AdminTasks"));
const DelayReasons = lazy(() => import("@/pages/DelayReasons"));
const AddEditTask = lazy(() => import("@/pages/AddEditTask"));
const KeySteps = lazy(() => import("@/pages/keysteps"));
const KeyStepsFullPage = lazy(() => import("@/pages/KeyStepsFullPage"));
const AddSubMilestone = lazy(() => import("@/pages/AddSubMilestone"));
const AddKeyStep = lazy(() => import("@/pages/AddKeyStep"));
const Completed = lazy(() => import("@/pages/Completed"));
const SiteEngineerReport = lazy(() => import("@/pages/SiteEngineerReport"));
const Tickets = lazy(() => import("@/pages/Tickets"));
const ProjectAnalytics = lazy(() => import("@/pages/ProjectAnalytics"));
const EmployeePerformance = lazy(() => import("@/pages/EmployeePerformance"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Loading fallback component
function PageLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "hsl(var(--background))" }}>
      <div style={{ textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
        <div style={{ width: 40, height: 40, border: "3px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <p>Loading...</p>
      </div>
    </div>
  );
}

/* ---------------- PROTECTED ROUTE ---------------- */

function ProtectedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) return null;
  if (!user) return null;

  return (
    <Suspense fallback={<PageLoader />}>
      <Layout>
        <Component />
      </Layout>
    </Suspense>
  );
}

/* ---------------- PROTECTED ADMIN ROUTE ---------------- */

function ProtectedAdminRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { user, isLoading, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    } else if (!isLoading && user && !isAdmin) {
      setLocation("/");
    }
  }, [user, isLoading, isAdmin, setLocation]);

  if (isLoading) return null;
  if (!user || !isAdmin) return null;

  return (
    <Suspense fallback={<PageLoader />}>
      <Layout>
        <Component />
      </Layout>
    </Suspense>
  );
}

/* ---------------- PROTECTED ROUTER ---------------- */

function ProtectedRouter() {
  return (
    <Switch>
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>

      <Route path="/projects">
        <ProtectedRoute component={Projects} />
      </Route>

      <Route path="/users">
        <ProtectedRoute component={Users} />
      </Route>

      <Route path="/overview">
        <ProtectedRoute component={Overview} />
      </Route>

      <Route path="/discussion">
        <ProtectedRoute component={Discussion} />
      </Route>

      <Route path="/reports">
        <ProtectedRoute component={Reports} />
      </Route>

      <Route path="/calendar">
        <ProtectedRoute component={CalendarEnhanced} />
      </Route>

      <Route path="/extensions">
        <ProtectedRoute component={Extensions} />
      </Route>

      <Route path="/tasks">
        <ProtectedRoute component={Tasks} />
      </Route>

      <Route path="/admin-tasks">
        <ProtectedAdminRoute component={AdminTasks} />
      </Route>

      <Route path="/add-task">
        <ProtectedRoute component={AddEditTask} />
      </Route>

      <Route path="/edit-task">
        <ProtectedRoute component={AddEditTask} />
      </Route>

      <Route path="/keysteps">
        <ProtectedRoute component={KeySteps} />
      </Route>

      <Route path="/key-steps">
        <ProtectedRoute component={KeyStepsFullPage} />
      </Route>

      <Route path="/add-key-step">
        <ProtectedRoute component={AddKeyStep} />
      </Route>

      <Route path="/add-sub-milestone">
        <ProtectedRoute component={AddSubMilestone} />
      </Route>

      <Route path="/completed">
        <ProtectedRoute component={Completed} />
      </Route>

      <Route path="/site-report">
        <ProtectedRoute component={SiteEngineerReport} />
      </Route>

      <Route path="/tickets">
        <ProtectedRoute component={Tickets} />
      </Route>

      <Route path="/delay-reasons">
        <ProtectedRoute component={DelayReasons} />
      </Route>

      <Route path="/project-analytics">
        <ProtectedRoute component={ProjectAnalytics} />
      </Route>

      <Route path="/performance/:employeeId">
        <ProtectedRoute component={EmployeePerformance} />
      </Route>

      <Route path="/performance">
        <ProtectedRoute component={EmployeePerformance} />
      </Route>

      <Route path="/leaderboard">
        <ProtectedRoute component={Leaderboard} />
      </Route>

      <Route path="/workspace">
        <ProtectedAdminRoute component={Workspace} />
      </Route>

      <Route path="/settings">
        <ProtectedAdminRoute component={AdminSettings} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

/* ---------------- APP ROUTER (wrapped by AuthProvider) ---------------- */

function AppRouter() {
  const { user, isLoading } = useAuth();

  // While restoring the session, show nothing (avoids flash-redirect to login)
  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "hsl(var(--background))" }}>
        <div style={{ textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
          <div style={{ width: 40, height: 40, border: "3px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route component={Login} />
      </Switch>
    );
  }

  return <ProtectedRouter />;
}

/* ---------------- APP ROOT ---------------- */

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <FreezeProvider>
            <Toaster />
            <AppRouter />
          </FreezeProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;