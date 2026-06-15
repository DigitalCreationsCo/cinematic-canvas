from datetime import datetime, timezone

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class StripeProduct(SQLModel, table=True):  # type: ignore[call-arg]
    """Cached Stripe product/price data, synced on app startup and via webhooks."""

    id: int | None = Field(default=None, primary_key=True)
    stripe_product_id: str = Field(index=True)
    stripe_price_id: str = Field(unique=True, index=True)
    name: str = Field(default="")
    description: str = Field(default="")
    tier: str | None = Field(default=None, index=True)
    type: str = Field(default="subscription")  # "subscription" or "credit_pack"
    product_credits: int | None = Field(default=None)
    unit_amount: int | None = Field(default=None)
    currency: str = Field(default="USD")
    product_metadata: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_synced_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
