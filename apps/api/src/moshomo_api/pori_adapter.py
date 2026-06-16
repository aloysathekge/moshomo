from typing import Any


class PoriWorkforceAdapter:
    """Boundary for adapting Pori into Moshomo workforce workflows."""

    async def answer_workforce_question(self, question: str) -> dict[str, Any]:
        return {
            "mode": "placeholder",
            "question": question,
            "answer": "Pori workforce integration is not connected yet.",
            "next_step": "Map Moshomo workforce data and tools before enabling actions.",
        }


pori_workforce_adapter = PoriWorkforceAdapter()
