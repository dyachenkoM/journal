"""Базовая схема: текущее состояние моделей на момент внедрения Alembic.

Revision ID: 0001
Revises:
Create Date: 2026-07-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EMPTY = sa.text("''")


def upgrade() -> None:
    op.create_table(
        "controls",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
    )
    op.create_table(
        "areas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
    )
    op.create_table(
        "equipment_units",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "area_id",
            sa.Integer(),
            sa.ForeignKey("areas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=_EMPTY),
        sa.UniqueConstraint("area_id", "name"),
    )
    op.create_table(
        "shifts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("shift_type", sa.String(), nullable=False),
        sa.Column("start_time", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("end_time", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("duty_control", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("designation", sa.String(), nullable=False, server_default=_EMPTY),
        sa.UniqueConstraint("date", "shift_type"),
        sa.CheckConstraint("shift_type IN ('day', 'night')"),
    )
    op.create_index("idx_shifts_date", "shifts", ["date"])
    op.create_table(
        "rounds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "shift_id",
            sa.Integer(),
            sa.ForeignKey("shifts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("area", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("equipment", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("status", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("comment", sa.String(), nullable=False, server_default=_EMPTY),
        sa.CheckConstraint("status IN ('', 'ok', 'not_ok')"),
    )
    op.create_table(
        "incidents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "shift_id",
            sa.Integer(),
            sa.ForeignKey("shifts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("time_from", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("time_to", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("area", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("equipment", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("description", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("part_code", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("quantity", sa.String(), nullable=False, server_default=_EMPTY),
    )
    op.create_table(
        "malfunctions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("plant", sa.String(), nullable=False),
        sa.Column("area", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("author", sa.String(), nullable=False, server_default=_EMPTY),
        sa.CheckConstraint("plant IN ('Dry', 'Wet', 'Utl')"),
    )
    op.create_index("idx_malfunctions_date", "malfunctions", ["date"])
    op.create_table(
        "round_group_areas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_num", sa.Integer(), nullable=False),
        sa.Column("area", sa.String(), nullable=False),
        sa.UniqueConstraint("group_num", "area"),
        sa.CheckConstraint("group_num BETWEEN 1 AND 8"),
    )


def downgrade() -> None:
    op.drop_table("round_group_areas")
    op.drop_index("idx_malfunctions_date", table_name="malfunctions")
    op.drop_table("malfunctions")
    op.drop_table("incidents")
    op.drop_table("rounds")
    op.drop_index("idx_shifts_date", table_name="shifts")
    op.drop_table("shifts")
    op.drop_table("equipment_units")
    op.drop_table("areas")
    op.drop_table("controls")
