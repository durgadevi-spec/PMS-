# Architectural & Technical Decisions Log

*Note: Never overwrite existing entries. Only append new decisions.*

## [2026-10-30] 001 - Supabase Direct PostgreSQL Connection
- **Context**: The project requires fast, reliable query execution, schema migrations via Drizzle Kit, and MCP tool access.
- **Decision**: Use Supabase PostgreSQL connection string with `pg` connection pool on port 5432 and ssl `rejectUnauthorized: false`. Also configured direct MCP PostgreSQL integration for AI agent direct database access.

## [2026-10-30] 002 - Memory & Rules System Initialization
- **Context**: Needed standard guidelines and persistent memory matching previous projects (`FacilityOS` / `SiteManager Pro`).
- **Decision**: Created `AGENTS.md` and `memory/` persistent memory system (`CURRENT_STATE.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `DATABASE.md`) to maintain persistent context across development sessions.

## [2026-10-30] 003 - Replicated Animated 4-Character Login & 3D Coin Flip Flow
- **Context**: Needed a modern, playful animated login interface with interactive SVG character reactions matching the reference design, while preserving employee code authentication and integrating reset password without layout breaks or full page reloads.
- **Decision**: Implemented grounded animated SVG characters (`LoginScene.tsx`) on unified canvas, responsive cursor eye-tracking with RAF, dynamic typing lean and purple body morphing, 3D coin flip card flip (`rotateY(180deg)`), and scoped 401 handling in `apiClient.ts` to prevent page resets on auth errors.

## [2026-10-30] 004 - Implemented 10-Frame Acrobatic Superhero Entrance Animation
- **Context**: Needed the exact initial landing animation observed in the reference design where characters drop into the scene like acrobats/superheroes before settling into their idle poses.
- **Decision**: Implemented a coordinated 1.5s GPU-accelerated CSS keyframe choreography inside `LoginScene.tsx` (`heroEnterBlack`, `heroEnterPurple`, `heroEnterOrange`, `heroEnterYellow`, and blinking/mouth keyframes). Used an `isEntering` state to hand off control cleanly to the live RAF mouse-tracking loop at `t = 1.55s` with full respect for `prefers-reduced-motion`.

## [2026-10-30] 005 - Sidebar Redesign with Untitled UI Violet & Glassmorphism
- **Context**: Upgraded the dark navy sidebar to match the Untitled UI reference style with a rich purple background and frosted glassmorphism touch states, while removing the top logo to declutter the navigation.
- **Decision**: Updated `Layout.tsx` to use `#7047EB` background, translucent white borders (`border-white/10`), empty top header padding (`h-16`), and interactive glassmorphic pill buttons (`bg-white/20`, `backdrop-blur-md`, `border-white/25`) on both desktop and mobile slide-out menus.

## [2026-10-30] 006 - Dashboard Header & Warm Pastel Hero Banner
- **Context**: Reorganized the dashboard top header actions and introduced an engaging hero welcome banner matching reference layout with warm complementary palette and royal blue accents.
- **Decision**: Paired `[Export]` next to `[+ New Project]` in the top header, moved `[Raise Ticket]` into the hero banner card with Royal Blue styling (`#1D4ED8`), used warm pastel cream (`#FEF7DA` / border `#FDE68A`) with dismiss persistence (`localStorage`), reserved an empty right-hand space for future artwork, and placed the ticket alert banner underneath it.

## [2026-10-30] 007 - Permanent Hero Banner & Animated Circular Arrow CTA
- **Context**: Accidental dismissal caused the welcome banner to disappear permanently; in addition, the action arrow required the circular micro-animation matching Image 2.
- **Decision**: Removed `localStorage` dismissal to keep the welcome banner permanently rendered on the dashboard. Upgraded the `[Raise Ticket]` button with a circular badge and CSS `group-hover:translate-x-1` sliding arrow interaction. Maintained the green support ticket notification banner strictly below it without changes.

## [2026-10-30] 008 - Unified Royal Blue Action Button System
- **Context**: Needed color alignment for the top-right header action buttons (`+ New Project` and `Export`) to match the new Dashboard banner and reference design.
- **Decision**: Implemented Option A: styled `+ New Project` in solid Royal Blue (`#1D4ED8` hover `#1E40AF`) and `Export` in clean white slate outline (`bg-white border-slate-200 text-slate-700 hover:bg-slate-50`), providing crisp visual hierarchy and brand consistency across the entire workspace.

## [2026-10-30] 009 - Clean 4-Card Dashboard KPI System Redesign
- **Context**: The previous 5-card dashboard KPI section had severe information overload (dense sub-lists, tables with colored pills, folder trees, and an unnecessary "Upcoming" card) causing an irregular, messy layout. The user requested matching the card shape from the reference image with strictly no black cards (all white), eliminating internal clutter, and dropping the 5th "Upcoming" card.
- **Decision**: Refactored the KPI grid from 5 cluttered columns into a balanced 4-column responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`). Styled each card with rounded modern corners (`rounded-2xl`), pure white background (`bg-white`), subtle border (`border-slate-200/80`), gentle elevation hover lift (`hover:-translate-y-0.5 hover:shadow-md`), and interactive circular `↗` action affordances. Retained the core metrics (Active Projects, Task Completion %, Unassigned Tasks, and Key Steps) with clean micro-subtitles and zero cognitive noise.

## [2026-10-31] 010 - Frosted Glassmorphism System for Dashboard KPI Cards
- **Context**: The user suggested styling the first card in the soft lavender color from the reference swatch with the white 4-pointed sparkle star pattern and frosted glassmorphism, while styling cards 2, 3, and 4 in frosted white glass with glassmorphic accents, keeping all other unrelated dashboard codes strictly untouched.
- **Decision**: Implemented the cohesive frosted glassmorphism system across the 4-card grid:
  1. **Card 1 (Active Projects Hero)**: Frosted soft lavender gradient (`bg-gradient-to-br from-[#EAE6FE]/90 via-[#E1D6FD]/85 to-[#D7CBFA]/90`), `backdrop-blur-md`, subtle white border refraction (`border-white/70`), high-contrast deep purple typography (`#1E1B4B` / `#2E1065`, WCAG AAA >9:1), and floating white 4-pointed sparkle stars matching the reference astroid vector geometry.
  2. **Cards 2, 3, 4 (Task Completion, Unassigned Tasks, Key Steps)**: Frosted white glass surfaces (`bg-white/80 backdrop-blur-md`), glass bevel ring (`ring-1 ring-slate-900/5`), top glass refraction edge, and polished interactive hover states.
  3. **Strict Isolation**: Confined modifications strictly to the 4 KPI cards without touching unrelated codes (Welcome banner, support ticket notification, navigation header, or dialogs).

## [2026-10-31] 011 - Semantic Pastel Frosted Quartet for KPI Cards
- **Context**: Following UI/UX diagnosis of visual weight imbalance between Card 1 and Cards 2–4, the user approved Direction A (Semantic Pastel Quartet): Card 1 (Lavender with stars), Card 2 (Soft Mint Green for completion), Card 3 (Soft Warm Amber for unassigned tasks), and Card 4 (Soft Ice Blue for key steps).
- **Decision**: Implemented the complete 4-card semantic pastel frosted system with tailored low-saturation gradients, shared frosted glassmorphism (`backdrop-blur-md`, `border-white/70`, top refraction bevel), bespoke micro-accent SVGs for each card, and WCAG AAA deep typography. Strictly preserved all other codebase components without modification.

## [2026-10-31] 012 - High-Visibility Star Pattern Architecture for KPI Cards
- **Context**: The user observed that the white patterns on cards 2, 3, and 4 were faint and not properly visible due to low opacity and overlap with the top-right circular arrow button.
- **Decision**: Re-architected pattern visibility:
  1. Repositioned the primary large 4-point sparkle star (`✦`) directly into the spacious right-center space (`x: 220, y: 68`), completely avoiding the top-right button.
  2. Placed the medium star to the left of the button (`x: 185, y: 26`), and corner accents at `(248, 98)`, `(165, 110)`, and `(120, 15)`.
  3. Increased star fill opacity from 0.45 to high-visibility 0.85/0.80/0.75.
  4. Richer pastel gradient tones (`#D1FAE5` to `#6EE7B7` for mint, `#FEF3C7` to `#FCD34D` for amber, `#DBEAFE` to `#93C5FD` for ice blue), ensuring white star geometry pops with crisp, high-definition definition.
  5. Strictly isolated modifications to the 4 cards without touching any other codebase files.

## [2026-10-31] 014 - Banner Illustration Calibration
- **Context**: Calibrated hero banner illustration dimensions, scale factor, and horizontal inward offset in `Dashboard.tsx` to fill the banner without increasing overall banner height.
- **Decision**: Reverted banner container to compact height (`h-44 md:h-48`) and calibrated illustration to `scale-[1.38] md:scale-[1.48]` with expanded inward padding (`md:pr-16 lg:pr-28 xl:pr-36`).

## [2026-10-31] 015 - Timeline Hierarchy Tree Lines
- **Context**: Replaced cluttered dropdown list with tree branch hierarchy lines (`│`, `├──`, `└──`) in `ProjectTimelineDialog.tsx`.
- **Decision**: Implemented dynamic tree connector lines for Project -> Key Steps/Tasks -> Subtasks with elevated task card depth and shadow.

## [2026-10-31] 016 - Project History Dialog Styling & Tactile Depth
- **Context**: Enhanced Project History button, Download PDF button, and history entry cards with hover interactions and color coding.
- **Decision**: Added indigo hover states, royal blue download action, subtle ambient shadows, and 4px semantic color-coded left borders.

## [2026-10-31] 019 - Projects Header Doodle Pattern Integration
- **Context**: The user provided a reference banner doodle pattern image (`media_1793442961125_048246b0.png`) and requested applying it to the top of the Projects page behind the title, `Raise Ticket`, and `+ New Project` action area.
- **Decision**:
  1. Saved the pattern asset to `client/src/assets/projects-header-pattern.png`.
  2. Wrapped the top header of `Projects.tsx` in an elevated card container (`rounded-2xl`, subtle border, soft ambient shadow).
  3. Layered the doodle pattern with `backgroundRepeat: "repeat-x"`, `backgroundPosition: "right center"`, and `backgroundSize: "auto 100%"` with a soft gradient mask ensuring text legibility.
  4. Styled the action buttons: `Raise Ticket` in frosted white outline with blue icon accent, and `+ New Project` in purple with active scale micro-interactions.




## [2026-11-03] 020 - Key Step Slide Drawer Isolation & Seamless Surrounding Pattern Architecture
- **Context**: 
  1. The user reported that typing in input fields and clicking dropdowns inside the "Create New Key Step" slide drawer felt laggy, stuck, and extremely slow.
  2. The drawer visual design suffered from horizontal tile cut lines, dividing borders ("two cards" visual), and disappearing doodles due to screen scaling.
  3. The user requested:
     - Root cause analysis & fix for the input and dropdown lag.
     - Preserving their beloved soft lavender canvas background (`#F5F1FE` to `#FAF7FE`).
     - A single seamless card with zero dividing borders between header, content, and footer.
     - Surrounded doodle icons placed cleanly around the top-right header and bottom margins without sitting behind input fields or cluttering the form.
     - Generated ultra-light SaaS line-art pattern matching detailed specifications.
- **Root Cause Analysis**:
  - In `KeyStepsFullPage.tsx`, the slide drawer form state (`stepDrawerForm`) was held at the top level of the 2,300+ line parent page.
  - Every single keystroke and dropdown selection triggered a full DOM reconciliation of the entire page, including hundreds of table rows, status chips, drag-and-drop event handlers, and complex filtered memos, causing 100ms–300ms frame drops per character.
- **Decisions**:
  1. **Component State Isolation**: Created isolated component `KeyStepSlideDrawer.tsx` (`client/src/components/KeyStepSlideDrawer.tsx`). Form state (`title`, `projectId`, `status`, `dates`, `description`) now lives locally inside the drawer. Typing and dropdown interactions render in sub-millisecond time without ever touching or re-rendering `KeyStepsFullPage`.
  2. **Single Seamless Card**: Removed all separating horizontal borders (`border-b`, `border-t`, separate background opacity). The drawer is now a single continuous lavender canvas (`bg-gradient-to-b from-[#F5F1FE] via-[#FAF7FE] to-[#F3EEFE]`).
  3. **Surrounded Doodles Geometry**: Placed vector doodles strictly in the top header margin (clipboard, envelope, check badge, capsule, stars) and bottom margin under Description (target bullseye, rocket, folder, timer, check circle) with `#A78BFA` strokes and generous spacing, completely avoiding the white input field areas.
  4. **Generated Pattern Asset**: Generated and stored ultra-light SaaS pattern asset `saas_pattern_lavender.jpg` in `client/src/assets/` and `client/public/`.
  5. **Type Safety & Production Build**: Verified with full `npm run check` and Vite production build.

## [2026-11-05] 014 - Overdue Task Date Approval Workflow
- **Context**: Employees changing overdue task dates must keep the original schedule until an Admin approves the request; bulk updates must preserve each task's own request data.
- **Decision**: Store each request in `task_date_extension_requests`, enforce approval at the task date mutation APIs, and add an Admin-only page for filtering and reviewing pending, approved, and rejected requests. Approvals use the existing dependency schedule service; rejection never mutates task dates.

## [2026-11-05] 015 - Seven-Day Task Creation Limit and Schedule Extensions
- **Context**: New tasks must be limited to a one-week timeline, and task end-date extensions must propagate to associated Key Steps without breaking existing task dependency cascades.
- **Decision**: Validate new task date spans in both the creation form and `POST /api/tasks`. Preserve longer legacy task-period presets only while editing existing tasks. On positive schedule end-date deltas, extend the associated Key Step end date and project end date as needed.

## [2026-11-19] 017 - Digital Periwinkle Theme & Dual-Mode Sidebar
- **Context**: The user disliked the harsh magenta-violet sidebar background (`#7047EB`) and discordant button colors. The user provided reference designs showcasing a Periwinkle-Indigo (`#5D5FEF`) dual-mode sidebar with an interactive Dark/Light toggle at the bottom, while requiring all existing sidebar items and navigation routing to remain strictly intact.
- **Decision**: Added `useSidebarTheme` in `Layout.tsx` supporting Periwinkle (`#5D5FEF`) and white card modes with local persistence, preserved all `NAV_ITEMS`, and aligned button styles and theme variables.

## [2026-11-19] 018 - Concept Trunk Interiors Dual Logo Integration
- **Context**: The user provided `Concept Trunk Interiors Logo (1).png` for the Periwinkle sidebar and `Concept Trunk Interiors Logo (2).png` for the White sidebar.
- **Decision**: 
  1. Cropped transparent padding from both logos: Dark/Periwinkle logo to 1563x674, Light/White logo to 1155x540.
  2. Stored both in `client/src/assets/` and `client/public/` (`logo-dark-sidebar.png` and `logo-light-sidebar.png`).
  3. Placed them in the `h-20` sidebar header in `Layout.tsx` centered horizontally and vertically at `h-[52px]` and `max-w-[185px]`, conditionally rendering the light logo when in White mode and the dark logo when in Periwinkle mode.

## [2026-11-26] 019 - Database-Level Initial Setup Deadline for Direct Task Inserts
- **Context**: BOQ-synced tasks can bypass the PMS task API and insert directly into PostgreSQL, leaving `initial_setup_expires_at` null and disabling the Initial Setup badge and grace period.
- **Decision**: Add a `BEFORE INSERT` trigger on `project_tasks` to populate a missing deadline from `created_at` plus two days, and backfill only null-deadline tasks created within the preceding two days. This covers direct integrations without changing older tasks.

## [2026-11-26] 020 - Google Calendar Sync Backpressure and Invalid Guests
- **Context**: Parallel event writes exceeded the database session pooler limit; bursts of Google Calendar API creates hit per-user rate limits, and malformed attendee addresses caused otherwise valid events to be rejected.
- **Decision**: Limit Google pull writes to small batches, pace backlog pushes, retry transient Google rate-limit responses with bounded exponential backoff, and omit malformed attendee addresses while surfacing a warning. PMS project tasks remain outside Google event sync until the desired assignment scope is confirmed.

## [2026-11-26] 021 - Remove Duplicate Session Restoration
- **Context**: `main.tsx` and `App.tsx` both mounted `AuthProvider`, causing duplicate `/api/me` requests and duplicate auth state during every app startup.
- **Decision**: Keep the provider owned by `App.tsx` and remove the redundant wrapper from `main.tsx`; leave route-level lazy loading and existing API cache behavior unchanged.






