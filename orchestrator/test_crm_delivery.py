"""Lead-delivery parity with agent/tools.py: Zoho CRM, "Sign in with Google"
sheets, the plan's crm gate, an agent's crm_integration_keys and its own
webhook, and the dashboard's delivery bookkeeping (Activity rows and the
call's ArthaLeads status).

HTTP is faked throughout — nothing reaches Zoho, Google or any webhook. The
Postgres-backed tests start a throwaway local server with pgserver (skipped
when it isn't installed), never the DATABASE_URL from .env.
"""

import json
import os
import pathlib
import re
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import crm_delivery
import db
import dbconn
import tools

try:
    import pgserver
except ImportError:  # pragma: no cover - optional dev dependency
    pgserver = None

_REPO = pathlib.Path(__file__).resolve().parent.parent

WEBHOOK_URL = "https://hook.example.test/lead"
SLACK_URL = "https://slack.example.test/hook"
AGENT_HOOK_URL = "https://agent.example.test/hook"


class _Resp:
    def __init__(self, status, body):
        self.status = status
        self._body = body

    async def text(self):
        return self._body if isinstance(self._body, str) else json.dumps(self._body)

    async def json(self, content_type=None):
        return self._body if isinstance(self._body, dict) else json.loads(self._body or "{}")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _FakeHttp:
    """Stands in for aiohttp.ClientSession. Answers each POST from `routes`
    (first URL substring that matches; default 200 "ok") and records it."""

    def __init__(self, routes=None):
        self.routes = routes or []
        self.posts = []

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def post(self, url, json=None, data=None, headers=None, **kwargs):
        self.posts.append({"url": url, "json": json, "data": data, "headers": headers or {}})
        for fragment, status, body in self.routes:
            if fragment in url:
                return _Resp(status, body)
        return _Resp(200, "ok")

    def urls(self):
        return [p["url"] for p in self.posts]


def _call_completed(**extra):
    return {
        "type": "call_completed", "name": "Asha", "phone": "+919800000000",
        "email": "asha@example.test", "channel": "phone", "agent_name": "Front desk",
        "transcript": [{"role": "user", "text": "hello"}], **extra,
    }


class _BookkeepingPatches:
    """Patches every db write the delivery path makes, so the mocked-DB tests
    never open a connection."""

    def start(self, integrations):
        self.patches = [
            patch.object(db, "get_delivery_integrations", return_value=integrations),
            patch.object(db, "touch_integration_sync"),
            patch.object(db, "mark_integration_error"),
            patch.object(db, "set_call_arthaleads_status"),
            patch.object(db, "record_integration_delivery"),
            patch.object(db, "update_integration_config"),
        ]
        mocks = [p.start() for p in self.patches]
        return SimpleNamespace(**{p.attribute: m for p, m in zip(self.patches, mocks)})

    def stop(self):
        for p in self.patches:
            p.stop()


class ZohoAndSheetsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.bk = _BookkeepingPatches()

    def tearDown(self):
        self.bk.stop()

    async def test_zoho_lead_delivered_after_token_refresh(self):
        config = {
            "access_token": "old", "refresh_token": "r1", "expires_at": 0,
            "accounts_base": "https://accounts.zoho.in", "api_domain": "https://www.zohoapis.in",
        }
        mocks = self.bk.start([{"key": "zoho_crm", "config": config}])
        http = _FakeHttp([("/oauth/v2/token", 200, {"access_token": "new", "expires_in": 3600})])
        env = {"ZOHO_OAUTH_CLIENT_ID": "cid", "ZOHO_OAUTH_CLIENT_SECRET": "csecret"}
        with patch.dict(os.environ, env), patch.object(tools.aiohttp, "ClientSession", http):
            await tools._deliver_to_integrations(1, _call_completed(), call_id=7)

        self.assertEqual(http.urls(), [
            "https://accounts.zoho.in/oauth/v2/token",
            "https://www.zohoapis.in/crm/v2/Leads/upsert",
        ])
        self.assertEqual(http.posts[0]["data"]["refresh_token"], "r1")
        upsert = http.posts[1]
        self.assertEqual(upsert["headers"]["Authorization"], "Zoho-oauthtoken new")
        self.assertEqual(upsert["json"]["data"][0]["Phone"], "+919800000000")
        self.assertEqual(upsert["json"]["data"][0]["Last_Name"], "Asha")
        saved = mocks.update_integration_config.call_args.args
        self.assertEqual(saved[:2], (1, "zoho_crm"))
        self.assertEqual(saved[2]["access_token"], "new")
        mocks.touch_integration_sync.assert_called_once_with(1, "zoho_crm")
        mocks.record_integration_delivery.assert_called_once_with(
            1, "zoho_crm", "call_completed", "sent", "", "Asha", 7
        )

    async def test_zoho_skips_mid_call_events_and_logs_unreachable_caller(self):
        config = {"access_token": "a", "refresh_token": "r", "expires_at": time.time() + 3600}
        mocks = self.bk.start([{"key": "zoho_crm", "config": config}])
        http = _FakeHttp()
        with patch.object(tools.aiohttp, "ClientSession", http):
            await tools._deliver_to_integrations(1, {"type": "lead_update", "name": "Asha", "phone": "+91"})
            await tools._deliver_to_integrations(1, {"type": "call_completed", "name": "Asha"}, call_id=8)
        self.assertEqual(http.posts, [])
        mocks.record_integration_delivery.assert_called_once_with(
            1, "zoho_crm", "call_completed", "skipped", "No phone or email from the caller", "Asha", 8
        )

    async def test_oauth_sheet_row_delivered(self):
        config = {
            "mode": "oauth", "access_token": "tok", "refresh_token": "r", "expires_at": time.time() + 3600,
            "spreadsheet_id": "SHEET1", "sheet_id": 0, "sheet_title": "Leads",
        }
        mocks = self.bk.start([{"key": "sheets", "config": config}])
        http = _FakeHttp()
        with patch.object(tools.aiohttp, "ClientSession", http):
            await tools._deliver_to_integrations(1, _call_completed(agent_name=""), call_id=9)

        self.assertEqual(http.urls(), ["https://sheets.googleapis.com/v4/spreadsheets/SHEET1:batchUpdate"])
        post = http.posts[0]
        self.assertEqual(post["headers"]["Authorization"], "Bearer tok")
        append = post["json"]["requests"][0]["appendCells"]
        self.assertEqual(append["sheetId"], 0)
        cells = [c["userEnteredValue"].get("stringValue") for c in append["rows"][0]["values"]]
        self.assertIn("Asha", cells)
        self.assertIn("+919800000000", cells)
        mocks.touch_integration_sync.assert_called_once_with(1, "sheets")
        mocks.record_integration_delivery.assert_called_once_with(
            1, "sheets", "call_completed", "sent", "", "Asha", 9
        )


class AgentChoiceTests(unittest.IsolatedAsyncioTestCase):
    def _session(self, **attrs):
        return SimpleNamespace(account_id=1, lead_data={}, emit_event=lambda e: None, **attrs)

    async def test_crm_integration_keys_restricts_delivery(self):
        seen = {}

        def fake_integrations(account_id, allowed_keys=None):
            seen["allowed_keys"] = allowed_keys
            rows = [{"key": "webhook", "config": {"url": WEBHOOK_URL}},
                    {"key": "slack", "config": {"url": SLACK_URL}}]
            return [r for r in rows if not allowed_keys or r["key"] in allowed_keys]

        http = _FakeHttp()
        with patch.object(db, "get_delivery_integrations", side_effect=fake_integrations), \
                patch.object(db, "touch_integration_sync"), \
                patch.object(db, "record_integration_delivery"), \
                patch.object(tools.aiohttp, "ClientSession", http):
            await tools.log_lead(self._session(crm_integration_keys=["slack"]), name="Asha", phone="+91")
        self.assertEqual(seen["allowed_keys"], ["slack"])
        self.assertEqual(http.urls(), [SLACK_URL])

    async def test_agent_webhook_receives_the_event(self):
        http = _FakeHttp()
        with patch.object(db, "get_delivery_integrations", return_value=[]), \
                patch.object(tools.aiohttp, "ClientSession", http):
            await tools.log_lead(self._session(agent_webhook_url=AGENT_HOOK_URL), name="Asha", phone="+91")
        self.assertEqual(http.urls(), [AGENT_HOOK_URL])
        self.assertEqual(http.posts[0]["json"]["type"], "lead_update")
        self.assertEqual(http.posts[0]["json"]["name"], "Asha")

    async def test_agent_webhook_same_as_account_webhook_gets_one_post(self):
        http = _FakeHttp()
        with patch.object(db, "get_delivery_integrations",
                          return_value=[{"key": "webhook", "config": {"url": WEBHOOK_URL}}]), \
                patch.object(db, "touch_integration_sync"), \
                patch.object(db, "record_integration_delivery"), \
                patch.object(tools.aiohttp, "ClientSession", http):
            await tools.log_lead(self._session(agent_webhook_url=WEBHOOK_URL), name="Asha", phone="+91")
        self.assertEqual(http.urls(), [WEBHOOK_URL])

    async def test_session_without_new_attributes_still_delivers(self):
        http = _FakeHttp()
        with patch.object(db, "get_delivery_integrations",
                          return_value=[{"key": "webhook", "config": {"url": WEBHOOK_URL}}]), \
                patch.object(db, "touch_integration_sync"), \
                patch.object(db, "record_integration_delivery"), \
                patch.object(tools.aiohttp, "ClientSession", http):
            await tools.log_lead(self._session(), name="Asha", phone="+91")
        self.assertEqual(http.urls(), [WEBHOOK_URL])


def _real_integration_deliveries_schema() -> str | None:
    """The integration_deliveries DDL exactly as server/calls_db.py has it."""
    path = _REPO / "server" / "calls_db.py"
    if not path.exists():
        return None
    src = path.read_text()
    now = re.search(r'^_NOW = "(.*)"$', src, re.M).group(1)
    ddl = re.search(r"CREATE TABLE IF NOT EXISTS integration_deliveries \(.*?\);", src, re.S).group(0)
    return ddl.replace("{_NOW}", now)


_SCHEMA = """
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    plan TEXT,
    is_platform_owner INTEGER DEFAULT 0
);
CREATE TABLE integrations (
    account_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    status TEXT DEFAULT 'not_connected',
    config_json TEXT DEFAULT '{}',
    last_sync TEXT,
    last_error TEXT,
    PRIMARY KEY (account_id, key)
);
CREATE TABLE calls (
    id INTEGER PRIMARY KEY,
    arthaleads_status TEXT,
    arthaleads_synced_at TEXT,
    arthaleads_error TEXT
);
"""


@unittest.skipIf(pgserver is None, "pgserver not installed")
@unittest.skipIf(_real_integration_deliveries_schema() is None, "server/calls_db.py not present")
class PostgresDeliveryTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls._pg = pgserver.get_server(cls._tmp.name, cleanup_mode="stop")
        cls._env = patch.dict(os.environ, {"DATABASE_URL": cls._pg.get_uri()})
        cls._env.start()
        dbconn._pool = None

    @classmethod
    def tearDownClass(cls):
        if dbconn._pool is not None:
            dbconn._pool.close()
            dbconn._pool = None
        cls._env.stop()
        cls._pg.cleanup()
        cls._tmp.cleanup()

    def _exec(self, sql, params=()):
        conn = dbconn.connect()
        try:
            with conn:
                return conn.execute(sql, params).fetchall() if sql.lstrip().upper().startswith("SELECT") \
                    else conn.execute(sql, params)
        finally:
            conn.close()

    def setUp(self):
        for table in ("accounts", "integrations", "calls", "integration_deliveries"):
            self._exec(f"DROP TABLE IF EXISTS {table}")
        for stmt in _SCHEMA.split(";"):
            if stmt.strip():
                self._exec(stmt)
        self._exec(_real_integration_deliveries_schema())
        self._exec("INSERT INTO calls (id) VALUES (42)")

    def _account(self, plan, owner=0):
        self._exec("INSERT INTO accounts (id, plan, is_platform_owner) VALUES (1, ?, ?)", (plan, owner))

    def _connect(self, key, config):
        self._exec(
            "INSERT INTO integrations (account_id, key, status, config_json) VALUES (1, ?, 'connected', ?)",
            (key, json.dumps(config)),
        )

    async def _deliver(self, lead, **kwargs):
        http = _FakeHttp()
        with patch.object(tools.aiohttp, "ClientSession", http):
            await tools._deliver_to_integrations(1, lead, **kwargs)
        return http

    async def test_plan_without_crm_delivers_nothing(self):
        self._account("starter")
        self._connect("webhook", {"url": WEBHOOK_URL})
        self._connect("arthaleads", {"token": "t"})
        http = await self._deliver(_call_completed(), call_id=42)
        self.assertEqual(http.posts, [])
        [call] = self._exec("SELECT arthaleads_status, arthaleads_error FROM calls WHERE id = 42")
        self.assertEqual(call["arthaleads_status"], "skipped")
        self.assertIn("Growth plan", call["arthaleads_error"])

    async def test_growth_plan_and_platform_owner_deliver(self):
        self._account("growth")
        self._connect("webhook", {"url": WEBHOOK_URL})
        self.assertEqual((await self._deliver(_call_completed())).urls(), [WEBHOOK_URL])
        self._exec("UPDATE accounts SET plan = 'starter', is_platform_owner = 1")
        self.assertEqual((await self._deliver(_call_completed())).urls(), [WEBHOOK_URL])

    async def test_unknown_account_delivers_nothing(self):
        self._connect("webhook", {"url": WEBHOOK_URL})
        self.assertEqual((await self._deliver(_call_completed())).posts, [])

    async def test_allowed_keys_filter_in_query(self):
        self._account("scale")
        self._connect("webhook", {"url": WEBHOOK_URL})
        self._connect("slack", {"url": SLACK_URL})
        self._connect("zoho_crm", {"access_token": "a", "refresh_token": "r"})
        keys = sorted(i["key"] for i in db.get_delivery_integrations(1))
        self.assertEqual(keys, ["slack", "webhook", "zoho_crm"])
        self.assertEqual([i["key"] for i in db.get_delivery_integrations(1, ["slack"])], ["slack"])

    async def test_delivery_rows_and_arthaleads_status_logged(self):
        self._account("growth")
        self._connect("webhook", {"url": WEBHOOK_URL})
        self._connect("arthaleads", {"token": "t"})
        await self._deliver(_call_completed(), call_id=42)
        rows = self._exec(
            "SELECT account_id, key, event_type, status, detail, lead_name, call_id, created_at "
            "FROM integration_deliveries ORDER BY key"
        )
        self.assertEqual(
            [(r["account_id"], r["key"], r["event_type"], r["status"], r["lead_name"], r["call_id"]) for r in rows],
            [(1, "arthaleads", "call_completed", "sent", "Asha", 42),
             (1, "webhook", "call_completed", "sent", "Asha", 42)],
        )
        self.assertTrue(all(r["created_at"] for r in rows))
        [call] = self._exec("SELECT arthaleads_status FROM calls WHERE id = 42")
        self.assertEqual(call["arthaleads_status"], "sent")

    async def test_arthaleads_missing_phone_is_logged_as_skipped(self):
        self._account("growth")
        self._connect("arthaleads", {"token": "t"})
        await self._deliver(_call_completed(phone=""), call_id=42)
        [row] = self._exec("SELECT status, detail FROM integration_deliveries")
        self.assertEqual(row["status"], "skipped")
        self.assertIn("missing phone", row["detail"])

    async def test_zoho_refreshed_token_is_saved(self):
        self._account("growth")
        self._connect("zoho_crm", {"access_token": "old", "refresh_token": "r", "expires_at": 0})
        http = _FakeHttp([("/oauth/v2/token", 200, {"access_token": "new", "expires_in": 3600})])
        env = {"ZOHO_OAUTH_CLIENT_ID": "cid", "ZOHO_OAUTH_CLIENT_SECRET": "cs"}
        with patch.dict(os.environ, env), patch.object(tools.aiohttp, "ClientSession", http):
            await tools._deliver_to_integrations(1, _call_completed(), call_id=42)
        [stored] = db.get_delivery_integrations(1)
        self.assertEqual(stored["config"]["access_token"], "new")
        [row] = self._exec("SELECT key, status FROM integration_deliveries")
        self.assertEqual((row["key"], row["status"]), ("zoho_crm", "sent"))


class MirrorTests(unittest.TestCase):
    def test_crm_delivery_is_a_faithful_copy_of_agent_tools(self):
        agent_src = _REPO / "agent" / "tools.py"
        if not agent_src.exists():
            self.skipTest("agent/tools.py not present")
        ours = pathlib.Path(crm_delivery.__file__).read_text()
        body = ours.split("# --- BEGIN MIRROR of agent/tools.py ---\n", 1)[1]
        body = body.split("# --- END MIRROR of agent/tools.py ---", 1)[0]
        theirs = agent_src.read_text()
        start = theirs.index("def _zoho_should_send(")
        end = theirs.index("# Same lists as server/calls_db.py's INTEGRATION_EVENTS")
        self.assertEqual(body.strip(), theirs[start:end].strip())


if __name__ == "__main__":
    unittest.main()
