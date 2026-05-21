from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from px.base.models.model_metadata import is_provisioned_provider
from px.base.models.model_utils import replace_with_live_models
from px.base.models.unified_models import (
    get_model_provider_metadata,
    get_model_provider_variable_mapping,
    get_model_providers,
    get_provider_all_variables,
    get_unified_models_detailed,
)
from pydantic import BaseModel, field_validator

from portals.api.utils import CurrentActiveUser, DbSession
from portals.services.auth.utils import get_current_active_user
from portals.services.deps import get_variable_service
from portals.services.variable.constants import GENERIC_TYPE
from portals.services.variable.service import DatabaseVariableService

router = APIRouter(prefix="/models", tags=["Models"], include_in_schema=False)

# Variable names for storing disabled models and default models
DISABLED_MODELS_VAR = "__disabled_models__"
ENABLED_MODELS_VAR = "__enabled_models__"
DEFAULT_LANGUAGE_MODEL_VAR = "__default_language_model__"
DEFAULT_EMBEDDING_MODEL_VAR = "__default_embedding_model__"
# New default-model variables for generative media types
DEFAULT_IMAGE_MODEL_VAR = "__default_image_model__"
DEFAULT_VIDEO_MODEL_VAR = "__default_video_model__"

# Security limits
MAX_STRING_LENGTH = 200  # Maximum length for model IDs and provider names
MAX_BATCH_UPDATE_SIZE = 100  # Maximum number of models that can be updated at once

# Mapping from API-level model_type strings to storage variable names
_DEFAULT_MODEL_VAR_MAP: dict[str, str] = {
    "language": DEFAULT_LANGUAGE_MODEL_VAR,
    "embedding": DEFAULT_EMBEDDING_MODEL_VAR,
    "image": DEFAULT_IMAGE_MODEL_VAR,
    "video": DEFAULT_VIDEO_MODEL_VAR,
}

# Valid model_type values accepted by the default-model endpoints
VALID_DEFAULT_MODEL_TYPES: frozenset[str] = frozenset(_DEFAULT_MODEL_VAR_MAP.keys())


def _default_model_var(model_type: str) -> str:
    """Resolve the variable name used to persist the default model for a given type."""
    return _DEFAULT_MODEL_VAR_MAP[model_type]


def get_provider_from_variable_name(variable_name: str) -> str | None:
    """Get provider name from a model provider variable name.

    Args:
        variable_name: The variable name (e.g., "OPENAI_API_KEY")

    Returns:
        The provider name (e.g., "OpenAI") or None if not a model provider variable
    """
    provider_mapping = get_model_provider_variable_mapping()
    for provider, var_name in provider_mapping.items():
        if var_name == variable_name:
            return provider
    return None


def get_model_names_for_provider(provider: str) -> set[str]:
    """Get all model names for a given provider."""
    models_by_provider = get_unified_models_detailed(
        providers=[provider],
        include_unsupported=True,
        include_deprecated=True,
    )

    model_names: set[str] = set()
    for provider_dict in models_by_provider:
        if provider_dict.get("provider") == provider:
            for model in provider_dict.get("models", []):
                model_names.add(model.get("model_name"))

    return model_names


class ModelStatusUpdate(BaseModel):
    """Request model for updating model enabled status."""

    provider: str
    model_id: str
    enabled: bool

    @field_validator("model_id", "provider")
    @classmethod
    def validate_non_empty_string(cls, v: str) -> str:
        """Ensure strings are non-empty and reasonable length."""
        if not v or not v.strip():
            msg = "Field cannot be empty"
            raise ValueError(msg)
        if len(v) > MAX_STRING_LENGTH:
            msg = f"Field exceeds maximum length of {MAX_STRING_LENGTH} characters"
            raise ValueError(msg)
        return v.strip()


class ValidateProviderRequest(BaseModel):
    """Request model for validating provider credentials."""

    provider: str
    variables: dict[str, str]  # {variable_key: value}

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v: str) -> str:
        """Ensure provider name is valid."""
        if not v or not v.strip():
            msg = "Provider cannot be empty"
            raise ValueError(msg)
        if len(v) > MAX_STRING_LENGTH:
            msg = f"Provider exceeds maximum length of {MAX_STRING_LENGTH} characters"
            raise ValueError(msg)
        return v.strip()


class ValidateProviderResponse(BaseModel):
    """Response model for provider validation."""

    valid: bool
    error: str | None = None


@router.get(
    "/providers", status_code=200, dependencies=[Depends(get_current_active_user)]
)
async def list_model_providers() -> list[str]:
    """Return available model providers."""
    return get_model_providers()


@router.get("", status_code=200)
async def list_models(
    *,
    provider: Annotated[
        list[str] | None, Query(description="Repeat to include multiple providers")
    ] = None,
    model_name: str | None = None,
    model_type: Annotated[
        str | None,
        Query(
            description=(
                "Filter by model type. "
                "Accepted values: 'llm', 'embeddings', 'image_generation', 'video_generation'."
            )
        ),
    ] = None,
    include_unsupported: bool = False,
    include_deprecated: bool = False,
    # provisioned filter
    provisioned: Annotated[
        bool | None,
        Query(
            description=(
                "When true, return only platform-provisioned models. "
                "When false, return only BYOK models. "
                "Omit to return all models."
            )
        ),
    ] = None,
    # common metadata filters
    tool_calling: bool | None = None,
    reasoning: bool | None = None,
    search: bool | None = None,
    preview: bool | None = None,
    deprecated: bool | None = None,
    not_supported: bool | None = None,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    """Return model catalog filtered by query parameters.

    Pass providers as repeated query params, e.g. ``?provider=OpenAI&provider=Anthropic``.

    The ``model_type`` parameter now accepts:
    - ``llm``              — language models
    - ``embeddings``       — embedding models
    - ``image_generation`` — image-generation models
    - ``video_generation`` — video-generation models
    """
    selected_providers: list[str] | None = provider
    metadata_filters = {
        k: v
        for k, v in {
            "tool_calling": tool_calling,
            "reasoning": reasoning,
            "search": search,
            "preview": preview,
            "deprecated": deprecated,
            "not_supported": not_supported,
        }.items()
        if v is not None
    }

    # Get enabled providers status (checks if BYOK variables exist)
    enabled_providers_result = await get_enabled_providers(
        session=session, current_user=current_user
    )
    provider_configured_status = enabled_providers_result.get("provider_status", {})

    # Get enabled models map for current user to determine "active" providers
    enabled_models_result = await get_enabled_models(
        session=session, current_user=current_user
    )
    enabled_models_map = enabled_models_result.get("enabled_models", {})

    # Get default model if model_type is specified (used only for sort ordering)
    default_provider = None
    if model_type:
        try:
            default_model_result = await get_default_model(
                session=session,
                current_user=current_user,
                model_type=_catalog_type_to_api_type(model_type),
            )
            if default_model_result.get("default_model"):
                default_provider = default_model_result["default_model"].get("provider")
        except Exception:  # noqa: BLE001
            logger.debug(
                "Failed to fetch default model, continuing without it", exc_info=True
            )

    # Fetch filtered catalog
    filtered_models = get_unified_models_detailed(
        providers=selected_providers,
        model_name=model_name,
        include_unsupported=include_unsupported,
        include_deprecated=include_deprecated,
        model_type=model_type,
        provisioned=provisioned,
        **metadata_filters,
    )

    # Annotate each provider dict with configured/enabled status
    for provider_dict in filtered_models:
        prov_name = provider_dict.get("provider")

        # Provisioned providers are always configured — no user credentials needed
        if is_provisioned_provider(prov_name):
            provider_dict["is_configured"] = True
            provider_dict["is_enabled"] = True
        else:
            provider_dict["is_configured"] = provider_configured_status.get(
                prov_name, False
            )
            prov_models_status = enabled_models_map.get(prov_name, {})
            provider_dict["is_enabled"] = any(prov_models_status.values())

    # Replace static models with live models for providers that support it
    configured_providers = {
        p for p, configured in provider_configured_status.items() if configured
    }
    replace_with_live_models(
        filtered_models, current_user.id, configured_providers, model_type
    )

    # Sort: default provider → configured BYOK → alphabetical
    def sort_key(provider_dict: dict) -> tuple:
        provider_name = provider_dict.get("provider", "")
        is_configured = provider_dict.get("is_configured", False)
        is_default = provider_name == default_provider
        return (not is_default, not is_configured, provider_name)

    filtered_models.sort(key=sort_key)

    return filtered_models


def _catalog_type_to_api_type(catalog_type: str) -> str:
    """Map an internal catalog model_type to its API default-model type string.

    Used when fetching the default model from the default-model endpoints,
    which use a different (shorter) vocabulary than the catalog.
    """
    return {
        "llm": "language",
        "embeddings": "embedding",
        "image_generation": "image",
        "video_generation": "video",
    }.get(catalog_type, catalog_type)


@router.get("/provider-variable-mapping", status_code=200)
async def get_model_provider_mapping() -> dict[str, list[dict]]:
    """Return provider variables mapping with full variable info.

    Each provider maps to a list of variable objects containing:
    - variable_name: Display name shown to user
    - variable_key: Environment variable key
    - description: Help text for the variable
    - required: Whether the variable is required
    - is_secret: Whether to treat as credential
    - is_list: Whether it accepts multiple values
    - options: Predefined options for dropdowns

    Provisioned providers map to an empty list — they have no user-configurable
    variables.
    """
    metadata = get_model_provider_metadata()
    return {provider: meta.get("variables", []) for provider, meta in metadata.items()}


@router.get("/enabled_providers", status_code=200)
async def get_enabled_providers(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    providers: Annotated[list[str] | None, Query()] = None,
):
    """Get enabled providers for the current user.

    BYOK providers are considered enabled if they have all required credential
    variables stored.  Provisioned providers are *always* enabled — the platform
    manages their credentials.
    """
    variable_service = get_variable_service()
    try:
        if not isinstance(variable_service, DatabaseVariableService):
            raise HTTPException(
                status_code=500,
                detail="Variable service is not an instance of DatabaseVariableService",
            )

        all_variables = await variable_service.get_all(
            user_id=current_user.id, session=session
        )
        all_variable_names = {var.name for var in all_variables}

        # provider_variable_map = get_model_provider_variable_mapping()
        # get_model_provider_variable_mapping() already excludes provisioned providers,
        # so we source the full provider list from the metadata directly and layer in
        # provisioned providers as unconditionally enabled.
        metadata = get_model_provider_metadata()

        enabled_providers: list[str] = []
        provider_status: dict[str, bool] = {}

        for provider, meta in metadata.items():
            if meta.get("provisioned", False):
                # Platform-provisioned: always enabled, no stored variables required
                provider_status[provider] = True
                enabled_providers.append(provider)
                continue

            # BYOK: check that all required variables are present
            provider_vars = get_provider_all_variables(provider)
            required_vars = [v for v in provider_vars if v.get("required", False)]
            all_required_present = all(
                v.get("variable_key") in all_variable_names for v in required_vars
            )

            provider_status[provider] = all_required_present
            if all_required_present:
                enabled_providers.append(provider)

        result = {
            "enabled_providers": enabled_providers,
            "provider_status": provider_status,
        }

        if providers:
            filtered_enabled = [
                p for p in result["enabled_providers"] if p in providers
            ]
            provider_status_dict = result.get("provider_status", {})
            if not isinstance(provider_status_dict, dict):
                provider_status_dict = {}
            filtered_status = {
                p: v for p, v in provider_status_dict.items() if p in providers
            }
            return {
                "enabled_providers": filtered_enabled,
                "provider_status": filtered_status,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get enabled providers for user %s", current_user.id)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve enabled providers. Please try again later.",
        ) from e
    else:
        return result


@router.post(
    "/validate-provider", status_code=200, response_model=ValidateProviderResponse
)
async def validate_provider(
    request: ValidateProviderRequest,
    current_user: CurrentActiveUser,  # noqa: ARG001
) -> ValidateProviderResponse:
    """Validate provider credentials before saving.

    Provisioned providers are always considered valid — there are no user
    credentials to validate.
    """
    if is_provisioned_provider(request.provider):
        return ValidateProviderResponse(valid=True, error=None)

    from px.base.models.unified_models import validate_model_provider_key

    try:
        validate_model_provider_key(request.provider, request.variables)
        return ValidateProviderResponse(valid=True, error=None)
    except ValueError as e:
        return ValidateProviderResponse(valid=False, error=str(e))
    except (
        ConnectionError,
        TimeoutError,
        RuntimeError,
        KeyError,
        AttributeError,
        TypeError,
    ) as e:
        logger.exception("Unexpected error validating provider %s", request.provider)
        return ValidateProviderResponse(valid=False, error=f"Validation failed: {e}")


async def _get_disabled_models(
    session: DbSession, current_user: CurrentActiveUser
) -> set[str]:
    """Helper function to get the set of disabled model IDs."""
    variable_service = get_variable_service()
    if not isinstance(variable_service, DatabaseVariableService):
        return set()

    try:
        var = await variable_service.get_variable_object(
            user_id=current_user.id, name=DISABLED_MODELS_VAR, session=session
        )
        if var.value:
            try:
                parsed_value = json.loads(var.value)
                if not isinstance(parsed_value, list):
                    logger.warning(
                        "Invalid disabled models format for user %s: not a list",
                        current_user.id,
                    )
                    return set()
                return {str(item) for item in parsed_value if isinstance(item, str)}
            except (json.JSONDecodeError, TypeError):
                logger.warning(
                    "Failed to parse disabled models for user %s",
                    current_user.id,
                    exc_info=True,
                )
                return set()
    except ValueError:
        pass
    return set()


async def _get_enabled_models(
    session: DbSession, current_user: CurrentActiveUser
) -> set[str]:
    """Helper function to get the set of explicitly enabled model IDs."""
    variable_service = get_variable_service()
    if not isinstance(variable_service, DatabaseVariableService):
        return set()

    try:
        var = await variable_service.get_variable_object(
            user_id=current_user.id, name=ENABLED_MODELS_VAR, session=session
        )
        if var.value and (value_stripped := var.value.strip()):
            try:
                parsed_value = json.loads(value_stripped)
                if not isinstance(parsed_value, list):
                    logger.warning(
                        "Invalid enabled models format for user %s: not a list",
                        current_user.id,
                    )
                    return set()
                return {str(item) for item in parsed_value if isinstance(item, str)}
            except (json.JSONDecodeError, TypeError):
                logger.debug(
                    "Failed to parse enabled models for user %s: %s",
                    current_user.id,
                    var.value,
                )
                return set()
    except ValueError:
        pass
    return set()


def _build_model_default_flags() -> dict[str, bool]:
    """Build a map of model names to their default flag status."""
    all_models_by_provider = get_unified_models_detailed(
        include_unsupported=True,
        include_deprecated=True,
    )

    is_default_model: dict[str, bool] = {}
    for provider_dict in all_models_by_provider:
        for model in provider_dict.get("models", []):
            model_name = model.get("model_name")
            is_default = model.get("metadata", {}).get("default", False)
            is_default_model[model_name] = is_default

    return is_default_model


async def _save_model_list_variable(
    variable_service: DatabaseVariableService,
    session: DbSession,
    current_user: CurrentActiveUser,
    var_name: str,
    model_set: set[str],
) -> None:
    """Save or update a model list variable."""
    from portals.services.database.models.variable.model import VariableUpdate

    models_json = json.dumps(list(model_set))

    try:
        existing_var = await variable_service.get_variable_object(
            user_id=current_user.id, name=var_name, session=session
        )
        if existing_var is None or existing_var.id is None:
            msg = f"Variable {var_name} not found"
            raise ValueError(msg)

        if model_set or var_name == DISABLED_MODELS_VAR:
            await variable_service.update_variable_fields(
                user_id=current_user.id,
                variable_id=existing_var.id,
                variable=VariableUpdate(
                    id=existing_var.id,
                    name=var_name,
                    value=models_json,
                    type=GENERIC_TYPE,
                ),
                session=session,
            )
        else:
            await variable_service.delete_variable(
                user_id=current_user.id, name=var_name, session=session
            )
    except ValueError:
        if model_set:
            await variable_service.create_variable(
                user_id=current_user.id,
                name=var_name,
                value=models_json,
                type_=GENERIC_TYPE,
                session=session,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Failed to save model list variable %s for user %s",
            var_name,
            current_user.id,
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to save model configuration. Please try again later.",
        ) from e


@router.get("/enabled_models", status_code=200)
async def get_enabled_models(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    model_names: Annotated[list[str] | None, Query()] = None,
):
    """Get enabled models for the current user.

    Provisioned models are enabled by default as long as they are not
    explicitly disabled by the user.
    """
    all_models_by_provider = get_unified_models_detailed(
        include_unsupported=True,
        include_deprecated=True,
    )

    # Get enabled providers status
    enabled_providers_result = await get_enabled_providers(
        session=session, current_user=current_user
    )
    provider_status = enabled_providers_result.get("provider_status", {})

    configured_providers = {
        p for p, configured in provider_status.items() if configured
    }
    replace_with_live_models(
        all_models_by_provider, current_user.id, configured_providers
    )

    disabled_models = await _get_disabled_models(
        session=session, current_user=current_user
    )
    explicitly_enabled_models = await _get_enabled_models(
        session=session, current_user=current_user
    )

    enabled_models: dict[str, dict[str, bool]] = {}

    for provider_dict in all_models_by_provider:
        provider = provider_dict.get("provider")
        models = provider_dict.get("models", [])

        if provider not in enabled_models:
            enabled_models[provider] = {}

        # Provisioned providers are always enabled at the provider level
        provider_enabled = provider_status.get(provider, False)

        for model in models:
            model_name = model.get("model_name")
            metadata = model.get("metadata", {})

            is_deprecated = metadata.get("deprecated", False)
            is_not_supported = metadata.get("not_supported", False)
            is_default = metadata.get("default", False)
            model_is_provisioned = metadata.get(
                "provisioned", is_provisioned_provider(provider)
            )

            # Provisioned models: enabled when default (or explicitly enabled) and not disabled
            # BYOK models: additionally require the provider to be configured
            if model_is_provisioned:
                is_enabled = (
                    not is_deprecated
                    and not is_not_supported
                    and (is_default or model_name in explicitly_enabled_models)
                    and model_name not in disabled_models
                )
            else:
                is_enabled = (
                    provider_enabled
                    and not is_deprecated
                    and not is_not_supported
                    and (is_default or model_name in explicitly_enabled_models)
                    and model_name not in disabled_models
                )

            enabled_models[provider][model_name] = is_enabled

    result = {"enabled_models": enabled_models}

    if model_names:
        filtered_enabled: dict[str, dict[str, bool]] = {}
        for provider, models_dict in enabled_models.items():
            filtered = {m: v for m, v in models_dict.items() if m in model_names}
            if filtered:
                filtered_enabled[provider] = filtered
        return {"enabled_models": filtered_enabled}

    return result


@router.post("/enabled_models", status_code=200)
async def update_enabled_models(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    updates: list[ModelStatusUpdate],
):
    """Update enabled status for specific models.

    Accepts a list of model IDs with their desired enabled status.
    For BYOK models this only affects model-level enablement — provider
    credentials must still be configured separately.
    For provisioned models credential validation is skipped entirely.
    """
    variable_service = get_variable_service()
    if not isinstance(variable_service, DatabaseVariableService):
        raise HTTPException(
            status_code=500,
            detail="Variable service is not an instance of DatabaseVariableService",
        )

    if len(updates) > MAX_BATCH_UPDATE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot update more than {MAX_BATCH_UPDATE_SIZE} models at once",
        )

    disabled_models = await _get_disabled_models(
        session=session, current_user=current_user
    )
    explicitly_enabled_models = await _get_enabled_models(
        session=session, current_user=current_user
    )
    is_default_model = _build_model_default_flags()

    for update in updates:
        if update.enabled:
            # Skip credential validation entirely for provisioned providers —
            # the platform manages those credentials.
            if is_provisioned_provider(update.provider):
                logger.debug(
                    "Skipping credential validation for provisioned provider %s model %s",
                    update.provider,
                    update.model_id,
                )
            else:
                from px.base.models.unified_models import (
                    get_all_variables_for_provider,
                    validate_model_provider_key,
                )

                variables = get_all_variables_for_provider(
                    current_user.id, update.provider
                )

                try:
                    validate_model_provider_key(
                        update.provider, variables, model_name=update.model_id
                    )
                except ValueError as e:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Validation failed for {update.provider}: {e}",
                    ) from e
                except Exception as e:
                    logger.exception(
                        "Unexpected error validating provider %s", update.provider
                    )
                    raise HTTPException(
                        status_code=400,
                        detail=f"Validation failed for {update.provider}: {e}",
                    ) from e

    _update_model_sets(
        updates, disabled_models, explicitly_enabled_models, is_default_model
    )

    logger.info(
        "User %s updated model status: %d models affected",
        current_user.id,
        len(updates),
    )

    await _save_model_list_variable(
        variable_service, session, current_user, DISABLED_MODELS_VAR, disabled_models
    )
    await _save_model_list_variable(
        variable_service,
        session,
        current_user,
        ENABLED_MODELS_VAR,
        explicitly_enabled_models,
    )

    return {
        "disabled_models": list(disabled_models),
        "enabled_models": list(explicitly_enabled_models),
    }


def _update_model_sets(
    updates: list[ModelStatusUpdate],
    disabled_models: set[str],
    explicitly_enabled_models: set[str],
    is_default_model: dict[str, bool],
) -> None:
    """Update disabled and enabled model sets based on user requests (in place)."""
    for update in updates:
        model_is_default = is_default_model.get(update.model_id, False)

        if update.enabled:
            disabled_models.discard(update.model_id)
            if not model_is_default:
                explicitly_enabled_models.add(update.model_id)
        else:
            disabled_models.add(update.model_id)
            explicitly_enabled_models.discard(update.model_id)


class DefaultModelRequest(BaseModel):
    """Request model for setting default model.

    ``model_type`` accepted values:
    - ``"language"``  — default LLM
    - ``"embedding"`` — default embedding model
    - ``"image"``     — default image-generation model
    - ``"video"``     — default video-generation model
    """

    model_name: str
    provider: str
    model_type: str

    @field_validator("model_name", "provider")
    @classmethod
    def validate_non_empty_string(cls, v: str) -> str:
        if not v or not v.strip():
            msg = "Field cannot be empty"
            raise ValueError(msg)
        if len(v) > MAX_STRING_LENGTH:
            msg = f"Field exceeds maximum length of {MAX_STRING_LENGTH} characters"
            raise ValueError(msg)
        return v.strip()

    @field_validator("model_type")
    @classmethod
    def validate_model_type(cls, v: str) -> str:
        if v not in VALID_DEFAULT_MODEL_TYPES:
            msg = f"model_type must be one of: {', '.join(sorted(VALID_DEFAULT_MODEL_TYPES))}"
            raise ValueError(msg)
        return v


@router.get("/default_model", status_code=200)
async def get_default_model(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    model_type: Annotated[
        str,
        Query(
            description=(
                "Type of model. "
                "Accepted values: 'language', 'embedding', 'image', 'video'."
            )
        ),
    ] = "language",
):
    """Get the default model for the current user.

    Supports all model types: ``language``, ``embedding``, ``image``, ``video``.
    """
    if model_type not in VALID_DEFAULT_MODEL_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"model_type must be one of: {', '.join(sorted(VALID_DEFAULT_MODEL_TYPES))}",
        )

    variable_service = get_variable_service()
    if not isinstance(variable_service, DatabaseVariableService):
        return {"default_model": None}

    var_name = _default_model_var(model_type)

    try:
        var = await variable_service.get_variable_object(
            user_id=current_user.id, name=var_name, session=session
        )
        if var.value:
            try:
                parsed_value = json.loads(var.value)
            except (json.JSONDecodeError, TypeError):
                logger.warning(
                    "Failed to parse default model for user %s",
                    current_user.id,
                    exc_info=True,
                )
                return {"default_model": None}
            else:
                if not isinstance(parsed_value, dict) or not all(
                    k in parsed_value for k in ("model_name", "provider", "model_type")
                ):
                    logger.warning(
                        "Invalid default model format for user %s", current_user.id
                    )
                    return {"default_model": None}
                return {"default_model": parsed_value}
    except ValueError:
        pass
    return {"default_model": None}


@router.post("/default_model", status_code=200)
async def set_default_model(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    request: DefaultModelRequest,
):
    """Set the default model for the current user.

    Supports all model types: ``language``, ``embedding``, ``image``, ``video``.
    """
    variable_service = get_variable_service()
    if not isinstance(variable_service, DatabaseVariableService):
        raise HTTPException(
            status_code=500,
            detail="Variable service is not an instance of DatabaseVariableService",
        )

    var_name = _default_model_var(request.model_type)

    logger.info(
        "User %s setting default %s model to %s (%s)",
        current_user.id,
        request.model_type,
        request.model_name,
        request.provider,
    )

    model_data = {
        "model_name": request.model_name,
        "provider": request.provider,
        "model_type": request.model_type,
    }
    model_json = json.dumps(model_data)

    try:
        existing_var = await variable_service.get_variable_object(
            user_id=current_user.id, name=var_name, session=session
        )
        if existing_var is None or existing_var.id is None:
            msg = f"Variable {var_name} not found"
            raise ValueError(msg)

        from portals.services.database.models.variable.model import VariableUpdate

        await variable_service.update_variable_fields(
            user_id=current_user.id,
            variable_id=existing_var.id,
            variable=VariableUpdate(
                id=existing_var.id, name=var_name, value=model_json, type=GENERIC_TYPE
            ),
            session=session,
        )
    except ValueError:
        await variable_service.create_variable(
            user_id=current_user.id,
            name=var_name,
            value=model_json,
            type_=GENERIC_TYPE,
            session=session,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to set default model for user %s", current_user.id)
        raise HTTPException(
            status_code=500,
            detail="Failed to set default model. Please try again later.",
        ) from e

    return {"default_model": model_data}


@router.delete("/default_model", status_code=200)
async def clear_default_model(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    model_type: Annotated[
        str,
        Query(
            description=(
                "Type of model. "
                "Accepted values: 'language', 'embedding', 'image', 'video'."
            )
        ),
    ] = "language",
):
    """Clear the default model for the current user.

    Supports all model types: ``language``, ``embedding``, ``image``, ``video``.
    """
    if model_type not in VALID_DEFAULT_MODEL_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"model_type must be one of: {', '.join(sorted(VALID_DEFAULT_MODEL_TYPES))}",
        )

    variable_service = get_variable_service()
    if not isinstance(variable_service, DatabaseVariableService):
        raise HTTPException(
            status_code=500,
            detail="Variable service is not an instance of DatabaseVariableService",
        )

    var_name = _default_model_var(model_type)

    logger.info("User %s clearing default %s model", current_user.id, model_type)

    try:
        existing_var = await variable_service.get_variable_object(
            user_id=current_user.id, name=var_name, session=session
        )
        await variable_service.delete_variable(
            user_id=current_user.id, name=existing_var.name, session=session
        )
    except ValueError:
        pass
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to clear default model for user %s", current_user.id)
        raise HTTPException(
            status_code=500,
            detail="Failed to clear default model. Please try again later.",
        ) from e

    return {"default_model": None}
