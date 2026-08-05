"""Статус неисправности и кто выполнил.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EMPTY = sa.text("''")


def _malfunctions_table(*extra: sa.schema.SchemaItem) -> sa.Table:
    """Схема таблицы для batch-пересоздания в SQLite (без рефлексии)."""
    return sa.Table(
        "malfunctions",
        sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("plant", sa.String(), nullable=False),
        sa.Column("area", sa.String(), nullable=False, server_default=_EMPTY),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("author", sa.String(), nullable=False, server_default=_EMPTY),
        sa.CheckConstraint("plant IN ('Dry', 'Wet', 'Utl')"),
        sa.Index("idx_malfunctions_date", "date"),
        *extra,
    )


def upgrade() -> None:
    with op.batch_alter_table("malfunctions", copy_from=_malfunctions_table()) as batch:
        batch.add_column(
            sa.Column(
                "status", sa.String(), nullable=False, server_default=sa.text("'open'")
            )
        )
        batch.add_column(
            sa.Column("resolved_by", sa.String(), nullable=False, server_default=_EMPTY)
        )
        batch.create_check_constraint(
            "ck_malfunctions_status", "status IN ('open', 'done')"
        )


def downgrade() -> None:
    copy_from = _malfunctions_table(
        sa.Column(
            "status", sa.String(), nullable=False, server_default=sa.text("'open'")
        ),
        sa.Column("resolved_by", sa.String(), nullable=False, server_default=_EMPTY),
        sa.CheckConstraint("status IN ('open', 'done')", name="ck_malfunctions_status"),
    )
    with op.batch_alter_table("malfunctions", copy_from=copy_from) as batch:
        batch.drop_constraint("ck_malfunctions_status", type_="check")
        batch.drop_column("resolved_by")
        batch.drop_column("status")
