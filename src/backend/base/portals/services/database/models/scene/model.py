from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Float, Index, String, text
from sqlmodel import JSON, Column, Field, SQLModel


class SceneBase(SQLModel):
    created_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)
    updated_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)
    project_id: UUID = Field(foreign_key="folder.id")
    scene_index: int
    name: str
    start_time: float = Field(sa_column=Column(Float, nullable=False))
    end_time: float = Field(sa_column=Column(Float, nullable=False))
    duration: float = Field(sa_column=Column(Float, nullable=False))
    type: str
    lyrics: str | None = None
    musical_description: str | None = None
    music_change: str | None = None
    intensity: str | None = None
    mood: str
    tempo: str
    audio_evidence: str
    transient_impact: str
    audio_sync: str
    transition_type: str
    shot_type: str
    camera_angle: str
    camera_movement: str
    composition: dict = Field(sa_column=Column(JSON, nullable=False))
    lighting: dict = Field(sa_column=Column(JSON, nullable=False))
    continuity_notes: list[str] = Field(
        default_factory=list,
        sa_column=Column(
            "continuity_notes",
            String,
            nullable=False,
            server_default=text(""),
        ),
    )
    character_reference_ids: list[str] = Field(
        default_factory=list,
        sa_column=Column(
            "character_reference_ids",
            String,
            nullable=False,
            server_default=text(""),
        ),
    )
    location_reference_id: str
    location_id: UUID = Field(foreign_key="locations.id")
    status: str = Field(default="pending")
    progress_message: str | None = None
    guidance_level: int | None = None


class Scene(SceneBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "scenes"
    __mapper_args__ = {"confirm_deleted_rows": False}
    __table_args__ = (Index("scenes_guidance_idx", "guidance_level"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True, unique=True)


class SceneCreate(SceneBase):
    pass


class SceneRead(SceneBase):
    id: UUID


class SceneUpdate(SQLModel):
    name: str | None = None
    status: str | None = None
    progress_message: str | None = None
    guidance_level: int | None = None
    character_reference_ids: list[str] | None = None
    location_reference_id: str | None = None
    location_id: UUID | None = None
    composition: dict | None = None
    lighting: dict | None = None
