from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from portals.api.utils import CurrentActiveUser, DbSession
from portals.services.stripe_service import (
    TIER_DESCRIPTIONS,
    TIER_FEATURES,
    TIER_LABELS,
    create_checkout_session,
    create_portal_session,
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


class SubscriptionResponse(BaseModel):
    tier: str
    status: str | None
    current_period_end: str | None
    cancel_at_period_end: bool | None


class CreateCheckoutRequest(BaseModel):
    tier: str
    success_url: str | None = None
    cancel_url: str | None = None


class CreateCheckoutResponse(BaseModel):
    url: str


class CreatePortalResponse(BaseModel):
    url: str


@router.get("/products", response_model=list[ProductTier])
async def list_products():
    tiers = []
    for tier_id in ["free", "pro", "enterprise"]:
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
):
    return SubscriptionResponse(
        tier=current_user.subscription_tier or "free",
        status=current_user.subscription_status,
        current_period_end=current_user.current_period_end.isoformat()
        if current_user.current_period_end
        else None,
        cancel_at_period_end=current_user.cancel_at_period_end,
    )


@router.post("/create-checkout", response_model=CreateCheckoutResponse)
async def create_checkout(
    body: CreateCheckoutRequest,
    current_user: CurrentActiveUser,
    db: DbSession,
):
    try:
        success_url = (
            body.success_url or f"{NEXT_PUBLIC_URL}/settings/billing?success=true"
        )
        cancel_url = (
            body.cancel_url or f"{NEXT_PUBLIC_URL}/settings/billing?canceled=true"
        )
        url = await create_checkout_session(
            user=current_user,
            tier=body.tier,
            success_url=success_url,
            cancel_url=cancel_url,
            db=db,
        )
        return CreateCheckoutResponse(url=url)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        ) from e
