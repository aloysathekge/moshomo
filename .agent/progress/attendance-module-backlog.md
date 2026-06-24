# Backlog — Time & Attendance module (Post-V1)

Status: **planned, not built.** Out of scope for V1 (see `IMPLEMENTATION_PLAN.md` → Phase 7).
Captured 2026-06-19 so the design and the real constraints are not re-derived later.

## Idea

Employees **tag in/out at the workplace entrance through the Moshomo mobile app** for
clock In, Lunch, and Out. Built as a fully-modular app on the employee spine, following the
Smart Shifts pattern (`modules/attendance/` on API + web; tag-in screen in `apps/mobile`).

## Tag-in surface

- A single physical **NFC + QR combo tag** per entrance, both encoding the same clock-point
  payload. NFC for tap-friendly phones, QR as the universal fallback.
- Read by the **native mobile app** (not a browser) → iOS NFC works via Core NFC. This is what
  removes the Web-NFC limitation (Web NFC is Android-Chrome only; native apps are not).
- "Program a tag" = write an employee/clock-point credential to an NFC card (or read its UID);
  store only a **hash** server-side.

## Presence verification — three independent factors

A tag proves *which door*, not *that you are there*, so presence is proven separately:

1. **Geofence (GPS)** — within range of the clock point. Spoofable alone; a supporting signal.
2. **Company Wi-Fi** — match the access point **BSSID** (MAC), NOT the SSID name (an SSID is
   trivially cloned by a home hotspot). iOS needs the `com.apple.developer.networking.wifi-info`
   entitlement + location permission to read it.
3. **Selfie** — proves *who*; defeats buddy-punching. Tier 1: store for manager review. Tier 2:
   face-match against an enrolled photo with **liveness detection** (stops a printed photo).

**Tiered enforcement (important):** Wi-Fi BSSID + geofence are the hard gate; the selfie is
captured and *mismatches flagged for review*, not a hard block — otherwise good employees get
locked out over a dark hallway or bad camera and lose trust in the system.

## Data model (sketch)

- `clock_credentials` — `(id, company_id, employee_id, type[nfc|qr|pin], token_hash, label, active)`
- `clock_points` — `(id, company_id, label, geofence_lat, geofence_lng, radius_m, allowed_bssids[])`
- `time_punches` — append-only `(id, company_id, employee_id, punch_type[in|lunch_start|lunch_end|out],
  punched_at, source, clock_point_id, lat, lng, verification jsonb)`
- `work_sessions` — derived: pair `in`→`out`, subtract lunch, compute hours.
- Server-side **state machine**: out → in → lunch_start → lunch_end → out (API enforces
  transitions, RLS enforces row scope — same pattern as Leave/Shifts).
- Mobile: offline queue + sync (entrance connectivity is flaky).

## Integrations (the payoff)

- **Shifts** — actual punch-in vs scheduled shift → late / no-show / early-leave / overtime.
- **Leave** — punch-in while on approved leave is flagged (shared availability check).
- **Payroll (future)** — `work_sessions` become the authoritative hours source.
- **Moshomo AI** — read tools `who_is_clocked_in_now`, `who_is_late_today`, `hours_this_week`.

## Build constraints

- NFC needs a custom Expo **dev/EAS build** (`react-native-nfc-manager` + config plugin), not
  Expo Go. iOS NFC scanning is foreground + user-initiated (Apple's system scan sheet); needs the
  NFC entitlement + a paid Apple Developer account.

## Compliance

- The selfie/face data is **biometric "special personal information" under POPIA**: explicit
  consent at enrolment, defined retention policy, secure storage. Design in from day one.
