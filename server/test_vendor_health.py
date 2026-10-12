"""Vendor health checks (vendor_health.py) and their ops alerts: statuses,
provider error codes without secrets, ElevenLabs quota thresholds, the
3-hour cadence, per-vendor failure alerts and the 09:00 IST daily digest.
No network: urlopen and the probes are faked."""

import datetime
import io
import json
import unittest
import urllib.error
from unittest import mock
from zoneinfo import ZoneInfo

import ops_alert_worker as worker
import vendor_health


def _ist(hour: int) -> float:
    return datetime.datetime(2026, 10, 12, hour, 5, tzinfo=ZoneInfo("Asia/Kolkata")).timestamp()


class _Store:
    def __init__(self):
        self.data = {}

    def get(self, key, account):
        return self.data.get((account, key))

    def set(self, key, value, account):
        self.data[(account, key)] = value


class VendorHealthTests(unittest.TestCase):
    def setUp(self):
        self.store = _Store()
        mock.patch.object(vendor_health.calls_db, "get_setting", side_effect=self.store.get).start()
        mock.patch.object(vendor_health.calls_db, "set_setting", side_effect=self.store.set).start()
        self.addCleanup(mock.patch.stopall)

    def test_statuses_and_stored_report(self):
        def boom():
            raise RuntimeError("secret-looking text sk-123")

        def missing():
            raise LookupError("X_API_KEY not set")

        def failing():
            raise vendor_health._Fail("HTTP 402 RESOURCE_EXHAUSTED")

        probes = (("A", lambda: "ok"), ("B", lambda: "WARN 95% used"), ("C", missing), ("D", failing), ("E", boom))
        with mock.patch.object(vendor_health, "PROBES", probes):
            report = vendor_health.run_checks()
        got = {r["name"]: (r["status"], r["detail"]) for r in report["results"]}
        self.assertEqual(got["A"], ("ok", "ok"))
        self.assertEqual(got["B"], ("warn", "95% used"))
        self.assertEqual(got["C"], ("skipped", "X_API_KEY not set"))
        self.assertEqual(got["D"], ("fail", "HTTP 402 RESOURCE_EXHAUSTED"))
        self.assertEqual(got["E"], ("fail", "check crashed (RuntimeError)"))
        self.assertNotIn("sk-123", json.dumps(report))
        self.assertEqual(vendor_health.last_report(), report)

    def test_http_error_reports_only_the_provider_code(self):
        body = json.dumps({"error": {"code": 402, "status": "RESOURCE_EXHAUSTED", "message": "key AIza... depleted"}})

        def fake(request, timeout=0):
            raise urllib.error.HTTPError(request.full_url, 402, "x", {}, io.BytesIO(body.encode()))

        with mock.patch("urllib.request.urlopen", fake), \
                mock.patch.dict(vendor_health.os.environ, {"GEMINI_API_KEY": "AIza-secret"}):
            with self.assertRaises(vendor_health._Fail) as ctx:
                vendor_health._gemini()
        self.assertEqual(str(ctx.exception), "HTTP 402 RESOURCE_EXHAUSTED")

    def test_elevenlabs_quota_thresholds(self):
        env = {"ELEVEN_API_KEY": "k"}
        with mock.patch.dict(vendor_health.os.environ, env):
            with mock.patch.object(vendor_health, "_http", return_value={"character_count": 950, "character_limit": 1000}):
                self.assertTrue(vendor_health._elevenlabs().startswith("WARN "))
            with mock.patch.object(vendor_health, "_http", return_value={"character_count": 1000, "character_limit": 1000}):
                with self.assertRaises(vendor_health._Fail):
                    vendor_health._elevenlabs()
            with mock.patch.object(vendor_health, "_http", return_value={"character_count": 10, "character_limit": 1000}):
                self.assertEqual(vendor_health._elevenlabs(), "10/1,000 characters used")


    def test_unconfigured_b2_is_skipped_not_failed(self):
        with mock.patch("storage.b2_client", return_value=(None, None)):
            with self.assertRaises(LookupError):
                vendor_health._b2()


class VendorAlertTests(unittest.TestCase):
    def setUp(self):
        self.store = _Store()
        mock.patch.object(worker.calls_db, "get_setting", side_effect=self.store.get).start()
        mock.patch.object(worker.calls_db, "set_setting", side_effect=self.store.set).start()
        self.runs = 0
        self.status = "ok"

        def run_checks():
            self.runs += 1
            report = {"checkedAt": "t", "results": [
                {"name": "OpenAI", "status": self.status, "detail": "HTTP 429 credit_balance_exhausted", "latencyMs": 1},
                {"name": "Sarvam", "status": "ok", "detail": "answered", "latencyMs": 1},
            ]}
            self.store.set(vendor_health.LAST_KEY, json.dumps(report), worker.calls_db.PLATFORM_ACCOUNT_ID)
            return report

        mock.patch.object(worker.vendor_health, "run_checks", side_effect=run_checks).start()
        mock.patch.object(worker.vendor_health.calls_db, "get_setting", side_effect=self.store.get).start()
        self.addCleanup(mock.patch.stopall)

    def keys(self, alerts):
        return sorted(a["key"] for a in alerts)

    def test_every_three_hours_and_failures_alert(self):
        self.status = "fail"
        first = worker._vendor_health(_ist(6))
        self.assertEqual(self.runs, 1)
        self.assertEqual(self.keys(first), ["vendor.openai"])
        self.assertIn("credit_balance_exhausted", first[0]["body"])
        worker._vendor_health(_ist(6) + 3600)
        self.assertEqual(self.runs, 1, "not re-run within 3 hours; last report reused")
        worker._vendor_health(_ist(6) + 3 * 3600)
        self.assertEqual(self.runs, 2)

    def test_daily_digest_after_nine_ist_runs_fresh_once(self):
        self.assertEqual(self.keys(worker._vendor_health(_ist(8))), [])
        runs_before = self.runs
        alerts = worker._vendor_health(_ist(9))
        self.assertEqual(self.runs, runs_before + 1, "digest always uses a fresh check")
        digest = [a for a in alerts if a["key"].startswith("vendor_digest.")]
        self.assertEqual(len(digest), 1)
        self.assertIsNone(digest[0]["repeat_s"])
        self.assertIn("all OK", digest[0]["subject"])
        # Marked as sent by run_once; the same day it is no longer due.
        self.store.set(worker._MARK + digest[0]["key"], "1", worker.calls_db.PLATFORM_ACCOUNT_ID)
        self.assertFalse(any(a["key"].startswith("vendor_digest.") for a in worker._vendor_health(_ist(10))))


if __name__ == "__main__":
    unittest.main()
