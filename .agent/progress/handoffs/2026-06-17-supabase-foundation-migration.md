# Supabase Foundation Migration

## Summary

Implemented the first local Supabase migration for company tenancy, workforce identity, and Moshomo AI memory/auditing.

## What Changed

- Added `supabase/migrations/20260617000100_foundation.sql`.
- Added `supabase/README.md` with safe local and remote workflows.
- Updated `docs/architecture/supabase-foundation.md` with implementation status and resolved decisions.
- Installed Supabase CLI 2.106.0 as a root development dependency and initialized `supabase/config.toml`.
- Linked the repository to the `moshomoai` Supabase project.

## Schema

The migration creates:

- `profiles`
- `companies`
- `company_memberships`
- `departments`
- `employees`
- `company_knowledge_entries`
- `employee_memory_entries`
- `assistant_runs`

It also adds Auth profile synchronization, `updated_at` triggers, tenant/role helper functions, explicit grants, indexes, and 22 RLS policies.

## Decisions

- Company is the workspace and tenant boundary.
- Managers initially see their own employee record and direct reports.
- Company and first-admin creation use trusted backend service-role workflows.
- Salary is deferred until field-level authorization is designed.
- Remote migration application is explicit and was completed after a successful dry-run and user approval.

## Verification

- PostgreSQL parser accepted all 91 statements.
- Static security checks confirmed all 8 tables have RLS and tenant-safe employee/department/memory foreign keys.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `uv run --project apps/api python -m compileall apps/api/src` passed.
- `pnpm supabase migration list --linked` confirmed the foundation as the only pending migration.
- `pnpm supabase db push --linked --dry-run` passed and would apply only `20260617000100_foundation.sql`.
- `pnpm supabase db push --linked` applied `20260617000100_foundation.sql` successfully.
- Local and remote migration histories match at `20260617000100`.
- `pnpm supabase db lint --linked` passed with no schema errors.

## Environment Limitation

The Supabase MCP was not exposed in the session, but authenticated CLI access is now configured. Docker is not installed, so `supabase db reset` remains unavailable.

## Next Step

Implement FastAPI JWT validation, actor/company context, and read-only employee repositories against the deployed schema.
