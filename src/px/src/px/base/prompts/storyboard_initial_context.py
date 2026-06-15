import json

from px.base.prompts.storyboard_vision_prompt import build_storyboard_vision_prompt


def build_initial_context_prompt(
    input_value: str,
    audio_segments: list | None,
    existing_entities: dict[str, list[dict]] | None = None,
    title: str | None = None,
) -> str:
    """System prompt for Pass 1: initial context (characters, locations, props, metadata).

    Existing entities from the database are injected so the LLM extends
    rather than duplicates previously authored content.

    Parameters
    ----------
    title:
        Explicit project title.  Falls back to ``self.title`` (the
        component input) when not provided.
    """
    existing_entities = existing_entities or {}
    existing_chars = existing_entities.get("characters") or []
    existing_locs = existing_entities.get("locations") or []
    existing_props = existing_entities.get("props") or []

    effective_title = title if title is not None else (title or "")
    base = build_storyboard_vision_prompt(
        title=effective_title,
        user_prompt=input_value,
        existing_characters=existing_chars,
        existing_locations=existing_locs,
    )

    audio_section = ""
    if audio_segments:
        last = audio_segments[-1]
        total_dur = last.get("endTime", last.get("duration", "unknown"))
        audio_section = (
            "\n\n## Audio Analysis Context\n"
            f"{len(audio_segments)} audio segments detected "
            f"(total duration: {total_dur}s).\n"
            f"Segments:\n{json.dumps(audio_segments, indent=2)}\n\n"
            "Use these segments to ground your characters, locations, and props "
            "in the audio narrative."
        )

    props_section = ""
    if existing_props:
        props_section = (
            "\n\n## Existing Props (from project database)\n"
            f"{json.dumps(existing_props, indent=2)}\n\n"
            "Reference these props in your scenes as needed. "
            "You may introduce new props if the narrative demands it."
        )

    return (
        f"{base}{audio_section}{props_section}\n\n"
        "## Task — Pass 1: Initial Context\n"
        "Generate ONLY the foundational storyboard elements listed below.\n"
        "Do NOT generate individual scenes; scene enrichment follows in the next pass.\n\n"
        "Required elements:\n"
        "  • **characters** — named individuals with referenceId, name, description, and traits\n"
        "  • **locations**  — distinct settings with referenceId, name, and description\n"
        "  • **props**      — key physical objects central to the narrative\n"
        "  • **metadata**   — title, genre, mood, tone, logline, and duration estimates"
    )
