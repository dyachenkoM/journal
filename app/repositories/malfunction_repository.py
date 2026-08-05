from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.db.models import Malfunction


class MalfunctionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> list[dict]:
        malfunctions = self._session.scalars(
            select(Malfunction).order_by(Malfunction.date.desc(), Malfunction.id.desc())
        )
        return [
            {
                "id": m.id,
                "date": m.date,
                "plant": m.plant,
                "area": m.area,
                "description": m.description,
                "author": m.author,
                "status": m.status,
                "resolved_by": m.resolved_by,
            }
            for m in malfunctions
        ]

    def create(self, data: dict) -> int:
        malfunction = Malfunction(**data)
        self._session.add(malfunction)
        self._session.flush()
        return malfunction.id

    def resolve(self, malfunction_id: int, resolved_by: str) -> bool:
        result = self._session.execute(
            update(Malfunction)
            .where(Malfunction.id == malfunction_id)
            .values(status="done", resolved_by=resolved_by)
        )
        return result.rowcount > 0

    def delete(self, malfunction_id: int) -> bool:
        result = self._session.execute(
            delete(Malfunction).where(Malfunction.id == malfunction_id)
        )
        return result.rowcount > 0
