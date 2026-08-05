from fastapi import APIRouter

from app.api.deps import AdminUser, ControlServiceDep
from app.schemas.control_schema import ControlIn

router = APIRouter(prefix="/controls", tags=["controls"])


@router.get("")
def list_controls(service: ControlServiceDep) -> list[dict]:
    return service.list_controls()


@router.post("")
def add_control(control: ControlIn, service: ControlServiceDep, _admin: AdminUser) -> dict:
    return service.add_control(control.name)


@router.delete("/{control_id}")
def delete_control(control_id: int, service: ControlServiceDep, _admin: AdminUser) -> dict:
    service.delete_control(control_id)
    return {"status": "ok"}
