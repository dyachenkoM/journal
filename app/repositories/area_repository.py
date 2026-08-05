from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session, selectinload

from app.db.models import Area, EquipmentUnit


class AreaRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_with_equipment(self) -> list[dict]:
        areas = self._session.scalars(
            select(Area).options(selectinload(Area.equipment)).order_by(Area.name)
        )
        return [
            {
                "id": a.id,
                "name": a.name,
                "equipment": [
                    {"id": u.id, "name": u.name, "description": u.description}
                    for u in a.equipment
                ],
            }
            for a in areas
        ]

    def create(self, name: str) -> int:
        area = Area(name=name)
        self._session.add(area)
        self._session.flush()
        return area.id

    def delete(self, area_id: int) -> bool:
        result = self._session.execute(delete(Area).where(Area.id == area_id))
        return result.rowcount > 0

    def exists(self, area_id: int) -> bool:
        return self._session.get(Area, area_id) is not None

    def add_equipment(self, area_id: int, name: str, description: str) -> int:
        unit = EquipmentUnit(area_id=area_id, name=name, description=description)
        self._session.add(unit)
        self._session.flush()
        return unit.id

    def set_equipment_description(self, unit_id: int, description: str) -> bool:
        result = self._session.execute(
            update(EquipmentUnit)
            .where(EquipmentUnit.id == unit_id)
            .values(description=description)
        )
        return result.rowcount > 0

    def delete_equipment(self, unit_id: int) -> bool:
        result = self._session.execute(
            delete(EquipmentUnit).where(EquipmentUnit.id == unit_id)
        )
        return result.rowcount > 0
