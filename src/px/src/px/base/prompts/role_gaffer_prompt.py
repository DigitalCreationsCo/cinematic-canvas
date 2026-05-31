import json
from typing import Any

# Global constant matching the exported version
PROMPT_VERSION: str = "3.0.1"


# --- Mock placeholders for external dependencies ---
class LightingShape:
    """Simulates the Zod/Object schema structure (Lighting.shape.*)."""

    def __init__(self):
        self.quality = {
            "type": "object",
            "properties": {"hardness": "string", "intensity": "string", "colorTemperature": "string"},
        }
        self.motivatedSources = {
            "type": "object",
            "properties": {
                "primaryLight": "string",
                "fillLight": "string",
                "accentLight": "string",
                "lightBeams": "string",
                "practicalLights": "string",
            },
        }
        self.direction = {
            "type": "object",
            "properties": {"keyLightPosition": "string", "shadowDirection": "string", "contrastRatio": "string"},
        }
        self.atmosphere = {"type": "object", "properties": {"haze": "string"}}


class LightingMock:
    shape = LightingShape()


Lighting = LightingMock()


def get_model_compatible_schema(schema_slice: Any) -> Any:
    # Replace with your actual implementation of getModelCompatibleSchema
    return schema_slice


def build_gaffer_guidelines() -> str:
    """GAFFER - Lighting Design.

    Specifies lighting quality, motivated sources, color temperature,
    and atmospheric effects.
    """
    quality_schema = get_model_compatible_schema(Lighting.shape.quality)
    sources_schema = get_model_compatible_schema(Lighting.shape.motivatedSources)
    direction_schema = get_model_compatible_schema(Lighting.shape.direction)
    atmosphere_schema = get_model_compatible_schema(Lighting.shape.atmosphere)

    # Python's json.dumps behaves identically to JSON.stringify
    return (
        f"GAFFER LIGHTING SPECIFICATIONS:\n\n"
        f"For each scene, specify:\n\n"
        f"LIGHT QUALITY:\n"
        f"{json.dumps(quality_schema)}\n\n"
        f"MOTIVATED SOURCES (where does light come from?):\n"
        f"{json.dumps(sources_schema)}\n\n"
        f"LIGHTING DIRECTION:\n"
        f"{json.dumps(direction_schema)}\n\n"
        f"ATMOSPHERE:\n"
        f"{json.dumps(atmosphere_schema)}\n\n"
        f"CONSTRAINT: All lighting must be MOTIVATED (justified by visible source or environment).\n"
    )


def build_gaffer_prompt(scene: dict[str, Any], location: dict[str, Any], time_of_day: str) -> str:
    return (
        f"\n"
        f"As the GAFFER, design lighting for Scene {scene.get('id')}.\n\n"
        f"LOCATION: {location.get('name')} | TIME: {time_of_day} | WEATHER: {location.get('weather')}\n"
        f"MOOD: {scene.get('mood')} | INTENSITY: {scene.get('intensity')}\n\n"
        f"{build_gaffer_guidelines()}\n"
        f"SPECIFY all lighting parameters using the guidelines above.\n\n"
        f"CONSTRAINT: All lighting must be motivated (justified by visible or implied natural source).\n\n"
        f"OUTPUT: Structured lighting specifications (not technical jargon).\n"
    )


def build_gaffer_lighting_spec(
    _scene: dict[str, Any], location: dict[str, Any], time_of_day: str | None = None
) -> list[str]:

    lighting = location.get("lightingConditions", {})

    # Destructure nested properties safely to prevent KeyErrors
    lighting_atmosphere = lighting.get("atmosphere", {}) if lighting else {}
    lighting_direction = lighting.get("direction", {}) if lighting else {}
    lighting_sources = lighting.get("motivatedSources", {}) if lighting else {}
    lighting_quality = lighting.get("quality", {}) if lighting else {}

    # Map items array exactly mirroring the TypeScript sorting hierarchy
    lighting_desc_raw = [
        lighting_atmosphere.get("haze") if lighting_atmosphere else None,
        f"{lighting_direction.get('contrastRatio')} contrast ratio"
        if lighting_direction and lighting_direction.get("contrastRatio")
        else "",
        f"{lighting_direction.get('keyLightPosition')} key light position"
        if lighting_direction and lighting_direction.get("keyLightPosition")
        else "",
        f"{lighting_direction.get('shadowDirection')} shadow direction"
        if lighting_direction and lighting_direction.get("shadowDirection")
        else "",
        f"{lighting_sources.get('accentLight')} accent light"
        if lighting_sources and lighting_sources.get("accentLight")
        else "",
        f"{lighting_sources.get('fillLight')} fill light"
        if lighting_sources and lighting_sources.get("fillLight")
        else "",
        f"{lighting_sources.get('lightBeams')} light beams"
        if lighting_sources and lighting_sources.get("lightBeams")
        else "",
        f"{lighting_sources.get('practicalLights')} practical lights"
        if lighting_sources and lighting_sources.get("practicalLights")
        else "",
        f"{lighting_sources.get('primaryLight')} primary light"
        if lighting_sources and lighting_sources.get("primaryLight")
        else "",
        f"{lighting_quality.get('colorTemperature')} color temperature"
        if lighting_quality and lighting_quality.get("colorTemperature")
        else "",
        f"{lighting_quality.get('hardness')} light hardness"
        if lighting_quality and lighting_quality.get("hardness")
        else "",
        f"{lighting_quality.get('intensity')} light intensity"
        if lighting_quality and lighting_quality.get("intensity")
        else "",
    ]

    # Replicate JavaScript's array `.filter(Boolean).join(", ")`
    lighting_desc = ", ".join([str(item) for item in lighting_desc_raw if item])

    # Determine timing fallback logic: time_of_day || location?.timeOfDay || ""
    selected_time = time_of_day or (location.get("timeOfDay") if location else "") or ""

    return [
        f"{selected_time}",
        f"Lit by {lighting_desc}." if lighting_desc else "Natural lighting matching the time of day.",
    ]
