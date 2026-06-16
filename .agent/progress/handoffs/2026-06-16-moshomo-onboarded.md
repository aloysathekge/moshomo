# Moshomo Onboarded

## Summary

Moshomo was onboarded into Aloy Agent Kit as a new repo at `Moshomo/moshomo`.

## What Changed

- Added `AGENTS.md`.
- Added `.agent/agent.json`.
- Added repo commands: `explore`, `verify`, and `scaffold-plan`.
- Added repo rules for safety, source of truth, verification, progress tracking, product boundaries, monorepo architecture, and Pori integration.
- Added the `moshomo-workflow` skill.
- Added adapters for Cursor, Claude, Windsurf, and Trae.

## Important Context

- `PRD.txt` is the current product source of truth.
- Moshomo V1 is workforce management before payroll.
- Expected stack: Turborepo, Next.js, Expo React Native, FastAPI, Supabase, and Pori.
- The repo currently has no app scaffold and no runnable verification commands.

## Next Step

Use `.agent/commands/scaffold-plan.md` before creating the first monorepo structure.
