import unittest
from unittest import mock

import dbconn
from psycopg_pool import PoolTimeout


class _FakePool:
    def __init__(self, fail: bool) -> None:
        self.fail = fail
        self.closed = False

    def getconn(self, timeout=None):
        if self.fail:
            raise PoolTimeout("couldn't get a connection")
        return mock.MagicMock(name="raw-connection")

    def close(self, timeout=None):
        self.closed = True


class ConnectRetryTests(unittest.TestCase):
    def setUp(self):
        dbconn._pool = None

    def test_retries_on_a_fresh_pool_after_a_timeout(self):
        pools = [_FakePool(True), _FakePool(True), _FakePool(False)]
        made = []

        def build():
            if dbconn._pool is None:
                dbconn._pool = pools[len(made)]
                made.append(dbconn._pool)
            return dbconn._pool

        with mock.patch.object(dbconn, "_get_pool", side_effect=build):
            conn = dbconn.connect()
        self.assertIsInstance(conn, dbconn.Conn)
        self.assertEqual(len(made), 3)
        self.assertTrue(made[0].closed and made[1].closed)  # stalled pools were discarded

    def test_gives_up_after_the_attempt_limit(self):
        def build():
            if dbconn._pool is None:
                dbconn._pool = _FakePool(True)
            return dbconn._pool

        with mock.patch.object(dbconn, "_get_pool", side_effect=build):
            with self.assertRaises(PoolTimeout):
                dbconn.connect()

    def test_connection_options_are_set(self):
        self.assertEqual(dbconn._CONNECT_KWARGS["connect_timeout"], 5)
        self.assertEqual(dbconn._CONNECT_KWARGS["keepalives"], 1)


if __name__ == "__main__":
    unittest.main()
