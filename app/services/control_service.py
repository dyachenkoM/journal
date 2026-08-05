from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.repositories.control_repository import ControlRepository


class ControlService:
    def __init__(self, repo: ControlRepository) -> None:
        self._repo = repo

    def list_controls(self) -> list[dict]:
        return self._repo.list_all()

    def add_control(self, name: str) -> dict:
        name = name.strip()
        if not name:
            raise HTTPException(400, "Фамилия не может быть пустой")
        try:
            control_id = self._repo.create(name)
        except IntegrityError:
            raise HTTPException(409, "Такой дежурный уже есть")
        return {"id": control_id, "name": name}

    def delete_control(self, control_id: int) -> None:
        if not self._repo.delete(control_id):
            raise HTTPException(404, "Дежурный не найден")
