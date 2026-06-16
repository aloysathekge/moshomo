from pydantic import BaseModel, Field
from fastapi import APIRouter

from moshomo_api.pori_adapter import pori_workforce_adapter

router = APIRouter(prefix="/workforce", tags=["workforce"])


class WorkforceQuestion(BaseModel):
    question: str = Field(min_length=1)


@router.post("/assistant")
async def ask_workforce_assistant(payload: WorkforceQuestion) -> dict[str, object]:
    return await pori_workforce_adapter.answer_workforce_question(payload.question)
