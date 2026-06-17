from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict

from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.supabase import SupabaseRestClient, get_supabase_rest_client

router = APIRouter(prefix="/workforce/employees", tags=["employees"])

EmployeeStatus = Literal["active", "suspended", "terminated", "resigned"]
SearchQuery = Annotated[
    str | None,
    Query(
        min_length=1,
        max_length=100,
        pattern=r"^[\w @.'-]+$",
        description="Name, employee number, or email search",
    ),
]


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    company_id: UUID
    profile_id: UUID | None = None
    department_id: UUID | None = None
    manager_employee_id: UUID | None = None
    employee_number: str
    first_name: str
    last_name: str
    email: str | None = None
    phone_number: str | None = None
    job_title: str | None = None
    employment_type: str | None = None
    start_date: date | None = None
    status: EmployeeStatus
    created_at: datetime
    updated_at: datetime


EMPLOYEE_SELECT = ",".join(EmployeeResponse.model_fields)


@router.get("", response_model=list[EmployeeResponse])
async def list_employees(
    query: SearchQuery = None,
    department_id: UUID | None = None,
    employee_status: EmployeeStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> list[EmployeeResponse]:
    params: dict[str, str | int] = {
        "select": EMPLOYEE_SELECT,
        "company_id": f"eq.{actor.company_id}",
        "order": "last_name.asc,first_name.asc",
        "limit": limit,
    }
    if department_id is not None:
        params["department_id"] = f"eq.{department_id}"
    if employee_status is not None:
        params["status"] = f"eq.{employee_status}"
    if query is not None:
        params["or"] = (
            f"(first_name.ilike.*{query}*,last_name.ilike.*{query}*,"
            f"employee_number.ilike.*{query}*,email.ilike.*{query}*)"
        )

    rows = await client.select(
        "employees",
        access_token=actor.access_token,
        params=params,
    )
    return [EmployeeResponse.model_validate(row) for row in rows]


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: UUID,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> EmployeeResponse:
    rows = await client.select(
        "employees",
        access_token=actor.access_token,
        params={
            "select": EMPLOYEE_SELECT,
            "id": f"eq.{employee_id}",
            "company_id": f"eq.{actor.company_id}",
            "limit": 1,
        },
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )
    return EmployeeResponse.model_validate(rows[0])
