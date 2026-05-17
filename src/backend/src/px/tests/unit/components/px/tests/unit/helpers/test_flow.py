"""Unit tests for the px.helpers.flow module."""

import pytest
from px.utils.portals_utils import has_portals_memory

# Globals

_PX_HELPER_MODULE_FLOW = "px.helpers.flow"

# Helper Functions


def is_helper_module(module, module_name):
    return module.__module__ == module_name


# Test Scenarios


class TestDynamicImport:
    """Test dynamic imports of the px implementation."""

    def test_portals_available(self):
        """Test whether the portals implementation is available."""
        # Portals implementation should not be available
        if has_portals_memory():
            pytest.fail("Portals implementation is available")

    def test_helpers_import_build_schema_from_inputs(self):
        """Test the px.helpers.build_schema_from_inputs import."""
        try:
            from px.helpers import build_schema_from_inputs
        except (ImportError, ModuleNotFoundError) as e:
            pytest.fail(
                f"Failed to dynamically import px.helpers.build_schema_from_inputs: {e}"
            )

        # Helper module should be the px implementation
        assert is_helper_module(build_schema_from_inputs, _PX_HELPER_MODULE_FLOW)

    def test_helpers_import_get_arg_names(self):
        """Test the px.helpers.get_arg_names import."""
        try:
            from px.helpers import get_arg_names
        except (ImportError, ModuleNotFoundError) as e:
            pytest.fail(f"Failed to dynamically import px.helpers.get_arg_names: {e}")

        # Helper module should be the px implementation
        assert is_helper_module(get_arg_names, _PX_HELPER_MODULE_FLOW)

    def test_helpers_import_get_flow_inputs(self):
        """Test the px.helpers.get_flow_inputs import."""
        try:
            from px.helpers import get_flow_inputs
        except (ImportError, ModuleNotFoundError) as e:
            pytest.fail(f"Failed to dynamically import px.helpers.get_flow_inputs: {e}")

        # Helper module should be the px implementation
        assert is_helper_module(get_flow_inputs, _PX_HELPER_MODULE_FLOW)

    def test_helpers_import_list_flows(self):
        """Test the px.helpers.list_flows import."""
        try:
            from px.helpers import list_flows
        except (ImportError, ModuleNotFoundError) as e:
            pytest.fail(f"Failed to dynamically import px.helpers.list_flows: {e}")

        # Helper module should be the px implementation
        assert is_helper_module(list_flows, _PX_HELPER_MODULE_FLOW)

    def test_helpers_import_load_flow(self):
        """Test the px.helpers.load_flow import."""
        try:
            from px.helpers import load_flow
        except (ImportError, ModuleNotFoundError) as e:
            pytest.fail(f"Failed to dynamically import px.helpers.load_flow: {e}")

        # Helper module should be the px implementation
        assert is_helper_module(load_flow, _PX_HELPER_MODULE_FLOW)

    def test_helpers_import_run_flow(self):
        """Test the px.helpers.run_flow import."""
        try:
            from px.helpers import run_flow
        except (ImportError, ModuleNotFoundError) as e:
            pytest.fail(f"Failed to dynamically import px.helpers.run_flow: {e}")

        # Helper module should be the px implementation
        assert is_helper_module(run_flow, _PX_HELPER_MODULE_FLOW)
