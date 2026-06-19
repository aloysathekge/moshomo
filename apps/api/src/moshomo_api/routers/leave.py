from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator

from moshomo_api.context import ActorContext, get_actor_context, require_company_admin
from moshomo_api.supabase import SupabaseRestClient, get_supabase_rest_client

router = APIRouter(prefix="/workforce/leave", tags=["leave"])

LeaveType = Literal["annual", "sick", "family_responsibility", "unpaid"]
DayPart = Literal["full", "morning", "afternoon"]
LeaveStatus = Literal["pending", "approved", "rejected", "cancelled"]
LEAVE_TYPES: tuple[LeaveType, ...] = ("annual", "sick", "family_responsibility", "unpaid")

LEAVE_SELECT = (
    "id,company_id,employee_id,leave_type,start_date,end_date,day_part,days,reason,"
    "status,decided_by,decided_at,decision_note,created_at,updated_at,"
    "employee:employees(first_name,last_name,employee_number,manager_employee_id)"
)


def _compute_days(start: date, end: date, day_part: DayPart) -> float:
    if day_part != "full":
        return 0.5
    return float((end - start).days + 1)


class EmployeeBrief(BaseModel):
    model_config = ConfigDict(extra="ignore")

    first_name: str | None = None
    last_name: str | None = None
    employee_number: str | None = None
    manager_employee_id: UUID | None = None


class LeaveRequestCreate(BaseModel):
    leave_type: LeaveType
    start_date: date
    end_date: date
    day_part: DayPart = "full"
    reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _check(self) -> "LeaveRequestCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.day_part != "full" and self.start_date != self.end_date:
            raise ValueError("A half day applies to a single day only")
        return self


class LeaveDecision(BaseModel):
    action: Literal["approve", "reject", "cancel"]
    note: str | None = Field(default=None, max_length=500)


class LeaveRequestResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    company_id: UUID
    employee_id: UUID
    leave_type: LeaveType
    start_date: date
    end_date: date
    day_part: DayPart
    days: float
    reason: str | None = None
    status: LeaveStatus
    decided_by: UUID | None = None
    decided_at: datetime | None = None
    decision_note: str | None = None
    created_at: datetime
    updated_at: datetime
    employee: EmployeeBrief | None = None


class AllowanceItem(BaseModel):
    leave_type: LeaveType
    allotted_days: float = Field(ge=0)


class AllowancesUpdate(BaseModel):
    allowances: list[AllowanceItem]


@router.post("/requests", response_model=LeaveRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_leave_request(
    payload: LeaveRequestCreate,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> LeaveRequestResponse:
    if actor.employee_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The current user has no employee record in this company",
        )
    created = await client.insert(
        "leave_requests",
        access_token=actor.access_token,
        values={
            "company_id": str(actor.company_id),
            "employee_id": str(actor.employee_id),
            "leave_type": payload.leave_type,
            "start_date": payload.start_date.isoformat(),
            "end_date": payload.end_date.isoformat(),
            "day_part": payload.day_part,
            "days": _compute_days(payload.start_date, payload.end_date, payload.day_part),
            "reason": payload.reason,
            "status": "pending",
        },
    )
    return LeaveRequestResponse.model_validate(created)


@router.get("/requests", response_model=list[LeaveRequestResponse])
async def list_leave_requests(
    leave_status: LeaveStatus | None = Query(default=None, alias="status"),
    mine: bool = False,
    limit: int = Query(default=100, ge=1, le=200),
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> list[LeaveRequestResponse]:
    params: dict[str, str | int] = {
        "select": LEAVE_SELECT,
        "company_id": f"eq.{actor.company_id}",
        "order": "start_date.desc",
        "limit": limit,
    }
    if mine:
        if actor.employee_id is None:
            return []
        params["employee_id"] = f"eq.{actor.employee_id}"
    if leave_status is not None:
        params["status"] = f"eq.{leave_status}"

    rows = await client.select("leave_requests", access_token=actor.access_token, params=params)
    return [LeaveRequestResponse.model_validate(row) for row in rows]


@router.patch("/requests/{request_id}", response_model=LeaveRequestResponse)
async def decide_leave_request(
    request_id: UUID,
    payload: LeaveDecision,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> LeaveRequestResponse:
    rows = await client.select(
        "leave_requests",
        access_token=actor.access_token,
        params={
            "select": "id,employee_id,status,employee:employees(manager_employee_id)",
            "id": f"eq.{request_id}",
            "company_id": f"eq.{actor.company_id}",
            "limit": 1,
        },
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")
    request = rows[0]
    if request["status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending leave requests can be changed",
        )

    values: dict[str, Any]
    if payload.action == "cancel":
        if str(request["employee_id"]) != str(actor.employee_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only cancel your own leave request",
            )
        values = {"status": "cancelled"}
    else:
        manager_id = (request.get("employee") or {}).get("manager_employee_id")
        is_manager = (
            actor.role == "manager"
            and actor.employee_id is not None
            and manager_id is not None
            and str(manager_id) == str(actor.employee_id)
        )
        if actor.role != "admin" and not is_manager:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an admin or the employee's manager can decide this request",
            )
        values = {
            "status": "approved" if payload.action == "approve" else "rejected",
            "decided_by": str(actor.user_id),
            "decided_at": datetime.now(timezone.utc).isoformat(),
            "decision_note": payload.note,
        }

    updated = await client.update(
        "leave_requests",
        access_token=actor.access_token,
        filters={"id": f"eq.{request_id}", "company_id": f"eq.{actor.company_id}"},
        values=values,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")

    refreshed = await client.select(
        "leave_requests",
        access_token=actor.access_token,
        params={
            "select": LEAVE_SELECT,
            "id": f"eq.{request_id}",
            "company_id": f"eq.{actor.company_id}",
            "limit": 1,
        },
    )
    return LeaveRequestResponse.model_validate(refreshed[0] if refreshed else updated[0])


@router.get("/balances")
async def leave_balances(
    employee_id: UUID | None = Query(default=None),
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> dict[str, Any]:
    target = str(employee_id) if employee_id else (str(actor.employee_id) if actor.employee_id else None)
    if target is None:
        return {"employee_id": None, "balances": []}

    allowances = await client.select(
        "leave_allowances",
        access_token=actor.access_token,
        params={
            "select": "leave_type,allotted_days",
            "company_id": f"eq.{actor.company_id}",
            "employee_id": f"eq.{target}",
        },
    )
    approved = await client.select(
        "leave_requests",
        access_token=actor.access_token,
        params={
            "select": "leave_type,days",
            "company_id": f"eq.{actor.company_id}",
            "employee_id": f"eq.{target}",
            "status": "eq.approved",
        },
    )

    allotted_by_type = {row["leave_type"]: float(row["allotted_days"]) for row in allowances}
    used_by_type: dict[str, float] = {}
    for row in approved:
        used_by_type[row["leave_type"]] = used_by_type.get(row["leave_type"], 0.0) + float(row["days"])

    balances = []
    for leave_type in LEAVE_TYPES:
        allotted = allotted_by_type.get(leave_type, 0.0)
        used = used_by_type.get(leave_type, 0.0)
        balances.append(
            {
                "leave_type": leave_type,
                "allotted": allotted,
                "used": round(used, 1),
                "remaining": round(allotted - used, 1),
            }
        )
    return {"employee_id": target, "balances": balances}


@router.put("/allowances/{employee_id}")
async def set_leave_allowances(
    employee_id: UUID,
    payload: AllowancesUpdate,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> dict[str, Any]:
    require_company_admin(actor, actor.company_id)
    if not payload.allowances:
        return {"allowances": []}
    values = [
        {
            "company_id": str(actor.company_id),
            "employee_id": str(employee_id),
            "leave_type": item.leave_type,
            "allotted_days": item.allotted_days,
        }
        for item in payload.allowances
    ]
    rows = await client.upsert(
        "leave_allowances",
        access_token=actor.access_token,
        values=values,
        on_conflict="company_id,employee_id,leave_type",
    )
    return {"allowances": rows}
