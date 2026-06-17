alter table public.companies
  add column logo_path text
  check (
    logo_path is null
    or logo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'company-assets',
  'company-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "company_assets_select_member"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'company-assets'
    and public.is_active_company_member(
      case
        when name ~ '^[0-9a-f-]{36}/' then split_part(name, '/', 1)::uuid
        else null
      end
    )
  );

create policy "company_assets_insert_admin"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-assets'
    and public.has_company_role(
      case
        when name ~ '^[0-9a-f-]{36}/' then split_part(name, '/', 1)::uuid
        else null
      end,
      array['admin']
    )
  );

create policy "company_assets_update_admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'company-assets'
    and public.has_company_role(
      case
        when name ~ '^[0-9a-f-]{36}/' then split_part(name, '/', 1)::uuid
        else null
      end,
      array['admin']
    )
  )
  with check (
    bucket_id = 'company-assets'
    and public.has_company_role(
      case
        when name ~ '^[0-9a-f-]{36}/' then split_part(name, '/', 1)::uuid
        else null
      end,
      array['admin']
    )
  );

create policy "company_assets_delete_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'company-assets'
    and public.has_company_role(
      case
        when name ~ '^[0-9a-f-]{36}/' then split_part(name, '/', 1)::uuid
        else null
      end,
      array['admin']
    )
  );
