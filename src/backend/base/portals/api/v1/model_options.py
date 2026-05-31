from fastapi import APIRouter
from px.base.models.unified_models import (
    get_embedding_model_options,
    get_image_generation_model_options,
    get_language_model_options,
    get_video_generation_model_options,
)

from portals.api.utils import CurrentActiveUser

router = APIRouter(prefix="/model_options", tags=["Model Options"], include_in_schema=False)


@router.get("/language", status_code=200)
async def get_language_model_options_endpoint(
    current_user: CurrentActiveUser,
):
    """Get language model options filtered by user's enabled providers and models."""
    return get_language_model_options(user_id=current_user.id)


@router.get("/embedding", status_code=200)
async def get_embedding_model_options_endpoint(
    current_user: CurrentActiveUser,
):
    """Get embedding model options filtered by user's enabled providers and models."""
    return get_embedding_model_options(user_id=current_user.id)


@router.get("/image", status_code=200)
async def get_image_generation_model_options_endpoint(
    current_user: CurrentActiveUser,
):
    """Get image generation model options filtered by user's enabled providers and models."""
    return get_image_generation_model_options(user_id=current_user.id)


@router.get("/video", status_code=200)
async def get_video_generation_model_options_endpoint(
    current_user: CurrentActiveUser,
):
    """Get video generation model options filtered by user's enabled providers and models."""
    return get_video_generation_model_options(user_id=current_user.id)
