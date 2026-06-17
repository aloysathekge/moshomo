# Admin Employee Management + Documents

## Goal

Fix the admin workspace per user feedback: the dashboard was showing a placeholder
"Workforce overview" activity feed and a duplicated logo card. Replace that with a real
admin experience — Employees management (add, view profiles, documents, remove, change
role / make manager) — and make "Finish setting up" appear only when setup is incomplete.
User chose the **full** build, including documents (which needs an approval-gated migration).

## Completed

### Database
- `supabase/migrations/20260617000400_employee_documents.sql` (NOT applied — approval-gated):
  - `employee_documents` table (company/employee scoped, storage_path, file_name, doc_type,
    content_type, size_bytes, uploaded_by) + RLS: read = admin OR the employee OR their
    manager; write = admin only.
  - PRIVATE `employee-documents` storage bucket (PDF/PNG/JPEG/WebP, 10 MB) + storage RLS
    mirroring the same scope, keyed on path `<company_id>/<employee_id>/<filename>`.

### API (`apps/api`)
- `supabase.py`: added `SupabaseRestClient.delete(...)`.
- `context.py`: added shared `require_company_admin(actor, company_id)`.
- New router `routers/employee_management.py` (registered in `main.py`), prefix
  `/companies/{company_id}/employees`:
  - `PATCH /{employee_id}` — update mutable fields (dept, manager, names, phone, title,
    employment type, status). Admin only.
  - `PATCH /{employee_id}/role` — sets `company_memberships.role` (if linked) and any
    pending/sent `company_invitations.role`. Blocks an admin demoting themselves. Uses
    existing RLS, no migration.
  - `DELETE /{employee_id}` — removes the employee row; blocks removing your own record.
  - `POST/GET/DELETE /{employee_id}/documents[/{document_id}]` — document metadata
    (depends on the unapplied migration; degrades gracefully until applied).
- Tests `tests/test_employee_management_api.py` (8): field update, non-admin forbidden,
  role change updates membership+invitation, cannot change own role, remove, cannot remove
  self, document path validation, document create. **21 passed total.**

### Web (`apps/web`)
- `lib/api.ts`: `moshomoApi` now supports `DELETE` and 204/empty responses.
- New `components/employees-panel.tsx`: searchable employee list with role + account-state
  badges (derived from memberships + invitations), an "Add employee" invite form, and a
  profile modal with: detail grid, role controls (make employee/manager/admin), an edit
  form (dept, reports-to, status, etc.), a Documents section (upload to the private bucket,
  list, open via short-lived signed URL, delete), and a remove action. `canManage` hides
  admin-only controls for managers (read-only team view).
- `app/app/page.tsx` rewritten: removed the full-screen onboarding gate and the placeholder
  activity feed / dashboard logo card. Now hash-driven sections (home / employees /
  departments / settings / coming-soon). Real metrics (employees, departments, pending
  invites). "Finish setting up" shows only when incomplete (Settings checklist + dashboard
  banner). New Departments view (create + per-dept headcount) and Settings view (logo +
  company details).
- `components/app-shell.tsx`: active nav item now tracks the URL hash (sidebar + mobile nav).

## Verification

- `uv run --project apps/api python -m compileall apps/api/src` — clean.
- `uv run --project apps/api pytest apps/api/tests -q` — **21 passed**.
- `pnpm --filter @moshomo/web typecheck` / `lint` / `build` — all clean (6 static routes).

## Pending Approval / Follow-ups

- Apply `20260617000400_employee_documents.sql` (and the still-pending
  `20260617000300_company_branding.sql`) to the linked Supabase project, then lint + manual
  test logo and document upload. Until applied, document UI shows an "available once
  applied" notice.
- Manager/employee sections beyond the team view are still "Coming soon".
- Company rename/slug editing is read-only (no API yet).
- Next planned work: strip/copy Pori into native `moshomo_ai`.
