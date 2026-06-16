# Moshomo Monorepo Scaffold

## Summary

Moshomo now has an initial monorepo scaffold with web, mobile, API, shared package, docs, and Supabase placeholders.

## What Changed

- Added root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, and `pnpm-lock.yaml`.
- Scaffolded `apps/web` with Next.js 16.2.9.
- Scaffolded `apps/mobile` with Expo SDK 56.
- Scaffolded `apps/api` with FastAPI, uv, Pydantic settings, Uvicorn, and httpx.
- Added `packages/shared` with Moshomo domain constants and types.
- Added architecture docs for monorepo layout and Pori workforce adaptation.
- Added `apps/api/src/moshomo_api/pori_adapter.py` as the Pori integration boundary.
- Replaced starter screens with minimal Moshomo-specific web/mobile screens.

## Verification

- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm --filter @moshomo/web build` passed.
- `uv run --project apps/api python -m compileall apps/api/src` passed.
- API smoke test passed for `/health` and `/workforce/assistant`.

## Notes

- The API smoke test emitted a Starlette deprecation warning about `httpx`; it does not block the scaffold.
- Pori is not integrated yet. The adapter currently returns a placeholder response.
- Supabase schema, RLS policies, storage, auth flows, and workforce data models are next.

## Next Step

Define the first vertical slice: company auth, employee profile source of truth, and Pori tool contracts for safe workforce answers.
