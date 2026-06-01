from pathlib import Path
from unittest.mock import patch

import pytest
import structlog


@pytest.fixture(autouse=True, scope="session")
def setup_structlog():
    """Configure structlog before any tests run.

    This ensures the logger is properly initialized and not None,
    which prevents AttributeError when tests mock logger.configure.
    """
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(50),  # CRITICAL level
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=False,
    )


@pytest.fixture(autouse=True)
def allow_custom_components_by_default(monkeypatch):
    """Keep PX tests aligned with the documented default unless a test opts out."""
    from px.services.deps import get_settings_service

    monkeypatch.setattr(get_settings_service().settings, "allow_custom_components", True)


def _remove_backend_paths() -> None:
    """Strip backend source directories from ``sys.path``.

    When running inside the Portals monorepo workspace, ``uv run`` adds the
    sibling backend packages (``src/backend``, ``src/backend/base``) to
    ``sys.path``.  The px unit tests are designed to run **without** the
    ``portals`` backend installed — they rely on the ``px`` package only.

    Removing these paths ensures ``import portals`` correctly fails from the
    test runner's perspective, matching the behaviour of a standalone px
    installation.
    """
    import sys

    suffixes_to_strip = ("/backend", "/backend/base")
    sys.path = [p for p in sys.path if not any(p.endswith(suf) for suf in suffixes_to_strip)]


# Set up test data paths
def pytest_configure(config):  # noqa: ARG001
    """Configure pytest with data paths and check prerequisites."""
    import os

    # Strip backend paths first so that ``import portals`` below behaves as it
    # would in a standalone px installation (ImportError, not a real import).
    _remove_backend_paths()

    if not os.getenv("PX_TEST_ALLOW_PORTALS"):
        try:
            import portals  # noqa: F401

            pytest.exit(
                "\n"
                "=" * 80 + "\n"
                "ERROR: portals is installed. These tests require portals to NOT be installed.\n"
                "\n"
                "To fix this, run these commands:\n"
                "\n"
                "    cd src/px\n"
                "    uv sync\n"
                "    uv run pytest ...\n"
                "\n"
                "The px tests are designed to run in isolation from portals to ensure proper\n"
                "packaging and dependency management.\n"
                "=" * 80 + "\n",
                returncode=1,
            )
        except ImportError:
            # Good, portals is not installed
            pass

    # Set up test data paths
    data_path = Path(__file__).parent / "data"
    pytest.BASIC_EXAMPLE_PATH = data_path / "basic_example.json"
    pytest.COMPLEX_EXAMPLE_PATH = data_path / "complex_example.json"
    pytest.OPENAPI_EXAMPLE_PATH = data_path / "Openapi.json"
    pytest.GROUPED_CHAT_EXAMPLE_PATH = data_path / "grouped_chat.json"
    pytest.ONE_GROUPED_CHAT_EXAMPLE_PATH = data_path / "one_group_chat.json"
    pytest.VECTOR_STORE_GROUPED_EXAMPLE_PATH = data_path / "vector_store_grouped.json"
    pytest.WEBHOOK_TEST = data_path / "WebhookTest.json"
    pytest.BASIC_CHAT_WITH_PROMPT_AND_HISTORY = data_path / "BasicChatwithPromptandHistory.json"
    pytest.CHAT_INPUT = data_path / "ChatInputTest.json"
    pytest.TWO_OUTPUTS = data_path / "TwoOutputsTest.json"
    pytest.VECTOR_STORE_PATH = data_path / "Vector_store.json"
    pytest.SIMPLE_API_TEST = data_path / "SimpleAPITest.json"
    pytest.MEMORY_CHATBOT_NO_LLM = data_path / "MemoryChatbotNoLLM.json"
    pytest.ENV_VARIABLE_TEST = data_path / "env_variable_test.json"
    pytest.LOOP_TEST = data_path / "LoopTest.json"


def pytest_collection_modifyitems(config, items):  # noqa: ARG001
    """Automatically add markers based on test file location."""
    for item in items:
        if "tests/unit/" in str(item.fspath):
            item.add_marker(pytest.mark.unit)
        elif "tests/integration/" in str(item.fspath):
            item.add_marker(pytest.mark.integration)
        elif "tests/slow/" in str(item.fspath):
            item.add_marker(pytest.mark.slow)


@pytest.fixture(autouse=True)
def use_noop_database():
    """Ensure all PX tests use NoopDatabaseService.

    This fixture automatically applies to all tests, ensuring that get_db_service()
    always returns NoopDatabaseService, preventing tests from requiring a real database.
    """
    from px.services.database.service import NoopDatabaseService

    with patch("px.services.deps.get_db_service", return_value=NoopDatabaseService()):
        yield


@pytest.fixture
def use_noop_session():
    """Force the use of NoopSession for testing.

    DEPRECATED: This fixture is kept for backwards compatibility but is no longer needed
    since use_noop_database (autouse=True) ensures all tests use the noop database.
    """
    from px.services.session import NoopSession

    # Mock session_scope to always return NoopSession
    with patch("px.services.deps.session_scope") as mock_session_scope:
        mock_session_scope.return_value.__aenter__.return_value = NoopSession()
        mock_session_scope.return_value.__aexit__.return_value = None
        yield


# Additional fixtures for more comprehensive testing support
@pytest.fixture(name="session")
def session_fixture():
    """Create a mock session for testing."""
    from unittest.mock import MagicMock

    return MagicMock()


@pytest.fixture
def json_flow():
    """Basic example flow data as JSON string."""
    return pytest.BASIC_EXAMPLE_PATH.read_text(encoding="utf-8")


@pytest.fixture
def basic_graph_data():
    """Basic example flow data as dictionary."""
    import json

    with pytest.BASIC_EXAMPLE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


# Test data fixtures for various flow types
@pytest.fixture
def json_flow_with_prompt_and_history():
    return pytest.BASIC_CHAT_WITH_PROMPT_AND_HISTORY.read_text(encoding="utf-8")


@pytest.fixture
def json_memory_chatbot_no_llm():
    return pytest.MEMORY_CHATBOT_NO_LLM.read_text(encoding="utf-8")


@pytest.fixture
def json_vector_store():
    return pytest.VECTOR_STORE_PATH.read_text(encoding="utf-8")


@pytest.fixture
def json_webhook_test():
    return pytest.WEBHOOK_TEST.read_text(encoding="utf-8")


@pytest.fixture
def json_chat_input():
    return pytest.CHAT_INPUT.read_text(encoding="utf-8")


@pytest.fixture
def json_two_outputs():
    return pytest.TWO_OUTPUTS.read_text(encoding="utf-8")


@pytest.fixture
def grouped_chat_json_flow():
    return pytest.GROUPED_CHAT_EXAMPLE_PATH.read_text(encoding="utf-8")


@pytest.fixture
def one_grouped_chat_json_flow():
    return pytest.ONE_GROUPED_CHAT_EXAMPLE_PATH.read_text(encoding="utf-8")


@pytest.fixture
def vector_store_grouped_json_flow():
    return pytest.VECTOR_STORE_GROUPED_EXAMPLE_PATH.read_text(encoding="utf-8")


@pytest.fixture
def json_simple_api_test():
    return pytest.SIMPLE_API_TEST.read_text(encoding="utf-8")


@pytest.fixture
def json_loop_test():
    return pytest.LOOP_TEST.read_text(encoding="utf-8")


# Simple client fixture for basic HTTP testing (without full portals app dependencies)
@pytest.fixture(name="client")
async def simple_client_fixture():
    """Simple HTTP client for basic testing."""
    # For px-specific tests, we might not need the full portals app
    # This is a placeholder that can be expanded as needed
    from httpx import AsyncClient

    async with AsyncClient(base_url="http://testserver") as client:
        yield client
