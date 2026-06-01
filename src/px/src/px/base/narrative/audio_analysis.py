"""Multimodal audio analysis via LLM.

Sends an audio file to a multimodal LLM (Google Gemini or equivalent) and
returns structured segments suitable for storyboard generation.
"""

from __future__ import annotations

import json
import os
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
    """Analyze an audio file via a multimodal-capable LLM.

    Args:
        llm: A Langchain ``BaseLanguageModel`` instance (expected to be
            ``ChatGoogleGenerativeAI`` or similar multimodal model).
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

    # --- Route by provider ---
    # Google Gemini via Langchain integration
    model_class_name = type(llm).__name__
    if model_class_name == "ChatGoogleGenerativeAI":
        return _analyze_via_gemini_api(llm, audio_file_path, user_prompt)

    # Generic Langchain multimodal fallback (works with some providers)
    logger.info(
        f"LLM type '{model_class_name}' is not a recognised multimodal model. Attempting generic multimodal call…"
    )
    return _analyze_via_langchain_multimodal(llm, audio_file_path, user_prompt)


# ---------------------------------------------------------------------------
# Google Gemini implementation
# ---------------------------------------------------------------------------


def _analyze_via_gemini_api(
    llm: Any,
    audio_file_path: str,
    user_prompt: str,
) -> list[dict[str, Any]] | None:
    """Use the underlying ``google.genai.Client`` to upload & analyse audio.

    ``ChatGoogleGenerativeAI`` wraps ``google.genai.Client`` at ``llm.client``.
    We use it directly for the most reliable multimodal path.
    """
    client = getattr(llm, "client", None)
    model_name: str | None = getattr(llm, "model", None)

    if client is None or model_name is None:
        logger.warning("Gemini LLM missing client or model name — falling back.")
        return _analyze_via_langchain_multimodal(llm, audio_file_path, user_prompt)

    try:
        # Import Google SDK types (safe because we only reach here for Gemini)
        from google.genai import types

        # 1. Upload the audio file via Gemini's File API
        logger.debug("Uploading audio file to Gemini File API…")
        uploaded_file = client.files.upload(file=audio_file_path)
        logger.debug(f"Uploaded: {uploaded_file.uri} ({uploaded_file.mime_type})")

        # 2. Build the multimodal request
        system_text = _AUDIO_ANALYSIS_SYSTEM_PROMPT
        context_text = f"User creative context:\n{user_prompt}\n\nAnalyze this track and return the JSON as instructed."

        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_uri(
                            file_uri=uploaded_file.uri,
                            mime_type=uploaded_file.mime_type or "audio/mp3",
                        ),
                        types.Part.from_text(text=system_text),
                        types.Part.from_text(text=context_text),
                    ],
                )
            ],
            config=types.GenerateContentConfig(
                temperature=0.4,
                response_mime_type="application/json",
            ),
        )

        raw_text: str = response.text
        if not raw_text:
            logger.warning("Gemini audio analysis returned empty response.")
            return None

        return _parse_analysis_response(raw_text)

    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Gemini audio analysis failed ({exc!r}). Falling back to generic multimodal path.")
        return _analyze_via_langchain_multimodal(llm, audio_file_path, user_prompt)


# ---------------------------------------------------------------------------
# Generic Langchain multimodal fallback
# ---------------------------------------------------------------------------


def _analyze_via_langchain_multimodal(
    llm: Any,
    audio_file_path: str,
    user_prompt: str,
) -> list[dict[str, Any]] | None:
    """Attempt a multimodal call via generic Langchain ``HumanMessage``.

    This works with providers that accept ``"type": "file"`` in content parts
    (e.g. recent ``ChatGoogleGenerativeAI`` versions) or inline data.
    """
    try:
        from langchain_core.messages import HumanMessage

        mime_type = _guess_mime_type(audio_file_path)

        content_parts: list[dict[str, Any]] = [
            {"type": "text", "text": _AUDIO_ANALYSIS_SYSTEM_PROMPT},
            {
                "type": "file",
                "file_path": os.path.abspath(audio_file_path),
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
            logger.warning("Generic multimodal audio analysis returned empty response.")
            return None

        return _parse_analysis_response(raw_text)

    except Exception as exc:  # noqa: BLE001
        logger.warning(
            f"Generic multimodal audio analysis failed ({exc!r}). "
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
        fence_indices = [i for i, l in enumerate(lines) if l.strip().startswith("```")]
        if len(fence_indices) >= 2:
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
