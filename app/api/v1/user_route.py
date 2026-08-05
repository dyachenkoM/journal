from fastapi import APIRouter

from app.api.deps import AdminUser, UserServiceDep
from app.schemas.auth_schema import PasswordIn, RoleIn, UserIn

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
def list_users(service: UserServiceDep, _admin: AdminUser) -> list[dict]:
    return service.list_users()


@router.post("")
def add_user(user: UserIn, service: UserServiceDep, _admin: AdminUser) -> dict:
    return service.add_user(user.username, user.password, user.is_admin)


@router.put("/{user_id}/password")
def set_password(
    user_id: int, data: PasswordIn, service: UserServiceDep, _admin: AdminUser
) -> dict:
    service.set_password(user_id, data.password)
    return {"status": "ok"}


@router.put("/{user_id}/role")
def set_role(
    user_id: int, data: RoleIn, service: UserServiceDep, _admin: AdminUser
) -> dict:
    service.set_role(user_id, data.is_admin)
    return {"status": "ok"}


@router.delete("/{user_id}")
def delete_user(user_id: int, service: UserServiceDep, admin: AdminUser) -> dict:
    service.delete_user(user_id, acting_user_id=admin["id"])
    return {"status": "ok"}
