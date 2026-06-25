from px.custom.custom_component.component import Component
from px.io import StrInput
from px.schema import Data
from px.template.field.base import Output


class ImageLoaderComponent(Component):
    display_name = "Image"
    description = "Loads and renders an image directly on the canvas."
    icon = "image"
    name = "ImageLoader"

    inputs = [
        StrInput(
            name="image_path",
            display_name="Image",
            required=True,
            show=True,
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

    def build_data(self) -> Data:
        file_name = self.image_path.split("/")[-1] if "/" in self.image_path else self.image_path
        return Data(
            data={
                "image": self.image_path,
                "file_name": file_name,
                "file_id": self.file_id,
                "name": file_name,
                "description": file_name,
            },
        )
