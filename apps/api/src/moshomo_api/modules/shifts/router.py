from __future__ import annotations

from datetime import date, datetime, time
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from moshomo_api.context import (
    ActorContext,
    get_actor_context,
    require_company_admin_or_manager,
)
from moshomo_api.modules.shifts.models import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    AvailabilityResponse,
    AvailabilitySet,
    TemplateCreate,
    TemplateResponse,
    TemplateUpdate,
)
from moshomo_api.supabase import SupabaseRestClient, get_supabase_rest_client

router = APIRouter(prefix="/workforce/shifts", tags=["shifts"])

TEMPLATE_SELECT = "id,company_id,name,start_time,end_time,color,created_at,updated_at"
ASSIGNMENT_SELECT = (
    "id,company_id,template_id,employee_id,shift_date,start_time,end_time,status,notes,"
    "created_at,updated_at,employee:employees(first_name,last_name,manager_employee_id),"
    "template:shift_templates(name)"
)


def _serialize(values: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in values.items():
        if isinstance(value, (time, date, datetime)):
            out[key] = value.isoformat()
        elif isinstance(value, UUID):
            out[key] = str(value)
        else:
            out[key] = value
    return out


# --------------------------------------------------------------------------- templates
@router.post("/templates", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateCreate,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> TemplateResponse:
    require_company_admin_or_manager(actor, actor.company_id)
    created = await client.insert(
        "shift_templates",
        access_token=actor.access_token,
        values={
            "company_id": str(actor.company_id),
            "name": payload.name.strip(),
            "start_time": payload.start_time.isoformat(),
            "end_time": payload.end_time.isoformat(),
            "color": payload.color,
        },
    )
    return TemplateResponse.model_validate(created)


@router.get("/templates", response_model=list[TemplateResponse])
async def list_templates(
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> list[TemplateResponse]:
    rows = await client.select(
        "shift_templates",
        access_token=actor.access_token,
        params={"select": TEMPLATE_SELECT, "company_id": f"eq.{actor.company_id}", "order": "name.asc"},
    )
    return [TemplateResponse.model_validate(row) for row in rows]


@router.patch("/templates/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    payload: TemplateUpdate,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> TemplateResponse:
    require_company_admin_or_manager(actor, actor.company_id)
    values = _serialize(payload.model_dump(exclude_unset=True))
    if not values:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No fields to update")
    updated = await client.update(
        "shift_templates",
        access_token=actor.access_token,
        filters={"id": f"eq.{template_id}", "company_id": f"eq.{actor.company_id}"},
        values=values,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return TemplateResponse.model_validate(updated[0])


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: UUID,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> None:
    require_company_admin_or_manager(actor, actor.company_id)
    await client.delete(
        "shift_templates",
        access_token=actor.access_token,
        filters={"id": f"eq.{template_id}", "company_id": f"eq.{actor.company_id}"},
    )


# ------------------------------------------------------------------------- assignments
@router.post("/assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    payload: AssignmentCreate,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> AssignmentResponse:
    require_company_admin_or_manager(actor, actor.company_id)
    template = await client.select(
        "shift_templates",
        access_token=actor.access_token,
        params={
            "select": "id,start_time,end_time",
            "id": f"eq.{payload.template_id}",
            "company_id": f"eq.{actor.company_id}",
            "limit": 1,
        },
    )
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift template not found")
    start_time = payload.start_time.isoformat() if payload.start_time else template[0]["start_time"]
    end_time = payload.end_time.isoformat() if payload.end_time else template[0]["end_time"]

    created = await client.insert(
        "shift_assignments",
        access_token=actor.access_token,
        values={
            "company_id": str(actor.company_id),
            "template_id": str(payload.template_id),
            "employee_id": str(payload.employee_id) if payload.employee_id else None,
            "shift_date": payload.shift_date.isoformat(),
            "start_time": start_time,
            "end_time": end_time,
            "status": "scheduled",
            "notes": payload.notes,
        },
    )
    return AssignmentResponse.model_validate(created)


@router.get("/assignments", response_model=list[AssignmentResponse])
async def list_assignments(
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    mine: bool = False,
    open_only: bool = Query(default=False, alias="open"),
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> list[AssignmentResponse]:
    params: dict[str, str | int] = {
        "select": ASSIGNMENT_SELECT,
        "company_id": f"eq.{actor.company_id}",
        "order": "shift_date.asc,start_time.asc",
        "limit": 500,
    }
    date_clauses: list[str] = []
    if date_from is not None:
        date_clauses.append(f"shift_date.gte.{date_from.isoformat()}")
    if date_to is not None:
        date_clauses.append(f"shift_date.lte.{date_to.isoformat()}")
    if date_clauses:
        params["and"] = "(" + ",".join(date_clauses) + ")"
    if mine:
        if actor.employee_id is None:
            return []
        params["employee_id"] = f"eq.{actor.employee_id}"
    if open_only:
        params["employee_id"] = "is.null"

    rows = await client.select("shift_assignments", access_token=actor.access_token, params=params)
    return [AssignmentResponse.model_validate(row) for row in rows]


@router.patch("/assignments/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    assignment_id: UUID,
    payload: AssignmentUpdate,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> AssignmentResponse:
    require_company_admin_or_manager(actor, actor.company_id)
    values = _serialize(payload.model_dump(exclude_unset=True))
    if not values:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No fields to update")
    updated = await client.update(
        "shift_assignments",
        access_token=actor.access_token,
        filters={"id": f"eq.{assignment_id}", "company_id": f"eq.{actor.company_id}"},
        values=values,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
    return AssignmentResponse.model_validate(updated[0])


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: UUID,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> None:
    require_company_admin_or_manager(actor, actor.company_id)
    await client.delete(
        "shift_assignments",
        access_token=actor.access_token,
        filters={"id": f"eq.{assignment_id}", "company_id": f"eq.{actor.company_id}"},
    )


# ------------------------------------------------------------------------ availability
@router.get("/availability", response_model=list[AvailabilityResponse])
async def get_availability(
    employee_id: UUID | None = Query(default=None),
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> list[AvailabilityResponse]:
    target = str(employee_id) if employee_id else (str(actor.employee_id) if actor.employee_id else None)
    if target is None:
        return []
    rows = await client.select(
        "employee_availability",
        access_token=actor.access_token,
        params={
            "select": "id,employee_id,weekday,start_time,end_time",
            "company_id": f"eq.{actor.company_id}",
            "employee_id": f"eq.{target}",
            "order": "weekday.asc,start_time.asc",
        },
    )
    return [AvailabilityResponse.model_validate(row) for row in rows]


@router.put("/availability/{employee_id}")
async def set_availability(
    employee_id: UUID,
    payload: AvailabilitySet,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> dict[str, Any]:
    if str(employee_id) != str(actor.employee_id) and actor.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only set your own availability",
        )
    await client.delete(
        "employee_availability",
        access_token=actor.access_token,
        filters={"company_id": f"eq.{actor.company_id}", "employee_id": f"eq.{employee_id}"},
    )
    saved: list[AvailabilityResponse] = []
    for window in payload.windows:
        row = await client.insert(
            "employee_availability",
            access_token=actor.access_token,
            values={
                "company_id": str(actor.company_id),
                "employee_id": str(employee_id),
                "weekday": window.weekday,
                "start_time": window.start_time.isoformat(),
                "end_time": window.end_time.isoformat(),
            },
        )
        saved.append(AvailabilityResponse.model_validate(row))
    return {"employee_id": str(employee_id), "availability": saved}
