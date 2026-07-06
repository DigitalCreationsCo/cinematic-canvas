"""Tests for tier-based credential routing (BYOK / Managed key resolution).

Covers:
- ``resolve_provider_api_key()`` — the main routing function
- ``resolve_managed_api_key()`` / ``resolve_byok_api_key()`` — wrappers
- ``get_llm()`` — credential routing integration + 401 enforcement
- ``get_embeddings()`` — credential routing integration
- ``handle_subscription_canceled()`` — BYOK purge on cancel
"""

from __future__ import annotations

import importlib
from unittest.mock import ANY, AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

# ============================================================================
#  resolve_provider_api_key
# ============================================================================


class TestResolveProviderApiKey:
    """Unit tests for resolve_provider_api_key().

    The function delegates to ``_resolve_provider_api_key_async`` via
    ``run_until_complete``.  We mock ``run_until_complete`` so the tests
    never touch a real database.
    """

    @patch("px.base.models.unified_models.credentials.run_until_complete")
    def test_studio_tier_byok_available_returns_byok(self, mock_run):
        """Studio tier + BYOK feature gate enabled + valid BYOK → use BYOK."""
        from px.base.models.unified_models.credentials import (
            resolve_provider_api_key,
        )

        mock_run.return_value = ("sk-byok-123", "byok")  # pragma: allowlist secret

        api_key, source = resolve_provider_api_key(
            user_id=str(uuid4()),
            provider="OpenAI",
            subscription_tier="studio",
        )

        assert api_key == "sk-byok-123"  # pragma: allowlist secret
        assert source == "byok"

    @patch("px.base.models.unified_models.credentials.run_until_complete")
    def test_studio_tier_no_byok_returns_managed(self, mock_run):
        """Studio tier + BYOK gate enabled + no BYOK → fallback to managed."""
        from px.base.models.unified_models.credentials import (
            resolve_provider_api_key,
        )

        mock_run.return_value = ("sk-managed-456", "managed")  # pragma: allowlist secret

        api_key, source = resolve_provider_api_key(
            user_id=str(uuid4()),
            provider="OpenAI",
            subscription_tier="studio",
        )

        assert api_key == "sk-managed-456"  # pragma: allowlist secret
        assert source == "managed"

    @patch("px.base.models.unified_models.credentials.run_until_complete")
    def test_lower_tier_returns_managed(self, mock_run):
        """Free/pro tiers always return managed key regardless of BYOK."""
        from px.base.models.unified_models.credentials import (
            resolve_provider_api_key,
        )

        mock_run.return_value = ("sk-managed-789", "managed")  # pragma: allowlist secret

        for tier in ("free", "pro"):
            api_key, source = resolve_provider_api_key(
                user_id=str(uuid4()),
                provider="Anthropic",
                subscription_tier=tier,
            )
            assert api_key == "sk-managed-789"  # pragma: allowlist secret
            assert source == "managed"

    @patch("px.base.models.unified_models.credentials.run_until_complete")
    def test_no_key_available_returns_none(self, mock_run):
        """When neither BYOK nor managed key is found → (None, None)."""
        from px.base.models.unified_models.credentials import (
            resolve_provider_api_key,
        )

        mock_run.return_value = (None, None)

        api_key, source = resolve_provider_api_key(
            user_id=str(uuid4()),
            provider="OpenAI",
            subscription_tier="free",
        )

        assert api_key is None
        assert source is None

    @patch("px.base.models.unified_models.credentials.run_until_complete")
    def test_no_user_id_resolves_managed(self, mock_run):
        """When user_id is None, Credential table + env vars are checked (tier/BYOK skipped)."""
        from px.base.models.unified_models.credentials import (
            resolve_provider_api_key,
        )

        mock_run.return_value = ("sk-managed-from-db", "managed")  # pragma: allowlist secret

        api_key, source = resolve_provider_api_key(user_id=None, provider="OpenAI")

        assert api_key == "sk-managed-from-db"  # pragma: allowlist secret
        assert source == "managed"

    @patch("px.base.models.unified_models.credentials.run_until_complete")
    def test_user_id_string_none_resolves_managed(self, mock_run):
        """When user_id is the literal string 'None', treat same as None."""
        from px.base.models.unified_models.credentials import (
            resolve_provider_api_key,
        )

        mock_run.return_value = ("sk-managed", "managed")  # pragma: allowlist secret

        api_key, source = resolve_provider_api_key(user_id="None", provider="OpenAI")

        assert api_key == "sk-managed"  # pragma: allowlist secret
        assert source == "managed"

    @patch("px.base.models.unified_models.credentials.run_until_complete")
    def test_subscription_tier_lookup_when_not_provided(self, mock_run):
        """When subscription_tier is None, the async function looks it up."""
        from px.base.models.unified_models.credentials import (
            resolve_provider_api_key,
        )

        mock_run.return_value = ("sk-managed-tier", "managed")  # pragma: allowlist secret

        api_key, source = resolve_provider_api_key(
            user_id=str(uuid4()),
            provider="Google Generative AI",
            subscription_tier=None,
        )

        assert api_key == "sk-managed-tier"  # pragma: allowlist secret
        assert source == "managed"

    @patch("px.base.models.unified_models.credentials.run_until_complete")
    def test_exception_during_async_returns_none(self, mock_run):
        """If the async resolution raises, resolve_provider_api_key returns (None, None)."""
        from px.base.models.unified_models.credentials import (
            resolve_provider_api_key,
        )

        mock_run.side_effect = RuntimeError("DB connection lost")

        # Should not propagate the exception
        api_key, source = resolve_provider_api_key(
            user_id=str(uuid4()),
            provider="OpenAI",
            subscription_tier="studio",
        )

        assert api_key is None
        assert source is None


# ============================================================================
#  resolve_managed_api_key  /  resolve_byok_api_key  convenience wrappers
# ============================================================================


class TestManagedAndByokWrappers:
    """Convenience wrappers delegate to resolve_provider_api_key correctly."""

    @patch("px.base.models.unified_models.credentials.resolve_provider_api_key")
    def test_resolve_managed_api_key(self, mock_resolve):
        """resolve_managed_api_key forces managed source via free tier."""
        from px.base.models.unified_models.credentials import (
            resolve_managed_api_key,
        )

        mock_resolve.return_value = ("sk-mgmt", "managed")  # pragma: allowlist secret

        result = resolve_managed_api_key("OpenAI")

        assert result == "sk-mgmt"  # pragma: allowlist secret
        mock_resolve.assert_called_once_with(user_id=None, provider="OpenAI", subscription_tier=None)

    @patch("px.base.models.unified_models.credentials.resolve_provider_api_key")
    def test_resolve_managed_api_key_wrong_source(self, mock_resolve):
        """When resolve returns byok source, resolve_managed returns None."""
        from px.base.models.unified_models.credentials import (
            resolve_managed_api_key,
        )

        mock_resolve.return_value = ("sk-byok", "byok")  # pragma: allowlist secret

        result = resolve_managed_api_key("OpenAI")

        assert result is None

    @patch("px.base.models.unified_models.credentials.resolve_provider_api_key")
    def test_resolve_byok_api_key(self, mock_resolve):
        """resolve_byok_api_key forces byok source via studio tier."""
        from px.base.models.unified_models.credentials import (
            resolve_byok_api_key,
        )

        user = str(uuid4())
        mock_resolve.return_value = ("sk-byok", "byok")  # pragma: allowlist secret

        result = resolve_byok_api_key(user, "OpenAI")

        assert result == "sk-byok"  # pragma: allowlist secret
        mock_resolve.assert_called_once_with(user_id=user, provider="OpenAI", subscription_tier="studio")

    @patch("px.base.models.unified_models.credentials.resolve_provider_api_key")
    def test_resolve_byok_api_key_wrong_source(self, mock_resolve):
        """When resolve returns managed source, resolve_byok returns None."""
        from px.base.models.unified_models.credentials import (
            resolve_byok_api_key,
        )

        mock_resolve.return_value = ("sk-mgmt", "managed")  # pragma: allowlist secret

        result = resolve_byok_api_key(str(uuid4()), "OpenAI")

        assert result is None


# ============================================================================
#  get_llm  —  credential routing integration
#
#  get_llm does ``from px.base.models import unified_models as MOD``
#  inside the function body.  Since MOD is a local variable pointing to
#  the ``px.base.models.unified_models`` module, we patch the module-level
#  functions directly with decorator-style patches on the module.
# ============================================================================


def _make_model_dict(provider: str = "OpenAI") -> list[dict]:
    """Return a minimal model selection dict as passed by components."""
    return [
        {
            "name": "gpt-4o",
            "provider": provider,
            "metadata": {
                "model_class": "ChatOpenAI",
                "api_key_param": "api_key",  # pragma: allowlist secret
                "model_name_param": "model",
            },
        }
    ]


class TestGetLlmCredentialRouting:
    """Tests for the credential routing behaviour added to get_llm()."""

    @patch("px.base.models.unified_models.get_api_key_for_provider")
    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_effective_subscription_tier")
    @patch("px.base.models.unified_models.get_model_class")
    def test_non_studio_explicit_api_key_uses_managed_routing(
        self,
        mock_get_class,
        mock_get_tier,
        mock_resolve,
        mock_get_key,
    ):
        """Non-studio component api_key input is ignored and managed routing is used."""
        from px.base.models.unified_models.instantiation import get_llm

        mock_get_tier.return_value = "pro"
        mock_resolve.return_value = ("sk-managed", "managed")  # pragma: allowlist secret
        mock_get_class.return_value = MagicMock()

        get_llm(
            model=_make_model_dict(),
            user_id=str(uuid4()),
            api_key="sk-explicit",  # pragma: allowlist secret
            subscription_tier="pro",
        )

        mock_get_tier.assert_called_once_with(user_id=ANY, subscription_tier="pro")
        mock_resolve.assert_called_once_with(user_id=ANY, provider="OpenAI", subscription_tier="pro")
        mock_get_key.assert_not_called()

    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_api_key_for_provider")
    @patch("px.base.models.unified_models.get_effective_subscription_tier")
    @patch("px.base.models.unified_models.get_model_class")
    def test_studio_explicit_api_key_is_honored(
        self,
        mock_get_class,
        mock_get_tier,
        mock_get_key,
        mock_resolve,
    ):
        """Studio users may use an explicit component api_key as BYOK."""
        from px.base.models.unified_models.instantiation import get_llm

        model_class = MagicMock()
        mock_get_class.return_value = model_class
        mock_get_tier.return_value = "studio"
        mock_get_key.return_value = "sk-explicit"  # pragma: allowlist secret

        get_llm(
            model=_make_model_dict(),
            user_id=str(uuid4()),
            api_key="sk-explicit",  # pragma: allowlist secret
            subscription_tier="studio",
        )

        mock_get_key.assert_called_once_with(ANY, "OpenAI", "sk-explicit")  # pragma: allowlist secret
        mock_resolve.assert_not_called()
        assert model_class.call_args.kwargs["api_key"] == "sk-explicit"  # pragma: allowlist secret

    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_effective_subscription_tier")
    @patch("px.base.models.unified_models.get_model_class")
    def test_none_api_key_triggers_routing(self, mock_get_class, mock_get_tier, mock_resolve):
        """When api_key is None, tier-based routing IS used."""
        from px.base.models.unified_models.instantiation import get_llm

        mock_get_tier.return_value = "pro"
        mock_resolve.return_value = ("sk-routed", "managed")  # pragma: allowlist secret
        mock_get_class.return_value = MagicMock()

        get_llm(
            model=_make_model_dict(),
            user_id=str(uuid4()),
            api_key=None,
            subscription_tier="pro",
        )

        mock_resolve.assert_called_once_with(user_id=ANY, provider="OpenAI", subscription_tier="pro")

    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_effective_subscription_tier")
    def test_no_api_key_and_no_routing_raises_value_error(self, mock_get_tier, mock_resolve):
        """When both routing and fallback produce no key, raise ValueError."""
        from px.base.models.unified_models.instantiation import get_llm

        mock_get_tier.return_value = "free"
        mock_resolve.return_value = (None, None)

        with pytest.raises(ValueError, match="No managed OpenAI credential is configured"):
            get_llm(
                model=_make_model_dict(),
                user_id=str(uuid4()),
                api_key=None,
                subscription_tier="free",
            )

    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_effective_subscription_tier")
    @patch("px.base.models.unified_models.get_model_class")
    def test_ollama_does_not_require_api_key(self, mock_get_class, mock_get_tier, mock_resolve):
        """Ollama is exempt from API key requirements."""
        from px.base.models.unified_models.instantiation import get_llm

        mock_get_tier.return_value = "free"
        mock_resolve.return_value = (None, None)
        mock_get_class.return_value = MagicMock()

        result = get_llm(
            model=_make_model_dict(provider="Ollama"),
            user_id=str(uuid4()),
            api_key=None,
        )

        assert result is not None


class TestGetLlm401Enforcement:
    """BYOK 401 errors must NOT silently fall back to managed keys."""

    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_effective_subscription_tier")
    @patch("px.base.models.unified_models.get_model_class")
    def test_byok_401_raises_clear_error_no_fallback(self, mock_get_class, mock_get_tier, mock_resolve):
        """BYOK key failing with 401 must raise a user-facing error."""
        from px.base.models.unified_models.instantiation import get_llm

        mock_get_tier.return_value = "studio"
        mock_resolve.return_value = ("sk-invalid-byok", "byok")  # pragma: allowlist secret
        mock_get_class.return_value = MagicMock(
            side_effect=Exception("Error code: 401 - Authentication: invalid API key")
        )

        with pytest.raises(ValueError, match="API key") as exc_info:
            get_llm(
                model=_make_model_dict(),
                user_id=str(uuid4()),
                api_key=None,
                subscription_tier="studio",
            )

        # Must NOT mention managed key (no fallback)
        assert "managed" not in str(exc_info.value).lower()

    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_effective_subscription_tier")
    @patch("px.base.models.unified_models.get_model_class")
    def test_byok_unauthorized_raises_clear_error(self, mock_get_class, mock_get_tier, mock_resolve):
        """BYOK key failing with 'unauthorized' must raise a user-facing error."""
        from px.base.models.unified_models.instantiation import get_llm

        mock_get_tier.return_value = "studio"
        mock_resolve.return_value = ("sk-expired-byok", "byok")  # pragma: allowlist secret
        mock_get_class.return_value = MagicMock(side_effect=Exception("Unauthorized: token expired"))

        with pytest.raises(ValueError, match="API key"):
            get_llm(
                model=_make_model_dict(),
                user_id=str(uuid4()),
                api_key=None,
                subscription_tier="studio",
            )

    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_effective_subscription_tier")
    @patch("px.base.models.unified_models.get_model_class")
    def test_managed_key_401_re_raises_original(self, mock_get_class, mock_get_tier, mock_resolve):
        """A 401 with a managed key raises the original error, not BYOK message."""
        from px.base.models.unified_models.instantiation import get_llm

        mock_get_tier.return_value = "free"
        mock_resolve.return_value = ("sk-managed-broken", "managed")  # pragma: allowlist secret
        mock_get_class.return_value = MagicMock(side_effect=Exception("Error code: 401 - Authentication failed"))

        with pytest.raises(Exception, match="401"):
            get_llm(
                model=_make_model_dict(),
                user_id=str(uuid4()),
                api_key=None,
                subscription_tier="free",
            )

    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_api_key_for_provider")
    @patch("px.base.models.unified_models.get_effective_subscription_tier")
    @patch("px.base.models.unified_models.get_model_class")
    def test_studio_explicit_api_key_401_raises_clear_error(
        self,
        mock_get_class,
        mock_get_tier,
        mock_get_key,
        mock_resolve,
    ):
        """Studio explicit api_key is BYOK, so auth failures get the BYOK message."""
        from px.base.models.unified_models.instantiation import get_llm

        mock_get_tier.return_value = "studio"
        mock_get_key.return_value = "sk-explicit"  # pragma: allowlist secret
        mock_get_class.return_value = MagicMock(side_effect=Exception("Error code: 401 - Unauthorized"))

        with pytest.raises(ValueError, match="API key"):
            get_llm(
                model=_make_model_dict(),
                user_id=str(uuid4()),
                api_key="sk-explicit",  # pragma: allowlist secret
                subscription_tier="studio",
            )
        mock_resolve.assert_not_called()


class TestModelComponentCredentialDelegation:
    """Model components should delegate credential policy to get_llm()."""

    @pytest.mark.parametrize(
        ("module_name", "class_name", "method_name"),
        [
            ("px.components.models_and_agents.language_model", "LanguageModelComponent", "build_model"),
            ("px.components.models_and_agents.image_model", "ImageModelComponent", "build_model"),
            ("px.components.models_and_agents.video_model", "VideoModelComponent", "build_model"),
            ("px.components.models_and_agents.agent", "AgentComponent", "_get_llm"),
        ],
    )
    def test_components_pass_api_key_to_shared_get_llm(self, module_name, class_name, method_name, monkeypatch):
        module = importlib.import_module(module_name)
        component = getattr(module, class_name)()
        captured_kwargs = {}

        def fake_get_llm(**kwargs):
            captured_kwargs.update(kwargs)
            return MagicMock()

        monkeypatch.setattr(module, "get_llm", fake_get_llm)
        component.model = _make_model_dict()
        component._user_id = str(uuid4())
        component.api_key = "sk-component"  # pragma: allowlist secret
        component.temperature = 0.1
        component.stream = False

        getattr(component, method_name)()

        assert captured_kwargs["api_key"] == "sk-component"  # pragma: allowlist secret


# ============================================================================
#  get_embeddings  —  credential routing integration
#
#  Same patching strategy as get_llm: we patch module-level functions
#  on ``px.base.models.unified_models`` since ``get_embeddings`` does
#  ``from px.base.models import unified_models as MOD`` locally.
# ============================================================================


def _make_embedding_model_dict(provider: str = "OpenAI") -> list[dict]:
    """Return a minimal embedding model selection dict."""
    return [
        {
            "name": "text-embedding-3-small",
            "provider": provider,
            "metadata": {
                "embedding_class": "OpenAIEmbeddings",
                "param_mapping": {
                    "model": "model",
                    "api_key": "api_key",  # pragma: allowlist secret
                },
            },
        }
    ]


class TestGetEmbeddingsCredentialRouting:
    """Tests for the credential routing behaviour added to get_embeddings()."""

    @patch("px.base.models.unified_models.get_api_key_for_provider")
    @patch("px.base.models.unified_models.get_embedding_class")
    def test_explicit_api_key_bypasses_routing(self, mock_get_class, mock_get_key):
        """When api_key is explicitly passed, tier-based routing is NOT used."""
        from px.base.models.unified_models.instantiation import get_embeddings

        mock_get_key.return_value = "sk-explicit"  # pragma: allowlist secret
        mock_get_class.return_value = MagicMock()

        get_embeddings(
            model=_make_embedding_model_dict(),
            user_id=str(uuid4()),
            api_key="sk-explicit",  # pragma: allowlist secret
        )

        mock_get_key.assert_called_once_with(ANY, "OpenAI", "sk-explicit")  # pragma: allowlist secret

    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_embedding_class")
    def test_none_api_key_triggers_routing(self, mock_get_class, mock_resolve):
        """When api_key is None, tier-based routing IS used."""
        from px.base.models.unified_models.instantiation import get_embeddings

        mock_resolve.return_value = ("sk-routed", "managed")  # pragma: allowlist secret
        mock_get_class.return_value = MagicMock()

        get_embeddings(
            model=_make_embedding_model_dict(),
            user_id=str(uuid4()),
            api_key=None,
            subscription_tier="pro",
        )

        mock_resolve.assert_called_once_with(user_id=ANY, provider="OpenAI", subscription_tier="pro")

    @patch("px.base.models.unified_models.get_model_provider_variable_mapping")
    @patch("px.base.models.unified_models.resolve_provider_api_key")
    def test_no_api_key_and_no_routing_raises_value_error(self, mock_resolve, mock_mapping):
        """When both routing and fallback produce no key, raise ValueError."""
        from px.base.models.unified_models.instantiation import get_embeddings

        mock_resolve.return_value = (None, None)
        mock_mapping.return_value = {"OpenAI": "OPENAI_API_KEY"}

        with pytest.raises(ValueError, match="API key is required"):
            get_embeddings(
                model=_make_embedding_model_dict(),
                user_id=str(uuid4()),
                api_key=None,
                subscription_tier="free",
            )

    @patch("px.base.models.unified_models.resolve_provider_api_key")
    @patch("px.base.models.unified_models.get_embedding_class")
    def test_ollama_does_not_require_api_key(self, mock_get_class, mock_resolve):
        """Ollama is exempt from API key requirements."""
        from px.base.models.unified_models.instantiation import get_embeddings

        mock_resolve.return_value = (None, None)
        mock_get_class.return_value = MagicMock()

        result = get_embeddings(
            model=_make_embedding_model_dict(provider="Ollama"),
            user_id=str(uuid4()),
            api_key=None,
        )

        assert result is not None

    @patch("px.base.models.unified_models.get_api_key_for_provider")
    @patch("px.base.models.unified_models.get_embedding_class")
    def test_subscription_tier_passed_through(self, mock_get_class, mock_get_key):
        """subscription_tier parameter is accepted and passed through."""
        from px.base.models.unified_models.instantiation import get_embeddings

        mock_get_key.return_value = "sk-explicit"  # pragma: allowlist secret
        mock_get_class.return_value = MagicMock()

        # Should not error when subscription_tier is provided
        get_embeddings(
            model=_make_embedding_model_dict(),
            user_id=str(uuid4()),
            api_key="sk-test",  # pragma: allowlist secret
            subscription_tier="studio",
        )


# ============================================================================
#  handle_subscription_canceled  —  BYOK purge
# ============================================================================


class TestHandleSubscriptionCanceledByokPurge:
    """BYOK credentials must be purged when a subscription is cancelled."""

    @pytest.fixture
    def user_id(self):
        return str(uuid4())

    @pytest.fixture
    def subscription(self, user_id):
        return {"metadata": {"userId": user_id}}

    @pytest.fixture
    def mock_user(self, user_id):
        from portals.services.database.models.user.model import User

        return User(
            id=user_id,
            username="test_user",
            password="hashed",  # noqa: S106  # pragma: allowlist secret  — test fixture
            subscription_tier="studio",
        )

    async def test_purges_credential_variables_on_cancel(self, subscription, mock_user, mocker):
        """When subscription is cancelled, Credential-type variables are deleted."""
        from portals.services.stripe_service import (
            handle_subscription_canceled,
        )

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock()
        mock_db.execute.return_value.rowcount = 3

        mocker.patch(
            "portals.services.stripe_service.get_user_by_id",
            return_value=mock_user,
        )
        mocker.patch(
            "portals.services.credit_service._ensure_user_credit_row",
            new_callable=AsyncMock,
        )
        # Set allowance_balance to avoid credit forfeit codepath
        credit_row = AsyncMock()
        credit_row.allowance_balance = 0
        mocker.patch(
            "portals.services.credit_service._ensure_user_credit_row",
            return_value=credit_row,
        )

        mock_delete = mocker.patch("sqlalchemy.delete")
        mock_delete.return_value = "DELETED"

        await handle_subscription_canceled(subscription, mock_db)

        mock_delete.assert_called_once()
        assert mock_user.subscription_tier == "free"
        assert mock_user.subscription_status == "canceled"
        assert mock_user.stripe_subscription_id is None

    async def test_delete_has_correct_where_clause(self, subscription, mock_user, mocker):
        """The DELETE is scoped to the user and only targets Credential type."""
        from portals.services.stripe_service import (
            handle_subscription_canceled,
        )

        mock_db = AsyncMock()
        executed_stmts = []

        async def track_execute(statement, **_kwargs):
            executed_stmts.append(statement)
            result = MagicMock()
            result.rowcount = 0
            return result

        mock_db.execute = track_execute

        mocker.patch(
            "portals.services.stripe_service.get_user_by_id",
            return_value=mock_user,
        )
        credit_row = MagicMock()
        credit_row.allowance_balance = 0
        mocker.patch(
            "portals.services.credit_service._ensure_user_credit_row",
            return_value=credit_row,
        )

        await handle_subscription_canceled(subscription, mock_db)

        # Find a delete statement by checking the string representation
        delete_stmts = []
        for stmt in executed_stmts:
            text = str(stmt)
            if "DELETE" in text.upper() and "FROM" in text.upper():
                delete_stmts.append(stmt)

        assert len(delete_stmts) > 0, "No DELETE statement was executed"

        # Verify the SQL structure and bound parameters
        for stmt in delete_stmts:
            compiled = stmt.compile()
            sql_text = str(compiled).lower()
            assert "delete from variable" in sql_text
            assert "where" in sql_text
            assert "user_id" in sql_text
            assert "type" in sql_text

            # Check bound parameters reference the right user and Credential type
            params = compiled.params
            type_val = params.get("type_1") or params.get("type")
            assert type_val == "Credential", f"Expected Credential, got {type_val}"

            if "user_id_1" in params:
                assert params["user_id_1"] == mock_user.id
                break
            if "user_id" in params:
                assert params["user_id"] == mock_user.id
                break
        else:
            # If no user_id param found, check the SQL string contains it
            all_sql = "\n".join(str(s) for s in delete_stmts)
            assert str(mock_user.id) in all_sql

    async def test_no_byok_no_error(self, subscription, mock_user, mocker):
        """When the user has no BYOK variables, cancel succeeds without error."""
        from portals.services.stripe_service import (
            handle_subscription_canceled,
        )

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock()
        mock_db.execute.return_value.rowcount = 0

        mocker.patch(
            "portals.services.stripe_service.get_user_by_id",
            return_value=mock_user,
        )
        credit_row = MagicMock()
        credit_row.allowance_balance = 0
        mocker.patch(
            "portals.services.credit_service._ensure_user_credit_row",
            return_value=credit_row,
        )

        await handle_subscription_canceled(subscription, mock_db)

    async def test_handles_db_error_gracefully(self, subscription, mock_user, mocker):
        """If the DELETE fails, the function logs but does NOT re-raise."""
        from portals.services.stripe_service import (
            handle_subscription_canceled,
        )

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(side_effect=Exception("DB connection error"))

        mocker.patch(
            "portals.services.stripe_service.get_user_by_id",
            return_value=mock_user,
        )
        credit_row = MagicMock()
        credit_row.allowance_balance = 0
        mocker.patch(
            "portals.services.credit_service._ensure_user_credit_row",
            return_value=credit_row,
        )

        # Should NOT raise despite DB error
        await handle_subscription_canceled(subscription, mock_db)

        assert mock_user.subscription_tier == "free"

    async def test_missing_user_id_returns_early(self):
        """When subscription metadata has no userId, the function returns early."""
        from portals.services.stripe_service import (
            handle_subscription_canceled,
        )

        mock_db = AsyncMock()
        subscription_no_user: dict = {"metadata": {}}

        # Should not error — returns early without touching DB
        await handle_subscription_canceled(subscription_no_user, mock_db)

        # Verify no DB operations were performed
        mock_db.add.assert_not_called()
        mock_db.execute.assert_not_called()
        mock_db.flush.assert_not_called()

    async def test_user_not_found_returns_early(self, subscription, mocker):
        """When no user matches the userId, the function returns early."""
        from portals.services.stripe_service import (
            handle_subscription_canceled,
        )

        mock_db = AsyncMock()

        mocker.patch(
            "portals.services.stripe_service.get_user_by_id",
            return_value=None,
        )

        # Should not error — returns early
        await handle_subscription_canceled(subscription, mock_db)

        mock_db.add.assert_not_called()
        mock_db.execute.assert_not_called()
        mock_db.flush.assert_not_called()
