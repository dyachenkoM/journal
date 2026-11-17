"""Точка входа FastAPI-приложения."""
import logging
import time
from contextlib import asynccontextmanager

from app.core.log_config import setup_logging

setup_logging("app")

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, Response  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from app.api.v1 import api_router  # noqa: E402
from app.core.config import APP_TITLE, STATIC_DIR  # noqa: E402
from app.db.base import init_db  # noqa: E402

log = logging.getLogger("app")
request_log = logging.getLogger("app.request")

# Запросы к статике не логируем — их много и они неинтересны
_QUIET_PREFIXES = ("/static/", "/favicon.ico")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    log.info("Приложение запущено")
    yield
    log.info("Приложение остановлено")


app = FastAPI(title=APP_TITLE, lifespan=lifespan)
app.include_router(api_router)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Журнал запросов: метод, путь, статус, время, пользователь, IP клиента."""
    start = time.perf_counter()
    error: Exception | None = None
    try:
        response = await call_next(request)
    except Exception as exc:
        error = exc
        response = None
        status = 500
    else:
        status = response.status_code
    elapsed_ms = (time.perf_counter() - start) * 1000

    path = request.url.path
    if response is not None and path.startswith(_QUIET_PREFIXES) and status < 400:
        return response

    user = getattr(request.state, "user", None)
    username = user["username"] if user else "-"
    # За nginx реальный адрес клиента приходит в X-Real-IP
    client = request.headers.get("x-real-ip") or (request.client.host if request.client else "-")
    query = f"?{request.url.query}" if request.url.query else ""
    message = "%s %s%s -> %d (%.0f мс) user=%s ip=%s"
    args = (request.method, path, query, status, elapsed_ms, username, client)

    if response is None:
        request_log.error(message, *args, exc_info=error)
        return JSONResponse({"detail": "Внутренняя ошибка сервера"}, status_code=500)
    level = logging.WARNING if status >= 500 else logging.INFO
    request_log.log(level, message, *args)
    return response


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
