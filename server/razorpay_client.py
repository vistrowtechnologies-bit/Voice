"""Razorpay REST API client — stdlib-only (urllib), same reasoning as
email_sender.py/kb_extract.py: no new dependency for a handful of HTTP calls.

Deliberately does NOT create Razorpay Plans via the API — a Plan (price +
billing interval) is a one-time setup decision, not something this app should
be minting on the fly. Create the six plans (Starter/Growth/Scale x
monthly/annual) once in the Razorpay dashboard yourself, then set their IDs
via RAZORPAY_PLAN_ID_<PLAN>_<CYCLE> env vars (see PLAN_ENV_VARS below). Every
other call here (customers, subscriptions, orders, addons) is safe to do at
runtime.

Nothing in this module can move real money without RAZORPAY_KEY_ID and
RAZORPAY_KEY_SECRET both being set — is_configured() gates every route that
uses it, so the rest of the app keeps working with billing simply disabled
until those are added.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger("vistrow-razorpay")

_API_BASE = "https://api.razorpay.com/v1"

# One Razorpay Plan ID per (plan, billing_cycle) pair, created by hand in the
# Razorpay dashboard (Subscriptions -> Plans) and pasted in as env vars —
# see this module's docstring for why plan creation itself isn't automated.
PLAN_ENV_VARS = {
    ("starter", "monthly"): "RAZORPAY_PLAN_ID_STARTER_MONTHLY",
    ("starter", "annual"): "RAZORPAY_PLAN_ID_STARTER_ANNUAL",
    ("growth", "monthly"): "RAZORPAY_PLAN_ID_GROWTH_MONTHLY",
    ("growth", "annual"): "RAZORPAY_PLAN_ID_GROWTH_ANNUAL",
    ("scale", "monthly"): "RAZORPAY_PLAN_ID_SCALE_MONTHLY",
    ("scale", "annual"): "RAZORPAY_PLAN_ID_SCALE_ANNUAL",
}


class RazorpayNotConfigured(Exception):
    """RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET aren't set yet. Routes catch this
    and return a clear 503 rather than a stack trace — billing is an add-on
    to a product that already works without it."""


class RazorpayError(Exception):
    """A configured Razorpay call itself failed (bad request, auth, etc)."""


def is_configured() -> bool:
    return bool(os.environ.get("RAZORPAY_KEY_ID") and os.environ.get("RAZORPAY_KEY_SECRET"))


def plan_id_for(plan: str, billing_cycle: str) -> str:
    env_var = PLAN_ENV_VARS.get((plan, billing_cycle))
    plan_id = env_var and os.environ.get(env_var)
    if not plan_id:
        raise RazorpayNotConfigured(
            f"No Razorpay plan configured for {plan}/{billing_cycle} — set {env_var or '(unknown plan/cycle)'} "
            "to the Plan ID created in the Razorpay dashboard."
        )
    return plan_id


def _request(method: str, path: str, body: dict | None = None) -> dict:
    key_id = os.environ.get("RAZORPAY_KEY_ID")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        raise RazorpayNotConfigured("RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are not set")
    auth = base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{_API_BASE}{path}",
        data=data,
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
            "User-Agent": "Vistrow-Voice/1.0",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        logger.warning("Razorpay %s %s failed: HTTP %s %s", method, path, e.code, detail)
        raise RazorpayError(f"Razorpay {method} {path} failed: {e.code} {detail}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        logger.warning("Razorpay %s %s failed", method, path, exc_info=True)
        raise RazorpayError(f"Could not reach Razorpay: {e}") from e


def create_customer(name: str, email: str, contact: str = "") -> dict:
    """https://razorpay.com/docs/api/customers/create/ — fail_existing:0 means
    a second signup with the same email/contact returns the existing customer
    instead of erroring, since an account here has exactly one billing
    identity for its whole lifetime."""
    return _request(
        "POST",
        "/customers",
        {"name": name, "email": email, "contact": contact, "fail_existing": "0"},
    )


def create_subscription(
    plan_id: str, customer_id: str, total_count: int, notes: dict | None = None
) -> dict:
    """https://razorpay.com/docs/api/payments/subscriptions/create/
    total_count is how many billing cycles before the subscription needs
    manual renewal — 120 monthly cycles (10 years) / 10 annual cycles is
    effectively "until cancelled" for this product's timescale."""
    return _request(
        "POST",
        "/subscriptions",
        {
            "plan_id": plan_id,
            "customer_notify": 1,
            "total_count": total_count,
            "customer_id": customer_id,
            "notes": notes or {},
        },
    )


def fetch_subscription(subscription_id: str) -> dict:
    return _request("GET", f"/subscriptions/{subscription_id}")


def cancel_subscription(subscription_id: str, cancel_at_cycle_end: bool = True) -> dict:
    return _request(
        "POST",
        f"/subscriptions/{subscription_id}/cancel",
        {"cancel_at_cycle_end": 1 if cancel_at_cycle_end else 0},
    )


def create_subscription_addon(subscription_id: str, amount_inr: float, description: str) -> dict:
    """https://razorpay.com/docs/api/payments/subscriptions/addons/ — bills
    on the subscription's NEXT charge, not immediately. That one-cycle lag is
    a real Razorpay limitation, not a bug here — see the webhook handler in
    token_api.py for how overage/phone-number fees use this."""
    return _request(
        "POST",
        f"/subscriptions/{subscription_id}/addons",
        {
            "item": {
                "name": description,
                "amount": round(amount_inr * 100),
                "currency": "INR",
            },
        },
    )


def create_order(amount_inr: float, receipt: str, notes: dict | None = None) -> dict:
    """One-off charge (credit top-up) — the frontend opens Razorpay Checkout
    against this order_id; /billing/verify-payment confirms the signature
    once the caller completes payment."""
    return _request(
        "POST",
        "/orders",
        {
            "amount": round(amount_inr * 100),
            "currency": "INR",
            "receipt": receipt,
            "notes": notes or {},
        },
    )


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """https://razorpay.com/docs/webhooks/validate-test/ — HMAC-SHA256 of the
    raw request body against RAZORPAY_WEBHOOK_SECRET (set separately from the
    account's own webhook when you create it in the dashboard)."""
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET")
    if not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """https://razorpay.com/docs/payments/server-integration/php/payment-gateway/build-integration/#5-verify-payment-signature
    Confirms the frontend's Checkout callback wasn't forged — same HMAC
    construction as the webhook, but over "order_id|payment_id" and keyed by
    the account SECRET (not the webhook secret)."""
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
    if not key_secret:
        return False
    payload = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(key_secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
