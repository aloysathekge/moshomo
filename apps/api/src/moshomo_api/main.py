import os

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from moshomo_api.routers.health import router as health_router
from moshomo_api.routers.workforce import router as workforce_router

app = FastAPI(
    title="Moshomo API",
    version="0.1.0",
    description="Backend for Moshomo workforce operations and Pori-assisted workflows.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8081"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(workforce_router)


def run() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "").lower() in {"1", "true", "yes", "y", "on"}
    uvicorn.run("moshomo_api.main:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    run()
