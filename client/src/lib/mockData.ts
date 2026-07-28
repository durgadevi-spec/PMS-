export type Status = 'open' | 'in-progress' | 'closed';
export type Priority = 'low' | 'medium' | 'high';

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: string;
  email: string;
  department: string;
}

export interface Subtask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Task {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  assignee?: string;
  dueDate: string;
  subtasks: Subtask[];
}

export interface TaskList {
  id: string;
  title: string;
  tasks: Task[];
}

export interface Milestone {
  id: string;
  title: string;
  status: Status;
  dueDate: string;
  taskLists: TaskList[];
}

export interface Project {
  id: string;
  title: string;
  description: string;
  status: Status;
  progress: number;
  startDate: string;
  endDate: string;
  milestones: Milestone[];
  team: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  type: 'project' | 'task' | 'milestone' | 'meeting' | 'assignment';
  color: string;
  assignees: string[];
  description?: string;
}

export const USERS: User[] = [
  { id: 'u1', name: 'Alex Rivera', role: 'Product Manager', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d', email: 'alex@knockturn.com', department: 'Management' },
  { id: 'u2', name: 'Sarah Chen', role: 'Frontend Dev', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d', email: 'sarah@knockturn.com', department: 'Engineering' },
  { id: 'u3', name: 'Mike Johnson', role: 'Backend Dev', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704e', email: 'mike@knockturn.com', department: 'Engineering' },
  { id: 'u4', name: 'Emily Davis', role: 'Designer', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704f', email: 'emily@knockturn.com', department: 'Design' },
  { id: 'u5', name: 'James Wilson', role: 'QA Engineer', avatar: 'https://i.pravatar.cc/150?u=a042581f4e290265041', email: 'james@knockturn.com', department: 'QA' },
  { id: 'u6', name: 'Lisa Anderson', role: 'DevOps', avatar: 'https://i.pravatar.cc/150?u=a042581f4e290265042', email: 'lisa@knockturn.com', department: 'Infrastructure' },
];

export const PROJECTS: Project[] = [
  {
    id: 'p1',
    title: 'Website Redesign',
    description: 'Overhaul the corporate website with new branding and CMS integration.',
    status: 'in-progress',
    progress: 45,
    startDate: '2025-01-01',
    endDate: '2025-03-31',
    team: ['u1', 'u2', 'u4'],
    milestones: [
      {
        id: 'm1',
        title: 'Phase 1: Design',
        status: 'closed',
        dueDate: '2025-01-15',
        taskLists: [
          {
            id: 'tl1',
            title: 'Wireframes',
            tasks: [
              { id: 't1', title: 'Homepage Wireframe', status: 'closed', priority: 'high', assignee: 'u4', dueDate: '2025-01-10', subtasks: [] },
              { id: 't2', title: 'About Us Wireframe', status: 'closed', priority: 'medium', assignee: 'u4', dueDate: '2025-01-12', subtasks: [] },
            ]
          }
        ]
      },
      {
        id: 'm2',
        title: 'Phase 2: Development',
        status: 'in-progress',
        dueDate: '2025-02-28',
        taskLists: [
          {
            id: 'tl2',
            title: 'Frontend Implementation',
            tasks: [
              { id: 't3', title: 'Setup React Repo', status: 'closed', priority: 'high', assignee: 'u2', dueDate: '2025-01-20', subtasks: [] },
              { id: 't4', title: 'Implement Header/Footer', status: 'in-progress', priority: 'medium', assignee: 'u2', dueDate: '2025-02-05', subtasks: [
                { id: 'st1', title: 'Responsive Menu', isCompleted: true },
                { id: 'st2', title: 'Mega Menu Dropdown', isCompleted: false }
              ]},
              { id: 't5', title: 'Homepage Hero Section', status: 'open', priority: 'high', assignee: 'u2', dueDate: '2025-02-10', subtasks: [] },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'p2',
    title: 'Mobile App Launch',
    description: 'Launch the new customer loyalty mobile application on iOS and Android.',
    status: 'open',
    progress: 10,
    startDate: '2025-02-01',
    endDate: '2025-05-31',
    team: ['u1', 'u3'],
    milestones: [
      {
        id: 'm3',
        title: 'Alpha Release',
        status: 'open',
        dueDate: '2025-03-15',
        taskLists: [
          {
            id: 'tl3',
            title: 'Core Features',
            tasks: [
              { id: 't6', title: 'Authentication API', status: 'in-progress', priority: 'high', assignee: 'u3', dueDate: '2025-02-20', subtasks: [] },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'p3',
    title: 'Cloud Migration',
    description: 'Migrate legacy infrastructure to AWS with zero downtime.',
    status: 'open',
    progress: 5,
    startDate: '2025-03-01',
    endDate: '2025-06-30',
    team: ['u3', 'u6'],
    milestones: [
      {
        id: 'm4',
        title: 'Phase 1: Assessment',
        status: 'open',
        dueDate: '2025-03-15',
        taskLists: [
          {
            id: 'tl4',
            title: 'Infrastructure Audit',
            tasks: [
              { id: 't7', title: 'Document current setup', status: 'open', priority: 'high', assignee: 'u6', dueDate: '2025-03-10', subtasks: [] },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'p4',
    title: 'Marketing Campaign Q1',
    description: 'Execute quarterly marketing initiatives and brand awareness.',
    status: 'in-progress',
    progress: 60,
    startDate: '2025-01-01',
    endDate: '2025-03-31',
    team: ['u1', 'u4'],
    milestones: [
      {
        id: 'm5',
        title: 'Campaign Launch',
        status: 'closed',
        dueDate: '2025-01-31',
        taskLists: [
          {
            id: 'tl5',
            title: 'Creative Assets',
            tasks: [
              { id: 't8', title: 'Design banners', status: 'closed', priority: 'medium', assignee: 'u4', dueDate: '2025-01-20', subtasks: [] },
            ]
          }
        ]
      }
    ]
  }
];

export const CALENDAR_EVENTS: CalendarEvent[] = [
  { id: 'ce1', title: 'Website Redesign', type: 'project', startDate: '2025-01-01', endDate: '2025-03-31', color: '#3b82f6', assignees: ['u1', 'u2', 'u4'] },
  { id: 'ce2', title: 'Phase 1: Design', type: 'milestone', startDate: '2025-01-01', endDate: '2025-01-15', color: '#a855f7', assignees: ['u4'] },
  { id: 'ce3', title: 'Homepage Wireframe', type: 'task', startDate: '2025-01-05', endDate: '2025-01-10', color: '#22c55e', assignees: ['u4'] },
  { id: 'ce4', title: 'Team Standup', type: 'meeting', startDate: '2025-02-01', endDate: '2025-02-01', color: '#f97316', assignees: ['u1', 'u2', 'u4'] },
  { id: 'ce5', title: 'Homepage Hero Section', type: 'assignment', startDate: '2025-02-05', endDate: '2025-02-10', color: '#eab308', assignees: ['u2'] },
  { id: 'ce6', title: 'Mobile App Launch', type: 'project', startDate: '2025-02-01', endDate: '2025-05-31', color: '#3b82f6', assignees: ['u1', 'u3'] },
  { id: 'ce7', title: 'Alpha Release', type: 'milestone', startDate: '2025-03-01', endDate: '2025-03-15', color: '#a855f7', assignees: ['u3'] },
];

export const MOCK_ISSUES = [
  { id: 'i1', title: 'Login API returns 500 error on timeout', status: 'open', severity: 'critical', reporter: 'u2' },
  { id: 'i2', title: 'Typo in About Us page', status: 'closed', severity: 'low', reporter: 'u4' },
  { id: 'i3', title: 'Mobile menu overlaps content on iPhone SE', status: 'in-progress', severity: 'medium', reporter: 'u1' },
];

export const MOCK_NOTIFICATIONS = [
  { id: 'n1', text: 'Sarah Chen completed "Homepage Wireframe"', time: '2 hours ago' },
  { id: 'n2', text: 'New comment on "Authentication API"', time: '4 hours ago' },
  { id: 'n3', text: 'Project "Website Redesign" moved to Phase 2', time: '1 day ago' },
];
