-- Per-company app entitlements. Which apps an organization has subscribed to.
-- Effective access = this row when present, else the catalog's default (the API
-- decides), so existing companies keep access until a row says otherwise.
-- Access is gated in both the UI and the API (require_app_enabled dependency).

create table public.company_apps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  app_key text not null check (length(trim(app_key)) > 0),
  enabled boolean not null default true,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, app_key)
);

create index company_apps_company_idx
  on public.company_apps (company_id, app_key);

create trigger company_apps_set_updated_at
before update on public.company_apps
for each row execute function public.set_updated_at();

revoke all on table public.company_apps from anon;
grant select, insert, update, delete on table public.company_apps to authenticated;

alter table public.company_apps enable row level security;

-- Members may read which apps their company has; only admins may change them.
create policy "company_apps_select_member"
on public.company_apps for select to authenticated
using (public.is_active_company_member(company_id));

create policy "company_apps_write_admin"
on public.company_apps for all to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

comment on table public.company_apps is
  'Per-company app entitlements (à-la-carte subscriptions). Gates app access in UI + API.';
