from __future__ import annotations

import contextlib
from copy import deepcopy
from pathlib import Path
from typing import TYPE_CHECKING, Any

from px.base.data.base_file import BaseFileComponent
from px.base.data.storage_utils import (
    parse_storage_path,
)
from px.base.data.utils import (
    AUDIO_FILE_TYPES,
    parallel_load_data,
    parse_text_file_to_data,
)

if TYPE_CHECKING:
    from px.schema.data import Data

from px.inputs import SortableListInput
from px.inputs.inputs import MessageTextInput, StrInput
from px.io import BoolInput, FileInput, IntInput, Output, SecretStrInput
from px.schema.dataframe import DataFrame  # noqa: TC001
from px.utils.validate_cloud import is_astra_cloud_environment


def _get_storage_location_options():
    """Get storage location options, filtering out Local if in Astra cloud environment."""
    all_options = [
        {"name": "AWS", "icon": "Amazon"},
        {"name": "Google Drive", "icon": "google"},
    ]
    if is_astra_cloud_environment():
        return all_options
    return [{"name": "Local", "icon": "hard-drive"}, *all_options]


class AudioFileComponent(BaseFileComponent):
    """File component with optional Docling processing (isolated in a subprocess)."""

    display_name = "Load Audio File"
    # description is now a dynamic property - see get_tool_description()
    _base_description = "Loads an audio file and analyses file metadata."
    documentation: str = "https://docs.portals.org/read-file"
    icon = "file-audio"
    name = "AudioFile"
    add_tool_output = True  # Enable tool mode toggle without requiring tool_mode inputs

    VALID_EXTENSIONS = [*AUDIO_FILE_TYPES]
    SUPPORTED_BUNDLE_EXTENSIONS = []

    _base_inputs = deepcopy(BaseFileComponent.get_base_inputs())

    for input_item in _base_inputs:
        if isinstance(input_item, FileInput) and input_item.name == "path":
            input_item.real_time_refresh = True
            input_item.tool_mode = False  # Disable tool mode for file upload input
            input_item.required = False  # Make it optional so it doesn't error in tool mode
            input_item.file_types = AUDIO_FILE_TYPES
            input_item.display_name = "Audio File"
            input_item.info = "The audio file to transcribe"
            input_item.is_list = False
            input_item.value = None
            break

    inputs = [
        MessageTextInput(
            name="audio_file_url",
            display_name="Audio File URL",
            info="The URL of the audio file to transcribe (Can be used instead of a File)",
            advanced=True,
        ),
        SortableListInput(
            name="storage_location",
            display_name="Storage Location",
            placeholder="Select Location",
            info="Choose where to read the file from.",
            options=_get_storage_location_options(),
            real_time_refresh=True,
            limit=1,
            value=[{"name": "Local", "icon": "hard-drive"}],
            advanced=True,
        ),
        *_base_inputs,
        StrInput(
            name="file_path_str",
            display_name="File Path",
            info=(
                "Path to the file to read. Used when component is called as a tool. "
                "If not provided, will use the uploaded file from 'path' input."
            ),
            show=False,
            advanced=True,
            tool_mode=True,  # Required for Toolset toggle, but _get_tools() ignores this parameter
            required=False,
        ),
        # AWS S3 specific inputs
        SecretStrInput(
            name="aws_access_key_id",
            display_name="AWS Access Key ID",
            info="AWS Access key ID.",
            show=False,
            advanced=False,
            required=True,
        ),
        SecretStrInput(
            name="aws_secret_access_key",
            display_name="AWS Secret Key",
            info="AWS Secret Key.",
            show=False,
            advanced=False,
            required=True,
        ),
        StrInput(
            name="bucket_name",
            display_name="S3 Bucket Name",
            info="Enter the name of the S3 bucket.",
            show=False,
            advanced=False,
            required=True,
        ),
        StrInput(
            name="aws_region",
            display_name="AWS Region",
            info="AWS region (e.g., us-east-1, eu-west-1).",
            show=False,
            advanced=False,
        ),
        StrInput(
            name="s3_file_key",
            display_name="S3 File Key",
            info="The key (path) of the file in S3 bucket.",
            show=False,
            advanced=False,
            required=True,
        ),
        # Google Drive specific inputs
        SecretStrInput(
            name="service_account_key",
            display_name="GCP Credentials Secret Key",
            info="Your Google Cloud Platform service account JSON key as a secret string (complete JSON content).",
            show=False,
            advanced=False,
            required=True,
        ),
        StrInput(
            name="file_id",
            display_name="Google Drive File ID",
            info=("The Google Drive file ID to read. The file must be shared with the service account email."),
            show=False,
            advanced=False,
            required=True,
        ),
        # Deprecated input retained for backward-compatibility.
        BoolInput(
            name="use_multithreading",
            display_name="[Deprecated] Use Multithreading",
            advanced=True,
            value=True,
            info="Set 'Processing Concurrency' greater than 1 to enable multithreading.",
        ),
        IntInput(
            name="concurrency_multithreading",
            display_name="Processing Concurrency",
            advanced=True,
            info="When multiple files are being processed, the number of files to process concurrently.",
            value=1,
        ),
    ]

    outputs = [
        Output(
            display_name="Audio Content",
            name="audio",
            method="load_files_message",
            tool_mode=True,
        ),
    ]

    # ------------------------------ Tool description with file names --------------

    def get_tool_description(self) -> str:
        """Return a dynamic description that includes the names of uploaded files.

        This helps the Agent understand which files are available to read.
        """
        base_description = "Loads and returns the content from uploaded files."

        # Get the list of uploaded file paths
        file_paths = getattr(self, "path", None)
        if not file_paths:
            return base_description

        # Ensure it's a list
        if not isinstance(file_paths, list):
            file_paths = [file_paths]

        # Extract just the file names from the paths
        file_names = []
        for fp in file_paths:
            if fp:
                name = Path(fp).name
                file_names.append(name)

        if file_names:
            files_str = ", ".join(file_names)
            return f"{base_description} Available files: {files_str}. Call this tool to read these files."

        return base_description

    @property
    def description(self) -> str:
        """Dynamic description property that includes uploaded file names."""
        return self.get_tool_description()

    async def _get_tools(self) -> list:
        """Override to create a tool without parameters.

        The Read File component should use the files already uploaded via UI,
        not accept file paths from the Agent (which wouldn't know the internal paths).
        """
        from langchain_core.tools import StructuredTool
        from pydantic import BaseModel

        # Empty schema - no parameters needed
        class EmptySchema(BaseModel):
            """No parameters required - uses pre-uploaded files."""

        async def read_files_tool() -> str:
            """Read the content of uploaded files."""
            try:
                result = self.load_files_message()
                return str(result)
            except (FileNotFoundError, ValueError, OSError, RuntimeError) as e:
                return f"Error reading files: {e}"

        description = self.get_tool_description()

        tool = StructuredTool(
            name="load_files_message",
            description=description,
            coroutine=read_files_tool,
            args_schema=EmptySchema,
            handle_tool_error=True,
            tags=["load_files_message"],
            metadata={
                "display_name": "Read File",
                "display_description": description,
            },
        )

        return [tool]

    # ------------------------------ UI helpers --------------------------------------

    def _path_value(self, template: dict) -> list[str]:
        """Return the list of currently selected file paths from the template."""
        return template.get("path", {}).get("file_path", [])

    def update_build_config(
        self,
        build_config: dict[str, Any],
        field_value: Any,
        field_name: str | None = None,
    ) -> dict[str, Any]:
        """Show/hide Advanced Parser and related fields based on selection context."""
        # Update storage location options dynamically based on cloud environment
        if "storage_location" in build_config:
            updated_options = _get_storage_location_options()
            build_config["storage_location"]["options"] = updated_options

        # Handle storage location selection
        if field_name == "storage_location":
            # Extract selected storage location
            selected = [location["name"] for location in field_value] if isinstance(field_value, list) else []

            # Hide all storage-specific fields first
            storage_fields = [
                "aws_access_key_id",
                "aws_secret_access_key",
                "bucket_name",
                "aws_region",
                "s3_file_key",
                "service_account_key",
                "file_id",
            ]

            for f_name in storage_fields:
                if f_name in build_config:
                    build_config[f_name]["show"] = False

            # Show fields based on selected storage location
            if len(selected) == 1:
                location = selected[0]

                if location == "Local":
                    # Show file upload input for local storage
                    if "path" in build_config:
                        build_config["path"]["show"] = True

                elif location == "AWS":
                    # Hide file upload input, show AWS fields
                    if "path" in build_config:
                        build_config["path"]["show"] = False

                    aws_fields = [
                        "aws_access_key_id",
                        "aws_secret_access_key",
                        "bucket_name",
                        "aws_region",
                        "s3_file_key",
                    ]
                    for f_name in aws_fields:
                        if f_name in build_config:
                            build_config[f_name]["show"] = True
                            build_config[f_name]["advanced"] = False

                elif location == "Google Drive":
                    # Hide file upload input, show Google Drive fields
                    if "path" in build_config:
                        build_config["path"]["show"] = False

                    gdrive_fields = ["service_account_key", "file_id"]
                    for f_name in gdrive_fields:
                        if f_name in build_config:
                            build_config[f_name]["show"] = True
                            build_config[f_name]["advanced"] = False
            # No storage location selected - show file upload by default
            elif "path" in build_config:
                build_config["path"]["show"] = True

        return build_config

    def update_outputs(self, frontend_node: dict[str, Any], field_name: str, field_value: Any) -> dict[str, Any]:  # noqa: ARG002
        """Dynamically show outputs based on file count/type and advanced mode."""
        if field_name not in ["path", "advanced_mode", "pipeline"]:
            return frontend_node

        template = frontend_node.get("template", {})
        paths = self._path_value(template)
        if not paths:
            return frontend_node

        frontend_node["outputs"] = []
        if len(paths) == 1:
            frontend_node["outputs"].append(
                Output(
                    display_name="Audio Content",
                    name="audio",
                    method="load_files_message",
                    tool_mode=True,
                ),
            )
            frontend_node["outputs"].append(
                Output(
                    display_name="File Path",
                    name="path",
                    method="load_files_path",
                    tool_mode=True,
                ),
            )
        else:
            # Multiple files => DataFrame output; advanced parser disabled
            frontend_node["outputs"].append(
                Output(
                    display_name="Files",
                    name="dataframe",
                    method="load_files",
                    tool_mode=True,
                )
            )

        return frontend_node

    # ------------------------------ Core processing ----------------------------------

    def _get_selected_storage_location(self) -> str:
        """Get the selected storage location from the SortableListInput."""
        if hasattr(self, "storage_location") and self.storage_location:
            if isinstance(self.storage_location, list) and len(self.storage_location) > 0:
                return self.storage_location[0].get("name", "")
            if isinstance(self.storage_location, dict):
                return self.storage_location.get("name", "")
        return "Local"  # Default to Local if not specified

    def _validate_and_resolve_paths(self) -> list[BaseFileComponent.BaseFile]:
        """Override to handle file_path_str input from tool mode and cloud storage.

        Priority:
        1. Cloud storage (AWS/Google Drive) if selected
        2. file_path_str (if provided by the tool call)
        3. path (uploaded file from UI)
        """
        storage_location = self._get_selected_storage_location()

        # Handle AWS S3
        if storage_location == "AWS":
            return self._read_from_aws_s3()

        # Handle Google Drive
        if storage_location == "Google Drive":
            return self._read_from_google_drive()

        # Handle Local storage
        # Check if file_path_str is provided (from tool mode)
        file_path_str = getattr(self, "file_path_str", None)
        if file_path_str:
            # Use the string path from tool mode
            from pathlib import Path

            from px.schema.data import Data

            # Use same resolution logic as BaseFileComponent (support storage paths)
            path_str = str(file_path_str)
            if parse_storage_path(path_str):
                try:
                    resolved_path = Path(self.get_full_path(path_str))
                except (ValueError, AttributeError):
                    resolved_path = Path(self.resolve_path(path_str))
            else:
                resolved_path = Path(self.resolve_path(path_str))

            if not resolved_path.exists():
                msg = f"File or directory not found: {file_path_str}"
                self.log(msg)
                if not self.silent_errors:
                    raise ValueError(msg)
                return []

            data_obj = Data(data={self.SERVER_FILE_PATH_FIELDNAME: str(resolved_path)})
            return [BaseFileComponent.BaseFile(data_obj, resolved_path, delete_after_processing=False)]

        # Otherwise use the default implementation (uses path FileInput)
        return super()._validate_and_resolve_paths()

    def _read_from_aws_s3(self) -> list[BaseFileComponent.BaseFile]:
        """Read file from AWS S3."""
        from px.base.data.cloud_storage_utils import (
            create_s3_client,
            validate_aws_credentials,
        )

        # Validate AWS credentials
        validate_aws_credentials(self)
        if not getattr(self, "s3_file_key", None):
            msg = "S3 File Key is required"
            raise ValueError(msg)

        # Create S3 client
        s3_client = create_s3_client(self)

        # Download file to temp location
        import tempfile

        # Get file extension from S3 key
        file_extension = Path(self.s3_file_key).suffix or ""

        with tempfile.NamedTemporaryFile(mode="wb", suffix=file_extension, delete=False) as temp_file:
            temp_file_path = temp_file.name
            try:
                s3_client.download_fileobj(self.bucket_name, self.s3_file_key, temp_file)
            except Exception as e:
                # Clean up temp file on failure
                with contextlib.suppress(OSError):
                    Path(temp_file_path).unlink()
                msg = f"Failed to download file from S3: {e}"
                raise RuntimeError(msg) from e

        # Create BaseFile object
        from px.schema.data import Data

        temp_path = Path(temp_file_path)
        data_obj = Data(data={self.SERVER_FILE_PATH_FIELDNAME: str(temp_path)})
        return [BaseFileComponent.BaseFile(data_obj, temp_path, delete_after_processing=True)]

    def _read_from_google_drive(self) -> list[BaseFileComponent.BaseFile]:
        """Read file from Google Drive."""
        import tempfile

        from googleapiclient.http import MediaIoBaseDownload

        from px.base.data.cloud_storage_utils import create_google_drive_service

        # Validate Google Drive credentials
        if not getattr(self, "service_account_key", None):
            msg = "GCP Credentials Secret Key is required for Google Drive storage"
            raise ValueError(msg)
        if not getattr(self, "file_id", None):
            msg = "Google Drive File ID is required"
            raise ValueError(msg)

        # Create Google Drive service with read-only scope
        drive_service = create_google_drive_service(
            self.service_account_key,
            scopes=["https://www.googleapis.com/auth/drive.readonly"],
        )

        # Get file metadata to determine file name and extension
        try:
            file_metadata = drive_service.files().get(fileId=self.file_id, fields="name,mimeType").execute()
            file_name = file_metadata.get("name", "download")
        except Exception as e:
            msg = (
                f"Unable to access file with ID '{self.file_id}'. "
                f"Error: {e!s}. "
                "Please ensure: 1) The file ID is correct, 2) The file exists, "
                "3) The service account has been granted access to this file."
            )
            raise ValueError(msg) from e

        # Download file to temp location
        file_extension = Path(file_name).suffix or ""
        with tempfile.NamedTemporaryFile(mode="wb", suffix=file_extension, delete=False) as temp_file:
            temp_file_path = temp_file.name
            try:
                request = drive_service.files().get_media(fileId=self.file_id)
                downloader = MediaIoBaseDownload(temp_file, request)
                done = False
                while not done:
                    _status, done = downloader.next_chunk()
            except Exception as e:
                # Clean up temp file on failure
                with contextlib.suppress(OSError):
                    Path(temp_file_path).unlink()
                msg = f"Failed to download file from Google Drive: {e}"
                raise RuntimeError(msg) from e

        # Create BaseFile object
        from px.schema.data import Data

        temp_path = Path(temp_file_path)
        data_obj = Data(data={self.SERVER_FILE_PATH_FIELDNAME: str(temp_path)})
        return [BaseFileComponent.BaseFile(data_obj, temp_path, delete_after_processing=True)]

    def process_files(
        self,
        file_list: list[BaseFileComponent.BaseFile],
    ) -> list[BaseFileComponent.BaseFile]:
        """Process input files.

        - Otherwise => standard parsing in current process (optionally threaded).
        """
        if not file_list:
            msg = "No files to process."
            raise ValueError(msg)

        def process_file_standard(file_path: str, *, silent_errors: bool = False) -> Data | None:
            try:
                return parse_text_file_to_data(file_path, silent_errors=silent_errors)
            except FileNotFoundError as e:
                self.log(f"File not found: {file_path}. Error: {e}")
                if not silent_errors:
                    raise
                return None
            except Exception as e:
                self.log(f"Unexpected error processing {file_path}: {e}")
                if not silent_errors:
                    raise
                return None

        # Standard multi-file (or single non-advanced) path
        concurrency = max(1, self.concurrency_multithreading)

        file_paths = [str(f.path) for f in file_list]
        self.log(f"Starting parallel processing of {len(file_paths)} files with concurrency: {concurrency}.")
        my_data = parallel_load_data(
            file_paths,
            silent_errors=self.silent_errors,
            load_function=process_file_standard,
            max_concurrency=concurrency,
        )
        return self.rollup_data(file_list, my_data)

    # ------------------------------ Output helpers -----------------------------------

    def load_files_helper(self) -> DataFrame:
        result = self.load_files()

        # Result is a DataFrame - check if it has any rows
        if result.empty:
            msg = "Could not extract content from the provided file(s)."
            raise ValueError(msg)

        # Check for error column with error messages
        if "error" in result.columns:
            errors = result["error"].dropna().tolist()
            if errors and not any(col in result.columns for col in ["text", "doc", "exported_content"]):
                raise ValueError(errors[0])

        return result
