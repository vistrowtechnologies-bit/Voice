"""One-off: copy every file on the Voice service's Railway volume to B2 before
the volume is detached (docs/RAILWAY-VOLUME-DETACH-2026-10-12.md).

The volume only holds the pre-Postgres SQLite file (/data/calls.db, last
written 2026-07-09). Its rows were copied to Postgres by
scripts/migrate_sqlite_to_postgres.py at cutover and nothing reads it now, so
this is an archive, not a data migration. Same bucket and credentials as
db_backup.py, under a separate prefix that nothing prunes.

Runs inside the production container (the image has boto3 and the B2 env):
    railway ssh --service voice --environment production -- \
        sh -c 'echo <base64 of this file> | base64 -d > /tmp/a.py && python3 /tmp/a.py'

Each upload is verified by downloading it again and comparing SHA-256.
Re-running is safe: an object that already matches is left alone.
"""

import hashlib
import os
import sys
from pathlib import Path

import boto3
from botocore.client import Config

ROOT = Path(os.environ.get("RAILWAY_VOLUME_MOUNT_PATH") or "/data")
PREFIX = "volume-archive/voice-data-2026-10-12/"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    client = boto3.client(
        "s3",
        endpoint_url=os.environ["B2_ENDPOINT_URL"],
        aws_access_key_id=os.environ["B2_KEY_ID"],
        aws_secret_access_key=os.environ["B2_APPLICATION_KEY"],
        config=Config(signature_version="s3v4"),
        region_name=os.environ.get("B2_REGION", "us-east-005"),
    )
    bucket = os.environ["B2_BUCKET_NAME"]
    files = [p for p in sorted(ROOT.rglob("*")) if p.is_file() and "lost+found" not in p.parts]
    if not files:
        print(f"no files under {ROOT}")
        return 0
    failed = 0
    for path in files:
        data = path.read_bytes()
        digest = _sha256(data)
        key = PREFIX + str(path.relative_to(ROOT))
        try:
            existing = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        except client.exceptions.NoSuchKey:
            existing = None
        if existing is not None and _sha256(existing) == digest:
            print(f"{key}: already archived ({len(data)} bytes, sha256 {digest[:12]})")
            continue
        client.put_object(Bucket=bucket, Key=key, Body=data, Metadata={"sha256": digest})
        back = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        ok = _sha256(back) == digest
        failed += not ok
        print(f"{key}: {'archived' if ok else 'VERIFY FAILED'} ({len(data)} bytes, sha256 {digest[:12]})")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
