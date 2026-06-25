import logging
from typing import Any

from portals.services.nap import get_nap_service

from px.base.models.model import LCModelComponent
from px.io import BoolInput, DictInput, MessageInput, ModelInput, Output, StrInput
from px.schema.data import Data
from px.schema.message import Message


async def _generate_and_ingest_avatar_background(payload: dict, image_llm: Any, event_manager: Any) -> None:
    """Background task to generate and ingest an avatar into NAP without blocking canvas execution."""
    logger = logging.getLogger(__name__)

    try:
        # 1. Build the visual prompt based on the resolved traits
        traits = payload.get("physical_traits", {})
        visual_prompt = f"A cinematic portrait of {payload.get('character_name', 'a character')}. Appearance: {traits}"

        # 2. Generate raw image bytes/hex via the image model
        result = await image_llm.ainvoke(visual_prompt)

        # Extract bytes from the result (adapt based on your specific image model's return signature)
        image_bytes = result if isinstance(result, bytes) else str(result).encode("utf-8")

        # 3. Call local Python FFI binding for NAP ingestion (returns sha256:<hex>)
        avatar_hash = get_nap_service().ingest_media(image_bytes, "image/png")

        # 4. Emit SSE event for the frontend
        if event_manager:
            event_manager.on_custom_event(
                {
                    "event_type": "entity_updated",
                    "payload": {"reference_id": payload.get("reference_id"), "avatar_hash": avatar_hash},
                }
            )

    except Exception as e:
        logger.exception(f"Failed to generate and ingest avatar for {payload.get('reference_id')}")
        if event_manager:
            event_manager.on_custom_event(
                {
                    "event_type": "entity_error",
                    "payload": {"reference_id": payload.get("reference_id"), "error": str(e)},
                }
            )


class CharacterComponent(LCModelComponent):
    display_name = "Character"
    description = "Design a character profile or generate a roleplay response."
    icon = "user"
    name = "Character"

    inputs = [
        # Model Configuration
        ModelInput(name="model", display_name="Language Model", required=True),
        ModelInput(name="image_model", display_name="Image Model", model_type="image_generation", required=False),
        # Action Toggles
        BoolInput(
            name="expand_character_description",
            display_name="Expand Character Description",
            value=False,
            info="If true, the LLM will fill in any empty physical traits or state fields based on the provided name/backstory.",
        ),
        BoolInput(
            name="generate_avatar",
            display_name="Generate Avatar",
            value=False,
            info="If true, generates a profile image in the background and uploads it to NAP assets.",
        ),
        # Core Narrative Fields (Driven by Frontend Draft State)
        StrInput(name="reference_id", display_name="Reference ID (NAP)", info="e.g. luke_skywalker"),
        StrInput(name="character_name", display_name="Name", value=""),
        StrInput(name="description", display_name="Backstory & Description", value=""),
        DictInput(name="physical_traits", display_name="Physical Traits (JSON)"),
        DictInput(name="state", display_name="State (JSON)"),
        # Roleplay Input
        MessageInput(
            name="input_value", display_name="Chat Input", info="Message to send to the character for roleplay."
        ),
    ]

    outputs = [
        Output(display_name="Character Data", name="character_data", method="build_character_data"),
        Output(display_name="Character Response", name="character_response", method="generate_roleplay_response"),
    ]

    async def build_character_data(self) -> Data:
        """Path A: Assemble character profile and selectively expand missing fields via LLM."""
        # 1. Assemble baseline payload from draft inputs
        payload = {
            "reference_id": getattr(self, "reference_id", ""),
            "character_name": getattr(self, "character_name", ""),
            "description": getattr(self, "description", ""),
            "physical_traits": getattr(self, "physical_traits", {}) or {},
            "state": getattr(self, "state", {}) or {},
        }

        # 2. Expansion via structured output (strict NAP v2 schema compliance)
        if getattr(self, "expand_character_description", False):
            llm = self._resolve_llm()
            # Enforce the Pydantic schema to prevent loose JSON
            structured_llm = llm.with_structured_output(PhysicalTraitsSchema, method="function_calling")

            prompt = (
                f"You are a character designer. Flesh out the physical traits and state "
                f"for the character '{payload['character_name']}'.\n\n"
                f"Backstory/Description:\n{payload['description']}\n\n"
                f"Only infer values for fields that are currently missing. Do not overwrite "
                f"existing data. Return the structured profile."
            )

            result = await structured_llm.ainvoke(prompt)
            # Serialize the Pydantic object back to a dictionary
            generated_traits = result.model_dump(mode="json") if hasattr(result, "model_dump") else result

            # Merge generated traits over existing ones (existing data takes priority)
            payload["physical_traits"] = {**generated_traits, **payload["physical_traits"]}

        # 3. Avatar Dispatch (Background task to prevent blocking the UI)
        image_llm = self._resolve_image_llm()
        if getattr(self, "generate_avatar", False) and image_llm:
            # Turn off the toggle in the returned payload so it doesn't infinite-loop on next evaluation
            payload["generate_avatar"] = False

            from px.services.deps import get_task_service

            task_service = get_task_service()

            if task_service:
                await task_service.fire_and_forget_task(
                    _generate_and_ingest_avatar_background,
                    payload=payload,
                    image_llm=image_llm,
                    event_manager=getattr(self, "_event_manager", None) or getattr(self.graph, "event_manager", None),
                )

        # 4. Return payload for Zustand draftData update
        return Data(data=payload)

    async def generate_roleplay_response(self) -> Message:
        """Path B: Generate a conversational reply using the drafted character state."""
        # 1. Gather live draft state directly from inputs
        char_name = getattr(self, "character_name", "Unknown Character")
        desc = getattr(self, "description", "")
        traits = getattr(self, "physical_traits", {})
        state = getattr(self, "state", {})

        # 2. Compile System Prompt
        system_prompt = (
            f"You are roleplaying as {char_name}. "
            f"Background: {desc}. "
            f"Physical Traits: {traits}. "
            f"State: {state}. "
            f"Respond in character. Never break character."
        )

        llm = self._resolve_llm()
        input_value = getattr(self, "input_value", "")

        # 3. Invoke LLM and return Message
        result = await self.get_chat_result(
            runnable=llm,
            stream=getattr(self, "stream", False),
            input_value=input_value,
            system_message=system_prompt,
        )

        self.status = result
        return result

    # --- Internal Resolvers ---

    def _resolve_llm(self) -> Any:
        from px.base.models.unified_models import get_llm

        return get_llm(model=self.model, user_id=self.user_id)

    def _resolve_image_llm(self) -> Any:
        if not getattr(self, "image_model", None):
            return None
        from px.base.models.unified_models import get_llm

        return get_llm(model=self.image_model, user_id=self.user_id)
