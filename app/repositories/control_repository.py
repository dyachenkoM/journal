from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import Control


class ControlRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> list[dict]:
        controls = self._session.scalars(select(Control).order_by(Control.name))
        return [{"id": c.id, "name": c.name} for c in controls]

    def create(self, name: str) -> int:
        """Возвращает id созданного дежурного. Бросает IntegrityError при дубликате."""
        control = Control(name=name)
        self._session.add(control)
        self._session.flush()
        return control.id

    def delete(self, control_id: int) -> bool:
        result = self._session.execute(delete(Control).where(Control.id == control_id))
        return result.rowcount > 0
