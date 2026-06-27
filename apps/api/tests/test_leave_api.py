from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.main import app
from moshomo_api.supabase import get_supabase_rest_client


def _next_monday() -> date:
    """A deterministic future Monday so past-date and weekday logic is stable
    regardless of the day the suite runs."""
    d = date.today() + timedelta(days=3)
    while d.weekday() != 0:
        d += timedelta(days=1)
    return d


class FakeRestClient:
    def __init__(
        self,
        company_id: UUID,
        *,
        request_employee_id: str | None = None,
        request_manager_id: str | None = None,
        request_status: str = "pending",
        request_leave_type: str = "annual",
        request_days: float = 5.0,
        holidays: list[str] | None = None,
        overlap: bool = False,
        allotted: float | None = None,
        committed_days: float = 0.0,
        approved_committed: list[dict[str, Any]] | None = None,
    ) -> None:
        self.company_id = company_id
        self.request_id = uuid4()
        self.request_employee_id = request_employee_id or str(uuid4())
        self.request_manager_id = request_manager_id
        self.request_status = request_status
        self.request_leave_type = request_leave_type
        self.request_days = request_days
        self.holidays = holidays or []
        self.overlap = overlap
        self.allotted = allotted
        self.committed_days = committed_days
        self.approved_committed = approved_committed
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.inserted: list[tuple[str, dict[str, Any]]] = []
        self.updated: list[tuple[str, dict[str, Any]]] = []
        self.upserted: list[tuple[str, list[dict[str, Any]], str]] = []
        self.deleted: list[tuple[str, dict[str, Any]]] = []

    def _full_request(self, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        row = {
            "id": str(self.request_id),
            "company_id": str(self.company_id),
            "employee_id": self.request_employee_id,
            "leave_type": self.request_leave_type,
            "start_date": "2026-07-01",
            "end_date": "2026-07-05",
            "day_part": "full",
            "days": self.request_days,
            "reason": None,
            "status": self.request_status,
            "decided_by": None,
            "decided_at": None,
            "decision_note": None,
            "created_at": now,
            "updated_at": now,
            "employee": {
                "first_name": "Nandi",
                "last_name": "Mokoena",
                "employee_number": "EMP-002",
                "manager_employee_id": self.request_manager_id,
            },
        }
        if overrides:
            row.update(overrides)
        return row

    async def select(self, table: str, *, access_token: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        self.calls.append(("select", table, params))
        sel = str(params.get("select", ""))
        if table == "company_holidays":
            return [{"id": str(uuid4()), "holiday_date": d, "name": "Holiday"} for d in self.holidays]
        if table == "leave_policies":
            return []
        if table == "leave_allowances":
            if sel == "allotted_days":  # _allotted_for
                return [{"allotted_days": self.allotted}] if self.allotted is not None else []
            return [{"leave_type": "annual", "allotted_days": self.allotted if self.allotted is not None else 21.0}]
        if table == "leave_requests":
            if sel == "id":  # overlap probe
                return [{"id": str(uuid4())}] if self.overlap else []
            if sel == "days":  # _committed_days
                return [{"days": self.committed_days}] if self.committed_days else []
            if sel.startswith("leave_type,days,status"):  # balances committed
                return self.approved_committed if self.approved_committed is not None else [
                    {"leave_type": "annual", "days": 3.0, "status": "approved"},
                    {"leave_type": "annual", "days": 2.0, "status": "approved"},
                ]
            if "first_name" in sel:  # list / refreshed full row
                return [self._full_request()]
            return [  # decision pre-check
                {
                    "id": str(self.request_id),
                    "employee_id": self.request_employee_id,
                    "leave_type": self.request_leave_type,
                    "days": self.request_days,
                    "status": self.request_status,
                    "employee": {"manager_employee_id": self.request_manager_id},
                }
            ]
        raise AssertionError(f"Unexpected select table: {table}")

    async def insert(self, table: str, *, access_token: str, values: dict[str, Any]) -> dict[str, Any]:
        self.inserted.append((table, values))
        now = datetime.now(timezone.utc).isoformat()
        return {
            "id": str(uuid4()),
            "created_at": now,
            "updated_at": now,
            "decided_by": None,
            "decided_at": None,
            "decision_note": None,
            **values,
        }

    async def update(
        self, table: str, *, access_token: str, filters: dict[str, Any], values: dict[str, Any]
    ) -> list[dict[str, Any]]:
        self.updated.append((table, {**filters, **values}))
        return [self._full_request(values)]

    async def upsert(
        self, table: str, *, access_token: str, values: list[dict[str, Any]], on_conflict: str
    ) -> list[dict[str, Any]]:
        self.upserted.append((table, values, on_conflict))
        return [{"id": str(uuid4()), **value} for value in values]

    async def delete(self, table: str, *, access_token: str, filters: dict[str, Any]) -> None:
        self.deleted.append((table, filters))


def _actor(
    company_id: UUID, *, role: str = "employee", employee_id: UUID | None = None
) -> ActorContext:
    return ActorContext(
        company_id=company_id,
        user_id=uuid4(),
        role=role,  # type: ignore[arg-type]
        employee_id=employee_id or uuid4(),
        access_token="test-access-token",
    )


def _run(actor: ActorContext, rest: FakeRestClient, call):
    app.dependency_overrides[get_actor_context] = lambda: actor
    app.dependency_overrides[get_supabase_rest_client] = lambda: rest
    try:
        with TestClient(app) as client:
            return call(client)
    finally:
        app.dependency_overrides.clear()


def _create(rest: FakeRestClient, actor: ActorContext, body: dict[str, Any]):
    return _run(actor, rest, lambda client: client.post("/workforce/leave/requests", json=body))


def test_full_range_counts_working_days_only() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    mon = _next_monday()
    response = _create(
        rest,
        _actor(company_id),
        {"leave_type": "annual", "start_date": mon.isoformat(), "end_date": (mon + timedelta(days=6)).isoformat()},
    )
    assert response.status_code == 201
    # Mon..Sun spans a full week → 5 working days (weekend excluded).
    assert rest.inserted[0][1]["days"] == 5.0
    assert rest.inserted[0][1]["status"] == "pending"


def test_working_days_exclude_holidays() -> None:
    company_id = uuid4()
    mon = _next_monday()
    wednesday = (mon + timedelta(days=2)).isoformat()
    rest = FakeRestClient(company_id, holidays=[wednesday])
    response = _create(
        rest,
        _actor(company_id),
        {"leave_type": "annual", "start_date": mon.isoformat(), "end_date": (mon + timedelta(days=4)).isoformat()},
    )
    assert response.status_code == 201
    # Mon..Fri minus the Wednesday holiday → 4 days.
    assert rest.inserted[0][1]["days"] == 4.0


def test_half_day_single_day_request() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    mon = _next_monday().isoformat()
    response = _create(
        rest,
        _actor(company_id),
        {"leave_type": "annual", "start_date": mon, "end_date": mon, "day_part": "morning"},
    )
    assert response.status_code == 201
    assert rest.inserted[0][1]["days"] == 0.5


def test_half_day_on_multiday_is_rejected() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    mon = _next_monday()
    response = _create(
        rest,
        _actor(company_id),
        {
            "leave_type": "annual",
            "start_date": mon.isoformat(),
            "end_date": (mon + timedelta(days=2)).isoformat(),
            "day_part": "morning",
        },
    )
    assert response.status_code == 422
    assert not rest.inserted


def test_past_start_date_is_rejected() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _create(
        rest,
        _actor(company_id),
        {"leave_type": "annual", "start_date": "2020-01-06", "end_date": "2020-01-10"},
    )
    assert response.status_code == 422
    assert not rest.inserted


def test_overlapping_request_is_rejected() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id, overlap=True)
    mon = _next_monday()
    response = _create(
        rest,
        _actor(company_id),
        {"leave_type": "annual", "start_date": mon.isoformat(), "end_date": (mon + timedelta(days=2)).isoformat()},
    )
    assert response.status_code == 409
    assert not rest.inserted


def test_request_over_balance_is_rejected() -> None:
    company_id = uuid4()
    # Allowance 5, already 4 committed → only 1 available; Mon..Fri requests 5.
    rest = FakeRestClient(company_id, allotted=5.0, committed_days=4.0)
    mon = _next_monday()
    response = _create(
        rest,
        _actor(company_id),
        {"leave_type": "annual", "start_date": mon.isoformat(), "end_date": (mon + timedelta(days=4)).isoformat()},
    )
    assert response.status_code == 422
    assert not rest.inserted


def test_unpaid_leave_skips_balance_check() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id, allotted=0.0, committed_days=99.0)
    mon = _next_monday()
    response = _create(
        rest,
        _actor(company_id),
        {"leave_type": "unpaid", "start_date": mon.isoformat(), "end_date": (mon + timedelta(days=4)).isoformat()},
    )
    assert response.status_code == 201


def test_untracked_type_without_allowance_is_allowed() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id, allotted=None)  # no allowance row → not enforced
    mon = _next_monday()
    response = _create(
        rest,
        _actor(company_id),
        {"leave_type": "annual", "start_date": mon.isoformat(), "end_date": (mon + timedelta(days=4)).isoformat()},
    )
    assert response.status_code == 201


def test_mine_filter_scopes_to_actor() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id)
    _run(
        _actor(company_id, employee_id=employee_id),
        rest,
        lambda client: client.get("/workforce/leave/requests?mine=true"),
    )
    list_call = next(c for c in rest.calls if c[1] == "leave_requests" and "first_name" in str(c[2].get("select", "")))
    assert list_call[2]["employee_id"] == f"eq.{employee_id}"


def test_manager_approves_direct_report() -> None:
    company_id = uuid4()
    manager_eid = uuid4()
    rest = FakeRestClient(company_id, request_manager_id=str(manager_eid))
    response = _run(
        _actor(company_id, role="manager", employee_id=manager_eid),
        rest,
        lambda client: client.patch(
            f"/workforce/leave/requests/{rest.request_id}", json={"action": "approve"}
        ),
    )
    assert response.status_code == 200
    assert rest.updated[0][1]["status"] == "approved"
    assert rest.updated[0][1]["decided_by"]


def test_approval_over_allowance_is_blocked() -> None:
    company_id = uuid4()
    manager_eid = uuid4()
    # Request is 5 days; 18 already approved against a 21 allowance → 18+5 > 21.
    rest = FakeRestClient(
        company_id,
        request_manager_id=str(manager_eid),
        request_days=5.0,
        allotted=21.0,
        committed_days=18.0,
    )
    response = _run(
        _actor(company_id, role="manager", employee_id=manager_eid),
        rest,
        lambda client: client.patch(
            f"/workforce/leave/requests/{rest.request_id}", json={"action": "approve"}
        ),
    )
    assert response.status_code == 409
    assert not rest.updated


def test_non_manager_cannot_approve() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id, request_manager_id=str(uuid4()))
    response = _run(
        _actor(company_id, role="employee"),
        rest,
        lambda client: client.patch(
            f"/workforce/leave/requests/{rest.request_id}", json={"action": "approve"}
        ),
    )
    assert response.status_code == 403
    assert not rest.updated


def test_cannot_decide_non_pending() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id, request_status="approved")
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.patch(
            f"/workforce/leave/requests/{rest.request_id}", json={"action": "reject"}
        ),
    )
    assert response.status_code == 409


def test_owner_cancels_own_request() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id, request_employee_id=str(employee_id))
    response = _run(
        _actor(company_id, employee_id=employee_id),
        rest,
        lambda client: client.patch(
            f"/workforce/leave/requests/{rest.request_id}", json={"action": "cancel"}
        ),
    )
    assert response.status_code == 200
    assert rest.updated[0][1]["status"] == "cancelled"


def test_cannot_cancel_someone_elses_request() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id, request_employee_id=str(uuid4()))
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.patch(
            f"/workforce/leave/requests/{rest.request_id}", json={"action": "cancel"}
        ),
    )
    assert response.status_code == 403


def test_admin_sets_allowances() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.put(
            f"/workforce/leave/allowances/{employee_id}",
            json={"allowances": [{"leave_type": "annual", "allotted_days": 21}]},
        ),
    )
    assert response.status_code == 200
    assert rest.upserted[0][0] == "leave_allowances"
    assert rest.upserted[0][2] == "company_id,employee_id,leave_type"


def test_non_admin_cannot_set_allowances() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="manager"),
        rest,
        lambda client: client.put(
            f"/workforce/leave/allowances/{uuid4()}",
            json={"allowances": [{"leave_type": "annual", "allotted_days": 21}]},
        ),
    )
    assert response.status_code == 403


def test_balances_report_used_pending_and_available() -> None:
    company_id = uuid4()
    rest = FakeRestClient(
        company_id,
        approved_committed=[
            {"leave_type": "annual", "days": 5.0, "status": "approved"},
            {"leave_type": "annual", "days": 2.0, "status": "pending"},
        ],
        allotted=21.0,
    )
    response = _run(
        _actor(company_id, role="admin", employee_id=uuid4()),
        rest,
        lambda client: client.get("/workforce/leave/balances"),
    )
    assert response.status_code == 200
    annual = next(b for b in response.json()["balances"] if b["leave_type"] == "annual")
    assert annual["allotted"] == 21.0
    assert annual["used"] == 5.0
    assert annual["pending"] == 2.0
    assert annual["available"] == 14.0
    assert annual["remaining"] == 14.0


def test_admin_imports_sa_holidays() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.post("/workforce/leave/holidays/import", json={"year": 2026}),
    )
    assert response.status_code == 200
    assert response.json()["imported"] == 12
    assert rest.upserted[0][0] == "company_holidays"
    assert rest.upserted[0][2] == "company_id,holiday_date"


def test_non_admin_cannot_import_holidays() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="manager"),
        rest,
        lambda client: client.post("/workforce/leave/holidays/import", json={"year": 2026}),
    )
    assert response.status_code == 403


def test_unknown_holiday_year_is_404() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.post("/workforce/leave/holidays/import", json={"year": 2099}),
    )
    assert response.status_code == 404


def test_list_leave_policies() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="employee"),
        rest,
        lambda client: client.get("/workforce/leave/policies"),
    )
    assert response.status_code == 200
    assert response.json()["available"] is True


def test_admin_seeds_bcea_policies() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.post("/workforce/leave/policies/seed"),
    )
    assert response.status_code == 200
    assert response.json()["seeded"] == 8
    assert rest.upserted[0][0] == "leave_policies"
    assert rest.upserted[0][2] == "company_id,leave_type"


def test_admin_sets_leave_policies() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.put(
            "/workforce/leave/policies",
            json={"policies": [{"leave_type": "annual", "policy_type": "accrual", "accrual_rate": 1.25, "entitlement_days": 15}]},
        ),
    )
    assert response.status_code == 200
    assert rest.upserted[0][0] == "leave_policies"


def test_non_admin_cannot_set_policies() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="manager"),
        rest,
        lambda client: client.put(
            "/workforce/leave/policies",
            json={"policies": [{"leave_type": "annual", "policy_type": "accrual"}]},
        ),
    )
    assert response.status_code == 403


def test_admin_deletes_holiday() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    holiday_id = uuid4()
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.delete(f"/workforce/leave/holidays/{holiday_id}"),
    )
    assert response.status_code == 204
    assert rest.deleted[0][0] == "company_holidays"
