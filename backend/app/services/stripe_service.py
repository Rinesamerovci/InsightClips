from __future__ import annotations

import os
from typing import Any

import stripe

from app.config import get_settings

settings = get_settings()
stripe.api_key = settings.stripe_secret_key or os.environ.get("STRIPE_SECRET_KEY")


def create_checkout_session(podcast_id: str, price: float, success_url: str, cancel_url: str) -> dict[str, Any]:
    # price is in dollars - Stripe expects cents
    amount_cents = int(round(price * 100))
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        mode="payment",
        line_items=[
            {
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"InsightClips processing: {podcast_id}"},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }
        ],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"podcast_id": podcast_id},
    )
    return {"id": session.id, "url": session.url}
