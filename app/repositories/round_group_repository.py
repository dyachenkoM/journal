from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import RoundGroupArea


class RoundGroupRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> list[dict]:
        rows = self._session.scalars(
            select(RoundGroupArea).order_by(RoundGroupArea.group_num, RoundGroupArea.id)
        )
        groups: dict[int, list[str]] = {n: [] for n in range(1, 9)}
        for row in rows:
            groups[row.group_num].append(row.area)
        return [{"group": n, "areas": areas} for n, areas in groups.items()]

    def replace_group(self, group_num: int, areas: list[str]) -> None:
        self._session.execute(
            delete(RoundGroupArea).where(RoundGroupArea.group_num == group_num)
        )
        self._session.add_all(
            RoundGroupArea(group_num=group_num, area=a) for a in areas
        )
