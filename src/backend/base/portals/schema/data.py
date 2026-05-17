"""JSON and Data classes for portals - imports from px.

This maintains backward compatibility while using the px implementation.
JSON is the new base type; Data is an alias for backwards compatibility.
"""

from px.schema.data import JSON, Data, custom_serializer, serialize_data

__all__ = ["JSON", "Data", "custom_serializer", "serialize_data"]
