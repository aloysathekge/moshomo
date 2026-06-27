-- Leave policies: per-company, per-leave-type accrual/entitlement rules that the
-- (Phase 2) accrual engine consumes. Phase 1 only stores + edits them; balances
-- still derive from leave_allowances until the ledger lands.

create table public.leave_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  leave_type text not null
    check (leave_type in (
      'annual', 'sick', 'family_responsibility', 'maternity',
      'parental', 'study', 'long_service', 'unpaid'
    )),
  policy_type text not null
    check (policy_type in ('accrual', 'cycle', 'annual_fixed', 'per_event', 'service_tiered', 'untracked')),
  entitlement_days numeric(6, 2) not null default 0 check (entitlement_days >= 0),
  accrual_rate numeric(6, 3) not null default 0 check (accrual_rate >= 0),
  accrual_period text not null default 'monthly'
    check (accrual_period in ('monthly', 'weekly', 'biweekly')),
  cycle_months integer not null default 12 check (cycle_months > 0),
  carryover_cap numeric(6, 2) check (carryover_cap is null or carryover_cap >= 0),
  expiry_months integer check (expiry_months is null or expiry_months >= 0),
  probation_months integer not null default 0 check (probation_months >= 0),
  service_tiers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(service_tiers) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, leave_type)
);

create index leave_policies_company_idx on public.leave_policies (company_id);

create trigger leave_policies_set_updated_at
before update on public.leave_policies
for each row execute function public.set_updated_at();

revoke all on table public.leave_policies from anon;
grant select, insert, update, delete on table public.leave_policies to authenticated;

alter table public.leave_policies enable row level security;

-- Members may read their company's policies; only admins may change them.
create policy "leave_policies_select_member"
on public.leave_policies for select to authenticated
using (public.is_active_company_member(company_id));

create policy "leave_policies_write_admin"
on public.leave_policies for all to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

comment on table public.leave_policies is
  'Per-company leave accrual/entitlement rules (BCEA-aware) consumed by the accrual engine.';
