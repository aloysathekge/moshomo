# API Auth And Employee Boundary

## Summary

Implemented Supabase JWT verification, company-scoped actor context, and read-only employee endpoints backed by Supabase RLS.

## What Changed

- Added `moshomo_api/auth.py` for ES256 JWKS token verification and signing-key caching.
- Added `moshomo_api/supabase.py` for publishable-key, caller-token REST access.
- Added `moshomo_api/context.py` for immutable actor/company context.
- Added `routers/employees.py` with employee list, filtering, and profile endpoints.
- Secured the placeholder workforce assistant route with actor context.
- Added API configuration examples and documentation.
- Added PyJWT cryptography support plus pytest development dependencies.
- Added focused auth and workforce API tests.

## Request Contract

Authenticated workforce requests require:

- `Authorization: Bearer <supabase-access-token>`
- `X-Company-ID: <company-uuid>`

The API validates the token, confirms active membership using RLS, resolves the linked employee record, and forwards the caller token for RLS-backed employee queries.

## Verification

- `uv run --project apps/api pytest apps/api/tests -q`: 6 passed.
- `uv run --project apps/api python -m compileall apps/api/src`: passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.

FastAPI emits an upstream Starlette warning about `TestClient` using `httpx`; tests still pass.

## Next Step

Implement a trusted company/bootstrap workflow and create development data. Then connect Supabase Auth in the web app to the employee endpoints.
