from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Incident, Round, Shift
from app.schemas.shift_schema import ShiftReport


class ShiftRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def dates_with_shifts(self, year: int) -> list[tuple[str, str]]:
        rows = self._session.execute(
            select(Shift.date, Shift.shift_type)
            .where(Shift.date.like(f"{year:04d}-%"))
            .order_by(Shift.date)
        )
        return [(row.date, row.shift_type) for row in rows]

    def get(self, date: str, shift_type: str) -> dict | None:
        shift = self._session.scalar(
            select(Shift)
            .where(Shift.date == date, Shift.shift_type == shift_type)
            .options(
                selectinload(Shift.rounds),
                selectinload(Shift.incidents),
            )
        )
        if shift is None:
            return None
        return {
            "date": shift.date,
            "shift_type": shift.shift_type,
            "start_time": shift.start_time,
            "end_time": shift.end_time,
            "duty_control": shift.duty_control,
            "designation": shift.designation,
            "rounds": [
                {"area": r.area, "equipment": r.equipment,
                 "status": r.status, "comment": r.comment}
                for r in shift.rounds
            ],
            "incidents": [
                {"time_from": i.time_from, "time_to": i.time_to, "area": i.area,
                 "equipment": i.equipment, "description": i.description,
                 "part_code": i.part_code, "quantity": i.quantity}
                for i in shift.incidents
            ],
        }

    def search_incidents(
        self,
        date_from: str = "",
        date_to: str = "",
        area: str = "",
        control: str = "",
    ) -> list[dict]:
        """Происшествия с данными смены, отсортированные по дате по убыванию."""
        stmt = (
            select(Incident, Shift.date, Shift.shift_type, Shift.duty_control)
            .join(Shift, Incident.shift_id == Shift.id)
            # shift_type по убыванию: 'night' раньше 'day' — ночная смена позже дневной
            .order_by(Shift.date.desc(), Shift.shift_type.desc(), Incident.id)
        )
        if date_from:
            stmt = stmt.where(Shift.date >= date_from)
        if date_to:
            stmt = stmt.where(Shift.date <= date_to)
        if area:
            stmt = stmt.where(Incident.area == area)
        if control:
            stmt = stmt.where(Shift.duty_control == control)
        return [
            {
                "date": row.date,
                "shift_type": row.shift_type,
                "duty_control": row.duty_control,
                "time_from": row.Incident.time_from,
                "time_to": row.Incident.time_to,
                "area": row.Incident.area,
                "equipment": row.Incident.equipment,
                "description": row.Incident.description,
                "part_code": row.Incident.part_code,
                "quantity": row.Incident.quantity,
            }
            for row in self._session.execute(stmt)
        ]

    def upsert(self, date: str, shift_type: str, report: ShiftReport) -> None:
        """Сохранить отчёт по смене целиком (создаёт или перезаписывает)."""
        shift = self._session.scalar(
            select(Shift).where(Shift.date == date, Shift.shift_type == shift_type)
        )
        if shift is None:
            shift = Shift(date=date, shift_type=shift_type)
            self._session.add(shift)
        shift.start_time = report.start_time
        shift.end_time = report.end_time
        shift.duty_control = report.duty_control
        shift.designation = report.designation
        shift.rounds = [
            Round(area=r.area, equipment=r.equipment, status=r.status, comment=r.comment)
            for r in report.rounds
        ]
        shift.incidents = [
            Incident(time_from=i.time_from, time_to=i.time_to, area=i.area,
                     equipment=i.equipment, description=i.description,
                     part_code=i.part_code, quantity=i.quantity)
            for i in report.incidents
        ]

    def delete(self, date: str, shift_type: str) -> bool:
        result = self._session.execute(
            delete(Shift).where(Shift.date == date, Shift.shift_type == shift_type)
        )
        return result.rowcount > 0
