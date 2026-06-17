# Premium Dashboards And Company Branding

## Completed

- Rebuilt the web application shell with responsive role-aware sidebar navigation.
- Added distinct admin, manager, and employee dashboards.
- Added company logo controls during admin setup and in company settings.
- Added `PATCH /companies/{company_id}/branding` with admin authorization and tests.
- Added migration `20260617000300_company_branding.sql` with `companies.logo_path`, a public `company-assets` bucket, member reads, and admin-only writes.
- Documented the public branding storage contract.

## Verification

- `pnpm lint`
- `pnpm typecheck`
- `pnpm --filter @moshomo/web build`
- `uv run --project apps/api pytest apps/api/tests -q` (13 passed)
- `uv run --project apps/api python -m compileall apps/api/src`
- `pnpm exec supabase db push --dry-run` (would apply only migration `20260617000300_company_branding.sql`)

## Pending Approval

- Apply migration `20260617000300_company_branding.sql` to the linked Supabase project.
- Run linked database lint and integration-test logo upload after migration.

## Notes

- Logo assets are public branding, not sensitive employee documents.
- Supported formats are PNG, JPEG, and WebP up to 5 MB.
- The database stores object paths; clients derive public Supabase Storage URLs.
