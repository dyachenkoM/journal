"""Хеширование паролей (PBKDF2, стандартная библиотека) и токены сессий."""
import hashlib
import hmac
import secrets

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = _pbkdf2(password, salt, _ITERATIONS)
    return f"{_ALGORITHM}${_ITERATIONS}${salt}${digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt, digest = password_hash.split("$")
    except ValueError:
        return False
    if algorithm != _ALGORITHM:
        return False
    return hmac.compare_digest(_pbkdf2(password, salt, int(iterations)), digest)


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def _pbkdf2(password: str, salt: str, iterations: int) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), iterations
    ).hex()
