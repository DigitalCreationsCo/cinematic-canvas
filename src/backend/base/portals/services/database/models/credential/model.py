"""Credential model for managed (platform-provisioned) API keys.

This table stores managed API keys per provider.  Managed keys are the
platform-owned credentials used as fallback when a user on a qualifying
tier does not supply their own BYOK key.

BYOK (user-provided) credentials are stored in the ``Variable`` table
with ``type='Credential'`` — they are *not* stored here.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Credential(SQLModel, table=True):  # type: ignore[call-arg]
    """One row per model provider — holds the platform-managed API key.

    Uniqueness is enforced on ``provider`` so there can be at most one
    managed key per provider (e.g. one for OpenAI, one for Anthropic).

    The ``api_key`` value is encrypted at rest using the same Fernet
    encryption used for ``Variable`` rows of type ``Credential``.
    """

    __tablename__: str = "credential"

    id: int | None = Field(default=None, primary_key=True)
    provider: str = Field(index=True, unique=True, description="Provider name, e.g. 'OpenAI'")
    api_key: str = Field(description="Encrypted managed API key")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="When this credential was first stored",
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="When this credential was last updated",
    )
