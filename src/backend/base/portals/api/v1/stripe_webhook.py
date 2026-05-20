from __future__ import annotations


import stripe
from fastapi import APIRouter, Header, HTTPException, Request, status

from portals.services.deps import session_scope
from portals.services.stripe_service import (
    STRIPE_WEBHOOK_SECRET,
    handle_checkout_completed,
    handle_payment_failed,
    handle_subscription_canceled,
    handle_subscription_updated,
)

router = APIRouter(tags=["Stripe Webhook"], include_in_schema=False)


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None),
):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook secret not configured",
        )
    if not stripe_signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing stripe-signature header",
        )

    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload,
            stripe_signature,
            STRIPE_WEBHOOK_SECRET,
        )
    except stripe.error.SignatureVerificationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature",
        ) from e

    event_type = event.get("type") if isinstance(event, dict) else event.type
    event_data = (
        event.get("data", {}).get("object", {})
        if isinstance(event, dict)
        else event.data.object
    )

    handlers: dict[str, callable] = {
        "checkout.session.completed": handle_checkout_completed,
        "customer.subscription.updated": handle_subscription_updated,
        "customer.subscription.deleted": handle_subscription_canceled,
        "invoice.payment_failed": handle_payment_failed,
    }

    handler = handlers.get(event_type)
    if handler:
        async with session_scope() as db:
            if event_type == "invoice.payment_failed":
                result = await handler(event_data)
                if result:
                    import logging

                    logger = logging.getLogger(__name__)
                    logger.warning("Payment failed: %s", result)
            else:
                await handler(event_data, db)

    return {"status": "ok"}
