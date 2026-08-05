from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.api.v1 import (
    area_route,
    auth_route,
    control_route,
    malfunction_route,
    print_layout_route,
    round_group_route,
    shift_route,
    user_route,
)

api_router = APIRouter(prefix="/api")
# Вход/выход доступны без аутентификации, всё остальное — только с ней
api_router.include_router(auth_route.router)

_protected = APIRouter(dependencies=[Depends(get_current_user)])
_protected.include_router(control_route.router)
_protected.include_router(malfunction_route.router)
_protected.include_router(area_route.router)
_protected.include_router(print_layout_route.router)
_protected.include_router(round_group_route.router)
_protected.include_router(shift_route.router)
_protected.include_router(user_route.router)
api_router.include_router(_protected)
