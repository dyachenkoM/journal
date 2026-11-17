from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.deps import AdminUser
from app.core.config import LOG_DIR
from app.services.log_service import LogService

router = APIRouter(prefix="/logs", tags=["logs"])


def get_log_service() -> LogService:
    return LogService(LOG_DIR)


LogServiceDep = Annotated[LogService, Depends(get_log_service)]


@router.get("")
def list_logs(service: LogServiceDep, _admin: AdminUser) -> list[dict]:
    return service.list_files()


@router.get("/{name}")
def read_log(
    name: str,
    service: LogServiceDep,
    _admin: AdminUser,
    limit: int = 500,
    level: str = "",
    query: str = "",
) -> dict:
    """Последние записи файла (свежие первыми) с фильтром по уровню и слову."""
    return service.read(name, limit, level, query)


@router.get("/{name}/download")
def download_log(name: str, service: LogServiceDep, _admin: AdminUser) -> Response:
    # Отдаём снимок файла целиком: FileResponse стримит по размеру на момент
    # запроса, а в лог тем временем дописываются строки (в т.ч. об этом запросе)
    return Response(
        service.file_path(name).read_bytes(),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
