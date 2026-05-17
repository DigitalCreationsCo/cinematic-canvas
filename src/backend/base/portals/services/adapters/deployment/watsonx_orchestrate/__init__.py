"""Watsonx Orchestrate deployment adapter."""

from px.services.adapters.registry import register_adapter
from px.services.adapters.schema import AdapterType

from portals.services.adapters.deployment.watsonx_orchestrate.constants import (
    WATSONX_ORCHESTRATE_DEPLOYMENT_ADAPTER_KEY,
)
from portals.services.adapters.deployment.watsonx_orchestrate.service import WatsonxOrchestrateDeploymentService
from portals.services.adapters.deployment.watsonx_orchestrate.types import WxOCredentials

register_adapter(
    AdapterType.DEPLOYMENT,
    WATSONX_ORCHESTRATE_DEPLOYMENT_ADAPTER_KEY,
)(WatsonxOrchestrateDeploymentService)

__all__ = [
    "WatsonxOrchestrateDeploymentService",
    "WxOCredentials",
]
