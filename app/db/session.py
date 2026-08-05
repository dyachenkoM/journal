"""Движок SQLAlchemy и фабрика сессий."""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.config import DB_PATH

engine = create_engine(f"sqlite:///{DB_PATH.as_posix()}")


@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_conn, _record) -> None:
    dbapi_conn.execute("PRAGMA foreign_keys = ON")


SessionLocal = sessionmaker(bind=engine)
