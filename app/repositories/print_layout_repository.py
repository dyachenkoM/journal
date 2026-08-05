from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.models import PrintLayout

# Макет один на всё приложение — храним его в строке с фиксированным id
_ROW_ID = 1


class PrintLayoutRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self) -> str | None:
        row = self._session.get(PrintLayout, _ROW_ID)
        return row.data if row else None

    def set(self, data: str) -> None:
        row = self._session.get(PrintLayout, _ROW_ID)
        if row:
            row.data = data
        else:
            self._session.add(PrintLayout(id=_ROW_ID, data=data))

    def delete(self) -> None:
        self._session.execute(delete(PrintLayout).where(PrintLayout.id == _ROW_ID))
