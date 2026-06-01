"""Generate Characters Tool Component.

Calls an LLM with structured output to generate character attributes matching the
shared ``CharacterAttributes`` schema, persists them to the database (dual-write:
relational ``characters`` table + ``folder.storyboard["characters"]`` JSON),
generates reference images in the background via an optional image model, and
returns structured character data.

The component is an ``LCToolComponent`` — it can be placed directly in a flow
(``run_model`` → ``Data``) or wired as a tool for an agent (``build_tool`` →
``StructuredTool``).
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import select

from px.base.langchain_utilities.model import LCToolComponent
from px.base.models.unified_models import get_llm
from px.base.prompts.character_image_prompt import build_character_image_prompt
from px.components.helpers.create_flow_nodes import create_flow_nodes
from px.field_typing import Tool  # noqa: TC001 — needs runtime import for component framework
from px.io import IntInput, ModelInput, MultilineInput, Output
from px.schema.data import Data

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic schemas for LLM structured output
# (mirror the shared TS PhysicalTraits + CharacterAttributes shapes)
# ---------------------------------------------------------------------------

CHARACTER_GENERATION_SYSTEM_PROMPT = """You are a character designer for a cinematic story.
Based on the user's story description, generate detailed, diverse characters with the following attributes:

For each character provide:
- **reference_id**: A narrative-scoped identifier (e.g. "luke_skywalker", "north_villain")
- **name**: A compelling character name
- **description**: Personality, background, and role in the story
- **aliases**: Any nicknames or alternative names
- **physical_traits**: Detailed physical appearance including hair, clothing, build, ethnicity, age, gender
- **state**: Initial character state (emotional state is the key field; other state fields can be empty)
- **guidance_level**: A number 1-5 indicating how closely the model should follow the specs (default 3)

Generate characters that are diverse in appearance, background, and role. Make them feel real and distinct."""


class PhysicalTraitsSchema(BaseModel):
    """Physical appearance traits matching ``character.types.ts`` ``PhysicalTraits``."""

    hair: str = Field(default="", description="Hairstyle, color, length, texture")
    clothing: list[str] = Field(default_factory=list, description="List of clothing items the character wears")
    accessories: list[str] = Field(default_factory=list, description="Accessories the character has")
    distinctiveFeatures: list[str] = Field(  # noqa: N815
        default_factory=list, description="Distinctive physical features (scars, tattoos, etc.)"
    )
    build: str = Field(default="average", description="Physique/build: e.g. athletic, slender, muscular, heavyset")
    ethnicity: str = Field(default="", description="Ethnicity description")
    age: str = Field(default="", description="Age (as string, e.g. 'mid-20s' or '35')")
    gender: str = Field(default="non-binary", description="Gender: male, female, or non-binary")
    appearanceNotes: list[str] = Field(  # noqa: N815
        default_factory=list, description="Additional appearance details"
    )


class GeneratedCharacter(BaseModel):
    """Single generated character matching the ``Character`` DB model fields."""

    reference_id: str = Field(..., description="Narrative-scoped identifier e.g. luke_skywalker")
    name: str = Field(..., description="Character name")
    description: str = Field(..., description="Character description: personality, background, and role in the story")
    aliases: list[str] = Field(default_factory=list, description="Character aliases or nicknames")
    physical_traits: PhysicalTraitsSchema = Field(default_factory=PhysicalTraitsSchema)
    state: dict = Field(
        default_factory=dict, description="Character state JSON (emotionalState, dirtLevel, costumeCondition, etc.)"
    )
    guidance_level: int | None = Field(default=None, description="Guidance level 1-5")


class GeneratedCharacterList(BaseModel):
    """Outer wrapper with a single list field for structured output compatibility."""

    characters: list[GeneratedCharacter] = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Generated characters",
    )


# ---------------------------------------------------------------------------
# Component
# ---------------------------------------------------------------------------


class GenerateCharactersToolComponent(LCToolComponent):
    """Generates structured character data via LLM and persists to the database."""

    display_name = "Generate Characters"
    name = "GenerateCharacters"
    icon = "user-plus"
    category = "tools"

    inputs = [
        ModelInput(
            name="model",
            display_name="Language Model",
            info="The language model used to generate character attributes.",
            required=True,
        ),
        ModelInput(
            name="image_model",
            display_name="Image Model",
            model_type="image_generation",
            info="Optional image model for generating character reference portraits.",
            required=False,
        ),
        MultilineInput(
            name="input_value",
            display_name="Character Description",
            info="Describe your story and characters. The LLM will generate detailed character profiles.",
            required=True,
        ),
        IntInput(
            name="character_count",
            display_name="Number of Characters",
            value=5,
            info="How many characters to generate (1-20).",
        ),
    ]

    outputs = [
        Output(name="api_run_model", display_name="Characters", method="run_model"),
        Output(name="api_build_tool", display_name="Tool", method="build_tool"),
    ]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def build_tool(self) -> Tool:
        """Return a ``StructuredTool`` for agent injection.

        The tool accepts ``prompt`` and ``count`` arguments and returns a
        JSON-encoded list of generated character dicts.
        """
        # Resolve the LLM and image LLM once at tool build time so the tool
        # function can close over them.
        llm = self._resolve_llm()
        image_llm = self._resolve_image_llm()
        self_status = self  # capture for event_manager etc.

        async def _tool_func(prompt: str, count: int = 5) -> str:
            """Generate characters for the given story prompt."""
            return json.dumps(
                self_status._run_generation_pipeline(
                    llm=llm,
                    image_llm=image_llm,
                    prompt=prompt,
                    count=count,
                ),
                default=str,
            )

        return StructuredTool.from_function(
            name="generate_characters",
            description=(
                "Generates detailed characters for a story using an LLM, "
                "saves them to the database, and optionally generates reference "
                "images. Accepts a story prompt and character count. "
                "Returns a JSON list of character objects."
            ),
            args_schema=self._build_tool_args_schema(),
            func=lambda _prompt, _count=5: (  # sync fallback (should not be used)
                "Synchronous execution is not supported; use async invocation."
            ),
            coroutine=_tool_func,
        )

    def run_model(self) -> Data:
        """Execute character generation directly as a flow component."""
        llm = self._resolve_llm()
        image_llm = self._resolve_image_llm()
        characters = self._run_generation_pipeline(
            llm=llm,
            image_llm=image_llm,
            prompt=self.input_value,
            count=self.character_count,
        )
        return Data(data={"characters": characters})

    # ------------------------------------------------------------------
    # Core pipeline
    # ------------------------------------------------------------------

    def _run_generation_pipeline(
        self,
        llm: Any,
        prompt: str,
        count: int,
        image_llm: Any | None = None,
    ) -> list[dict[str, Any]]:
        """Run the full character generation pipeline.

        1. Call LLM with structured output.
        2. Persist to database (relational + storyboard JSON).
        3. Create optimistic UI nodes.
        4. Dispatch background image generation.
        """
        # Step 1 — Generate via LLM
        generated = self._call_llm_structured(llm=llm, prompt=prompt, count=count)

        # Step 2 — Persist
        project_id = self._resolve_project_id()
        characters = self._persist_characters(
            characters_data=generated,
            project_id=project_id,
        )

        # Step 3 — Optimistic UI nodes
        flow_id, event_manager = self._resolve_flow_context()

        # Debug log for project context (user-facing via log)
        project_name = self.get_project_name()
        self.log(
            f"Generated {len(characters)} character(s) for project '{project_name}'.",
            name="generate_characters",
        )

        if event_manager:
            self._create_optimistic_nodes(characters=characters, flow_id=flow_id, event_manager=event_manager)

        # Step 4 — Background image generation
        if image_llm:
            self._schedule_image_gen(
                characters=characters,
                image_llm=image_llm,
                flow_id=flow_id,
                event_manager=event_manager,
            )

        return characters

    # ------------------------------------------------------------------
    # LLM invocation
    # ------------------------------------------------------------------

    def _resolve_llm(self) -> Any:
        """Resolve the language model from component inputs."""
        return get_llm(model=self.model, user_id=self.user_id)

    def _resolve_image_llm(self) -> Any | None:
        """Resolve the image model from component inputs, or return ``None``."""
        if not self.image_model:
            return None
        try:
            return get_llm(model=self.image_model, user_id=self.user_id)
        except Exception:
            logger.exception("Failed to initialise image model — image generation disabled")
            return None

    def _call_llm_structured(
        self,
        llm: Any,
        prompt: str,
        count: int,
    ) -> list[dict[str, Any]]:
        """Invoke the LLM with structured output and return character dicts.

        Returns:
        -------
        A list of character dicts with keys matching ``CharacterBase`` columns.
        """
        count = max(1, min(count or 5, 20))

        # Build the outer schema with ``count`` forced via field info
        outer_schema = self._build_count_constrained_schema(count)

        if not hasattr(llm, "with_structured_output"):
            msg = (
                "The selected language model does not support structured output. "
                "Please choose a model that supports function/tool calling "
                "(e.g. GPT-4o, Claude 3, Gemini)."
            )
            self.log(msg, name="error")
            raise TypeError(msg)

        try:
            structured_llm = llm.with_structured_output(outer_schema, method="function_calling")
            user_message = (
                f"Generate exactly {count} characters for the following story:\n\n{prompt}\n\n"
                f"Each character must have a unique reference_id and name. "
                f"Output exactly {count} characters."
            )
            result: GeneratedCharacterList = structured_llm.invoke(
                [
                    {"role": "system", "content": CHARACTER_GENERATION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ]
            )

            if not result or not result.characters:
                msg = "The LLM returned an empty character list. Please try again with a more detailed prompt."
                self.log(msg, name="error")
                raise ValueError(msg)

            # Serialise to dicts for DB storage
            return [c.model_dump(mode="json") for c in result.characters]

        except Exception as exc:
            msg = f"LLM character generation failed: {exc}"
            logger.exception(msg)
            self.log(msg, name="error")
            raise

    def _build_count_constrained_schema(self, count: int) -> type[BaseModel]:
        """Build a schema that constrains the character list to *count* items.

        Uses ``Field(min_length=count, max_length=count)`` to hint the LLM.
        """
        from pydantic import create_model

        return create_model(
            "GeneratedCharacterList",
            characters=(
                list[GeneratedCharacter],
                Field(
                    ...,
                    min_length=count,
                    max_length=count,
                    description=f"Exactly {count} characters.",
                ),
            ),
        )

    def _build_tool_args_schema(self) -> type[BaseModel]:
        """Build the Pydantic args schema for the ``StructuredTool``."""

        class _ToolArgs(BaseModel):
            prompt: str = Field(..., description="Story description for character generation")
            count: int = Field(default=5, ge=1, le=20, description="Number of characters to generate")

        _ToolArgs.__name__ = "GenerateCharactersInput"
        return _ToolArgs

    # ------------------------------------------------------------------
    # Database persistence (dual-write)
    # ------------------------------------------------------------------

    def _resolve_project_id(self) -> uuid.UUID | None:
        """Resolve the active project folder ID from the flow context."""
        flow_id = self.graph.flow_id if self.graph else None
        if not flow_id:
            logger.warning("No flow context available — cannot resolve project ID")
            return None

        from px.services.deps import get_db_service

        db_service = get_db_service()
        if not db_service:
            return None

        try:
            from portals.services.database.models.folder.model import Folder

            with db_service.with_session() as session:
                statement = select(Folder).where(Folder.flows.any(id=flow_id))
                folder = session.exec(statement).first()
                if folder:
                    return folder.id
                logger.warning("No project folder found for flow %s", flow_id)
                return None
        except Exception:
            logger.exception("Failed to resolve project ID for flow %s", flow_id)
            return None

    def _resolve_flow_context(self) -> tuple[str | None, Any]:
        """Return *(flow_id, event_manager)* from the graph context."""
        if not self.graph:
            return None, None
        flow_id = self.graph.flow_id
        # The event_manager is available as a private attribute on the component
        event_manager = getattr(self, "_event_manager", None) or getattr(self.graph, "event_manager", None)
        return flow_id, event_manager

    def _persist_characters(
        self,
        characters_data: list[dict[str, Any]],
        project_id: uuid.UUID | None,
    ) -> list[dict[str, Any]]:
        """Insert characters into the DB (dual-write: relational + storyboard JSON).

        Parameters
        ----------
        characters_data:
            List of character dicts from the LLM (snake_case keys).
        project_id:
            Target project folder ID.

        Returns:
        -------
        The same list of character dicts, now including the DB ``id`` field.
        """
        if not project_id:
            logger.warning("No project ID — returning characters without DB persistence")
            return characters_data

        from portals.services.database.models.character.model import Character

        from px.services.deps import get_db_service

        db_service = get_db_service()
        if not db_service:
            logger.warning("No DB service — returning characters without persistence")
            return characters_data

        persisted: list[dict[str, Any]] = []

        try:
            with db_service.with_session() as session:
                # --- Relational insert ---
                for char_dict in characters_data:
                    db_char = Character(
                        project_id=project_id,
                        reference_id=char_dict.get("reference_id", ""),
                        name=char_dict.get("name", "Unnamed"),
                        aliases=char_dict.get("aliases", []),
                        physical_traits=char_dict.get("physical_traits", {}),
                        state=char_dict.get("state", {}),
                        guidance_level=char_dict.get("guidance_level"),
                    )
                    session.add(db_char)
                    session.flush()  # assigns the ID without committing yet

                    dumped = {
                        "id": str(db_char.id),
                        "project_id": str(project_id),
                        "reference_id": db_char.reference_id,
                        "name": db_char.name,
                        "description": char_dict.get("description", ""),
                        "aliases": db_char.aliases,
                        "physical_traits": db_char.physical_traits,
                        "state": db_char.state,
                        "guidance_level": db_char.guidance_level,
                    }
                    persisted.append(dumped)

                # --- Storyboard JSON dual-write ---
                from portals.services.database.models.folder.model import Folder

                folder_statement = select(Folder).where(Folder.id == project_id)
                folder = session.exec(folder_statement).first()
                if folder:
                    if "characters" not in folder.storyboard:
                        folder.storyboard["characters"] = []
                    folder.storyboard["characters"].extend(persisted)
                    flag_modified(folder, "storyboard")
                    session.add(folder)

                session.commit()
                logger.info("Persisted %d characters (relational + storyboard)", len(persisted))

        except Exception:
            logger.exception("Failed to persist characters to database")
            # Fall back to returning data without DB IDs
            for char_dict in characters_data:
                char_dict["id"] = str(uuid.uuid4())
                char_dict["project_id"] = str(project_id) if project_id else ""
                persisted.append(char_dict)

        return persisted

    # ------------------------------------------------------------------
    # Optimistic UI nodes
    # ------------------------------------------------------------------

    def _create_optimistic_nodes(
        self,
        characters: list[dict[str, Any]],
        flow_id: str | None,  # noqa: ARG002 — available for future use (node metadata)
        event_manager: Any,
    ) -> None:
        """Create React Flow nodes for each character so the UI updates immediately."""
        nodes = []
        for i, char in enumerate(characters):
            entity_id = char.get("id", str(uuid.uuid4()))
            nodes.append(
                {
                    "id": f"characterNode-{entity_id}",
                    "type": "genericNode",
                    "position": {"x": 250, "y": 100 + i * 120},
                    "data": {
                        "id": f"characterNode-{entity_id}",
                        "type": "CharacterComponent",
                        "node": {
                            "display_name": char.get("name", "New Character"),
                            "status": "generating",
                            "character_id": entity_id,
                        },
                    },
                }
            )

        if nodes:
            create_flow_nodes(nodes=nodes, edges=[], event_manager=event_manager)
            logger.info("Created %d optimistic UI nodes for characters", len(nodes))

    # ------------------------------------------------------------------
    # Background image generation
    # ------------------------------------------------------------------

    def _schedule_image_gen(
        self,
        characters: list[dict[str, Any]],
        image_llm: Any,
        flow_id: str | None,
        event_manager: Any | None,
    ) -> None:
        """Dispatch background image generation for the given characters.

        This schedules an async task on the running event loop so that
        ``fire_and_forget_task`` is properly awaited.
        """
        if not image_llm or not characters:
            return

        async def _dispatch():
            from portals.services.deps import get_task_service

            task_service = get_task_service()
            if not task_service:
                logger.warning("No TaskService available — skipping background image gen")
                return

            await task_service.fire_and_forget_task(
                _generate_character_images_background,
                characters=characters,
                image_llm=image_llm,
                flow_id=flow_id,
                event_manager=event_manager,
            )

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_dispatch())  # noqa: RUF006 — fire-and-forget task intentionally not stored
            logger.info("Scheduled background image generation for %d characters", len(characters))
        except RuntimeError:
            logger.warning(
                "No running event loop — skipping background image generation. "
                "Characters are saved; image generation can be triggered separately."
            )


# ---------------------------------------------------------------------------
# Background task: image generation
# ---------------------------------------------------------------------------


async def _generate_character_images_background(
    characters: list[dict[str, Any]],
    image_llm: Any,
    flow_id: str | None,  # noqa: ARG001 — reserved for future event routing
    event_manager: Any | None,
) -> None:
    """Background task: generate reference images for characters.

    Called via ``TaskService.fire_and_forget_task`` — runs in a separate
    thread/process managed by AnyIO or Celery.
    """
    task_logger = logging.getLogger(f"{__name__}._generate_character_images_background")

    for char in characters:
        char_name = char.get("name", char.get("reference_id", "unknown"))
        char_id = char.get("id", "unknown")

        try:
            # Build the image prompt from the character data
            prompt = build_character_image_prompt(char)

            task_logger.info("Generating image for character '%s' (%s)", char_name, char_id)
            result = image_llm.invoke(prompt)

            # Extract image data from the result
            image_data = _extract_image_data(result)

            if image_data:
                task_logger.info("Image generated for character '%s' (%s)", char_name, char_id)

                # Emit UI update event
                if event_manager:
                    try:
                        event_manager.on_custom_event(
                            data={
                                "event_type": "entity_updated",
                                "payload": {
                                    "id": char_id,
                                    "type": "CharacterComponent",
                                    "data": {
                                        "character_image_generated": True,
                                        "image_data": image_data,
                                    },
                                },
                            }
                        )
                        task_logger.debug("Emitted entity_updated event for %s", char_id)
                    except Exception:
                        task_logger.exception("Failed to emit SSE event for character %s", char_id)
            else:
                task_logger.warning("Image model returned no usable result for '%s'", char_name)

        except Exception:
            task_logger.exception("Failed to generate image for character '%s' (%s)", char_name, char_id)
            # Emit error event so the UI can show a failure state
            if event_manager:
                try:
                    event_manager.on_custom_event(
                        data={
                            "event_type": "entity_error",
                            "payload": {
                                "id": char_id,
                                "type": "CharacterComponent",
                                "error": f"Image generation failed for {char_name}",
                            },
                        }
                    )
                except Exception:
                    task_logger.exception("Failed to emit error SSE event for character %s", char_id)


def _extract_image_data(result: Any) -> str | None:
    """Extract image data from the image model result.

    Handles various return types: ``bytes``, ``str`` (base64 / URL), or
    a ``dict`` with an ``image`` or ``data`` key.
    """
    if result is None:
        return None

    if isinstance(result, bytes):
        return result.hex()

    if isinstance(result, str):
        return result  # already base64 or URL

    if isinstance(result, dict):
        return result.get("image") or result.get("data") or str(result)

    try:
        return str(result)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Standalone factory for global tool injection
# ---------------------------------------------------------------------------


def make_generate_characters_tool(
    flow_id: uuid.UUID,
    event_manager: Any,
) -> StructuredTool:
    """Standalone factory: creates a ``StructuredTool`` for global assistant injection.

    Unlike the component's ``build_tool()``, this factory does not have access
    to a pre-configured model input. It resolves a default provisioned language
    model at call time and falls back to a clear error if none is available.

    Parameters
    ----------
    flow_id:
        The flow (project) context for DB lookups and UI events.
    event_manager:
        SSE event emitter for optimistic UI updates.

    Returns:
    -------
    A ``StructuredTool`` that generates characters via a default LLM.
    """

    async def _tool_func(prompt: str, count: int = 5) -> str:
        """Generate characters for the given story prompt.

        Returns a JSON-encoded list of character dicts (each includes the
        DB ``id`` and ``project_id`` fields).
        """
        # Resolve a default provisioned language model
        from px.base.models.unified_models import get_unified_models_detailed

        try:
            models_detailed = get_unified_models_detailed(model_type="language_model")
            if not models_detailed:
                return json.dumps(
                    {
                        "error": "No language model is provisioned. Configure a model provider in settings.",
                    }
                )
            # Pick the first available model
            model_selection = [models_detailed[0]]
        except Exception as exc:
            logger.exception("Failed to resolve default language model")
            return json.dumps({"error": f"Failed to resolve language model: {exc}"})

        try:
            llm = get_llm(model=model_selection, user_id=None)
        except Exception as exc:
            logger.exception("Failed to instantiate LLM")
            return json.dumps({"error": f"Failed to instantiate LLM: {exc}"})

        # Use a temporary component instance to run the pipeline
        # (we need _resolve_project_id and _persist_characters)
        import copy

        comp = GenerateCharactersToolComponent()
        comp.graph = copy.copy(comp.graph) if hasattr(comp, "graph") else None
        # We don't have a full component setup, so we resolve project context inline
        from portals.services.database.models.folder.model import Folder

        from px.services.deps import get_db_service

        project_id = None

        try:
            db_service = get_db_service()
            if db_service:
                with db_service.with_session() as session:
                    statement = select(Folder).where(Folder.flows.any(id=flow_id))
                    folder = session.exec(statement).first()
                    if folder:
                        project_id = folder.id
        except Exception:
            logger.exception("Failed to resolve project for global tool")

        # Generate characters via LLM
        from pydantic import create_model

        count = max(1, min(count or 5, 20))
        outer_schema = create_model(
            "GeneratedCharacterList",
            characters=(list[GeneratedCharacter], Field(..., min_length=count, max_length=count)),
        )

        try:
            structured_llm = llm.with_structured_output(outer_schema, method="function_calling")
            user_message = (
                f"Generate exactly {count} characters for: {prompt}\n\n"
                f"Each character must have a unique reference_id and name."
            )
            result = structured_llm.invoke(
                [
                    {"role": "system", "content": CHARACTER_GENERATION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ]
            )

            if not result or not result.characters:
                return json.dumps({"error": "LLM returned an empty character list."})

            characters_data = [c.model_dump(mode="json") for c in result.characters]

            # Persist to DB
            persisted = _persist_characters_static(
                characters_data=characters_data,
                project_id=project_id,
                flow_id=flow_id,
            )

            # Optimistic UI nodes
            if event_manager:
                nodes = []
                for i, char in enumerate(persisted):
                    entity_id = char.get("id", str(uuid.uuid4()))
                    nodes.append(
                        {
                            "id": f"characterNode-{entity_id}",
                            "type": "genericNode",
                            "position": {"x": 250, "y": 100 + i * 120},
                            "data": {
                                "id": f"characterNode-{entity_id}",
                                "type": "CharacterComponent",
                                "node": {
                                    "display_name": char.get("name", "New Character"),
                                    "status": "generating",
                                    "character_id": entity_id,
                                },
                            },
                        }
                    )
                if nodes:
                    create_flow_nodes(nodes=nodes, edges=[], event_manager=event_manager)

            return json.dumps(persisted, default=str)

        except Exception as exc:
            logger.exception("Global tool character generation failed")
            return json.dumps({"error": f"Character generation failed: {exc}"})

    return StructuredTool.from_function(
        name="generate_characters",
        description=(
            "Generates detailed characters for a story using an LLM, "
            "saves them to the database, and optionally generates reference "
            "images. Accepts a story prompt and character count. "
            "Returns a JSON list of character objects with their database IDs."
        ),
        args_schema=_build_global_tool_args(),
        func=lambda _prompt, _count=5: (  # sync fallback (should not be used)
            "Synchronous execution is not supported; use async invocation."
        ),
        coroutine=_tool_func,
    )


def _build_global_tool_args() -> type[BaseModel]:
    """Build the Pydantic args schema for the global injection tool."""

    class _ToolArgs(BaseModel):
        prompt: str = Field(..., description="Story description for character generation")
        count: int = Field(default=5, ge=1, le=20, description="Number of characters to generate")

    _ToolArgs.__name__ = "GenerateCharactersInput"
    return _ToolArgs


def _persist_characters_static(
    characters_data: list[dict[str, Any]],
    project_id: uuid.UUID | None,
    flow_id: uuid.UUID | None = None,  # noqa: ARG001 — reserved for future context propagation
) -> list[dict[str, Any]]:
    """Standalone DB persistence helper (used by the global tool factory).

    Same dual-write logic as ``GenerateCharactersToolComponent._persist_characters``
    but does not depend on a component instance.
    """
    if not project_id:
        # Fall back to generating IDs locally
        for char_dict in characters_data:
            char_dict["id"] = str(uuid.uuid4())
            char_dict["project_id"] = ""
        return characters_data

    from portals.services.database.models.character.model import Character
    from portals.services.database.models.folder.model import Folder

    from px.services.deps import get_db_service

    db_service = get_db_service()
    if not db_service:
        for char_dict in characters_data:
            char_dict["id"] = str(uuid.uuid4())
        return characters_data

    persisted: list[dict[str, Any]] = []

    try:
        with db_service.with_session() as session:
            for char_dict in characters_data:
                db_char = Character(
                    project_id=project_id,
                    reference_id=char_dict.get("reference_id", ""),
                    name=char_dict.get("name", "Unnamed"),
                    aliases=char_dict.get("aliases", []),
                    physical_traits=char_dict.get("physical_traits", {}),
                    state=char_dict.get("state", {}),
                    guidance_level=char_dict.get("guidance_level"),
                )
                session.add(db_char)
                session.flush()

                dumped = {
                    "id": str(db_char.id),
                    "project_id": str(project_id),
                    "reference_id": db_char.reference_id,
                    "name": db_char.name,
                    "description": char_dict.get("description", ""),
                    "aliases": db_char.aliases,
                    "physical_traits": db_char.physical_traits,
                    "state": db_char.state,
                    "guidance_level": db_char.guidance_level,
                }
                persisted.append(dumped)

            # Storyboard dual-write
            folder_statement = select(Folder).where(Folder.id == project_id)
            folder = session.exec(folder_statement).first()
            if folder:
                if "characters" not in folder.storyboard:
                    folder.storyboard["characters"] = []
                folder.storyboard["characters"].extend(persisted)
                flag_modified(folder, "storyboard")
                session.add(folder)

            session.commit()
            logger.info("Global tool: persisted %d characters (relational + storyboard)", len(persisted))

    except Exception:
        logger.exception("Global tool: failed to persist characters")
        for char_dict in characters_data:
            char_dict["id"] = str(uuid.uuid4())
            char_dict["project_id"] = str(project_id) if project_id else ""
            persisted.append(char_dict)

    return persisted
