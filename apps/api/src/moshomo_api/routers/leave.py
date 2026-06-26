from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
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
# Unpaid leave has no allowance ceiling; the rest are balance-tracked.
BALANCE_TRACKED: tuple[LeaveType, ...] = ("annual", "sick", "family_responsibility")
# Requests that still consume balance (approved is committed, pending is reserved).
COMMITTING_STATUSES = "(approved,pending)"

# South African public holidays (observed dates) for the per-company import action.
SA_HOLIDAYS: dict[int, list[tuple[str, str]]] = {
    2026: [
        ("2026-01-01", "New Year's Day"),
        ("2026-03-21", "Human Rights Day"),
        ("2026-04-03", "Good Friday"),
        ("2026-04-06", "Family Day"),
        ("2026-04-27", "Freedom Day"),
        ("2026-05-01", "Workers' Day"),
        ("2026-06-16", "Youth Day"),
        ("2026-08-10", "National Women's Day (observed)"),
        ("2026-09-24", "Heritage Day"),
        ("2026-12-16", "Day of Reconciliation"),
        ("2026-12-25", "Christmas Day"),
        ("2026-12-26", "Day of Goodwill"),
    ],
    2027: [
        ("2027-01-01", "New Year's Day"),
        ("2027-03-22", "Human Rights Day (observed)"),
        ("2027-03-26", "Good Friday"),
        ("2027-03-29", "Family Day"),
        ("2027-04-27", "Freedom Day"),
        ("2027-05-01", "Workers' Day"),
        ("2027-06-16", "Youth Day"),
        ("2027-08-09", "National Women's Day"),
        ("2027-09-24", "Heritage Day"),
        ("2027-12-16", "Day of Reconciliation"),
        ("2027-12-25", "Christmas Day"),
        ("2027-12-27", "Day of Goodwill (observed)"),
    ],
}

LEAVE_SELECT = (
    "id,company_id,employee_id,leave_type,start_date,end_date,day_part,days,reason,"
    "status,decided_by,decided_at,decision_note,created_at,updated_at,"
    "employee:employees(first_name,last_name,employee_number,manager_employee_id)"
)


def _working_days(start: date, end: date, day_part: DayPart, holidays: set[date]) -> float:
    """Count working days in [start, end], excluding weekends and holidays.
    A half day is always 0.5 (it only applies to a single day)."""
    if day_part != "full":
        return 0.5
    total = 0
    current = start
    while current <= end:
        if current.weekday() < 5 and current not in holidays:
            total += 1
        current += timedelta(days=1)
    return float(total)


async def _holidays_in_range(
    client: SupabaseRestClient, actor: ActorContext, start: date, end: date
) -> set[date]:
    """Company holidays within a date range. Degrades to an empty set if the
    company_holidays table is not yet available (migration not applied)."""
    try:
        rows = await client.select(
            "company_holidays",
            access_token=actor.access_token,
            params={
                "select": "holiday_date",
                "company_id": f"eq.{actor.company_id}",
                "and": f"(holiday_date.gte.{start.isoformat()},holiday_date.lte.{end.isoformat()})",
            },
        )
    except Exception:
        return set()
    result: set[date] = set()
    for row in rows:
        try:
            result.add(date.fromisoformat(row["holiday_date"]))
        except (KeyError, ValueError):
            continue
    return result


async def _committed_days(
    client: SupabaseRestClient,
    actor: ActorContext,
    *,
    employee_id: str,
    leave_type: LeaveType,
    statuses: str,
    exclude_request_id: str | None = None,
) -> float:
    """Sum of leave days for an employee+type across the given statuses."""
    params: dict[str, str | int] = {
        "select": "days",
        "company_id": f"eq.{actor.company_id}",
        "employee_id": f"eq.{employee_id}",
        "leave_type": f"eq.{leave_type}",
        "status": f"in.{statuses}",
    }
    if exclude_request_id is not None:
        params["id"] = f"neq.{exclude_request_id}"
    rows = await client.select("leave_requests", access_token=actor.access_token, params=params)
    return sum(float(row["days"]) for row in rows)


async def _allotted_for(
    client: SupabaseRestClient, actor: ActorContext, *, employee_id: str, leave_type: LeaveType
) -> float | None:
    """Allotted days for an employee+type, or None when no allowance is
    configured (untracked — no ceiling enforced)."""
    rows = await client.select(
        "leave_allowances",
        access_token=actor.access_token,
        params={
            "select": "allotted_days",
            "company_id": f"eq.{actor.company_id}",
            "employee_id": f"eq.{employee_id}",
            "leave_type": f"eq.{leave_type}",
            "limit": 1,
        },
    )
    return float(rows[0]["allotted_days"]) if rows else None


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
    employee_id = str(actor.employee_id)

    if payload.start_date < date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Leave cannot start in the past",
        )

    holidays = await _holidays_in_range(client, actor, payload.start_date, payload.end_date)
    days = _working_days(payload.start_date, payload.end_date, payload.day_part, holidays)
    if days <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The selected dates contain no working days (weekends and holidays are excluded)",
        )

    # Reject requests overlapping an existing pending/approved request.
    overlapping = await client.select(
        "leave_requests",
        access_token=actor.access_token,
        params={
            "select": "id",
            "company_id": f"eq.{actor.company_id}",
            "employee_id": f"eq.{employee_id}",
            "status": f"in.{COMMITTING_STATUSES}",
            "start_date": f"lte.{payload.end_date.isoformat()}",
            "end_date": f"gte.{payload.start_date.isoformat()}",
            "limit": 1,
        },
    )
    if overlapping:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This overlaps a leave request you already have for those dates",
        )

    # Enforce balance for tracked types that have an allowance configured.
    if payload.leave_type in BALANCE_TRACKED:
        allotted = await _allotted_for(
            client, actor, employee_id=employee_id, leave_type=payload.leave_type
        )
        if allotted is not None:
            committed = await _committed_days(
                client,
                actor,
                employee_id=employee_id,
                leave_type=payload.leave_type,
                statuses=COMMITTING_STATUSES,
            )
            available = allotted - committed
            if days > available:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Not enough {payload.leave_type.replace('_', ' ')} balance: "
                        f"{available:g} day(s) available, {days:g} requested"
                    ),
                )

    created = await client.insert(
        "leave_requests",
        access_token=actor.access_token,
        values={
            "company_id": str(actor.company_id),
            "employee_id": employee_id,
            "leave_type": payload.leave_type,
            "start_date": payload.start_date.isoformat(),
            "end_date": payload.end_date.isoformat(),
            "day_part": payload.day_part,
            "days": days,
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
            "select": "id,employee_id,leave_type,days,status,employee:employees(manager_employee_id)",
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

        # Re-check balance at approval — other requests may have been approved
        # since this one was created.
        if payload.action == "approve" and request["leave_type"] in BALANCE_TRACKED:
            allotted = await _allotted_for(
                client,
                actor,
                employee_id=str(request["employee_id"]),
                leave_type=request["leave_type"],
            )
            if allotted is not None:
                already_approved = await _committed_days(
                    client,
                    actor,
                    employee_id=str(request["employee_id"]),
                    leave_type=request["leave_type"],
                    statuses="(approved)",
                    exclude_request_id=str(request_id),
                )
                if already_approved + float(request["days"]) > allotted:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"Approving this exceeds the {request['leave_type'].replace('_', ' ')} "
                            f"allowance ({allotted:g} day(s)); {already_approved:g} already approved"
                        ),
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
    committed = await client.select(
        "leave_requests",
        access_token=actor.access_token,
        params={
            "select": "leave_type,days,status",
            "company_id": f"eq.{actor.company_id}",
            "employee_id": f"eq.{target}",
            "status": f"in.{COMMITTING_STATUSES}",
        },
    )

    allotted_by_type = {row["leave_type"]: float(row["allotted_days"]) for row in allowances}
    used_by_type: dict[str, float] = {}
    pending_by_type: dict[str, float] = {}
    for row in committed:
        bucket = used_by_type if row["status"] == "approved" else pending_by_type
        bucket[row["leave_type"]] = bucket.get(row["leave_type"], 0.0) + float(row["days"])

    balances = []
    for leave_type in LEAVE_TYPES:
        allotted = allotted_by_type.get(leave_type, 0.0)
        used = used_by_type.get(leave_type, 0.0)
        pending = pending_by_type.get(leave_type, 0.0)
        available = allotted - used - pending
        balances.append(
            {
                "leave_type": leave_type,
                "allotted": allotted,
                "used": round(used, 1),
                "pending": round(pending, 1),
                "available": round(available, 1),
                # Backwards-compatible: remaining now reflects bookable balance.
                "remaining": round(available, 1),
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


# ---------- Company holidays ----------


class HolidayCreate(BaseModel):
    holiday_date: date
    name: str = Field(min_length=1, max_length=120)


class HolidayImport(BaseModel):
    year: int = Field(ge=2020, le=2100)


@router.get("/holidays")
async def list_holidays(
    year: int | None = Query(default=None, ge=2020, le=2100),
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> dict[str, Any]:
    params: dict[str, str | int] = {
        "select": "id,holiday_date,name",
        "company_id": f"eq.{actor.company_id}",
        "order": "holiday_date.asc",
    }
    if year is not None:
        params["and"] = f"(holiday_date.gte.{year}-01-01,holiday_date.lte.{year}-12-31)"
    try:
        rows = await client.select("company_holidays", access_token=actor.access_token, params=params)
    except HTTPException:
        # Degrade gracefully when the company_holidays table is not yet available
        # (migration not applied) so the rest of Leave keeps working.
        return {"holidays": [], "available": False}
    return {"holidays": rows, "available": True}


@router.post("/holidays", status_code=status.HTTP_201_CREATED)
async def add_holiday(
    payload: HolidayCreate,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> dict[str, Any]:
    require_company_admin(actor, actor.company_id)
    rows = await client.upsert(
        "company_holidays",
        access_token=actor.access_token,
        values=[
            {
                "company_id": str(actor.company_id),
                "holiday_date": payload.holiday_date.isoformat(),
                "name": payload.name,
            }
        ],
        on_conflict="company_id,holiday_date",
    )
    return {"holiday": rows[0] if rows else None}


@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_holiday(
    holiday_id: UUID,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> None:
    require_company_admin(actor, actor.company_id)
    await client.delete(
        "company_holidays",
        access_token=actor.access_token,
        filters={"id": f"eq.{holiday_id}", "company_id": f"eq.{actor.company_id}"},
    )


@router.post("/holidays/import")
async def import_holidays(
    payload: HolidayImport,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> dict[str, Any]:
    require_company_admin(actor, actor.company_id)
    entries = SA_HOLIDAYS.get(payload.year)
    if not entries:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No built-in South African holiday set for {payload.year}",
        )
    values = [
        {
            "company_id": str(actor.company_id),
            "holiday_date": holiday_date,
            "name": name,
        }
        for holiday_date, name in entries
    ]
    rows = await client.upsert(
        "company_holidays",
        access_token=actor.access_token,
        values=values,
        on_conflict="company_id,holiday_date",
    )
    return {"imported": len(rows), "holidays": rows}
