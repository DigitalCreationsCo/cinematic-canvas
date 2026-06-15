from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Notification(SQLModel, table=True):  # type: ignore[call-arg]
    """In-app notification for a user.

    Created by migration 0022. Polled by frontend every 30 seconds.
    """

    __tablename__: str = "notification"

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    type: str = Field(
        default="info"
    )  # "info", "warning", "error", "credit_exhausted", "credit_granted", "job_completed"
    title: str = Field(default="")
    message: str = Field(default="")
    is_read: bool = Field(default=False)
    reference_type: str | None = Field(default=None)  # "flow_run", "credit_purchase", etc.
    reference_id: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
