"""ORM-модели SQLAlchemy."""
from sqlalchemy import CheckConstraint, ForeignKey, Index, UniqueConstraint, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

_EMPTY = text("''")


class Base(DeclarativeBase):
    pass


class User(Base):
    """Пользователь приложения. is_admin — группа «админы», иначе обычный."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    is_admin: Mapped[bool] = mapped_column(default=False, server_default=text("0"))


class AuthSession(Base):
    """Сессия входа: токен из httpOnly-куки."""
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[str]  # ISO-датавремя UTC

    user: Mapped["User"] = relationship()


class Control(Base):
    """Дежурный (Фамилия И.О.)."""
    __tablename__ = "controls"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)


class Area(Base):
    """Участок."""
    __tablename__ = "areas"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)

    equipment: Mapped[list["EquipmentUnit"]] = relationship(
        order_by="EquipmentUnit.name",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class EquipmentUnit(Base):
    """Единица оборудования на участке."""
    __tablename__ = "equipment_units"
    __table_args__ = (UniqueConstraint("area_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    area_id: Mapped[int] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"))
    name: Mapped[str]
    # Подсказка при наведении в отчёте
    description: Mapped[str] = mapped_column(default="", server_default=_EMPTY)


class Shift(Base):
    __tablename__ = "shifts"
    __table_args__ = (
        UniqueConstraint("date", "shift_type"),
        CheckConstraint("shift_type IN ('day', 'night')"),
        Index("idx_shifts_date", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[str]  # YYYY-MM-DD
    shift_type: Mapped[str]
    start_time: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    end_time: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    duty_control: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    designation: Mapped[str] = mapped_column(default="", server_default=_EMPTY)

    rounds: Mapped[list["Round"]] = relationship(
        order_by="Round.id", cascade="all, delete-orphan", passive_deletes=True
    )
    incidents: Mapped[list["Incident"]] = relationship(
        order_by="Incident.id", cascade="all, delete-orphan", passive_deletes=True
    )


class Round(Base):
    __tablename__ = "rounds"
    __table_args__ = (CheckConstraint("status IN ('', 'ok', 'not_ok')"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("shifts.id", ondelete="CASCADE"))
    area: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    equipment: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    status: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    comment: Mapped[str] = mapped_column(default="", server_default=_EMPTY)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(primary_key=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("shifts.id", ondelete="CASCADE"))
    time_from: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    time_to: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    area: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    equipment: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    description: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    part_code: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    quantity: Mapped[str] = mapped_column(default="", server_default=_EMPTY)


class Malfunction(Base):
    """Неисправность вне отчётов по сменам."""
    __tablename__ = "malfunctions"
    __table_args__ = (
        CheckConstraint("plant IN ('Dry', 'Wet', 'Utl')"),
        CheckConstraint("status IN ('open', 'done')"),
        Index("idx_malfunctions_date", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[str]  # YYYY-MM-DD
    plant: Mapped[str]
    area: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    description: Mapped[str]
    author: Mapped[str] = mapped_column(default="", server_default=_EMPTY)
    # 'open' — в работе, 'done' — сделано
    status: Mapped[str] = mapped_column(default="open", server_default=text("'open'"))
    resolved_by: Mapped[str] = mapped_column(default="", server_default=_EMPTY)


class PrintLayout(Base):
    """Макет печати отчёта: единственная строка с JSON-настройками блоков."""
    __tablename__ = "print_layouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    data: Mapped[str]  # JSON-текст макета


class RoundGroupArea(Base):
    """Участок в группе обхода."""
    __tablename__ = "round_group_areas"
    __table_args__ = (
        UniqueConstraint("group_num", "area"),
        CheckConstraint("group_num BETWEEN 1 AND 8"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    group_num: Mapped[int]
    area: Mapped[str]
