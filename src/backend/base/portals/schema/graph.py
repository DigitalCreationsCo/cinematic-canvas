# Backwards compatibility module for portals.schema.graph
# This module redirects imports to the new px.schema.graph module

from px.schema.graph import InputValue, Tweaks

__all__ = ["InputValue", "Tweaks"]
