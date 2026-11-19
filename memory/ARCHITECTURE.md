# Architecture: PMS (Project Management System)

## 1. System Overview
PMS is a full-stack application built using a unified TypeScript codebase with Vite on the client and Express on the backend.

```
[ React 19 Client (Wouter, TanStack Query) ]
                   │
                   ▼  (REST API / Session Cookies)
       [ Node.js Express Backend ]
                   │
                   ▼  (Drizzle ORM / pg pool)
     [ Supabase PostgreSQL Database ]
```

## 2. Server Architecture
- **`server/index.ts`**: Express server bootstrap, middleware registration, static file serving, and port listener.
- **`server/db.ts`**: PostgreSQL connection pool using `pg` Pool connecting to Supabase with SSL enabled and connection pool limits.
- **`server/routes.ts`**: RESTful endpoints for projects, tasks, employees, departments, attendance, reminders, and report exports.
- **`server/storage.ts`**: Database data-access layer wrapping Drizzle ORM queries into typed storage methods.

## 3. Integrations
- **WhatsApp**: Evolution API client for dispatching task assignments and status updates.
- **Zoho Cliq**: OAuth integration for team chat alerts and project bot actions.
- **Google Calendar**: Bi-directional sync for task deadlines and calendar RSVPs.
- **Email**: Resend API service for invitations, digests, and reminders.

