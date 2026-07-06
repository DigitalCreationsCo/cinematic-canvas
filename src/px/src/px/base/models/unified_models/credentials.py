"""Credential resolution and provider validation helpers.

Secret-management hierarchy
--------------------------
This module is the **sole authority** for resolving API keys used by the
model factory (``get_llm``).  Two credential sources exist:

* **BYOK** (Bring Your Own Key) — user-provided keys stored in the
  ``Variable`` table with ``type='Credential'`` or supplied directly to a
  model component.  Only available on the ``studio`` tier.

* **Managed keys** — platform-owned keys stored in the ``Credential``
  table (one row per provider).  Used as the primary key for non-studio
  tiers and as a fallback when a studio user has no BYOK configured.

Routing is performed by ``resolve_provider_api_key()`` which is called
from ``get_llm()``.  The caller never needs to know which source was used
unless a 401 error occurs with a BYOK key — in that case the error is
surfaced directly to the user and **no** silent fallback to the managed
key is permitted.
"""

from __future__ import annotations

import contextlib
import json
import os
import re
from typing import Any
from uuid import UUID

from px.log.logger import logger
from px.services.deps import get_variable_service, session_scope
from px.utils.async_helpers import run_until_complete

from .provider_queries import (
    get_model_provider_variable_mapping,
    get_provider_all_variables,
)

# ---------------------------------------------------------------------------
# Tier-based credential routing  (replaces the broken resolve_provider_credentials)
# ---------------------------------------------------------------------------


def resolve_provider_api_key(
    user_id: UUID | str | None,
    provider: str,
    subscription_tier: str | None = None,
) -> tuple[str | None, str | None]:
    """Resolve the API key with full tier-based credential routing.

    Precedence (strict evaluation tree)
    -----------------------------------
    1. Determine the user's subscription tier (looked up from the DB if
       *subscription_tier* is not provided).
    2. If the tier is ``"studio"`` attempt to read a BYOK key from the ``Variable``
          table (``type='Credential'``, name matching the provider's
          primary variable key, e.g. ``OPENAI_API_KEY``).
       a. Key found and valid → **use BYOK**.
       b. No BYOK → fall through to the managed key.
    3. Lower tiers → try the managed key from the
       ``Credential`` table (one row per provider).
    4. If no managed key is configured → return ``(None, None)``.

    Returns:
    -------
    tuple[str | None, str | None]
        ``(api_key, key_source)`` where *key_source* is one of
        ``"byok"``, ``"managed"``, or ``None`` when no key could be
        resolved.

    401 guarantee
    -------------
    When the returned *key_source* is ``"byok"`` and the subsequent model
    invocation raises a 401 / authentication error, the caller **must
    not** silently fall back to a managed key.  Doing so would drain
    platform quota.  Instead the error must be surfaced to the user with
    a clear message that their provided key is invalid.
    """
    try:
        api_key, key_source = run_until_complete(_resolve_provider_api_key_async(user_id, provider, subscription_tier))
    except Exception:  # noqa: BLE001
        logger.exception(
            "Credential routing failed for user=%s provider=%s",
            user_id,
            provider,
        )
        return None, None

    if api_key:
        logger.debug(
            "Credential routing: user=%s provider=%s source=%s key_present=True",
            user_id,
            provider,
            key_source,
        )
    else:
        logger.debug(
            "Credential routing: user=%s provider=%s source=%s key_present=False",
            user_id,
            provider,
            key_source,
        )

    return api_key, key_source


def get_effective_subscription_tier(
    user_id: UUID | str | None,
    subscription_tier: str | None = None,
) -> str:
    """Return the effective subscription tier for credential policy decisions.

    The caller may pass a known tier to avoid an extra database lookup. When it
    is absent, look up the user and fail closed to ``"free"`` if the lookup
    cannot be completed.
    """
    if subscription_tier:
        return subscription_tier.lower()

    try:
        return run_until_complete(_get_effective_subscription_tier_async(user_id))
    except Exception:  # noqa: BLE001
        logger.exception("Failed to resolve subscription tier for user=%s", user_id)
        return "free"


async def _get_effective_subscription_tier_async(user_id: UUID | str | None) -> str:
    has_user_context = user_id is not None and not (isinstance(user_id, str) and user_id == "None")
    if not has_user_context:
        return "free"

    user_uuid: UUID | None = UUID(user_id) if isinstance(user_id, str) else user_id

    from portals.services.database.models.user.model import User
    from sqlmodel import select

    async with session_scope() as session:
        result = await session.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()
        return (user.subscription_tier or "free").lower() if user else "free"


def resolve_managed_api_key(provider: str) -> str | None:
    """Read the platform-managed API key for *provider*.

    Resolution order
    -----------------
    1. Managed key from the ``Credential`` table (one row per provider).

    This is a convenience wrapper used when the caller already knows they
    want the managed key (e.g. caller does its own tier check).
    """
    api_key, key_source = resolve_provider_api_key(user_id=None, provider=provider, subscription_tier=None)
    if key_source == "managed":
        return api_key
    return None


def resolve_byok_api_key(user_id: UUID | str, provider: str) -> str | None:
    """Read the user's BYOK API key for *provider* from the Variable table.

    Returns ``None`` if no BYOK is configured, the variable is not found,
    or decryption fails.
    """
    api_key, key_source = resolve_provider_api_key(user_id=user_id, provider=provider, subscription_tier="studio")
    if key_source == "byok":
        return api_key
    return None


async def _resolve_provider_api_key_async(
    user_id: UUID | str | None,
    provider: str,
    subscription_tier: str | None,
) -> tuple[str | None, str | None]:
    """Async implementation of ``resolve_provider_api_key``.

    Uses a single database session for all lookups (tier, feature gate,
    BYOK variable, managed credential) to minimise overhead.
    """
    provider_variable_map = get_model_provider_variable_mapping()
    variable_name = provider_variable_map.get(provider)

    # When there is no user context (headless / px run, or caller just
    # wants the managed key without a user) we skip the tier and BYOK
    # steps but still check the Credential table and env vars.
    has_user_context = user_id is not None and not (isinstance(user_id, str) and user_id == "None")

    user_uuid: UUID | None = (UUID(user_id) if isinstance(user_id, str) else user_id) if has_user_context else None

    from sqlmodel import select

    async with session_scope() as session:
        # ── Step 1: Determine subscription tier ──────────────────────
        tier = subscription_tier.lower() if subscription_tier else subscription_tier
        if has_user_context and tier is None:
            from portals.services.database.models.user.model import User

            result = await session.execute(select(User).where(User.id == user_uuid))
            user = result.scalar_one_or_none()
            tier = (user.subscription_tier or "free").lower() if user else "free"

        # ── Step 2: Studio tier → check BYOK ─────────────────────────
        if has_user_context and tier == "studio" and variable_name:
            from portals.services.auth import utils as auth_utils
            from portals.services.database.models.variable.model import (
                Variable,
            )

            var_result = await session.execute(
                select(Variable).where(
                    Variable.user_id == user_uuid,
                    Variable.name == variable_name,
                    Variable.type == "Credential",
                )
            )
            variable = var_result.scalar_one_or_none()

            if variable is not None and variable.value:
                try:
                    decrypted = auth_utils.decrypt_api_key(variable.value)
                    if decrypted:
                        logger.debug(
                            "BYOK resolved for user=%s provider=%s",
                            user_id,
                            provider,
                        )
                        return decrypted, "byok"
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "Failed to decrypt BYOK for user=%s provider=%s",
                        user_id,
                        provider,
                    )

            logger.debug(
                "No BYOK key found for studio user=%s provider=%s; falling back to managed key",
                user_id,
                provider,
            )

        # ── Step 3: Managed key from Credential table ────────────────
        from portals.services.database.models.credential.model import (
            Credential,
        )

        cred_result = await session.execute(select(Credential).where(Credential.provider == provider))
        credential = cred_result.scalar_one_or_none()

        if credential is not None and credential.api_key:
            try:
                from portals.services.auth import utils as auth_utils

                decrypted = auth_utils.decrypt_api_key(credential.api_key)
                if decrypted:
                    logger.debug("Managed key resolved for provider=%s", provider)
                    return decrypted, "managed"
            except Exception:  # noqa: BLE001
                logger.exception("Failed to decrypt managed key for provider=%s", provider)

        # ── Nothing found ────────────────────────────────────────────
        logger.warning(
            "No credential resolved for user=%s provider=%s tier=%s",
            user_id,
            provider,
            tier,
        )
        return None, None


# ---------------------------------------------------------------------------
# Original API  (kept for backward compatibility)
# ---------------------------------------------------------------------------


def get_api_key_for_provider(
    user_id: UUID | str | None,
    provider: str,
    api_key: str | None = None,
) -> str | None:
    """Get API key from component input or global variables.

    When *api_key* is set to an environment variable name
    (e.g. ``ANTHROPIC_API_KEY``), that name is resolved from
    ``os.environ`` or global variables so imported flows can reference
    credentials without storing the raw key.

    .. note::
       This function does **not** perform tier-based routing.  For that
       use ``resolve_provider_api_key()`` instead.
    """

    # Resolve variable name (canonical or custom e.g. MY_OPENAI_API_KEY) from env or global vars
    def _resolve_var_name(var_name: str) -> str | None:
        env_value = os.environ.get(var_name)
        if env_value and env_value.strip():
            return env_value.strip()
        if user_id and not (isinstance(user_id, str) and user_id == "None"):

            async def _get_by_var_name():
                async with session_scope() as session:
                    variable_service = get_variable_service()
                    if variable_service is None:
                        return None
                    try:
                        return await variable_service.get_variable(
                            user_id=(UUID(user_id) if isinstance(user_id, str) else user_id),
                            name=var_name,
                            field="",
                            session=session,
                        )
                    except ValueError:
                        return None

            value = run_until_complete(_get_by_var_name())
            if value and str(value).strip():
                return str(value).strip()
        return None

    if api_key and api_key.strip():
        var_name = api_key.strip()
        # Names that look like env/global variables (e.g. MY_OPENAI_API_KEY): resolve from env/DB
        if var_name.replace("_", "").isalnum() and var_name[0].isalpha():
            resolved = _resolve_var_name(var_name)
            if resolved:
                return resolved
            # Unresolved variable name: don't use as literal key
            if re.match(r"^[A-Z][A-Z0-9_]*$", var_name):
                return None
        # Literal API key (e.g. sk-...)
        return var_name

    # Get primary variable (first required secret) from provider metadata
    provider_variable_map = get_model_provider_variable_mapping()
    variable_name = provider_variable_map.get(provider)
    if not variable_name:
        return None

    # Try the database-backed variable service first when a user_id is available.
    # Fall through to os.environ regardless so px run (no user_id) can still pick
    # up canonical credentials from the shell.
    has_user = user_id is not None and not (isinstance(user_id, str) and user_id == "None")
    resolved_key = None
    if has_user:

        async def _get_variable():
            async with session_scope() as session:
                variable_service = get_variable_service()
                if variable_service is None:
                    return None
                try:
                    return await variable_service.get_variable(
                        user_id=(UUID(user_id) if isinstance(user_id, str) else user_id),
                        name=variable_name,
                        field="",
                        session=session,
                    )
                except ValueError:
                    return None

        try:
            resolved_key = run_until_complete(_get_variable())
        except (ValueError, Exception):  # noqa: BLE001
            resolved_key = None

    if resolved_key:
        return resolved_key

    return os.getenv(variable_name)


def get_all_variables_for_provider(user_id: UUID | str | None, provider: str) -> dict[str, str]:
    """Get all configured variables for a provider from database or environment."""
    result: dict[str, str] = {}

    # Get all variable definitions for this provider
    provider_vars = get_provider_all_variables(provider)
    if not provider_vars:
        return result

    # If no user_id, only check environment variables
    if user_id is None or (isinstance(user_id, str) and user_id == "None"):
        for var_info in provider_vars:
            var_key = var_info.get("variable_key")
            if var_key:
                env_value = os.environ.get(var_key)
                if env_value and env_value.strip():
                    result[var_key] = env_value
        return result

    # Try to get from global variables (database)
    async def _get_all_variables():
        async with session_scope() as session:
            variable_service = get_variable_service()
            if variable_service is None:
                return {}

            values = {}
            user_id_uuid = UUID(user_id) if isinstance(user_id, str) else user_id

            for var_info in provider_vars:
                var_key = var_info.get("variable_key")
                if not var_key:
                    continue

                try:
                    value = await variable_service.get_variable(
                        user_id=user_id_uuid,
                        name=var_key,
                        field="",
                        session=session,
                    )
                    if value and str(value).strip():
                        values[var_key] = str(value)
                except (ValueError, Exception):  # noqa: BLE001
                    # Variable not found - check environment
                    env_value = os.environ.get(var_key)
                    if env_value and env_value.strip():
                        values[var_key] = env_value

            return values

    return run_until_complete(_get_all_variables())


def _validate_and_get_enabled_providers(
    all_variables: dict[str, Any],
    provider_variable_map: dict[str, str],
    *,
    skip_validation: bool = True,
) -> set[str]:
    """Return set of enabled providers based on credential existence."""
    from portals.services.auth import utils as auth_utils
    from portals.services.deps import get_settings_service

    settings_service = get_settings_service()
    enabled = set()

    for provider in provider_variable_map:
        provider_vars = get_provider_all_variables(provider)

        collected_values: dict[str, str] = {}
        all_required_present = True

        for var_info in provider_vars:
            var_key = var_info.get("variable_key")
            if not var_key:
                continue

            is_required = bool(var_info.get("required", False))
            value = None

            if var_key in all_variables:
                variable = all_variables[var_key]
                if variable.value is not None:
                    try:
                        decrypted_value = auth_utils.decrypt_api_key(
                            variable.value,
                            settings_service=settings_service,
                        )
                        if decrypted_value and decrypted_value.strip():
                            value = decrypted_value
                    except Exception as e:  # noqa: BLE001
                        raw_value = variable.value
                        if raw_value is not None and str(raw_value).strip():
                            value = str(raw_value)
                        else:
                            logger.debug(
                                "Failed to decrypt variable %s for provider %s: %s",
                                var_key,
                                provider,
                                e,
                            )

            if value is None:
                env_value = os.environ.get(var_key)
                if env_value and env_value.strip() and env_value.strip() != "dummy":
                    value = env_value
                    logger.debug(
                        "Using environment variable %s for provider %s",
                        var_key,
                        provider,
                    )

            if value:
                collected_values[var_key] = value
            elif is_required:
                all_required_present = False

        if not provider_vars:
            enabled.add(provider)
        elif all_required_present and collected_values:
            if skip_validation:
                # Just check existence - validation was done on save
                enabled.add(provider)
            else:
                try:
                    validate_model_provider_key(provider, collected_values)
                    enabled.add(provider)
                except (ValueError, Exception) as exc:  # noqa: BLE001
                    logger.debug("Provider %s validation failed: %s", provider, exc)

    return enabled


class _VarWithValue:
    """Simple wrapper for passing raw variable values to _validate_and_get_enabled_providers."""

    __slots__ = ("value",)

    def __init__(self, value):
        self.value = value


async def _get_model_status(
    user_id: UUID | str,
) -> tuple[set[str], set[str]]:
    """Fetch disabled and explicitly enabled model sets for a user.

    Returns:
        A tuple of (disabled_models, explicitly_enabled_models).
    """
    async with session_scope() as session:
        variable_service = get_variable_service()
        if variable_service is None:
            return set(), set()
        from portals.services.variable.service import DatabaseVariableService

        if not isinstance(variable_service, DatabaseVariableService):
            return set(), set()
        all_vars = await variable_service.get_all(
            user_id=UUID(user_id) if isinstance(user_id, str) else user_id,
            session=session,
        )
        disabled: set[str] = set()
        enabled: set[str] = set()
        for var in all_vars:
            if var.name == "__disabled_models__" and var.value:
                with contextlib.suppress(json.JSONDecodeError, TypeError):
                    disabled = set(json.loads(var.value))
            elif var.name == "__enabled_models__" and var.value:
                with contextlib.suppress(json.JSONDecodeError, TypeError):
                    enabled = set(json.loads(var.value))
        return disabled, enabled


async def _fetch_enabled_providers_for_user(user_id: UUID | str) -> set[str]:
    """Shared helper for get_language_model_options and get_embedding_model_options."""
    async with session_scope() as session:
        variable_service = get_variable_service()
        if variable_service is None:
            return set()

        from portals.services.variable.service import DatabaseVariableService

        if not isinstance(variable_service, DatabaseVariableService):
            return set()

        # Get all variable names (VariableRead has value=None for credentials)
        all_vars = await variable_service.get_all(
            user_id=UUID(user_id) if isinstance(user_id, str) else user_id,
            session=session,
        )
        all_var_names = {var.name for var in all_vars}

        provider_variable_map = get_model_provider_variable_mapping()

        # Build dict with raw Variable values (encrypted for secrets, plaintext for others)
        # We need to fetch raw Variable objects because VariableRead has value=None for credentials
        all_provider_variables = {}
        user_id_uuid = UUID(user_id) if isinstance(user_id, str) else user_id

        for provider in provider_variable_map:
            # Get ALL variables for this provider (not just the primary one)
            provider_vars = get_provider_all_variables(provider)

            for var_info in provider_vars:
                var_name = var_info.get("variable_key")
                if not var_name or var_name not in all_var_names:
                    # Variable not configured by user
                    continue

                if var_name in all_provider_variables:
                    # Already fetched
                    continue

                try:
                    # Get the raw Variable object to access the actual value
                    variable_obj = await variable_service.get_variable_object(
                        user_id=user_id_uuid,
                        name=var_name,
                        session=session,
                    )
                    if variable_obj and variable_obj.value:
                        all_provider_variables[var_name] = _VarWithValue(variable_obj.value)
                except Exception as e:  # noqa: BLE001
                    # Variable not found or error accessing it - skip
                    logger.error(
                        "Error accessing variable %s for provider %s: %s",
                        var_name,
                        provider,
                        e,
                    )
                    continue

        # Use shared helper to validate and get enabled providers
        return _validate_and_get_enabled_providers(all_provider_variables, provider_variable_map)


def validate_model_provider_key(
    provider: str,
    variables: dict[str, str],
    model_name: str | None = None,
) -> None:
    """Validate a model provider by making a minimal test call."""
    if not provider:
        return

    first_model = None
    try:
        from .model_catalog import get_unified_models_detailed

        models = get_unified_models_detailed(providers=[provider])
        if models and models[0].get("models"):
            first_model = models[0]["models"][0]["model_name"]
    except Exception as e:  # noqa: BLE001
        logger.error("Error getting unified models for provider %s: %s", provider, e)

    # For providers that need a model to test credentials
    if not first_model and provider in [
        "OpenAI",
        "Anthropic",
        "Google Generative AI",
        "IBM WatsonX",
    ]:
        return

    try:
        if provider == "OpenAI":
            from langchain_openai import ChatOpenAI  # type: ignore  # noqa: PGH003

            api_key = variables.get("OPENAI_API_KEY")
            if not api_key:
                return
            llm = ChatOpenAI(api_key=api_key, model_name=first_model, max_tokens=1)
            llm.invoke("test")

        elif provider == "Anthropic":
            from langchain_anthropic import (
                ChatAnthropic,  # type: ignore  # noqa: PGH003
            )

            api_key = variables.get("ANTHROPIC_API_KEY")
            if not api_key:
                return
            llm = ChatAnthropic(anthropic_api_key=api_key, model=first_model, max_tokens=1)
            llm.invoke("test")

        elif provider == "Google Generative AI":
            from langchain_google_genai import (
                ChatGoogleGenerativeAI,  # type: ignore  # noqa: PGH003
            )

            api_key = variables.get("GOOGLE_API_KEY")
            if not api_key:
                return
            llm = ChatGoogleGenerativeAI(google_api_key=api_key, model=first_model, max_tokens=1)
            llm.invoke("test")

        elif provider == "IBM WatsonX":
            from langchain_ibm import ChatWatsonx

            api_key = variables.get("WATSONX_APIKEY")
            project_id = variables.get("WATSONX_PROJECT_ID")
            url = variables.get("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
            if not api_key or not project_id:
                return
            llm = ChatWatsonx(
                apikey=api_key,
                url=url,
                model_id=first_model,
                project_id=project_id,
                params={"max_new_tokens": 1},
            )
            llm.invoke("test")

        elif provider == "Ollama":
            import requests

            base_url = variables.get("OLLAMA_BASE_URL")
            if not base_url:
                msg = "Invalid Ollama base URL"
                logger.error(msg)
                raise ValueError(msg)

            base_url = base_url.rstrip("/")
            response = requests.get(f"{base_url}/api/tags", timeout=5)
            response.raise_for_status()

            data = response.json()
            if not isinstance(data, dict) or "models" not in data:
                msg = "Invalid Ollama base URL"
                logger.error(msg)
                raise ValueError(msg)

            if model_name:
                available_models = [m.get("name") for m in data["models"]]
                # Exact match or match with :latest
                if model_name not in available_models and f"{model_name}:latest" not in available_models:
                    # Lenient check for missing tag
                    if ":" not in model_name:
                        if not any(m.startswith(f"{model_name}:") for m in available_models):
                            available_str = ", ".join(available_models[:3])
                            msg = f"Model '{model_name}' not found on Ollama server. Available: {available_str}"
                            logger.error(msg)
                            raise ValueError(msg)
                    else:
                        available_str = ", ".join(available_models[:3])
                        msg = f"Model '{model_name}' not found on Ollama server. Available: {available_str}"
                        logger.error(msg)
                        raise ValueError(msg)

    except ValueError:
        raise
    except Exception as e:
        error_msg = str(e).lower()
        if any(word in error_msg for word in ["401", "authentication", "api key"]):
            msg = f"Invalid API key for {provider}"
            logger.error("Invalid API key for %s: %s", provider, e)
            raise ValueError(msg) from e

        # Rethrow specific Ollama errors with a user-facing message
        if provider == "Ollama":
            msg = "Invalid Ollama base URL"
            logger.error(msg)
            raise ValueError(msg) from e

        # For others, log and return (allow saving despite minor errors)
        return
