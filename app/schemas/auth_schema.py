from pydantic import BaseModel


class LoginIn(BaseModel):
    username: str
    password: str


class UserIn(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class PasswordIn(BaseModel):
    password: str


class RoleIn(BaseModel):
    is_admin: bool
