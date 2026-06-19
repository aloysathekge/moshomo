# Enterprise Web UX Pass

## Completed

- Rebuilt the app shell around a fixed desktop sidebar and accessible mobile drawer.
- Added labeled grouped navigation for every role-visible module and clear coming-soon states.
- Added a sticky contextual top bar with workspace search, notifications, and account identity.
- Reworked admin, manager, and employee dashboards for denser operational hierarchy and clearer actions.
- Replaced pre-company workspace navigation with a focused three-step company setup canvas.
- Added employee status/department filters, result counts, and keyboard-safe modal behavior.
- Improved auth, invitation, and assistant accessibility and form semantics.
- Refined global tokens, radii, shadows, focus rings, controls, and application chrome.

## Verification

- `pnpm --filter @moshomo/web lint`
- `pnpm --filter @moshomo/web typecheck`
- `pnpm --filter @moshomo/web build`
- Browser QA at desktop and compact viewport: no horizontal overflow and no console warnings on landing/auth.

## Remaining QA

- Authenticated role dashboards should receive a final visual pass in a signed-in browser session.
- Search and notification controls are presentation affordances until their product behavior is implemented.
