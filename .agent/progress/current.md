# Current State - 2026-06-16

## Active Task

Moshomo foundation design docs are being added before implementation starts.

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

## Important Discoveries

- The repo has no commits yet on `main`; only `PRD.txt` existed before onboarding.
- Remote is `git@github.com:aloysathekge/moshomo.git`.
- Product stack from PRD: Next.js, Expo React Native, FastAPI, Supabase, and a Pori-inspired Moshomo AI layer.
- V1 excludes payroll, attendance, clock-in/out, GPS tracking, recruitment, performance management, and benefits.
- Aloy adapters exist for Cursor, Claude, Windsurf, and Trae.

## Blockers

- Supabase schema, auth policy, storage, and Moshomo AI tool contracts are not implemented yet.
- API has only health and placeholder workforce assistant routes.
- Pori is not connected yet; `apps/api/src/moshomo_api/pori_adapter.py` is only a temporary placeholder.
- Native `moshomo_ai` has not been created yet.

## Next Session Should Start With

Start with `IMPLEMENTATION_PLAN.md`, `docs/architecture/supabase-foundation.md`, and `docs/architecture/moshomo-ai-design.md`, then implement the first vertical slice: Supabase auth boundaries, employee profile model, company memory, and Moshomo AI read-only workforce tools.
