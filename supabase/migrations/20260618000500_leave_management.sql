-- Leave management: requests with a manager/admin approval workflow, plus
-- display-only per-employee leave allowances. Balances are derived
-- (allotted - approved days), never stored. Remote application is separate.

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  leave_type text not null
    check (leave_type in ('annual', 'sick', 'family_responsibility', 'unpaid')),
  start_date date not null,
  end_date date not null,
  day_part text not null default 'full'
    check (day_part in ('full', 'morning', 'afternoon')),
  days numeric(5, 1) not null check (days > 0),
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_date_order check (end_date >= start_date),
  constraint leave_requests_halfday_single_day
    check (day_part = 'full' or start_date = end_date),
  constraint leave_requests_employee_company_fk
    foreign key (employee_id, company_id)
    references public.employees (id, company_id)
    on delete cascade
);

create index leave_requests_employee_idx
  on public.leave_requests (company_id, employee_id, start_date desc);

create index leave_requests_company_status_idx
  on public.leave_requests (company_id, status, start_date desc);

create trigger leave_requests_set_updated_at
before update on public.leave_requests
for each row execute function public.set_updated_at();

create table public.leave_allowances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  leave_type text not null
    check (leave_type in ('annual', 'sick', 'family_responsibility', 'unpaid')),
  allotted_days numeric(5, 1) not null default 0 check (allotted_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_id, leave_type),
  constraint leave_allowances_employee_company_fk
    foreign key (employee_id, company_id)
    references public.employees (id, company_id)
    on delete cascade
);

create index leave_allowances_employee_idx
  on public.leave_allowances (company_id, employee_id);

create trigger leave_allowances_set_updated_at
before update on public.leave_allowances
for each row execute function public.set_updated_at();

revoke all on table public.leave_requests from anon;
revoke all on table public.leave_allowances from anon;
grant select, insert, update, delete on table public.leave_requests to authenticated;
grant select, insert, update, delete on table public.leave_allowances to authenticated;

alter table public.leave_requests enable row level security;
alter table public.leave_allowances enable row level security;

-- Visible to: company admins, the requesting employee, and that employee's manager.
create policy "leave_requests_select_authorized"
on public.leave_requests for select to authenticated
using (
  public.has_company_role(company_id, array['admin'])
  or employee_id = public.current_employee_id(company_id)
  or (
    public.has_company_role(company_id, array['manager'])
    and exists (
      select 1
      from public.employees employee
      where employee.id = leave_requests.employee_id
        and employee.company_id = leave_requests.company_id
        and employee.manager_employee_id = public.current_employee_id(company_id)
    )
  )
);

-- Employees create their own pending requests only.
create policy "leave_requests_insert_self"
on public.leave_requests for insert to authenticated
with check (
  employee_id = public.current_employee_id(company_id)
  and status = 'pending'
);

-- Row access for updates; the API enforces which transition is allowed.
create policy "leave_requests_update_authorized"
on public.leave_requests for update to authenticated
using (
  public.has_company_role(company_id, array['admin'])
  or employee_id = public.current_employee_id(company_id)
  or (
    public.has_company_role(company_id, array['manager'])
    and exists (
      select 1
      from public.employees employee
      where employee.id = leave_requests.employee_id
        and employee.company_id = leave_requests.company_id
        and employee.manager_employee_id = public.current_employee_id(company_id)
    )
  )
)
with check (
  public.has_company_role(company_id, array['admin'])
  or employee_id = public.current_employee_id(company_id)
  or (
    public.has_company_role(company_id, array['manager'])
    and exists (
      select 1
      from public.employees employee
      where employee.id = leave_requests.employee_id
        and employee.company_id = leave_requests.company_id
        and employee.manager_employee_id = public.current_employee_id(company_id)
    )
  )
);

create policy "leave_requests_delete_admin"
on public.leave_requests for delete to authenticated
using (public.has_company_role(company_id, array['admin']));

create policy "leave_allowances_select_authorized"
on public.leave_allowances for select to authenticated
using (
  public.has_company_role(company_id, array['admin'])
  or employee_id = public.current_employee_id(company_id)
  or (
    public.has_company_role(company_id, array['manager'])
    and exists (
      select 1
      from public.employees employee
      where employee.id = leave_allowances.employee_id
        and employee.company_id = leave_allowances.company_id
        and employee.manager_employee_id = public.current_employee_id(company_id)
    )
  )
);

create policy "leave_allowances_write_admin"
on public.leave_allowances for all to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

comment on table public.leave_requests is
  'Employee leave requests with a manager/admin approval workflow.';
comment on table public.leave_allowances is
  'Per-employee, per-type leave allowance. Used/remaining are derived, not stored.';
