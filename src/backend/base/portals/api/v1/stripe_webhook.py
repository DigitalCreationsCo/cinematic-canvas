from __future__ import annotations

import logging

import sqlalchemy
import stripe
from fastapi import APIRouter, Header, HTTPException, Request, status

from portals.services.deps import session_scope
from portals.services.stripe_service import (
    STRIPE_WEBHOOK_SECRET,
    handle_checkout_completed,
    handle_invoice_paid,
    handle_payment_failed,
    handle_subscription_canceled,
    handle_subscription_updated,
    sync_stripe_products_to_db,
)

logger = logging.getLogger(__name__)

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
    event_data = event.get("data", {}).get("object", {}) if isinstance(event, dict) else event.data.object

    async with session_scope() as db:
        # ── Product updates: keep local cache in sync ──────────────
        if event_type in (
            "product.created",
            "product.updated",
            "product.deleted",
            "price.created",
            "price.updated",
            "price.deleted",
        ):
            await sync_stripe_products_to_db(db)
            return {"status": "ok"}

        # ── Credit purchase checkout ───────────────────────────────
        if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            metadata = event_data.get("metadata", {})
            checkout_type = metadata.get("type", "subscription")

            if checkout_type == "credit_purchase":
                await _handle_credit_purchase(event_data, db)
            else:
                await handle_checkout_completed(event_data, db)
            return {"status": "ok"}

        # Async payment failure — log and notify (credits were never granted)
        if event_type == "checkout.session.async_payment_failed":
            metadata = event_data.get("metadata", {})
            checkout_type = metadata.get("type", "subscription")
            if checkout_type == "credit_purchase":
                logger.warning(
                    "Async payment failed for credit purchase session %s",
                    event_data.get("id"),
                )
            return {"status": "ok"}

        # ── Subscription lifecycle events ──────────────────────────
        handlers: dict[str, callable] = {
            "customer.subscription.updated": handle_subscription_updated,
            "customer.subscription.deleted": handle_subscription_canceled,
            "invoice.paid": handle_invoice_paid,
            "invoice.payment_failed": handle_payment_failed,
        }

        handler = handlers.get(event_type)
        if handler:
            if event_type == "invoice.payment_failed":
                result = await handler(event_data)
                if result:
                    logger.warning("Payment failed: %s", result)
            else:
                await handler(event_data, db)

    return {"status": "ok"}


async def _handle_credit_purchase(session: dict, db) -> None:
    """Handle a completed credit-package checkout session."""
    from portals.services import credit_service
    from portals.services.database.models.user.crud import get_user_by_id

    user_id = session.get("metadata", {}).get("userId")
    package_id = session.get("metadata", {}).get("packageId")
    payment_status = session.get("payment_status")

    if not user_id or not package_id:
        logger.warning("Credit purchase missing userId or packageId in metadata")
        return

    if payment_status != "paid":
        logger.info("Credit purchase not yet paid (status=%s), skipping", payment_status)
        return

    user = await get_user_by_id(db, user_id)
    if not user:
        logger.warning("User %s not found for credit purchase", user_id)
        return

    # Parse package_id safely
    try:
        parsed_pkg_id = int(package_id)
    except (ValueError, TypeError):
        logger.critical(
            "Non-numeric packageId '%s' in credit purchase metadata (session %s). Manual audit required.",
            package_id,
            session.get("id"),
        )
        return

    # Look up the package to get credit amount
    try:
        result = await db.execute(
            sqlalchemy.text("SELECT credits FROM stripe_product WHERE id = :id AND type = 'credit_pack'"),
            {"id": parsed_pkg_id},
        )
        row = result.one_or_none()
        if not row:
            logger.warning("Credit package %s not found in cache", package_id)
            return
        credit_amount = row[0]
    except Exception as e:
        logger.error("Failed to look up credit package %s: %s", package_id, e)
        return

    # Idempotency: skip if this Stripe session was already processed
    try:
        dup = await db.execute(
            sqlalchemy.text(
                "SELECT 1 FROM credit_transaction WHERE reference_type = 'stripe_session' AND reference_id = :sid"
            ),
            {"sid": session.get("id")},
        )
        if dup.one_or_none():
            logger.info(
                "Credit purchase session %s already processed, skipping",
                session.get("id"),
            )
            return
    except Exception as e:
        logger.error("Idempotency check failed: %s", e)
        # Proceed — better to risk a duplicate than to miss a grant

    # Grant purchased credits via CreditService
    try:
        await credit_service.grant_purchase(
            user_id=user_id,
            credits=credit_amount,
            session_id=session.get("id", ""),
            db=db,
        )
        await db.commit()
        logger.info(
            "Granted %d purchased credits to user %s (session %s)",
            credit_amount,
            user_id,
            session.get("id"),
        )

        # Check for queued jobs that might now have enough credits
        try:
            pending = await credit_service.process_pending_jobs(user_id, db)
            if pending:
                logger.info(
                    "User %s has %d pending job(s) that may now be Runnable after credit top-up",
                    user_id,
                    len(pending),
                )
        except Exception:
            logger.exception("Failed to check pending jobs after credit grant")
    except Exception as e:
        await db.rollback()
        logger.error(
            "Failed to grant credits for purchase (user=%s, session=%s): %s",
            user_id,
            session.get("id"),
            e,
        )
        raise  # re-raise so Stripe sees the HTTP 500 and retries the webhook
