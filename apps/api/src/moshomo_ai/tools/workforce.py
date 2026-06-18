from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from moshomo_ai.context import RunContext
from moshomo_ai.tools.registry import workforce_registry
from moshomo_api.routers.employees import EMPLOYEE_SELECT

EmployeeStatus = Literal["active", "suspended", "terminated", "resigned"]
KNOWLEDGE_SELECT = "id,title,content,source_type,tags,sensitivity,updated_at"


def _employee_summary(row: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "id",
        "first_name",
        "last_name",
        "email",
        "employee_number",
        "job_title",
        "department_id",
        "employment_type",
        "status",
    )
    return {key: row.get(key) for key in keys}


class SearchEmployeesParams(BaseModel):
    query: str | None = Field(
        default=None, description="Name, employee number, or email to search for."
    )
    department_id: str | None = Field(default=None, description="Filter to a department id.")
    status: EmployeeStatus | None = Field(default=None, description="Filter by employment status.")
    limit: int = Field(default=25, ge=1, le=50)


@workforce_registry.register(
    name="search_employees",
    description=(
        "Search employees the current user is allowed to see. Returns summaries "
        "(name, number, title, department, status). Use for 'who is on my team' "
        "or finding a person."
    ),
    param_model=SearchEmployeesParams,
)
async def search_employees(params: SearchEmployeesParams, context: RunContext) -> dict[str, Any]:
    query: dict[str, str | int] = {
        "select": EMPLOYEE_SELECT,
        "company_id": f"eq.{context.company_id}",
        "order": "last_name.asc,first_name.asc",
        "limit": params.limit,
    }
    if params.department_id:
        query["department_id"] = f"eq.{params.department_id}"
    if params.status:
        query["status"] = f"eq.{params.status}"
    if params.query:
        term = params.query
        query["or"] = (
            f"(first_name.ilike.*{term}*,last_name.ilike.*{term}*,"
            f"employee_number.ilike.*{term}*,email.ilike.*{term}*)"
        )

    rows = await context.rest.select(
        "employees", access_token=context.access_token, params=query
    )
    summaries = [_employee_summary(row) for row in rows]
    for row in rows:
        context.cite("employees", row["id"], f"{row.get('first_name')} {row.get('last_name')}".strip())
    return {"count": len(summaries), "employees": summaries}


class GetEmployeeProfileParams(BaseModel):
    employee_id: str = Field(description="The employee id to look up.")


@workforce_registry.register(
    name="get_employee_profile",
    description=(
        "Get one employee's profile by id, if the current user is allowed to see "
        "it. Returns 'not found or not permitted' otherwise."
    ),
    param_model=GetEmployeeProfileParams,
)
async def get_employee_profile(
    params: GetEmployeeProfileParams, context: RunContext
) -> dict[str, Any]:
    rows = await context.rest.select(
        "employees",
        access_token=context.access_token,
        params={
            "select": EMPLOYEE_SELECT,
            "id": f"eq.{params.employee_id}",
            "company_id": f"eq.{context.company_id}",
            "limit": 1,
        },
    )
    if not rows:
        return {"found": False, "reason": "Employee not found or not permitted."}
    context.cite(
        "employees",
        rows[0]["id"],
        f"{rows[0].get('first_name')} {rows[0].get('last_name')}".strip(),
    )
    return {"found": True, "employee": rows[0]}


class GetCompanyKnowledgeParams(BaseModel):
    query: str = Field(description="What to look up in company knowledge / policies.")
    tags: list[str] | None = Field(default=None, description="Optional tags to filter by.")


@workforce_registry.register(
    name="get_company_knowledge",
    description=(
        "Search the company knowledge base (policies, procedures, notes) the "
        "current user is allowed to read. Use to ground policy questions."
    ),
    param_model=GetCompanyKnowledgeParams,
)
async def get_company_knowledge(
    params: GetCompanyKnowledgeParams, context: RunContext
) -> dict[str, Any]:
    query: dict[str, str | int] = {
        "select": KNOWLEDGE_SELECT,
        "company_id": f"eq.{context.company_id}",
        "order": "updated_at.desc",
        "limit": 5,
        "or": f"(title.ilike.*{params.query}*,content.ilike.*{params.query}*)",
    }
    if params.tags:
        query["tags"] = "ov.{" + ",".join(params.tags) + "}"

    rows = await context.rest.select(
        "company_knowledge_entries", access_token=context.access_token, params=query
    )
    entries = []
    for row in rows:
        content = row.get("content") or ""
        entries.append(
            {
                "id": row.get("id"),
                "title": row.get("title"),
                "content": content[:600],
                "tags": row.get("tags"),
                "sensitivity": row.get("sensitivity"),
            }
        )
        context.cite("company_knowledge_entries", row["id"], row.get("title"))
    return {"count": len(entries), "entries": entries}
