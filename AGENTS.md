# Project Rules & Memory Configuration: PMS (Project Management System)

## 1. Project Overview
**PMS** is an enterprise-grade Project Management & Resource Tracking System. It features real-time task management, Gantt charts, project timelines, department & employee workload distribution, leave & attendance integrations (Timestrap), document generation (PDF/Excel/Word), and communication bridges (WhatsApp/Evolution API, Zoho Cliq, Google Calendar, Resend Email).

## 2. Tech Stack
- **Frontend**: React 19, TypeScript, Vite 7, Tailwind CSS, Radix UI primitives, Lucide Icons, TanStack React Query v5, Wouter routing, Recharts
- **Backend**: Node.js, Express 4, TypeScript (`tsx`), Passport.js (Local Session Auth), Connect-PG-Simple session store
- **Database & ORM**: Supabase PostgreSQL with connection pooling, Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **Integrations**:
  - Direct Supabase MCP / PostgreSQL connection
  - WhatsApp (Evolution API)
  - Zoho Cliq OAuth & webhooks
  - Google Calendar event sync & RSVPs
  - Resend Email notifications
  - ExcelJS, jsPDF, docx report generators

## 3. Persistent Memory System (CRITICAL)
This project uses a 2-layer long-term memory system located in the `memory/` directory:
- **`memory/CURRENT_STATE.md`**: Live checkpoint of active work, recently completed tasks, and next steps.
- **`memory/ARCHITECTURE.md`**: System design, Express route map, client architecture, and external integration pipeline.
- **`memory/DECISIONS.md`**: Log of all technical and architectural decisions (never overwrite, only append).
- **`memory/DATABASE.md`**: Drizzle schema, Supabase PostgreSQL tables, relationships, and indexing strategy.

### Agent Workflow Instructions:
1. **At the start of every substantial task**: Read `memory/CURRENT_STATE.md` and any relevant memory files to understand the current context.
2. **After completing a substantial task**: Update `memory/CURRENT_STATE.md` with what changed, and append any new architectural or technical decisions to `memory/DECISIONS.md`.

## 4. Key Architectural Rules & Constraints
- **Database Schema**: All table definitions must reside in `shared/schema.ts` using Drizzle ORM. Run migrations or schema push through `drizzle-kit`.
- **Direct Database Access**: Use the configured Supabase direct connection (`DATABASE_URL`). Always ensure connection pooling parameters in `server/db.ts` match Supabase/Neon connection limits.
- **Session & Role-Based Access**: Role checks (`ADMIN` vs `EMPLOYEE`) must be validated server-side on critical mutation endpoints.
- **Code Quality**: Keep routes modular in `server/routes.ts` or dedicated service modules. All React components must maintain clean TypeScript type safety with strict Zod validation.

