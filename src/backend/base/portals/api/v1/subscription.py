from __future__ import annotations

import logging
import os

import sqlalchemy
import stripe
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from portals.api.utils import CurrentActiveUser, DbSession
from portals.services.stripe_service import (
    TIER_DESCRIPTIONS,
    TIER_FEATURES,
    TIER_LABELS,
    create_checkout_session,
    create_credit_checkout_session,
    create_portal_session,
    get_cached_products,
    get_price_id,
)

router = APIRouter(tags=["Subscription"])

NEXT_PUBLIC_URL = os.getenv("NEXT_PUBLIC_URL", "http://localhost:7860")


class ProductTier(BaseModel):
    id: str
    name: str
    description: str
    features: list[str]
    price_id: str | None
    price: int | None = None
    currency: str | None = None


class CreditPackageResponse(BaseModel):
    id: int
    name: str
    credits: int
    price_cents: int | None = None
    currency: str


class SubscriptionResponse(BaseModel):
    tier: str
    status: str | None
    current_period_end: str | None
    cancel_at_period_end: bool | None
    allowance_balance: int = 0
    purchased_balance: int = 0


class CreateCheckoutRequest(BaseModel):
    tier: str
    success_url: str | None = None
    cancel_url: str | None = None


class CreateCreditCheckoutRequest(BaseModel):
    package_id: int
    success_url: str | None = None
    cancel_url: str | None = None


class CreditCostsResponse(BaseModel):
    model_credit_costs: dict[str, int]
    allowance_balance: int = 0
    purchased_balance: int = 0


class CreateCheckoutResponse(BaseModel):
    url: str


class CreatePortalResponse(BaseModel):
    url: str


@router.get("/products", response_model=list[ProductTier])
async def list_products(db: DbSession):
    """List available subscription tiers.

    Reads from the local Stripe product cache first, falling back to
    hardcoded tier data if the cache is unavailable.
    """
    # Try to read cached products from DB first
    try:
        cached = await get_cached_products(db)
        if cached:
            tiers = []
            for product in cached:
                tier_id = product["tier"] or "free"
                tiers.append(
                    ProductTier(
                        id=tier_id,
                        name=product["name"] or TIER_LABELS.get(tier_id, tier_id),
                        description=product.get("description") or TIER_DESCRIPTIONS.get(tier_id, ""),
                        features=TIER_FEATURES.get(tier_id, []),
                        price_id=product["price_id"],
                        price=product["unit_amount"],
                        currency=product["currency"],
                    )
                )
            return tiers
    except Exception:
        pass

    # Fallback to hardcoded tier data
    tiers = []
    for tier_id in ["free", "pro", "studio"]:
        price_id = get_price_id(tier_id)
        price_info = None
        if price_id:
            try:
                import stripe

                price = stripe.Price.retrieve(price_id)
                price_info = {
                    "price": price["unit_amount"],
                    "currency": price["currency"].upper(),
                }
            except Exception:
                pass
        tiers.append(
            ProductTier(
                id=tier_id,
                name=TIER_LABELS.get(tier_id, tier_id),
                description=TIER_DESCRIPTIONS.get(tier_id, ""),
                features=TIER_FEATURES.get(tier_id, []),
                price_id=price_id or None,
                **(price_info or {}),
            )
        )
    return tiers


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    current_user: CurrentActiveUser,
    db: DbSession,
):
    from portals.services import credit_service

    balance_info = {"allowance_balance": 0, "purchased_balance": 0}
    # Try to read credit balances from DB (gracefully handles missing table)
    try:
        balance_info = await credit_service.get_balance(str(current_user.id), db)
    except Exception:
        pass

    return SubscriptionResponse(
        tier=current_user.subscription_tier or "free",
        status=current_user.subscription_status,
        current_period_end=current_user.current_period_end.isoformat() if current_user.current_period_end else None,
        cancel_at_period_end=current_user.cancel_at_period_end,
        **balance_info,
    )


@router.get("/credit-packages", response_model=list[CreditPackageResponse])
async def list_credit_packages(db: DbSession):
    """List available credit top-up packages."""
    try:
        result = await db.execute(
            sqlalchemy.text("""
                SELECT id, name, credits, unit_amount AS price_cents, currency
                FROM stripe_product
                WHERE type = 'credit_pack' AND is_active = true
                ORDER BY credits ASC
            """)
        )
        rows = result.mappings().all()
        return [
            CreditPackageResponse(
                id=row["id"],
                name=row["name"],
                credits=row["credits"],
                price_cents=row["price_cents"],
                currency=row["currency"],
            )
            for row in rows
        ]
    except Exception:
        return []


@router.post("/create-checkout", response_model=CreateCheckoutResponse)
async def create_checkout(
    body: CreateCheckoutRequest,
    current_user: CurrentActiveUser,
    db: DbSession,
):
    try:
        success_url = body.success_url or f"{NEXT_PUBLIC_URL}/settings/billing?success=true"
        cancel_url = body.cancel_url or f"{NEXT_PUBLIC_URL}/settings/billing?canceled=true"
        url = await create_checkout_session(
            user=current_user,
            tier=body.tier,
            success_url=success_url,
            cancel_url=cancel_url,
            db=db,
        )
        return CreateCheckoutResponse(url=url)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment service error. Please try again.",
        ) from e


@router.post("/create-portal", response_model=CreatePortalResponse)
async def create_portal(
    current_user: CurrentActiveUser,
):
    try:
        return_url = f"{NEXT_PUBLIC_URL}/settings/billing"
        url = await create_portal_session(current_user, return_url=return_url)
        return CreatePortalResponse(url=url)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.get("/credit-costs", response_model=CreditCostsResponse)
async def get_credit_costs(
    current_user: CurrentActiveUser,
    db: DbSession,
):
    """Return credit costs per model type and the user's current balance."""
    from portals.services import credit_service, feature_authorizer

    features = await feature_authorizer.get_available_features(current_user, db)
    model_credit_costs = {f["feature"]: f["credit_cost"] for f in features}

    try:
        balance = await credit_service.get_balance(str(current_user.id), db)
    except Exception as e:
        logger.warning("Failed to fetch credit balance: %s", e)
        balance = {"allowance_balance": 0, "purchased_balance": 0}

    return CreditCostsResponse(
        model_credit_costs=model_credit_costs,
        allowance_balance=balance.get("allowance_balance", 0),
        purchased_balance=balance.get("purchased_balance", 0),
    )


@router.post("/create-credit-checkout", response_model=CreateCheckoutResponse)
async def create_credit_checkout(
    body: CreateCreditCheckoutRequest,
    current_user: CurrentActiveUser,
    db: DbSession,
):
    """Create a one-time Stripe checkout session to purchase a credit package."""
    try:
        success_url = body.success_url or f"{NEXT_PUBLIC_URL}/settings/billing?credit_success=true"
        cancel_url = body.cancel_url or f"{NEXT_PUBLIC_URL}/settings/billing?canceled=true"
        url = await create_credit_checkout_session(
            user=current_user,
            package_id=body.package_id,
            success_url=success_url,
            cancel_url=cancel_url,
            db=db,
        )
        return CreateCheckoutResponse(url=url)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment service error. Please try again.",
        ) from e
