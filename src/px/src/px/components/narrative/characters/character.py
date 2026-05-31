from portals.schema import Data
from portals.services.database.models.character.model import Character

from px.base.models.model import LCModelComponent
from px.components.narrative.base_entity import BaseEntityReadPatchComponent
from px.field_typing.range_spec import RangeSpec
from px.io import (
    BoolInput,
    DropdownInput,
    MessageInput,
    MessageTextInput,
    ModelInput,
    Output,
    SecretStrInput,
    SliderInput,
)
from px.utils.constants import (
    MESSAGE_SENDER_AI,
    MESSAGE_SENDER_NAME_USER,
    MESSAGE_SENDER_USER,
)


class CharacterComponent(BaseEntityReadPatchComponent, LCModelComponent):
    display_name = "Character"
    description = "Display and edit character details."
    icon = "user"
    name = "Character"
    minimized = True

    # Bind to the specific relational model and JSON key [cite: 110]
    entity_model = Character
    storyboard_key = "characters"

    def build_config(self):
        return {
            "selected_entity": {
                "display_name": "Select Character",
                "options": self.get_entity_options,  # Dynamic dropdown
                "refresh_button": True,
            },
            "update_database": {
                "display_name": "Patch Database?",
                "info": "If true, the character's record will be updated with the traits/state below.",
                "advanced": False,
            },
            # "physical_traits": {
            #     "display_name": "Patch Physical Traits (JSON)",
            #     "advanced": True,
            # },
            # "state": {
            #     "display_name": "Patch Narrative State (JSON)",
            #     "advanced": True,
            # },
        }

    inputs = [
        DropdownInput(name="selected_entity", display_name="Select Character"),
        BoolInput(name="update_database", display_name="Patch Database?", value=False),
        # MultilineInput(name="physical_traits", display_name="Patch Physical Traits (JSON)"),
        # MultilineInput(name="state", display_name="Patch Narrative State (JSON)"),
        ModelInput(
            name="model",
            display_name="Language Model",
            info="Select your model provider",
            real_time_refresh=True,
            required=True,
        ),
        MessageInput(
            name="input_value",
            display_name="Input",
            info="The input text to send to the model",
        ),
        BoolInput(
            name="should_store_message",
            display_name="Store Messages",
            info="Store the message in the history.",
            value=True,
            advanced=True,
        ),
        DropdownInput(
            name="sender",
            display_name="Sender Type",
            options=[MESSAGE_SENDER_AI, MESSAGE_SENDER_USER],
            value=MESSAGE_SENDER_USER,
            info="Type of sender.",
            advanced=True,
        ),
        MessageTextInput(
            name="sender_name",
            display_name="Sender Name",
            info="Name of the sender.",
            value=MESSAGE_SENDER_NAME_USER,
            advanced=True,
        ),
        MessageTextInput(
            name="session_id",
            display_name="Session ID",
            info="The session ID of the chat. If empty, the current session ID parameter will be used.",
            advanced=True,
        ),
        MessageTextInput(
            name="context_id",
            display_name="Context ID",
            info="The context ID of the chat. Adds an extra layer to the local memory.",
            value="",
            advanced=True,
        ),
        SliderInput(
            name="temperature",
            display_name="Temperature",
            value=0.5,
            info="Controls randomness in responses",
            range_spec=RangeSpec(min=0, max=1, step=0.01),
            advanced=True,
        ),
        BoolInput(
            name="stream",
            display_name="Stream",
            info="Whether to stream the response",
            value=False,
            advanced=True,
        ),
        MessageTextInput(
            name="tool_placeholder",
            display_name="Tool Placeholder",
            tool_mode=True,
            advanced=True,
            show=False,
            info="A placeholder input for tool mode.",
        ),
        SecretStrInput(
            name="api_key",
            display_name="API Key",
            info="Overrides global provider settings. Leave blank to use your pre-configured API Key.",
            required=False,
            show=True,
            real_time_refresh=True,
            advanced=True,
        ),
    ]

    outputs = [
        Output(display_name="Character Data", name="character_data", method="build"),
        Output(display_name="Character Response", name="character_response", method="build"),
    ]

    def build(self, selected_entity: str, *, update_database: bool, physical_traits: str, state: str) -> Data:
        # Package the canvas fields into a dict.
        # Note: You may want to add json.loads() here if your DB expects strict dicts for JSON columns.
        import json

        updated_data = {}
        if physical_traits:
            updated_data["physical_traits"] = json.loads(physical_traits)
        if state:
            updated_data["state"] = json.loads(state)

        # Pass to the Base engine to handle the dual-write patch and payload routing
        return self._execute_read_patch_logic(selected_entity, update_database, updated_data)
