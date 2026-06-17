# Moshomo Monorepo

Moshomo is managed as one product repo with separate apps and shared packages.

```txt
apps/web      Next.js role-aware workforce app
apps/mobile   Expo role-aware workforce app
apps/api      FastAPI workforce backend and native Moshomo AI layer
packages/shared  Shared workforce domain constants and types
supabase       Future migrations, seed data, policies, and storage notes
```

## Development Commands

- `pnpm dev:web`
- `pnpm dev:mobile`
- `pnpm dev:api`
- `pnpm lint`
- `pnpm typecheck`

## Current Product Source Of Truth

`PRD.txt` remains the product source of truth until implementation docs and code replace specific sections.

Both clients support admins, managers, and employees. Role permissions are consistent across platforms; layout and navigation may adapt to the device.
