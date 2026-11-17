"""Окружение Alembic: использует движок и модели приложения."""
import logging
from logging.config import fileConfig

from alembic import context

from app.db.models import Base
from app.db.session import engine

config = context.config

# Настройки логов из alembic.ini — только при запуске из консоли. Внутри
# приложения (init_db) логирование уже настроено, а fileConfig сбросил бы
# его обработчики и отключил логгеры приложения.
if config.config_file_name is not None and not logging.getLogger().handlers:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Генерация SQL без подключения к базе (alembic upgrade --sql)."""
    context.configure(
        url=engine.url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite не умеет ALTER для большинства изменений — batch-режим
            # пересоздаёт таблицу целиком
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
