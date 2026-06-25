from typing import Optional

from pydantic import BaseModel, Field


class ProjectRef(BaseModel):
    project_id: str = Field(default="", description="Reference ID for the project")


class AudioAnalysis(BaseModel):
    bpm: float = Field(0.0, description="Beats per minute")
    energy: float = Field(0.0, description="Overall audio energy level")
    segments: list[str] = Field(default_factory=list)


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


def get_character_base_asset_keys():
    return {
        "__annotations__": {
            "avatar_asset_key": Optional[str],
            "model_asset_key": Optional[str],
        },
        "avatar_asset_key": Field(None, description="Optional asset key for avatar"),
        "model_asset_key": Field(None, description="Optional asset key for 3D model"),
    }


class LocationBase(BaseModel):
    pass


class SceneBase(BaseModel):
    pass


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
    bpm: float = Field(0.0, description="Beats per minute")
    energy: float = Field(0.0, description="Overall audio energy level")


class ProjectMetadata(ProjectMetadataAttributes, ProjectRef):
    """Combines ProjectMetadataAttributes and ProjectRef fields."""


class CharacterAttributes(BaseModel):
    reference_id: str = Field(
        ..., description="Narrative-scoped identifier for the character e.g. Luke_Skywalker, North_Villain"
    )
    name: str = Field(..., description="Character name")
    description: str = Field(..., description="Character description: personality, background, and role in the story")
    aliases: list[str] = Field(default_factory=list, description="Character aliases")
    physical_traits: PhysicalTraits
    state: CharacterState = Field(default_factory=lambda: CharacterState(), description="Character state")


class CharacterBase(IdentityBase, ProjectRef, CharacterAttributes):
    world_id: str = Field(..., description="Reference ID for the world context")
    guidance_level: GuidanceLevel


CharacterDynamicFields = type("CharacterDynamicFields", (BaseModel,), get_character_base_asset_keys())


class Character(CharacterBase, CharacterDynamicFields):
    assets: AssetRegistry
