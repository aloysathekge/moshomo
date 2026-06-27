from __future__ import annotations

from datetime import date
from typing import Any

from moshomo_api.routers.leave import policy_entitlement


def _p(**kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "policy_type": "untracked",
        "entitlement_days": 0,
        "accrual_rate": 0,
        "accrual_period": "monthly",
        "cycle_months": 12,
        "service_tiers": [],
    }
    base.update(kw)
    return base


def test_accrual_accrues_monthly() -> None:
    pol = _p(policy_type="accrual", entitlement_days=15, accrual_rate=1.25, cycle_months=12)
    start = date(2026, 1, 1)
    assert policy_entitlement(pol, start, date(2026, 5, 1)) == 5.0  # 4 months x 1.25
    assert policy_entitlement(pol, None, date(2026, 5, 1)) == 15.0  # no start -> full


def test_accrual_caps_at_entitlement() -> None:
    fast = _p(policy_type="accrual", entitlement_days=15, accrual_rate=2.0, cycle_months=12)
    # 10 months x 2.0 = 20, capped at 15
    assert policy_entitlement(fast, date(2026, 1, 1), date(2026, 11, 1)) == 15.0


def test_accrual_resets_each_cycle() -> None:
    pol = _p(policy_type="accrual", entitlement_days=15, accrual_rate=1.25, cycle_months=12)
    start = date(2025, 1, 1)
    # 13 months in => 1 month into the 2nd cycle => 1.25
    assert policy_entitlement(pol, start, date(2026, 2, 1)) == 1.25


def test_cycle_fixed_and_per_event() -> None:
    assert policy_entitlement(_p(policy_type="cycle", entitlement_days=30, cycle_months=36), date(2020, 1, 1), date(2026, 1, 1)) == 30.0
    assert policy_entitlement(_p(policy_type="annual_fixed", entitlement_days=3), date(2020, 1, 1), date(2026, 1, 1)) == 3.0
    assert policy_entitlement(_p(policy_type="per_event", entitlement_days=10), None, date(2026, 1, 1)) == 10.0


def test_service_tiered() -> None:
    pol = _p(policy_type="service_tiered", entitlement_days=0, service_tiers=[{"years": 5, "days": 1}, {"years": 10, "days": 3}])
    assert policy_entitlement(pol, date(2019, 1, 1), date(2026, 1, 1)) == 1.0  # 7 years -> 5y tier
    assert policy_entitlement(pol, date(2014, 1, 1), date(2026, 1, 1)) == 3.0  # 12 years -> 10y tier
    assert policy_entitlement(pol, date(2024, 1, 1), date(2026, 1, 1)) == 0.0  # 2 years -> none


def test_untracked_is_zero() -> None:
    assert policy_entitlement(_p(policy_type="untracked", entitlement_days=99), None, date(2026, 1, 1)) == 0.0
