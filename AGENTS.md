# Moshomo

AI-native workforce operating system for employee management, leave management, smart shifts, and Pori-powered workforce assistance.

- Stack: Turborepo, Next.js, Expo React Native, FastAPI, Supabase Postgres/Auth/Storage, Pori AI layer
- Safe verification: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @moshomo/web build`, and `uv run --project apps/api python -m compileall apps/api/src`.
- Source of truth: PRD.txt is the current product source of truth. Source code becomes source of truth once implemented. Supabase schema, auth, storage policies, and Pori integration docs must be documented before behavior depends on them.
- Never touch: secrets, credentials, generated dependency folders, deployment config, or production-impacting settings without approval.
- Current active work: initial monorepo scaffold.

## Project Shape

- `apps/web`: Next.js admin and manager app.
- `apps/mobile`: Expo employee app.
- `apps/api`: FastAPI backend and Pori workforce adapter.
- `packages/shared`: shared workforce domain constants and types.
- `docs/architecture`: architecture notes.
- `supabase`: future migrations, policies, seed data, and storage notes.

## Aloy Agent Layer

Use .agent/agent.json for repo-local Aloy setup. Keep this file concise and put deeper workflows in .agent.

Before repo work, read:

- IMPLEMENTATION_PLAN.md
- .agent/rules/repo-safety.md
- .agent/rules/source-of-truth.md
- .agent/rules/verification.md
- .agent/rules/product-boundaries.md
- .agent/rules/monorepo-architecture.md
- .agent/rules/pori-integration.md
- .agent/rules/progress-tracking.md
- .agent/skills/moshomo-workflow/SKILL.md

Useful local commands:

- .agent/commands/explore.md
- .agent/commands/scaffold-plan.md
- .agent/commands/verify.md
