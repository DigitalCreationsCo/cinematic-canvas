"""Feature authorization service.

Gates access to generative features (image generation, video generation)
based on the user's subscription tier and per-model credit costs stored
in FeatureGate config.

Deny-by-default: if no FeatureGate row exists for a (feature, tier) pair,
access is denied.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlmodel import select

from portals.services.database.models.feature_gate import FeatureGate
from portals.services.database.models.user.model import User

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

# ─── Default credit cost if not specified in FeatureGate config ─────────

_DEFAULT_CREDIT_COST: int = 1

# ─── Model-type → FeatureGate name mapping ─────────────────────────────
# Component templates use their own model_type vocabulary (e.g. "embedding"),
# while FeatureGate rows use feature names like "language".
#
# NOTE: The frontend duplicate!  ModelInputComponent has a parallel
# FEATURE_MAP that maps model_type => gate name for the credit-cost tooltip
# (src/frontend/.../modelInputComponent/index.tsx).  Keep both in sync.
_MODEL_TYPE_TO_FEATURE: dict[str, str] = {
    "embedding": "language",
}


def _to_feature_name(model_type: str) -> str:
    """Map a component template model_type to the FeatureGate feature name."""
    return _MODEL_TYPE_TO_FEATURE.get(model_type, model_type)


# ─── Public API ──────────────────────────────────────────────────────────


async def get_feature_gate(feature: str, tier: str, db: AsyncSession) -> FeatureGate | None:
    """Look up the FeatureGate row for a (feature, tier) pair."""
    result = await db.execute(
        select(FeatureGate).where(
            FeatureGate.feature == feature,
            FeatureGate.tier == tier,
        )
    )
    return result.scalar_one_or_none()


async def is_feature_available(feature: str, tier: str, db: AsyncSession) -> bool:
    """Check whether a feature is available for a given tier.

    Deny-by-default: returns False if no gate row exists.

    The ``feature`` parameter accepts component template model_type values
    (e.g. ``"embedding"``) — they are automatically normalized to FeatureGate
    feature names (e.g. ``"language"``) via ``_to_feature_name``.
    """
    gate = await get_feature_gate(_to_feature_name(feature), tier, db)
    if gate is None:
        return False
    return gate.enabled


async def authorize(
    user: User,
    feature: str,
    db: AsyncSession,
) -> bool:
    """Check whether a user is allowed to access a feature.

    Args:
        user: The user (with subscription_tier).
        feature: The feature name (e.g. "image_generation").
        db: Database session.

    Returns:
        True if the user's tier is allowed to use the feature.
    """
    tier = user.subscription_tier or "free"
    return await is_feature_available(feature, tier, db)


async def get_model_cost(
    model_type: str,
    db: AsyncSession,
    tier: str | None = None,
) -> int:
    """Get the credit cost for a specific model type.

    Looks up all tier gates for the feature to find the first one with
    a per_model override, falling back to the default credit_cost.

    If tier is provided, only looks up that specific tier's gate.

    The ``model_type`` parameter accepts component template values
    (e.g. ``"embedding"``) — they are automatically normalized to FeatureGate
    feature names via ``_to_feature_name``.
    """
    feature = _to_feature_name(model_type)

    if tier:
        gate = await get_feature_gate(feature, tier, db)
        if gate and gate.config:
            return _resolve_cost(gate.config, model_type)
        return _DEFAULT_CREDIT_COST

    # Without a tier, scan all tiers for the feature and return the first cost found
    result = await db.execute(
        select(FeatureGate).where(
            FeatureGate.feature == feature,
            FeatureGate.enabled == True,  # noqa: E712
        )
    )
    gates = result.scalars().all()
    for gate in gates:
        if gate.config:
            return _resolve_cost(gate.config, model_type)
    return _DEFAULT_CREDIT_COST


def _resolve_cost(config: dict, model_type: str) -> int:
    """Extract credit cost from a FeatureGate config dict.

    Config shape:
        {"credit_cost": 5, "per_model": {"model-x": 10, "model-y": 3}}
    """
    per_model = config.get("per_model", {})
    if isinstance(per_model, dict) and model_type in per_model:
        try:
            return int(per_model[model_type])
        except (ValueError, TypeError):
            pass
    try:
        return int(config.get("credit_cost", _DEFAULT_CREDIT_COST))
    except (ValueError, TypeError):
        return _DEFAULT_CREDIT_COST


async def get_available_features(
    user: User,
    db: AsyncSession,
) -> list[dict]:
    """Return the list of features available to the user with their credit costs."""
    tier = user.subscription_tier or "free"
    result = await db.execute(
        select(FeatureGate).where(
            FeatureGate.tier == tier,
            FeatureGate.enabled == True,  # noqa: E712
        )
    )
    features = []
    for gate in result.scalars().all():
        cost = _resolve_cost(gate.config or {}, gate.feature)
        features.append(
            {
                "feature": gate.feature,
                "description": gate.description,
                "credit_cost": cost,
            }
        )
    return features


async def check_flow_feature_access(
    flow_graph: dict,
    tier: str,
    db: AsyncSession,
) -> list[str]:
    """Check every node in a flow graph and return model types that are NOT
    available for the given tier.

    Deny-by-default: if no FeatureGate row exists for a (model_type, tier)
    pair, the model type is included in the returned list.

    Returns an empty list when all nodes have access.
    """
    denied: list[str] = []
    nodes = _get_flow_nodes(flow_graph)
    seen: set[str] = set()
    for node in nodes:
        model_type = _get_model_type(node)
        if not model_type or model_type in seen:
            continue
        seen.add(model_type)
        if not await is_feature_available(model_type, tier, db):
            denied.append(model_type)
    return denied


def _get_flow_nodes(flow_graph: dict) -> list[dict]:
    """Extract node list from a flow graph."""
    try:
        return flow_graph.get("data", {}).get("nodes", [])
    except AttributeError:
        return []


def _get_model_type(node: dict) -> str | None:
    """Extract model_type from a flow vertex's template field."""
    try:
        return node.get("data", {}).get("node", {}).get("template", {}).get("model_type", {}).get("value")
    except AttributeError:
        return None
