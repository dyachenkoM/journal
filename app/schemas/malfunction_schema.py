from pydantic import BaseModel


class MalfunctionIn(BaseModel):
    date: str
    plant: str
    area: str = ""
    description: str
    author: str = ""


class MalfunctionResolveIn(BaseModel):
    resolved_by: str
