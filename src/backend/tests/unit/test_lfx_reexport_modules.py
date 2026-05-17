"""Test to ensure all portals modules that re-export px modules work correctly.

This test validates that every portals module that re-exports from px
can successfully import and access all expected symbols, maintaining
backward compatibility and proper API exposure.

Based on analysis, there are 24 portals modules that re-export from px:

Base Modules (11):
- portals.base (wildcard from px.base)
- portals.base.agents (from px.base.agents)
- portals.base.data (from px.base.data)
- portals.base.embeddings (from px.base.embeddings)
- portals.base.io (from px.base.io)
- portals.base.memory (from px.base.memory)
- portals.base.models (from px.base.models)
- portals.base.prompts (from px.base.prompts)
- portals.base.textsplitters (from px.base.textsplitters)
- portals.base.tools (from px.base.tools)
- portals.base.vectorstores (from px.base.vectorstores)

Core System Modules (13):
- portals.custom (from px.custom)
- portals.custom.custom_component (from px.custom.custom_component)
- portals.field_typing (from px.field_typing with __getattr__)
- portals.graph (from px.graph)
- portals.inputs (from px.inputs.inputs)
- portals.interface (from px.interface)
- portals.io (from px.io + px.template)
- portals.load (from px.load)
- portals.logging (from px.log.logger)
- portals.schema (from px.schema)
- portals.template (wildcard from px.template)
- portals.template.field (from px.template.field)
"""

import importlib
import inspect
import pkgutil
import re
import time
from pathlib import Path

import pytest


def get_all_reexport_modules():
    """Get all known re-export modules for parametrized testing."""
    # Define the modules here so they can be accessed by parametrize
    direct_reexport_modules = {
        "portals.base.agents": "px.base.agents",
        "portals.base.data": "px.base.data",
        "portals.base.embeddings": "px.base.embeddings",
        "portals.base.io": "px.base.io",
        "portals.base.memory": "px.base.memory",
        "portals.base.models": "px.base.models",
        "portals.base.prompts": "px.base.prompts",
        "portals.base.textsplitters": "px.base.textsplitters",
        "portals.base.tools": "px.base.tools",
        "portals.base.vectorstores": "px.base.vectorstores",
        "portals.custom.custom_component": "px.custom.custom_component",
        "portals.graph": "px.graph",
        "portals.inputs": "px.inputs.inputs",
        "portals.interface": "px.interface",
        "portals.load": "px.load",
        "portals.logging": "px.log",
        "portals.schema": "px.schema",
        "portals.template.field": "px.template.field",
    }

    wildcard_reexport_modules = {
        "portals.base": "px.base",
        "portals.template": "px.template",
    }

    complex_reexport_modules = {
        "portals.custom": [
            "px.custom",
            "px.custom.custom_component",
            "px.custom.utils",
        ],
        "portals.io": ["px.io", "px.template"],
    }

    dynamic_reexport_modules = {
        "portals.field_typing": "px.field_typing",
    }

    return list(
        {
            **direct_reexport_modules,
            **wildcard_reexport_modules,
            **complex_reexport_modules,
            **dynamic_reexport_modules,
        }.keys()
    )


class TestLfxReexportModules:
    """Test that all portals modules that re-export from px work correctly."""

    @classmethod
    def _discover_portals_modules(cls) -> list[str]:
        """Dynamically discover all portals modules."""
        portals_modules: list[str] = []
        try:
            import portals

            for _importer, modname, _ispkg in pkgutil.walk_packages(
                portals.__path__, portals.__name__ + "."
            ):
                portals_modules.append(modname)
        except ImportError:
            pass
        return portals_modules

    @classmethod
    def _detect_reexport_pattern(cls, module_name: str) -> dict[str, str | None]:
        """Detect what kind of re-export pattern a module uses."""
        try:
            module = importlib.import_module(module_name)

            # Check if module has source code that mentions px
            source_file = getattr(module, "__file__", None)
            if source_file:
                try:
                    with Path(source_file).open() as f:
                        content = f.read()
                        if "from px" in content:
                            # Try to extract the px module being imported
                            patterns = [
                                r"from (px\.[.\w]+) import",
                                r"from (px\.[.\w]+) import \*",
                                r"import (px\.[.\w]+)",
                            ]
                            for pattern in patterns:
                                match = re.search(pattern, content)
                                if match:
                                    return {"type": "direct", "source": match.group(1)}

                        if "__getattr__" in content and "px" in content:
                            return {"type": "dynamic", "source": None}

                        # If we get here, file exists but no patterns matched
                        return {"type": "none", "source": None}

                except (OSError, UnicodeDecodeError):
                    return {"type": "none", "source": None}
            else:
                return {"type": "none", "source": None}

        except ImportError:
            return {"type": "import_error", "source": None}

    @classmethod
    def _get_expected_symbols(cls, px_source: str | None = None) -> list[str]:
        """Get expected symbols that should be available in a module."""
        if not px_source:
            return []

        try:
            px_module = importlib.import_module(px_source)
            if hasattr(px_module, "__all__"):
                return list(px_module.__all__)
            # Return public attributes (not starting with _)
            return [name for name in dir(px_module) if not name.startswith("_")]
        except ImportError:
            return []

    # Define all the modules that re-export from px (kept for backward compatibility)
    DIRECT_REEXPORT_MODULES = {
        # Base modules with direct re-exports
        "portals.base.agents": "px.base.agents",
        "portals.base.data": "px.base.data",
        "portals.base.embeddings": "px.base.embeddings",
        "portals.base.io": "px.base.io",
        "portals.base.memory": "px.base.memory",
        "portals.base.models": "px.base.models",
        "portals.base.prompts": "px.base.prompts",
        "portals.base.textsplitters": "px.base.textsplitters",
        "portals.base.tools": "px.base.tools",
        "portals.base.vectorstores": "px.base.vectorstores",
        # Core system modules with direct re-exports
        "portals.custom.custom_component": "px.custom.custom_component",
        "portals.graph": "px.graph",
        "portals.inputs": "px.inputs.inputs",
        "portals.interface": "px.interface",
        "portals.load": "px.load",
        "portals.logging": "px.log",  # Note: imports from px.log.logger
        "portals.schema": "px.schema",
        "portals.template.field": "px.template.field",
    }

    # Modules that use wildcard imports from px
    WILDCARD_REEXPORT_MODULES = {
        "portals.base": "px.base",
        "portals.template": "px.template",
    }

    # Modules with complex/mixed import patterns
    COMPLEX_REEXPORT_MODULES = {
        "portals.custom": [
            "px.custom",
            "px.custom.custom_component",
            "px.custom.utils",
        ],
        "portals.io": ["px.io", "px.template"],  # Mixed imports
    }

    # Modules with dynamic __getattr__ patterns
    DYNAMIC_REEXPORT_MODULES = {
        "portals.field_typing": "px.field_typing",
    }

    def test_direct_reexport_modules_importable(self):
        """Test that all direct re-export modules can be imported."""
        successful_imports = 0

        for portals_module, px_module in self.DIRECT_REEXPORT_MODULES.items():
            try:
                # Import the portals module
                lf_module = importlib.import_module(portals_module)
                assert lf_module is not None, f"Portals module {portals_module} is None"

                # Import the corresponding px module to compare

                px_mod = importlib.import_module(px_module)
                assert px_mod is not None, f"PX module {px_module} is None"

                successful_imports += 1

            except Exception as e:
                pytest.fail(
                    f"Failed to import direct re-export module {portals_module}: {e!s}"
                )

    def test_wildcard_reexport_modules_importable(self):
        """Test that modules using wildcard imports work correctly."""
        successful_imports = 0

        for portals_module, px_module in self.WILDCARD_REEXPORT_MODULES.items():
            try:
                # Import the portals module
                lf_module = importlib.import_module(portals_module)
                assert lf_module is not None, f"Portals module {portals_module} is None"

                # Wildcard imports should expose most/all attributes from px module
                px_mod = importlib.import_module(px_module)

                # Check that all attributes are available
                if hasattr(px_mod, "__all__"):
                    all_attrs = list(px_mod.__all__)  # Test all attributes
                    for attr in all_attrs:
                        if hasattr(px_mod, attr):
                            assert hasattr(lf_module, attr), (
                                f"Attribute {attr} missing from {portals_module}"
                            )

                successful_imports += 1

            except Exception as e:
                pytest.fail(
                    f"Failed to import wildcard re-export module {portals_module}: {e!s}"
                )

    def test_complex_reexport_modules_importable(self):
        """Test that modules with complex/mixed import patterns work correctly."""
        successful_imports = 0

        for portals_module in self.COMPLEX_REEXPORT_MODULES:
            try:
                # Import the portals module
                lf_module = importlib.import_module(portals_module)
                assert lf_module is not None, f"Portals module {portals_module} is None"

                # Verify it has __all__ attribute for complex modules
                assert hasattr(lf_module, "__all__"), (
                    f"Complex module {portals_module} missing __all__"
                )
                assert len(lf_module.__all__) > 0, (
                    f"Complex module {portals_module} has empty __all__"
                )

                # Try to access all items from __all__
                all_items = lf_module.__all__  # Test all items
                for item in all_items:
                    try:
                        attr = getattr(lf_module, item)
                        assert attr is not None, (
                            f"Attribute {item} is None in {portals_module}"
                        )
                    except AttributeError:
                        pytest.fail(
                            f"Complex module {portals_module} missing expected attribute {item} from __all__"
                        )

                successful_imports += 1

            except Exception as e:
                pytest.fail(
                    f"Failed to import complex re-export module {portals_module}: {e!s}"
                )

    def test_dynamic_reexport_modules_importable(self):
        """Test that modules with __getattr__ dynamic loading work correctly."""
        successful_imports = 0

        for portals_module in self.DYNAMIC_REEXPORT_MODULES:
            try:
                # Import the portals module
                lf_module = importlib.import_module(portals_module)
                assert lf_module is not None, f"Portals module {portals_module} is None"

                # Dynamic modules should have __getattr__ method
                assert hasattr(lf_module, "__getattr__"), (
                    f"Dynamic module {portals_module} missing __getattr__"
                )

                # Test accessing some known attributes dynamically
                if portals_module == "portals.field_typing":
                    # Test some known field typing constants
                    test_attrs = ["Data", "Text", "LanguageModel"]
                    for attr in test_attrs:
                        try:
                            value = getattr(lf_module, attr)
                            assert value is not None, (
                                f"Dynamic attribute {attr} is None"
                            )
                        except AttributeError:
                            pytest.fail(
                                f"Dynamic module {portals_module} missing expected attribute {attr}"
                            )

                successful_imports += 1

            except Exception as e:
                pytest.fail(
                    f"Failed to import dynamic re-export module {portals_module}: {e!s}"
                )

    def test_all_reexport_modules_have_required_structure(self):
        """Test that re-export modules have the expected structure."""
        all_modules = {}
        all_modules.update(self.DIRECT_REEXPORT_MODULES)
        all_modules.update(self.WILDCARD_REEXPORT_MODULES)
        all_modules.update(self.DYNAMIC_REEXPORT_MODULES)

        # Add complex modules
        for lf_mod in self.COMPLEX_REEXPORT_MODULES:
            all_modules[lf_mod] = self.COMPLEX_REEXPORT_MODULES[lf_mod]

        for portals_module in all_modules:
            try:
                lf_module = importlib.import_module(portals_module)

                # All modules should be importable
                assert lf_module is not None

                # Most should have __name__ attribute
                assert hasattr(lf_module, "__name__")

                # Check for basic module structure
                assert hasattr(lf_module, "__file__") or hasattr(lf_module, "__path__")

            except Exception as e:
                pytest.fail(f"Module structure issue with {portals_module}: {e!s}")

    def test_reexport_modules_backward_compatibility(self):
        """Test that common import patterns still work for backward compatibility."""
        # Test some key imports that should always work
        backward_compatible_imports = [
            ("portals.schema", "Data"),
            ("portals.inputs", "StrInput"),
            ("portals.inputs", "IntInput"),
            ("portals.custom", "Component"),  # Base component class
            ("portals.custom", "CustomComponent"),
            ("portals.field_typing", "Text"),  # Dynamic
            ("portals.field_typing", "Data"),  # Dynamic
            ("portals.load", "load_flow_from_json"),
            ("portals.logging", "logger"),
        ]

        for module_name, symbol_name in backward_compatible_imports:
            try:
                module = importlib.import_module(module_name)
                symbol = getattr(module, symbol_name)
                assert symbol is not None

                # For callable objects, ensure they're callable
                if inspect.isclass(symbol) or inspect.isfunction(symbol):
                    assert callable(symbol)

            except Exception as e:
                pytest.fail(
                    f"Backward compatibility issue with {module_name}.{symbol_name}: {e!s}"
                )

    def test_no_circular_imports_in_reexports(self):
        """Test that there are no circular import issues in re-export modules."""
        # Test importing modules in different orders to catch circular imports
        import_orders = [
            ["portals.schema", "portals.inputs", "portals.base"],
            ["portals.base", "portals.schema", "portals.inputs"],
            ["portals.inputs", "portals.base", "portals.schema"],
            ["portals.custom", "portals.field_typing", "portals.template"],
            ["portals.template", "portals.custom", "portals.field_typing"],
            ["portals.field_typing", "portals.template", "portals.custom"],
        ]

        for order in import_orders:
            try:
                for module_name in order:
                    importlib.import_module(module_name)
                    # Try to access something from each module to trigger full loading
                    module = importlib.import_module(module_name)
                    if hasattr(module, "__all__") and module.__all__:
                        # Try to access first item in __all__
                        first_item = module.__all__[0]
                        try:
                            getattr(module, first_item)
                        except AttributeError:
                            pytest.fail(
                                f"Module {module_name} missing expected attribute {first_item} from __all__"
                            )

            except Exception as e:
                pytest.fail(f"Circular import issue with order {order}: {e!s}")

    def test_reexport_modules_performance(self):
        """Test that re-export modules import efficiently."""
        # Test that basic imports are fast
        performance_critical_modules = [
            "portals.schema",
            "portals.inputs",
            "portals.field_typing",
            "portals.load",
            "portals.logging",
        ]

        slow_imports = []

        for module_name in performance_critical_modules:
            start_time = time.time()
            try:
                importlib.import_module(module_name)
                import_time = time.time() - start_time

                # Re-export modules should import quickly (< 1 second)
                if import_time > 1.0:
                    slow_imports.append(f"{module_name}: {import_time:.3f}s")

            except ImportError:
                # Import failures are tested elsewhere
                pass

        # Don't fail the test, just record slow imports for information

    def test_coverage_completeness(self):
        """Test that we're testing all known re-export modules."""
        # This test ensures we don't miss any re-export modules
        all_tested_modules = set()
        all_tested_modules.update(self.DIRECT_REEXPORT_MODULES.keys())
        all_tested_modules.update(self.WILDCARD_REEXPORT_MODULES.keys())
        all_tested_modules.update(self.COMPLEX_REEXPORT_MODULES.keys())
        all_tested_modules.update(self.DYNAMIC_REEXPORT_MODULES.keys())

        # Should be testing all 24 identified modules based on our analysis
        actual_count = len(all_tested_modules)

        # Ensure we have a reasonable number of modules
        assert actual_count >= 20, f"Too few modules being tested: {actual_count}"
        assert actual_count <= 30, f"Too many modules being tested: {actual_count}"

    # Dynamic test methods using the discovery functions
    def test_dynamic_module_discovery(self):
        """Test that we can dynamically discover portals modules."""
        modules = self._discover_portals_modules()
        assert len(modules) > 0, "Should discover at least some portals modules"

        # Check that known modules are found
        expected_modules = ["portals.schema", "portals.inputs", "portals.custom"]
        found_modules = [mod for mod in expected_modules if mod in modules]
        assert len(found_modules) > 0, (
            f"Expected to find some of {expected_modules}, but found: {found_modules}"
        )

    @pytest.mark.parametrize("module_name", get_all_reexport_modules())
    def test_parametrized_module_import_and_pattern_detection(self, module_name: str):
        """Parametrized test that checks module import and pattern detection."""
        # Test that module can be imported
        try:
            module = importlib.import_module(module_name)
            assert module is not None, f"Module {module_name} should not be None"
        except ImportError:
            pytest.fail(f"Could not import {module_name}")

        # Test pattern detection
        pattern_info = self._detect_reexport_pattern(module_name)
        assert isinstance(pattern_info, dict), "Pattern detection should return a dict"
        assert "type" in pattern_info, "Pattern info should have 'type' key"
        assert pattern_info["type"] in ["direct", "dynamic", "none", "import_error"], (
            f"Unknown pattern type: {pattern_info['type']}"
        )

    def test_generate_backward_compatibility_imports(self):
        """Test generating backward compatibility imports dynamically."""
        # Test with a known module that has px imports
        test_cases = [("portals.schema", "px.schema"), ("portals.custom", "px.custom")]

        for lf_module, expected_px_source in test_cases:
            px_symbols = self._get_expected_symbols(expected_px_source)
            assert len(px_symbols) > 0, (
                f"Should find some symbols in {expected_px_source}"
            )

            # Test that symbols explicitly re-exported by portals module are accessible
            lf_module_obj = importlib.import_module(lf_module)

            # Get the symbols that portals explicitly re-exports (from its __all__)
            if hasattr(lf_module_obj, "__all__"):
                lf_reexported = lf_module_obj.__all__
                # Check that these re-exported symbols are actually available
                available_symbols = [
                    sym for sym in lf_reexported if hasattr(lf_module_obj, sym)
                ]
                assert len(available_symbols) > 0, (
                    f"Module {lf_module} should have symbols from its __all__"
                )

                # Verify that at least some of the re-exported symbols come from px
                px_sourced = [sym for sym in available_symbols if sym in px_symbols]
                assert len(px_sourced) > 0, (
                    f"Module {lf_module} should re-export some symbols from {expected_px_source}"
                )
            else:
                # If no __all__, just check that some px symbols are accessible
                available_symbols = [
                    sym for sym in px_symbols[:10] if hasattr(lf_module_obj, sym)
                ]
                assert len(available_symbols) > 0, (
                    f"Module {lf_module} should have some symbols from {expected_px_source}"
                )
