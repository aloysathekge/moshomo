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
        employee_id: UUID,
        *,
        profile_id: UUID | None = None,
        email: str | None = "employee@example.com",
        employee_exists: bool = True,
    ) -> None:
        self.company_id = company_id
        self.employee_id = employee_id
        self.profile_id = profile_id
        self.email = email
        self.employee_exists = employee_exists
        self.calls: list[tuple[str, str, dict[str, Any]]] = []

    def _full_employee(self, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        row = {
            "id": str(self.employee_id),
            "company_id": str(self.company_id),
            "profile_id": str(self.profile_id) if self.profile_id else None,
            "department_id": None,
            "manager_employee_id": None,
            "employee_number": "EMP-002",
            "first_name": "Nandi",
            "last_name": "Mokoena",
            "email": self.email,
            "phone_number": None,
            "job_title": "Designer",
            "employment_type": "full_time",
            "start_date": None,
            "status": "active",
            "created_at": now,
            "updated_at": now,
        }
        if overrides:
            row.update(overrides)
        return row

    async def select(
        self, table: str, *, access_token: str, params: dict[str, Any]
    ) -> list[dict[str, Any]]:
        self.calls.append(("select", table, params))
        if table == "employees":
            if not self.employee_exists:
                return []
            select = str(params.get("select", ""))
            if "first_name" in select:
                return [self._full_employee()]
            row: dict[str, Any] = {"id": str(self.employee_id)}
            if "profile_id" in select:
                row["profile_id"] = str(self.profile_id) if self.profile_id else None
            if "email" in select:
                row["email"] = self.email
            return [row]
        if table == "employee_documents":
            return []
        raise AssertionError(f"Unexpected select table: {table}")

    async def update(
        self,
        table: str,
        *,
        access_token: str,
        filters: dict[str, Any],
        values: dict[str, Any],
    ) -> list[dict[str, Any]]:
        self.calls.append(("update", table, {**filters, **values}))
        if table == "employees":
            return [self._full_employee(values)]
        return [{"id": str(uuid4()), **values}]

    async def insert(
        self, table: str, *, access_token: str, values: dict[str, Any]
    ) -> dict[str, Any]:
        self.calls.append(("insert", table, values))
        return {
            "id": str(uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            **values,
        }

    async def delete(
        self, table: str, *, access_token: str, filters: dict[str, Any]
    ) -> None:
        self.calls.append(("delete", table, filters))


def _actor(company_id: UUID, *, role: str = "admin", user_id: UUID | None = None) -> ActorContext:
    return ActorContext(
        company_id=company_id,
        user_id=user_id or uuid4(),
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


def test_admin_updates_employee_fields() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id, employee_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.patch(
            f"/companies/{company_id}/employees/{employee_id}",
            json={"job_title": "Lead Designer", "status": "suspended"},
        ),
    )
    assert response.status_code == 200
    update_call = next(call for call in rest.calls if call[0] == "update")
    assert update_call[1] == "employees"
    assert update_call[2]["job_title"] == "Lead Designer"
    assert update_call[2]["status"] == "suspended"


def test_non_admin_cannot_update_employee() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id, employee_id)
    response = _run(
        _actor(company_id, role="employee"),
        rest,
        lambda client: client.patch(
            f"/companies/{company_id}/employees/{employee_id}",
            json={"job_title": "Lead Designer"},
        ),
    )
    assert response.status_code == 403
    assert not rest.calls


def test_admin_changes_role_updates_membership_and_invitation() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id, employee_id, profile_id=uuid4())
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.patch(
            f"/companies/{company_id}/employees/{employee_id}/role",
            json={"role": "manager"},
        ),
    )
    assert response.status_code == 200
    assert response.json()["role"] == "manager"
    updated_tables = {call[1] for call in rest.calls if call[0] == "update"}
    assert "company_memberships" in updated_tables
    assert "company_invitations" in updated_tables


def test_admin_cannot_change_own_role() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    user_id = uuid4()
    rest = FakeRestClient(company_id, employee_id, profile_id=user_id)
    response = _run(
        _actor(company_id, user_id=user_id),
        rest,
        lambda client: client.patch(
            f"/companies/{company_id}/employees/{employee_id}/role",
            json={"role": "employee"},
        ),
    )
    assert response.status_code == 422
    assert not any(call[0] == "update" for call in rest.calls)


def test_admin_removes_employee() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id, employee_id, profile_id=uuid4())
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.delete(f"/companies/{company_id}/employees/{employee_id}"),
    )
    assert response.status_code == 204
    assert any(call[0] == "delete" and call[1] == "employees" for call in rest.calls)


def test_admin_cannot_remove_self() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    user_id = uuid4()
    rest = FakeRestClient(company_id, employee_id, profile_id=user_id)
    response = _run(
        _actor(company_id, user_id=user_id),
        rest,
        lambda client: client.delete(f"/companies/{company_id}/employees/{employee_id}"),
    )
    assert response.status_code == 422
    assert not any(call[0] == "delete" for call in rest.calls)


def test_document_path_must_match_employee_folder() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id, employee_id)
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.post(
            f"/companies/{company_id}/employees/{employee_id}/documents",
            json={"storage_path": "somewhere/else/file.pdf", "file_name": "file.pdf"},
        ),
    )
    assert response.status_code == 422


def test_admin_adds_employee_document() -> None:
    company_id = uuid4()
    employee_id = uuid4()
    rest = FakeRestClient(company_id, employee_id)
    storage_path = f"{company_id}/{employee_id}/contract.pdf"
    response = _run(
        _actor(company_id),
        rest,
        lambda client: client.post(
            f"/companies/{company_id}/employees/{employee_id}/documents",
            json={
                "storage_path": storage_path,
                "file_name": "contract.pdf",
                "doc_type": "contract",
            },
        ),
    )
    assert response.status_code == 201
    assert response.json()["storage_path"] == storage_path
    insert_call = next(call for call in rest.calls if call[0] == "insert")
    assert insert_call[1] == "employee_documents"