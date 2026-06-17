from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from moshomo_api.auth import AuthenticatedUser, get_current_user
from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.main import app
from moshomo_api.supabase import (
    get_supabase_admin_auth_client,
    get_supabase_rest_client,
)


class FakeOnboardingRestClient:
    def __init__(self, company_id: UUID) -> None:
        self.company_id = company_id
        self.employee_id = uuid4()
        self.membership_id = uuid4()
        self.invitation_id = uuid4()
        self.calls: list[tuple[str, str, dict[str, Any]]] = []

    async def rpc(
        self,
        function_name: str,
        *,
        access_token: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        assert access_token == "test-access-token"
        self.calls.append(("rpc", function_name, arguments))
        if function_name == "bootstrap_company":
            return {
                "company_id": str(self.company_id),
                "employee_id": str(self.employee_id),
                "membership_id": str(self.membership_id),
                "role": "admin",
            }
        if function_name == "create_employee_invitation":
            return {
                "invitation_id": str(self.invitation_id),
                "employee_id": str(self.employee_id),
                "company_id": str(self.company_id),
                "email": arguments["invite_email"],
                "role": arguments["assigned_role"],
                "status": "pending",
                "expires_at": (
                    datetime.now(timezone.utc) + timedelta(days=7)
                ).isoformat(),
            }
        if function_name == "accept_company_invitation":
            return {
                "company_id": str(self.company_id),
                "employee_id": str(self.employee_id),
                "membership_id": str(self.membership_id),
                "role": "manager",
                "status": "accepted",
            }
        raise AssertionError(f"Unexpected RPC: {function_name}")

    async def insert(
        self,
        table: str,
        *,
        access_token: str,
        values: dict[str, Any],
    ) -> dict[str, Any]:
        assert access_token == "test-access-token"
        self.calls.append(("insert", table, values))
        now = datetime.now(timezone.utc).isoformat()
        return {
            "id": str(uuid4()),
            "company_id": values["company_id"],
            "name": values["name"],
            "created_at": now,
            "updated_at": now,
        }

    async def update(
        self,
        table: str,
        *,
        access_token: str,
        filters: dict[str, str | int],
        values: dict[str, Any],
    ) -> list[dict[str, Any]]:
        assert access_token == "test-access-token"
        self.calls.append(("update", table, {**filters, **values}))
        return [{"id": str(self.invitation_id), **values}]


class FakeAdminAuthClient:
    def __init__(self) -> None:
        self.invitations: list[dict[str, str]] = []

    def require_configuration(self) -> tuple[str, str]:
        return ("https://example.supabase.co", "test-secret")

    async def invite_user_by_email(
        self,
        email: str,
        *,
        invitation_id: str,
        company_id: str,
    ) -> None:
        self.invitations.append(
            {
                "email": email,
                "invitation_id": invitation_id,
                "company_id": company_id,
            }
        )


def _identity(company_id: UUID, role: str = "admin") -> tuple[AuthenticatedUser, ActorContext]:
    user_id = uuid4()
    user = AuthenticatedUser(
        id=user_id,
        email="admin@example.com",
        access_token="test-access-token",
        claims={},
    )
    actor = ActorContext(
        company_id=company_id,
        user_id=user_id,
        role=role,  # type: ignore[arg-type]
        employee_id=uuid4(),
        access_token="test-access-token",
    )
    return user, actor


def test_bootstraps_company_with_founder_employee_and_admin_membership() -> None:
    company_id = uuid4()
    user, _ = _identity(company_id)
    rest = FakeOnboardingRestClient(company_id)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_supabase_rest_client] = lambda: rest
    try:
        with TestClient(app) as client:
            response = client.post(
                "/companies",
                json={
                    "company_name": "Moshomo Demo",
                    "company_slug": "moshomo-demo",
                    "employee_number": "EMP-001",
                    "first_name": "Aloy",
                    "last_name": "Admin",
                    "job_title": "Founder",
                },
                headers={"Authorization": "Bearer overridden"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["company_id"] == str(company_id)
    assert response.json()["role"] == "admin"
    assert rest.calls[0][1] == "bootstrap_company"


def test_admin_creates_department() -> None:
    company_id = uuid4()
    _, actor = _identity(company_id)
    rest = FakeOnboardingRestClient(company_id)

    app.dependency_overrides[get_actor_context] = lambda: actor
    app.dependency_overrides[get_supabase_rest_client] = lambda: rest
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/companies/{company_id}/departments",
                json={"name": "Operations"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["name"] == "Operations"


def test_admin_creates_employee_and_sends_assigned_role_invitation() -> None:
    company_id = uuid4()
    _, actor = _identity(company_id)
    rest = FakeOnboardingRestClient(company_id)
    admin_auth = FakeAdminAuthClient()

    app.dependency_overrides[get_actor_context] = lambda: actor
    app.dependency_overrides[get_supabase_rest_client] = lambda: rest
    app.dependency_overrides[get_supabase_admin_auth_client] = lambda: admin_auth
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/companies/{company_id}/invitations",
                json={
                    "email": "manager@example.com",
                    "role": "manager",
                    "employee_number": "EMP-002",
                    "first_name": "Nandi",
                    "last_name": "Mokoena",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["status"] == "sent"
    assert response.json()["role"] == "manager"
    assert admin_auth.invitations[0]["email"] == "manager@example.com"
    assert rest.calls[-1][2]["status"] == "sent"


def test_non_admin_cannot_invite_employee() -> None:
    company_id = uuid4()
    _, actor = _identity(company_id, role="manager")
    rest = FakeOnboardingRestClient(company_id)
    admin_auth = FakeAdminAuthClient()

    app.dependency_overrides[get_actor_context] = lambda: actor
    app.dependency_overrides[get_supabase_rest_client] = lambda: rest
    app.dependency_overrides[get_supabase_admin_auth_client] = lambda: admin_auth
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/companies/{company_id}/invitations",
                json={
                    "email": "employee@example.com",
                    "role": "employee",
                    "employee_number": "EMP-003",
                    "first_name": "Sam",
                    "last_name": "Employee",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert not admin_auth.invitations
    assert not rest.calls


def test_invited_user_accepts_employee_identity_and_role() -> None:
    company_id = uuid4()
    user, _ = _identity(company_id)
    rest = FakeOnboardingRestClient(company_id)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_supabase_rest_client] = lambda: rest
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/company-invitations/{rest.invitation_id}/accept",
                headers={"Authorization": "Bearer overridden"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    assert response.json()["role"] == "manager"
