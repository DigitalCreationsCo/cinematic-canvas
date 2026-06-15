import json

from px.base.prompts.storyboard_enrichment_prompt import build_storyboard_enrichment_prompt


def build_scene_batch_prompt(
    input_value: str,
    initial_context: dict,
    schema: dict,
    title: str | None = None,
) -> str:
    """System prompt for Pass 2+: batched scene enrichment.

    Builds the enrichment prompt using the exact specification from
    ``composeStoryboardEnrichmentPrompt`` (``storyboard.prompt.ts``),
    which includes narrative intent, character actions & positions,
    emotional beats, musical context, and cinematographer/gaffer
    guidelines.

    Note that ``batch_num`` and ``total_batches`` are intentionally
    omitted here — they are only included in the **user message** (built
    by ``_generate_scene_batch``), not the system prompt, matching the
    TS pattern where batch context is passed per-turn.

    Parameters
    ----------
    title:
        Explicit project title.  Falls back to ``self.title`` (the
        component input) when not provided.

    Returns:
    -------
    The enrichment system-prompt string.
    """
    schema_json: str = json.dumps(schema.model_json_schema(), indent=2)

    # The narrative to enrich: use the user's creative prompt.
    # In the TS version this is the ``enhancedPrompt`` from prompt
    # expansion; here we use ``self.input_value`` directly since
    # expansion is handled by a separate component.
    effective_title = title if title is not None else (title or "")
    narrative = f"{effective_title}\n\n{input_value}" if effective_title else input_value

    return build_storyboard_enrichment_prompt(
        enhanced_prompt=narrative,
        characters=initial_context.get("characters", []),
        locations=initial_context.get("locations", []),
        schema=schema_json,
    )
