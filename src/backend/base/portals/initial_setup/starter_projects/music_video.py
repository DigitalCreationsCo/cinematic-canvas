from px.components.input_output import ChatInput, ChatOutput
from px.components.models_and_agents import PromptComponent
from px.components.openai.openai_chat_model import OpenAIModelComponent
from px.graph import Graph


def music_video_graph(template: str | None = None):
    if template is None:
        template = """Build the user input and audio input into a music video:

User: {user_input}
"""
    chat_input = ChatInput()
    prompt_component = PromptComponent()
    prompt_component.set(
        template=template,
        user_input=chat_input.message_response,
    )

    openai_component = OpenAIModelComponent()
    openai_component.set(input_value=prompt_component.build_prompt)

    chat_output = ChatOutput()
    chat_output.set(input_value=openai_component.text_response)

    return Graph(start=chat_input, end=chat_output)
