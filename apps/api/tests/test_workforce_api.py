from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from moshomo_api.auth import AuthenticatedUser, get_current_user
from moshomo_api.main import app
from moshomo_api.supabase import get_supabase_rest_client


class FakeSupabaseRestClient:
    def __init__(
        self,
        *,
        company_id: UUID,
        user_id: UUID,
        membership_role: str | None = "manager",
    ) -> None:
        self.company_id = company_id
        self.user_id = user_id
        self.membership_role = membership_role
        self.employee_id = uuid4()
        self.report_id = uuid4()
        self.calls: list[tuple[str, dict[str, str | int]]] = []

    async def select(
        self,
        table: str,
        *,
        access_token: str,
        params: dict[str, str | int],
    ) -> list[dict[str, Any]]:
        assert access_token == "test-access-token"
        self.calls.append((table, params))

        if table == "company_memberships":
            if self.membership_role is None:
                return []
            return [
                {
                    "company_id": str(self.company_id),
                    "user_id": str(self.user_id),
                    "role": self.membership_role,
                    "status": "active",
                }
            ]

        if table == "employees" and params.get("select") == "id":
            return [{"id": str(self.employee_id)}]

        if table == "employees" and "id" in params:
            if params["id"] != f"eq.{self.report_id}":
                return []
            return [self._employee_row(self.report_id)]

        if table == "employees":
            return [self._employee_row(self.report_id)]

        raise AssertionError(f"Unexpected table: {table}")

    def _employee_row(self, employee_id: UUID) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        return {
            "id": str(employee_id),
            "company_id": str(self.company_id),
            "profile_id": None,
            "department_id": None,
            "manager_employee_id": str(self.employee_id),
            "employee_number": "EMP-002",
            "first_name": "Nandi",
            "last_name": "Mokoena",
            "email": "nandi@example.com",
            "phone_number": None,
            "job_title": "Designer",
            "employment_type": "full_time",
            "start_date": date(2026, 1, 5).isoformat(),
            "status": "active",
            "created_at": now,
            "updated_at": now,
        }


@pytest.fixture
def identity() -> tuple[UUID, UUID, AuthenticatedUser]:
    company_id = uuid4()
    user_id = uuid4()
    user = AuthenticatedUser(
        id=user_id,
        email="manager@example.com",
        access_token="test-access-token",
        claims={},
    )
    return company_id, user_id, user


def test_employee_routes_require_authentication() -> None:
    with TestClient(app) as client:
        response = client.get(
            "/workforce/employees",
            headers={"X-Company-ID": str(uuid4())},
        )

    assert response.status_code == 401


def test_lists_only_company_scoped_employee_rows(
    identity: tuple[UUID, UUID, AuthenticatedUser],
) -> None:
    company_id, user_id, user = identity
    fake_client = FakeSupabaseRestClient(company_id=company_id, user_id=user_id)

    async def current_user_override() -> AuthenticatedUser:
        return user

    app.dependency_overrides[get_current_user] = current_user_override
    app.dependency_overrides[get_supabase_rest_client] = lambda: fake_client
    try:
        with TestClient(app) as client:
            response = client.get(
                "/workforce/employees",
                params={"query": "Nandi", "status": "active"},
                headers={"X-Company-ID": str(company_id)},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()[0]["first_name"] == "Nandi"
    employee_query = fake_client.calls[-1][1]
    assert employee_query["company_id"] == f"eq.{company_id}"
    assert employee_query["status"] == "eq.active"


def test_rejects_user_without_active_company_membership(
    identity: tuple[UUID, UUID, AuthenticatedUser],
) -> None:
    company_id, user_id, user = identity
    fake_client = FakeSupabaseRestClient(
        company_id=company_id,
        user_id=user_id,
        membership_role=None,
    )

    async def current_user_override() -> AuthenticatedUser:
        return user

    app.dependency_overrides[get_current_user] = current_user_override
    app.dependency_overrides[get_supabase_rest_client] = lambda: fake_client
    try:
        with TestClient(app) as client:
            response = client.get(
                "/workforce/employees",
                headers={"X-Company-ID": str(company_id)},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "No active membership exists for this company"


def test_returns_not_found_when_rls_hides_employee(
    identity: tuple[UUID, UUID, AuthenticatedUser],
) -> None:
    company_id, user_id, user = identity
    fake_client = FakeSupabaseRestClient(company_id=company_id, user_id=user_id)

    async def current_user_override() -> AuthenticatedUser:
        return user

    app.dependency_overrides[get_current_user] = current_user_override
    app.dependency_overrides[get_supabase_rest_client] = lambda: fake_client
    try:
        with TestClient(app) as client:
            response = client.get(
                f"/workforce/employees/{uuid4()}",
                headers={"X-Company-ID": str(company_id)},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
