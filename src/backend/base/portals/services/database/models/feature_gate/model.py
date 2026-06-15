from datetime import datetime, timezone

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlalchemy.sql import func
from sqlmodel import Field, SQLModel


class FeatureGate(SQLModel, table=True):  # type: ignore[call-arg]
    """Defines feature availability per tier and per-model credit costs.

    Deny-by-default: if no row exists for a (feature, tier) pair, access is denied.
    Seed via Alembic migration (no admin UI).

    Config JSONB stores:
        {"credit_cost": 5, "per_model": {"model-x": 10, "model-y": 3}}

    Created by migration 0022.
    """

    __tablename__: str = "feature_gate"
    __table_args__ = (UniqueConstraint("feature", "tier", name="uq_feature_gate_feature_tier"),)

    id: int | None = Field(default=None, primary_key=True)
    feature: str = Field(index=True)  # "image_generation", "video_generation", "language"
    tier: str = Field(index=True)  # "free", "pro", "studio"
    description: str = Field(default="")
    enabled: bool = Field(default=False)
    config: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), sa_column_kwargs={"server_default": func.now()}
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column_kwargs={"server_default": func.now(), "onupdate": func.now()},
    )
