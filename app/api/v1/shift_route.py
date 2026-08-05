from fastapi import APIRouter

from app.api.deps import ShiftServiceDep
from app.schemas.shift_schema import ShiftReport

router = APIRouter(tags=["shifts"])


@router.get("/calendar/{year}")
def calendar(year: int, service: ShiftServiceDep) -> dict[str, list[str]]:
    """Даты года, по которым есть сохранённые смены: {"YYYY-MM-DD": ["day", "night"]}."""
    return service.calendar(year)


@router.get("/search/incidents")
def search_incidents(
    service: ShiftServiceDep,
    date_from: str = "",
    date_to: str = "",
    area: str = "",
    control: str = "",
    query: str = "",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Поиск происшествий по периоду, участку, дежурному и слову, постранично."""
    return service.search_incidents(
        date_from, date_to, area, control, query, page, page_size
    )


@router.get("/shifts/{date}/{shift_type}")
def get_shift(date: str, shift_type: str, service: ShiftServiceDep) -> dict:
    return service.get_shift(date, shift_type)


@router.put("/shifts/{date}/{shift_type}")
def save_shift(
    date: str, shift_type: str, report: ShiftReport, service: ShiftServiceDep
) -> dict:
    """Сохранить отчёт по смене целиком (создаёт или перезаписывает)."""
    service.save_shift(date, shift_type, report)
    return {"status": "ok"}


@router.delete("/shifts/{date}/{shift_type}")
def delete_shift(date: str, shift_type: str, service: ShiftServiceDep) -> dict:
    service.delete_shift(date, shift_type)
    return {"status": "ok"}
