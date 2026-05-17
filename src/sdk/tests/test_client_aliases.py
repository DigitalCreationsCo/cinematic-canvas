"""Verify that Client / AsyncClient are proper aliases for the long-form names."""

from __future__ import annotations

import pytest
from portals_sdk import AsyncClient, AsyncPortalsClient, Client, PortalsClient
from portals_sdk.client import AsyncClient as AsyncClientFromModule
from portals_sdk.client import Client as ClientFromModule


@pytest.mark.unit
def test_client_alias_is_portals_client() -> None:
    assert Client is PortalsClient


@pytest.mark.unit
def test_async_client_alias_is_async_portals_client() -> None:
    assert AsyncClient is AsyncPortalsClient


@pytest.mark.unit
def test_client_importable_from_module_directly() -> None:
    assert ClientFromModule is PortalsClient


@pytest.mark.unit
def test_async_client_importable_from_module_directly() -> None:
    assert AsyncClientFromModule is AsyncPortalsClient


@pytest.mark.unit
def test_client_instantiation_uses_short_name() -> None:
    """Client() should produce a PortalsClient instance."""
    client = Client("http://localhost:7860")
    assert isinstance(client, PortalsClient)
    assert isinstance(client, Client)
    client.close()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_async_client_instantiation_uses_short_name() -> None:
    """AsyncClient() should produce an AsyncPortalsClient instance."""
    client = AsyncClient("http://localhost:7860")
    try:
        assert isinstance(client, AsyncPortalsClient)
        assert isinstance(client, AsyncClient)
    finally:
        await client.aclose()


@pytest.mark.unit
def test_client_ticket_api_surface() -> None:
    """Reproduce the exact import path from the ticket spec."""
    # from portals_sdk import Client
    # client = Client("https://portals.example.com", api_key="...")
    # should have .list_flows(), .get_flow(), .run_flow()
    client = Client(
        "https://portals.example.com", api_key="test-key"
    )  # pragma: allowlist secret
    assert hasattr(client, "list_flows")
    assert hasattr(client, "get_flow")
    assert hasattr(client, "run_flow")
    assert hasattr(client, "create_flow")
    assert hasattr(client, "update_flow")
    assert hasattr(client, "delete_flow")
    assert hasattr(client, "upsert_flow")
    client.close()
