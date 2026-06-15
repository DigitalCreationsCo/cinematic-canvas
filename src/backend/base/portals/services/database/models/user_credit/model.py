from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class UserCredit(SQLModel, table=True):  # type: ignore[call-arg]
    """Tracks a user's credit balances.

    Created by migration 0021. Two credit pools:
    - allowance_balance: monthly + trial credits, resets/forfeits
    - purchased_balance: top-up credits, permanent (never forfeited)
    """

    __tablename__: str = "user_credit"

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(unique=True, index=True)
    allowance_balance: int = Field(default=0)
    purchased_balance: int = Field(default=0)
    total_earned: int = Field(default=0)
    total_spent: int = Field(default=0)
    trial_credits_used: bool = Field(default=False)
    last_allowance_date: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
