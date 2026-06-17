# Premium Web UI/UX Refresh

## Goal

Make the web app feel premium for users before moving on to stripping/copying Pori
into a native Moshomo AI layer. User chose the **"refined emerald"** direction (evolve
the existing identity) over dark-luxe and clean-minimal, scoped to the **whole web app**.
Mobile (Expo) is intentionally unchanged this pass.

## Completed

- **Design system** (`apps/web/src/app/globals.css`, rewritten):
  - Network-free premium typography via a system variable-font stack
    (Segoe UI Variable / SF Pro / system-ui) — no `next/font` Google fetch, honoring the
    repo's no-font-network constraint. Added font smoothing + heading letter-spacing.
  - Unified tokens through Tailwind v4 `@theme`: `canvas`, `surface`/`surface-muted`,
    `ink`/`ink-soft`/`ink-muted`/`ink-faint`, and `brand-50..900`.
  - Layered shadow scale, radii scale, hairline `--line` variables, ambient page backdrop.
  - Refined `premium-card`, `hero-panel`, `hero-pill`, `input` (incl. styled `select`),
    and `primary`/`secondary`/`dark` buttons (gradient + hover lift).
  - New utilities: `surface-card`, `nav-link`/`nav-link-active`, `metric-card`, `badge`,
    `chip`, `empty-state`, `notice`, plus `rise`/`fade` keyframes (reduced-motion aware).
- **Root layout** (`layout.tsx`): premium font/base classes, richer `metadata` + `viewport`.
- **Landing** (`page.tsx`): full redesign — emerald hero, gradient headline, live-preview
  hero panel, feature grid with icons, footer. Consistent palette with the app.
- **Auth** (`auth/page.tsx`): reformatted (was minified one-liner) into a premium split —
  gradient brand panel with highlights + a refined form card. Logic unchanged.
- **Invitation accept** (`invitations/accept/page.tsx`) and **auth callback**
  (`auth/callback/page.tsx`): restyled to the system.
- **App shell** (`components/app-shell.tsx`): gradient sidebar, `nav-link` active/hover,
  refined AI card, sticky blurred header, premium mobile chip nav, logo ring.
- **Dashboards + onboarding** (`app/app/page.tsx`): upgraded shared primitives
  (MetricCard → `metric-card` with accent bar + tabular numerals, EmptyState, Notice,
  ActivityRow, SectionTitle), branded loading screen, refined logo panel + assistant card,
  `animate-rise` entrance on all dashboard/onboarding roots. All behavior unchanged.

## Verification

- `pnpm --filter @moshomo/web typecheck` — clean
- `pnpm --filter @moshomo/web lint` — clean
- `pnpm --filter @moshomo/web build` — succeeds; all 6 routes prerender static.

## Notes / Constraints honored

- `apps/web/AGENTS.md`: this is a modified Next.js 16.2.9 — consulted the bundled docs
  (`.../next/dist/docs/`) for fonts + CSS before editing. Tailwind v4 via
  `@import "tailwindcss"` + `@theme`; global CSS imported in the root layout.
- No new dependencies. No backend, API, schema, or auth changes. Mobile untouched.
- Visual-only refactor: all data loading, Supabase calls, and form handlers preserved.

## Not Done / Follow-ups

- Mobile (Expo) still uses the old styling and placeholder dashboards.
- Active sidebar item is still index-based (cosmetic); route/hash-aware active state is a
  future nicety.
- Next planned work: strip/copy Pori into native `moshomo_ai`.
