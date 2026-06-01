from typing import Optional

from pydantic import BaseModel, Field

# ============================================================================
# PLACEHOLDERS & STUBS
# (Replace these imports/definitions with your actual external base schemas)
# ============================================================================


class ProjectRef(BaseModel):
    project_id: str = Field(default="", description="Reference ID for the project")


class AudioAnalysis(BaseModel):
    # Omit segments: true means we only take the fields outside of 'segments'
    bpm: float = Field(0.0, description="Beats per minute")
    energy: float = Field(0.0, description="Overall audio energy level")
    segments: list[str] = Field(default_factory=list)  # Will be omitted below


class IdentityBase(BaseModel):
    id: str = Field(..., description="Unique entity identity ID")


class WorldRef(BaseModel):
    world_id: str = Field(..., description="Reference ID for the world context")


class PhysicalTraits(BaseModel):
    hair_color: str | None = None
    height: str | None = None


class CharacterState(BaseModel):
    status: str = Field("active", description="Current status of character")


class GuidanceLevel(BaseModel):
    level: str = Field("standard", description="Creative guidance level")


class AssetRegistry(BaseModel):
    images: list[str] = Field(default_factory=list)


# Mock function for buildAssetKeyShape dynamic fields
def get_character_base_asset_keys():
    return {
        "__annotations__": {
            "avatar_asset_key": Optional[str],
            "model_asset_key": Optional[str],
        },
        "avatar_asset_key": Field(None, description="Optional asset key for avatar"),
        "model_asset_key": Field(None, description="Optional asset key for 3D model"),
    }


# Mock base types for Storyboard
class LocationBase(BaseModel):
    pass


class SceneBase(BaseModel):
    pass


# ============================================================================
# PROJECT METADATA TRANSLATION
# ============================================================================


class ProjectMetadataAttributes(BaseModel):
    title: str = Field(default="", description="Title of the video")
    logline: str = Field(default="", description="One sentence capturing the core story")
    total_scenes: int = Field(default=0, description="Total number of scenes")
    style: str = Field(default="", description="Inferred cinematic style")
    description: str = Field(default="", description="Overall emotional arc")
    color_palette: list[str] = Field(default_factory=list, description="Dominant colors")
    tags: list[str] = Field(default_factory=list, description="Descriptive tags")
    initial_prompt: str = Field(default="", description="Original creative prompt")
    enhanced_prompt: str = Field(default="", description="Enhanced user prompt with narrative, characters, settings")
    audio_gcs_uri: str | None = Field(default=None, description="GCS URI of uploaded audio file")
    audio_public_uri: str | None = Field(default=None, description="Audio file public URL")
    has_audio: bool = Field(default=False, description="Whether this workflow has user-provided audio")

    # AudioAnalysis.omit({ segments: true }).shape
    bpm: float = Field(0.0, description="Beats per minute")
    energy: float = Field(0.0, description="Overall audio energy level")


class ProjectMetadata(ProjectMetadataAttributes, ProjectRef):
    """Combines ProjectMetadataAttributes and ProjectRef fields."""


class Storyboard(BaseModel):
    metadata: ProjectMetadata
    characters: list["CharacterBase"] = Field(default_factory=list)
    locations: list[LocationBase] = Field(default_factory=list)
    scenes: list[SceneBase] = Field(default_factory=list)

    class Config:
        # Replicates .readonly() by making instances immutable
        frozen = True
        description = "The immutable project snapshot"


class CharacterAttributes(BaseModel):
    reference_id: str = Field(
        ..., description="Narrative-scoped identifier for the character e.g. Luke_Skywalker, North_Villain"
    )
    name: str = Field(..., description="Character name")
    description: str = Field(..., description="Character description: personality, background, and role in the story")
    aliases: list[str] = Field(default_factory=list, description="Character aliases")
    physical_traits: PhysicalTraits
    # CharacterState.default(() => CharacterState.parse({}))
    state: CharacterState = Field(default_factory=lambda: CharacterState(), description="Character state")


class CharacterBase(IdentityBase, ProjectRef, CharacterAttributes):
    # Explicitly pull the specific property from WorldRef
    world_id: str = Field(..., description="Reference ID for the world context")
    guidance_level: GuidanceLevel


# Python allows dynamic class creation to cleanly replicate buildAssetKeyShape()
CharacterDynamicFields = type("CharacterDynamicFields", (BaseModel,), get_character_base_asset_keys())


class Character(CharacterBase, CharacterDynamicFields):
    assets: AssetRegistry


# Required in Pydantic V2 for resolving forward references inside Storyboard
Storyboard.model_rebuild()
