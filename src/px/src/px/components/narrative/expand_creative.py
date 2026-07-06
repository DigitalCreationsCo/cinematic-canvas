from px.base.models.model import LCModelComponent
from px.base.models.unified_models import (
    get_llm,
    handle_model_input_update,
)
from px.base.prompts.prompt_expansion_prompt import build_prompt_expansion_prompt
from px.field_typing import LanguageModel
from px.field_typing.range_spec import RangeSpec
from px.io import BoolInput, DropdownInput, MessageInput, MessageTextInput, ModelInput, SecretStrInput, SliderInput
from px.utils.constants import (
    MESSAGE_SENDER_AI,
    MESSAGE_SENDER_NAME_USER,
    MESSAGE_SENDER_USER,
)


class ExpandCreativePromptComponent(LCModelComponent):
    display_name = "Expand Creative Prompt"
    description = "Takes a simple idea and expands it into a detailed creative brief using a selected LLM."
    icon = "sparkles"
    documentation: str = "https://docs.portals.org/components-prompts"
    trace_type = "prompt"
    name = "Expand Creative Prompt"

    inputs = [
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
       MultilineInput(
            name="system_message",
            display_name="System Message",
            info="A system message that helps set the behavior of the assistant",
            advanced=False,
            value=build_prompt_expansion_prompt()
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
        BoolInput(
            name="use_double_brackets",
            display_name="Use Double Brackets",
            value=False,
            advanced=True,
            info="Use {{variable}} syntax instead of {variable}.",
            real_time_refresh=True,
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

    def build_model(self) -> LanguageModel:
        return get_llm(
            model=self.model,
            user_id=self.user_id,
            api_key=self.api_key,
            temperature=self.temperature,
            stream=self.stream,
            max_tokens=getattr(self, "max_tokens", None),
            watsonx_url=getattr(self, "base_url_ibm_watsonx", None),
            watsonx_project_id=getattr(self, "project_id", None),
            ollama_base_url=getattr(self, "ollama_base_url", None),
        )

    def update_build_config(self, build_config: dict, field_value: str, field_name: str | None = None):
        """Dynamically update build config with user-filtered model options."""
        return handle_model_input_update(self, build_config, field_value, field_name)
