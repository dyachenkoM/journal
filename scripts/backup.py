"""Еженедельный бэкап базы: VACUUM INTO во внешнюю папку + ротация старых копий.

Запускается отдельным контейнером (сервис backup в docker-compose) и работает
как демон: проверяет возраст последней копии, при необходимости делает новую
и засыпает до следующего срока. Благодаря проверке возраста перезапуск
контейнера не приводит к лишним бэкапам.
"""
import logging
import os
import time
from datetime import datetime
from pathlib import Path

from sqlalchemy import text

from app.db.session import engine

BACKUP_DIR = Path(os.environ.get("JOURNAL_BACKUP_DIR", "/backups"))
INTERVAL = 7 * 24 * 3600  # раз в неделю
KEEP = int(os.environ.get("JOURNAL_BACKUP_KEEP", "8"))  # ~2 месяца еженедельных копий

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("backup")


def existing_backups() -> list[Path]:
    """Копии от старых к новым."""
    return sorted(BACKUP_DIR.glob("journal-*.db"), key=lambda p: p.stat().st_mtime)


def make_backup() -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    target = BACKUP_DIR / f"journal-{datetime.now():%Y%m%d-%H%M%S}.db"
    # VACUUM INTO даёт консистентный снимок даже при работающем приложении
    with engine.connect() as conn:
        conn.execute(text("VACUUM INTO :path"), {"path": str(target)})
    log.info("Создан бэкап %s (%d КиБ)", target.name, target.stat().st_size // 1024)

    for stale in existing_backups()[:-KEEP]:
        stale.unlink()
        log.info("Удалён старый бэкап %s", stale.name)


def seconds_until_due() -> float:
    backups = existing_backups()
    if not backups:
        return 0
    age = time.time() - backups[-1].stat().st_mtime
    return max(0, INTERVAL - age)


def main() -> None:
    while True:
        wait = seconds_until_due()
        if wait > 0:
            log.info("Следующий бэкап через %.1f ч", wait / 3600)
            time.sleep(wait)
        make_backup()


if __name__ == "__main__":
    main()
