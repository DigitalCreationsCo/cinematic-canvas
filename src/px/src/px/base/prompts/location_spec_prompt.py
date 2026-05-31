from typing import Any


def get_all_best_assets(_assets: Any) -> dict[str, Any]:
    # Replace with your actual implementation of getAllBestAssets
    return {}


def build_location_full_spec(location: dict[str, Any]) -> str:
    # 1. Assets and basic variable parsing
    assets = get_all_best_assets(location.get("assets")) if "assets" in location else {}

    assets_desc = assets.get("description", {}) if assets else {}
    assets_desc_data = assets_desc.get("data") if assets_desc else None

    description = assets_desc_data or (location.get("description", "") if "description" in location else "")

    state = location.get("state", {})
    lighting = location.get("lightingConditions", {})

    # 2. Atmospheric parts construction
    atmospheric_parts: list[str] = []
    precipitation = state.get("precipitation")
    if precipitation and precipitation != "none":
        atmospheric_parts.append(f"{precipitation} precipitation")

    visibility = state.get("visibility")
    if visibility and visibility != "clear":
        atmospheric_parts.append(f"{visibility.replace('_', ' ')} visibility")

    atmospheric_effects = state.get("atmosphericEffects", []) or []
    atmospheric_parts.extend(
        f"{e.get('intensity')} {e.get('type')}" for e in atmospheric_effects if not e.get("dissipating")
    )

    temperature_indicators = state.get("temperatureIndicators", []) or []
    atmospheric_parts.extend(t for t in temperature_indicators)

    # 3. Ground condition parts construction
    ground_parts: list[str] = []
    ground_surface = location.get("groundSurface")
    if ground_surface:
        ground_parts.append(ground_surface)

    ground_condition = state.get("groundCondition", {}) if state else {}
    if ground_condition:
        wetness = ground_condition.get("wetness")
        if wetness and wetness != "dry":
            ground_parts.append(f"{wetness}")

        debris = ground_condition.get("debris", []) or []
        if len(debris) > 0:
            ground_parts.append(f"scattered with {' and '.join(debris)}")

        damage = ground_condition.get("damage", []) or []
        if len(damage) > 0:
            ground_parts.append(f"marked by {' and '.join(damage)}")

    # 4. Lighting description mapping (simulating JS filter/join array)
    lighting_direction = lighting.get("direction", {}) if lighting else {}
    lighting_atmosphere = lighting.get("atmosphere", {}) if lighting else {}
    lighting_sources = lighting.get("motivatedSources", {}) if lighting else {}
    lighting_quality = lighting.get("quality", {}) if lighting else {}

    haze = lighting_atmosphere.get("haze") if lighting_atmosphere else None
    light_beams = lighting_sources.get("lightBeams") if lighting_sources else None

    lighting_desc_raw = [
        f"{lighting_direction.get('keyLightPosition')} light position"
        if lighting_direction and lighting_direction.get("keyLightPosition")
        else "",
        "" if haze == "None" else f" with {haze}" if haze else "",
        f"Primary light: {lighting_sources.get('primaryLight')}"
        if lighting_sources and lighting_sources.get("primaryLight")
        else "",
        f"{lighting_sources.get('fillLight')} fill light"
        if lighting_sources and lighting_sources.get("fillLight")
        else "",
        f"{lighting_sources.get('accentLight')} accent light"
        if lighting_sources and lighting_sources.get("accentLight")
        else "",
        "" if light_beams == "None" else f"{light_beams} light beams" if light_beams else "",
        f"{lighting_sources.get('practicalLights')} practical lights"
        if lighting_sources and lighting_sources.get("practicalLights")
        else "",
        f"{lighting_direction.get('shadowDirection')} shadow direction"
        if lighting_direction and lighting_direction.get("shadowDirection")
        else "",
        f"{lighting_quality.get('hardness')} light hardness"
        if lighting_quality and lighting_quality.get("hardness")
        else "",
        f"{lighting_quality.get('intensity')} light intensity"
        if lighting_quality and lighting_quality.get("intensity")
        else "",
        f"{lighting_quality.get('colorTemperature')} color temperature"
        if lighting_quality and lighting_quality.get("colorTemperature")
        else "",
        f"{lighting_direction.get('contrastRatio')} contrast ratio"
        if lighting_direction and lighting_direction.get("contrastRatio")
        else "",
    ]
    # Clean up empty strings or None elements to emulate filter(Boolean).join(", ")
    lighting_desc = ", ".join([item for item in lighting_desc_raw if item])

    # 5. Final Image Extraction
    image = ""
    if "assets" in location:
        best_assets = get_all_best_assets(location.get("assets"))
        loc_img_asset = best_assets.get("location_image", {}) if best_assets else {}
        image = loc_img_asset.get("data", "") if loc_img_asset else ""

    # 6. Build final output array structure
    natural_elements = location.get("naturalElements", []) or []
    architecture = location.get("architecture", []) or []
    man_made_objects = location.get("manMadeObjects", []) or []
    color_palette = location.get("colorPalette", []) or []

    final_output_raw = [
        description,
        f"{location.get('name')}{': ' + location.get('type') if location.get('type') else ''}.",
        f"The environment features {', '.join(natural_elements)}." if len(natural_elements) > 0 else "",
        f"Architecture includes {', '.join(architecture)}." if len(architecture) > 0 else "",
        f"Man-made objects include {', '.join(man_made_objects)}." if len(man_made_objects) > 0 else "",
        f"The ground is {', '.join(ground_parts)}." if len(ground_parts) > 0 else "",
        f"Overhead, {location.get('skyOrCeiling')}." if location.get("skyOrCeiling") else "",
        f"Set during {location.get('timeOfDay')}"
        f"{' in ' + state.get('season') if state and state.get('season') != 'unspecified' else ''}"
        f", with {location.get('weather', 'clear')} weather"
        f"{' and ' + ', '.join(atmospheric_parts) if len(atmospheric_parts) > 0 else ''}.",
        f" {', '.join(temperature_indicators)}." if len(temperature_indicators) > 0 else "",
        f"Lit by {lighting_desc}." if lighting_desc else "Natural lighting matching the time of day.",
        f" Color palette: {', '.join(color_palette)}." if len(color_palette) > 0 else "",
        f"{location.get('mood', 'Neutral')} atmosphere — conveyed through light, color, and composition.",
        f"Image: {image}" if image else "",
        f"Reference ID: {location.get('referenceId')}",
    ]

    # Replicate Javascript's array `.filter(Boolean).join(" ")`
    return " ".join([str(item) for item in final_output_raw if item])
