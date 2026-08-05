from pydantic import BaseModel, Field


class AreaIn(BaseModel):
    name: str


class EquipmentIn(BaseModel):
    name: str
    description: str = ""


class EquipmentDescriptionIn(BaseModel):
    description: str = ""


class EquipmentOut(BaseModel):
    id: int
    name: str
    description: str


class AreaOut(BaseModel):
    id: int
    name: str
    equipment: list[EquipmentOut] = Field(default_factory=list)
