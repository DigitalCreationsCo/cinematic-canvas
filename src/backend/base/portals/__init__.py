""" backwards compatibility layer.

This module provides backwards compatibility by forwarding imports from
portals.* to px.* to maintain compatibility with existing code that
references the old portals module structure.
"""

from portals.helpers.windows_postgres_helper import configure_windows_postgres_event_loop

configure_windows_postgres_event_loop(source="package_init")

import importlib  # noqa: E402
import importlib.util  # noqa: E402
import sys  # noqa: E402
from types import ModuleType  # noqa: E402
from typing import Any  # noqa: E402


class PortalsCompatibilityModule(ModuleType):
    """A module that forwards attribute access to the corresponding px module."""

    def __init__(self, name: str, px_module_name: str):
        super().__init__(name)
        self._px_module_name = px_module_name
        self._px_module = None

    def _get_px_module(self):
        """Lazily import and cache the px module."""
        if self._px_module is None:
            try:
                self._px_module = importlib.import_module(self._px_module_name)
            except ImportError as e:
                msg = f"Cannot import {self._px_module_name} for backwards compatibility with {self.__name__}"
                raise ImportError(msg) from e
        return self._px_module

    def __getattr__(self, name: str) -> Any:
        """Forward attribute access to the px module with caching."""
        px_module = self._get_px_module()
        try:
            attr = getattr(px_module, name)
        except AttributeError as e:
            msg = f"module '{self.__name__}' has no attribute '{name}'"
            raise AttributeError(msg) from e
        else:
            # Cache the attribute in our __dict__ for faster subsequent access
            setattr(self, name, attr)
            return attr

    def __dir__(self):
        """Return directory of the px module."""
        try:
            px_module = self._get_px_module()
            return dir(px_module)
        except ImportError:
            return []


def _setup_compatibility_modules():
    """Set up comprehensive compatibility modules for portals.base imports."""
    # First, set up the base attribute on this module (portals)
    current_module = sys.modules[__name__]

    # Define all the modules we need to support
    module_mappings = {
        # Core base module
        "portals.base": "px.base",
        # Inputs module - critical for class identity
        "portals.inputs": "px.inputs",
        "portals.inputs.inputs": "px.inputs.inputs",
        # Schema modules - also critical for class identity
        "portals.schema": "px.schema",
        "portals.schema.data": "px.schema.data",
        "portals.schema.serialize": "px.schema.serialize",
        # Template modules
        "portals.template": "px.template",
        "portals.template.field": "px.template.field",
        "portals.template.field.base": "px.template.field.base",
        # Components modules
        "portals.components": "px.components",
        "portals.components.helpers": "px.components.helpers",
        "portals.components.helpers.calculator_core": "px.components.helpers.calculator_core",
        "portals.components.helpers.create_list": "px.components.helpers.create_list",
        "portals.components.helpers.current_date": "px.components.helpers.current_date",
        "portals.components.helpers.id_generator": "px.components.helpers.id_generator",
        "portals.components.helpers.memory": "px.components.helpers.memory",
        "portals.components.helpers.output_parser": "px.components.helpers.output_parser",
        "portals.components.helpers.store_message": "px.components.helpers.store_message",
        # Individual modules that exist in px
        "portals.base.agents": "px.base.agents",
        "portals.base.chains": "px.base.chains",
        "portals.base.data": "px.base.data",
        "portals.base.data.utils": "px.base.data.utils",
        "portals.base.document_transformers": "px.base.document_transformers",
        "portals.base.embeddings": "px.base.embeddings",
        "portals.base.flow_processing": "px.base.flow_processing",
        "portals.base.io": "px.base.io",
        "portals.base.io.chat": "px.base.io.chat",
        "portals.base.io.text": "px.base.io.text",
        "portals.base.langchain_utilities": "px.base.langchain_utilities",
        "portals.base.memory": "px.base.memory",
        "portals.base.models": "px.base.models",
        "portals.base.models.google_generative_ai_constants": "px.base.models.google_generative_ai_constants",
        "portals.base.models.openai_constants": "px.base.models.openai_constants",
        "portals.base.models.anthropic_constants": "px.base.models.anthropic_constants",
        "portals.base.models.aiml_constants": "px.base.models.aiml_constants",
        "portals.base.models.aws_constants": "px.base.models.aws_constants",
        "portals.base.models.groq_constants": "px.base.models.groq_constants",
        "portals.base.models.novita_constants": "px.base.models.novita_constants",
        "portals.base.models.ollama_constants": "px.base.models.ollama_constants",
        "portals.base.models.sambanova_constants": "px.base.models.sambanova_constants",
        "portals.base.models.cometapi_constants": "px.base.models.cometapi_constants",
        "portals.base.prompts": "px.base.prompts",
        "portals.base.prompts.api_utils": "px.base.prompts.api_utils",
        "portals.base.prompts.utils": "px.base.prompts.utils",
        "portals.base.textsplitters": "px.base.textsplitters",
        "portals.base.tools": "px.base.tools",
        "portals.base.vectorstores": "px.base.vectorstores",
    }

    # Create compatibility modules for each mapping
    for portals_name, px_name in module_mappings.items():
        if portals_name not in sys.modules:
            # Check if the px module exists
            try:
                spec = importlib.util.find_spec(px_name)
                if spec is not None:
                    # Create compatibility module
                    compat_module = PortalsCompatibilityModule(portals_name, px_name)
                    sys.modules[portals_name] = compat_module

                    # Set up the module hierarchy
                    parts = portals_name.split(".")
                    if len(parts) > 1:
                        parent_name = ".".join(parts[:-1])
                        parent_module = sys.modules.get(parent_name)
                        if parent_module is not None:
                            setattr(parent_module, parts[-1], compat_module)

                    # Special handling for top-level modules
                    if portals_name == "portals.base":
                        current_module.base = compat_module
                    elif portals_name == "portals.inputs":
                        current_module.inputs = compat_module
                    elif portals_name == "portals.schema":
                        current_module.schema = compat_module
                    elif portals_name == "portals.template":
                        current_module.template = compat_module
                    elif portals_name == "portals.components":
                        current_module.components = compat_module
            except (ImportError, ValueError):
                # Skip modules that don't exist in px
                continue

    # Handle modules that exist only in portals (like knowledge_bases)
    # These need special handling because they're not in px yet
    portals_only_modules = {
        "portals.base.data.kb_utils": "portals.base.data.kb_utils",
        "portals.base.knowledge_bases": "portals.base.knowledge_bases",
        "portals.components.knowledge_bases": "portals.components.knowledge_bases",
    }

    for portals_name in portals_only_modules:
        if portals_name not in sys.modules:
            try:
                # Try to find the actual physical module file
                from pathlib import Path

                base_dir = Path(__file__).parent

                if portals_name == "portals.base.data.kb_utils":
                    kb_utils_file = base_dir / "base" / "data" / "kb_utils.py"
                    if kb_utils_file.exists():
                        spec = importlib.util.spec_from_file_location(portals_name, kb_utils_file)
                        if spec is not None and spec.loader is not None:
                            module = importlib.util.module_from_spec(spec)
                            sys.modules[portals_name] = module
                            spec.loader.exec_module(module)

                            # Also add to parent module
                            parent_module = sys.modules.get("portals.base.data")
                            if parent_module is not None:
                                parent_module.kb_utils = module

                elif portals_name == "portals.base.knowledge_bases":
                    kb_dir = base_dir / "base" / "knowledge_bases"
                    kb_init_file = kb_dir / "__init__.py"
                    if kb_init_file.exists():
                        spec = importlib.util.spec_from_file_location(portals_name, kb_init_file)
                        if spec is not None and spec.loader is not None:
                            module = importlib.util.module_from_spec(spec)
                            sys.modules[portals_name] = module
                            spec.loader.exec_module(module)

                            # Also add to parent module
                            parent_module = sys.modules.get("portals.base")
                            if parent_module is not None:
                                parent_module.knowledge_bases = module

                elif portals_name == "portals.components.knowledge_bases":
                    components_kb_dir = base_dir / "components" / "knowledge_bases"
                    components_kb_init_file = components_kb_dir / "__init__.py"
                    if components_kb_init_file.exists():
                        spec = importlib.util.spec_from_file_location(portals_name, components_kb_init_file)
                        if spec is not None and spec.loader is not None:
                            module = importlib.util.module_from_spec(spec)
                            sys.modules[portals_name] = module
                            spec.loader.exec_module(module)

                            # Also add to parent module
                            parent_module = sys.modules.get("portals.components")
                            if parent_module is not None:
                                parent_module.knowledge_bases = module
            except (ImportError, AttributeError):
                # If direct file loading fails, skip silently
                continue


# Set up all the compatibility modules
_setup_compatibility_modules()
