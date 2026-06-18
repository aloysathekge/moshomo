# Current State - 2026-06-17

## Active Task

The native Moshomo AI layer (read-only workforce assistant) is implemented: a provider-agnostic LLM layer (Anthropic/OpenAI/Google), a Pori-style tool registry with three RLS-scoped read-only tools, a manual agentic loop, and an auditable `assistant_runs` row per run, exposed at `POST /workforce/assistant`. Default provider/model is `anthropic` / `claude-sonnet-4-6` (config-driven). Earlier: premium web UI/UX + real admin employee management + employee-documents. Two migrations still await approval (`...000300_company_branding`, `...000400_employee_documents`).

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
- Web UI/UX was upgraded to a premium "refined emerald" direction (user-chosen over dark-luxe and clean-minimal), scoped to the whole web app; mobile is unchanged this pass.
- `apps/web/src/app/globals.css` now holds the design system: network-free system variable-font stack (no `next/font` Google fetch), unified emerald + ink + surface tokens via Tailwind v4 `@theme`, layered shadow scale, refined `premium-card`/`hero-panel`/`input`/button classes, and new `nav-link`, `metric-card`, `badge`, `chip`, `empty-state`, `notice`, `surface-card` utilities plus `rise`/`fade` motion.
- Redesigned the landing page, reformatted+elevated `auth` and `invitations/accept`, polished `auth/callback`, elevated `app-shell` (gradient sidebar, sticky blurred header, mobile nav), and elevated all three dashboards + onboarding shared primitives.
- `apps/web/AGENTS.md` warns this is a modified Next.js 16.2.9; consult `node_modules/.pnpm/next@.../next/dist/docs/` before writing Next.js code. Confirmed Tailwind v4 (`@import "tailwindcss"` + `@theme`) and global CSS import in the root layout.
- Web verification passed: `pnpm --filter @moshomo/web typecheck`, `lint`, and `build` (all 6 routes prerender static).
- The `/app` admin experience was restructured from a full-screen onboarding gate into hash-driven sections (home, employees, departments, settings, plus coming-soon for leave/shifts/assistant). The placeholder "Workforce overview" activity feed and the dashboard logo card were removed.
- Sections/apps are driven by a lightweight module registry at `apps/web/src/lib/apps.ts` (`APP_MODULES` with `group` + `status`, plus `navGroupsFor`/`moduleForSection`). Single source of truth for sidebar nav, `/app` section routing, per-role labels/visibility, grouping, and live-vs-coming-soon status. `app-shell.tsx` and `app/page.tsx` derive from it (no hardcoded nav map or section switch). Adding a future app (e.g. time tracking, invoicing) = one registry entry (group "apps") + one vertical slice. No plugin runtime/marketplace yet; per-company enable/disable is the deliberate future step.
- To keep the sidebar clean and non-scrolling, the rail shows only core items (Dashboard, the "Workspace" group, and an "Account" group with Settings/Profile pinned at the bottom). The modular **apps** (group "apps": Leave, Shifts, AI Assistant, + future) are presented as a **tile grid on the dashboard** (`AppsGrid` in `app/page.tsx`, icon + name + live/coming-soon), reached from the home page of each role. The sidebar no longer lists apps or a launcher, and the Moshomo AI promo card was removed.
- SVG icon set extracted to `apps/web/src/components/icon.tsx` (shared by the shell and the dashboard apps grid). Registry helper `appModulesFor(role)` returns the group-"apps" modules.
- In-page nav sets `window.location.hash` directly (anchors with onClick) instead of using `<Link href="/app#...">`, which was appending fragments (`#employees#shifts`). Active nav state + page section both sync via the `hashchange` event.
- Added `suppressHydrationWarning` to `<body>` in `layout.tsx` to silence benign extension-injected attribute mismatches (e.g. ColorZilla `cz-shortcut-listen`).
- "Finish setting up" now only appears (as a Settings checklist + a dashboard banner) when setup is incomplete; completeness = logo set AND >=1 department AND >=1 teammate.
- New admin Employees panel (`apps/web/src/components/employees-panel.tsx`): real list/search, add (invite), profile modal with edit, change role / make manager, remove, and document upload/list/signed-URL view/delete. Managers get a read-only team view; non-admins do not see admin actions. Employee role + account state per row is derived from `company_memberships` + `company_invitations`.
- New API endpoints (`apps/api/src/moshomo_api/routers/employee_management.py`, registered in `main.py`): `PATCH /companies/{cid}/employees/{eid}` (fields), `PATCH .../role` (updates membership + pending invitation; blocks self-demote), `DELETE .../{eid}` (blocks removing self), and document `POST`/`GET`/`DELETE`. Added `SupabaseRestClient.delete` and `context.require_company_admin`. Role-change and remove use existing RLS (no migration).
- New migration `supabase/migrations/20260617000400_employee_documents.sql`: `employee_documents` table + RLS (admin/owner/manager read, admin write) and a PRIVATE `employee-documents` storage bucket (PDF/PNG/JPEG/WebP, 10 MB) with path `<company_id>/<employee_id>/<file>`. NOT applied — approval-gated; documents UI degrades gracefully until it is applied.
- API verification: `uv run --project apps/api python -m compileall apps/api/src` and `pytest apps/api/tests -q` (21 passed, incl. 8 new employee-management tests).
- Native `moshomo_ai` package added under `apps/api/src/moshomo_ai/` (read-only first slice per `docs/architecture/moshomo-ai-design.md`): `llm/` (provider-agnostic `base.py` protocol + `anthropic.py`/`openai.py`/`google.py` clients + `factory.py`; default anthropic/`claude-sonnet-4-6`, switchable via `MOSHOMO_AI_PROVIDER`/`MOSHOMO_AI_MODEL` + that provider's key), `tools/` (Pori-style Pydantic registry + `search_employees`/`get_employee_profile`/`get_company_knowledge`), `agent.py` (manual loop, step-capped), `runs.py` (inserts one `assistant_runs` audit row at completion), `context.py` (RunContext), `prompts/workforce_assistant.md`.
- Safety property: tools read via the **caller's** Supabase token, so RLS (not the tool) decides visibility; registry holds no write tools. Audit is insert-once (assistant_runs has no UPDATE policy).
- `POST /workforce/assistant` now runs the real assistant (replaces the deleted `pori_adapter.py`). Returns `{run_id, status, answer, refusal_reason, citations, provider, model}`. Returns 503 when the configured provider's API key is absent.
- Added deps `anthropic`, `openai`, `google-genai`; config keys `moshomo_ai_provider/model/max_steps/max_tokens/request_timeout_seconds` + `anthropic/openai/google_api_key`.
- API verification after AI layer: `compileall` clean; `pytest apps/api/tests -q` = **27 passed** (incl. 6 new assistant tests with a scripted fake LLM + fake Supabase). Provider modules import/construct; Google tool declarations + all three message converters build. No runtime LLM/network call is made in tests.

## Important Discoveries

- The repository is on `main` and tracks `origin/main`.
- Remote is `git@github.com:aloysathekge/moshomo.git`.
- Product stack from PRD: Next.js, Expo React Native, FastAPI, Supabase, and a Pori-inspired Moshomo AI layer.
- V1 excludes payroll, attendance, clock-in/out, GPS tracking, recruitment, performance management, and benefits.
- Aloy adapters exist for Cursor, Claude, Windsurf, and Trae.

## Blockers

- Docker is unavailable for a local Supabase reset.
- Company-knowledge Storage policies and Moshomo AI tool contracts are not implemented yet.
- Company logo upload remains unavailable until migration `20260617000300_company_branding.sql` is approved and applied.
- Employee documents remain unavailable until migration `20260617000400_employee_documents.sql` is approved and applied (table + private bucket). The web documents UI shows an "available once applied" notice until then.
- Real Supabase invitation email delivery is not integration-tested; it requires backend-only secret-key and redirect configuration.
- Moshomo AI has not been run against a live LLM yet — needs an API key (`MOSHOMO_ANTHROPIC_API_KEY` etc.) + applied Supabase data to integration-test `POST /workforce/assistant`. Cross-provider refusal detection is best-effort (only Anthropic exposes an explicit refusal stop reason).
- Web/mobile "Ask Moshomo" UI is not wired to `POST /workforce/assistant` yet.

## Next Session Should Start With

Integration-test `POST /workforce/assistant` against a live provider: set `MOSHOMO_ANTHROPIC_API_KEY` (+ Supabase keys), ask a workforce question, confirm grounded answer + one `assistant_runs` row; then verify the provider seam by switching `MOSHOMO_AI_PROVIDER`/`MOSHOMO_AI_MODEL` to openai/google with their keys. After that, the next AI increments are guarded write tools (leave/shift drafts behind policy + HITL), streaming/multi-turn conversations, and wiring the web/mobile "Ask Moshomo" UI to the endpoint. Separately, after explicit approval, apply `20260617000300_company_branding.sql` and `20260617000400_employee_documents.sql`, run linked database lint, and integration-test logo + document upload.
