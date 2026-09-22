# -*- coding: utf-8 -*-
"""jev_intent must never make a live call worse than it was without it.

Every test here is about a failure mode, because the success path is the easy
part: this runs before the model gets the turn, so a hang, a throw or a
confident wrong answer is silence or a misrouted caller.
"""

import asyncio
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import jev_intent
import transfer_intent


def _run(coro):
    return asyncio.get_event_loop_policy().new_event_loop().run_until_complete(coro)


class WorthAsking(unittest.TestCase):
    """The gate that decides whether we spend a second of the caller's time."""

    def test_connect_words_are_candidates(self):
        for text in (
            "जी कनेक्ट कीजिए मुझे आप।",
            "नहीं, आप कॉल ट्रांसफर कीजिए डायरेक्ट मेरा।",
            "आप मुझे आपके एज ऑन से कमेंट कीजिए।",
            "Can you connect me to someone?",
        ):
            self.assertTrue(jev_intent.worth_asking(text), text)

    def test_baat_kar_alone_is_not_worth_a_network_call(self):
        # 56 of our 78 hard negatives contain "बात कर" and none of the
        # requests the regex misses do. Paying a second for these would be
        # latency spent on friend-roleplay and language switches.
        for text in (
            "चल मेरा दोस्त बन के बात कर मेरे से।",
            "हिंदी में बात कर सकते हैं।",
            "गुस्सा हो के बात करके दिखाओ मुझे।",
            "एजेंट, तुम कस्टमर के साथ कैसे बात करोगे?",
        ):
            self.assertFalse(jev_intent.worth_asking(text), text)

    def test_substring_matches_are_not_candidates(self):
        # Both are real turns from our transcripts. Jev scores them 0.42 and
        # 0.30 so they would never have caused a wrong transfer — they would
        # have cost a second of the caller's time for nothing.
        self.assertFalse(jev_intent.worth_asking("Location or connectivity."))
        self.assertFalse(jev_intent.worth_asking("जोड़ी बना दो।"))
        self.assertFalse(jev_intent.worth_asking("I need a new broadband connection"))

    def test_empty_and_monologue_are_rejected_without_asking(self):
        self.assertFalse(jev_intent.worth_asking(""))
        self.assertFalse(jev_intent.worth_asking(None))
        self.assertFalse(jev_intent.worth_asking("connect " * 200))

    def test_every_request_the_regex_misses_still_reaches_jev(self):
        # If the gate screened one of these out, wiring Jev in would buy
        # nothing: these six are the entire reason this module exists.
        for text in (
            "नहीं, मेरी साइट विजिट बुक करना है मुझे। क्या आप मुझे कनेक्ट करा सकते हैं रियल रिप्रेजेंटेटिव से?",
            "क्या आप मुझे डायरेक्ट सेल स्कीम से कनेक्ट करा सकते हो?",
            "जी कनेक्ट कीजिए मुझे आप।",
            "नहीं, आप कॉल ट्रांसफर कीजिए डायरेक्ट मेरा।",
            "क्या आप मुझे कनेक्ट कर सकते हो शिवमन के साथ?",
            "जी हां, कनेक्ट कीजिए।",
        ):
            self.assertFalse(transfer_intent.wants_human(text), f"regex changed: {text}")
            self.assertTrue(jev_intent.worth_asking(text), text)


class _FakeResponse:
    def __init__(self, status=200, payload=None, raises=None):
        self.status = status
        self._payload = payload
        self._raises = raises

    async def json(self):
        if self._raises:
            raise self._raises
        return self._payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _FakeSession:
    def __init__(self, response=None, raises=None):
        self._response = response
        self._raises = raises

    def post(self, *a, **kw):
        if self._raises:
            raise self._raises
        return self._response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def _with_session(session):
    fake = mock.MagicMock()
    fake.ClientSession = mock.MagicMock(return_value=session)
    fake.ClientTimeout = mock.MagicMock()
    return mock.patch.dict(sys.modules, {"aiohttp": fake})


class AsksForHuman(unittest.TestCase):
    def setUp(self):
        self._env = mock.patch.dict(os.environ, {"JEV_API_KEY": "jev_test"})
        self._env.start()
        self.addCleanup(self._env.stop)

    def _ask(self, session, text="जी कनेक्ट कीजिए मुझे आप।"):
        with _with_session(session):
            return _run(jev_intent.asks_for_human(text))

    def test_confident_yes_fires(self):
        r = _FakeResponse(payload={"data": {"answers": {"wants_human": {"noul": 0.85}}}})
        self.assertTrue(self._ask(_FakeSession(r)))

    def test_below_threshold_does_not_fire(self):
        # 0.56 is the real score of "ओके जी आपकी टीम के साथ।" — a caller
        # agreeing about their own team, not asking for a transfer.
        r = _FakeResponse(payload={"data": {"answers": {"wants_human": {"noul": 0.56}}}})
        self.assertFalse(self._ask(_FakeSession(r)))

    def test_throttled_is_not_a_transfer(self):
        # The community proxy 429s constantly; that must read as "no".
        r = _FakeResponse(status=429, payload={"code": -1})
        self.assertFalse(self._ask(_FakeSession(r)))

    def test_timeout_is_not_a_transfer(self):
        self.assertFalse(self._ask(_FakeSession(raises=asyncio.TimeoutError())))

    def test_connection_error_is_not_a_transfer(self):
        self.assertFalse(self._ask(_FakeSession(raises=OSError("no route to host"))))

    def test_garbage_payload_is_not_a_transfer(self):
        for payload in ({}, {"data": {}}, {"data": {"answers": {}}},
                        {"data": {"answers": {"wants_human": {"noul": "yes please"}}}},
                        None):
            r = _FakeResponse(payload=payload)
            self.assertFalse(self._ask(_FakeSession(r)), payload)

    def test_no_key_means_no_call_at_all(self):
        session = _FakeSession(_FakeResponse(
            payload={"data": {"answers": {"wants_human": {"noul": 0.99}}}}))
        with mock.patch.dict(os.environ, {}, clear=True):
            with _with_session(session):
                self.assertFalse(_run(jev_intent.asks_for_human("connect me")))
        session.post = mock.MagicMock(side_effect=AssertionError("should not be called"))

    def test_gate_runs_before_the_network(self):
        session = _FakeSession()
        session.post = mock.MagicMock(side_effect=AssertionError("network on a non-candidate"))
        with _with_session(session):
            self.assertFalse(_run(jev_intent.asks_for_human("हिंदी में बात कर सकते हैं।")))


if __name__ == "__main__":
    unittest.main()
