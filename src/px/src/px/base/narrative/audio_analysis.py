"""Multimodal audio analysis via LLM.

Sends an audio file to the caller's configured Langchain LLM and
returns structured segments suitable for storyboard generation.

Consumer pattern
----------------
Pass the same ``llm`` instance that the calling component obtained from
``get_llm()``.  The analysis function never reaches into provider-specific
libraries — it always goes through the Langchain interface.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from px.log.logger import logger

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_AUDIO_ANALYSIS_SYSTEM_PROMPT: str = (
    "You are an expert musicologist and audio analyst. "
    "Analyze the provided audio file and return a JSON object with this exact structure:\n"
    "{\n"
    '  "bpm": <detected beats per minute as float or 0>,\n'
    '  "key_signature": "<musical key as string or '
    '>" ,\n'
    '  "segments": [\n'
    "    {\n"
    '      "startTime": <start time in seconds>,\n'
    '      "endTime": <end time in seconds>,\n'
    '      "duration": <duration in seconds>,\n'
    '      "mood": "<emotional tone e.g. aggressive, melancholic, triumphant>",\n'
    '      "intensity": "<low|medium|high>",\n'
    '      "type": "<lyrical|instrumental|transition|breakdown|solo|climax>",\n'
    '      "description": "<what a video director should know about this segment>"\n'
    "    }\n"
    "  ]\n"
    "}\n\n"
    "CRITICAL RULES:\n"
    "- Segments MUST cover the entire audio with zero gaps "
    "(segment[i].endTime == segment[i+1].startTime).\n"
    "- The first segment MUST start at 0.0.\n"
    "- Each segment duration must be >= 0.5s and <= 120s.\n"
    "- Use the user's creative context to describe segments from a "
    "storyboard director's perspective.\n"
    "- Return ONLY valid JSON — no markdown, no commentary."
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def analyze_audio_file(
    llm: Any,
    audio_file_path: str,
    user_prompt: str,
) -> list[dict[str, Any]] | None:
    """Analyze an audio file via the caller's configured Langchain LLM.

    The LLM is used as-is — this function never reaches into provider-specific
    libraries.  If the model does not support audio input the call will fail
    gracefully and return ``None``.

    Args:
        llm: A Langchain ``BaseLanguageModel`` instance obtained from
            ``get_llm()`` (or any compatible Langchain model).
        audio_file_path: Absolute or relative path to the audio file (mp3/wav).
        user_prompt: The creative narrative prompt providing context.

    Returns:
        A list of segment dicts (each with ``startTime``, ``endTime``,
        ``duration``, ``mood``, ``intensity``, ``type``, ``description``),
        or ``None`` if analysis could not be performed.
    """
    if not audio_file_path or not Path(audio_file_path).exists():
        logger.warning(f"Audio file not found at: {audio_file_path}")
        return None

    logger.info(f"Attempting audio analysis via LLM for: {audio_file_path}")
    return _analyze_via_llm(llm, audio_file_path, user_prompt)


# ---------------------------------------------------------------------------
# Langchain multimodal implementation
# ---------------------------------------------------------------------------


def _analyze_via_llm(
    llm: Any,
    audio_file_path: str,
    user_prompt: str,
) -> list[dict[str, Any]] | None:
    """Send audio to the configured Langchain LLM and parse the result.

    Uses ``HumanMessage`` with a ``"type": "file"`` content part, which
    works with Langchain model integrations that support file-based inputs
    (e.g. ``ChatGoogleGenerativeAI``).
    """
    try:
        from langchain_core.messages import HumanMessage

        mime_type = _guess_mime_type(audio_file_path)

        content_parts: list[dict[str, Any]] = [
            {"type": "text", "text": _AUDIO_ANALYSIS_SYSTEM_PROMPT},
            {
                "type": "file",
                "file_path": str(Path(audio_file_path).resolve()),
                "mime_type": mime_type,
            },
            {
                "type": "text",
                "text": f"User creative context: {user_prompt}\n\nReturn the JSON as instructed.",
            },
        ]

        message = HumanMessage(content=content_parts)
        response = llm.invoke([message])

        raw_text = _extract_text(response)
        if not raw_text:
            logger.warning("Audio analysis returned empty response.")
            return None

        return _parse_analysis_response(raw_text)

    except Exception as exc:  # noqa: BLE001
        logger.warning(
            f"Audio analysis via LLM failed ({exc!r}). "
            "The selected model may not support audio input. "
            "Continuing with prompt-only mode."
        )
        return None


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _guess_mime_type(file_path: str) -> str:
    """Map a file extension to an audio MIME type."""
    ext = Path(file_path).suffix.lower().lstrip(".")
    type_map = {
        "mp3": "audio/mp3",
        "wav": "audio/wav",
        "m4a": "audio/mp4",
        "flac": "audio/flac",
        "ogg": "audio/ogg",
        "aac": "audio/aac",
        "opus": "audio/opus",
        "webm": "audio/webm",
    }
    return type_map.get(ext, "audio/mp3")


def _extract_text(response: Any) -> str:
    """Safely extract text from a Langchain LLM response."""
    if hasattr(response, "content"):
        raw = response.content
        return raw if isinstance(raw, str) else str(raw or "")
    return str(response or "")


def _parse_analysis_response(raw_text: str) -> list[dict[str, Any]] | None:
    """Parse the LLM JSON response into a list of segment dicts.

    Handles markdown code fences and various JSON shapes.
    """
    # Strip markdown code fences
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        fence_indices = [i for i, line in enumerate(lines) if line.strip().startswith("```")]
        if len(fence_indices) >= 2:  # noqa: PLR2004
            start = fence_indices[0] + 1
            end = fence_indices[1]
            cleaned = "\n".join(lines[start:end]).strip()
        elif len(fence_indices) == 1:
            # Odd formatting — take everything after the opening fence
            cleaned = "\n".join(lines[fence_indices[0] + 1 :]).strip()
            # Remove trailing fence if present
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning(f"Audio analysis JSON parse failed: {exc}")
        return None

    # Extract segments from whatever shape we got
    if isinstance(result, dict):
        segments_raw = result.get("segments", [result])
    elif isinstance(result, list):
        segments_raw = result
    else:
        logger.warning(f"Unexpected audio analysis result type: {type(result).__name__}")
        return None

    if not isinstance(segments_raw, list) or not segments_raw:
        logger.warning("Audio analysis returned no segments.")
        return None

    return _normalize_segments(segments_raw)


def _normalize_segments(
    segments_raw: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Normalise raw segment dicts to a consistent shape."""
    normalized: list[dict[str, Any]] = []
    for seg in segments_raw:
        if not isinstance(seg, dict):
            continue
        start = float(seg.get("startTime", seg.get("start", 0)))
        end = float(seg.get("endTime", seg.get("end", start)))
        duration = float(seg.get("duration", 0))
        if duration <= 0:
            duration = end - start
        normalized.append(
            {
                "startTime": start,
                "endTime": end,
                "duration": max(duration, 0.5),
                "mood": str(seg.get("mood", "neutral")),
                "intensity": str(seg.get("intensity", "medium")),
                "type": str(seg.get("type", "lyrical")),
                "description": str(seg.get("description", seg.get("musicalDescription", ""))),
            }
        )

    return normalized
