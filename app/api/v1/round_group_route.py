from fastapi import APIRouter

from app.api.deps import AdminUser, RoundGroupServiceDep
from app.schemas.round_group_schema import RoundGroupIn

router = APIRouter(prefix="/round-groups", tags=["round-groups"])


@router.get("")
def list_round_groups(service: RoundGroupServiceDep) -> list[dict]:
    """Восемь групп обхода: [{"group": 1, "areas": [...]}, ...]."""
    return service.list_groups()


@router.put("/{group_num}")
def save_round_group(
    group_num: int, body: RoundGroupIn, service: RoundGroupServiceDep, _admin: AdminUser
) -> dict:
    """Заменить состав группы обхода целиком."""
    return service.save_group(group_num, body.areas)
