"""Просмотр файлов логов из папки LOG_DIR (только чтение)."""
import re
from collections import deque
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException

LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
# Начало записи: «2026-11-17 10:02:11 INFO     [app.request] ...»;
# строки без такого начала (трассировки) относятся к предыдущей записи
_ENTRY_START = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} (\w+)")
MAX_ENTRIES = 5000


class LogService:
    def __init__(self, log_dir: Path) -> None:
        self._dir = log_dir

    def list_files(self) -> list[dict]:
        """Файлы логов, свежие первыми."""
        if not self._dir.is_dir():
            return []
        files = [p for p in self._dir.iterdir() if p.is_file() and ".log" in p.name]
        files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return [
            {
                "name": p.name,
                "size": p.stat().st_size,
                "modified": datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds"),
            }
            for p in files
        ]

    def file_path(self, name: str) -> Path:
        """Путь к файлу по имени; только файлы из списка — никаких «../»."""
        if name not in {f["name"] for f in self.list_files()}:
            raise HTTPException(404, "Файл лога не найден")
        return self._dir / name

    def read(self, name: str, limit: int = 500, level: str = "", query: str = "") -> dict:
        """Последние limit записей (свежие первыми) с фильтром по уровню и тексту."""
        path = self.file_path(name)
        limit = max(1, min(limit, MAX_ENTRIES))
        min_level = LEVELS.index(level.upper()) if level.upper() in LEVELS else 0
        word = query.strip().casefold()

        def matches(entry: dict) -> bool:
            if entry["level"] in LEVELS and LEVELS.index(entry["level"]) < min_level:
                return False
            return not word or word in entry["text"].casefold()

        result: deque[dict] = deque(maxlen=limit)
        matched = 0
        entry: dict | None = None
        with path.open(encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.rstrip("\n")
                m = _ENTRY_START.match(line)
                if m or entry is None:
                    if entry is not None and matches(entry):
                        result.append(entry)
                        matched += 1
                    entry = {"level": m.group(1) if m else "", "text": line}
                else:
                    entry["text"] += "\n" + line
        if entry is not None and matches(entry):
            result.append(entry)
            matched += 1

        return {
            "name": name,
            "entries": list(reversed(result)),
            "matched": matched,
            "truncated": matched > len(result),
        }
