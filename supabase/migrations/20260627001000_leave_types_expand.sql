-- Expand the supported leave types to the common SA statutory set:
-- adds maternity, parental, study, and long_service alongside the originals.
-- (Admin-defined custom types are a later, data-driven step.)

alter table public.leave_requests
  drop constraint if exists leave_requests_leave_type_check;
alter table public.leave_requests
  add constraint leave_requests_leave_type_check
  check (leave_type in (
    'annual', 'sick', 'family_responsibility', 'maternity',
    'parental', 'study', 'long_service', 'unpaid'
  ));

alter table public.leave_allowances
  drop constraint if exists leave_allowances_leave_type_check;
alter table public.leave_allowances
  add constraint leave_allowances_leave_type_check
  check (leave_type in (
    'annual', 'sick', 'family_responsibility', 'maternity',
    'parental', 'study', 'long_service', 'unpaid'
  ));
