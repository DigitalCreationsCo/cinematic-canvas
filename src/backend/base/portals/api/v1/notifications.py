"""In-app notification endpoints.

Frontend polls GET /v1/notifications/poll every 30 seconds.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from portals.api.utils import CurrentActiveUser, DbSession
from portals.services import notification_service as ns

router = APIRouter(tags=["Notifications"])


# ─── Response models ─────────────────────────────────────────────────────


class NotificationItem(BaseModel):
    id: int
    type: str
    title: str
    message: str
    is_read: bool
    reference_type: str | None = None
    reference_id: str | None = None
    created_at: str


class NotificationListResponse(BaseModel):
    notifications: list[NotificationItem]
    unread_count: int


class UnreadCountResponse(BaseModel):
    count: int


class MarkReadResponse(BaseModel):
    success: bool


class MarkAllReadResponse(BaseModel):
    count: int


# ─── Endpoints ───────────────────────────────────────────────────────────


@router.get("/notifications", response_model=NotificationListResponse)
async def list_notifications(
    current_user: CurrentActiveUser,
    db: DbSession,
    limit: int = 50,
    unread_only: bool = False,
):
    """Get notifications for the current user (newest first)."""
    notifications = await ns.get_notifications(
        str(current_user.id),
        db,
        limit=limit,
        unread_only=unread_only,
    )
    unread_count = await ns.get_unread_count(str(current_user.id), db)

    return NotificationListResponse(
        notifications=[
            NotificationItem(
                id=n.id,
                type=n.type,
                title=n.title,
                message=n.message,
                is_read=n.is_read,
                reference_type=n.reference_type,
                reference_id=n.reference_id,
                created_at=n.created_at.isoformat(),
            )
            for n in notifications
        ],
        unread_count=unread_count,
    )


@router.get("/notifications/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    current_user: CurrentActiveUser,
    db: DbSession,
):
    """Get the count of unread notifications."""
    count = await ns.get_unread_count(str(current_user.id), db)
    return UnreadCountResponse(count=count)


@router.post("/notifications/{notification_id}/read", response_model=MarkReadResponse)
async def mark_notification_read(
    notification_id: int,
    current_user: CurrentActiveUser,
    db: DbSession,
):
    """Mark a single notification as read."""
    success = await ns.mark_read(notification_id, str(current_user.id), db)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return MarkReadResponse(success=True)


@router.post("/notifications/read-all", response_model=MarkAllReadResponse)
async def mark_all_notifications_read(
    current_user: CurrentActiveUser,
    db: DbSession,
):
    """Mark all notifications as read for the current user."""
    count = await ns.mark_all_read(str(current_user.id), db)
    return MarkAllReadResponse(count=count)
