from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.main import app
from moshomo_api.supabase import get_supabase_rest_client
from moshomo_ai.llm.base import LLMStep, LLMUsage, ToolCall
from moshomo_ai.llm.factory import get_llm_client
from moshomo_ai.tools import workforce_registry


class FakeLLMClient:
    provider = "fake"
    model = "fake-model"

    def __init__(self, steps: list[LLMStep]) -> None:
        self._steps = list(steps)
        self.calls = 0

    async def step(self, *, system: str, messages: Any, tools: Any) -> LLMStep:
        self.calls += 1
        return self._steps.pop(0)


class FakeRestClient:
    def __init__(self, company_id: str) -> None:
        self.company_id = company_id
        self.employee_id = str(uuid4())
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.inserted: list[tuple[str, dict[str, Any]]] = []

    async def select(
        self, table: str, *, access_token: str, params: dict[str, Any]
    ) -> list[dict[str, Any]]:
        assert access_token == "test-access-token"
        self.calls.append(("select", table, params))
        if table == "employees":
            return [
                {
                    "id": self.employee_id,
                    "company_id": self.company_id,
                    "profile_id": None,
                    "department_id": None,
                    "manager_employee_id": None,
                    "employee_number": "EMP-002",
                    "first_name": "Nandi",
                    "last_name": "Mokoena",
                    "email": "nandi@example.com",
                    "phone_number": None,
                    "job_title": "Designer",
                    "employment_type": "full_time",
                    "start_date": None,
                    "status": "active",
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z",
                }
            ]
        if table == "company_knowledge_entries":
            return []
        raise AssertionError(f"Unexpected select table: {table}")

    async def insert(
        self, table: str, *, access_token: str, values: dict[str, Any]
    ) -> dict[str, Any]:
        assert access_token == "test-access-token"
        self.inserted.append((table, values))
        return {"id": str(uuid4()), **values}


def _actor(company_id: str) -> ActorContext:
    from uuid import UUID

    return ActorContext(
        company_id=UUID(company_id),
        user_id=uuid4(),
        role="manager",
        employee_id=uuid4(),
        access_token="test-access-token",
    )


def _usage() -> LLMUsage:
    return LLMUsage(provider="fake", model="fake-model", input_tokens=5, output_tokens=3)


def _run(actor: ActorContext, rest: FakeRestClient, llm: FakeLLMClient | None, question: str):
    app.dependency_overrides[get_actor_context] = lambda: actor
    app.dependency_overrides[get_supabase_rest_client] = lambda: rest
    if llm is not None:
        app.dependency_overrides[get_llm_client] = lambda: llm
    try:
        with TestClient(app) as client:
            return client.post("/workforce/assistant", json={"question": question})
    finally:
        app.dependency_overrides.clear()


def test_assistant_answers_with_tool_and_records_run() -> None:
    company_id = str(uuid4())
    rest = FakeRestClient(company_id)
    llm = FakeLLMClient(
        [
            LLMStep(
                text=None,
                tool_calls=[ToolCall(id="call-1", name="search_employees", arguments={"query": "Nandi"})],
                stop_reason="tool_use",
                usage=_usage(),
            ),
            LLMStep(
                text="Nandi Mokoena is on your team.",
                tool_calls=[],
                stop_reason="end_turn",
                usage=_usage(),
            ),
        ]
    )

    response = _run(_actor(company_id), rest, llm, "Who is on my team?")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["answer"] == "Nandi Mokoena is on your team."
    assert body["citations"] and body["citations"][0]["table"] == "employees"
    assert body["run_id"]

    # One assistant_runs audit row, with the tool call + citations captured.
    assert rest.inserted and rest.inserted[0][0] == "assistant_runs"
    run_values = rest.inserted[0][1]
    assert run_values["status"] == "completed"
    assert run_values["tool_calls"][0]["name"] == "search_employees"
    assert run_values["cited_records"]
    assert run_values["affected_records"] == []


def test_tool_is_company_scoped_with_actor_token() -> None:
    company_id = str(uuid4())
    rest = FakeRestClient(company_id)
    llm = FakeLLMClient(
        [
            LLMStep(
                text=None,
                tool_calls=[ToolCall(id="c", name="search_employees", arguments={})],
                stop_reason="tool_use",
                usage=_usage(),
            ),
            LLMStep(text="Here is your team.", tool_calls=[], stop_reason="end_turn", usage=_usage()),
        ]
    )

    _run(_actor(company_id), rest, llm, "List my team")

    employees_call = next(call for call in rest.calls if call[1] == "employees")
    assert employees_call[2]["company_id"] == f"eq.{company_id}"


def test_invalid_tool_arguments_recover() -> None:
    company_id = str(uuid4())
    rest = FakeRestClient(company_id)
    llm = FakeLLMClient(
        [
            LLMStep(
                text=None,
                tool_calls=[ToolCall(id="c", name="search_employees", arguments={"limit": "lots"})],
                stop_reason="tool_use",
                usage=_usage(),
            ),
            LLMStep(text="Could not search.", tool_calls=[], stop_reason="end_turn", usage=_usage()),
        ]
    )

    response = _run(_actor(company_id), rest, llm, "find people")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    run_values = rest.inserted[0][1]
    assert run_values["tool_calls"][0]["ok"] is False


def test_refusal_is_recorded() -> None:
    company_id = str(uuid4())
    rest = FakeRestClient(company_id)
    llm = FakeLLMClient(
        [
            LLMStep(
                text="I can't help with that.",
                tool_calls=[],
                stop_reason="refusal",
                usage=_usage(),
            )
        ]
    )

    response = _run(_actor(company_id), rest, llm, "do something disallowed")

    body = response.json()
    assert body["status"] == "refused"
    assert body["refusal_reason"]
    assert body["answer"] is None
    assert rest.inserted[0][1]["status"] == "refused"


def test_provider_not_configured_returns_503() -> None:
    from moshomo_api.config import settings

    company_id = str(uuid4())
    rest = FakeRestClient(company_id)
    saved = (settings.anthropic_api_key, settings.openai_api_key, settings.google_api_key)
    settings.anthropic_api_key = None
    settings.openai_api_key = None
    settings.google_api_key = None
    try:
        # No get_llm_client override -> real factory runs; no key -> 503.
        response = _run(_actor(company_id), rest, None, "anything")
        assert response.status_code == 503
    finally:
        (
            settings.anthropic_api_key,
            settings.openai_api_key,
            settings.google_api_key,
        ) = saved


def test_registry_is_read_only() -> None:
    names = workforce_registry.names()
    assert names == ["search_employees", "get_employee_profile", "get_company_knowledge"]
    forbidden = ("create", "update", "delete", "insert", "approve", "draft")
    assert not any(any(word in name for word in forbidden) for name in names)
