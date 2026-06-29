"""Image utility functions for px package."""

from __future__ import annotations

import base64
from pathlib import Path

import anyio

from px.log import logger
from px.services.deps import get_storage_service
from px.utils.helpers import get_mime_type


async def _fetch_file_bytes(image_path: str | Path) -> bytes:
    """Read image file bytes from storage service or local filesystem.

    Args:
        image_path: Path to the image file (local or S3 path like "flow_id/filename")

    Returns:
        Raw bytes of the image file

    Raises:
        FileNotFoundError: If the image file doesn't exist
    """
    path_str = str(image_path)
    storage_service = get_storage_service()
    if storage_service:
        flow_id, file_name = storage_service.parse_file_path(path_str)
        try:
            return await storage_service.get_file(flow_id=flow_id, file_name=file_name)
        except Exception as e:
            logger.error(f"Error reading image file from storage: {e}")
            raise

    # Fall back to local file access
    local_path = anyio.Path(image_path)
    if not local_path.exists():
        msg = f"Image file not found: {local_path}"
        raise FileNotFoundError(msg)

    return local_path.read_bytes()


def convert_image_to_base64(image_path: str | Path) -> str:
    """Convert an image file to a base64 encoded string. (sync, may block).

    Prefer :func:`async_convert_image_to_base64` in async contexts.

    Handles both local files and S3 storage paths.

    Args:
        image_path: Path to the image file (local or S3 path like "flow_id/filename")

    Returns:
        Base64 encoded string of the image

    Raises:
        FileNotFoundError: If the image file doesn't exist
    """
    import asyncio

    # If an event loop is already running this will raise RuntimeError.
    # Callers in async contexts should use async_convert_image_to_base64.
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        pass
    else:
        logger.warning("convert_image_to_base64 called from async context — use async_convert_image_to_base64 instead")

    path_str = str(image_path)
    storage_service = get_storage_service()
    if storage_service:
        from px.utils.async_helpers import run_until_complete

        flow_id, file_name = storage_service.parse_file_path(path_str)
        try:
            file_content = run_until_complete(storage_service.get_file(flow_id=flow_id, file_name=file_name))
            return base64.b64encode(file_content).decode("utf-8")
        except Exception as e:
            logger.error(f"Error reading image file: {e}")
            raise

    # Fall back to local file access
    local_path = Path(image_path)
    if not local_path.exists():
        msg = f"Image file not found: {local_path}"
        raise FileNotFoundError(msg)

    return base64.b64encode(local_path.read_bytes()).decode("utf-8")


async def async_convert_image_to_base64(image_path: str | Path) -> str:
    """Async version: convert an image file to a base64 encoded string.

    Handles both local files and S3 storage paths without blocking the
    event loop (no thread-pool workaround needed).

    Args:
        image_path: Path to the image file (local or S3 path like "flow_id/filename")

    Returns:
        Base64 encoded string of the image

    Raises:
        FileNotFoundError: If the image file doesn't exist
    """
    file_content = await _fetch_file_bytes(image_path)
    return base64.b64encode(file_content).decode("utf-8")


def create_data_url(image_path: str | Path, mime_type: str | None = None) -> str:
    """Create a data URL from an image file. (sync, may block).

    Prefer :func:`async_create_data_url` in async contexts.

    Args:
        image_path: Path to the image file (local or S3 path like "flow_id/filename")
        mime_type: MIME type of the image. If None, will be auto-detected

    Returns:
        Data URL string in format: data:mime/type;base64,{base64_data}

    Raises:
        FileNotFoundError: If the image file doesn't exist
    """
    image_path_parsed = Path(image_path)
    if mime_type is None:
        mime_type = get_mime_type(image_path_parsed)
    base64_data = convert_image_to_base64(image_path_parsed)
    return f"data:{mime_type};base64,{base64_data}"


async def async_create_data_url(image_path: str | Path, mime_type: str | None = None) -> str:
    """Async version: create a data URL from an image file.

    Args:
        image_path: Path to the image file (local or S3 path like "flow_id/filename")
        mime_type: MIME type of the image. If None, will be auto-detected

    Returns:
        Data URL string in format: data:mime/type;base64,{base64_data}
    """
    image_path_parsed = Path(image_path)
    if mime_type is None:
        mime_type = get_mime_type(image_path_parsed)
    base64_data = await async_convert_image_to_base64(image_path_parsed)
    return f"data:{mime_type};base64,{base64_data}"


def create_image_content_dict(
    image_path: str | Path,
    mime_type: str | None = None,
    model_name: str | None = None,  # noqa: ARG001
) -> dict:
    """Create a content dictionary for multimodal inputs from an image file. (sync, may block).

    Args:
        image_path: Path to the image file (local or S3 path like "flow_id/filename")
        mime_type: MIME type of the image. If None, will be auto-detected
        model_name: Optional model parameter (kept for backward compatibility, no longer used)

    Returns:
        Content dictionary with type and image_url fields
    """
    data_url = create_data_url(image_path, mime_type)
    return {"type": "image_url", "image_url": {"url": data_url}}


async def async_create_image_content_dict(
    image_path: str | Path,
    mime_type: str | None = None,
    model_name: str | None = None,  # noqa: ARG001
) -> dict:
    """Async version: create a content dictionary for multimodal inputs from an image file.

    Args:
        image_path: Path to the image file (local or S3 path like "flow_id/filename")
        mime_type: MIME type of the image. If None, will be auto-detected
        model_name: Optional model parameter (kept for backward compatibility, no longer used)

    Returns:
        Content dictionary with type and image_url fields
    """
    data_url = await async_create_data_url(image_path, mime_type)
    return {"type": "image_url", "image_url": {"url": data_url}}
