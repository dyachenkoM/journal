from fastapi import HTTPException

from app.repositories.shift_repository import ShiftRepository
from app.schemas.shift_schema import ShiftReport


def _check_shift_type(shift_type: str) -> None:
    if shift_type not in ("day", "night"):
        raise HTTPException(400, "shift_type должен быть 'day' или 'night'")


class ShiftService:
    def __init__(self, repo: ShiftRepository) -> None:
        self._repo = repo

    def calendar(self, year: int) -> dict[str, list[str]]:
        """Даты года, по которым есть смены: {"YYYY-MM-DD": ["day", "night"]}."""
        result: dict[str, list[str]] = {}
        for date, shift_type in self._repo.dates_with_shifts(year):
            result.setdefault(date, []).append(shift_type)
        return result

    def get_shift(self, date: str, shift_type: str) -> dict:
        _check_shift_type(shift_type)
        shift = self._repo.get(date, shift_type)
        if shift is None:
            raise HTTPException(404, "Смена не найдена")
        return shift

    def search_incidents(
        self,
        date_from: str = "",
        date_to: str = "",
        area: str = "",
        control: str = "",
        query: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        """Поиск происшествий; сортировка по дате по убыванию, постранично."""
        incidents = self._repo.search_incidents(date_from, date_to, area, control)
        # Поиск по слову — в Python: LIKE в SQLite не понижает регистр кириллицы
        word = query.strip().casefold()
        if word:
            incidents = [
                i for i in incidents
                if word in " ".join(
                    (i["description"], i["equipment"], i["part_code"], i["area"])
                ).casefold()
            ]
        # Пагинация тоже в Python: фильтр по слову не переносится в SQL
        total = len(incidents)
        page_size = max(1, min(page_size, 100))
        pages = max(1, -(-total // page_size))
        page = max(1, min(page, pages))
        start = (page - 1) * page_size
        return {
            "items": incidents[start:start + page_size],
            "total": total,
            "page": page,
            "pages": pages,
        }

    def save_shift(self, date: str, shift_type: str, report: ShiftReport) -> None:
        _check_shift_type(shift_type)
        self._repo.upsert(date, shift_type, report)

    def delete_shift(self, date: str, shift_type: str) -> None:
        _check_shift_type(shift_type)
        if not self._repo.delete(date, shift_type):
            raise HTTPException(404, "Смена не найдена")
