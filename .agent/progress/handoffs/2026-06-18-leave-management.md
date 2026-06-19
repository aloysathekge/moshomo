# Leave Management (first real workforce app)

## Goal

Build the first real app from the registry — Leave Management (Phase 3). A self-contained
request → approve/reject workflow reusing the existing role/RLS model.

Confirmed decisions: **allowances, display-only** (balance = allowance − approved days, never
blocks); **calendar days inclusive** with single-day **half-days** (Full/Morning/Afternoon →
1.0/0.5, `days numeric(5,1)`); approvers = the employee's **manager** + any **admin**;
employees create + cancel their own pending requests.

## Completed

- **DB** — `supabase/migrations/20260618000500_leave_management.sql` (NOT applied):
  `leave_requests` (type/dates/day_part/days/status/decided_by; checks: date order +
  half-day-only-on-single-day) and `leave_allowances` (per employee+type, unique). RLS reuses
  `has_company_role`/`current_employee_id`: select+update scoped to admin / owner /
  manager-of-report; insert = own pending only; allowance writes = admin. `set_updated_at`
  triggers; grants; anon revoked.
- **API** — `apps/api/src/moshomo_api/routers/leave.py` (registered in `main.py`):
  `POST /workforce/leave/requests` (server computes `days`; Pydantic validates half-day),
  `GET /workforce/leave/requests?status=&mine=` (RLS-scoped, employee embed),
  `PATCH /workforce/leave/requests/{id}` (approve/reject = admin or the employee's manager;
  cancel = owner; pending-only, else 409; wrong role 403),
  `GET /workforce/leave/balances?employee_id=` (derives used/remaining),
  `PUT /workforce/leave/allowances/{employee_id}` (admin upsert). Added
  `SupabaseRestClient.upsert` (merge-duplicates on a conflict target).
- **Web** — `apps/web/src/components/leave-panel.tsx` (role-aware, design-system styled,
  graceful "being set up" state on error): request form with half-day toggle (single-day
  only) + live day count, "My requests" with status badges + cancel-pending, "My balance"
  card, manager/admin "Approvals" inbox (approve/reject), admin "Allowances" editor (per
  employee, prefilled from balances). `leave` app → `status: "live"` in `apps/web/src/lib/apps.ts`;
  dispatched in `app/page.tsx`. `moshomoApi` now supports `PUT`.
- **Shared** — `packages/shared/src/index.ts` gained `leaveRequestStatuses` + `dayParts`.

## Verification

- `uv run --project apps/api python -m compileall apps/api/src` — clean.
- `uv run --project apps/api pytest apps/api/tests -q` — **39 passed** (12 new leave tests).
- `pnpm --filter @moshomo/web typecheck` / `lint` / `build` — clean.

## Not done / follow-ups

- **Apply the migration** `20260618000500_leave_management.sql` (approval-gated, Docker-less
  remote apply — same as the still-pending branding + documents migrations). Until applied the
  Leave panel shows a "being set up" notice, and the running API needs a restart to load the
  new `leave` router.
- Balance **enforcement**/accrual/carry-over; public-holiday calendar; working-day counting;
  half-day at both ends of a multi-day range; team **calendar** view; mobile leave UI.
- AI leave tools (`get_leave_balance`, `create_leave_request_draft`) once write tools land.
- Optional: make the dashboards' "On leave today" / "Pending requests" metric cards real.
- Next app per the plan: **Smart Shifts** (Phase 4).
