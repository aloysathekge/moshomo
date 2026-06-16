# Monorepo Architecture

Moshomo is expected to become a Turborepo-style product workspace. It may remain one repo with multiple apps/packages unless the user decides otherwise.

## Expected Shape

- `apps/web` for the Next.js admin and manager experience.
- `apps/mobile` for the Expo React Native employee experience.
- `apps/api` or `services/api` for the FastAPI backend.
- `packages/shared` for shared types, validation schemas, and domain constants.
- `packages/ui` only if web/mobile share enough primitives to justify it.
- `docs` for architecture decisions, Supabase schema notes, API contracts, and Pori integration notes.

## Rules

- The initial scaffold exists; update `docs/architecture/monorepo.md` when the app/package layout changes.
- Keep domain logic portable where practical: employees, leave, shifts, permissions, and schedule rules should not be trapped inside UI components.
- Do not create separate databases or auth systems for web/mobile/backend without an explicit architecture decision.
- Prefer typed contracts between frontend, backend, Supabase, and Pori.
