-- Employee documents: private storage objects plus auditable metadata.
-- Read access follows employee scope (admin, the employee, or their manager).
-- Only company admins may write document metadata or storage objects.

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  storage_path text not null
    check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'),
  file_name text not null check (length(trim(file_name)) > 0),
  doc_type text not null default 'other'
    check (doc_type in ('contract', 'id', 'certification', 'other')),
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint employee_documents_employee_company_fk
    foreign key (employee_id, company_id)
    references public.employees (id, company_id)
    on delete cascade,
  unique (company_id, storage_path)
);

create index employee_documents_employee_idx
  on public.employee_documents (company_id, employee_id, created_at desc);

revoke all on table public.employee_documents from anon;
grant select, insert, update, delete on table public.employee_documents to authenticated;

alter table public.employee_documents enable row level security;

create policy "employee_documents_select_authorized"
on public.employee_documents for select to authenticated
using (
  public.has_company_role(company_id, array['admin'])
  or employee_id = public.current_employee_id(company_id)
  or (
    public.has_company_role(company_id, array['manager'])
    and exists (
      select 1
      from public.employees employee
      where employee.id = employee_documents.employee_id
        and employee.company_id = employee_documents.company_id
        and employee.manager_employee_id = public.current_employee_id(company_id)
    )
  )
);

create policy "employee_documents_write_admin"
on public.employee_documents for all to authenticated
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

-- Private bucket: documents are never publicly readable; clients use signed URLs.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'employee-documents',
  'employee-documents',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "employee_documents_objects_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'employee-documents'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/'
    and (
      public.has_company_role((split_part(name, '/', 1))::uuid, array['admin'])
      or public.current_employee_id((split_part(name, '/', 1))::uuid)
        = (split_part(name, '/', 2))::uuid
      or exists (
        select 1
        from public.employees employee
        where employee.id = (split_part(name, '/', 2))::uuid
          and employee.company_id = (split_part(name, '/', 1))::uuid
          and employee.manager_employee_id
            = public.current_employee_id((split_part(name, '/', 1))::uuid)
      )
    )
  );

create policy "employee_documents_objects_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-documents'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/'
    and public.has_company_role((split_part(name, '/', 1))::uuid, array['admin'])
  );

create policy "employee_documents_objects_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'employee-documents'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/'
    and public.has_company_role((split_part(name, '/', 1))::uuid, array['admin'])
  )
  with check (
    bucket_id = 'employee-documents'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/'
    and public.has_company_role((split_part(name, '/', 1))::uuid, array['admin'])
  );

create policy "employee_documents_objects_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-documents'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/'
    and public.has_company_role((split_part(name, '/', 1))::uuid, array['admin'])
  );

comment on table public.employee_documents is
  'Private employee document metadata; storage objects live in the employee-documents bucket at <company_id>/<employee_id>/<filename>.';
