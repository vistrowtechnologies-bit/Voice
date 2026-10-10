"""Public /token must not dispatch a tenant's agent for an anonymous caller,
and must not hand out a join grant for an arbitrary room name."""
import ast
import os
import types
import unittest


HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def function_source(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(SOURCE, node) or ""


def load(name: str, **globs):
    namespace = {"Request": object, **globs}
    exec(function_source(name), namespace)
    return namespace[name]


class FakeRequest:
    def __init__(self, cookie=None):
        self.cookies = {"vv_session": cookie} if cookie else {}


def fake_auth(session):
    return types.SimpleNamespace(COOKIE_NAME="vv_session", read_session_token=lambda token: session if token else None)


def fake_db(owner_of_agent, profile_account=7, session_ok=True):
    return types.SimpleNamespace(
        get_user_by_id=lambda uid: {"account_id": profile_account, "session_version": 1},
        validate_user_session=lambda sid, uid: session_ok,
        agent_account_id=lambda agent_id: owner_of_agent,
    )


SESSION = {"uid": 3, "aid": 7, "sv": 1, "sid": "s1"}


class SessionOwnsAgent(unittest.TestCase):
    def owns(self, request, session, db):
        return load("_session_owns_agent", auth=fake_auth(session), calls_db=db)(request, 42)

    def test_anonymous_caller_cannot_use_a_raw_agent_id(self):
        self.assertFalse(self.owns(FakeRequest(), None, fake_db(owner_of_agent=7)))

    def test_signed_in_member_of_another_workspace_is_refused(self):
        self.assertFalse(self.owns(FakeRequest("c"), SESSION, fake_db(owner_of_agent=99)))

    def test_revoked_session_is_refused(self):
        self.assertFalse(self.owns(FakeRequest("c"), SESSION, fake_db(owner_of_agent=7, session_ok=False)))

    def test_owner_workspace_session_is_allowed(self):
        self.assertTrue(self.owns(FakeRequest("c"), SESSION, fake_db(owner_of_agent=7)))


class RoomShapes(unittest.TestCase):
    allowed = staticmethod(load("_token_room_allowed"))

    def test_demo_orb_rooms(self):
        self.assertTrue(self.allowed("voice-agent-demo", None, False))
        self.assertTrue(self.allowed("voice-agent-demo-k3j9x0ab", None, False))

    def test_demo_caller_cannot_join_other_rooms(self):
        for room in ("widget-5-abc", "phone-917713128715_x", "test-agent-42-abc", "voice-agent-demox"):
            self.assertFalse(self.allowed(room, None, False), room)

    def test_test_call_room_must_belong_to_this_agent(self):
        self.assertTrue(self.allowed("test-agent-42-abcd1234", 42, False))
        self.assertFalse(self.allowed("test-agent-420-abcd1234", 42, False))
        self.assertFalse(self.allowed("voice-agent-demo-abc", 42, False))
        self.assertTrue(self.allowed("test-lab-42-abcd1234", 42, True))
        self.assertFalse(self.allowed("test-agent-42-abcd1234", 42, True))

    def test_oversized_room_name_is_refused(self):
        self.assertFalse(self.allowed("voice-agent-demo-" + "x" * 200, None, False))


class CreateTokenUsesTheGuards(unittest.TestCase):
    def test_raw_agent_id_and_room_are_checked_before_the_room_is_created(self):
        src = function_source("create_token")
        create_at = src.index("create_room(")
        self.assertLess(src.index("not _session_owns_agent(request, agent_id)"), create_at)
        self.assertLess(src.index("_token_room_allowed(req.room"), create_at)


if __name__ == "__main__":
    unittest.main()
