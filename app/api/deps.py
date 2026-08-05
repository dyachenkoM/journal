"""Внедрение зависимостей: сессия БД на запрос и сервисы поверх неё."""
from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import SESSION_COOKIE
from app.db.session import SessionLocal
from app.repositories.area_repository import AreaRepository
from app.repositories.control_repository import ControlRepository
from app.repositories.malfunction_repository import MalfunctionRepository
from app.repositories.print_layout_repository import PrintLayoutRepository
from app.repositories.round_group_repository import RoundGroupRepository
from app.repositories.shift_repository import ShiftRepository
from app.repositories.user_repository import UserRepository
from app.services.area_service import AreaService
from app.services.auth_service import AuthService
from app.services.control_service import ControlService
from app.services.malfunction_service import MalfunctionService
from app.services.print_layout_service import PrintLayoutService
from app.services.round_group_service import RoundGroupService
from app.services.shift_service import ShiftService
from app.services.user_service import UserService


def get_db() -> Generator[Session, None, None]:
    """Одна сессия на запрос: коммит при успехе, откат при ошибке."""
    with SessionLocal.begin() as session:
        yield session


DbSession = Annotated[Session, Depends(get_db)]


def get_control_service(session: DbSession) -> ControlService:
    return ControlService(ControlRepository(session))


def get_malfunction_service(session: DbSession) -> MalfunctionService:
    return MalfunctionService(MalfunctionRepository(session))


def get_area_service(session: DbSession) -> AreaService:
    return AreaService(AreaRepository(session))


def get_round_group_service(session: DbSession) -> RoundGroupService:
    return RoundGroupService(RoundGroupRepository(session))


def get_print_layout_service(session: DbSession) -> PrintLayoutService:
    return PrintLayoutService(PrintLayoutRepository(session))


def get_shift_service(session: DbSession) -> ShiftService:
    return ShiftService(ShiftRepository(session))


def get_auth_service(session: DbSession) -> AuthService:
    return AuthService(UserRepository(session))


def get_user_service(session: DbSession) -> UserService:
    return UserService(UserRepository(session))


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_current_user(request: Request, service: AuthServiceDep) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    user = service.user_by_token(token) if token else None
    if user is None:
        raise HTTPException(401, "Требуется вход")
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> dict:
    if not user["is_admin"]:
        raise HTTPException(403, "Доступно только администраторам")
    return user


AdminUser = Annotated[dict, Depends(require_admin)]


ControlServiceDep = Annotated[ControlService, Depends(get_control_service)]
MalfunctionServiceDep = Annotated[MalfunctionService, Depends(get_malfunction_service)]
AreaServiceDep = Annotated[AreaService, Depends(get_area_service)]
RoundGroupServiceDep = Annotated[RoundGroupService, Depends(get_round_group_service)]
PrintLayoutServiceDep = Annotated[PrintLayoutService, Depends(get_print_layout_service)]
ShiftServiceDep = Annotated[ShiftService, Depends(get_shift_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
