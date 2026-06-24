# Moshomo Implementation Plan

## Product Direction

Moshomo V1 is an AI-native workforce operating system for employee management, leave management, smart shifts, and Moshomo AI-assisted workforce operations.

Payroll, payslips, recruitment, performance management, and benefits are out of scope for V1.

Time and attendance (clock-in/out via NFC/QR tag-in, geofence, company Wi-Fi, and selfie verification) is **planned as a post-V1 module** — see Phase 7. It is documented now so the data model and integrations are not re-derived later, but it is not built in V1.

## Current Repo State

```txt
apps/web          Next.js role-aware workforce app
apps/mobile       Expo role-aware workforce app
apps/api          FastAPI backend and native Moshomo AI layer
packages/shared   Shared workforce constants and types
docs/architecture Architecture notes
supabase          Future migrations, RLS policies, storage, and seed data
```

Current source of truth:

- `PRD.txt` for product scope.
- `docs/architecture/monorepo.md` for repo layout.
- `docs/architecture/supabase-foundation.md` for company/auth/schema/RLS foundation.
- `docs/architecture/moshomo-ai-design.md` for the native Moshomo AI first slice.
- `docs/architecture/pori-workforce-adaptation.md` for the Pori-to-Moshomo AI direction.
- `docs/architecture/pori-to-moshomo-ai-evaluation.md` for what to keep, strip, and rebuild from Pori.

## Build Principles

- Build one vertical slice at a time across API, database, web, mobile, and Moshomo AI.
- Keep Moshomo as the source of truth for workforce data and permissions.
- Use Pori as source material for a native Moshomo AI rebuild, not as a long-term generic dependency.
- Moshomo AI must use explicit tools and structured intents, not direct uncontrolled writes.
- Keep shared domain language in `packages/shared`.
- Update `.agent/progress/current.md` and create handoffs after meaningful work.

## Phase 1: Foundation

Goal: make the product data model and auth boundaries real.

Deliverables:

- Supabase project notes and local environment setup.
- Company, user profile, employee, department, and role model.
- Supabase Auth assumptions documented.
- Row-level security plan for admin, manager, and employee access.
- API settings and Supabase client boundary.
- Native Moshomo AI context, memory, and first read-only tool design.
- First API tests.

Primary files/areas:

- `supabase/`
- `apps/api/src/moshomo_api/`
- `apps/api/src/moshomo_ai/`
- `packages/shared/src/`
- `docs/architecture/`

Verification:

- `pnpm lint`
- `pnpm typecheck`
- `uv run --project apps/api python -m compileall apps/api/src`
- API tests once added.

## Phase 2: Employee Management

Goal: create the employee source of truth.

Deliverables:

- Employee profile CRUD API.
- Employee status support: active, suspended, terminated, resigned.
- Department and employment type fields.
- Web employee list, search, filter, profile view, and edit form.
- Mobile employee profile view.
- Document upload design for contracts, IDs, and certifications.

Primary users:

- Admin can manage all employees.
- Manager can view/manage team employees depending on policy.
- Employee can view own profile.

Moshomo AI involvement:

- Read-only employee lookup tool.
- Workforce question support such as "show employees without shifts" later.

## Phase 3: Leave Management

Goal: digitize leave requests and approvals.

Deliverables:

- Leave type model: annual, sick, family responsibility, unpaid.
- Leave request API and state transitions.
- Leave balance model.
- Employee mobile leave request flow.
- Manager web pending approvals and team calendar.
- Leave history views.

Moshomo AI involvement:

- Natural-language leave extraction.
- Structured intent output before creating a leave request.
- Auto-approval rule design, but manager escalation remains the first safe default.

Safety rule:

- Moshomo AI must not approve leave until balance, coverage, policy, and permission checks are implemented.

## Phase 4: Smart Shifts

Goal: reduce manager scheduling work.

Deliverables:

- Shift template model.
- Shift assignment API.
- Weekly and monthly schedule views.
- Employee availability model.
- Mobile "My Shifts" view.
- Manager web schedule editor.

Moshomo AI involvement:

- Detect open shifts and understaffed periods.
- Suggest replacements based on availability, skills, overtime exposure, and fairness.
- Generate draft schedules that managers approve before persistence.

## Phase 5: Workforce Assistant

Goal: make native Moshomo AI useful inside the product.

Deliverables:

- Assistant API route with authenticated user context.
- Manager assistant in web dashboard.
- Employee assistant in mobile app.
- Tool contracts for employee, leave, and shift queries.
- Audit trail for AI-assisted actions.

Example questions:

- "Who is absent today?"
- "Show pending leave requests."
- "Generate next week's schedule."
- "When is my next shift?"
- "How many leave days do I have?"

## Phase 6: Production Readiness

Goal: prepare for real companies.

Deliverables:

- Error handling and observability.
- Seed/demo company data.
- Security review of RLS policies and API permission checks.
- Deployment notes.
- Backup and migration notes.
- Basic usage analytics.
- Onboarding flow for the first 5 companies.

## Phase 7: Time & Attendance (Post-V1)

Goal: let employees tag in/out at a workplace entrance through the Moshomo mobile app, with trustworthy proof of physical presence, feeding actual hours into shifts and (future) payroll.

Not in V1. Built as a fully-modular app on the existing employee spine, following the Smart Shifts pattern: API in `apps/api/src/moshomo_api/modules/attendance/`, web in `apps/web/src/modules/attendance/`, and the primary tag-in surface in `apps/mobile`.

Tag-in concept:

- A single physical **NFC + QR combo tag** at each entrance, encoding the same clock-point payload. NFC for tap-friendly phones, QR as the universal fallback (covers every device). Read by the **native Moshomo mobile app** (Expo), not a browser — so iOS NFC works via Core NFC, removing the Web NFC / Android-only limitation.
- "Programming a tag" = writing an employee/clock-point credential to an NFC card or reading its built-in UID, storing only a **hash** server-side.

Presence verification (three independent factors — a tag proves *which door*, not *that you are there*):

- **Geofence (GPS)** — within range of the clock point. Weak alone (spoofable), strong as a signal.
- **Company Wi-Fi** — match the access point **BSSID** (hardware MAC), not the SSID name (an SSID is trivially cloned by a rogue hotspot). On iOS this needs the `com.apple.developer.networking.wifi-info` entitlement plus location permission.
- **Selfie** — proves *who*; defeats buddy-punching. Tiered: store for manager review, or face-match against an enrolled photo with **liveness detection** (stops holding up a printed photo).
- **Enforcement is tiered, not all-or-nothing:** Wi-Fi BSSID + geofence are the hard gate; the selfie is captured and *mismatches flagged for review* rather than locking a good employee out over a dark hallway or bad camera.

Deliverables:

- `clock_credentials` (employee/clock-point tag, hashed token, type nfc|qr|pin, active).
- `clock_points` (company entrance/location, geofence centre + radius, allowed Wi-Fi BSSIDs).
- `time_punches` (append-only event log: punch_type in|lunch_start|lunch_end|out, punched_at, source, clock_point_id, lat/lng, verification result).
- `work_sessions` (derived: pair in→out, subtract lunch, compute hours).
- Server-side **state machine** for the punch sequence (out → in → lunch_start → lunch_end → out), same "API enforces transitions, RLS enforces row scope" pattern as Leave/Shifts.
- Mobile tag-in screen (NFC + QR + geofence + Wi-Fi + selfie), with **offline queue and sync** for flaky entrance connectivity.
- Web manager attendance views: who is clocked in now, late/no-show, timesheet review, flagged selfies.

Integrations (the payoff — this is the richest cross-module connector):

- **Shifts:** compare actual punch-in against the scheduled shift → automatic late / no-show / early-leave / overtime detection.
- **Leave:** punching in while on approved leave is flagged (via the shared availability check).
- **Payroll (future):** `work_sessions` become the authoritative hours source.

Moshomo AI involvement:

- Read-only tools: `who_is_clocked_in_now`, `who_is_late_today`, `hours_this_week`, registered into the workforce tool registry so the assistant reasons across attendance + shifts + leave.

Build constraints:

- NFC requires a custom Expo dev/EAS build (`react-native-nfc-manager` + config plugin) — not Expo Go. iOS NFC scanning is foreground and user-initiated (Apple's system scan sheet); needs the NFC entitlement and a paid Apple Developer account.

Compliance:

- The selfie/face data is **biometric "special personal information" under POPIA**. Requires explicit consent at enrolment, a defined retention policy, and secure storage. Design in from the start — expensive to retrofit.

## First Vertical Slice

Start here:

1. Define Supabase schema for companies, profiles, employees, departments, and roles.
2. Add shared TypeScript constants/types for those models.
3. Add FastAPI health plus authenticated employee/profile endpoints.
4. Add web employee list shell.
5. Add mobile profile shell.
6. Add native Moshomo AI actor context, read-only tools, company knowledge design, and assistant run audit trail.

The goal is not feature breadth. The goal is proving the full Moshomo loop:

```txt
Auth -> company context -> employee data -> API -> web/mobile UI -> Moshomo AI read-only answer
```

## Open Decisions

- Supabase local setup strategy.
- Whether FastAPI talks to Supabase directly using service-role operations only on the server.
- Exact role model for manager team access.
- Whether employee documents are implemented in V1 first pass or after core profile CRUD.
- Which Pori internals are copied and stripped first for native `moshomo_ai`.
- Exact company memory and knowledge-base model for Moshomo AI.

## Agent Workflow

Before implementation:

- Read `AGENTS.md`.
- Read `.agent/progress/current.md`.
- Read the relevant `.agent/rules`.
- Pick one phase or vertical slice.

After implementation:

- Run the smallest useful verification.
- Update `.agent/progress/current.md` when the next agent should know what changed.
- Create a handoff for completed or paused meaningful work.
