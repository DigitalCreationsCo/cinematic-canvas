from fastapi import APIRouter
from px.base.models.unified_models import (
    get_embedding_model_options,
    get_image_generation_model_options,
    get_language_model_options,
    get_video_generation_model_options,
)

from portals.api.utils import CurrentActiveUser, DbSession
from portals.services import feature_authorizer

router = APIRouter(prefix="/model_options", tags=["Model Options"], include_in_schema=False)


async def _feature_gate(
    feature: str,
    current_user: CurrentActiveUser,
    db: DbSession,
) -> None:
    """Raise 403 if the feature is not available for the user's tier."""
    from fastapi import HTTPException, status

    if not await feature_authorizer.is_feature_available(
        feature,
        current_user.subscription_tier or "free",
        db,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your plan does not include {feature}",
        )


@router.get("/language", status_code=200)
async def get_language_model_options_endpoint(
    current_user: CurrentActiveUser,
    session: DbSession,
):
    """Get language model options filtered by user's enabled providers and models."""
    await _feature_gate("language", current_user, session)
    return get_language_model_options(user_id=current_user.id)


@router.get("/embedding", status_code=200)
async def get_embedding_model_options_endpoint(
    current_user: CurrentActiveUser,
    session: DbSession,
):
    """Get embedding model options filtered by user's enabled providers and models."""
    await _feature_gate("language", current_user, session)
    return get_embedding_model_options(user_id=current_user.id)


@router.get("/image", status_code=200)
async def get_image_generation_model_options_endpoint(
    current_user: CurrentActiveUser,
    session: DbSession,
):
    """Get image generation model options filtered by user's enabled providers and models."""
    await _feature_gate("image_generation", current_user, session)
    return get_image_generation_model_options(user_id=current_user.id)


@router.get("/video", status_code=200)
async def get_video_generation_model_options_endpoint(
    current_user: CurrentActiveUser,
    session: DbSession,
):
    """Get video generation model options filtered by user's enabled providers and models."""
    await _feature_gate("video_generation", current_user, session)
    return get_video_generation_model_options(user_id=current_user.id)
