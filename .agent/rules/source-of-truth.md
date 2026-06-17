# Source Of Truth

Current source-of-truth notes:

- `PRD.txt` is the current product source of truth.
- `IMPLEMENTATION_PLAN.md` is the current build roadmap.
- Source code becomes source of truth once implementation exists.
- `docs/architecture/monorepo.md` documents the current app/package layout.
- `docs/architecture/supabase-foundation.md` documents the first company/auth/schema/RLS foundation.
- `docs/architecture/moshomo-ai-design.md` documents the native Moshomo AI first slice.
- `docs/architecture/pori-workforce-adaptation.md` documents how Pori should be adapted for workforce operations.
- Supabase schema, auth, storage policies, and Pori tool contracts must be documented before behavior depends on them.

Rules:

- Source code is the source of truth unless this file names an external system.
- If the real truth lives outside the repo, document the safe inspection path before changing behavior.
- Do not assume planned systems exist until code or docs confirm them.
- Do not read or print secret values from env files or credential-bearing config.
