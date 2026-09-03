"""Sync a tenant's optional live catalog from their website.

The storage and endpoint names retain ``project`` for backwards compatibility,
but the accepted data is intentionally industry-neutral: products, services,
inventory, menus, plans, or real-estate listings all use the same pipeline.

Why not just import the site into the knowledge base? Because KB content is
concatenated verbatim into every system prompt and truncated at 8k chars —
Prophunt's three projects already filled that to 91%, so a fourth would have
silently vanished mid-call with no error anywhere. Listings live in their own
table and reach the agent as (a) a ~40-chars-per-project index in the prompt
and (b) a lookup_catalog tool that pulls full detail only when a caller
actually asks about one.

Prefers a structured JSON feed over scraping. Prophunt's site renders its
project pages client-side, so kb_crawl.fetch_page_text() on
/projects/<slug> returns the literal string "Loading property details…" —
the HTML never contains the data. The same pages fetch /properties/posts.json
to populate themselves, and that feed is the real source of truth: typed
fields, every project including the ones not linked from the index page, and
a status flag separating live inventory from coming-soon.

Stdlib only, reusing kb_crawl._fetch for its SSRF guard (the feed URL is
operator-supplied, so it gets the same public-address validation as any other
operator-supplied URL in this codebase).
"""

import json
import logging
import threading
import time

import calls_db
import kb_crawl

logger = logging.getLogger("vistrow-project-sync")

# Legacy setting key retained so configured production feeds keep working.
FEED_URL_SETTING = "project_feed_url"

_SYNC_INTERVAL_S = 6 * 60 * 60  # listings change rarely; 4x/day is plenty
_started = False
_lock = threading.Lock()


def _variants(row: dict) -> list[dict]:
    """Normalize generic variants plus the legacy flattened property units."""
    nested = row.get("variants") if isinstance(row.get("variants"), list) else row.get("units")
    if isinstance(nested, list):
        out = []
        for item in nested:
            if not isinstance(item, dict):
                continue
            kind = str(item.get("type") or item.get("name") or item.get("label") or "").strip()
            if not kind:
                continue
            out.append({
                "type": kind,
                "area": str(item.get("area") or item.get("details") or item.get("specification") or "").strip(),
                "price": str(item.get("price") or item.get("priceLabel") or item.get("price_label") or "").strip(),
            })
        return out
    out = []
    for i in (1, 2, 3):
        kind = (row.get(f"unit_{i}_type") or "").strip()
        if not kind:
            continue
        out.append({
            "type": kind,
            "area": (row.get(f"unit_{i}_area") or "").strip(),
            "price": (row.get(f"unit_{i}_price") or "").strip(),
        })
    return out


def sync_account(account_id: int, feed_url: str | None = None) -> dict:
    """Pull the feed and replace this account's catalog with what it says.

    Deletes rows whose slug is no longer in the feed: a project the tenant
    took down must stop being something the agent offers, and leaving stale
    rows behind would have the agent pitching withdrawn inventory.
    """
    feed_url = (feed_url or calls_db.get_setting(FEED_URL_SETTING, account_id) or "").strip()
    if not feed_url:
        return {"ok": False, "error": "No live catalog feed URL configured for this account."}

    try:
        rows = json.loads(kb_crawl._fetch(feed_url))
    except Exception as exc:
        logger.warning("live catalog feed fetch/parse failed for account %s: %s", account_id, exc)
        return {"ok": False, "error": f"Could not read the feed: {exc}"}
    if not isinstance(rows, list):
        return {"ok": False, "error": "Feed did not contain a list of catalog items."}
    if not rows:
        conn = calls_db._connect()
        try:
            with conn:
                conn.execute("DELETE FROM project_listings WHERE account_id = ?", (account_id,))
        finally:
            conn.close()
        return {"ok": True, "count": 0, "slugs": []}

    seen: list[str] = []
    conn = calls_db._connect()
    try:
        with conn:
            for row in rows:
                if not isinstance(row, dict):
                    continue
                slug = str(row.get("slug") or row.get("id") or row.get("sku") or "").strip()
                title = str(row.get("title") or row.get("name") or "").strip()
                if not slug or not title:
                    continue
                seen.append(slug)
                numeric_price = row.get("price") if isinstance(row.get("price"), (int, float)) else None
                # The original Prophunt feed defines numeric price in lakhs.
                # Generic catalogs must never inherit that unit assumption.
                legacy_property = any(key in row for key in ("rera", "unit_1_type", "unit_2_type", "unit_3_type"))
                price_from = float(numeric_price) if numeric_price is not None and legacy_property else None
                price_label = str(row.get("priceLabel") or row.get("price_label") or "").strip()
                if not price_label and numeric_price is not None and not legacy_property:
                    price_label = str(numeric_price)
                conn.execute(
                    "INSERT INTO project_listings (account_id, slug, title, developer, location, "
                    "category, status, config, area, rera, price_from, price_label, units_json, amenities_json, "
                    "overview, url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                    "ON CONFLICT (account_id, slug) DO UPDATE SET "
                    "title = EXCLUDED.title, developer = EXCLUDED.developer, "
                    "location = EXCLUDED.location, category = EXCLUDED.category, "
                    "status = EXCLUDED.status, config = EXCLUDED.config, area = EXCLUDED.area, "
                    "rera = EXCLUDED.rera, price_from = EXCLUDED.price_from, price_label = EXCLUDED.price_label, "
                    "units_json = EXCLUDED.units_json, amenities_json = EXCLUDED.amenities_json, "
                    "overview = EXCLUDED.overview, url = EXCLUDED.url, synced_at = now()::text",
                    (
                        account_id,
                        slug,
                        title,
                        str(row.get("developer") or row.get("brand") or row.get("provider") or row.get("vendor") or "").strip(),
                        str(row.get("location") or row.get("region") or "").strip(),
                        str(row.get("category") or row.get("type") or "").strip(),
                        str(row.get("status") or row.get("availability") or "").strip(),
                        str(row.get("config") or row.get("summary") or row.get("specification") or "").strip(),
                        str(row.get("area") or row.get("details") or "").strip(),
                        str(row.get("rera") or row.get("reference") or "").strip(),
                        price_from,
                        price_label,
                        json.dumps(_variants(row), ensure_ascii=False),
                        json.dumps(row.get("amenities") or row.get("features") or [], ensure_ascii=False),
                        str(row.get("overview") or row.get("description") or "").strip(),
                        str(row.get("url") or "").strip(),
                    ),
                )
            if seen:
                placeholders = ", ".join("?" for _ in seen)
                conn.execute(
                    f"DELETE FROM project_listings WHERE account_id = ? AND slug NOT IN ({placeholders})",
                    (account_id, *seen),
                )
    finally:
        conn.close()

    if not seen:
        return {
            "ok": False,
            "error": "The feed contained no valid items. Each item needs an id, sku, or slug and a name or title.",
        }
    logger.info("synced %s live catalog item(s) for account %s", len(seen), account_id)
    return {"ok": True, "count": len(seen), "slugs": seen}


def _accounts_with_feeds() -> list[int]:
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            "SELECT account_id FROM settings WHERE key = ? AND COALESCE(value, '') != ''",
            (FEED_URL_SETTING,),
        ).fetchall()
        return [r["account_id"] for r in rows]
    finally:
        conn.close()


def _loop() -> None:
    logger.info("live catalog sync started (every %ss)", _SYNC_INTERVAL_S)
    while True:
        try:
            for account_id in _accounts_with_feeds():
                sync_account(account_id)
        except Exception:
            logger.exception("live catalog sync tick failed")
        time.sleep(_SYNC_INTERVAL_S)


def start_project_sync() -> None:
    """Idempotent — safe to call from FastAPI startup even if it fires twice.
    DISABLE_PROJECT_SYNC=1 turns it off, same convention as the other
    schedulers in this server."""
    import os

    if os.environ.get("DISABLE_PROJECT_SYNC", "").strip() not in ("", "0", "false", "False"):
        logger.info("project sync disabled via DISABLE_PROJECT_SYNC")
        return
    global _started
    with _lock:
        if _started:
            return
        _started = True
        threading.Thread(target=_loop, daemon=True, name="project-sync").start()
