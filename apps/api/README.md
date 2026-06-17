# Moshomo API

FastAPI owns Moshomo workforce workflows, authorization context, Supabase data access, and the native Moshomo AI boundary.

## Configuration

Copy `.env.example` to `.env` and provide the linked project's public values:

```env
MOSHOMO_SUPABASE_URL=https://your-project-ref.supabase.co
MOSHOMO_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
MOSHOMO_SUPABASE_SECRET_KEY=your-backend-only-secret-key
MOSHOMO_SUPABASE_INVITE_REDIRECT_URL=http://localhost:3000/auth/callback
MOSHOMO_SUPABASE_JWT_AUDIENCE=authenticated
```

Do not place a Supabase secret key, service-role key, or database password in web or mobile configuration.

## Authenticated Requests

Workforce endpoints require both:

- `Authorization: Bearer <supabase-access-token>`
- `X-Company-ID: <active-company-uuid>`

The API verifies the token against Supabase JWKS, resolves active company membership through the caller's RLS-scoped token, and constructs an immutable actor context.

Current read-only endpoints:

- `GET /workforce/employees`
- `GET /workforce/employees/{employee_id}`
- `POST /workforce/assistant` (authenticated placeholder)

Current onboarding endpoints:

- `POST /companies`
- `PATCH /companies/{company_id}/branding`
- `POST /companies/{company_id}/departments`
- `POST /companies/{company_id}/invitations`
- `POST /companies/{company_id}/invitations/{invitation_id}/resend`
- `POST /company-invitations/{invitation_id}/accept`

## Verification

```powershell
uv run --project apps/api pytest apps/api/tests -q
uv run --project apps/api python -m compileall apps/api/src
```
