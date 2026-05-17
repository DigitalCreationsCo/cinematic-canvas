"""Regression tests for px.memory runtime dispatch.

Original bug: when portals was installed alongside px but `px run` had
only a NoopDatabaseService registered, `px.memory` bound at import time to
`portals.memory` (because the `portals` package was importable). The
portals-backed `aupdate_messages` then called `session.get(...)` on a
NoopSession, which always returns `None`, raising spurious
"Message with id X not found" errors mid-stream.
"""

from __future__ import annotations

import uuid

import pytest
from px.services.database.service import NoopDatabaseService
from px.utils.portals_utils import has_portals_db_backend


class _FakeRealDbService:
    """Stand-in for any non-noop DatabaseService implementation."""


class TestHasPortalsDbBackend:
    def test_returns_false_when_portals_not_importable(self, monkeypatch):
        monkeypatch.setattr(
            "px.utils.portals_utils.has_portals_memory", lambda: False
        )
        assert has_portals_db_backend() is False

    def test_returns_false_with_noop_db_service(self, monkeypatch):
        monkeypatch.setattr(
            "px.utils.portals_utils.has_portals_memory", lambda: True
        )
        monkeypatch.setattr(
            "px.services.deps.get_db_service", lambda: NoopDatabaseService()
        )
        assert has_portals_db_backend() is False

    def test_returns_true_with_real_db_service(self, monkeypatch):
        monkeypatch.setattr(
            "px.utils.portals_utils.has_portals_memory", lambda: True
        )
        monkeypatch.setattr(
            "px.services.deps.get_db_service", lambda: _FakeRealDbService()
        )
        assert has_portals_db_backend() is True

    def test_returns_false_when_get_db_service_raises(self, monkeypatch):
        monkeypatch.setattr(
            "px.utils.portals_utils.has_portals_memory", lambda: True
        )

        def boom():
            msg = "service manager exploded"
            raise RuntimeError(msg)

        monkeypatch.setattr("px.services.deps.get_db_service", boom)
        assert has_portals_db_backend() is False


class TestMemoryDispatch:
    def test_dispatches_to_stubs_when_no_real_db(self, monkeypatch):
        import px.memory as memory_mod
        from px.memory import stubs

        monkeypatch.setattr("px.memory.has_portals_db_backend", lambda: False)
        assert memory_mod._impl() is stubs

    def test_dispatches_to_portals_when_real_db(self, monkeypatch):
        pytest.importorskip("portals.memory")
        import portals.memory as portals_memory
        import px.memory as memory_mod

        monkeypatch.setattr("px.memory.has_portals_db_backend", lambda: True)
        assert memory_mod._impl() is portals_memory

    def test_dispatch_is_evaluated_per_call(self, monkeypatch):
        """Dispatch must read the backend state each call, not cache at import.

        The database service is often registered *after* px.memory is imported
        (components load first, services register during graph setup), so
        memoizing the dispatcher would bind to whatever state existed at
        component-module load time.
        """
        import px.memory as memory_mod
        from px.memory import stubs

        state = {"real": False}
        monkeypatch.setattr("px.memory.has_portals_db_backend", lambda: state["real"])

        assert memory_mod._impl() is stubs
        state["real"] = True
        pytest.importorskip("portals.memory")
        import portals.memory as portals_memory

        assert memory_mod._impl() is portals_memory


class TestAupdateMessagesRegression:
    """Direct regression for the original 'Message with id X not found' crash."""

    @pytest.mark.asyncio
    async def test_aupdate_messages_does_not_raise_against_noop_session(
        self, monkeypatch
    ):
        """Regression: route to stubs (no-op) instead of raising via portals.memory.

        With portals importable but only a NoopDatabaseService registered,
        aupdate_messages must route to stubs and succeed silently rather than
        trigger portals.memory's strict existence check against NoopSession.
        """
        try:
            from portals.schema.message import Message
        except ImportError:
            from px.schema.message import Message

        # Force the noop-DB branch even if a real DB happens to be registered in
        # this test environment.
        monkeypatch.setattr(
            "px.services.deps.get_db_service", lambda: NoopDatabaseService()
        )

        from px.memory import aupdate_messages

        msg = Message(
            id=str(uuid.uuid4()),
            text="hello",
            sender="AI",
            sender_name="Test",
            session_id="test-session",
        )
        result = await aupdate_messages(msg)
        assert isinstance(result, list)
