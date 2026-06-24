"""Database service implementations for px package."""

from __future__ import annotations

from contextlib import asynccontextmanager, contextmanager


class NoopDatabaseService:
    """No-operation database service for standalone px usage.

    This provides a database service interface that always returns NoopSession,
    allowing px to work without a real database connection.
    """

    @asynccontextmanager
    async def _with_session(self):
        """Internal method to create a session. DO NOT USE DIRECTLY.

        Use session_scope() for write operations or session_scope_readonly() for read operations.
        This method does not handle commits - it only provides a raw session.
        """
        from px.services.session import NoopSession

        async with NoopSession() as session:
            yield session

    @contextmanager
    def with_session(self):
        """Synchronous context manager that yields a ``SyncNoopSession``.

        Provides a session with sync methods (``exec``, ``commit``, etc.)
        so that sync-only callers such as ``ProjectService``,
        ``BaseStateAwareComponent``
        do not receive unawaited coroutines from the async ``NoopSession``.
        """
        from px.services.session import SyncNoopSession

        with SyncNoopSession() as session:
            yield session
