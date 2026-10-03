"""Create (or reuse) a verified test account in the STAGING database.

Staging has no email service, so signup's verification code can never arrive.
This creates the account directly. It refuses to run unless:
  - APP_ENV=staging, and
  - the database proves it is staging: either it carries the staging marker
    (table vv_environment holding 'staging'), or it is brand new (no accounts
    at all). A database that already has accounts and no marker, which is what
    production looks like, is refused. The check reads from the database
    itself, not from files on this machine, so it cannot be skipped by running
    from a different checkout.

Add --dry-run to run only the checks.

  APP_ENV=staging STAGING_DATABASE_URL=postgresql://... \\
  STAGING_SEED_EMAIL=qa@example.test STAGING_SEED_PASSWORD=... \\
  python server/seed_staging.py   # run inside the staging container
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def staging_proof_error(url: str) -> str | None:
    """None when the database is provably staging, else why it is refused."""
    import psycopg

    with psycopg.connect(url, connect_timeout=15) as conn:
        cur = conn.cursor()
        cur.execute("select to_regclass('public.vv_environment') is not null")
        if cur.fetchone()[0]:
            cur.execute("select env from vv_environment limit 1")
            row = cur.fetchone()
            return None if row and row[0] == "staging" else "vv_environment marker is not 'staging'."
        cur.execute("select to_regclass('public.accounts') is not null")
        if not cur.fetchone()[0]:
            return None
        cur.execute("select count(*) from accounts")
        n = cur.fetchone()[0]
        if n == 0:
            return None
        return f"database already has {n} account(s) and no staging marker; it looks like production."


def mark_staging(url: str) -> None:
    import psycopg

    with psycopg.connect(url, connect_timeout=15) as conn:
        conn.execute("create table if not exists vv_environment (env text primary key)")
        conn.execute("insert into vv_environment (env) values ('staging') on conflict do nothing")


def main() -> int:
    if os.environ.get("APP_ENV", "").lower() != "staging":
        print("Refusing: APP_ENV must be 'staging'.")
        return 2
    url = os.environ.get("STAGING_DATABASE_URL", "")
    email = os.environ.get("STAGING_SEED_EMAIL", "")
    password = os.environ.get("STAGING_SEED_PASSWORD", "")
    if not (url and email and password):
        print("Set STAGING_DATABASE_URL, STAGING_SEED_EMAIL and STAGING_SEED_PASSWORD.")
        return 2
    problem = staging_proof_error(url)
    if problem:
        print(f"Refusing: {problem}")
        return 2
    if "--dry-run" in sys.argv:
        print("Dry run: this database is provably staging; the seed would proceed.")
        return 0
    mark_staging(url)

    os.environ["DATABASE_URL"] = url
    import auth
    import calls_db

    calls_db.init_tables()
    if calls_db.email_exists(email):
        print(f"{email} already exists in staging; nothing to do.")
        return 0
    result = calls_db.create_account_with_owner(
        company_name="Staging QA",
        user_name="Staging Admin",
        email=email,
        password_hash=auth.hash_password(password),
        email_verified=True,
    )
    print(f"Created staging account {result['account_id']} / user {result['user_id']} for {email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
