from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.main import app
from moshomo_api.supabase import get_supabase_rest_client


class FakeRestClient:
    def __init__(
        self,
        company_id: UUID,
        *,
        request_employee_id: str | None = None,
        request_manager_id: str | None = None,
        request_status: str = "pending",
    ) -> None:
        self.company_id = company_id
        self.request_id = uuid4()
        self.request_employee_id = request_employee_id or str(uuid4())
        self.request_manager_id = request_manager_id
        self.request_status = request_status
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.inserted: list[tuple[str, dict[str, Any]]] = []
        self.updated: list[tuple[str, dict[str, Any]]] = []
        self.upserted: list[tuple[str, list[dict[str, Any]], str]] = []

    def _full_request(self, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        row = {
            "id": str(self.request_id),
            "company_id": str(self.company_id),
            "employee_id": self.request_employee_id,
            "leave_type": "annual",
            "start_date": "2026-07-01",
            "end_date": "2026-07-05",
            "day_part": "full",
            "days": 5.0,
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
        if table == "leave_requests":
            if sel == "leave_type,days":  # balances: approved usage
                return [{"leave_type": "annual", "days": 3.0}, {"leave_type": "annual", "days": 2.0}]
            if "first_name" in sel:  # list or refreshed full row
                return [self._full_request()]
            # decision pre-check
            return [
                {
                    "id": str(self.request_id),
                    "employee_id": self.request_employee_id,
                    "status": self.request_status,
                    "employee": {"manager_employee_id": self.request_manager_id},
                }
            ]
        if table == "leave_allowances":
            return [{"leave_type": "annual", "allotted_days": 21.0}]
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


def test_employee_creates_full_range_request() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.post(
            "/workforce/leave/requests",
            json={"leave_type": "annual", "start_date": "2026-07-01", "end_date": "2026-07-05"},
        ),
    )
    assert response.status_code == 201
    assert rest.inserted[0][1]["days"] == 5.0
    assert rest.inserted[0][1]["status"] == "pending"


def test_half_day_single_day_request() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.post(
            "/workforce/leave/requests",
            json={
                "leave_type": "annual",
                "start_date": "2026-07-01",
                "end_date": "2026-07-01",
                "day_part": "morning",
            },
        ),
    )
    assert response.status_code == 201
    assert rest.inserted[0][1]["days"] == 0.5


def test_half_day_on_multiday_is_rejected() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.post(
            "/workforce/leave/requests",
            json={
                "leave_type": "annual",
                "start_date": "2026-07-01",
                "end_date": "2026-07-03",
                "day_part": "morning",
            },
        ),
    )
    assert response.status_code == 422
    assert not rest.inserted


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


def test_balances_derive_used_and_remaining() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id, request_employee_id=str(uuid4()))
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.get("/workforce/leave/balances"),
    )
    assert response.status_code == 200
    annual = next(b for b in response.json()["balances"] if b["leave_type"] == "annual")
    assert annual["allotted"] == 21.0
    assert annual["used"] == 5.0
    assert annual["remaining"] == 16.0
