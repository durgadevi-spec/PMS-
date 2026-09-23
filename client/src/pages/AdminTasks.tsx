// AdminTasks.tsx
//
// "My Tasks" page for admins — same layout, columns, components, and logic
// as Tasks.tsx (including TaskRow and every helper/hook it uses), just
// scoped to tasks where the current admin is assigned to (taskMembers) or
// created (assignerId) the task.
//
// Intentionally NOT a fork: all business logic lives in Tasks.tsx. This
// file just renders <Tasks myTasksOnly /> so future bug fixes to filtering,
// columns, or row rendering stay in sync across both pages automatically.

import Tasks from "@/pages/Tasks";

export default function AdminTasks() {
  return <Tasks myTasksOnly />;
}
