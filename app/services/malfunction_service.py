import re

from fastapi import HTTPException

from app.repositories.malfunction_repository import MalfunctionRepository
from app.schemas.malfunction_schema import MalfunctionIn, MalfunctionResolveIn

PLANTS = ("Dry", "Wet", "Utl")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class MalfunctionService:
    def __init__(self, repo: MalfunctionRepository) -> None:
        self._repo = repo

    def list_malfunctions(self) -> list[dict]:
        return self._repo.list_all()

    def add_malfunction(self, malfunction: MalfunctionIn) -> dict:
        data = {
            "date": malfunction.date.strip(),
            "plant": malfunction.plant.strip(),
            "area": malfunction.area.strip(),
            "description": malfunction.description.strip(),
            "author": malfunction.author.strip(),
        }
        if not _DATE_RE.match(data["date"]):
            raise HTTPException(400, "Укажите дату неисправности")
        if data["plant"] not in PLANTS:
            raise HTTPException(400, "Завод должен быть Dry, Wet или Utl")
        if not data["description"]:
            raise HTTPException(400, "Описание не может быть пустым")
        malfunction_id = self._repo.create(data)
        return {"id": malfunction_id, **data, "status": "open", "resolved_by": ""}

    def resolve_malfunction(self, malfunction_id: int, payload: MalfunctionResolveIn) -> None:
        resolved_by = payload.resolved_by.strip()
        if not resolved_by:
            raise HTTPException(400, "Укажите, кто выполнил работу")
        if not self._repo.resolve(malfunction_id, resolved_by):
            raise HTTPException(404, "Неисправность не найдена")

    def delete_malfunction(self, malfunction_id: int) -> None:
        if not self._repo.delete(malfunction_id):
            raise HTTPException(404, "Неисправность не найдена")
