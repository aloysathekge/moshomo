from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.entitlements import require_app_enabled
from moshomo_api.supabase import SupabaseRestClient, get_supabase_rest_client
from moshomo_ai.llm.base import LLMClient
from moshomo_ai.llm.factory import get_llm_client
from moshomo_ai.runs import run_workforce_assistant

router = APIRouter(
    prefix="/workforce",
    tags=["workforce"],
    dependencies=[Depends(require_app_enabled("assistant"))],
)


class ConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class WorkforceQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    # Prior turns for conversation context, oldest first, excluding this question.
    history: list[ConversationTurn] = Field(default_factory=list, max_length=20)


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
        history=[turn.model_dump() for turn in payload.history],
    )
