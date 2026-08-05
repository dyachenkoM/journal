"""Создание схемы, миграции и начальные данные."""
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, inspect, select, text
from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT
from app.core.security import hash_password
from app.db.models import Base, RoundGroupArea, User
from app.db.session import engine

# Ревизия Alembic, соответствующая схеме на момент внедрения миграций
BASELINE_REVISION = "0001"

# Группы обхода по умолчанию: дежурный обходит одну группу за дневную + ночную
# смену, все 8 групп — за месяц.
DEFAULT_ROUND_GROUPS = [
    ["GI", "Жиротопка", "Пневмотранспорт", "Автоукладчики"],
    ["Сухие компоненты", "ТП2", "Офис"],
    ["Экструдер", "Спрей", "Подлива", "Автоклавы"],
    ["Холодный склад", "РП10", "Goods out"],
    ["Сухая упаковка", "Мясобункерная", "Паровой тоннель", "Вторичная упаковка"],
    ["Утилитная платформа", "ВРУ офиса", "Платформа санпропускника"],
    ["Rework система", "Мясоподготовка", "Первичная упаковка", "Транспортная система"],
    ["ТП1", "Котельная", "Участок гидролизата"],
]


def init_db() -> None:
    cfg = _alembic_config()
    if _is_pre_alembic_db():
        _run_legacy_migrations()
        command.stamp(cfg, BASELINE_REVISION)
    command.upgrade(cfg, "head")
    with Session(engine) as session:
        _seed_round_groups(session)
        _seed_admin(session)
        session.commit()


def _alembic_config() -> Config:
    return Config(str(PROJECT_ROOT / "alembic.ini"))


def _is_pre_alembic_db() -> bool:
    """База создана до внедрения Alembic: таблицы есть, а версии миграций нет."""
    tables = set(inspect(engine).get_table_names())
    return bool(tables) and "alembic_version" not in tables


def _run_legacy_migrations() -> None:
    """Доводим базу, созданную до Alembic, до схемы BASELINE_REVISION."""
    with engine.begin() as conn:
        _migrate_control_rename(conn)
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        _migrate_rounds(conn)
        _migrate_equipment_description(conn)


def _seed_round_groups(session: Session) -> None:
    """Пустую таблицу групп обхода заполняем составом по умолчанию."""
    if session.scalar(select(RoundGroupArea.id).limit(1)) is not None:
        return
    session.add_all(
        RoundGroupArea(group_num=num, area=area)
        for num, areas in enumerate(DEFAULT_ROUND_GROUPS, start=1)
        for area in areas
    )


def _seed_admin(session: Session) -> None:
    """Без пользователей вход невозможен — создаём администратора по умолчанию."""
    if session.scalar(select(User.id).limit(1)) is not None:
        return
    session.add(User(username="admin", password_hash=hash_password("admin"), is_admin=True))
    print("Создан администратор по умолчанию (admin/admin) — смените пароль после входа!")


def _migrate_control_rename(conn: Connection) -> None:
    """Старые имена (officers, shifts.duty_officer) переводим в новые (controls, duty_control)."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "officers" in tables and "controls" not in tables:
        conn.execute(text("ALTER TABLE officers RENAME TO controls"))
    if "shifts" in tables:
        cols = {c["name"] for c in inspector.get_columns("shifts")}
        if "duty_officer" in cols:
            conn.execute(text("ALTER TABLE shifts RENAME COLUMN duty_officer TO duty_control"))


def _migrate_equipment_description(conn: Connection) -> None:
    """Добавляем колонку description в существующие базы."""
    cols = {c["name"] for c in inspect(conn).get_columns("equipment_units")}
    if "description" not in cols:
        conn.execute(text(
            "ALTER TABLE equipment_units ADD COLUMN description TEXT NOT NULL DEFAULT ''"
        ))


def _migrate_rounds(conn: Connection) -> None:
    """Старый формат обхода (equipment/condition) переводим в новый (участок + оценка)."""
    cols = {c["name"] for c in inspect(conn).get_columns("rounds")}
    if "status" in cols:
        return
    conn.execute(text("ALTER TABLE rounds RENAME TO rounds_old"))
    Base.metadata.tables["rounds"].create(conn)
    conn.execute(text(
        "INSERT INTO rounds (shift_id, area, equipment, status, comment)"
        " SELECT shift_id, '', equipment, '', condition FROM rounds_old"
    ))
    conn.execute(text("DROP TABLE rounds_old"))
