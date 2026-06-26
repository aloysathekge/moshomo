"""Server-authoritative app catalog.

The web registry (apps/web/src/lib/apps.ts) owns nav structure (icon, section,
roles); this owns what is *sellable*, its price, and its default entitlement —
the things a client must not be trusted to assert. Joined by ``key``.

Prices are PEPM (per active employee per month) in ZAR and are deliberately data:
they are starting points, not validated, and will move with real customers.
"""

from __future__ import annotations

from typing import Any

CURRENCY = "ZAR"
UNIT = "per_employee_month"


def _app(
    key: str,
    name: str,
    description: str,
    *,
    sellable: bool,
    price_cents: int = 0,
    default_enabled: bool = True,
) -> dict[str, Any]:
    return {
        "key": key,
        "name": name,
        "description": description,
        "sellable": sellable,
        "price_cents": price_cents,
        "currency": CURRENCY,
        "unit": UNIT,
        "default_enabled": default_enabled,
    }


APP_CATALOG: list[dict[str, Any]] = [
    # Core — always on, not billed.
    _app("dashboard", "Dashboard", "Workspace overview.", sellable=False),
    _app("employees", "Employees", "Employee records and management.", sellable=False),
    _app("departments", "Departments", "Organize teams into departments.", sellable=False),
    _app("settings", "Settings", "Company settings and branding.", sellable=False),
    # Sellable apps — à la carte, gated by entitlement.
    _app(
        "leave",
        "Leave",
        "Time-off requests, approvals, balances, and a team calendar.",
        sellable=True,
        price_cents=1500,
    ),
    _app(
        "shifts",
        "Smart Shifts",
        "Shift templates, scheduling, open shifts, and availability.",
        sellable=True,
        price_cents=2500,
    ),
    _app(
        "assistant",
        "Moshomo AI",
        "AI workforce assistant grounded in your company data.",
        sellable=True,
        price_cents=3000,
    ),
]

_BY_KEY: dict[str, dict[str, Any]] = {app["key"]: app for app in APP_CATALOG}
SELLABLE_KEYS: frozenset[str] = frozenset(app["key"] for app in APP_CATALOG if app["sellable"])


def get_app(key: str) -> dict[str, Any] | None:
    return _BY_KEY.get(key)


def is_sellable(key: str) -> bool:
    return key in SELLABLE_KEYS


def default_enabled(key: str) -> bool:
    app = _BY_KEY.get(key)
    # Unknown or core apps are always entitled.
    return True if app is None else bool(app["default_enabled"])
