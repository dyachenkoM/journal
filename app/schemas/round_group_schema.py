from pydantic import BaseModel, Field


class RoundGroupIn(BaseModel):
    areas: list[str] = Field(default_factory=list)


class RoundGroupOut(BaseModel):
    group: int
    areas: list[str] = Field(default_factory=list)
