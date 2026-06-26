# App Entitlements & À-la-carte Pricing

Status: **Phase 1 in progress** (2026-06-26).

## Goal
Organizations subscribe to the Moshomo apps they need (à la carte) and pay only
for those. App access is gated by **entitlement** (what the org has), enforced in
both the **UI and the API**. Pricing is **per active employee per month (PEPM)** in
ZAR, stored as data so it is tunable without a deploy. Real payment processing is
deferred — for now, entitlement = access.

## Principle
The app registry (`apps/web/src/lib/apps.ts`) is the **catalog**; a per-company
**entitlement layer** (`company_apps`) decides which apps an org has. The API is the
**source of truth** for entitlement and price (clients cannot be trusted with either).

## Catalog
Server-authoritative `APP_CATALOG` (`apps/api/src/moshomo_api/catalog.py`):
`{ key, name, description, sellable, price_cents, currency: "ZAR", unit: "per_employee_month", default_enabled }`

- **Sellable** (gateable, priced): `leave` (R15), `shifts` (R25), `assistant` (R30) pp/m.
- **Core** (always on, R0): `employees`, `departments`, `dashboard`, `settings`.
- Prices are starting points, NOT validated — treat as data; revisit with first customers.

## Data model — `company_apps`
`(id, company_id, app_key, enabled bool default true, granted_by, created_at, updated_at, unique(company_id, app_key))`
- RLS: members **read** their company rows; **admin write**.
- **Effective entitlement**: row if present, else the catalog's `default_enabled`.
  - Existing apps ship `default_enabled = true` → existing companies keep everything (backwards-compatible).
  - Future sellable apps ship `default_enabled = false` → must be subscribed.
- Disabling retains data; re-subscribing restores access.

## API
- `GET /companies/{id}/apps` → effective enabled state per sellable app (powers nav gating).
- `GET /companies/{id}/plan` (Phase 2) → catalog + entitled state + active-employee count + computed monthly total.
- `PATCH /companies/{id}/apps/{key}` `{enabled}` → admin subscribe/unsubscribe.
- **Enforcement**: `require_app_enabled("leave")` dependency on the Leave / Shifts /
  Assistant routers → **403** when not entitled. Degrades gracefully (allows) when the
  `company_apps` table is not yet applied.
- **Bill math** (Phase 2): `active = count(employees status='active')`;
  `total = Σ(price_cents × active)` over entitled sellable apps.

## Web
- `app/page.tsx` fetches entitled keys → filters sidebar nav + section routing.
- Direct nav to an unsubscribed sellable app → **locked/upsell screen** (admin sees
  "Add this app — R…/employee/mo"; others see "ask your admin").
- Phase 2: admin **"Apps & plan"** page — catalog cards with PEPM price, subscribe
  toggle, billable employee count, live monthly total.

## Resolved decisions
1. **Provisioning**: admins self-subscribe in-product (records entitlement; charging deferred).
2. **Unsubscribed apps in nav**: hidden; surfaced on the plan page (Phase 2).
3. **Default for existing companies**: all current apps entitled (safe).
4. **Free tier / trial**: none yet.

## Rollout
- **Phase 1 (now)**: `company_apps` migration + catalog + `GET /apps` + `PATCH /apps/{key}`
  + `require_app_enabled` on routers + web nav filtering + locked screen. Default-on for existing orgs.
- **Phase 2**: `GET /plan` with totals + admin "Apps & plan" page (subscribe + live total).
- **Phase 3**: real billing — payment provider, checkout on subscribe, invoices, proration, price snapshots.

## Notes / future
- The entitlement dependency adds one Supabase read per gated request; cache in the
  actor context or with a short TTL if it becomes hot.
- Move `APP_CATALOG` to a DB table later for no-deploy price edits.
