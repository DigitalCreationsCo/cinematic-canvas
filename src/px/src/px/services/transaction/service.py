"""Transaction service implementations for px."""

from __future__ import annotations

from typing import Any

from px.services.interfaces import TransactionServiceProtocol


class NoopTransactionService(TransactionServiceProtocol):
    """No-operation transaction service for standalone px mode.

    This service is used when px runs without a concrete transaction
    service implementation (e.g., without portals). All operations
    are no-ops and transaction logging is disabled.
    """

    async def log_transaction(
        self,
        flow_id: str,
        vertex_id: str,
        inputs: dict[str, Any] | None,
        outputs: dict[str, Any] | None,
        status: str,
        target_id: str | None = None,
        error: str | None = None,
    ) -> None:
        """No-op implementation of transaction logging.

        In standalone mode, transactions are not persisted.
        """

    def is_enabled(self) -> bool:
        """Transaction logging is disabled in noop mode."""
        return False
