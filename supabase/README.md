# Moshomo Supabase

Supabase is the source of truth for Moshomo authentication, company-scoped workforce data, row-level security, storage, and Moshomo AI audit records.

## Structure

- `migrations/`: versioned schema, function, trigger, and RLS changes.
- `seed/`: non-production demo data when added.
- `docs/`: Supabase-specific operational notes when needed.

Architecture decisions live in `docs/architecture/supabase-foundation.md`.

## Local Verification

With Docker and the Supabase CLI installed:

```powershell
pnpm supabase start
pnpm supabase db reset
pnpm supabase db lint
```

Run `pnpm supabase stop` when the local stack is no longer needed.

## Remote Application

Linking and applying migrations are explicit operations because they modify a remote database:

```powershell
pnpm supabase link --project-ref <project-ref>
pnpm supabase db push --dry-run
pnpm supabase db push
```

Always inspect the target project and dry-run output before `supabase db push`. Never store the project access token, database password, service-role key, or other credentials in this repository.
