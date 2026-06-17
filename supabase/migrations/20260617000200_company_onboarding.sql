-- Company bootstrap and employee invitation workflow.

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role text not null check (role in ('admin', 'manager', 'employee')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'accepted', 'failed', 'revoked', 'expired')),
  invited_by uuid not null references public.profiles (id) on delete restrict,
  invited_user_id uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_invitations_employee_company_fk
    foreign key (employee_id, company_id)
    references public.employees (id, company_id)
    on delete cascade
);

create unique index company_invitations_active_email_uidx
  on public.company_invitations (company_id, lower(email))
  where status in ('pending', 'sent');

create index company_invitations_company_status_idx
  on public.company_invitations (company_id, status, created_at desc);

create trigger company_invitations_set_updated_at
before update on public.company_invitations
for each row execute function public.set_updated_at();

create or replace function public.bootstrap_company(
  company_name text,
  company_slug text,
  employee_number text,
  first_name text,
  last_name text,
  job_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  created_company public.companies;
  created_employee public.employees;
  created_membership public.company_memberships;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select profile.email
  into actor_email
  from public.profiles profile
  where profile.id = actor_id;

  if actor_email is null then
    raise exception 'Authenticated profile does not exist' using errcode = '23503';
  end if;

  insert into public.companies (name, slug)
  values (trim(company_name), lower(trim(company_slug)))
  returning * into created_company;

  insert into public.employees (
    company_id,
    profile_id,
    employee_number,
    first_name,
    last_name,
    email,
    job_title,
    status
  )
  values (
    created_company.id,
    actor_id,
    trim(employee_number),
    trim(first_name),
    trim(last_name),
    lower(actor_email),
    nullif(trim(job_title), ''),
    'active'
  )
  returning * into created_employee;

  insert into public.company_memberships (company_id, user_id, role, status)
  values (created_company.id, actor_id, 'admin', 'active')
  returning * into created_membership;

  return jsonb_build_object(
    'company_id', created_company.id,
    'employee_id', created_employee.id,
    'membership_id', created_membership.id,
    'role', created_membership.role
  );
end;
$$;

create or replace function public.create_employee_invitation(
  target_company_id uuid,
  invite_email text,
  assigned_role text,
  employee_number text,
  first_name text,
  last_name text,
  department_id uuid default null,
  manager_employee_id uuid default null,
  job_title text default null,
  employment_type text default null,
  start_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_email text := lower(trim(invite_email));
  created_employee public.employees;
  created_invitation public.company_invitations;
begin
  if actor_id is null or not public.has_company_role(target_company_id, array['admin']) then
    raise exception 'Company admin access is required' using errcode = '42501';
  end if;

  if assigned_role not in ('admin', 'manager', 'employee') then
    raise exception 'Unsupported company role' using errcode = '22023';
  end if;

  insert into public.employees (
    company_id,
    department_id,
    manager_employee_id,
    employee_number,
    first_name,
    last_name,
    email,
    job_title,
    employment_type,
    start_date,
    status
  )
  values (
    target_company_id,
    department_id,
    manager_employee_id,
    trim(employee_number),
    trim(first_name),
    trim(last_name),
    normalized_email,
    nullif(trim(job_title), ''),
    nullif(trim(employment_type), ''),
    start_date,
    'active'
  )
  returning * into created_employee;

  insert into public.company_invitations (
    company_id,
    employee_id,
    email,
    role,
    invited_by
  )
  values (
    target_company_id,
    created_employee.id,
    normalized_email,
    assigned_role,
    actor_id
  )
  returning * into created_invitation;

  return jsonb_build_object(
    'invitation_id', created_invitation.id,
    'employee_id', created_employee.id,
    'company_id', created_invitation.company_id,
    'email', created_invitation.email,
    'role', created_invitation.role,
    'status', created_invitation.status,
    'expires_at', created_invitation.expires_at
  );
end;
$$;

create or replace function public.accept_company_invitation(invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  invitation public.company_invitations;
  created_membership public.company_memberships;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select lower(profile.email)
  into actor_email
  from public.profiles profile
  where profile.id = actor_id;

  select company_invitation.*
  into invitation
  from public.company_invitations company_invitation
  where company_invitation.id = invitation_id
  for update;

  if invitation.id is null then
    raise exception 'Invitation does not exist' using errcode = 'P0002';
  end if;

  if invitation.status not in ('pending', 'sent') then
    raise exception 'Invitation is not active' using errcode = '22023';
  end if;

  if invitation.expires_at <= now() then
    update public.company_invitations
    set status = 'expired'
    where id = invitation.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;

  if actor_email is null or actor_email <> invitation.email then
    raise exception 'Invitation email does not match the authenticated user'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = invitation.company_id
      and membership.user_id = actor_id
      and membership.status = 'active'
  ) then
    raise exception 'User already has an active company membership'
      using errcode = '23505';
  end if;

  update public.employees
  set profile_id = actor_id
  where id = invitation.employee_id
    and company_id = invitation.company_id
    and (profile_id is null or profile_id = actor_id);

  if not found then
    raise exception 'Employee identity is already linked' using errcode = '23505';
  end if;

  insert into public.company_memberships (company_id, user_id, role, status)
  values (invitation.company_id, actor_id, invitation.role, 'active')
  on conflict (company_id, user_id) do update
  set role = excluded.role,
      status = 'active'
  returning * into created_membership;

  update public.company_invitations
  set status = 'accepted',
      invited_user_id = actor_id,
      accepted_at = now()
  where id = invitation.id;

  return jsonb_build_object(
    'company_id', invitation.company_id,
    'employee_id', invitation.employee_id,
    'membership_id', created_membership.id,
    'role', created_membership.role,
    'status', 'accepted'
  );
end;
$$;

revoke all on table public.company_invitations from anon;
grant select, insert, update, delete on table public.company_invitations to authenticated;

alter table public.company_invitations enable row level security;

create policy "company_invitations_select_admin"
on public.company_invitations for select to authenticated
using (public.has_company_role(company_id, array['admin']));

create policy "company_invitations_insert_admin"
on public.company_invitations for insert to authenticated
with check (public.has_company_role(company_id, array['admin']));

create policy "company_invitations_update_admin"
on public.company_invitations for update to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

create policy "company_invitations_delete_admin"
on public.company_invitations for delete to authenticated
using (public.has_company_role(company_id, array['admin']));

revoke all on function public.bootstrap_company(text, text, text, text, text, text) from public;
revoke all on function public.create_employee_invitation(
  uuid, text, text, text, text, text, uuid, uuid, text, text, date
) from public;
revoke all on function public.accept_company_invitation(uuid) from public;

grant execute on function public.bootstrap_company(text, text, text, text, text, text)
  to authenticated;
grant execute on function public.create_employee_invitation(
  uuid, text, text, text, text, text, uuid, uuid, text, text, date
) to authenticated;
grant execute on function public.accept_company_invitation(uuid) to authenticated;

comment on table public.company_invitations is
  'Pending employee identity and company-role invitation. Supabase Auth owns email delivery and login.';
comment on function public.bootstrap_company(text, text, text, text, text, text) is
  'Atomically creates a company, the founding admin employee, and their active membership.';
comment on function public.accept_company_invitation(uuid) is
  'Atomically links an authenticated user to the invited employee and company role.';
