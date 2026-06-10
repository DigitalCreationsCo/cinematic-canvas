"""Storyboard enrichment prompt — exactly mirrors src/shared/prompts/storyboard.prompt.ts.

Used in Pass 2+ of storyboard generation to enrich audio-anchored scene slots
with narrative intent, character actions & positions, emotional beats, musical
context, and cinematographer/gaffer specifications.
"""

from __future__ import annotations

from typing import Any

from px.base.prompts.character_spec_prompt import build_character_full_spec
from px.base.prompts.location_spec_prompt import build_location_full_spec
from px.base.prompts.role_cinematographer_prompt import build_cinematographer_guidelines
from px.base.prompts.role_gaffer_prompt import build_gaffer_guidelines

prompt_version: str = "0.1.0"


def build_storyboard_enrichment_prompt(
    enhanced_prompt: str,
    characters: list[dict[str, Any]],
    locations: list[dict[str, Any]],
    schema: str,
    audio_context: str | None = None,
) -> str:
    """Compose the storyboard enrichment prompt (Director + Cinematographer + Gaffer).

    Mirrors ``composeStoryboardEnrichmentPrompt`` in
    ``src/shared/prompts/storyboard.prompt.ts``.

    Parameters
    ----------
    enhanced_prompt:
        The expanded/creative narrative to enrich into a storyboard.
    characters:
        Established character dicts to use in scene enrichment.
    locations:
        Established location dicts to use in scene enrichment.
    schema:
        JSON string of the expected output schema (e.g. ``SceneBatch``).
    audio_context:
        Optional musical-context string derived from audio analysis (mood,
        intensity, tempo).

    Returns:
    -------
    The enrichment system-prompt string.
    """
    characters_block = "\n\n".join(build_character_full_spec(c) for c in (characters or []))
    locations_block = "\n\n".join(build_location_full_spec(loc) for loc in (locations or []))

    musical_context_block = f"\nMusical Context:\n{audio_context}" if audio_context else ""

    return (
        f"Enrich the following narrative into a storyboard for a cinematic video project.\n"
        f"Narrative:\n{enhanced_prompt}\n"
        f"{musical_context_block}\n"
        f"\n"
        f"Characters:\n{characters_block}\n"
        f"\n"
        f"Locations:\n{locations_block}\n"
        f"\n"
        f"For each scene, provide specifications:\n"
        f"\n"
        f"NARRATIVE INTENT (2-3 sentences):\n"
        f"- What happens in this scene (VISIBLE action only)\n"
        f"- Who is present and what they're doing\n"
        f"- What this moment means emotionally\n"
        f"\n"
        f"CHARACTER ACTIONS & POSITIONS:\n"
        f"- Character name: [Action] at [Position: left/center/right/foreground/background]\n"
        f"- Character name: [Action] at [Position]\n"
        f"(List all characters in scene)\n"
        f"\n"
        f"EMOTIONAL BEAT:\n"
        f'[Be specific: "mounting tension", "relief and joy", "quiet determination" - not "powerful"]\n'
        f"\n"
        f"MUSICAL CONTEXT (if provided):\n"
        f"- Mood: [From audio analysis]\n"
        f"- Intensity: [low/medium/high]\n"
        f"- Tempo: [slow/moderate/fast/very_fast]\n"
        f"\n"
        f"{build_cinematographer_guidelines()}\n"
        f"{build_gaffer_guidelines()}\n"
        f"\n"
        f"CONSTRAINTS:\n"
        f"- Focus on observable action (not internal states).\n"
        f"- Characters must be positioned clearly for cinematographer.\n"
        f"- Emotional beat must guide lighting and camera choices.\n"
        f"\n"
        f"OUTPUT FORMAT: \n"
        f"Format the storyboard into a JSON object matching this exact structure:\n"
        f"{schema}\n"
    )
