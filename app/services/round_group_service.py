from fastapi import HTTPException

from app.repositories.round_group_repository import RoundGroupRepository


class RoundGroupService:
    def __init__(self, repo: RoundGroupRepository) -> None:
        self._repo = repo

    def list_groups(self) -> list[dict]:
        return self._repo.list_all()

    def save_group(self, group_num: int, raw_areas: list[str]) -> dict:
        """Заменить состав группы обхода целиком."""
        if not 1 <= group_num <= 8:
            raise HTTPException(400, "Номер группы должен быть от 1 до 8")
        areas: list[str] = []
        for area in raw_areas:
            area = area.strip()
            if area and area not in areas:
                areas.append(area)
        self._repo.replace_group(group_num, areas)
        return {"group": group_num, "areas": areas}
