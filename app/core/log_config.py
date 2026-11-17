"""Настройка логирования: консоль + файл с ежедневной ротацией.

Каждый процесс пишет в свой файл (app.log, backup.log), чтобы два процесса
не ротировали один и тот же файл одновременно.
"""
import logging
import os
from logging.handlers import TimedRotatingFileHandler

from app.core.config import LOG_DIR, LOG_KEEP_DAYS, LOG_LEVEL

LOG_FORMAT = "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_configured = False


def setup_logging(name: str) -> None:
    """Настраивает корневой логгер и логгеры uvicorn; повторный вызов ничего не делает."""
    global _configured
    if _configured:
        return
    _configured = True

    formatter = logging.Formatter(LOG_FORMAT, DATE_FORMAT)

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    file_handler = TimedRotatingFileHandler(
        LOG_DIR / f"{name}.log",
        when="midnight",
        backupCount=LOG_KEEP_DAYS,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(LOG_LEVEL)
    root.addHandler(file_handler)
    root.addHandler(console_handler)

    # SQLAlchemy при уровне INFO печатает каждый SQL-запрос
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
    # Служебные сообщения Alembic при каждом старте не нужны
    logging.getLogger("alembic.runtime.plugins").setLevel(logging.WARNING)

    # У uvicorn свои обработчики и propagate=False: добавляем им файл напрямую.
    # uvicorn.access не трогаем — запросы пишет собственный middleware.
    logging.getLogger("uvicorn").addHandler(file_handler)

    logging.getLogger(__name__).info(
        "Логирование запущено: %s, уровень %s, pid %d",
        file_handler.baseFilename, logging.getLevelName(root.level), os.getpid(),
    )
