"""Lightweight session implementations for px package."""


class NoopSession:
    """No-operation session that implements the database session interface.

    This provides a complete database session API but all operations are no-ops.
    Perfect for testing or when no real database is available.
    """

    class NoopBind:
        class NoopConnect:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                pass

            async def run_sync(self, fn, *args, **kwargs):  # noqa: ARG002
                return None

        def connect(self):
            return self.NoopConnect()

    bind = NoopBind()

    async def add(self, *args, **kwargs):
        pass

    async def commit(self):
        pass

    async def rollback(self):
        pass

    async def execute(self, *args, **kwargs):  # noqa: ARG002
        return None

    async def query(self, *args, **kwargs):  # noqa: ARG002
        return []

    async def close(self):
        pass

    async def refresh(self, *args, **kwargs):
        pass

    async def delete(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        pass

    async def get(self, *args, **kwargs):  # noqa: ARG002
        return None

    async def exec(self, *args, **kwargs):  # noqa: ARG002
        class _NoopResult:
            def first(self):
                return None

            def all(self):
                return []

            def one_or_none(self):
                return None

            def __iter__(self):
                return iter([])

        return _NoopResult()

    @property
    def no_autoflush(self):
        """Context manager that disables autoflush (no-op implementation)."""
        return self

    @property
    def is_active(self):
        """Check if session is active (always True for NoopSession)."""
        return True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        pass


class SyncNoopSession:
    """Synchronous no-op session for use with ``with_session()``.

    All methods are plain sync defs so that sync callers (``ProjectService``,
    ``BaseStateAwareComponent``) can call
    ``session.exec(stmt).first()`` etc. without getting unawaited coroutines.

    Guards the sync-only code path when no real database is available.
    """

    class _NoopResult:
        def first(self):
            return None

        def all(self):
            return []

        def one_or_none(self):
            return None

        def __iter__(self):
            return iter([])

    def exec(self, *args, **kwargs):  # noqa: ARG002
        return self._NoopResult()

    def add(self, *args, **kwargs):
        pass

    def add_all(self, *args, **kwargs):
        pass

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass

    def refresh(self, *args, **kwargs):
        pass

    def delete(self, *args, **kwargs):
        pass

    @property
    def no_autoflush(self):
        """Context manager that disables autoflush (no-op implementation)."""
        return self

    @property
    def is_active(self):
        """Check if session is active (always True for SyncNoopSession)."""
        return True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        pass
