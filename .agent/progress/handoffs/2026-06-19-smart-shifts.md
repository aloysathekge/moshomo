# Smart Shifts (Phase 4) — first fully-modular app

## Goal

Build Smart Shifts as the first app that's modular on **both** sides: API in
`apps/api/src/moshomo_api/modules/shifts/` (new convention) and web in
`apps/web/src/modules/shifts/`.

Confirmed scope (full): **templates + assignments**, **open (unassigned) shifts**, and
**employee availability**. No draft/publish workflow, no AI suggestions (later).

## Completed

- **DB** — `supabase/migrations/20260619000600_shifts.sql` (NOT applied):
  `shift_templates` (name + start/end; `unique (id, company_id)` for composite FKs),
  `shift_assignments` (composite FK to template; `employee_id` **nullable** = open shift;
  `shift_date`, `start/end_time` copied from template, `status` scheduled/cancelled, notes),
  `employee_availability` (`weekday` 0=Sun..6=Sat, start/end). RLS reuses
  `has_company_role`/`current_employee_id`: templates read=member / write=admin|manager;
  assignments select+write scoped to admin / assignee / manager-of-report / open shifts;
  availability read=admin|owner|manager-of-report, write=owner|admin. Triggers + grants.
- **API** — `moshomo_api/modules/shifts/{__init__,models,router}.py`, registered in `main.py`
  (`modules.shifts.router`). Endpoints under `/workforce/shifts`: templates `POST/GET/PATCH/DELETE`;
  assignments `POST` (times default from the template; `employee_id` optional → open),
  `GET ?from=&to=&mine=&open=` (RLS-scoped, embeds employee + template name), `PATCH` (reassign/
  cancel), `DELETE`; availability `GET ?employee_id=` and `PUT /{employee_id}` (owner|admin;
  replaces the set = delete-then-insert). Added `context.require_company_admin_or_manager`.
- **Web** — `apps/web/src/modules/shifts/shifts-panel.tsx` (role-aware, design-system, graceful
  "being set up"): manager/admin weekly schedule editor (week nav, add-shift form, day-grouped
  cards, inline assign for open shifts, delete) + a shift-templates section; everyone gets
  "My shifts" (next 14 days) and a weekly availability editor. `shifts` app → `status: "live"`
  in `lib/apps.ts`; dispatched in `app/page.tsx`. Resolves the caller's `employee_id` client-side
  from the employees list (`profile_id === session.user.id`) for the availability PUT.
- **Dashboards** — manager "Shift gaps" (open shifts, next 14d) and employee "Upcoming shifts"
  (mine, next 7d) wired via a non-blocking fetch in `loadWorkspace`; the employee hero shows the
  shift count. `packages/shared` gained `shiftStatuses` + `weekdays`.

## Verification

- `uv run --project apps/api python -m compileall apps/api/src` — clean.
- `uv run --project apps/api pytest apps/api/tests -q` — **50 passed** (11 new shifts tests).
- `pnpm --filter @moshomo/web typecheck` / `lint` / `build` — clean.

## Not done / follow-ups

- **Apply** `20260619000600_shifts.sql` (approval-gated, Docker-less remote apply), then **restart
  the API** (it runs on :8001 without --reload) so it loads `modules/shifts`. Until then the panel
  shows "being set up".
- Draft/publish schedules; availability-vs-shift conflict warnings; recurring/auto-generated
  schedules; month/calendar grid; overtime/fairness; mobile shifts UI.
- AI shift tools (`find_shift_gaps`, `suggest_replacements`, `generate_draft_schedule`) — later.
- Optional: fold the older `routers/leave.py` / `employees*.py` into `modules/<app>/` to match
  the new API module convention.
- Still pending application: migrations `…000300`, `…000400`, `…000600` (`…000500` applied).
