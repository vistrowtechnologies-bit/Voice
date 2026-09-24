"""Backblaze B2 (S3-compatible) client shared by the API and background jobs."""

import os


def b2_client():
    """Boto3 S3-compatible client for Backblaze B2, or None if the storage
    env vars aren't configured — every caller checks for None and raises its
    own 503, since the exact message differs (recording vs download)."""
    endpoint_url = os.environ.get("B2_ENDPOINT_URL")
    key_id = os.environ.get("B2_KEY_ID")
    application_key = os.environ.get("B2_APPLICATION_KEY")
    bucket = os.environ.get("B2_BUCKET_NAME")
    region = os.environ.get("B2_REGION")
    if not (endpoint_url and key_id and application_key and bucket and region):
        return None, None
    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=key_id,
        aws_secret_access_key=application_key,
        region_name=region,
    )
    return client, bucket
