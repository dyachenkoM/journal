from pydantic import BaseModel


class ControlIn(BaseModel):
    name: str


class ControlOut(BaseModel):
    id: int
    name: str
