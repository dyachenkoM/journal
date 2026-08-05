from fastapi import APIRouter

from app.api.deps import MalfunctionServiceDep
from app.schemas.malfunction_schema import MalfunctionIn, MalfunctionResolveIn

router = APIRouter(prefix="/malfunctions", tags=["malfunctions"])


@router.get("")
def list_malfunctions(service: MalfunctionServiceDep) -> list[dict]:
    return service.list_malfunctions()


@router.post("")
def add_malfunction(malfunction: MalfunctionIn, service: MalfunctionServiceDep) -> dict:
    return service.add_malfunction(malfunction)


@router.post("/{malfunction_id}/resolve")
def resolve_malfunction(
    malfunction_id: int, payload: MalfunctionResolveIn, service: MalfunctionServiceDep
) -> dict:
    service.resolve_malfunction(malfunction_id, payload)
    return {"status": "ok"}


@router.delete("/{malfunction_id}")
def delete_malfunction(malfunction_id: int, service: MalfunctionServiceDep) -> dict:
    service.delete_malfunction(malfunction_id)
    return {"status": "ok"}
