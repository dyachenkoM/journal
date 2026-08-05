from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import AuthSession, User


def _user_dict(user: User) -> dict:
    return {"id": user.id, "username": user.username, "is_admin": user.is_admin}


class UserRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> list[dict]:
        users = self._session.scalars(select(User).order_by(User.username))
        return [_user_dict(u) for u in users]

    def get_by_username(self, username: str) -> User | None:
        return self._session.scalar(select(User).where(User.username == username))

    def get_by_id(self, user_id: int) -> User | None:
        return self._session.get(User, user_id)

    def create(self, username: str, password_hash: str, is_admin: bool) -> int:
        """Возвращает id созданного пользователя. Бросает IntegrityError при дубликате."""
        user = User(username=username, password_hash=password_hash, is_admin=is_admin)
        self._session.add(user)
        self._session.flush()
        return user.id

    def delete(self, user_id: int) -> bool:
        result = self._session.execute(delete(User).where(User.id == user_id))
        return result.rowcount > 0

    def count_admins(self) -> int:
        return self._session.scalar(
            select(func.count()).select_from(User).where(User.is_admin)
        )

    # ---------- Сессии ----------

    def create_session(self, user_id: int, token: str) -> None:
        self._session.add(AuthSession(
            token=token,
            user_id=user_id,
            created_at=datetime.now(timezone.utc).isoformat(),
        ))

    def get_session(self, token: str) -> AuthSession | None:
        return self._session.scalar(
            select(AuthSession)
            .options(joinedload(AuthSession.user))
            .where(AuthSession.token == token)
        )

    def delete_session(self, token: str) -> None:
        self._session.execute(delete(AuthSession).where(AuthSession.token == token))

    def delete_user_sessions(self, user_id: int) -> None:
        self._session.execute(
            delete(AuthSession).where(AuthSession.user_id == user_id)
        )
