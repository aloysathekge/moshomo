# Current State - 2026-06-17

## Active Task

Premium role-aware web dashboards and company branding are implemented locally. The company branding migration is awaiting approval.

## Decisions Made

- AGENTS.md is the canonical repo instruction file.
- .agent/ holds Aloy repo-local rules, commands, skills, and progress memory.
- `PRD.txt` is the current product source of truth.
- Treat `Moshomo/moshomo` as the actual repo. `Moshomo` is currently the parent folder.
- Prepare for a Turborepo-style monorepo unless the user chooses a multi-repo split later.
- Added repo-local rules for product boundaries, monorepo architecture, and Moshomo AI direction.
- Added `.agent/commands/scaffold-plan.md` as the required pre-scaffold command.
- Scaffolded `apps/web`, `apps/mobile`, `apps/api`, `packages/shared`, `docs`, and `supabase`.
- Added `docs/architecture/pori-workforce-adaptation.md` and `docs/architecture/pori-to-moshomo-ai-evaluation.md`.
- Clarified that Pori is source material to copy/strip/rebuild into native Moshomo AI, not a long-term generic dependency.
- Root workspace uses pnpm and Turborepo.
- Next.js web app, Expo mobile app, FastAPI API, and shared TypeScript package are wired.
- Next build avoids Google font fetches so local builds are not blocked by font network calls.
- Added `IMPLEMENTATION_PLAN.md` as the build roadmap.
- Added `docs/architecture/supabase-foundation.md` for company/auth/schema/RLS direction.
- Added `docs/architecture/moshomo-ai-design.md` for native Moshomo AI first slice.
- Added `supabase/migrations/20260617000100_foundation.sql` with company-first workforce tables, AI memory/audit tables, Auth profile synchronization, helper functions, grants, and RLS.
- A company is the Moshomo workspace and tenant boundary.
- Manager employee visibility initially uses direct-report relationships through `manager_employee_id`.
- Company creation and first-admin bootstrap remain trusted backend operations.
- `salary_rate` is deferred until sensitive-field authorization and auditing are designed.
- Supabase CLI 2.106.0 is installed as a root development dependency.
- The repository is linked to the `moshomoai` Supabase project, and the foundation migration dry-run succeeds.
- Migration `20260617000100` is applied remotely; local and remote migration history match.
- Linked Supabase database lint reports no schema errors.
- FastAPI verifies Supabase ES256 tokens against public JWKS.
- Workforce requests resolve immutable actor context from `Authorization` and `X-Company-ID`.
- Added RLS-backed `GET /workforce/employees` and `GET /workforce/employees/{employee_id}` endpoints.
- The placeholder assistant route now requires the same authenticated actor context.
- Web and mobile are both role-aware clients for admins, managers, and employees; platform is not an authorization boundary.
- Mobile onboarding now mirrors web onboarding: account entry, company creation, department setup, and employee invitations use the same steps, fields, role choices, department choices, and API contracts.
- Company setup can be skipped on web and mobile. The device remembers the choice and shows a workspace summary with a reversible `Continue company setup` action; no database completion flag exists yet.
- Invited users now remain on a web success screen after accepting: it confirms their company access, explains same-account mobile sign-in, prompts for the mobile app, and offers `Continue on web`. Store buttons are driven by optional public iOS and Android URL environment variables; no store releases are configured yet.
- Web and mobile now branch workspace rendering from the active `company_memberships.role`: admins receive company setup/admin workspace, managers receive team operations, and employees receive self-service. Client role branching controls presentation only; API permission checks and RLS remain authoritative.
- Added transactional company bootstrap, department creation, employee invitation, resend, and invitation acceptance APIs.
- Admin and manager permissions compose on top of a linked employee identity.
- Migration `20260617000200_company_onboarding.sql` is applied remotely.
- Admin, manager, and employee web workspaces now use a responsive premium sidebar with role-specific navigation and dashboard content.
- Company admins can provide a PNG, JPEG, or WebP logo during setup or from dashboard settings.
- Company branding uses public `company-assets` objects at `<company_id>/<filename>`; members may read branding and only admins may write it.
- `PATCH /companies/{company_id}/branding` validates company ownership and persists `companies.logo_path`.
- Migration `20260617000300_company_branding.sql` passes remote dry-run but is not applied.

## Important Discoveries

- The repository is on `main` and tracks `origin/main`.
- Remote is `git@github.com:aloysathekge/moshomo.git`.
- Product stack from PRD: Next.js, Expo React Native, FastAPI, Supabase, and a Pori-inspired Moshomo AI layer.
- V1 excludes payroll, attendance, clock-in/out, GPS tracking, recruitment, performance management, and benefits.
- Aloy adapters exist for Cursor, Claude, Windsurf, and Trae.

## Blockers

- Docker is unavailable for a local Supabase reset.
- Private employee-document/company-knowledge Storage policies and Moshomo AI tool contracts are not implemented yet.
- Company logo upload remains unavailable until migration `20260617000300_company_branding.sql` is approved and applied.
- Real Supabase invitation email delivery is not integration-tested; it requires backend-only secret-key and redirect configuration.
- Pori is not connected yet; `apps/api/src/moshomo_api/pori_adapter.py` is only a temporary placeholder.
- Native `moshomo_ai` has not been created yet.

## Next Session Should Start With

After explicit approval, apply `20260617000300_company_branding.sql`, run linked database lint, and integration-test admin logo upload from the web dashboard.
