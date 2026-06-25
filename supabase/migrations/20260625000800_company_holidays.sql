-- Company public holidays — used to exclude non-working days from leave-day
-- counting. Per-company so each tenant can reflect its own observed calendar.
-- Seeding is done per-company via the API import action (companies don't exist
-- at migration time), not here.

create table public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  holiday_date date not null,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, holiday_date)
);

create index company_holidays_company_date_idx
  on public.company_holidays (company_id, holiday_date);

create trigger company_holidays_set_updated_at
before update on public.company_holidays
for each row execute function public.set_updated_at();

revoke all on table public.company_holidays from anon;
grant select, insert, update, delete on table public.company_holidays to authenticated;

alter table public.company_holidays enable row level security;

-- Any active company member may read the holiday calendar (needed to compute
-- leave-day counts); only admins may change it.
create policy "company_holidays_select_member"
on public.company_holidays for select to authenticated
using (public.is_active_company_member(company_id));

create policy "company_holidays_write_admin"
on public.company_holidays for all to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

comment on table public.company_holidays is
  'Per-company public/observed holidays excluded from leave working-day counts.';
