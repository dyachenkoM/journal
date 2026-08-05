"""Таблица макета печати.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "print_layouts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("data", sa.String(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("print_layouts")
