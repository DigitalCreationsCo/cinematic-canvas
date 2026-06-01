"""Character reference image prompt builder.

Python translation of the shared TS prompts:
  - character-reference-image.prompt.ts
  - character-spec.prompt.ts
  - safety-guidelines.prompt.ts
  - prompt.utils.ts (composeGenerationRules)

Usage:
    prompt = build_character_image_prompt(character_dict)
"""

from __future__ import annotations

from typing import Any


def build_character_image_prompt(
    character: dict[str, Any],
    generation_rules: list[str] | None = None,
) -> str:
    """Top-level image-generation prompt for a single character.

    Parameters
    ----------
    character:
        A dict with keys matching ``CharacterAttributes`` (snake_case):
        ``reference_id``, ``name``, ``description``, ``aliases``,
        ``physical_traits`` (dict), ``state`` (dict).
    generation_rules:
        Optional list of rules to append (e.g. from quality evaluation).

    Returns:
    -------
    A fully assembled prompt string.
    """
    parts: list[str] = [
        _build_character_full_spec(character),
        (
            "High quality, production-ready portrait. "
            "Head to toe visible, standing in a neutral pose facing the camera. "
            "The background is a plain light gray radial gradient with no distractions. "
            "Lighting is soft and even from the front with minimal shadows. "
            "The entire figure should be sharp and in focus, shot at a straight-on "
            "eye-level angle with no dramatic perspective. "
            "Expression is neutral but engaged, eyes open, natural resting face. "
            "No text in the image."
        ),
        _build_safety_guidelines_prompt(
            instructions=(
                "Do not depict any celebrity or real person. "
                "Describe only as a person with generic physical attributes. "
                "If the specified age is under 18, render as a young adult aged 18-20."
            )
        ),
        _compose_generation_rules(generation_rules),
    ]
    return "\n".join(p for p in parts if p)


# ---------------------------------------------------------------------------
# Character full spec (character-spec.prompt.ts)
# ---------------------------------------------------------------------------


def _build_character_full_spec(character: dict[str, Any]) -> str:
    """Build the full character specification from character attributes.

    Corresponds to ``buildCharacterFullSpec()`` in ``character-spec.prompt.ts``.
    """
    physical_traits: dict[str, Any] = character.get("physical_traits", {})
    state: dict[str, Any] = character.get("state", {}) or {}
    description: str = character.get("description", "")
    reference_id: str = character.get("reference_id", "")

    # ------------------------------------------------------------------
    # Appearance sentences
    # ------------------------------------------------------------------
    gender = physical_traits.get("gender", "non-binary")
    gender_label = "man" if gender == "male" else "woman" if gender == "female" else "non-binary-gender person"

    clothing: list[str] | None = physical_traits.get("clothing") or []
    clothing_str = ", ".join(clothing) if clothing else None

    accessories: list[str] | None = physical_traits.get("accessories") or []
    accessories_str = ", ".join(accessories) if accessories else None

    distinctive_features: list[str] | None = physical_traits.get("distinctiveFeatures") or []
    distinctive_str = "; ".join(distinctive_features) if distinctive_features else None

    appearance_notes: list[str] | None = physical_traits.get("appearanceNotes") or []
    appearance_notes_str = " ".join(appearance_notes) if appearance_notes else None

    # Build appearance sentences
    appearance_parts: list[str | None] = [
        description or None,
        _sentence_age_ethnicity_build(physical_traits, gender_label),
        _sentence_hair(physical_traits),
        _sentence_clothing(clothing_str),
        _sentence_accessories(accessories_str),
        _sentence_distinctive(distinctive_str),
        appearance_notes_str,
    ]
    appearance_sentences = " ".join(p for p in appearance_parts if p)

    # ------------------------------------------------------------------
    # State sentences
    # ------------------------------------------------------------------
    emotional_state: str | None = state.get("emotionalState")
    dirt_level: str | None = state.get("dirtLevel")
    moisture: str = _resolve_moisture(state)
    costume_condition: dict[str, Any] | None = state.get("costumeCondition") or {}
    hair_condition: dict[str, Any] | None = state.get("hairCondition") or {}
    injuries: list[dict[str, Any]] | None = state.get("injuries") or []

    physical_condition_parts: list[str] = []
    if dirt_level and dirt_level != "clean":
        physical_condition_parts.append(f"visibly {dirt_level.replace('_', ' ')}")
    if moisture != "dry":
        physical_condition_parts.append(f"{moisture} with moisture")

    costume_condition_parts: list[str] = []
    tears: list[str] = costume_condition.get("tears") or []
    if tears:
        costume_condition_parts.append(f"torn at the {' and '.join(tears)}")
    stains: list[str] = costume_condition.get("stains") or []
    if stains:
        costume_condition_parts.append(f"stained with {' and '.join(stains)}")
    damage: list[str] = costume_condition.get("damage") or []
    if damage:
        costume_condition_parts.append(f"damaged: {', '.join(damage)}")

    hair_condition_parts: list[str] = []
    hair_messiness: str | None = hair_condition.get("messiness") if hair_condition else None
    if hair_messiness and hair_messiness != "pristine":
        hair_condition_parts.append(f"{hair_messiness} hair")
    hair_wetness: str | None = hair_condition.get("wetness") if hair_condition else None
    if hair_wetness and hair_wetness != "dry":
        hair_condition_parts.append(f"{hair_wetness} hair")

    injury_parts: list[str] = []
    for i in injuries:
        sev = i.get("severity", "minor")
        typ = i.get("type", "injury")
        loc = i.get("location", "body")
        injury_parts.append(f"a {sev} {typ} on their {loc}")

    state_parts: list[str | None] = [
        _sentence_emotional(emotional_state),
        _sentence_physical_condition(physical_condition_parts),
        _sentence_costume_condition(costume_condition_parts),
        _sentence_hair_condition(hair_condition_parts),
        _sentence_injuries(injury_parts),
    ]
    state_sentences = " ".join(p for p in state_parts if p)

    # ------------------------------------------------------------------
    # Assemble full spec
    # ------------------------------------------------------------------
    spec_parts: list[str] = [
        appearance_sentences,
        state_sentences,
        f"Reference ID: {reference_id}",
    ]
    return " ".join(p for p in spec_parts if p)


def _resolve_moisture(state: dict[str, Any]) -> str:
    """Resolve the highest-priority moisture level from character state."""
    costume_cond = state.get("costumeCondition") or {}
    wetness: str = costume_cond.get("wetness", "dry")
    priority = ["drenched", "soaked", "heavy", "wet", "moderate", "damp", "slight", "dry"]
    return next((lvl for lvl in priority if lvl == wetness), "dry")


# ---------------------------------------------------------------------------
# Sentence builders (small helpers for readability)
# ---------------------------------------------------------------------------


def _sentence_age_ethnicity_build(physical_traits: dict[str, Any], gender_label: str) -> str | None:
    age: str = physical_traits.get("age", "")
    ethnicity: str = physical_traits.get("ethnicity", "")
    build: str = physical_traits.get("build", "average")
    if not age and not ethnicity:
        return None
    return f"A {age}-year-old {ethnicity + ' ' if ethnicity else ''}{gender_label} with a {build} build."


def _sentence_hair(physical_traits: dict[str, Any]) -> str | None:
    hair: str = physical_traits.get("hair", "")
    return f"Their hair is {hair}." if hair else None


def _sentence_clothing(clothing_str: str | None) -> str | None:
    return f"They are wearing {clothing_str}." if clothing_str else None


def _sentence_accessories(accessories_str: str | None) -> str | None:
    return f"They are accessorized with {accessories_str}." if accessories_str else None


def _sentence_distinctive(distinctive_str: str | None) -> str | None:
    return f"Distinctive features include {distinctive_str}." if distinctive_str else None


def _sentence_emotional(emotional_state: str | None) -> str | None:
    return f"Their expression conveys {emotional_state}." if emotional_state else None


def _sentence_physical_condition(parts: list[str]) -> str | None:
    return f"They are {', '.join(parts)}." if parts else None


def _sentence_costume_condition(parts: list[str]) -> str | None:
    return f"Their clothing is {', '.join(parts)}." if parts else None


def _sentence_hair_condition(parts: list[str]) -> str | None:
    return f"Their hair is {' and '.join(parts)}." if parts else None


def _sentence_injuries(parts: list[str]) -> str | None:
    return f"They have {', '.join(parts)}." if parts else None


# ---------------------------------------------------------------------------
# Safety guidelines (safety-guidelines.prompt.ts)
# ---------------------------------------------------------------------------

PROMPT_VERSION = "1.0.0"


def _build_safety_guidelines_prompt(
    instructions: str | None = None,
    original_prompt: str | None = None,
    error_message: str | None = None,
) -> str:
    """Build safety guidelines to prevent policy-violating content generation.

    Corresponds to ``buildSafetyGuidelinesPrompt()``.
    """
    parts: list[str] = [
        instructions or "",
        (
            "Avoid violating AI usage guidelines: "
            "Do not depict any celebrity or real person, children, violence, "
            "or other sensitive content. Describe people using only generic "
            "physical attributes. Describe children as young adults. "
            "Keep the visual style, action, and lighting instructions intact."
        ),
        f"Error message: {error_message}" if error_message else "",
        f"original_prompt: {original_prompt}" if original_prompt else "",
    ]
    return "\n".join(p for p in parts if p)


# ---------------------------------------------------------------------------
# Generation rules (prompt.utils.ts → composeGenerationRules)
# ---------------------------------------------------------------------------


def _compose_generation_rules(rules: list[str] | None) -> str:
    """Format generation rules as a bullet list.

    Corresponds to ``composeGenerationRules()``.
    """
    if not rules:
        return ""
    items = "\n".join(f"\u2022 {r}" for r in rules)
    return f"Output rules:\n{items}\n"


def print_safety_error_codes() -> str:
    """Return a reference string of known safety error codes.

    Useful for debugging safety-violation rejections from image models.
    """
    return (
        "Safety Error Codes:\n"
        "- 58061214, 17301594: Child - Rejects content depicting children\n"
        "- 29310472, 15236754: Celebrity - Rejects photorealistic celebrity depictions\n"
        "- 64151117, 42237218: Video safety violation\n"
        "- 62263041: Dangerous content\n"
        "- 57734940, 22137204: Hate - Hate-related topics\n"
        "- 74803281, 29578790, 42876398: Other miscellaneous safety issues\n"
        "- 92201652: Personal information - PII detected\n"
        "- 89371032, 49114662, 72817394: Prohibited content\n"
        "- 90789179, 63429089, 43188360: Sexual content\n"
        "- 78610348: Toxic content\n"
        "- 61493863, 56562880: Violence\n"
        "- 32635315: Vulgar content"
    )


__all__ = [
    "PROMPT_VERSION",
    "build_character_full_spec",
    "build_character_image_prompt",
    "build_safety_guidelines_prompt",
    "print_safety_error_codes",
]


# Legacy alias for backward compatibility with TS naming
build_character_full_spec = _build_character_full_spec
build_safety_guidelines_prompt = _build_safety_guidelines_prompt
