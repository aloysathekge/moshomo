from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from moshomo_api.context import ActorContext
from moshomo_ai.context import RunContext
from moshomo_ai.tools.leave import ProposeLeaveDecisionParams, propose_leave_decision


class FakeRest:
    def __init__(self, row: dict[str, Any] | None) -> None:
        self._row = row
        self.calls: list[dict[str, Any]] = []

    async def select(self, table: str, *, access_token: str, params: dict[str, Any]):
        assert table == "leave_requests"
        self.calls.append(params)
        return [self._row] if self._row else []


def _ctx(role: str, employee_id, rest: FakeRest) -> RunContext:
    actor = ActorContext(
        company_id=uuid4(),
        user_id=uuid4(),
        role=role,
        employee_id=employee_id,
        access_token="t",
    )
    return RunContext(actor=actor, rest=rest)  # type: ignore[arg-type]


def _row(*, status: str = "pending", manager_id=None, rid=None) -> dict[str, Any]:
    return {
        "id": str(rid or uuid4()),
        "employee_id": str(uuid4()),
        "leave_type": "annual",
        "start_date": "2026-07-01",
        "end_date": "2026-07-03",
        "day_part": "full",
        "days": 3,
        "status": status,
        "employee": {
            "first_name": "Thabo",
            "last_name": "Mokoena",
            "employee_number": "1",
            "manager_employee_id": str(manager_id) if manager_id else None,
        },
    }


@pytest.mark.asyncio
async def test_admin_can_stage_approval() -> None:
    rid = uuid4()
    ctx = _ctx("admin", uuid4(), FakeRest(_row(rid=rid)))
    out = await propose_leave_decision(
        ProposeLeaveDecisionParams(request_id=str(rid), decision="approve"), ctx
    )
    assert out["staged"] is True
    assert ctx.proposed_intent is not None
    assert ctx.proposed_intent["action"] == "approve"
    assert ctx.proposed_intent["confirm"]["method"] == "PATCH"
    assert ctx.proposed_intent["confirm"]["path"] == f"/workforce/leave/requests/{rid}"
    assert ctx.proposed_intent["confirm"]["body"] == {"action": "approve", "note": None}
    # Staging records a citation to the request it acted on.
    assert ctx.citations and ctx.citations[0]["table"] == "leave_requests"


@pytest.mark.asyncio
async def test_direct_manager_can_stage_rejection() -> None:
    manager_employee_id = uuid4()
    rest = FakeRest(_row(manager_id=manager_employee_id))
    ctx = _ctx("manager", manager_employee_id, rest)
    out = await propose_leave_decision(
        ProposeLeaveDecisionParams(request_id="x", decision="reject", note="No cover"), ctx
    )
    assert out["staged"] is True
    assert ctx.proposed_intent["action"] == "reject"
    assert ctx.proposed_intent["confirm"]["body"]["note"] == "No cover"


@pytest.mark.asyncio
async def test_non_managing_manager_cannot_stage() -> None:
    # Manager, but not THIS employee's manager.
    ctx = _ctx("manager", uuid4(), FakeRest(_row(manager_id=uuid4())))
    out = await propose_leave_decision(
        ProposeLeaveDecisionParams(request_id="x", decision="approve"), ctx
    )
    assert out["staged"] is False
    assert ctx.proposed_intent is None


@pytest.mark.asyncio
async def test_employee_cannot_stage() -> None:
    ctx = _ctx("employee", uuid4(), FakeRest(_row()))
    out = await propose_leave_decision(
        ProposeLeaveDecisionParams(request_id="x", decision="approve"), ctx
    )
    assert out["staged"] is False
    assert ctx.proposed_intent is None


@pytest.mark.asyncio
async def test_non_pending_cannot_stage() -> None:
    ctx = _ctx("admin", uuid4(), FakeRest(_row(status="approved")))
    out = await propose_leave_decision(
        ProposeLeaveDecisionParams(request_id="x", decision="approve"), ctx
    )
    assert out["staged"] is False
    assert "already approved" in out["reason"]
    assert ctx.proposed_intent is None


@pytest.mark.asyncio
async def test_unknown_request_not_staged() -> None:
    ctx = _ctx("admin", uuid4(), FakeRest(None))
    out = await propose_leave_decision(
        ProposeLeaveDecisionParams(request_id="x", decision="approve"), ctx
    )
    assert out["staged"] is False
    assert ctx.proposed_intent is None
