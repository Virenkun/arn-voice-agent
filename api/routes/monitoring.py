"""Live call monitoring routes.

Lists an organization's in-progress calls and exposes a WebSocket a supervisor
uses to listen to (and control) one of them. Handlers stay thin: org-scoping
and the real work live in ``db_client`` and ``api.services.monitoring``.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, WebSocket
from loguru import logger

from api.db import db_client
from api.db.models import UserModel
from api.enums import WorkflowRunState
from api.schemas.monitoring import OngoingCallSchema
from api.services.auth.depends import get_user, get_user_ws
from api.services.monitoring.monitor_session import MonitorSession

router = APIRouter(prefix="/monitoring")


@router.get("/calls", response_model=list[OngoingCallSchema])
async def list_ongoing_calls(
    user: UserModel = Depends(get_user),
) -> list[OngoingCallSchema]:
    """Return the organization's currently in-progress calls."""
    runs = await db_client.get_ongoing_workflow_runs(user.selected_organization_id)
    now = datetime.now(UTC)
    calls: list[OngoingCallSchema] = []
    for run in runs:
        ctx = run.initial_context or {}
        phone_number = (
            ctx.get("called_number")
            or ctx.get("caller_number")
            or ctx.get("phone_number")
        )
        started_at = run.created_at
        duration = (
            int((now - started_at).total_seconds()) if started_at else 0
        )
        calls.append(
            OngoingCallSchema(
                id=run.id,
                workflow_id=run.workflow_id,
                workflow_name=run.workflow.name if run.workflow else None,
                call_type=run.call_type,
                mode=run.mode,
                campaign_name=run.campaign.name if run.campaign else None,
                phone_number=phone_number,
                started_at=started_at.isoformat() if started_at else "",
                duration_seconds=max(0, duration),
            )
        )
    return calls


@router.websocket("/ws/{workflow_run_id}")
async def monitor_call(
    websocket: WebSocket,
    workflow_run_id: int,
    user: UserModel = Depends(get_user_ws),
) -> None:
    """Stream a live call to a supervisor (org-scoped, ongoing calls only)."""
    # Tenant isolation: the run must belong to the user's organization. A path
    # id never implies access — this gates listening *and* barge-in/steer.
    run = await db_client.get_workflow_run(
        workflow_run_id, organization_id=user.selected_organization_id
    )
    if run is None:
        await websocket.close(code=1008, reason="Call not found")
        return
    if run.state != WorkflowRunState.RUNNING.value or run.is_completed:
        await websocket.close(code=1008, reason="Call is not active")
        return

    await websocket.accept()
    try:
        await MonitorSession(workflow_run_id, user).run(websocket)
    except Exception as e:
        logger.warning(f"[monitor {workflow_run_id}] session ended with error: {e}")
