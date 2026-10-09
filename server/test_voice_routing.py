"""Offline native-model routing regression checks; no providers or database."""
import unittest
from unittest.mock import MagicMock, Mock, patch
from types import SimpleNamespace
from pathlib import Path
import json
import os
from test_plan_policy import function_from_file

from voice_routing import use_orchestrator


class VoiceRouting(unittest.TestCase):
    def test_native_models_bypass_enabled_pipeline(self):
        for model in ("gemini-live", "gemini-live:gemini-3.1-flash-live-preview",
                      "gemini-live:gemini-2.5-flash-native-audio-preview-12-2025"):
            with self.subTest(model=model):
                self.assertFalse(use_orchestrator(2, 26,
                    is_enabled=Mock(return_value=True),
                    get_agent=Mock(return_value={"model": model})))

    def test_pipeline_models_keep_enabled_route(self):
        for model in ("gpt-4.1-mini", "gemini-2.5-flash", "groq/llama-3.3-70b-versatile"):
            with self.subTest(model=model):
                self.assertTrue(use_orchestrator(2, 26,
                    is_enabled=Mock(return_value=True),
                    get_agent=Mock(return_value={"model": model})))

    def test_disabled_account_never_loads_agent_or_routes_to_pipeline(self):
        load = Mock()
        self.assertFalse(use_orchestrator(2, 26, is_enabled=Mock(return_value=False), get_agent=load))
        load.assert_not_called()


class RouteEndpoints(unittest.TestCase):
    """Execute the real endpoint bodies with network/database collaborators mocked."""
    class HTTPError(Exception):
        def __init__(self, status, detail):
            self.status, self.detail = status, detail

    def endpoint(self, name, model):
        db = Mock()
        db.is_on_orchestrator_pipeline.return_value = True
        db.agent_belongs_to_account.return_value = True
        db.get_agent_by_id_unscoped.return_value = {"model": model}
        db.get_phone_number_by_number.return_value = {"accountId": 2, "agentId": 26}
        db.place_outbound_call_direct.return_value = {"ok": True, "route": "livekit"}
        response = Mock()
        response.read.return_value = b'{"ok":true,"route":"pipeline"}'
        # Use a MagicMock context manager rather than any real HTTP transport.
        opening = MagicMock()
        opening.return_value.__enter__.return_value = response
        ns = {
            "calls_db": db, "voice_routing": __import__("voice_routing"),
            "os": os, "json": json, "HTTPException": self.HTTPError,
            "Body": lambda *args: None, "Depends": lambda *args: None,
            "current_user": object(), "logger": Mock(),
            "_orchestrator_headers": Mock(return_value={}),
            "urllib": SimpleNamespace(request=SimpleNamespace(Request=Mock(), urlopen=opening)),
        }
        return function_from_file(Path(__file__).with_name("token_api.py"), name, ns), db, opening

    def test_native_phone_uses_livekit_even_on_pipeline_account(self):
        fn, db, http = self.endpoint("telephony_test_call", "gemini-live")
        with patch.dict(os.environ, {"ORCHESTRATOR_URL": "https://unused.invalid"}):
            result = fn({"from": "+911234567890", "to": "+919876543210"}, {"account_id": 2})
        self.assertEqual(result["route"], "livekit")
        http.assert_not_called()
        db.place_outbound_call_direct.assert_called_once()

    def test_pipeline_phone_keeps_orchestrator_route(self):
        fn, db, http = self.endpoint("telephony_test_call", "gemini-2.5-flash")
        with patch.dict(os.environ, {"ORCHESTRATOR_URL": "https://unused.invalid"}):
            result = fn({"from": "+911234567890", "to": "+919876543210"}, {"account_id": 2})
        self.assertEqual(result["route"], "pipeline")
        db.place_outbound_call_direct.assert_not_called()
        http.assert_called_once()

    def test_native_browser_declines_pipeline_so_client_uses_livekit(self):
        fn, _, http = self.endpoint("orchestrator_browser_token", "gemini-live:gemini-3.1-flash-live-preview")
        with patch.dict(os.environ, {"ORCHESTRATOR_URL": "https://unused.invalid"}):
            with self.assertRaises(self.HTTPError) as caught:
                fn({"agentId": 26}, {"account_id": 2})
        self.assertEqual(caught.exception.status, 400)
        http.assert_not_called()

    def test_browser_cannot_request_another_workspaces_agent(self):
        fn, db, http = self.endpoint("orchestrator_browser_token", "gpt-4.1-mini")
        db.agent_belongs_to_account.return_value = False
        with self.assertRaises(self.HTTPError) as caught:
            fn({"agentId": 26}, {"account_id": 3})
        self.assertEqual(caught.exception.status, 404)
        db.get_agent_by_id_unscoped.assert_not_called()
        http.assert_not_called()

    def test_phone_cannot_request_another_workspaces_number(self):
        fn, db, http = self.endpoint("telephony_test_call", "gpt-4.1-mini")
        with self.assertRaises(self.HTTPError) as caught:
            fn({"from": "+911234567890", "to": "+919876543210"}, {"account_id": 3})
        self.assertEqual(caught.exception.status, 404)
        db.place_outbound_call_direct.assert_not_called()
        http.assert_not_called()

    def test_missing_agent_fails_closed(self):
        self.assertFalse(use_orchestrator(2, 26, is_enabled=Mock(return_value=True), get_agent=Mock(return_value=None)))

    def test_existing_default_pipeline_route_is_retained(self):
        load = Mock()
        self.assertTrue(use_orchestrator(2, None, is_enabled=Mock(return_value=True), get_agent=load))
        load.assert_not_called()
