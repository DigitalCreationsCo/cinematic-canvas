from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class CreditTransaction(SQLModel, table=True):  # type: ignore[call-arg]
    """Audit log for all credit movements.

    Created by migration 0021. Records every credit earn/spend/expiry event.
    """

    __tablename__: str = "credit_transaction"

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    amount: int = Field()  # positive = grant, negative = deduction
    balance_type: str = Field(default="allowance")  # "allowance" or "purchased"
    reason: str = Field()  # "grant_monthly", "trial", "purchase", "deduction", "expiry", "refund"
    reference_type: str | None = Field(default=None)  # "flow_run", "stripe_session", "admin"
    reference_id: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
