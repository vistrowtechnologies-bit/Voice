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

    def tearDown(self):
        # These tests install fake pools on the module. Leaving one behind
        # broke every later test that touches dbconn (the fake has no putconn).
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


class ReturnToOwningPoolTests(unittest.TestCase):
    """A connection checked out before a pool reset must go back to the pool
    it came from — handing it to the new pool makes psycopg_pool raise
    ValueError, which escapes handlers that only catch psycopg.Error."""

    def setUp(self):
        dbconn._pool = None

    def tearDown(self):
        dbconn._pool = None

    @staticmethod
    def _raw(owner):
        raw = mock.MagicMock(name="raw-connection")
        raw.info.transaction_status = dbconn.psycopg.pq.TransactionStatus.IDLE
        raw._pool = owner
        return raw

    def test_connection_from_an_old_pool_returns_to_that_pool(self):
        old_pool, new_pool = mock.MagicMock(name="old"), mock.MagicMock(name="new")
        raw = self._raw(old_pool)
        dbconn._pool = new_pool  # a reset happened while the connection was out
        dbconn.Conn(raw).close()
        old_pool.putconn.assert_called_once_with(raw)
        new_pool.putconn.assert_not_called()

    def test_falls_back_to_the_current_pool_without_an_owner(self):
        new_pool = mock.MagicMock(name="new")
        raw = self._raw(None)
        dbconn._pool = new_pool
        dbconn.Conn(raw).close()
        new_pool.putconn.assert_called_once_with(raw)

    def test_real_closed_pool_just_closes_the_connection(self):
        # The installed psycopg_pool, not a fake: putconn on a closed (here,
        # never-opened) pool closes the socket instead of raising.
        from psycopg_pool import ConnectionPool

        old_pool = ConnectionPool("", open=False)
        raw = self._raw(old_pool)
        dbconn._pool = mock.MagicMock(name="new")
        dbconn.Conn(raw).close()
        raw.close.assert_called_once()
        dbconn._pool.putconn.assert_not_called()


class EndCallRoomNeverRaises(unittest.TestCase):
    """end_call_room runs in the shutdown callback; anything it lets escape
    leaks the active_calls row and its concurrency slot for 4 hours."""

    def test_pool_value_error_on_return_is_swallowed(self):
        import db

        conn = mock.MagicMock(name="conn")
        conn.close.side_effect = ValueError("can't return connection to pool")
        with mock.patch.object(db.dbconn, "connect", return_value=conn):
            db.end_call_room("room-1")  # must not raise
        conn.execute.assert_called_once()

    def test_pool_timeout_on_connect_is_swallowed(self):
        import db

        with mock.patch.object(db.dbconn, "connect", side_effect=PoolTimeout("stalled")):
            db.end_call_room("room-1")  # must not raise


if __name__ == "__main__":
    unittest.main()
