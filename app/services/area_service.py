from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.repositories.area_repository import AreaRepository
from app.schemas.area_schema import EquipmentIn


class AreaService:
    def __init__(self, repo: AreaRepository) -> None:
        self._repo = repo

    def list_areas(self) -> list[dict]:
        return self._repo.list_with_equipment()

    def add_area(self, name: str) -> dict:
        name = name.strip()
        if not name:
            raise HTTPException(400, "Название участка не может быть пустым")
        try:
            area_id = self._repo.create(name)
        except IntegrityError:
            raise HTTPException(409, "Такой участок уже есть")
        return {"id": area_id, "name": name, "equipment": []}

    def delete_area(self, area_id: int) -> None:
        if not self._repo.delete(area_id):
            raise HTTPException(404, "Участок не найден")

    def add_equipment(self, area_id: int, unit: EquipmentIn) -> dict:
        name = unit.name.strip()
        description = unit.description.strip()
        if not name:
            raise HTTPException(400, "Название оборудования не может быть пустым")
        if not self._repo.exists(area_id):
            raise HTTPException(404, "Участок не найден")
        try:
            unit_id = self._repo.add_equipment(area_id, name, description)
        except IntegrityError:
            raise HTTPException(409, "Такое оборудование на участке уже есть")
        return {"id": unit_id, "name": name, "description": description}

    def set_equipment_description(self, unit_id: int, description: str) -> None:
        if not self._repo.set_equipment_description(unit_id, description.strip()):
            raise HTTPException(404, "Оборудование не найдено")

    def delete_equipment(self, unit_id: int) -> None:
        if not self._repo.delete_equipment(unit_id):
            raise HTTPException(404, "Оборудование не найдено")
