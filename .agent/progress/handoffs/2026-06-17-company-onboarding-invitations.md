# Company Onboarding And Invitations

## Summary

Implemented the local backend workflow for a founder to create a company, create departments, add employee identities, send role-bearing invitations, and let invited users accept their employee identity and membership.

## Domain Rule

Every active company member is an employee. `admin` and `manager` are company-local permission roles layered onto that employee identity.

## Database

Added pending migration `20260617000200_company_onboarding.sql` with:

- `company_invitations`
- `bootstrap_company`
- `create_employee_invitation`
- `accept_company_invitation`
- invitation RLS, grants, constraints, indexes, and lifecycle state

The migration passed PostgreSQL parsing and remote dry-run. It has not been applied.

## API

Added endpoints for:

- company bootstrap
- department creation
- employee creation plus assigned-role invitation
- failed invitation resend
- authenticated invitation acceptance

Company, employee, and membership transitions run in database RPC transactions. Supabase Auth invite delivery uses a backend-only secret key.

## Verification

- API tests: 11 passed.
- Both migrations parse successfully.
- Linked Supabase dry-run lists only the onboarding migration.
- Python compilation passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- uv lock validation passed.

## Remaining

- Apply the pending migration after explicit approval.
- Configure API environment values for the Supabase URL, publishable key, backend-only secret key, and invite redirect URL.
- Integration-test real email delivery and acceptance.
- Build web onboarding screens.
