from fastapi import APIRouter, Request, Response

from app.api.deps import AuthServiceDep, CurrentUser
from app.core.config import SESSION_COOKIE, SESSION_TTL_DAYS
from app.schemas.auth_schema import LoginIn

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(data: LoginIn, response: Response, service: AuthServiceDep) -> dict:
    user, token = service.login(data.username, data.password)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_DAYS * 24 * 3600,
        httponly=True,
        samesite="lax",
    )
    return user


@router.post("/logout")
def logout(request: Request, response: Response, service: AuthServiceDep) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        service.logout(token)
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "ok"}


@router.get("/me")
def me(user: CurrentUser) -> dict:
    return user
