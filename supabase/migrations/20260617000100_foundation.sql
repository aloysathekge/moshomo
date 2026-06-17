-- Moshomo company, workforce, and AI foundation.
-- Remote application is intentionally separate from creating this migration.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'manager', 'employee')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_memberships_user_company_idx
  on public.company_memberships (user_id, company_id)
  where status = 'active';

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create index departments_company_idx on public.departments (company_id);

create unique index departments_company_name_uidx
  on public.departments (company_id, lower(name));

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  department_id uuid,
  manager_employee_id uuid,
  employee_number text not null check (length(trim(employee_number)) > 0),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  email text,
  phone_number text,
  job_title text,
  employment_type text,
  start_date date,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'terminated', 'resigned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_number),
  unique (id, company_id),
  unique (company_id, profile_id),
  constraint employees_department_company_fk
    foreign key (department_id, company_id)
    references public.departments (id, company_id),
  constraint employees_manager_company_fk
    foreign key (manager_employee_id, company_id)
    references public.employees (id, company_id),
  constraint employees_not_own_manager
    check (manager_employee_id is null or manager_employee_id <> id)
);

create unique index employees_company_email_uidx
  on public.employees (company_id, lower(email))
  where email is not null;

create index employees_company_department_idx
  on public.employees (company_id, department_id);

create index employees_company_manager_idx
  on public.employees (company_id, manager_employee_id);

create table public.company_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text,
  content text not null check (length(trim(content)) > 0),
  source_type text not null check (length(trim(source_type)) > 0),
  source_id text,
  tags text[] not null default '{}',
  sensitivity text not null default 'internal'
    check (sensitivity in ('public', 'internal', 'confidential', 'restricted')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index company_knowledge_entries_company_idx
  on public.company_knowledge_entries (company_id, updated_at desc);

create index company_knowledge_entries_tags_idx
  on public.company_knowledge_entries using gin (tags);

create table public.employee_memory_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  content text not null check (length(trim(content)) > 0),
  kind text not null check (kind in ('semantic', 'episodic', 'procedural')),
  source_type text not null check (length(trim(source_type)) > 0),
  source_id text,
  sensitivity text not null default 'confidential'
    check (sensitivity in ('public', 'internal', 'confidential', 'restricted')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_memory_employee_company_fk
    foreign key (employee_id, company_id)
    references public.employees (id, company_id)
    on delete cascade
);

create index employee_memory_entries_employee_idx
  on public.employee_memory_entries (company_id, employee_id, updated_at desc);

create table public.assistant_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_user_id uuid not null references public.profiles (id) on delete restrict,
  conversation_id uuid,
  request_source text not null default 'api'
    check (request_source in ('web', 'mobile', 'api', 'automation')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'refused')),
  input text not null check (length(trim(input)) > 0),
  intent jsonb,
  tool_calls jsonb not null default '[]'::jsonb
    check (jsonb_typeof(tool_calls) = 'array'),
  cited_records jsonb not null default '[]'::jsonb
    check (jsonb_typeof(cited_records) = 'array'),
  affected_records jsonb not null default '[]'::jsonb
    check (jsonb_typeof(affected_records) = 'array'),
  final_answer text,
  reasoning_summary text,
  refusal_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index assistant_runs_actor_idx
  on public.assistant_runs (company_id, actor_user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  return new;
end;
$$;

insert into public.profiles (id, email, full_name, avatar_url)
select
  auth_user.id,
  coalesce(auth_user.email, ''),
  coalesce(
    auth_user.raw_user_meta_data ->> 'full_name',
    auth_user.raw_user_meta_data ->> 'name'
  ),
  auth_user.raw_user_meta_data ->> 'avatar_url'
from auth.users auth_user
on conflict (id) do nothing;

create trigger auth_users_sync_profile
after insert or update of email on auth.users
for each row execute function public.handle_new_auth_user();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create trigger company_memberships_set_updated_at
before update on public.company_memberships
for each row execute function public.set_updated_at();

create trigger departments_set_updated_at
before update on public.departments
for each row execute function public.set_updated_at();

create trigger employees_set_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

create trigger company_knowledge_entries_set_updated_at
before update on public.company_knowledge_entries
for each row execute function public.set_updated_at();

create trigger employee_memory_entries_set_updated_at
before update on public.employee_memory_entries
for each row execute function public.set_updated_at();

create or replace function public.is_active_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function public.has_company_role(
  target_company_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any (allowed_roles)
  );
$$;

create or replace function public.current_employee_id(target_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select employee.id
  from public.employees employee
  where employee.company_id = target_company_id
    and employee.profile_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.is_active_company_member(uuid) from public;
revoke all on function public.has_company_role(uuid, text[]) from public;
revoke all on function public.current_employee_id(uuid) from public;

grant execute on function public.is_active_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid, text[]) to authenticated;
grant execute on function public.current_employee_id(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.company_knowledge_entries enable row level security;
alter table public.employee_memory_entries enable row level security;
alter table public.assistant_runs enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.companies from anon;
revoke all on table public.company_memberships from anon;
revoke all on table public.departments from anon;
revoke all on table public.employees from anon;
revoke all on table public.company_knowledge_entries from anon;
revoke all on table public.employee_memory_entries from anon;
revoke all on table public.assistant_runs from anon;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.companies to authenticated;
grant select, insert, update, delete on table public.company_memberships to authenticated;
grant select, insert, update, delete on table public.departments to authenticated;
grant select, insert, update, delete on table public.employees to authenticated;
grant select, insert, update, delete on table public.company_knowledge_entries to authenticated;
grant select, insert, update, delete on table public.employee_memory_entries to authenticated;
grant select, insert, update, delete on table public.assistant_runs to authenticated;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "profiles_update_own"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "companies_select_member"
on public.companies for select to authenticated
using (public.is_active_company_member(id));

create policy "companies_update_admin"
on public.companies for update to authenticated
using (public.has_company_role(id, array['admin']))
with check (public.has_company_role(id, array['admin']));

create policy "memberships_select_self_or_admin"
on public.company_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_company_role(company_id, array['admin'])
);

create policy "memberships_insert_admin"
on public.company_memberships for insert to authenticated
with check (public.has_company_role(company_id, array['admin']));

create policy "memberships_update_admin"
on public.company_memberships for update to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

create policy "memberships_delete_admin"
on public.company_memberships for delete to authenticated
using (public.has_company_role(company_id, array['admin']));

create policy "departments_select_member"
on public.departments for select to authenticated
using (public.is_active_company_member(company_id));

create policy "departments_insert_admin"
on public.departments for insert to authenticated
with check (public.has_company_role(company_id, array['admin']));

create policy "departments_update_admin"
on public.departments for update to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

create policy "departments_delete_admin"
on public.departments for delete to authenticated
using (public.has_company_role(company_id, array['admin']));

create policy "employees_select_authorized"
on public.employees for select to authenticated
using (
  public.has_company_role(company_id, array['admin'])
  or profile_id = (select auth.uid())
  or (
    public.has_company_role(company_id, array['manager'])
    and (
      id = public.current_employee_id(company_id)
      or manager_employee_id = public.current_employee_id(company_id)
    )
  )
);

create policy "employees_insert_admin"
on public.employees for insert to authenticated
with check (public.has_company_role(company_id, array['admin']));

create policy "employees_update_admin"
on public.employees for update to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

create policy "employees_delete_admin"
on public.employees for delete to authenticated
using (public.has_company_role(company_id, array['admin']));

create policy "company_knowledge_select_authorized"
on public.company_knowledge_entries for select to authenticated
using (
  public.is_active_company_member(company_id)
  and (
    sensitivity in ('public', 'internal')
    or (
      sensitivity = 'confidential'
      and public.has_company_role(company_id, array['admin', 'manager'])
    )
    or (
      sensitivity = 'restricted'
      and public.has_company_role(company_id, array['admin'])
    )
  )
);

create policy "company_knowledge_write_admin"
on public.company_knowledge_entries for all to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

create policy "employee_memory_select_authorized"
on public.employee_memory_entries for select to authenticated
using (
  public.has_company_role(company_id, array['admin'])
  or (
    sensitivity <> 'restricted'
    and (
      employee_id = public.current_employee_id(company_id)
      or (
        public.has_company_role(company_id, array['manager'])
        and exists (
          select 1
          from public.employees employee
          where employee.id = employee_memory_entries.employee_id
            and employee.company_id = employee_memory_entries.company_id
            and employee.manager_employee_id = public.current_employee_id(company_id)
        )
      )
    )
  )
);

create policy "employee_memory_write_admin"
on public.employee_memory_entries for all to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

create policy "assistant_runs_select_actor_or_admin"
on public.assistant_runs for select to authenticated
using (
  actor_user_id = (select auth.uid())
  or public.has_company_role(company_id, array['admin'])
);

create policy "assistant_runs_insert_actor"
on public.assistant_runs for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and public.is_active_company_member(company_id)
);

comment on table public.companies is
  'Top-level Moshomo tenant and workspace boundary.';
comment on table public.company_memberships is
  'Assigns an authenticated profile a company-local role.';
comment on table public.employees is
  'Company workforce record; manager_employee_id defines direct-report scope.';
comment on table public.assistant_runs is
  'Auditable Moshomo AI execution record. Backend service-role workflows complete runs.';
