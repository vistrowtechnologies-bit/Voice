"""Sync a tenant's property listings from their own website into
project_listings, so the agent can talk about every project they list
without any of it being stuffed into the system prompt.

Why not just import the site into the knowledge base? Because KB content is
concatenated verbatim into every system prompt and truncated at 8k chars —
Prophunt's three projects already filled that to 91%, so a fourth would have
silently vanished mid-call with no error anywhere. Listings live in their own
table and reach the agent as (a) a ~40-chars-per-project index in the prompt
and (b) a lookup_project tool that pulls full detail only when a caller
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

# Where each tenant's feed lives, per account, in the settings table.
FEED_URL_SETTING = "project_feed_url"

_SYNC_INTERVAL_S = 6 * 60 * 60  # listings change rarely; 4x/day is plenty
_started = False
_lock = threading.Lock()


def _units(row: dict) -> list[dict]:
    """The feed flattens units into unit_1_*, unit_2_*, unit_3_* rather than
    nesting them, so rebuild the list and drop the empty slots."""
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
    """Pull the feed and replace this account's listings with what it says.

    Deletes rows whose slug is no longer in the feed: a project the tenant
    took down must stop being something the agent offers, and leaving stale
    rows behind would have the agent pitching withdrawn inventory.
    """
    feed_url = (feed_url or calls_db.get_setting(FEED_URL_SETTING, account_id) or "").strip()
    if not feed_url:
        return {"ok": False, "error": "No project feed URL configured for this account."}

    try:
        rows = json.loads(kb_crawl._fetch(feed_url))
    except Exception as exc:
        logger.warning("project feed fetch/parse failed for account %s: %s", account_id, exc)
        return {"ok": False, "error": f"Could not read the feed: {exc}"}
    if not isinstance(rows, list):
        return {"ok": False, "error": "Feed did not contain a list of projects."}

    seen: list[str] = []
    conn = calls_db._connect()
    try:
        with conn:
            for row in rows:
                slug = (row.get("slug") or "").strip()
                title = (row.get("title") or "").strip()
                if not slug or not title:
                    continue
                seen.append(slug)
                conn.execute(
                    "INSERT INTO project_listings (account_id, slug, title, developer, location, "
                    "category, status, config, area, rera, price_from, units_json, amenities_json, "
                    "overview, url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                    "ON CONFLICT (account_id, slug) DO UPDATE SET "
                    "title = EXCLUDED.title, developer = EXCLUDED.developer, "
                    "location = EXCLUDED.location, category = EXCLUDED.category, "
                    "status = EXCLUDED.status, config = EXCLUDED.config, area = EXCLUDED.area, "
                    "rera = EXCLUDED.rera, price_from = EXCLUDED.price_from, "
                    "units_json = EXCLUDED.units_json, amenities_json = EXCLUDED.amenities_json, "
                    "overview = EXCLUDED.overview, url = EXCLUDED.url, synced_at = now()::text",
                    (
                        account_id,
                        slug,
                        title,
                        (row.get("developer") or "").strip(),
                        (row.get("location") or "").strip(),
                        (row.get("category") or "").strip(),
                        (row.get("status") or "").strip(),
                        (row.get("config") or "").strip(),
                        (row.get("area") or "").strip(),
                        (row.get("rera") or "").strip(),
                        float(row["price"]) if isinstance(row.get("price"), (int, float)) else None,
                        json.dumps(_units(row), ensure_ascii=False),
                        json.dumps(row.get("amenities") or [], ensure_ascii=False),
                        (row.get("overview") or "").strip(),
                        (row.get("url") or "").strip(),
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

    logger.info("synced %s project listing(s) for account %s", len(seen), account_id)
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
    logger.info("project listing sync started (every %ss)", _SYNC_INTERVAL_S)
    while True:
        try:
            for account_id in _accounts_with_feeds():
                sync_account(account_id)
        except Exception:
            logger.exception("project sync tick failed")
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
