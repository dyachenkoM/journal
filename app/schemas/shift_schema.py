from typing import Literal

from pydantic import BaseModel, Field


class Round(BaseModel):
    area: str = ""
    equipment: str = ""
    status: Literal["", "ok", "not_ok"] = ""
    comment: str = ""


class Incident(BaseModel):
    time_from: str = ""
    time_to: str = ""
    area: str = ""
    equipment: str = ""
    description: str = ""
    part_code: str = ""
    quantity: str = ""


class ShiftReport(BaseModel):
    start_time: str = ""
    end_time: str = ""
    duty_control: str = ""
    designation: str = ""
    rounds: list[Round] = Field(default_factory=list)
    incidents: list[Incident] = Field(default_factory=list)


class ShiftOut(ShiftReport):
    date: str
    shift_type: str
