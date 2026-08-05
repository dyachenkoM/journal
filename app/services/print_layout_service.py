import json

from fastapi import HTTPException

from app.repositories.print_layout_repository import PrintLayoutRepository


class PrintLayoutService:
    def __init__(self, repo: PrintLayoutRepository) -> None:
        self._repo = repo

    def get_layout(self) -> dict | None:
        """None — макет ещё не сохранялся (клиент использует умолчание)."""
        data = self._repo.get()
        if data is None:
            return None
        try:
            return json.loads(data)
        except ValueError:
            return None

    def save_layout(self, layout: dict) -> None:
        if not layout:
            raise HTTPException(400, "Макет не может быть пустым")
        self._repo.set(json.dumps(layout, ensure_ascii=False))

    def delete_layout(self) -> None:
        self._repo.delete()
