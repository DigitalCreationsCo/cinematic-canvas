from core.events.broadcaster import LangflowPipelineEventBridge

# Import your core LangChain structured tool and your SSE Broadcaster
from core.tools.generate_characters import GenerateCharactersTool
from langflow.custom import Component
from langflow.io import MessageTextInput, Output, StringInput
from langflow.schema import Data
from langflow.services.deps import get_session


class GenerateCharactersComponent(Component):
    display_name = "Generate Characters"
    description = (
        "Parses a narrative prompt to create core project characters, saves them to the DB, and spawns canvas nodes."
    )
    icon = "users"

    # Define the inputs the user interacts with on the canvas
    inputs = [
        MessageTextInput(
            name="creative_prompt",
            display_name="Creative Prompt",
            info="The overarching narrative prompt to extract characters from.",
            required=True,
        ),
        StringInput(
            name="project_id",
            display_name="Project ID",
            info="The UUID of the current project workspace.",
            required=True,
        ),
    ]

    # Define the output handle that connects to downstream nodes (like 'Generate Scenes')
    outputs = [Output(display_name="Character Data", name="characters", method="build_characters")]

    async def build_characters(self) -> list[Data]:
        """The async execution block triggered by Langflow's graph engine."""
        project_id = self.project_id
        prompt = self.creative_prompt

        # 1. Notify the UI that processing has started
        await LangflowPipelineEventBridge.broadcast_pipeline_status(
            project_id=project_id,
            event_type="NODE_PROCESSING",
            status="running",
            message="Analyzing prompt and synthesizing characters...",
        )

        # 2. Instantiate and run your core structured tool
        # Passing the DB session if your tool handles its own DB inserts
        db_session = next(get_session())
        tool = GenerateCharactersTool(db_session=db_session)

        try:
            # Execute the core LLM logic
            # Expected to return a list of dictionaries containing character attributes & DB IDs
            generated_characters = await tool.arun(prompt=prompt, project_id=project_id)

            # 3. Broadcast to the frontend to optimistically create visual nodes
            await LangflowPipelineEventBridge.broadcast_pipeline_status(
                project_id=project_id,
                event_type="ENTITY_CREATED",
                status="completed",
                message=f"Successfully created {len(generated_characters)} characters.",
                payload={"entityType": "character", "entities": generated_characters},
            )

            # 4. Format the output for downstream Langflow nodes
            # Wrapping the raw dictionaries in Langflow's `Data` class allows them
            # to flow seamlessly along edges to the next component.
            output_data = [Data(data=char_dict) for char_dict in generated_characters]

            return output_data

        except Exception as e:
            # Handle failures gracefully and notify the UI
            error_msg = f"Character generation failed: {e!s}"
            await LangflowPipelineEventBridge.broadcast_pipeline_status(
                project_id=project_id, event_type="NODE_ERROR", status="failed", message=error_msg
            )
            raise RuntimeError(error_msg)
