from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import sqlalchemy
import stripe

from portals.services.database.models.user.crud import get_user_by_id

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from portals.services.database.models.user.model import User

logger = logging.getLogger(__name__)

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_FREE = os.getenv("STRIPE_PRICE_FREE", "")
STRIPE_PRICE_PRO = os.getenv("STRIPE_PRICE_PRO", "")
# Backward-compat: keep reading old env var name but prefer the new one
STRIPE_PRICE_ENTERPRISE = os.getenv("STRIPE_PRICE_ENTERPRISE", "")
STRIPE_PRICE_STUDIO = os.getenv("STRIPE_PRICE_STUDIO", "") or STRIPE_PRICE_ENTERPRISE

PRICES: dict[str, str] = {
    "free": STRIPE_PRICE_FREE,
    "pro": STRIPE_PRICE_PRO,
    "studio": STRIPE_PRICE_STUDIO,
}

TIER_LABELS: dict[str, str] = {
    "free": "Free",
    "pro": "Pro",
    "studio": "Studio",
}

TIER_DESCRIPTIONS: dict[str, str] = {
    "free": "Basic access with limited features",
    "pro": "Advanced features for professionals",
    "studio": "Full access with dedicated support and premium capabilities",
}

TIER_FEATURES: dict[str, list[str]] = {
    "free": ["Basic flows", "Community support", "1 active project"],
    "pro": ["Unlimited flows", "Priority support", "API access", "Team collaboration"],
    "studio": [
        "Everything in Pro",
        "Dedicated support",
        "Custom integrations",
        "SLA guarantee",
        "SSO",
    ],
}

# Legacy mapping for backward compatibility during migration
_LEGACY_TIERS: dict[str, str] = {
    "enterprise": "studio",
}

stripe.api_key = STRIPE_SECRET_KEY


def get_price_id(tier: str) -> str | None:
    # Map legacy tier names to new ones
    mapped_tier = _LEGACY_TIERS.get(tier, tier)
    return PRICES.get(mapped_tier)


def get_tier_from_price(price_id: str) -> str:
    # Check current tiers first
    for tier, pid in PRICES.items():
        if pid == price_id:
            return tier
    # Check legacy enterprise price (backward compat during migration)
    if STRIPE_PRICE_ENTERPRISE and price_id == STRIPE_PRICE_ENTERPRISE:
        return "studio"
    return "free"


async def get_or_create_stripe_customer(user: User, db: AsyncSession) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id
    customer = stripe.Customer.create(
        email=user.username,
        metadata={"userId": str(user.id)},
    )
    user.stripe_customer_id = customer.id
    db.add(user)
    await db.flush()
    return customer.id


async def create_checkout_session(
    user: User,
    tier: str,
    success_url: str,
    cancel_url: str,
    db: AsyncSession,
) -> str:
    price_id = get_price_id(tier)
    if not price_id:
        msg = f"Invalid tier: {tier}"
        raise ValueError(msg)

    customer_id = await get_or_create_stripe_customer(user, db)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        subscription_data={"metadata": {"userId": str(user.id)}},
        allow_promotion_codes=True,
    )
    return session.url


async def create_credit_checkout_session(
    user: User,
    package_id: int,
    success_url: str,
    cancel_url: str,
    db: AsyncSession,
) -> str:
    """Create a one-time payment checkout session for a credit package.

    Retrieves the ``StripeProduct`` row for the given ``package_id``,
    creates a Stripe payment-mode checkout, and returns the redirect URL.

    Raises ``ValueError`` if the package is not found or inactive.
    """
    from sqlmodel import select

    from portals.services.database.models.stripe_product.model import StripeProduct

    result = await db.execute(
        select(StripeProduct).where(
            StripeProduct.id == package_id,
            StripeProduct.type == "credit_pack",
            StripeProduct.is_active == True,  # noqa: E712
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        msg = f"Credit package {package_id} not found or inactive"
        raise ValueError(msg)

    customer_id = await get_or_create_stripe_customer(user, db)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="payment",
        line_items=[{"price": product.stripe_price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "type": "credit_purchase",
            "userId": str(user.id),
            "packageId": str(package_id),
        },
    )
    return session.url


async def create_portal_session(user: User, return_url: str) -> str:
    if not user.stripe_customer_id:
        msg = "No Stripe customer found"
        raise ValueError(msg)

    session = stripe.billing_portal.Sessions.create(
        customer=user.stripe_customer_id,
        return_url=return_url,
    )
    return session.url


async def handle_checkout_completed(session: dict, db: AsyncSession) -> None:
    user_id = session.get("metadata", {}).get("userId")
    subscription_id = session.get("subscription")
    if not user_id or not subscription_id:
        return

    user = await get_user_by_id(db, user_id)
    if not user:
        return

    subscription = stripe.Subscription.retrieve(subscription_id)
    price_id = subscription["items"]["data"][0]["price"]["id"]
    tier = get_tier_from_price(price_id)

    user.stripe_subscription_id = subscription_id
    user.stripe_customer_id = session.get("customer", user.stripe_customer_id)
    user.subscription_tier = tier
    user.subscription_status = subscription["status"]
    user.current_period_end = datetime.fromtimestamp(subscription["current_period_end"], tz=timezone.utc)
    db.add(user)
    await db.flush()


async def handle_subscription_updated(subscription: dict, db: AsyncSession) -> None:
    user_id = subscription.get("metadata", {}).get("userId")
    if not user_id:
        return

    user = await get_user_by_id(db, user_id)
    if not user:
        return

    price_id = subscription["items"]["data"][0]["price"]["id"]
    new_tier = get_tier_from_price(price_id)
    old_tier = user.subscription_tier or "free"

    user.subscription_tier = new_tier
    user.subscription_status = subscription["status"]
    user.current_period_end = datetime.fromtimestamp(subscription["current_period_end"], tz=timezone.utc)
    user.cancel_at_period_end = subscription.get("cancel_at_period_end", False)
    db.add(user)
    await db.flush()

    # ── Credit handling on tier change ──────────────────────────────
    # On upgrade: grant full new-tier allowance immediately,
    # overwriting balance with max(existing, new_allowance).
    # On downgrade: freeze allowance_balance, no new grants until next cycle.
    from portals.services import credit_service

    tier_order = {"free": 0, "pro": 1, "studio": 2}
    if tier_order.get(new_tier, 0) > tier_order.get(old_tier, 0):
        # Mid-cycle upgrade — give the new tier's allowance
        old_allowance = credit_service.MONTHLY_ALLOWANCES.get(old_tier, 0)
        new_allowance = credit_service.MONTHLY_ALLOWANCES.get(new_tier, 0)
        if new_allowance > old_allowance:
            top_up = new_allowance - old_allowance
            credit_row = await credit_service._ensure_user_credit_row(user_id, db, for_update=True)  # noqa: SLF001
            credit_row.allowance_balance = max(credit_row.allowance_balance, new_allowance)
            credit_row.total_earned += top_up
            await credit_service._record_transaction(  # noqa: SLF001
                user_id,
                top_up,
                "allowance",
                "upgrade",
                db,
            )
            db.add(credit_row)
            await db.flush()
            logger.info(
                "Upgraded user %s from %s to %s — topped up allowance by %d",
                user_id,
                old_tier,
                new_tier,
                top_up,
            )


async def handle_subscription_canceled(subscription: dict, db: AsyncSession) -> None:
    user_id = subscription.get("metadata", {}).get("userId")
    if not user_id:
        return

    user = await get_user_by_id(db, user_id)
    if not user:
        return

    user.subscription_tier = "free"
    user.subscription_status = "canceled"
    user.stripe_subscription_id = None
    db.add(user)
    await db.flush()

    # Forfeit allowance balance (purchased credits survive)
    from portals.services import credit_service

    credit_row = await credit_service._ensure_user_credit_row(user_id, db, for_update=True)  # noqa: SLF001
    forfeited = credit_row.allowance_balance
    if forfeited > 0:
        credit_row.allowance_balance = 0
        await credit_service._record_transaction(  # noqa: SLF001
            user_id,
            -forfeited,
            "allowance",
            "forfeit_cancel",
            db,
        )
        db.add(credit_row)
        await db.flush()
        logger.info(
            "Forfeited %d allowance credits for canceled user %s",
            forfeited,
            user_id,
        )

    # ── Purge BYOK credentials on subscription cancel ────────────────
    # When a user cancels their subscription (or it expires) their
    # BYOK keys stored in the Variable table must be deleted so that
    # the user cannot continue using provisioned model access through
    # old credentials they configured while on the studio tier.
    #
    # Only rows with type='Credential' (BYOK keys) are removed —
    # generic variables are preserved.
    #
    # CRITICAL: the WHERE clause MUST be scoped to this user.  A
    # bare DELETE on the variable table would be catastrophic.
    from portals.services.database.models.variable.model import Variable

    deleted_count = 0
    try:
        result = await db.execute(
            sqlalchemy.delete(Variable).where(
                Variable.user_id == user_id,
                Variable.type == "Credential",
            )
        )
        deleted_count = result.rowcount  # type: ignore[attr-defined]
        await db.flush()
    except Exception:
        logger.exception(
            "Failed to purge BYOK credentials for canceled user %s",
            user_id,
        )
        # Do not re-raise — the subscription cancellation itself
        # succeeded; credential cleanup is best-effort.

    if deleted_count:
        logger.info(
            "Purged %d BYOK credential(s) for canceled user %s",
            deleted_count,
            user_id,
        )


async def handle_invoice_paid(invoice: dict, db: AsyncSession) -> None:
    """Handle a successful invoice payment — grant monthly allowance credits.

    The invoice's ``subscription`` field references the Stripe subscription,
    which is stored on the user model as ``stripe_subscription_id``.
    """
    subscription_id = invoice.get("subscription")
    if not subscription_id:
        return

    from portals.services.database.models.user.crud import get_user_by_stripe_subscription_id

    user = await get_user_by_stripe_subscription_id(db, subscription_id)
    if not user:
        return

    from portals.services import credit_service

    await credit_service.grant_monthly_allowance(str(user.id), db)
    logger.info(
        "Granted monthly allowance for user %s after invoice paid (sub %s)",
        user.id,
        subscription_id,
    )


async def handle_payment_failed(invoice: dict) -> dict:
    amount = invoice.get("amount_due", 0) / 100
    next_attempt = invoice.get("next_payment_attempt")
    return {
        "amount": amount,
        "next_retry": datetime.fromtimestamp(next_attempt, tz=timezone.utc) if next_attempt else None,
    }


# ─── Stripe product caching ────────────────────────────────────────────


async def sync_stripe_products_to_db(db: AsyncSession) -> None:
    """Fetch all products & prices from Stripe and upsert into the local DB cache."""
    from portals.services.database.models.stripe_product.model import StripeProduct

    if not STRIPE_SECRET_KEY:
        logger.warning("STRIPE_SECRET_KEY not configured, skipping product sync")
        return

    try:
        prices = stripe.Price.list(active=True, expand=["data.product"], limit=100)
    except stripe.error.StripeError:
        logger.exception("Failed to fetch Stripe prices: %s")
        return

    synced_ids: list[str] = []
    synced_count = 0
    now = datetime.now(timezone.utc)

    for price in prices.auto_paging_iter():
        synced_ids.append(price["id"])
        product = price.get("product", {})
        if isinstance(product, str):
            try:
                product = stripe.Product.retrieve(product)
            except stripe.error.StripeError:
                continue

        product_metadata = product.get("metadata", {}) or {}
        tier = product_metadata.get("tier") or _infer_tier_from_price(price)
        price_type = "credit_pack" if product_metadata.get("type") == "credit_pack" else "subscription"

        product_credits = product_metadata.get("credits")
        if credits is not None:
            try:
                product_credits = int(credits)
            except (ValueError, TypeError):
                product_credits = None

        # Upsert using SQLAlchemy ORM (works with both PostgreSQL and SQLite)
        existing = await db.execute(
            sqlalchemy.select(StripeProduct).where(StripeProduct.stripe_price_id == price["id"])
        )
        existing_row = existing.scalar_one_or_none()

        if existing_row:
            existing_row.stripe_product_id = product["id"]
            existing_row.name = product.get("name", "")
            existing_row.description = product.get("description", "")
            existing_row.tier = tier
            existing_row.type = price_type
            existing_row.product_credits = product_credits
            existing_row.unit_amount = price.get("unit_amount")
            existing_row.currency = (price.get("currency") or "usd").upper()
            existing_row.product_metadata = product_metadata
            existing_row.is_active = product.get("active", True)
            existing_row.last_synced_at = now
            db.add(existing_row)
        else:
            new_product = StripeProduct(
                stripe_product_id=product["id"],
                stripe_price_id=price["id"],
                name=product.get("name", ""),
                description=product.get("description", ""),
                tier=tier,
                type=price_type,
                product_credits=product_credits,
                unit_amount=price.get("unit_amount"),
                currency=(price.get("currency") or "usd").upper(),
                product_metadata=product_metadata,
                is_active=product.get("active", True),
                last_synced_at=now,
            )
            db.add(new_product)

        synced_count += 1

    # Deactivate products that no longer exist in Stripe
    if synced_ids:
        await db.execute(
            sqlalchemy.update(StripeProduct)
            .where(
                StripeProduct.stripe_price_id.notin_(synced_ids),
                StripeProduct.is_active == True,  # noqa: E712
            )
            .values(is_active=False)
        )

    await db.commit()

    logger.info("Synced %d Stripe products/prices to local cache", synced_count)


def _infer_tier_from_price(price: dict) -> str | None:
    """Try to infer the tier from a price's lookup key or metadata."""
    lookup_key = price.get("lookup_key", "") or ""
    metadata = price.get("metadata", {})
    tier = metadata.get("tier")

    if tier:
        return _LEGACY_TIERS.get(tier, tier)

    # Fall back to lookup_key heuristic (e.g. "portals-pro-monthly")
    for known_tier in ("studio", "pro", "free"):
        if known_tier in lookup_key.lower():
            return known_tier

    return None


async def get_cached_products(db: AsyncSession) -> list[dict]:
    """Read cached subscription product tiers from the local DB."""
    from portals.services.database.models.stripe_product.model import StripeProduct

    result = await db.execute(
        sqlalchemy.select(StripeProduct)
        .where(
            StripeProduct.is_active == True,  # noqa: E712
            StripeProduct.type == "subscription",
        )
        .order_by(StripeProduct.tier, StripeProduct.last_synced_at.desc())
    )
    rows = result.scalars().all()

    # Deduplicate by tier (keep latest for each tier)
    seen_tiers: set[str] = set()
    products = []
    for row in rows:
        if row.tier and row.tier not in seen_tiers:
            seen_tiers.add(row.tier)
            products.append(
                {
                    "price_id": row.stripe_price_id,
                    "product_id": row.stripe_product_id,
                    "name": row.name,
                    "description": row.description,
                    "tier": row.tier,
                    "type": row.type,
                    "credits": row.credits,
                    "unit_amount": row.unit_amount,
                    "currency": row.currency,
                    "metadata": row.metadata,
                    "is_active": row.is_active,
                }
            )
    return products
