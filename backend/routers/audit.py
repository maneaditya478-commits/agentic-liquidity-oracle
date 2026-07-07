"""
Audit router.

Endpoints:
  GET /audit/logs          — paginated audit records (JWT)
  GET /audit/logs/{id}     — single audit record (JWT)
  GET /audit/export        — CSV export of all records (Admin)
  GET /audit/icp/count     — ICP canister record count (JWT)
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.dependencies import get_current_admin_user, get_current_user, get_db
from db.models import AuditRecord, User
from services.icp_service import icp_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit", tags=["Audit"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class AuditRecordSchema(BaseModel):
    id: int
    tx_id: Optional[int]
    timestamp: datetime
    risk_score: float
    var_95: float
    confidence: float
    action: str
    tx_hash: Optional[str]
    icp_record_id: Optional[int]
    summary: Optional[str]

    model_config = {"from_attributes": True}


class PaginatedAuditRecords(BaseModel):
    items: List[AuditRecordSchema]
    total: int
    page: int
    size: int
    pages: int


class ICPCountResponse(BaseModel):
    count: int
    stub_mode: bool


# ---------------------------------------------------------------------------
# GET /audit/logs
# ---------------------------------------------------------------------------
@router.get(
    "/logs",
    response_model=PaginatedAuditRecords,
    summary="Paginated audit records",
)
async def get_audit_logs(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PaginatedAuditRecords:
    """Return paginated audit records, newest first."""
    total: int = db.query(AuditRecord).count()
    pages: int = max(1, (total + size - 1) // size)
    offset: int = (page - 1) * size

    rows: List[AuditRecord] = (
        db.query(AuditRecord)
        .order_by(AuditRecord.timestamp.desc())
        .offset(offset)
        .limit(size)
        .all()
    )

    return PaginatedAuditRecords(
        items=[AuditRecordSchema.model_validate(r) for r in rows],
        total=total,
        page=page,
        size=size,
        pages=pages,
    )


# ---------------------------------------------------------------------------
# GET /audit/logs/{id}
# ---------------------------------------------------------------------------
@router.get(
    "/logs/{record_id}",
    response_model=AuditRecordSchema,
    summary="Single audit record by ID",
)
async def get_audit_record(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AuditRecordSchema:
    """Return a single audit record by its primary key."""
    record: Optional[AuditRecord] = db.query(AuditRecord).get(record_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit record {record_id} not found",
        )
    return AuditRecordSchema.model_validate(record)


# ---------------------------------------------------------------------------
# GET /audit/export
# ---------------------------------------------------------------------------
@router.get(
    "/export",
    summary="Export all audit records as CSV (Admin)",
)
async def export_audit_csv(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin_user),
) -> StreamingResponse:
    """
    Stream all audit records as a CSV file download.

    This endpoint is Admin-only.  The response is a ``text/csv`` streaming
    response so it works for large datasets without buffering everything in
    memory.
    """
    rows: List[AuditRecord] = (
        db.query(AuditRecord).order_by(AuditRecord.timestamp.desc()).all()
    )

    def _generate_csv():
        output = io.StringIO()
        writer = csv.writer(output)

        # Header row
        writer.writerow(
            [
                "id",
                "tx_id",
                "timestamp",
                "risk_score",
                "var_95",
                "confidence",
                "action",
                "tx_hash",
                "icp_record_id",
                "summary",
            ]
        )
        yield output.getvalue()
        output.truncate(0)
        output.seek(0)

        # Data rows
        for row in rows:
            writer.writerow(
                [
                    row.id,
                    row.tx_id,
                    row.timestamp.isoformat() if row.timestamp else "",
                    float(row.risk_score) if row.risk_score is not None else "",
                    float(row.var_95) if row.var_95 is not None else "",
                    float(row.confidence) if row.confidence is not None else "",
                    row.action,
                    row.tx_hash or "",
                    row.icp_record_id or "",
                    (row.summary or "").replace("\n", " "),
                ]
            )
            yield output.getvalue()
            output.truncate(0)
            output.seek(0)

    filename = f"audit_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        _generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# GET /audit/icp/count
# ---------------------------------------------------------------------------
@router.get(
    "/icp/count",
    response_model=ICPCountResponse,
    summary="ICP canister record count",
)
async def get_icp_record_count(
    _: User = Depends(get_current_user),
) -> ICPCountResponse:
    """Return the total number of audit records stored in the ICP canister."""
    from core.config import settings as cfg

    count = await icp_service.get_record_count()
    return ICPCountResponse(count=count, stub_mode=cfg.ICP_STUB_MODE)
