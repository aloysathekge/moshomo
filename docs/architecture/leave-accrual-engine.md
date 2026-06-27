# Leave Accrual / BCEA Engine

Status: **Phase 1 in progress** (2026-06-27).

## Goal
Replace static allowances (`allotted − used`) with a **policy-driven, accruing,
BCEA-aware** leave engine — the compliance baseline both Sage and LeavePro have
(see `docs/competitive/`). Resolved decisions: **ledger-based** balances,
**configurable monthly-fixed accrual**, **lazy catch-up** (no cron), **BCEA-default
policies that admins can override**.

## SA rules to model (why a single number is not enough)
| Type | Behaviour | Rule |
|---|---|---|
| Annual | accrual | ~15 working days / 12-mo cycle, accrued monthly; carry-over cap; use within 6 months of cycle end (forfeit) |
| Sick | cycle | 6-week period per 36-month cycle (30 days for a 5-day week); first 6 months = 1 day / 26 worked |
| Family responsibility | annual_fixed | 3 days / 12-mo cycle, no carry-over |
| Maternity | per_event | 4 consecutive months per pregnancy |
| Parental | per_event | 10 days per event |
| Long service | service_tiered | +N days by tenure (company policy) |
| Study / Unpaid | untracked / policy | configurable |

Policy types: `accrual | cycle | annual_fixed | per_event | service_tiered | untracked`.

## Data model
- **`leave_policies`** (company × leave_type) — the rules: `policy_type`,
  `entitlement_days`, `accrual_rate` + `accrual_period`, `cycle_months`,
  `carryover_cap`, `expiry_months`, `probation_months`, `service_tiers` (jsonb).
  Seeded with BCEA defaults, admin-editable. **(Phase 1.)**
- **`leave_ledger`** (append-only) — `entry_type` (opening|accrual|taken|adjustment|forfeit),
  `days` (+/−), `leave_type`, `effective_date`, `cycle_start`, `note`, `source`.
  **Balance = Σ(ledger) within the active cycle window.** **(Phase 2.)**
  The current `leave_allowances` becomes the opening-balance / manual-entitlement input,
  migrated into the ledger as `opening` entries.

## Balance computation (Phase 2+)
Ledger-based with **lazy accrual**: on read, an idempotent catch-up posts any missing
monthly `accrual` entries from start/cycle-start to today (keyed by period, no double-post).
`available = Σ(ledger in current cycle)`, with expiry/carry-over applied as `forfeit`
entries at cycle boundaries. Approval posts `taken`; cancel/reject reverses it.

## Phasing
- **Phase 1 (now) — policy model only.** `leave_policies` table + RLS; server BCEA
  default constants; API GET/PUT/seed; admin policy editor UI. **No behaviour change** —
  balances still use `leave_allowances`. This is pure substrate.
- **Phase 2 — ledger + annual accrual.** `leave_ledger`; migrate allowances → opening
  entries; lazy monthly accrual + carry-over cap; `GET /balances` reads the ledger.
- **Phase 3 — sick 36-mo cycle + family reset + per-event (maternity/parental) + long-service tiers.**
- **Phase 4 — forfeiting (expiry + caps) + warnings + reporting.**

## BCEA defaults (seeded; admin-overridable; days are starting points)
- annual: accrual, rate 1.25/mo, cycle 12, entitlement 15, carryover_cap 15, expiry 6
- sick: cycle, entitlement 30, cycle 36, probation 6
- family_responsibility: annual_fixed, entitlement 3, cycle 12, carryover_cap 0
- maternity: per_event, entitlement 120
- parental: per_event, entitlement 10
- long_service: service_tiered, tiers e.g. [{years:5,days:1},{years:10,days:3}]
- study: untracked ; unpaid: untracked
