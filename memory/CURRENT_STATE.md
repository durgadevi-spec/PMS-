# Current Project State: PMS
*Last Updated: 2026-10-30*

## 1. Active Focus
- Sidebar branding and theming: Digital Periwinkle `#5D5FEF` dual-mode sidebar with Knockturn branding.

## 2. Recently Completed
- Synchronized blue and white sidebar logo sizes to 100% identical dimensions (`1827 × 477 px`, 3.83 aspect ratio, `h-[40px] max-w-[172px]` in `Layout.tsx`).
- Blue sidebar uses transparent Cyan Angular K Knockturn logo (`logo-dark-sidebar.png`) with white lettering and zero box/margin distortion.
- White sidebar uses transparent Cyan Angular K Knockturn logo (`logo-light-sidebar.png`) with dark lettering.
- Preserved all navigation items and routing in `client/src/components/Layout.tsx`.
- Type check `npm run check` passes with 0 errors.
- Configured `.env` file inside `PMS--main/PMS--main/` containing Supabase PostgreSQL (`DATABASE_URL`), `TIMESTRAP_DATABASE_URL`, JWT secret, email and webhook credentials.
- Configured `AGENTS.md` rules and persistent memory system.
- Configured Supabase MCP direct database connection extension.
- Successfully implemented interactive 4-character animated SVG login design (`LoginScene.tsx` & `Login.tsx`) replicating reference design with all PMS customizations (Employee Code, session auth, secure remember me, no unwanted third-party buttons).
- Resolved layout separation: unified page canvas to `#e8e8e8`, grounded characters to the bottom-left on the open canvas, and styled the login form as the single floating white card (`rounded-[28px]`) with no dark gap or dividers, matching Image 2.
- Fixed 401 auto-reload bug in `apiClient.ts` so wrong credentials trigger the inline error and character shake animation without a hard page refresh.
- Implemented smooth 3D coin flip card rotation (`rotateY(180deg)`) for the "Forgot Password" flow inside the same white card.
- Added new character reactions: `forgot` (curious/thoughtful gaze), `success` (happy smiling celebration with auto-flip back).
- Implemented dynamic character eye-tracking and typing animations across both Login and Reset Password cards (progressive character leaning and purple body morphing proportional to typed characters; active cursor eye tracking enabled on both front and back faces).
- Increased login card width to `510px` and adjusted canvas column grid ratio to `1.15fr 1fr` for a spacious, perfectly balanced layout matching reference specifications.
- Implemented the 10-frame acrobatic "Superhero Drop & Landing" entrance animation in `LoginScene.tsx` matching the reference sequence (Black ceiling swing & hero vault landing, Purple tumbling cube into vertical pillar unfurl, Orange catapulting pill-to-bean squash & stretch, and Yellow rising dome anchor).
- Integrated seamless hand-off from the 1.5s entrance sequence to live interactive mouse eye-tracking and dynamic typing leaning without layout shifts.
- Redesigned application sidebar to match the reference Untitled UI violet theme (`#7047EB`), interactive frosted glassmorphism active & hover pills (`backdrop-blur-md`, `bg-white/20`, `border-white/25`), and removed the company logo icon leaving clean open breathing space at the top.
- Redesigned Dashboard header & hero banner: paired `[Export]` and `[+ New Project]` in the top header row, added Option 1 Warm Cream (`#FEF7DA`) hero welcome banner with a crisp Royal Blue (`#1D4ED8`) `[Raise Ticket]` CTA, reserved clean empty right-hand space for future illustrations, and preserved the Ticket Notification banner below it.
- Refined Dashboard Welcome Banner: ensured the banner stays permanently visible without accidental dismissals, added smooth interactive arrow micro-animation (`group-hover:translate-x-1`) inside a circular badge, and confirmed the green support ticket notification banner remains untouched underneath.
- Styled top-right header action buttons with Option A: `+ New Project` in crisp Royal Blue (`#1D4ED8` with active scale effect) and `Export` in refined clean white outline (`border-slate-200 text-slate-700`), establishing a unified interactive color system.
- Redesigned dashboard top stat cards to match the reference card shape from Image 1 with strictly pure white surfaces (zero black cards), removing the 5th "Upcoming" card and eliminating internal clutter (dense nested tables, task badges, progress bars, and folder bullet trees). Created a balanced 4-column responsive grid (Active Projects, Task Completion %, Unassigned Tasks, and Key Steps) with clean typography, contextual micro-subtitles, interactive hover lift, and top-right circular ↗ link affordances.
- Implemented the cohesive Semantic Pastel Frosted Quartet with 4 unique bespoke patterns across the dashboard KPI cards:
  - **Card 1 (Active Projects)**: Frosted Lavender gradient (`#EAE6FE` to `#D7CBFA`) with signature white 4-pointed sparkle stars (`✦`).
  - **Card 2 (Task Completion)**: Frosted Mint Green gradient (`#D1FAE5` to `#6EE7B7`) with concentric progress target rings & completion arcs (`◎`).
  - **Card 3 (Unassigned Tasks)**: Frosted Warm Amber gradient (`#FEF3C7` to `#FCD34D`) with task queue dot matrix grid (`:::`).
  - **Card 4 (Key Steps)**: Frosted Ice Blue gradient (`#DBEAFE` to `#93C5FD`) with connected milestone roadmap nodes (`●───●───●`).
- Compacted navigation sidebar width from `w-64` (256px) to industry standard `w-56` (224px) in `Layout.tsx`, reclaiming 32px of horizontal screen canvas for dashboard cards and tables.
- Upgraded typography stack: Replaced quirky Space Grotesk with **Plus Jakarta Sans** (`--font-display`) in `index.html` and `index.css`, removed unused Poppins import, and retained Inter for micro-legible data tables.
- Integrated transparent illustration asset (`banner-illustration.png`, sourced from `19739-removebg-preview.png`) into the right side of the Welcome Banner in `Dashboard.tsx`, completing the hero banner composition with optimal responsive scaling and soft drop-shadow.
- Reverted Welcome Banner container strictly back to its compact original dimensions (`p-6 sm:p-8`, ~200px total height) with genuine full-color illustration asset (`banner-illustration.png`).
- Perfectly calibrated illustration sizing and alignment: container locked to `h-44 md:h-48` with `scale-[1.38] md:scale-[1.48] origin-center` and expanded inward offset (`md:pr-16 lg:pr-28 xl:pr-36`), significantly increasing the visual scale of the illustration to fill the inner vertical height while shifting it leftward into the open canvas without adding a single pixel to the banner height.
- Redesigned "Hierarchy & Details" in `ProjectTimelineDialog.tsx` with dynamic tree branch connector lines (`│`, `├──`, `└──`) connecting Project -> Key Steps/Tasks -> Subtasks based on user reference design.
- Enhanced parent task card depth and shadow (`shadow-[0_3px_12px_rgba(0,0,0,0.08)]`, `border-slate-300/90`, `ring-1 ring-black/[0.03]`) for elevated, tactile hierarchy.
- Wrapped project-level task expansion so collapsing project collapses all tasks/subtasks under it, and preserved 100% of all metadata (dates, planned durations, delays, completion stamps, assignees, status pills).
- Enhanced `ProjectScheduleHistoryDialog.tsx`:
  - Styled `Project History` button with soft Indigo resting state (`bg-indigo-50/90`), rich hover elevation (`hover:bg-indigo-600 hover:text-white`), and smooth counter-clockwise icon rotation (`group-hover:-rotate-45`).
  - Styled `Download PDF` button in solid Royal Blue (`bg-[#1D4ED8] hover:bg-[#1E40AF]`) with bounce micro-interaction on export arrow.
  - Upgraded history entry cards to tactile floating cards (`rounded-xl`, ambient shadow `shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)] hover:-translate-y-0.5`).
  - Added semantic color-coded left borders: $4\text{px}$ Indigo (`border-l-indigo-500`) for Manual updates, $4\text{px}$ Warm Amber (`border-l-amber-500`) for Automatic Dependency Cascades, with formatted date shift transition chips (`Start/End: Old ➔ New`).
- Redesigned Lower Dashboard Cards (`Dashboard.tsx`):
  - **Active Projects Card**: Refined elevated card container (`rounded-2xl`, soft ambient shadow, 1px border), branded icon badge (`Briefcase`), interactive expanding search input with smooth focus transition (`w-52` -> `w-80`), clear button (`✕`), and inline visual progress tracks (`24px` rounded bar with dynamic green/blue/amber fill) alongside tabular percentage values.
  - **Analytics Card**: Elevated container with purple header badge (`BarChart2`), chevron collapse toggle, and dedicated floating sub-cards for Tasks per Project (bar chart) and Key Steps Completion (pie chart).
  - **Insights Widgets Card**: Elevated container with emerald header badge (`Sparkles`) housing 3 distinct metric cards (Projects by Status donut, Tasks by Priority donut, and Overall Completion radial gauge).
- Integrated Blue Clear / Delete Lottie Animation:
  - Installed `lottie-web` and placed extracted vector animation `blue-delete-animation.json` ($340 \times 340$px 60fps).
  - Created universal reusable `<DeleteConfirmModal>` component (`client/src/components/DeleteConfirmModal.tsx`) with animated hero illustration, item title chip, and kinetic sweep acceleration on deletion.
  - Activated across `Tasks.tsx` (Single Task delete, Subtask delete, Bulk Tasks delete, Tag delete) and `Dashboard.tsx` (Project delete).
- Styled Projects Page Header Banner (`Projects.tsx`):
  - Calibrated reference doodle vector pattern with crisp transparent alpha mapping (`projects-header-pattern.png`).
  - Tuned pattern opacity to a delicate, gentle watermark level (`opacity-[0.22]`) per user feedback so the doodles are subtly visible in the background without being overly prominent or distracting.
  - Elevated header card with subtle lavender gradient (`bg-gradient-to-r from-white via-white to-[#F8F7FF]`), soft ambient shadow, and styled `Raise Ticket` and `+ New Project` action buttons.
- Isolated Key Step Slide Drawer & Pattern Optimization (`KeyStepSlideDrawer.tsx` & `KeyStepsFullPage.tsx`):
  - Solved root cause of input typing and dropdown sluggishness by encapsulating form state locally in `<KeyStepSlideDrawer>`, isolating re-renders and preventing the 2,300+ line parent table from re-rendering on keystrokes.
  - Re-architected drawer into a single seamless card (removed dividing borders on header/footer) with the user's preferred soft lavender canvas background (`#F5F1FE` to `#FAF7FE`).
  - Placed crisp, surrounded vector doodles strictly in the top header and bottom margin below Description, keeping them 100% visible and completely away from input fields.
  - Generated and stored ultra-light SaaS pattern asset `saas_pattern_lavender.jpg` in `client/src/assets/` and `client/public/`.
- Key Steps Action Buttons Styling (`KeyStepsFullPage.tsx`):
  - Applied Option 1 (Tonal Pastel Harmony) to the top action cluster:
    - **Use Template**: Styled with soft sky blue tint (`bg-sky-50/80`, `border-sky-200`, `text-sky-700`, `text-sky-600` icon).
    - **Quick Add**: Styled with soft lavender tint (`bg-[#F5F1FF]`, `border-[#E3DCFA]`, `text-[#7047EB]`), with active toggle state (`bg-[#EAE4FF]`).
    - **+ New Key Step**: Maintained as solid primary violet CTA (`bg-[#7047EB] text-white`).
- Key Step Slide Drawer Full-Height Pattern (`KeyStepsFullPage.tsx`):
  - Added `viewBox="0 0 480 800"` and extended icon rows (Rows 6, 7, and 8) through `y=480px` to `y=750px` across the previously vacant bottom section under the Description field down to the footer divider line.
  - Relocated Row 5 icons away from being occluded behind the opaque white Description textarea.
  - Evenly distributed decorative vector doodles (stopwatch, concentric bullseye, calendar, rocket, paperclip, analytics bar chart, mail envelope, flag, check badge) and accent particles throughout the entire vertical container.
  - Success Send Lottie Animated Modal Integration (`KeyStepsFullPage.tsx` & `SuccessSendModal.tsx`):
  - Created reusable `<SuccessSendModal>` component utilizing the user's `Success Send.lottie` animation (`client/src/assets/success-send-animation.json`).
  - Integrated into Key Step creation flow: upon creating a key step, closes the drawer and displays the animated paper airplane launch with step title chip and auto-dismiss.
  - Replaced native browser `window.confirm` dialogs with `<DeleteConfirmModal>` across single key step delete actions and bulk delete actions.
  - Verified full TypeScript compilation (`npm run check`) with zero errors.

## 3. Key Files & Structure
- **Server Entry**: `server/index.ts`, `server/db.ts`, `server/routes.ts`, `server/storage.ts`
- **Shared Schema**: `shared/schema.ts` (Drizzle models for users, employees, projects, tasks, attendance)
- **Client Root**: `client/src/App.tsx`, `client/src/main.tsx`
- **Configuration**: `drizzle.config.ts`, `vite.config.ts`, `.env`

## 4. Known Issues & Blockers
- None currently active.

## 5. Next Planned Tasks
- Verify database migrations and schema synchronization (`npm run db:push`).
- Test development server (`npm run dev`).

## 6. Recently Completed (2026-11-05)
- Added overdue task date extension requests with mandatory written reasons for employees, a separate Admin approval page, and per-task handling for bulk date updates.
- Admin approval updates the task schedule through the dependency-aware schedule service; rejection leaves the original overdue dates unchanged. Task rows display Overdue and Pending Approval badges while a request is awaiting review.
- Schedule extensions increase the linked Key Step end date and extend the project end date when needed; dependent task schedules continue to cascade.
- Limited new task creation to a seven-day date span in the form and `POST /api/tasks`; longer presets remain available only when editing existing tasks.
- Added migration `0025_add_task_date_extension_approvals.sql`. Apply the migration before deploying the feature.
- Added Concept Trunk Interiors logo (`client/src/assets/logo-dark-sidebar.png`) to the top of the Periwinkle sidebar with responsive scaling and click navigation to Dashboard.
- Configured dynamic logo switching fallback ready for the white sidebar logo.
- Cropped 420px of transparent empty padding from `logo-dark-sidebar.png` (tight 1563x674 bounding box), enlarged display height to `52px` (`max-w-[185px]`), and perfectly centered it at the top of the sidebar.
- Integrated Concept Trunk Interiors white sidebar logo (`client/src/assets/logo-light-sidebar.png` cropped to 1155x540 tight bounds), enabling dynamic logo switching between dark/periwinkle mode and light/white sidebar mode.
- Re-cropped both logos cleanly to identical bounding boxes (1141x538 dark, 1155x540 light) and calibrated height to `h-[42px]` (`w-[89px]`), making the logo in the white sidebar 100% identical in size and proportion to the blue sidebar logo.
- Replaced white sidebar logo with Knockturn Private Limited brandmark (`client/src/assets/logo-light-sidebar.png` cropped to 1868x409 tight bounds), centered at `h-[40px] max-w-[175px]`.
- Integrated official KNOCKTURN logo with Cyan Angular K (`logo-dark-sidebar.png` cropped to 1863x409 px with transparent background and pure white text) for the blue sidebar, and KNOCKTURN Light Mode logo for the white sidebar, both calibrated and centered at `max-w-[172px]`.
- Validation completed: `npm run check` and `npm run build`.

## 7. Recently Completed (2026-11-19)
- Modernized sidebar design from `#7047EB` to the digital Periwinkle Blurple (`#5D5FEF`) reference design system:
  - Added dual-mode sidebar theme state (`useSidebarTheme`, supporting Periwinkle dark/branded and clean white card light mode with `localStorage` persistence).
  - Maintained 100% of existing navigation items, routes, admin checks, construction alerts, and `tasks-reset-filters` event handlers.
  - In Periwinkle Mode (`dark`): Deep indigo contrast pill (`bg-[#4845D8]`), pure white text, and crisp white Support action button (`bg-white text-[#5D5FEF]`).
  - In White Mode (`light`): Clean white card background (`bg-white`), slate text, vibrant Periwinkle active pill (`bg-[#5D5FEF] text-white shadow-[0_4px_14px_rgba(93,95,239,0.35)]`), and solid Periwinkle Support button.
  - Added bottom interactive Dark/Light Mode switch toggle with Sun/Moon icons, allowing instant switching between both reference designs.
  - Aligned button colors across `KeyStepSlideDrawer.tsx`, `KeyStepsFullPage.tsx`, `Projects.tsx`, and `index.css` (`--primary`, `--ring`) from harsh `#7047EB` to `#5D5FEF`.
  - Verified full TypeScript compilation (`npm run check`) and production bundling (`npm run build`) with zero errors.
- Added the additive Task Initial Setup grace period: new tasks receive a server-generated two-day UTC deadline, show an Initial Setup indicator, and can be rescheduled without a reason during the phase. After expiry, date changes require a reason and Admin approval; existing tasks keep the prior behavior.
- Added migration `0026_add_task_initial_setup_grace_period.sql`; task creation, cloning, template application, inline edits, bulk rescheduling, and the central schedule endpoint now carry/enforce the phase deadline.
- Added Concept Trunk Interiors logo (`client/src/assets/logo-dark-sidebar.png`) to the top of the Periwinkle sidebar with responsive scaling and click navigation to Dashboard.
- Configured dynamic logo switching fallback ready for the white sidebar logo.
- Cropped 420px of transparent empty padding from `logo-dark-sidebar.png` (tight 1563x674 bounding box), enlarged display height to `52px` (`max-w-[185px]`), and perfectly centered it at the top of the sidebar.
- Integrated Concept Trunk Interiors white sidebar logo (`client/src/assets/logo-light-sidebar.png` cropped to 1155x540 tight bounds), enabling dynamic logo switching between dark/periwinkle mode and light/white sidebar mode.
- Re-cropped both logos cleanly to identical bounding boxes (1141x538 dark, 1155x540 light) and calibrated height to `h-[42px]` (`w-[89px]`), making the logo in the white sidebar 100% identical in size and proportion to the blue sidebar logo.
- Replaced white sidebar logo with Knockturn Private Limited brandmark (`client/src/assets/logo-light-sidebar.png` cropped to 1868x409 tight bounds), centered at `h-[40px] max-w-[175px]`.
- Integrated official KNOCKTURN logo with Cyan Angular K (`logo-dark-sidebar.png` cropped to 1863x409 px with transparent background and pure white text) for the blue sidebar, and KNOCKTURN Light Mode logo for the white sidebar, both calibrated and centered at `max-w-[172px]`.
- Validation completed: `npm run check` and `npm run build`.

## 7. Recently Completed (2026-11-19)
- Modernized sidebar design from `#7047EB` to the digital Periwinkle Blurple (`#5D5FEF`) reference design system:
  - Added dual-mode sidebar theme state (`useSidebarTheme`, supporting Periwinkle dark/branded and clean white card light mode with `localStorage` persistence).
  - Maintained 100% of existing navigation items, routes, admin checks, construction alerts, and `tasks-reset-filters` event handlers.
  - In Periwinkle Mode (`dark`): Deep indigo contrast pill (`bg-[#4845D8]`), pure white text, and crisp white Support action button (`bg-white text-[#5D5FEF]`).
  - In White Mode (`light`): Clean white card background (`bg-white`), slate text, vibrant Periwinkle active pill (`bg-[#5D5FEF] text-white shadow-[0_4px_14px_rgba(93,95,239,0.35)]`), and solid Periwinkle Support button.
  - Added bottom interactive Dark/Light Mode switch toggle with Sun/Moon icons, allowing instant switching between both reference designs.
  - Aligned button colors across `KeyStepSlideDrawer.tsx`, `KeyStepsFullPage.tsx`, `Projects.tsx`, and `index.css` (`--primary`, `--ring`) from harsh `#7047EB` to `#5D5FEF`.
  - Verified full TypeScript compilation (`npm run check`) and production bundling (`npm run build`) with zero errors.
