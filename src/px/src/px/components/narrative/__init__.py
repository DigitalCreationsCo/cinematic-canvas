from __future__ import annotations

from typing import TYPE_CHECKING, Any

from px.components._importing import import_mod

if TYPE_CHECKING:
    from px.components.narrative.character import CharacterComponent
    from px.components.narrative.expand_creative import ExpandCreativePromptComponent
    from px.components.narrative.generate_characters import GenerateCharacters
    from px.components.narrative.generate_storyboard import GenerateStoryboardComponent
    from px.components.narrative.get_project_component import GetProjectComponent
    from px.components.narrative.group import GroupComponent
    from px.components.narrative.location import LocationComponent
    from px.components.narrative.prop import PropComponent
    from px.components.narrative.scene import SceneComponent

_dynamic_imports = {
    "ExpandCreativePromptComponent": "expand_creative",
    "CharacterComponent": "character",
    "GenerateCharacters": "generate_characters",
    "GenerateStoryboardComponent": "generate_storyboard",
    "GetProjectComponent": "get_project_component",
    "GroupComponent": "group",
    "LocationComponent": "location",
    "SceneComponent": "scene",
    "PropComponent": "prop",
}

__all__ = [
    "CharacterComponent",
    "ExpandCreativePromptComponent",
    "GenerateCharacters",
    "GenerateStoryboardComponent",
    "GetProjectComponent",
    "GroupComponent",
    "LocationComponent",
    "PropComponent",
    "SceneComponent",
]


def __getattr__(attr_name: str) -> Any:
    """Lazily import data source components on attribute access."""
    if attr_name not in _dynamic_imports:
        msg = f"module '{__name__}' has no attribute '{attr_name}'"
        raise AttributeError(msg)
    try:
        result = import_mod(attr_name, _dynamic_imports[attr_name], __spec__.parent)
    except (ModuleNotFoundError, ImportError, AttributeError) as e:
        msg = f"Could not import '{attr_name}' from '{__name__}': {e}"
        raise AttributeError(msg) from e
    globals()[attr_name] = result
    return result


def __dir__() -> list[str]:
    return list(__all__)
