import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.core.config import SESSION_TTL_DAYS
from app.core.security import generate_session_token, verify_password
from app.repositories.user_repository import UserRepository, _user_dict

log = logging.getLogger(__name__)


class AuthService:
    def __init__(self, repo: UserRepository) -> None:
        self._repo = repo

    def login(self, username: str, password: str) -> tuple[dict, str]:
        """Возвращает (пользователь, токен сессии) или бросает 401."""
        username = username.strip()
        user = self._repo.get_by_username(username)
        if user is None or not verify_password(password, user.password_hash):
            log.warning("Неудачный вход: пользователь %r", username)
            raise HTTPException(401, "Неверное имя пользователя или пароль")
        token = generate_session_token()
        self._repo.create_session(user.id, token)
        log.info("Вход: %s", user.username)
        return _user_dict(user), token

    def logout(self, token: str) -> None:
        self._repo.delete_session(token)

    def user_by_token(self, token: str) -> dict | None:
        """Пользователь по токену сессии; None, если сессии нет или она истекла."""
        auth_session = self._repo.get_session(token)
        if auth_session is None:
            return None
        created = datetime.fromisoformat(auth_session.created_at)
        if datetime.now(timezone.utc) - created > timedelta(days=SESSION_TTL_DAYS):
            self._repo.delete_session(token)
            return None
        return _user_dict(auth_session.user)
