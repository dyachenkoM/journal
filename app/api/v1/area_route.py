from fastapi import APIRouter

from app.api.deps import AdminUser, AreaServiceDep
from app.schemas.area_schema import AreaIn, EquipmentDescriptionIn, EquipmentIn

router = APIRouter(tags=["areas"])


@router.get("/areas")
def list_areas(service: AreaServiceDep) -> list[dict]:
    """Справочник участков с их оборудованием."""
    return service.list_areas()


@router.post("/areas")
def add_area(area: AreaIn, service: AreaServiceDep, _admin: AdminUser) -> dict:
    return service.add_area(area.name)


@router.delete("/areas/{area_id}")
def delete_area(area_id: int, service: AreaServiceDep, _admin: AdminUser) -> dict:
    service.delete_area(area_id)
    return {"status": "ok"}


@router.post("/areas/{area_id}/equipment")
def add_equipment(
    area_id: int, unit: EquipmentIn, service: AreaServiceDep, _admin: AdminUser
) -> dict:
    return service.add_equipment(area_id, unit)


@router.put("/equipment/{unit_id}/description")
def set_equipment_description(
    unit_id: int, body: EquipmentDescriptionIn, service: AreaServiceDep, _admin: AdminUser
) -> dict:
    service.set_equipment_description(unit_id, body.description)
    return {"status": "ok"}


@router.delete("/equipment/{unit_id}")
def delete_equipment(unit_id: int, service: AreaServiceDep, _admin: AdminUser) -> dict:
    service.delete_equipment(unit_id)
    return {"status": "ok"}
