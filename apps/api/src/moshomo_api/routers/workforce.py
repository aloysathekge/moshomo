from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.supabase import SupabaseRestClient, get_supabase_rest_client
from moshomo_ai.llm.base import LLMClient
from moshomo_ai.llm.factory import get_llm_client
from moshomo_ai.runs import run_workforce_assistant

router = APIRouter(prefix="/workforce", tags=["workforce"])


class WorkforceQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


@router.post("/assistant")
async def ask_workforce_assistant(
    payload: WorkforceQuestion,
    actor: ActorContext = Depends(get_actor_context),
    rest: SupabaseRestClient = Depends(get_supabase_rest_client),
    client: LLMClient = Depends(get_llm_client),
) -> dict[str, Any]:
    return await run_workforce_assistant(
        question=payload.question,
        actor=actor,
        rest=rest,
        client=client,
        request_source="api",
    )
