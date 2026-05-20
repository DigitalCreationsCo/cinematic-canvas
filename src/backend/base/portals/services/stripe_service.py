from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import stripe

from portals.services.database.models.user.crud import get_user_by_id
from portals.services.database.models.user.model import User

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_FREE = os.getenv("STRIPE_PRICE_FREE", "")
STRIPE_PRICE_PRO = os.getenv("STRIPE_PRICE_PRO", "")
STRIPE_PRICE_ENTERPRISE = os.getenv("STRIPE_PRICE_ENTERPRISE", "")

PRICES: dict[str, str] = {
    "free": STRIPE_PRICE_FREE,
    "pro": STRIPE_PRICE_PRO,
    "enterprise": STRIPE_PRICE_ENTERPRISE,
}

TIER_LABELS: dict[str, str] = {
    "free": "Free",
    "pro": "Pro",
    "enterprise": "Enterprise",
}

TIER_DESCRIPTIONS: dict[str, str] = {
    "free": "Basic access with limited features",
    "pro": "Advanced features for professionals",
    "enterprise": "Full access with dedicated support",
}

TIER_FEATURES: dict[str, list[str]] = {
    "free": ["Basic flows", "Community support", "1 active project"],
    "pro": ["Unlimited flows", "Priority support", "API access", "Team collaboration"],
    "enterprise": [
        "Everything in Pro",
        "Dedicated support",
        "Custom integrations",
        "SLA guarantee",
        "SSO",
    ],
}

stripe.api_key = STRIPE_SECRET_KEY


def get_price_id(tier: str) -> str | None:
    return PRICES.get(tier)


def get_tier_from_price(price_id: str) -> str:
    for tier, pid in PRICES.items():
        if pid == price_id:
            return tier
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
    user.current_period_end = datetime.fromtimestamp(
        subscription["current_period_end"], tz=timezone.utc
    )
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
    tier = get_tier_from_price(price_id)

    user.subscription_tier = tier
    user.subscription_status = subscription["status"]
    user.current_period_end = datetime.fromtimestamp(
        subscription["current_period_end"], tz=timezone.utc
    )
    user.cancel_at_period_end = subscription.get("cancel_at_period_end", False)
    db.add(user)
    await db.flush()


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


async def handle_payment_failed(invoice: dict) -> dict:
    amount = invoice.get("amount_due", 0) / 100
    next_attempt = invoice.get("next_payment_attempt")
    return {
        "amount": amount,
        "next_retry": datetime.fromtimestamp(next_attempt, tz=timezone.utc)
        if next_attempt
        else None,
    }
