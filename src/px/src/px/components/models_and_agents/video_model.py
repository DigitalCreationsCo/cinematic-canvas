from px.base.data.utils import IMG_FILE_TYPES
from px.base.models.model import LCModelComponent
from px.base.models.unified_models import (
    get_llm,
    get_video_generation_model_options,
    handle_model_input_update,
)
from px.base.models.watsonx_constants import IBM_WATSONX_URLS
from px.field_typing.constants import LanguageModel
from px.field_typing.range_spec import RangeSpec
from px.inputs.inputs import DropdownInput, StrInput
from px.io import (
    FileInput,
    IntInput,
    MessageTextInput,
    ModelInput,
    SecretStrInput,
    SliderInput,
)

DEFAULT_OLLAMA_URL = "http://localhost:11434"


class VideoModelComponent(LCModelComponent):
    display_name = "Video Model"
    description = "Runs a video generation model given a specified provider."
    documentation: str = "https://docs.portals.org/components-models"
    icon = "brain-circuit"
    category = "models"

    inputs = [
        ModelInput(
            name="model",
            model_type="video_generation",
            display_name="Video Model",
            info="Select your model provider",
            real_time_refresh=True,
            required=True,
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
        DropdownInput(
            name="base_url_ibm_watsonx",
            display_name="watsonx API Endpoint",
            info="The base URL of the API (IBM watsonx.ai only)",
            options=IBM_WATSONX_URLS,
            value=IBM_WATSONX_URLS[0],
            combobox=True,
            show=False,
            real_time_refresh=True,
        ),
        StrInput(
            name="project_id",
            display_name="watsonx Project ID",
            info="The project ID associated with the foundation model (IBM watsonx.ai only)",
            show=False,
            required=False,
        ),
        StrInput(
            name="ollama_base_url",
            display_name="Ollama API URL",
            info=f"Endpoint of the Ollama API (Ollama only). Defaults to {DEFAULT_OLLAMA_URL}",
            value=DEFAULT_OLLAMA_URL,
            show=False,
            real_time_refresh=True,
        ),
        FileInput(
            name="files",
            display_name="Files",
            file_types=IMG_FILE_TYPES,
            info="Image files to be sent with the message.",
            advanced=True,
            is_list=True,
            temp_file=True,
        ),
        SliderInput(
            name="temperature",
            display_name="Temperature",
            value=0.1,
            info="Controls randomness in responses",
            range_spec=RangeSpec(min=0, max=1, step=0.01),
            advanced=True,
        ),
        MessageTextInput(
            name="prompt",
            display_name="Prompt",
            info="The text prompt to generate the image from. Must be between 1-5000 characters.",
            required=True,
            tool_mode=True,
        ),
        MessageTextInput(
            name="aspect_ratio",
            display_name="Aspect Ratio",
            info="The aspect ratio of the generated image. Must be one of the following:\
                '1:1', '16:9', '21:9', '3:2', '2:3', '4:5', '5:4', '3:4', '4:3', '9:16', '9:21' \
                Default is 1:1.",
            required=False,
            tool_mode=True,
        ),
        IntInput(
            name="width",
            display_name="Width",
            info="The width of the image. Must be between 256-1920 pixels.",
            required=False,
        ),
        IntInput(
            name="height",
            display_name="Height",
            info="The height of the image. Must be between 256-1920 pixels.",
            required=False,
        ),
        IntInput(
            name="steps",
            display_name="Steps",
            info="The number of denoising steps. Must be between 1-90. \
                Higher values produce better quality images but take more time to generate.",
            required=False,
        ),
        MessageTextInput(
            name="negative_prompt",
            display_name="Negative Prompt",
            info="The text prompt to avoid in the generated image. \
                Must be between 1-5000 characters.",
            required=False,
            tool_mode=True,
            advanced=True,
        ),
        IntInput(
            name="seed",
            display_name="Seed",
            info="Makes generation deterministic.\
                Using the same seed and set of parameters will produce identical image each time.",
            required=False,
            tool_mode=True,
            advanced=True,
        ),
        IntInput(
            name="guidance",
            display_name="Guidance Scale",
            info="Higher guidance forces the model to better follow the prompt, \
                but may result in lower quality output. Must be between 1-28.",
            required=False,
            tool_mode=True,
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
        return handle_model_input_update(
            self,
            dict(build_config),
            field_value,
            field_name,
            cache_key_prefix="video_model_options",
            get_options_func=get_video_generation_model_options,
        )
