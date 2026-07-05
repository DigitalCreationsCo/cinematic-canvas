from typing import Any

from px.base.data.utils import IMG_FILE_TYPES
from px.custom.custom_component.component import Component
from px.io import FileInput, StrInput
from px.schema import Data
from px.template.field.base import Output


class ImageLoaderComponent(Component):
    display_name = "Image"
    description = "Loads and renders an image directly on the canvas."
    icon = "image"
    name = "ImageLoader"

    inputs = [
        FileInput(
            name="image_file",
            display_name="Upload Image",
            file_types=IMG_FILE_TYPES,
            info="Upload an image file to display on the canvas.",
            required=False,
            show=True,
            real_time_refresh=True,
        ),
        StrInput(
            name="image_path",
            display_name="Image Path",
            info="Alternatively, provide a file path to an existing image.",
            required=False,
            show=True,
            real_time_refresh=True,
        ),
        # Hidden field that carries the v2 file_id so the frontend preview
        # (ImagePreviewField) can route to the /api/v2/files/images/{file_id}
        # endpoint. Without this, v2-uploaded files (whose paths have 3+
        # segments incompatible with the v1 /images/{flow_id}/{file_name}
        # route) fail to render on the canvas.
        StrInput(
            name="file_id",
            display_name="File ID",
            required=True,
            show=False,
            override_skip=True,
        ),
    ]

    outputs = [
        Output(display_name="Image Data", name="image_data", method="build_data"),
    ]

    def _hide_inputs(self, frontend_node: dict):
        template = frontend_node.get("template")
        if isinstance(template, dict) and "image_file" in template:
            template["image_file"]["show"] = False
        return frontend_node

    def _update_template(self, frontend_node: dict):
        # Sync image_path from image_file if needed
        image_provided = False
        if "template" in frontend_node:
            template = frontend_node["template"]
            image_file = template.get("image_file", {})
            image_path = template.get("image_path", {})

            # If image_file has a value but image_path doesn't, sync the path
            if image_file.get("value") and not image_path.get("value"):
                file_path = image_file.get("file_path", image_file.get("value"))
                template["image_path"]["value"] = file_path

            # Re-check after potential sync
            if image_file.get("value") or template.get("image_path", {}).get("value"):
                image_provided = True

        if image_provided:
            return self._hide_inputs(frontend_node)
        return frontend_node

    def update_outputs(self, frontend_node: dict, field_name: str, field_value: Any) -> dict:
        # 1 & 2. If image_file is uploaded, sync image_path with the file path
        if field_name == "image_file" and field_value:
            if "template" in frontend_node:
                # Extract the actual file path from the template's image_file.file_path
                # (field_value is only the file name, not the server path)
                file_path = frontend_node["template"].get("image_file", {}).get("file_path", field_value)
                frontend_node["template"]["image_path"]["value"] = file_path
            return self._hide_inputs(frontend_node)

        # 3. If image_path exists, hide inputs
        if field_name == "image_path" and field_value:
            return self._hide_inputs(frontend_node)

        # Check current state if image_path is already set
        if "template" in frontend_node:
            template = frontend_node["template"]
            if template.get("image_path", {}).get("value"):
                return self._hide_inputs(frontend_node)

        return frontend_node

    def build_data(self) -> Data:
        # Prefer the file path from image_path (populated by file upload or manual entry);
        # fall back to image_file for backward compatibility.
        resolved_path = self.image_path or self.image_file
        if not resolved_path:
            msg = "Please provide an image by uploading a file or entering a file path."
            raise ValueError(msg)
        file_name = resolved_path.split("/")[-1] if "/" in resolved_path else resolved_path
        return Data(
            data={
                "image": resolved_path,
                "file_name": file_name,
                "file_id": self.file_id,
                "name": file_name,
                "description": file_name,
                # Standardized payload for the frontend image viewer.
                # Contains a list of images (single-entry here) and a
                # "current" index so the same viewer can be used for
                # single images and image groups.
                "image_view": {
                    "type": "single",
                    "images": [
                        {
                            "url": resolved_path,
                            "file_id": self.file_id,
                            "file_name": file_name,
                            "caption": file_name,
                        }
                    ],
                    "current": 0,
                },
            },
        )
