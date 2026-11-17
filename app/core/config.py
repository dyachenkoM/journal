"""Настройки приложения."""
import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = APP_DIR.parent

APP_TITLE = "Сменный журнал"
DB_PATH = Path(os.environ.get("JOURNAL_DB_PATH", PROJECT_ROOT / "journal.db"))
STATIC_DIR = APP_DIR / "static"

LOG_DIR = Path(os.environ.get("JOURNAL_LOG_DIR", PROJECT_ROOT / "logs"))
LOG_LEVEL = os.environ.get("JOURNAL_LOG_LEVEL", "INFO").upper()
LOG_KEEP_DAYS = int(os.environ.get("JOURNAL_LOG_KEEP_DAYS", "30"))

SESSION_COOKIE = "journal_session"
SESSION_TTL_DAYS = 30
