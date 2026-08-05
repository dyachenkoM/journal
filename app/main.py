"""Точка входа FastAPI-приложения."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api.v1 import api_router
from app.core.config import APP_TITLE, STATIC_DIR
from app.db.base import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=APP_TITLE, lifespan=lifespan)
app.include_router(api_router)


@app.middleware("http")
async def no_stale_cache(request, call_next):
    """Браузер обязан проверять свежесть файлов (иначе кэшируются старые версии)."""
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/favicon.ico")
def favicon() -> Response:
    return Response(status_code=204)


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
