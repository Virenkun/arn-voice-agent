"""Schemas for the live call monitoring API."""

from typing import Optional

from pydantic import BaseModel


class OngoingCallSchema(BaseModel):
    """An in-progress call shown on the live monitoring page."""

    id: int
    workflow_id: int
    workflow_name: Optional[str] = None
    call_type: Optional[str] = None
    mode: Optional[str] = None  # telephony provider or web transport
    campaign_name: Optional[str] = None
    phone_number: Optional[str] = None
    started_at: str
    duration_seconds: int
