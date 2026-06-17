# Moshomo Implementation Plan

## Product Direction

Moshomo V1 is an AI-native workforce operating system for employee management, leave management, smart shifts, and Moshomo AI-assisted workforce operations.

Payroll, payslips, attendance tracking, clock-in/out, GPS tracking, recruitment, performance management, and benefits are out of scope for V1.

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
