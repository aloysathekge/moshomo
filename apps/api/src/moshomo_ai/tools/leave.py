"""Leave action tools for Moshomo AI.

These tools are deliberately **propose-only**: they read to validate, then stage a
structured intent on the run context. They never write. The human confirms the
staged intent, and the actual change is applied by the existing
``PATCH /workforce/leave/requests/{id}`` endpoint, which independently re-checks
authorization under RLS. So the assistant has no write capability — the worst a
bad proposal can do is wait for a human to reject it.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from moshomo_ai.context import RunContext
from moshomo_ai.tools.registry import workforce_registry

LEAVE_LOOKUP_SELECT = (
    "id,employee_id,leave_type,start_date,end_date,day_part,days,status,"
    "employee:employees(first_name,last_name,employee_number,manager_employee_id)"
)


LeaveStatus = Literal["pending", "approved", "rejected", "cancelled"]


def _request_summary(row: dict[str, Any]) -> dict[str, Any]:
    employee = row.get("employee") or {}
    name = (
        f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
        or "Unknown"
    )
    return {
        "id": row.get("id"),
        "employee_name": name,
        "leave_type": row.get("leave_type"),
        "start_date": row.get("start_date"),
        "end_date": row.get("end_date"),
        "day_part": row.get("day_part"),
        "days": row.get("days"),
        "status": row.get("status"),
    }


class ListLeaveRequestsParams(BaseModel):
    status: LeaveStatus | None = Field(
        default="pending",
        description="Filter by status. Defaults to pending (awaiting a decision).",
    )
    limit: int = Field(default=50, ge=1, le=100)


@workforce_registry.register(
    name="list_leave_requests",
    description=(
        "List leave requests the current user is allowed to see (managers see "
        "their team's, admins see all), with each request's id, employee name, "
        "type, dates and status. Use this to find a request before proposing a "
        "decision on it. Defaults to pending requests."
    ),
    param_model=ListLeaveRequestsParams,
)
async def list_leave_requests(
    params: ListLeaveRequestsParams, context: RunContext
) -> dict[str, Any]:
    query: dict[str, str | int] = {
        "select": LEAVE_LOOKUP_SELECT,
        "company_id": f"eq.{context.company_id}",
        "order": "start_date.desc",
        "limit": params.limit,
    }
    if params.status:
        query["status"] = f"eq.{params.status}"

    rows = await context.rest.select(
        "leave_requests", access_token=context.access_token, params=query
    )
    summaries = [_request_summary(row) for row in rows]
    for row in rows:
        context.cite("leave_requests", row["id"], _request_summary(row)["employee_name"])
    return {"count": len(summaries), "requests": summaries}


class ProposeLeaveDecisionParams(BaseModel):
    request_id: str = Field(description="The leave request id to act on.")
    decision: Literal["approve", "reject"] = Field(
        description="Whether to approve or reject the request."
    )
    note: str | None = Field(
        default=None,
        max_length=500,
        description="Optional note shown to the employee with the decision.",
    )


@workforce_registry.register(
    name="propose_leave_decision",
    description=(
        "Stage an approve/reject decision on a PENDING leave request for the user "
        "to confirm. This does NOT apply the decision — it only proposes it. Only "
        "an admin or the employee's direct manager may decide a request. After "
        "calling this, summarize what you staged and ask the user to confirm; "
        "never claim the decision has been applied."
    ),
    param_model=ProposeLeaveDecisionParams,
)
async def propose_leave_decision(
    params: ProposeLeaveDecisionParams, context: RunContext
) -> dict[str, Any]:
    rows = await context.rest.select(
        "leave_requests",
        access_token=context.access_token,
        params={
            "select": LEAVE_LOOKUP_SELECT,
            "id": f"eq.{params.request_id}",
            "company_id": f"eq.{context.company_id}",
            "limit": 1,
        },
    )
    if not rows:
        return {"staged": False, "reason": "Leave request not found or not permitted."}

    request = rows[0]
    if request.get("status") != "pending":
        return {
            "staged": False,
            "reason": (
                f"This request is already {request.get('status')}; only pending "
                "requests can be decided."
            ),
        }

    # Mirror the decision endpoint's authorization so we never stage an action the
    # user cannot perform. The PATCH endpoint remains the authoritative gate.
    actor = context.actor
    employee = request.get("employee") or {}
    manager_id = employee.get("manager_employee_id")
    is_manager = (
        actor.role == "manager"
        and actor.employee_id is not None
        and manager_id is not None
        and str(manager_id) == str(actor.employee_id)
    )
    if actor.role != "admin" and not is_manager:
        return {
            "staged": False,
            "reason": (
                "Only an admin or the employee's direct manager can decide this "
                "request."
            ),
        }

    name = (
        f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
        or "the employee"
    )
    intent: dict[str, Any] = {
        "type": "leave_decision",
        "action": params.decision,
        "request_id": str(request["id"]),
        "employee_name": name,
        "leave_type": request.get("leave_type"),
        "start_date": request.get("start_date"),
        "end_date": request.get("end_date"),
        "day_part": request.get("day_part"),
        "days": request.get("days"),
        "note": params.note,
        # Self-describing confirmation call the client applies on user confirm.
        "confirm": {
            "method": "PATCH",
            "path": f"/workforce/leave/requests/{request['id']}",
            "body": {"action": params.decision, "note": params.note},
        },
    }
    context.propose(intent)
    context.cite(
        "leave_requests",
        request["id"],
        f"{name} · {request.get('leave_type')} leave",
    )
    return {
        "staged": True,
        "summary": (
            f"Staged: {params.decision} {name}'s {request.get('leave_type')} leave "
            f"({request.get('start_date')} to {request.get('end_date')}, "
            f"{request.get('days')} day(s)). Awaiting the user's confirmation."
        ),
    }
