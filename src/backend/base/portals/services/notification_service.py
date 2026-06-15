"""In-app notification service.

Notifications are stored in the database and polled by the frontend
every 30 seconds (via GET /v1/notifications/poll).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import func
from sqlmodel import select, update

from portals.services.database.models.notification import Notification

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)


async def create_notification(
    user_id: str,
    type: str,
    title: str,
    message: str,
    db: AsyncSession,
    reference_type: str | None = None,
    reference_id: str | None = None,
) -> Notification:
    """Create a new notification for a user."""
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    db.add(notif)
    await db.flush()
    return notif


async def get_notifications(
    user_id: str,
    db: AsyncSession,
    limit: int = 50,
    unread_only: bool = False,
) -> list[Notification]:
    """Get notifications for a user, newest first."""
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read == False)  # noqa: E712

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_unread_count(user_id: str, db: AsyncSession) -> int:
    """Get the number of unread notifications for a user (lightweight COUNT query)."""
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
    )
    count = result.scalar()
    return count or 0


async def mark_read(
    notification_id: int,
    user_id: str,
    db: AsyncSession,
) -> bool:
    """Mark a single notification as read. Returns True if found and updated."""
    result = await db.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        .values(is_read=True)
    )
    await db.flush()
    return result.rowcount > 0


async def mark_all_read(user_id: str, db: AsyncSession) -> int:
    """Mark all notifications as read for a user. Returns count updated."""
    result = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    await db.flush()
    return result.rowcount or 0
