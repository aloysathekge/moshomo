from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.main import app
from moshomo_api.supabase import get_supabase_rest_client


class FakeRestClient:
    def __init__(self, company_id: UUID) -> None:
        self.company_id = company_id
        self.template_id = uuid4()
        self.assignment_id = uuid4()
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.inserted: list[tuple[str, dict[str, Any]]] = []
        self.updated: list[tuple[str, dict[str, Any]]] = []
        self.deleted: list[tuple[str, dict[str, Any]]] = []

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _full_template(self, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        row = {
            "id": str(self.template_id),
            "company_id": str(self.company_id),
            "name": "Morning",
            "start_time": "09:00:00",
            "end_time": "17:00:00",
            "color": None,
            "created_at": self._now(),
            "updated_at": self._now(),
        }
        if overrides:
            row.update(overrides)
        return row

    def _full_assignment(self, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        row = {
            "id": str(self.assignment_id),
            "company_id": str(self.company_id),
            "template_id": str(self.template_id),
            "employee_id": None,
            "shift_date": "2026-07-01",
            "start_time": "09:00:00",
            "end_time": "17:00:00",
            "status": "scheduled",
            "notes": None,
            "created_at": self._now(),
            "updated_at": self._now(),
            "employee": None,
            "template": {"name": "Morning"},
        }
        if overrides:
            row.update(overrides)
        return row

    async def select(self, table: str, *, access_token: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        self.calls.append(("select", table, params))
        sel = str(params.get("select", ""))
        if table == "shift_templates":
            if "name" in sel:  # list templates
                return [self._full_template()]
            return [{"id": str(self.template_id), "start_time": "09:00:00", "end_time": "17:00:00"}]
        if table == "shift_assignments":
            return [self._full_assignment()]
        if table == "employee_availability":
            return [{"id": str(uuid4()), "employee_id": str(uuid4()), "weekday": 1, "start_time": "09:00:00", "end_time": "17:00:00"}]
        raise AssertionError(f"Unexpected select table: {table}")

    async def insert(self, table: str, *, access_token: str, values: dict[str, Any]) -> dict[str, Any]:
        self.inserted.append((table, values))
        return {"id": str(uuid4()), "created_at": self._now(), "updated_at": self._now(), **values}

    async def update(self, table: str, *, access_token: str, filters: dict[str, Any], values: dict[str, Any]) -> list[dict[str, Any]]:
        self.updated.append((table, {**filters, **values}))
        if table == "shift_assignments":
            return [self._full_assignment(values)]
        return [self._full_template(values)]

    async def delete(self, table: str, *, access_token: str, filters: dict[str, Any]) -> None:
        self.deleted.append((table, filters))


def _actor(company_id: UUID, *, role: str = "manager", employee_id: UUID | None = None) -> ActorContext:
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


def test_manager_creates_template() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda c: c.post("/workforce/shifts/templates", json={"name": "Morning", "start_time": "09:00", "end_time": "17:00"}),
    )
    assert response.status_code == 201
    assert rest.inserted[0][0] == "shift_templates"


def test_employee_cannot_create_template() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="employee"),
        rest,
        lambda c: c.post("/workforce/shifts/templates", json={"name": "X", "start_time": "09:00", "end_time": "17:00"}),
    )
    assert response.status_code == 403
    assert not rest.inserted


def test_create_assignment_defaults_times_from_template() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda c: c.post("/workforce/shifts/assignments", json={"template_id": str(rest.template_id), "shift_date": "2026-07-01"}),
    )
    assert response.status_code == 201
    values = rest.inserted[0][1]
    assert values["start_time"] == "09:00:00"
    assert values["end_time"] == "17:00:00"
    assert values["employee_id"] is None  # open shift


def test_create_assigned_shift() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda c: c.post("/workforce/shifts/assignments", json={"template_id": str(rest.template_id), "shift_date": "2026-07-01", "employee_id": str(employee_id)}),
    )
    assert response.status_code == 201
    assert rest.inserted[0][1]["employee_id"] == str(employee_id)


def test_employee_cannot_create_assignment() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="employee"),
        rest,
        lambda c: c.post("/workforce/shifts/assignments", json={"template_id": str(rest.template_id), "shift_date": "2026-07-01"}),
    )
    assert response.status_code == 403


def test_mine_and_open_filters() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id)
    _run(_actor(company_id, employee_id=employee_id), rest, lambda c: c.get("/workforce/shifts/assignments?mine=true"))
    mine_call = next(c for c in rest.calls if c[1] == "shift_assignments")
    assert mine_call[2]["employee_id"] == f"eq.{employee_id}"

    rest2 = FakeRestClient(company_id)
    _run(_actor(company_id), rest2, lambda c: c.get("/workforce/shifts/assignments?open=true"))
    open_call = next(c for c in rest2.calls if c[1] == "shift_assignments")
    assert open_call[2]["employee_id"] == "is.null"


def test_assign_open_shift() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda c: c.patch(f"/workforce/shifts/assignments/{rest.assignment_id}", json={"employee_id": str(employee_id)}),
    )
    assert response.status_code == 200
    assert rest.updated[0][1]["employee_id"] == str(employee_id)


def test_delete_assignment() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda c: c.delete(f"/workforce/shifts/assignments/{rest.assignment_id}"),
    )
    assert response.status_code == 204
    assert rest.deleted[0][0] == "shift_assignments"


def test_employee_sets_own_availability() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="employee", employee_id=employee_id),
        rest,
        lambda c: c.put(
            f"/workforce/shifts/availability/{employee_id}",
            json={"windows": [{"weekday": 1, "start_time": "09:00", "end_time": "17:00"}]},
        ),
    )
    assert response.status_code == 200
    assert rest.deleted[0][0] == "employee_availability"
    assert rest.inserted[0][0] == "employee_availability"
    assert rest.inserted[0][1]["weekday"] == 1


def test_employee_cannot_set_others_availability() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="employee"),
        rest,
        lambda c: c.put(
            f"/workforce/shifts/availability/{uuid4()}",
            json={"windows": [{"weekday": 1, "start_time": "09:00", "end_time": "17:00"}]},
        ),
    )
    assert response.status_code == 403
    assert not rest.deleted


def test_admin_sets_others_availability() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda c: c.put(
            f"/workforce/shifts/availability/{uuid4()}",
            json={"windows": []},
        ),
    )
    assert response.status_code == 200
    assert rest.deleted[0][0] == "employee_availability"
