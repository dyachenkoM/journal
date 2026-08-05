from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.core.security import hash_password
from app.repositories.user_repository import UserRepository

MIN_PASSWORD_LENGTH = 4


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self._repo = repo

    def list_users(self) -> list[dict]:
        return self._repo.list_all()

    def add_user(self, username: str, password: str, is_admin: bool) -> dict:
        username = username.strip()
        if not username:
            raise HTTPException(400, "Имя пользователя не может быть пустым")
        _check_password(password)
        try:
            user_id = self._repo.create(username, hash_password(password), is_admin)
        except IntegrityError:
            raise HTTPException(409, "Пользователь с таким именем уже есть")
        return {"id": user_id, "username": username, "is_admin": is_admin}

    def set_password(self, user_id: int, password: str) -> None:
        _check_password(password)
        user = self._repo.get_by_id(user_id)
        if user is None:
            raise HTTPException(404, "Пользователь не найден")
        user.password_hash = hash_password(password)
        # Смена пароля разрывает все активные сессии пользователя
        self._repo.delete_user_sessions(user_id)

    def set_role(self, user_id: int, is_admin: bool) -> None:
        user = self._repo.get_by_id(user_id)
        if user is None:
            raise HTTPException(404, "Пользователь не найден")
        if user.is_admin and not is_admin and self._repo.count_admins() <= 1:
            raise HTTPException(409, "Нельзя снять права у последнего администратора")
        user.is_admin = is_admin

    def delete_user(self, user_id: int, acting_user_id: int) -> None:
        if user_id == acting_user_id:
            raise HTTPException(409, "Нельзя удалить собственную учётную запись")
        user = self._repo.get_by_id(user_id)
        if user is None:
            raise HTTPException(404, "Пользователь не найден")
        if user.is_admin and self._repo.count_admins() <= 1:
            raise HTTPException(409, "Нельзя удалить последнего администратора")
        self._repo.delete(user_id)


def _check_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            400, f"Пароль должен быть не короче {MIN_PASSWORD_LENGTH} символов"
        )
