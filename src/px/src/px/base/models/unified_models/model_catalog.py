"""Unified model catalog filtering and UI option construction."""

from __future__ import annotations

import contextlib
from typing import TYPE_CHECKING, Any

from px.base.models.model_metadata import (
    get_provider_param_mapping,
    is_provisioned_provider,
)
from px.base.models.model_utils import replace_with_live_models
from px.utils.async_helpers import run_until_complete

from .class_registry import EMBEDDING_PROVIDER_CLASS_MAPPING
from .credentials import _fetch_enabled_providers_for_user, _get_model_status
from .provider_queries import MODELS_DETAILED, model_provider_metadata

if TYPE_CHECKING:
    from uuid import UUID

# ---------------------------------------------------------------------------
# Valid model_type values understood by this catalog.
# ---------------------------------------------------------------------------
MODEL_TYPE_LLM = "llm"
MODEL_TYPE_EMBEDDINGS = "embeddings"
MODEL_TYPE_IMAGE_GENERATION = "image_generation"
MODEL_TYPE_VIDEO_GENERATION = "video_generation"

ALL_MODEL_TYPES: frozenset[str] = frozenset(
    [
        MODEL_TYPE_LLM,
        MODEL_TYPE_EMBEDDINGS,
        MODEL_TYPE_IMAGE_GENERATION,
        MODEL_TYPE_VIDEO_GENERATION,
    ]
)


def _provider_is_enabled_for_user(
    provider: str,
    enabled_providers: set[str],
    user_id: Any,
) -> bool:
    """Return True if ``provider`` is enabled for the current user.

    Provisioned providers are always enabled — no user credential is required.
    BYOK providers are enabled only if the user has configured credentials.
    """
    if is_provisioned_provider(provider):
        return True
    if not user_id or not enabled_providers:
        return True
    return provider in enabled_providers


def get_unified_models_detailed(
    providers: list[str] | None = None,
    model_name: str | None = None,
    model_type: str | None = None,
    *,
    include_unsupported: bool | None = None,
    include_deprecated: bool | None = None,
    only_defaults: bool = False,
    provisioned: bool | None = None,
    **metadata_filters,
):
    """Return a list of providers and their models, optionally filtered.

    Parameters
        ----------
        providers : list[str] | None
            If given, only models from these providers are returned.
        model_name : str | None
            If given, only the model with this exact name is returned.
        model_type : str | None
            Optional.  Restrict to models whose metadata ``model_type`` matches
            this value.  Accepted values: ``"llm"``, ``"embeddings"``,
            ``"image_generation"``, ``"video_generation"``.
        include_unsupported : bool
            When False (default) models whose metadata contains ``not_supported=True``
            are filtered out.
        include_deprecated : bool
            When False (default) models whose metadata contains ``deprecated=True``
            are filtered out.
        only_defaults : bool
            When True, only models marked as default are returned.
            The first 5 models from each provider (in list order) are automatically
            marked as default. Defaults to False to maintain backward compatibility.
        provisioned : bool | None
            When True, only platform-provisioned models are returned.
            When False, only BYOK (bring-your-own-key) models are returned.
            When None (default), all models are returned regardless of provisioning.
        **metadata_filters
            Arbitrary key/value pairs to match against the model's metadata.
            Example: ``get_unified_models_detailed(tool_calling=True)``
    """
    if include_unsupported is None:
        include_unsupported = False
    if include_deprecated is None:
        include_deprecated = False

    # Gather all models from imported *_MODELS_DETAILED lists
    all_models: list[dict] = []
    for models_detailed in MODELS_DETAILED:
        all_models.extend(models_detailed)

    # Apply filters
    filtered_models: list[dict] = []
    for md in all_models:
        # Skip models flagged as not_supported unless explicitly included
        if (not include_unsupported) and md.get("not_supported", False):
            continue

        # Skip models flagged as deprecated unless explicitly included
        if (not include_deprecated) and md.get("deprecated", False):
            continue

        if providers and md.get("provider") not in providers:
            continue
        if model_name and md.get("name") != model_name:
            continue
        if model_type and md.get("model_type") != model_type:
            continue

        # Provisioned filter — compare at model level first, then provider level
        if provisioned is not None:
            model_provisioned = md.get("provisioned", is_provisioned_provider(md.get("provider", "")))
            if model_provisioned != provisioned:
                continue

        # Match arbitrary metadata key/value pairs
        if any(md.get(k) != v for k, v in metadata_filters.items()):
            continue

        filtered_models.append(md)

    # Group by provider
    provider_map: dict[str, list[dict]] = {}
    for metadata in filtered_models:
        prov = metadata.get("provider", "Unknown")
        provider_map.setdefault(prov, []).append(
            {
                "model_name": metadata.get("name"),
                "metadata": {k: v for k, v in metadata.items() if k not in ("provider", "name")},
            }
        )

    # Mark the first 5 models in each provider as default (based on list order)
    # and optionally filter to only defaults
    default_model_count = 5  # Number of default models per provider

    for prov, models in provider_map.items():
        for i, model in enumerate(models):
            if i < default_model_count:
                model["metadata"]["default"] = True
            else:
                model["metadata"]["default"] = False

        # If only_defaults is True, filter to only default models
        if only_defaults:
            provider_map[prov] = [m for m in models if m["metadata"].get("default", False)]

    # Format as requested; attach provider-level provisioned flag for callers
    return [
        {
            "provider": prov,
            "models": models,
            "num_models": len(models),
            # Expose whether this provider is provisioned so the API layer can
            # mark it as always-configured without re-importing metadata.
            "is_provisioned": is_provisioned_provider(prov),
            **model_provider_metadata.get(prov, {}),
        }
        for prov, models in provider_map.items()
    ]


# ---------------------------------------------------------------------------
# Language-model options
# ---------------------------------------------------------------------------


def get_language_model_options(
    user_id: UUID | str | None = None, *, tool_calling: bool | None = None
) -> list[dict[str, Any]]:
    """Return available language model providers with their configuration.

    Provisioned LLM providers are always included regardless of credential
    configuration.  BYOK providers are included only when the user has
    configured valid credentials.
    """
    kwargs: dict[str, Any] = {
        "model_type": MODEL_TYPE_LLM,
        "include_deprecated": False,
        "include_unsupported": False,
    }
    if tool_calling is not None:
        kwargs["tool_calling"] = tool_calling

    all_models = get_unified_models_detailed(**kwargs)

    # Get disabled and explicitly enabled models for this user if user_id is provided
    disabled_models: set[str] = set()
    explicitly_enabled_models: set[str] = set()
    if user_id:
        with contextlib.suppress(Exception):
            disabled_models, explicitly_enabled_models = run_until_complete(_get_model_status(user_id))

    # Get enabled providers (those with credentials configured and validated)
    enabled_providers = set()
    if user_id:
        with contextlib.suppress(Exception):
            enabled_providers = run_until_complete(_fetch_enabled_providers_for_user(user_id))

    # Replace static defaults with actual available models from configured instances
    if enabled_providers:
        replace_with_live_models(all_models, user_id, enabled_providers, "llm", model_provider_metadata)

    options = []

    # Track which providers have models
    providers_with_models = set()

    for provider_data in all_models:
        provider = provider_data.get("provider")

        # Provisioned providers are always considered enabled
        if not _provider_is_enabled_for_user(provider, enabled_providers, user_id):
            continue

        providers_with_models.add(provider)
        models = provider_data.get("models", [])
        icon = provider_data.get("icon", "Bot")

        for model_data in models:
            model_name = model_data.get("model_name")
            metadata = model_data.get("metadata", {})
            is_default = metadata.get("default", False)

            # Determine if model should be shown:
            # - Provisioned models with default=True are always visible
            # - Non-default BYOK models require explicit enablement
            # - Disabled models are always hidden
            if not is_default and model_name not in explicitly_enabled_models:
                continue
            if model_name in disabled_models:
                continue

            param_mapping = get_provider_param_mapping(provider)
            provider_meta = model_provider_metadata.get(provider, {})
            option_metadata: dict[str, Any] = {
                "context_length": 128000,
                "model_class": param_mapping.get("model_class", "ChatOpenAI"),
                "model_name_param": param_mapping.get("model_param", "model"),
                "api_key_param": param_mapping.get("api_key_param", "api_key"),
                "provisioned": metadata.get("provisioned", is_provisioned_provider(provider)),
            }

            if "max_tokens_field_name" in provider_meta:
                option_metadata["max_tokens_field_name"] = provider_meta["max_tokens_field_name"]

            option: dict[str, Any] = {
                "name": model_name,
                "icon": icon,
                "category": provider,
                "provider": provider,
                "metadata": option_metadata,
            }

            if provider == "OpenAI" and metadata.get("reasoning"):
                option["metadata"].setdefault("reasoning_models", []).append(model_name)

            if "base_url_param" in param_mapping:
                option["metadata"]["base_url_param"] = param_mapping["base_url_param"]
            if "url_param" in param_mapping:
                option["metadata"]["url_param"] = param_mapping["url_param"]
            if "project_id_param" in param_mapping:
                option["metadata"]["project_id_param"] = param_mapping["project_id_param"]

            options.append(option)

    return options


# ---------------------------------------------------------------------------
# Embedding model options
# ---------------------------------------------------------------------------


def get_embedding_model_options(
    user_id: UUID | str | None = None,
) -> list[dict[str, Any]]:
    """Return available embedding model providers with their configuration.

    Provisioned embedding providers are always included.
    """
    all_models = get_unified_models_detailed(
        model_type=MODEL_TYPE_EMBEDDINGS,
        include_deprecated=False,
        include_unsupported=False,
    )

    disabled_models: set[str] = set()
    explicitly_enabled_models: set[str] = set()
    if user_id:
        with contextlib.suppress(Exception):
            disabled_models, explicitly_enabled_models = run_until_complete(_get_model_status(user_id))

    enabled_providers: set[str] = set()
    if user_id:
        with contextlib.suppress(Exception):
            enabled_providers = run_until_complete(_fetch_enabled_providers_for_user(user_id))

    if enabled_providers:
        replace_with_live_models(
            all_models,
            user_id,
            enabled_providers,
            MODEL_TYPE_EMBEDDINGS,
            model_provider_metadata,
        )

    # Provider-specific param mappings
    param_mappings: dict[str, dict] = {
        "OpenAI": {
            "model": "model",
            "api_key": "api_key",  # pragma: allowlist secret
            "api_base": "base_url",
            "dimensions": "dimensions",
            "chunk_size": "chunk_size",
            "request_timeout": "timeout",
            "max_retries": "max_retries",
            "show_progress_bar": "show_progress_bar",
            "model_kwargs": "model_kwargs",
        },
        "Google Generative AI": {
            "model": "model",
            "api_key": "google_api_key",  # pragma: allowlist secret
            "dimensions": "output_dimensionality",
            "request_timeout": "request_options",
            "model_kwargs": "client_options",
        },
        "Ollama": {
            "model": "model",
            "base_url": "base_url",
            "num_ctx": "num_ctx",
            "request_timeout": "request_timeout",
            "model_kwargs": "model_kwargs",
        },
        "IBM WatsonX": {
            "model_id": "model_id",
            "url": "url",
            "api_key": "apikey",  # pragma: allowlist secret
            "project_id": "project_id",
            "space_id": "space_id",
            "request_timeout": "request_timeout",
        },
    }

    options = []
    providers_with_models: set[str] = set()

    for provider_data in all_models:
        provider = provider_data.get("provider")

        if not _provider_is_enabled_for_user(provider, enabled_providers, user_id):
            continue

        providers_with_models.add(provider)
        models = provider_data.get("models", [])
        icon = provider_data.get("icon", "Bot")

        for model_data in models:
            model_name = model_data.get("model_name")
            metadata = model_data.get("metadata", {})
            is_default = metadata.get("default", False)

            if not is_default and model_name not in explicitly_enabled_models:
                continue
            if model_name in disabled_models:
                continue

            option: dict[str, Any] = {
                "name": model_name,
                "icon": icon,
                "category": provider,
                "provider": provider,
                "metadata": {
                    "embedding_class": EMBEDDING_PROVIDER_CLASS_MAPPING.get(provider, "OpenAIEmbeddings"),
                    "param_mapping": param_mappings.get(provider, param_mappings["OpenAI"]),
                    "model_type": MODEL_TYPE_EMBEDDINGS,
                    "provisioned": metadata.get("provisioned", is_provisioned_provider(provider)),
                },
            }

            options.append(option)

    return options


# ---------------------------------------------------------------------------
# Image-generation model options
# ---------------------------------------------------------------------------


def get_image_generation_model_options(
    user_id: UUID | str | None = None,
) -> list[dict[str, Any]]:
    """Return available image-generation model providers with their configuration.

    Provisioned image-generation providers are always included regardless of
    user credential configuration.
    """
    all_models = get_unified_models_detailed(
        model_type=MODEL_TYPE_IMAGE_GENERATION,
        include_deprecated=False,
        include_unsupported=False,
    )

    disabled_models: set[str] = set()
    explicitly_enabled_models: set[str] = set()
    if user_id:
        with contextlib.suppress(Exception):
            disabled_models, explicitly_enabled_models = run_until_complete(_get_model_status(user_id))

    enabled_providers: set[str] = set()
    if user_id:
        with contextlib.suppress(Exception):
            enabled_providers = run_until_complete(_fetch_enabled_providers_for_user(user_id))

    options = []

    for provider_data in all_models:
        provider = provider_data.get("provider")

        if not _provider_is_enabled_for_user(provider, enabled_providers, user_id):
            continue

        models = provider_data.get("models", [])
        icon = provider_data.get("icon", "Bot")
        param_mapping = get_provider_param_mapping(provider)

        for model_data in models:
            model_name = model_data.get("model_name")
            metadata = model_data.get("metadata", {})
            is_default = metadata.get("default", False)

            if not is_default and model_name not in explicitly_enabled_models:
                continue
            if model_name in disabled_models:
                continue

            option: dict[str, Any] = {
                "name": model_name,
                "icon": icon,
                "category": provider,
                "provider": provider,
                "metadata": {
                    "model_type": MODEL_TYPE_IMAGE_GENERATION,
                    "model_class": param_mapping.get("model_class", "OpenAIImageGeneration"),
                    "model_name_param": param_mapping.get("model_param", "model"),
                    "api_key_param": param_mapping.get("api_key_param", "api_key"),
                    "provisioned": metadata.get("provisioned", is_provisioned_provider(provider)),
                    # Image-generation-specific capabilities from model metadata
                    "supported_sizes": metadata.get("supported_sizes", []),
                    "supported_qualities": metadata.get("supported_qualities", []),
                    "supported_formats": metadata.get("supported_formats", []),
                },
            }

            options.append(option)

    return options


# ---------------------------------------------------------------------------
# Video-generation model options
# ---------------------------------------------------------------------------


def get_video_generation_model_options(
    user_id: UUID | str | None = None,
) -> list[dict[str, Any]]:
    """Return available video-generation model providers with their configuration.

    Provisioned video-generation providers are always included regardless of
    user credential configuration.
    """
    all_models = get_unified_models_detailed(
        model_type=MODEL_TYPE_VIDEO_GENERATION,
        include_deprecated=False,
        include_unsupported=False,
    )

    disabled_models: set[str] = set()
    explicitly_enabled_models: set[str] = set()
    if user_id:
        with contextlib.suppress(Exception):
            disabled_models, explicitly_enabled_models = run_until_complete(_get_model_status(user_id))

    enabled_providers: set[str] = set()
    if user_id:
        with contextlib.suppress(Exception):
            enabled_providers = run_until_complete(_fetch_enabled_providers_for_user(user_id))

    options = []

    for provider_data in all_models:
        provider = provider_data.get("provider")

        if not _provider_is_enabled_for_user(provider, enabled_providers, user_id):
            continue

        models = provider_data.get("models", [])
        icon = provider_data.get("icon", "Bot")
        param_mapping = get_provider_param_mapping(provider)

        for model_data in models:
            model_name = model_data.get("model_name")
            metadata = model_data.get("metadata", {})
            is_default = metadata.get("default", False)

            if not is_default and model_name not in explicitly_enabled_models:
                continue
            if model_name in disabled_models:
                continue

            option: dict[str, Any] = {
                "name": model_name,
                "icon": icon,
                "category": provider,
                "provider": provider,
                "metadata": {
                    "model_type": MODEL_TYPE_VIDEO_GENERATION,
                    "model_class": param_mapping.get("model_class", "ProvisionedVideoGeneration"),
                    "model_name_param": param_mapping.get("model_param", "model"),
                    "api_key_param": param_mapping.get("api_key_param", "api_key"),
                    "provisioned": metadata.get("provisioned", is_provisioned_provider(provider)),
                    # Video-generation-specific capabilities from model metadata
                    "max_duration_seconds": metadata.get("max_duration_seconds"),
                    "supported_resolutions": metadata.get("supported_resolutions", []),
                    "supported_formats": metadata.get("supported_formats", []),
                },
            }

            options.append(option)

    return options


# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------


def normalize_model_names_to_dicts(
    model_names: list[str] | str,
) -> list[dict[str, Any]]:
    """Convert simple model name(s) to list of dicts format."""
    if isinstance(model_names, str):
        model_names = [model_names]

    try:
        all_models = get_unified_models_detailed()
    except Exception:  # noqa: BLE001
        return [{"name": name} for name in model_names]

    # Build a lookup map of model_name -> full model data with runtime metadata
    model_lookup: dict[str, dict[str, Any]] = {}
    for provider_data in all_models:
        provider = provider_data.get("provider")
        icon = provider_data.get("icon", "Bot")
        for model_data in provider_data.get("models", []):
            model_name = model_data.get("model_name")
            base_metadata = model_data.get("metadata", {})
            param_mapping = get_provider_param_mapping(provider)
            provider_meta = model_provider_metadata.get(provider, {})

            runtime_metadata: dict[str, Any] = {
                "context_length": 128000,
                "model_class": param_mapping.get("model_class", "ChatOpenAI"),
                "model_name_param": param_mapping.get("model_param", "model"),
                "api_key_param": param_mapping.get("api_key_param", "api_key"),
                "provisioned": base_metadata.get("provisioned", is_provisioned_provider(provider)),
            }

            if "max_tokens_field_name" in provider_meta:
                runtime_metadata["max_tokens_field_name"] = provider_meta["max_tokens_field_name"]

            if provider == "OpenAI" and base_metadata.get("reasoning"):
                runtime_metadata["reasoning_models"] = [model_name]

            if "base_url_param" in param_mapping:
                runtime_metadata["base_url_param"] = param_mapping["base_url_param"]
            if "url_param" in param_mapping:
                runtime_metadata["url_param"] = param_mapping["url_param"]
            if "project_id_param" in param_mapping:
                runtime_metadata["project_id_param"] = param_mapping["project_id_param"]

            full_metadata = {**base_metadata, **runtime_metadata}
            model_lookup[model_name] = {
                "name": model_name,
                "icon": icon,
                "category": provider,
                "provider": provider,
                "metadata": full_metadata,
            }

    result = []
    for name in model_names:
        if name in model_lookup:
            result.append(model_lookup[name])
        else:
            result.append(
                {
                    "name": name,
                    "provider": "Unknown",
                    "metadata": {
                        "model_class": "ChatOpenAI",
                        "model_name_param": "model",
                        "api_key_param": "api_key",  # pragma: allowlist secret
                        "provisioned": False,
                    },
                }
            )

    return result
