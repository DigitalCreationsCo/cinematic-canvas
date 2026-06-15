"""Shared helpers for tolerating an LLM function-calling quirk where a
field that should be a JSON array/object comes back as a JSON-*encoded
string* instead.

Background
----------
Some models (observed with Gemini; a related case is reported for other
providers/serving stacks too — see e.g. ggml-org/llama.cpp#21384) will,
for certain array- or object-typed tool-call parameters, serialize the
value as a JSON string rather than emitting a native nested array/object.
Which level of a nested schema this happens at is inconsistent — it can
be the outer wrapper field (e.g. ``objects``), individual nested fields
(e.g. ``characters``/``locations``/``metadata``), or both, depending on
the call.

Neither Pydantic's lax-mode ``model_validate`` nor trustcall recover from
this automatically. trustcall's ``filter_state`` (see
``trustcall/_base.py``) calls ``schema.model_validate(tool_call["args"])``
directly with no pre-processing:

    responses.append(
        sch.model_validate(tc["args"])
        if hasattr(sch, "model_validate")
        else sch.parse_obj(tc["args"])
    )

A ``str`` where ``list[...]``/``dict`` is expected fails that
``model_validate`` call, the exception is swallowed, and the tool call is
dropped from ``responses``. Worse, because the stringification is a
deterministic serialization choice (not a one-off mistake), trustcall's
"ask the model to patch its output" retry loop tends to reproduce the
exact same shape on every attempt — exhausting ``max_attempts`` with a
permanently empty ``responses`` list, even though the model produced
complete, correctly-shaped data.

``coerce_json_string`` / ``make_json_tolerant`` / ``tolerant_list_field``
make the generated Pydantic models accept *either* the native type *or* a
JSON-encoded string of it, via a ``BeforeValidator``. Validation then
succeeds on the first attempt regardless of which level the model chose
to stringify, and no extra LLM round trips are spent on retries that were
never going to converge.

Usage
-----
Wrap any model produced by ``build_model_from_schema`` (or similar
dynamic-schema builders) before handing it to
``trustcall.create_extractor`` / ``llm.with_structured_output``::

    inner = make_json_tolerant(build_model_from_schema(schema_rows))
    wrapped = create_model(
        "MyWrapper",
        objects=(tolerant_list_field(inner), Field(min_length=1)),
    )
"""

from __future__ import annotations

import json
from typing import Annotated, Any, get_origin

from pydantic import BaseModel, BeforeValidator, create_model


def coerce_json_string(value: Any) -> Any:
    """If *value* is a JSON-encoded string of a list/dict, decode it.

    Anything else — including values that are already lists/dicts, or
    strings that don't look like JSON — passes through unchanged. This is
    intentionally permissive: if ``json.loads`` fails, the original string
    is returned as-is so normal Pydantic validation can produce its usual
    (informative) error rather than this helper masking a genuinely bad
    value.
    """
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith(("[", "{")):
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                pass
    return value


# Container types that an LLM might stringify instead of emitting natively.
_CONTAINER_ORIGINS = (list, dict, set, tuple, frozenset)


def make_json_tolerant(model: type[BaseModel]) -> type[BaseModel]:
    """Return a copy of *model* whose list/dict/set/tuple fields also
    accept a JSON-encoded string representation of their value.

    Intended for models produced by dynamic schema builders (e.g.
    ``build_model_from_schema``) whose field types are things like
    ``list[dict]`` or ``dict`` — exactly the shapes Gemini has been
    observed to stringify.

    Fields with other types (str, int, float, bool, nested BaseModels
    without a list/dict origin, etc.) are left untouched.
    """
    new_fields: dict[str, Any] = {}
    for field_name, field_info in model.model_fields.items():
        annotation = field_info.annotation
        origin = get_origin(annotation)
        if origin in _CONTAINER_ORIGINS or annotation in _CONTAINER_ORIGINS:
            annotation = Annotated[annotation, BeforeValidator(coerce_json_string)]
        new_fields[field_name] = (annotation, field_info)

    return create_model(
        model.__name__,
        __doc__=model.__doc__,
        __module__=model.__module__,
        **new_fields,
    )


def tolerant_list_field(inner: type[BaseModel]) -> Any:
    """Annotation for a ``list[inner]`` field that also accepts a
    JSON-encoded string of that list.

    Use as the type half of a ``create_model`` field tuple, e.g.::

        create_model(
            "Wrapper",
            objects=(tolerant_list_field(InnerModel), Field(min_length=1)),
        )
    """
    return Annotated[list[inner], BeforeValidator(coerce_json_string)]