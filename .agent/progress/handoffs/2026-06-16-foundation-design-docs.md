# Foundation Design Docs

## Summary

Added the foundation design docs needed before the first implementation slice.

## What Changed

- Added `docs/architecture/supabase-foundation.md`.
- Added `docs/architecture/moshomo-ai-design.md`.
- Updated `IMPLEMENTATION_PLAN.md` to reference the new foundation docs.
- Updated `AGENTS.md` and `.agent/rules/source-of-truth.md` so agents read the new docs.
- Updated `.agent/progress/current.md`.

## Key Decisions

- Supabase foundation is company-first and RLS-first.
- Moshomo AI starts inside `apps/api/src/moshomo_ai/`.
- Moshomo AI should begin with read-only tools and auditable assistant runs.
- Pori remains source material, not a runtime dependency.

## Next Step

Implement the first vertical slice: Supabase auth/company schema, employee profile model, and native Moshomo AI read-only workforce tools.
