-- Smart Shifts: reusable shift templates, scheduled assignments (open = unassigned),
-- and weekly employee availability. Remote application is separate.

create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  start_time time not null,
  end_time time not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create unique index shift_templates_company_name_uidx
  on public.shift_templates (company_id, lower(name));

create trigger shift_templates_set_updated_at
before update on public.shift_templates
for each row execute function public.set_updated_at();

create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  template_id uuid not null,
  employee_id uuid,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_assignments_template_company_fk
    foreign key (template_id, company_id)
    references public.shift_templates (id, company_id)
    on delete cascade,
  constraint shift_assignments_employee_company_fk
    foreign key (employee_id, company_id)
    references public.employees (id, company_id)
    on delete set null
);

create index shift_assignments_date_idx
  on public.shift_assignments (company_id, shift_date);

create index shift_assignments_employee_idx
  on public.shift_assignments (company_id, employee_id, shift_date);

create trigger shift_assignments_set_updated_at
before update on public.shift_assignments
for each row execute function public.set_updated_at();

create table public.employee_availability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6), -- 0=Sunday .. 6=Saturday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_availability_employee_company_fk
    foreign key (employee_id, company_id)
    references public.employees (id, company_id)
    on delete cascade
);

create index employee_availability_employee_idx
  on public.employee_availability (company_id, employee_id, weekday);

create trigger employee_availability_set_updated_at
before update on public.employee_availability
for each row execute function public.set_updated_at();

revoke all on table public.shift_templates from anon;
revoke all on table public.shift_assignments from anon;
revoke all on table public.employee_availability from anon;
grant select, insert, update, delete on table public.shift_templates to authenticated;
grant select, insert, update, delete on table public.shift_assignments to authenticated;
grant select, insert, update, delete on table public.employee_availability to authenticated;

alter table public.shift_templates enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.employee_availability enable row level security;

-- Templates: any active member reads; admins and managers manage.
create policy "shift_templates_select_member"
on public.shift_templates for select to authenticated
using (public.is_active_company_member(company_id));

create policy "shift_templates_write_staff"
on public.shift_templates for all to authenticated
using (public.has_company_role(company_id, array['admin', 'manager']))
with check (public.has_company_role(company_id, array['admin', 'manager']));

-- Assignments: visible to admin, the assignee, and (managers) open shifts + reports.
create policy "shift_assignments_select_authorized"
on public.shift_assignments for select to authenticated
using (
  public.has_company_role(company_id, array['admin'])
  or employee_id = public.current_employee_id(company_id)
  or (
    public.has_company_role(company_id, array['manager'])
    and (
      employee_id is null
      or exists (
        select 1
        from public.employees employee
        where employee.id = shift_assignments.employee_id
          and employee.company_id = shift_assignments.company_id
          and employee.manager_employee_id = public.current_employee_id(company_id)
      )
    )
  )
);

create policy "shift_assignments_write_staff"
on public.shift_assignments for all to authenticated
using (
  public.has_company_role(company_id, array['admin'])
  or (
    public.has_company_role(company_id, array['manager'])
    and (
      employee_id is null
      or employee_id = public.current_employee_id(company_id)
      or exists (
        select 1
        from public.employees employee
        where employee.id = shift_assignments.employee_id
          and employee.company_id = shift_assignments.company_id
          and employee.manager_employee_id = public.current_employee_id(company_id)
      )
    )
  )
)
with check (
  public.has_company_role(company_id, array['admin'])
  or (
    public.has_company_role(company_id, array['manager'])
    and (
      employee_id is null
      or employee_id = public.current_employee_id(company_id)
      or exists (
        select 1
        from public.employees employee
        where employee.id = shift_assignments.employee_id
          and employee.company_id = shift_assignments.company_id
          and employee.manager_employee_id = public.current_employee_id(company_id)
      )
    )
  )
);

-- Availability: admin/owner/manager-of-report read; owner or admin writes.
create policy "employee_availability_select_authorized"
on public.employee_availability for select to authenticated
using (
  public.has_company_role(company_id, array['admin'])
  or employee_id = public.current_employee_id(company_id)
  or (
    public.has_company_role(company_id, array['manager'])
    and exists (
      select 1
      from public.employees employee
      where employee.id = employee_availability.employee_id
        and employee.company_id = employee_availability.company_id
        and employee.manager_employee_id = public.current_employee_id(company_id)
    )
  )
);

create policy "employee_availability_write_self_or_admin"
on public.employee_availability for all to authenticated
using (
  public.has_company_role(company_id, array['admin'])
  or employee_id = public.current_employee_id(company_id)
)
with check (
  public.has_company_role(company_id, array['admin'])
  or employee_id = public.current_employee_id(company_id)
);

comment on table public.shift_templates is 'Reusable shift patterns (name + start/end time).';
comment on table public.shift_assignments is
  'Scheduled shifts. employee_id NULL means an open (unassigned) shift.';
comment on table public.employee_availability is
  'Weekly recurring availability windows. weekday 0=Sunday .. 6=Saturday.';
