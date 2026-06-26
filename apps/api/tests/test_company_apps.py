from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.main import app
from moshomo_api.supabase import get_supabase_rest_client


class FakeRestClient:
    def __init__(self, company_id: UUID, *, entitlements: dict[str, bool] | None = None) -> None:
        self.company_id = company_id
        self.entitlements = entitlements or {}
        self.upserted: list[tuple[str, list[dict[str, Any]], str]] = []

    async def select(self, table: str, *, access_token: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        if table == "company_apps":
            return [{"app_key": k, "enabled": v} for k, v in self.entitlements.items()]
        if table == "leave_requests":
            return []  # list endpoint after the gate passes
        raise AssertionError(f"Unexpected select table: {table}")

    async def upsert(
        self, table: str, *, access_token: str, values: list[dict[str, Any]], on_conflict: str
    ) -> list[dict[str, Any]]:
        self.upserted.append((table, values, on_conflict))
        return [{"id": str(uuid4()), **v} for v in values]


def _actor(company_id: UUID, *, role: str = "admin") -> ActorContext:
    return ActorContext(
        company_id=company_id,
        user_id=uuid4(),
        role=role,  # type: ignore[arg-type]
        employee_id=uuid4(),
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


def test_list_apps_defaults_enabled_with_no_rows() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.get(f"/companies/{company_id}/apps"),
    )
    assert response.status_code == 200
    apps = {a["key"]: a["enabled"] for a in response.json()["apps"]}
    assert apps == {"leave": True, "shifts": True, "assistant": True}


def test_list_apps_reflects_entitlements() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id, entitlements={"shifts": False})
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.get(f"/companies/{company_id}/apps"),
    )
    apps = {a["key"]: a["enabled"] for a in response.json()["apps"]}
    assert apps["shifts"] is False
    assert apps["leave"] is True  # no row -> default enabled


def test_admin_toggles_app() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.patch(f"/companies/{company_id}/apps/shifts", json={"enabled": False}),
    )
    assert response.status_code == 200
    assert rest.upserted[0][0] == "company_apps"
    assert rest.upserted[0][1][0]["app_key"] == "shifts"
    assert rest.upserted[0][1][0]["enabled"] is False
    assert rest.upserted[0][2] == "company_id,app_key"


def test_non_admin_cannot_toggle() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="manager"),
        rest,
        lambda client: client.patch(f"/companies/{company_id}/apps/shifts", json={"enabled": False}),
    )
    assert response.status_code == 403
    assert not rest.upserted


def test_toggle_rejects_core_app() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id)
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.patch(f"/companies/{company_id}/apps/employees", json={"enabled": False}),
    )
    assert response.status_code == 400
    assert not rest.upserted


def test_gated_router_blocks_when_app_disabled() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id, entitlements={"leave": False})
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.get("/workforce/leave/requests"),
    )
    assert response.status_code == 403


def test_gated_router_allows_when_app_enabled() -> None:
    company_id = uuid4()
    rest = FakeRestClient(company_id, entitlements={"leave": True})
    response = _run(
        _actor(company_id, role="admin"),
        rest,
        lambda client: client.get("/workforce/leave/requests"),
    )
    assert response.status_code == 200
