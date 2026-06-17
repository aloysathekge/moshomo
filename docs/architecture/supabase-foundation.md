# Supabase Foundation

## Purpose

This document defines the first Moshomo data/auth foundation. It should be implemented before broad employee, leave, shift, or Moshomo AI work.

Moshomo V1 uses one Supabase project for:

- Postgres data.
- Supabase Auth.
- Row-level security.
- Storage for employee documents and company knowledge files.

## Tenancy Model

Moshomo is company-first.

Every business record must be scoped to a `company_id` unless it is truly global configuration.

Primary tenancy entities:

- `companies`
- `profiles`
- `company_memberships`
- `departments`
- `employees`

## Auth Assumptions

- Supabase Auth owns user identity.
- `auth.users.id` maps to `profiles.id`.
- A user may belong to more than one company.
- A user may have different roles in different companies.
- FastAPI may use a server-side Supabase service role for trusted backend workflows, but client-facing access must still respect Moshomo permissions.

## Roles

Initial roles:

- `admin`: full company access.
- `manager`: employees, leave, and shifts for assigned scope.
- `employee`: own profile, own leave, own shifts.

Do not model payroll, attendance, recruitment, performance, or benefits in V1.

## Core Tables

### companies

Stores each customer company.

Columns:

- `id uuid primary key`
- `name text not null`
- `slug text unique`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### profiles

Extends Supabase Auth users.

Columns:

- `id uuid primary key references auth.users(id)`
- `email text not null`
- `full_name text`
- `avatar_url text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### company_memberships

Connects users to companies and roles.

Columns:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `user_id uuid not null references profiles(id)`
- `role text not null check (role in ('admin', 'manager', 'employee'))`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- unique `company_id, user_id`

### departments

Company-local departments.

Columns:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `name text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- unique `company_id, name`

### employees

The employee source of truth.

Columns:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `profile_id uuid references profiles(id)`
- `department_id uuid references departments(id)`
- `manager_employee_id uuid references employees(id)`
- `employee_number text not null`
- `first_name text not null`
- `last_name text not null`
- `email text`
- `phone_number text`
- `job_title text`
- `employment_type text`
- `start_date date`
- `salary_rate numeric`
- `status text not null check (status in ('active', 'suspended', 'terminated', 'resigned'))`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- unique `company_id, employee_number`
- unique `company_id, email` where email is not null

## Moshomo AI Tables

These should exist early enough that AI memory does not grow as an afterthought.

### company_knowledge_entries

Company-wide knowledge for policy and operational Q&A.

Columns:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `title text`
- `content text not null`
- `source_type text not null`
- `source_id text`
- `tags text[] default '{}'`
- `sensitivity text not null default 'internal'`
- `created_by uuid references profiles(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### employee_memory_entries

Permission-gated employee-specific memory.

Columns:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `employee_id uuid not null references employees(id)`
- `content text not null`
- `kind text not null check (kind in ('semantic', 'episodic', 'procedural'))`
- `source_type text not null`
- `source_id text`
- `sensitivity text not null default 'confidential'`
- `created_by uuid references profiles(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### assistant_runs

Auditable AI task execution.

Columns:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `actor_user_id uuid not null references profiles(id)`
- `conversation_id uuid`
- `status text not null default 'pending'`
- `input text not null`
- `intent jsonb`
- `tool_calls jsonb default '[]'`
- `affected_records jsonb default '[]'`
- `final_answer text`
- `reasoning_summary text`
- `created_at timestamptz not null default now()`
- `completed_at timestamptz`

## RLS Direction

Enable RLS on all company-scoped tables.

Initial policy helpers should answer:

- Is the authenticated user an active member of this company?
- Is the authenticated user an admin for this company?
- Is the authenticated user a manager for this company?
- Which employee record belongs to the authenticated user?

Policy sketch:

- Admins can select/insert/update company records.
- Managers can select company employees and manage their assigned scope.
- Employees can select their own employee record.
- Employees cannot select other employee memory entries.
- Company knowledge is visible to active members unless marked more sensitive.
- Assistant runs are visible to the actor, admins, and managers with relevant scope.

## Storage Direction

Buckets:

- `employee-documents`
- `company-knowledge`

Rules:

- Employee documents are private.
- Company knowledge files are private by default.
- Signed URLs should be short-lived.
- AI ingestion must store provenance linking storage object to knowledge entry.

## API Boundary

FastAPI should expose product-safe endpoints and keep service-role operations server-side.

Initial areas:

- `apps/api/src/moshomo_api/auth.py`
- `apps/api/src/moshomo_api/supabase.py`
- `apps/api/src/moshomo_api/routers/profiles.py`
- `apps/api/src/moshomo_api/routers/employees.py`

Do not put service-role keys in web or mobile apps.

## First Migration Order

1. `profiles`
2. `companies`
3. `company_memberships`
4. `departments`
5. `employees`
6. `company_knowledge_entries`
7. `employee_memory_entries`
8. `assistant_runs`
9. RLS helper functions
10. RLS policies
11. Storage buckets and policies

## Open Decisions

- Whether manager scope is based on department, direct reports, explicit teams, or a mix.
- Whether `salary_rate` should ship in the first implementation or be postponed because it is sensitive.
- Whether employee documents are implemented in the first vertical slice or after employee CRUD.
- Whether Moshomo AI memory uses Postgres text search first or vector search from day one.
