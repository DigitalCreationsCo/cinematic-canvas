from typing import Any

from px.base.prompts.character_spec_prompt import build_character_full_spec
from px.base.prompts.location_spec_prompt import build_location_full_spec
from px.base.prompts.role_cinematographer_prompt import build_cinematographer_guidelines
from px.base.prompts.role_gaffer_prompt import build_gaffer_guidelines


def build_storyboard_vision_prompt(
    title: str,
    user_prompt: str,
    schema: str | None = None,
    audio_segments: list[dict[str, Any]] | None = None,
    total_duration: float | None = None,
    existing_characters: list[dict[str, Any]] | None = None,
    existing_locations: list[dict[str, Any]] | None = None,
) -> str:
    # Handle audio context safely
    if audio_segments:
        first_mood = audio_segments[0].get("mood", "N/A") if len(audio_segments) > 0 else "N/A"
        last_mood = audio_segments[-1].get("mood", "N/A") if len(audio_segments) > 0 else "N/A"
        audio_context = (
            f"Musical Structure: {len(audio_segments)} segments\n"
            f"Mood Range: {first_mood} → {last_mood}\n"
            f"Duration: {total_duration or 0}s"
        )
    else:
        audio_context = "Establish narrative pacing based on creative intent"

    # Safely evaluate list lengths
    char_len = len(existing_characters) if existing_characters is not None else 0
    loc_len = len(existing_locations) if existing_locations is not None else 0
    has_pre_existing_entities = char_len > 0 or loc_len > 0

    # Build the pre-existing entities section
    pre_existing_entities_section = ""
    if has_pre_existing_entities:
        char_section = ""
        if char_len > 0:
            formatted_chars = "\n\n".join(build_character_full_spec(c) for c in existing_characters)  # type: ignore[arg-type]
            char_section = f"\n\nCHARACTERS (use these as your protagonists/antagonists):\n{formatted_chars}"

        loc_section = ""
        if loc_len > 0:
            formatted_locs = "\n\n".join(build_location_full_spec(loc) for loc in existing_locations)  # type: ignore[arg-type]
            loc_section = f"\n\nLOCATIONS (use these as your primary settings):\n{formatted_locs}"

        pre_existing_entities_section = (
            f"\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"PRE-EXISTING ENTITIES (ANCHOR YOUR STORY)\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"The following characters and locations are already defined. "
            f"Anchor your story around them.\n"
            f"You MAY create complementary new characters/locations if the "
            f"narrative demands it (e.g., antagonists, supporting cast, new locations visited)."
            f"{char_section}"
            f"{loc_section}\n"
        )

    # Setup character requirements conditional text
    if has_pre_existing_entities:
        characters_section = (
            "Build upon the PRE-EXISTING CHARACTERS above. Define additional "
            "characters only if the narrative requires them "
            "(e.g., supporting roles, antagonists, crowd characters). "
            "Each additional character requires:\n"
            "Name: [Descriptive if unnamed]\n"
            "Age: [Specific number or range]\n"
            "Physical Build: [Height descriptor, body type]\n"
            "Face: [Shape, prominent features, skin tone - NO celebrity references]\n"
            "Hair: [Exact color, length, style]\n"
            "Clothing: [List specific garments with colors, fit, condition]\n"
            "Accessories: [Jewelry, bags, props]\n"
            "Emotional State: [How they feel entering this story]\n"
            "Character Arc: [What changes for them from start to end - 1 sentence]\n"
            "Key Actions: [3-5 specific VISIBLE things they DO]"
        )
    else:
        characters_section = (
            "CHARACTERS (Each character requires):\n"
            'Name: [Descriptive if unnamed: "The Surfer", "Lead Contestant"]\n'
            'Age: [Specific number or range like "28-30"]\n'
            "Physical Build: [Height descriptor, body type - be concrete]\n"
            "Face: [Shape, prominent features, skin tone - NO celebrity references]\n"
            "Hair: [Exact color, length, style, texture]\n"
            "Clothing: [List specific garments with colors, fit, condition]\n"
            "Accessories: [Jewelry, bags, props - list each item]\n"
            "Emotional State: [How they feel entering this story]\n"
            "Character Arc: [What changes for them from start to end - 1 sentence]\n"
            "Key Actions: [3-5 specific VISIBLE things they DO in the video]"
        )

    # Setup locations requirements conditional text
    if has_pre_existing_entities:
        locations_section = (
            "Build upon the PRE-EXISTING LOCATIONS above. Define additional "
            "locations only if the narrative requires them "
            "(e.g., new environments visited, contrasting settings). "
            "Each additional location requires:\n"
            "Name: [Specific place]\n"
            "Type: [Beach/urban street/warehouse/forest/etc.]\n"
            'Time of Day: [Exact time like "2:30 PM golden hour", "pre-dawn 5:45 AM"]\n'
            "Weather: [Clear/overcast/foggy/raining/snowing]\n"
            "Key Visual Elements: [List 5-7 specific things visible]\n"
            "Atmosphere: [Bustling/abandoned/tense/peaceful - concrete descriptor]\n"
            "Color Palette: [3-5 dominant colors]"
        )
    else:
        locations_section = (
            "LOCATIONS (Each location requires):\n"
            "Name: [Specific place]\n"
            "Type: [Beach/urban street/warehouse/forest/etc.]\n"
            'Time of Day: [Exact time like "2:30 PM golden hour", "pre-dawn 5:45 AM"]\n'
            "Weather: [Clear/overcast/foggy/raining/snowing]\n"
            'Key Visual Elements: [List 5-7 specific things visible: "palm trees", "graffiti wall", "wet pavement"]\n'
            "Atmosphere: [Bustling/abandoned/tense/peaceful - concrete descriptor]\n"
            "Color Palette: [3-5 dominant colors in this location]"
        )

    # Handle optional title fallback text
    title_fallback = (
        f'"{title}"'
        if title
        else "Generate a compelling, emotionally resonant title that fits the story's theme, tone, and intent."
    )

    # Handle optional schema text
    schema_section = (
        f"OUTPUT FORMAT: Structured storyboard matching the schema provided (JSON):\n  {schema}\n" if schema else ""
    )

    # Construct and return the full prompt string
    return (
        f"You are the DIRECTOR establishing the creative vision for a cinematic music video.\n\n"
        f"INPUT:\n"
        f"Creative Concept: {user_prompt}\n"
        f"{audio_context}\n"
        f"{pre_existing_entities_section}\n"
        f"OUTPUT REQUIRED (4 sections only):\n\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"1. CONCEPT & VISION (2-3 sentences)\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"- Title: {title_fallback}\n"
        f"- Logline: One sentence capturing the core story\n"
        f"- Visual Style: [Realistic/stylized/noir/vibrant/desaturated - pick one]\n"
        f"- Emotional Arc: [Beginning mood] → [Middle evolution] → [Ending resolution]\n"
        f"- Narrative Structure: [Linear/parallel storylines/flashback/circular - pick one each]\n\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"2. CHARACTERS\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"{characters_section}\n\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"3. LOCATIONS\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"{locations_section}\n\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"4. SCENE BEAT STRUCTURE\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"For each musical segment or narrative beat:\n\n"
        f"Scene ID: [Number]\n"
        f"Timing: [Start time]-[End time] ([Duration]s)\n"
        f"Musical Context: [Mood, intensity, tempo if audio provided]\n"
        f"Action: [What happens - 2 sentences max, VISIBLE action only]\n"
        f"Character Positions: [Who is where - left/center/right, foreground/background]\n"
        f"Emotional Beat: [What this moment conveys - be specific]\n\n"
        f"{build_cinematographer_guidelines()}\n"
        f"{build_gaffer_guidelines()}\n\n"
        f"CONSTRAINTS:\n"
        f'- NO philosophical language about "authenticity" or "being human".\n'
        f"- NO dialogue or sonic descriptions (this is VISUAL medium).\n"
        f'- NO vague terms like "powerful" or "impactful" - use concrete descriptors.\n'
        f"- NO celebrity likeness.\n"
        f'- If age < 18, describe as "young adult (20 years old)".\n'
        f"- Each scene action MUST be VISUALLY OBSERVABLE (no internal thoughts).\n"
        f"- Choose scene durations which most effectively serve the narrative - specified in seconds.\n"
        f"- It is not your job to generate urls - any urls, be sure to leave them empty or undefined.\n"
        f"- Focus on observable action (not internal states).\n"
        f"- Characters must be positioned clearly for cinematographer.\n"
        f"- Emotional beat must guide lighting and camera choices.\n\n"
        f"{schema_section}"
    )
