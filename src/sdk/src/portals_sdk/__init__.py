"""portals-sdk -- Python SDK for the Portals REST API."""

from portals_sdk._async_client import AsyncClient, AsyncPortalsClient
from portals_sdk.background_job import BackgroundJob
from portals_sdk.client import Client, PortalsClient
from portals_sdk.environments import (
    EnvironmentConfig,
    get_async_client,
    get_client,
    get_environment,
    load_environments,
)
from portals_sdk.exceptions import (
    EnvironmentConfigError,
    EnvironmentNotFoundError,
    PortalsAuthError,
    PortalsConnectionError,
    PortalsError,
    PortalsHTTPError,
    PortalsNotFoundError,
    PortalsTimeoutError,
    PortalsValidationError,
)
from portals_sdk.models import (
    Flow,
    FlowCreate,
    FlowUpdate,
    Project,
    ProjectCreate,
    ProjectUpdate,
    ProjectWithFlows,
    RunOutput,
    RunRequest,
    RunResponse,
    StreamChunk,
)
from portals_sdk.serialization import flow_to_json, normalize_flow, normalize_flow_file

__all__ = [
    "AsyncClient",  # short alias for AsyncPortalsClient (preferred)
    "AsyncPortalsClient",
    "BackgroundJob",
    "Client",  # short alias for PortalsClient (preferred)
    "EnvironmentConfig",
    "EnvironmentConfigError",
    "EnvironmentNotFoundError",
    "Flow",
    "FlowCreate",
    "FlowUpdate",
    "PortalsAuthError",
    "PortalsClient",
    "PortalsConnectionError",
    "PortalsError",
    "PortalsHTTPError",
    "PortalsNotFoundError",
    "PortalsTimeoutError",
    "PortalsValidationError",
    "Project",
    "ProjectCreate",
    "ProjectUpdate",
    "ProjectWithFlows",
    "RunOutput",
    "RunRequest",
    "RunResponse",
    "StreamChunk",
    "flow_to_json",
    "get_async_client",
    "get_client",
    "get_environment",
    "load_environments",
    "normalize_flow",
    "normalize_flow_file",
]
