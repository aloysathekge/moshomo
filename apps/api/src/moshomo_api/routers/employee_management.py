from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from moshomo_api.context import ActorContext, get_actor_context, require_company_admin
from moshomo_api.routers.employees import EMPLOYEE_SELECT, EmployeeResponse, EmployeeStatus
from moshomo_api.supabase import SupabaseRestClient, get_supabase_rest_client

router = APIRouter(prefix="/companies/{company_id}/employees", tags=["employee-management"])

CompanyRole = Literal["admin", "manager", "employee"]
DocumentType = Literal["contract", "id", "certification", "other"]


class EmployeeUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    department_id: UUID | None = None
    manager_employee_id: UUID | None = None
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    phone_number: str | None = Field(default=None, max_length=40)
    job_title: str | None = Field(default=None, max_length=120)
    employment_type: str | None = Field(default=None, max_length=80)
    status: EmployeeStatus | None = None


class RoleChangeRequest(BaseModel):
    role: CompanyRole


class RoleChangeResponse(BaseModel):
    employee_id: UUID
    role: CompanyRole


class DocumentCreateRequest(BaseModel):
    storage_path: str = Field(min_length=1, max_length=300)
    file_name: str = Field(min_length=1, max_length=200)
    doc_type: DocumentType = "other"
    content_type: str | None = Field(default=None, max_length=120)
    size_bytes: int | None = Field(default=None, ge=0)


class DocumentResponse(BaseModel):
    id: UUID
    company_id: UUID
    employee_id: UUID
    storage_path: str
    file_name: str
    doc_type: DocumentType
    content_type: str | None = None
    size_bytes: int | None = None
    created_at: datetime


DOCUMENT_SELECT = ",".join(DocumentResponse.model_fields)


async def _load_employee(
    client: SupabaseRestClient,
    *,
    access_token: str,
    company_id: UUID,
    employee_id: UUID,
    select: str,
) -> dict[str, Any]:
    rows = await client.select(
        "employees",
        access_token=access_token,
        params={
            "select": select,
            "id": f"eq.{employee_id}",
            "company_id": f"eq.{company_id}",
            "limit": 1,
        },
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )
    return rows[0]


@router.patch("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    company_id: UUID,
    employee_id: UUID,
    payload: EmployeeUpdateRequest,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> EmployeeResponse:
    require_company_admin(actor, company_id)
    provided = payload.model_dump(exclude_unset=True)
    if not provided:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No fields provided to update",
        )

    values: dict[str, Any] = {}
    for key, value in provided.items():
        if isinstance(value, UUID):
            values[key] = str(value)
        elif isinstance(value, str):
            values[key] = value.strip() or None
        else:
            values[key] = value

    updated = await client.update(
        "employees",
        access_token=actor.access_token,
        filters={"id": f"eq.{employee_id}", "company_id": f"eq.{company_id}"},
        values=values,
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )
    refreshed = await _load_employee(
        client,
        access_token=actor.access_token,
        company_id=company_id,
        employee_id=employee_id,
        select=EMPLOYEE_SELECT,
    )
    return EmployeeResponse.model_validate(refreshed)


@router.patch("/{employee_id}/role", response_model=RoleChangeResponse)
async def change_employee_role(
    company_id: UUID,
    employee_id: UUID,
    payload: RoleChangeRequest,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> RoleChangeResponse:
    require_company_admin(actor, company_id)
    employee = await _load_employee(
        client,
        access_token=actor.access_token,
        company_id=company_id,
        employee_id=employee_id,
        select="id,profile_id,email",
    )

    profile_id = employee.get("profile_id")
    if profile_id == str(actor.user_id) and payload.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You cannot change your own role",
        )

    if profile_id:
        await client.update(
            "company_memberships",
            access_token=actor.access_token,
            filters={"company_id": f"eq.{company_id}", "user_id": f"eq.{profile_id}"},
            values={"role": payload.role},
        )

    email = employee.get("email")
    if email:
        await client.update(
            "company_invitations",
            access_token=actor.access_token,
            filters={
                "company_id": f"eq.{company_id}",
                "email": f"eq.{email}",
                "status": "in.(pending,sent)",
            },
            values={"role": payload.role},
        )

    return RoleChangeResponse(employee_id=employee_id, role=payload.role)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_employee(
    company_id: UUID,
    employee_id: UUID,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> None:
    require_company_admin(actor, company_id)
    employee = await _load_employee(
        client,
        access_token=actor.access_token,
        company_id=company_id,
        employee_id=employee_id,
        select="id,profile_id",
    )
    if employee.get("profile_id") == str(actor.user_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You cannot remove your own employee record",
        )
    await client.delete(
        "employees",
        access_token=actor.access_token,
        filters={"id": f"eq.{employee_id}", "company_id": f"eq.{company_id}"},
    )


@router.post(
    "/{employee_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_employee_document(
    company_id: UUID,
    employee_id: UUID,
    payload: DocumentCreateRequest,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> DocumentResponse:
    require_company_admin(actor, company_id)
    expected_prefix = f"{company_id}/{employee_id}/"
    if not payload.storage_path.startswith(expected_prefix):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Document must be stored inside the employee folder",
        )
    await _load_employee(
        client,
        access_token=actor.access_token,
        company_id=company_id,
        employee_id=employee_id,
        select="id",
    )
    created = await client.insert(
        "employee_documents",
        access_token=actor.access_token,
        values={
            "company_id": str(company_id),
            "employee_id": str(employee_id),
            "storage_path": payload.storage_path,
            "file_name": payload.file_name.strip(),
            "doc_type": payload.doc_type,
            "content_type": payload.content_type,
            "size_bytes": payload.size_bytes,
            "uploaded_by": str(actor.user_id),
        },
    )
    return DocumentResponse.model_validate(created)


@router.get("/{employee_id}/documents", response_model=list[DocumentResponse])
async def list_employee_documents(
    company_id: UUID,
    employee_id: UUID,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> list[DocumentResponse]:
    rows = await client.select(
        "employee_documents",
        access_token=actor.access_token,
        params={
            "select": DOCUMENT_SELECT,
            "company_id": f"eq.{company_id}",
            "employee_id": f"eq.{employee_id}",
            "order": "created_at.desc",
        },
    )
    return [DocumentResponse.model_validate(row) for row in rows]


@router.delete(
    "/{employee_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_employee_document(
    company_id: UUID,
    employee_id: UUID,
    document_id: UUID,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> None:
    require_company_admin(actor, company_id)
    await client.delete(
        "employee_documents",
        access_token=actor.access_token,
        filters={
            "id": f"eq.{document_id}",
            "company_id": f"eq.{company_id}",
            "employee_id": f"eq.{employee_id}",
        },
    )
