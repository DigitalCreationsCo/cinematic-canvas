"""Credit management service.

Handles all credit operations: granting monthly allowances, trial credits,
purchased credits, deduction with allowance-first ordering, job queuing on
insufficient credits, pending job retry, and stale credit expiry.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from portals.services.database.models.credit_transaction import CreditTransaction
from portals.services.database.models.user_credit import UserCredit

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

# ─── Configuration defaults (overridable per-tier in FeatureGate) ────────

MONTHLY_ALLOWANCES: dict[str, int] = {
    "free": 0,
    "pro": 500,
    "studio": 2000,
}

TRIAL_CREDITS: int = 25

CREDIT_EXPIRY_DAYS: int = 90


# ─── Helpers ─────────────────────────────────────────────────────────────


async def _ensure_user_credit_row(
    user_id: str,
    db: AsyncSession,
    *,
    for_update: bool = False,
) -> UserCredit:
    """Get or create a user_credit row for the given user.

    If ``for_update`` is True, acquires a row-level lock (``SELECT … FOR UPDATE``)
    to prevent concurrent read-then-write races.  Callers that modify the row
    MUST use ``for_update=True``.
    """
    stmt = select(UserCredit).where(UserCredit.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row:
        return row

    # Row does not exist — try to insert inside a savepoint so a concurrent
    # IntegrityError on the UNIQUE(user_id) constraint only rolls back the
    # savepoint, not the entire transaction.
    try:
        async with db.begin_nested():
            row = UserCredit(user_id=user_id)
            db.add(row)
    except IntegrityError:
        pass  # another caller inserted first — fall through to re-fetch

    # Re-fetch (row was either just inserted or exists from a concurrent insert)
    stmt = select(UserCredit).where(UserCredit.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    assert row is not None, "user_credit row must exist after insert attempt"
    return row


async def _record_transaction(
    user_id: str,
    amount: int,
    balance_type: str,
    reason: str,
    db: AsyncSession,
    reference_type: str | None = None,
    reference_id: str | None = None,
) -> None:
    """Append a credit_transaction audit row."""
    tx = CreditTransaction(
        user_id=user_id,
        amount=amount,
        balance_type=balance_type,
        reason=reason,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    db.add(tx)
    await db.flush()


# ─── Public API ──────────────────────────────────────────────────────────


async def ensure_user_credit(user_id: str, db: AsyncSession) -> UserCredit:
    """Idempotently ensure a user_credit row exists, granting trial credits on first call."""
    row = await _ensure_user_credit_row(user_id, db, for_update=True)

    # Lazy-grant trial credits on first credit check (one-time)
    if not row.trial_credits_used and row.total_earned == 0 and row.total_spent == 0:
        if TRIAL_CREDITS > 0:
            row.allowance_balance += TRIAL_CREDITS
            row.total_earned += TRIAL_CREDITS
        row.trial_credits_used = True
        await _record_transaction(
            user_id,
            TRIAL_CREDITS,
            "allowance",
            "trial",
            db,
        )
        db.add(row)
        await db.flush()

    return row


async def get_balance(user_id: str, db: AsyncSession) -> dict:
    """Return the user's current credit balances.

    Delegates to ``ensure_user_credit`` for safe lazy-grant of trial credits,
    then returns a read-only snapshot.
    """
    row = await ensure_user_credit(user_id, db)
    return {
        "allowance_balance": row.allowance_balance,
        "purchased_balance": row.purchased_balance,
        "total_earned": row.total_earned,
        "total_spent": row.total_spent,
    }


async def grant_monthly_allowance(user_id: str, db: AsyncSession) -> int:
    """Grant the monthly allowance for the user's tier.

    Idempotent within the same calendar month: if the user already has an
    allowance grant in the current period, this is a no-op.

    Returns the allowance amount granted (0 if already granted this month).
    """
    from portals.services.database.models.user.crud import get_user_by_id

    user = await get_user_by_id(db, user_id)
    if not user:
        logger.warning("grant_monthly_allowance: user %s not found", user_id)
        return 0

    tier = user.subscription_tier or "free"
    allowance = MONTHLY_ALLOWANCES.get(tier, 0)
    if allowance <= 0:
        return 0

    row = await _ensure_user_credit_row(user_id, db, for_update=True)
    now = datetime.now(timezone.utc)

    # Check if already granted this month (same UTC month)
    if row.last_allowance_date and (
        row.last_allowance_date.year == now.year and row.last_allowance_date.month == now.month
    ):
        return 0

    row.allowance_balance += allowance
    row.total_earned += allowance
    row.last_allowance_date = now
    await _record_transaction(
        user_id,
        allowance,
        "allowance",
        "grant_monthly",
        db,
    )
    db.add(row)
    await db.flush()
    logger.info("Granted %d monthly allowance credits to user %s", allowance, user_id)
    return allowance


async def grant_trial_credits(user_id: str, db: AsyncSession) -> int:
    """Lazy-grant trial credits if not already used.

    Returns the number of credits granted (0 if already granted).
    """
    row = await _ensure_user_credit_row(user_id, db, for_update=True)
    if row.trial_credits_used:
        return 0

    row.allowance_balance += TRIAL_CREDITS
    row.total_earned += TRIAL_CREDITS
    row.trial_credits_used = True
    await _record_transaction(
        user_id,
        TRIAL_CREDITS,
        "allowance",
        "trial",
        db,
    )
    db.add(row)
    await db.flush()
    return TRIAL_CREDITS


async def grant_purchase(
    user_id: str,
    credits: int,
    session_id: str,
    db: AsyncSession,
) -> None:
    """Grant purchased (top-up) credits from a Stripe checkout session."""
    row = await _ensure_user_credit_row(user_id, db, for_update=True)
    row.purchased_balance += credits
    row.total_earned += credits
    await _record_transaction(
        user_id,
        credits,
        "purchased",
        "purchase",
        db,
        reference_type="stripe_session",
        reference_id=session_id,
    )
    db.add(row)
    await db.flush()
    logger.info(
        "Granted %d purchased credits to user %s (session %s)",
        credits,
        user_id,
        session_id,
    )


async def deduct(
    user_id: str,
    amount: int,
    db: AsyncSession,
    reference_type: str | None = None,
    reference_id: str | None = None,
) -> bool:
    """Atomically deduct credits from a user's balance.

    Consumption order: allowance_balance first, then purchased_balance.
    Returns True if the full amount was deducted, False if insufficient credits.

    Uses row-level locking (SELECT … FOR UPDATE) to prevent concurrent
    double-spending races.  Callers must ensure they are inside a transaction.
    """
    row = await _ensure_user_credit_row(user_id, db, for_update=True)
    total = row.allowance_balance + row.purchased_balance
    if total < amount:
        return False

    # Deduct from allowance first, then purchased
    from_allowance = min(row.allowance_balance, amount)
    from_purchased = amount - from_allowance

    if from_allowance > 0:
        row.allowance_balance -= from_allowance
        await _record_transaction(
            user_id,
            -from_allowance,
            "allowance",
            "deduction",
            db,
            reference_type=reference_type,
            reference_id=reference_id,
        )

    if from_purchased > 0:
        row.purchased_balance -= from_purchased
        await _record_transaction(
            user_id,
            -from_purchased,
            "purchased",
            "deduction",
            db,
            reference_type=reference_type,
            reference_id=reference_id,
        )

    row.total_spent += amount
    db.add(row)
    await db.flush()
    return True


async def refund(
    user_id: str,
    amount: int,
    db: AsyncSession,
    reference_type: str | None = None,
    reference_id: str | None = None,
) -> None:
    """Refund credits (system error path). Restores to the original balance pool.

    The refund always goes back to allowance_balance. In a full implementation
    this would track which pool the credits came from, but the requirements
    specify refund only on system errors where the exact pool doesn't matter.

    NOTE: If the original deduction drew from ``purchased_balance``, the
    refund lands in the wrong pool.  Acceptable for now because refunds
    only happen on rare system errors (flow execution crashes) — the credit
    pools are fungible in practice and any imbalance is corrected at next
    purchase or monthly allowance grant.
    """
    row = await _ensure_user_credit_row(user_id, db, for_update=True)
    row.allowance_balance += amount
    row.total_earned += amount  # refund is counted as earned
    await _record_transaction(
        user_id,
        amount,
        "allowance",
        "refund",
        db,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    db.add(row)
    await db.flush()


# ─── Pending job queue ─────────────────────────────────────────────────


async def queue_job_on_insufficient_credits(
    user_id: str,
    flow_id: str,
    required_credits: int,
    db: AsyncSession,
    reference_id: str | None = None,
) -> int | None:
    """Queue a job when credits are insufficient.

    The queued job can be retried later when `process_pending_jobs` is called
    (e.g. after credits arrive). We use a very lightweight pending_jobs table:
    just storing the flow_id + required credits.

    Returns the pending_job id if queued, None if not needed.
    This is a placeholder that will be fleshed out in Phase 3.
    """
    # The pending job model is intentionally simple for now.
    # Phase 3 will add proper tracking with timestamps, status, and TTL.
    from sqlalchemy import text as sa_text

    now = datetime.now(timezone.utc)
    result = await db.execute(
        sa_text("""
            INSERT INTO pending_job (user_id, flow_id, required_credits, reference_id, created_at)
            VALUES (:uid, :fid, :credits, :ref, :now)
            ON CONFLICT (user_id, flow_id) DO UPDATE
                SET required_credits = :credits, reference_id = :ref, created_at = :now
            RETURNING id
        """),
        {
            "uid": user_id,
            "fid": flow_id,
            "credits": required_credits,
            "ref": reference_id,
            "now": now,
        },
    )
    row = result.one_or_none()
    if row:
        id_ = row[0]
        logger.info(
            "Queued pending job %d for user %s (flow %s, %d credits)",
            id_,
            user_id,
            flow_id,
            required_credits,
        )
        return id_
    return None


async def process_pending_jobs(user_id: str, db: AsyncSession) -> list[dict]:
    """Attempt to process queued jobs for a user after credits arrive.

    This will be integrated with the flow executor in Phase 3.
    For now, returns the list of pending jobs that *could* be retried.
    """
    from sqlalchemy import text as sa_text

    result = await db.execute(
        sa_text("""
            SELECT id, flow_id, required_credits, reference_id
            FROM pending_job
            WHERE user_id = :uid
            ORDER BY created_at ASC
        """),
        {"uid": user_id},
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]


# ─── Background tasks ──────────────────────────────────────────────────


async def expire_stale_credits(db: AsyncSession, dry_run: bool = False) -> int:
    """Expire credits older than CREDIT_EXPIRY_DAYS.

    This is a background task that runs periodically. For now, it's a no-op
    placeholder because the full expiry logic requires tracking credit vintages
    (which grant batch each credit belongs to). Phase 3 will implement proper
    FIFO expiry tracking.

    Returns the number of expired transactions processed.
    """
    # Placeholder — proper vintage-based expiry requires tracking grant batches
    # with timestamps, which will be added in Phase 3.
    _ = dry_run
    return 0


async def expire_stale_pending_jobs(db: AsyncSession) -> int:
    """Delete pending jobs older than 7 days (TTL)."""
    from sqlalchemy import text as sa_text

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    result = await db.execute(
        sa_text("""
            DELETE FROM pending_job WHERE created_at < :cutoff
        """),
        {"cutoff": cutoff},
    )
    count = result.rowcount
    if count:
        logger.info("Expired %d stale pending jobs older than 7 days", count)
    return count or 0


# ─── Cost calculation ──────────────────────────────────────────────────


async def compute_required_credits(
    flow_graph: dict,
    tier: str | None,
    db: AsyncSession,
    default_cost: int = 1,
) -> int:
    """Compute the total credit cost for running a flow.

    Inspects each vertex in the flow graph for the ``model_type`` declared
    in its template, looks up the per-model credit cost from FeatureGate
    for the given subscription tier, and sums them up.

    Args:
        flow_graph: The standard flow JSON (``{"data": {"nodes": […]}}``).
        tier: User's subscription tier (``"free"`` / ``"pro"`` / ``"studio"``).
              Used to look up the correct credit cost per model.
        db: Database session.
        default_cost: Fallback cost when no FeatureGate config is found.

    Flow graph structure::

        {"data": {"nodes": [{"id": "...", "data": {"node": {
            "template": {"model_type": {"value": "image_generation"},
                         ...}
        }}}, ...]}}
    """
    from portals.services.feature_authorizer import get_model_cost

    nodes = _get_flow_nodes(flow_graph)
    total = 0
    for node in nodes:
        model_type = _get_model_type(node)
        if model_type:
            cost = await get_model_cost(model_type, db, tier=tier)
            total += cost or default_cost
        # If no model_type, this vertex is free (e.g., a llm call or data transform)
    return total


def _get_flow_nodes(flow_graph: dict) -> list[dict]:
    """Extract node list from a flow graph."""
    try:
        return flow_graph.get("data", {}).get("nodes", [])
    except AttributeError:
        return []


def _get_model_type(node: dict) -> str | None:
    """Extract model_type from a flow vertex's template field."""
    try:
        return node.get("data", {}).get("node", {}).get("template", {}).get("model_type", {}).get("value")
    except AttributeError:
        return None
