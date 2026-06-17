from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.pori_adapter import pori_workforce_adapter

router = APIRouter(prefix="/workforce", tags=["workforce"])


class WorkforceQuestion(BaseModel):
    question: str = Field(min_length=1)


@router.post("/assistant")
async def ask_workforce_assistant(
    payload: WorkforceQuestion,
    actor: ActorContext = Depends(get_actor_context),
) -> dict[str, object]:
    del actor
    return await pori_workforce_adapter.answer_workforce_question(payload.question)
