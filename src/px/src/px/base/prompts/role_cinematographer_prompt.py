import json
import re
from typing import Any

# Global constant matching the exported version
PROMPT_VERSION: str = "3.0.1"

# --- Mock placeholders for external dependencies ---
# Replace these with your imported variables and schemas from cinematography.types.py
transition_types_with_descriptions: dict[str, str] = {}
shot_types_with_descriptions: dict[str, str] = {}
camera_angles_with_descriptions: dict[str, str] = {}
camera_movements_with_descriptions: dict[str, str] = {}
Composition: dict[str, Any] = {}


def get_model_compatible_schema(schema_slice: Any) -> Any:
    # Replace with your actual implementation of getModelCompatibleSchema
    return schema_slice


def build_cinematographer_guidelines() -> str:
    """CINEMATOGRAPHER - Shot Composition & Framing.

    Specifies transition type, shot type, camera angle, camera movement,
    and composition.
    """
    comp_schema = get_model_compatible_schema(Composition)

    # json.dumps without separators mirrors JavaScript's JSON.stringify minified style
    return (
        f"CINEMATOGRAPHER SPECIFICATIONS:\n"  # noqa: S608
        f"For each scene, select from these options. "
        f"The specification should complement and enhance the narrative beat.\n\n"
        f'TRANSITION TYPE (choose ONE). Use the "Continuous" transition '
        f"to indicate continuous segments with no transition/changes "
        f"from the previous scene (Extend the scene).\n"
        f"{json.dumps(transition_types_with_descriptions)}\n\n"
        f"SHOT TYPE (choose ONE):\n"
        f"{json.dumps(shot_types_with_descriptions)}\n\n"
        f"CAMERA ANGLE (choose ONE):\n"
        f"{json.dumps(camera_angles_with_descriptions)}\n\n"
        f"CAMERA MOVEMENT (choose ONE):\n"
        f"{json.dumps(camera_movements_with_descriptions)}\n\n"
        f"COMPOSITION (specify all). Frame composition should anticipate the transition style.\n"
        f"{json.dumps(comp_schema)}\n"
    )


def build_cinematographer_narrative(scene: dict[str, Any], frame_position: str | None = None) -> str:

    shot_map: dict[str, str] = {
        "ECU": "Extreme Close-Up",
        "CU": "Close-Up",
        "MCU": "Medium Close-Up",
        "MS": "Medium Shot",
        "MW": "Medium Wide Shot",
        "WS": "Wide Shot",
        "VW": "Very Wide Establishing Shot",
    }

    # Fallback resolution chain mirroring scene.shotType || ""
    scene_shot_type = scene.get("shotType", "") or ""
    shot_type = shot_map.get(scene_shot_type, scene_shot_type) or "Cinematic shot"

    scene_movement = scene.get("cameraMovement")
    movement = f", with {scene_movement.lower()} movement" if scene_movement else ""

    scene_angle = scene.get("cameraAngle")
    angle = f" from a {scene_angle.lower()} angle" if scene_angle else ""

    # Construct the primary string sequence
    narrative = f"A {shot_type.lower()} captured{angle}{movement}."

    # Process and stringify nested scene composition data
    scene_composition = scene.get("composition")
    if scene_composition:
        # json.dumps replicates JSON.stringify(scene.composition)
        comp_str = json.dumps(scene_composition)
        # re.sub perfectly replicates the /[\n\r]+/g regex whitespace cleanup flag
        cleaned_comp = re.sub(r"[\n\r]+", ", ", comp_str)
        narrative += f" {cleaned_comp}."

    # Apply frame positioning text adjustments
    if frame_position:
        if frame_position == "start":
            narrative += " This frame captures the beginning of the scene."
        elif frame_position == "end":
            narrative += " This frame captures the end of the scene."

    return narrative
