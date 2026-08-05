from fastapi import APIRouter

from app.api.deps import AdminUser, PrintLayoutServiceDep

router = APIRouter(prefix="/print-layout", tags=["print-layout"])


@router.get("")
def get_layout(service: PrintLayoutServiceDep) -> dict | None:
    return service.get_layout()


@router.put("")
def save_layout(layout: dict, service: PrintLayoutServiceDep, _admin: AdminUser) -> dict:
    service.save_layout(layout)
    return {"status": "ok"}


@router.delete("")
def delete_layout(service: PrintLayoutServiceDep, _admin: AdminUser) -> dict:
    service.delete_layout()
    return {"status": "ok"}
