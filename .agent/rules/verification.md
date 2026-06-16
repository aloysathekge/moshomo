# Verification

Safe verification:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm --filter @moshomo/web build`
- `uv run --project apps/api python -m compileall apps/api/src`

Rules:

- Run the smallest useful verification first.
- Report commands that are missing or skipped.
- Do not deploy or trigger production jobs without approval.
- If dependencies are missing, report the dependency issue instead of guessing results.
