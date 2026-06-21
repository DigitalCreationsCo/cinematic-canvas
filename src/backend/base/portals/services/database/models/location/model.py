from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Index
from sqlmodel import JSON, Column, Field, SQLModel


class LocationBase(SQLModel):
    created_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)
    updated_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)
    project_id: UUID = Field(foreign_key="folder.id")
    reference_id: str
    name: str
    type: str
    mood: str
    lighting_conditions: dict = Field(sa_column=Column(JSON, nullable=False))
    time_of_day: str
    weather: str
    color_palette: dict = Field(sa_column=Column(JSON, nullable=False))
    architecture: dict = Field(sa_column=Column(JSON, nullable=False))
    natural_elements: dict = Field(sa_column=Column(JSON, nullable=False))
    man_made_objects: dict = Field(sa_column=Column(JSON, nullable=False))
    ground_surface: str
    sky_or_ceiling: str
    state: dict = Field(sa_column=Column(JSON, nullable=False))
    guidance_level: int | None = None

    # NAP (Narrative Addressing Protocol) columns — temporary migration scaffolding.
    nap_uri: str | None = Field(default=None, nullable=True)
    nap_commit_hash: str | None = Field(default=None, nullable=True)


class Location(LocationBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "locations"
    __mapper_args__ = {"confirm_deleted_rows": False}
    __table_args__ = (Index("locations_guidance_idx", "guidance_level"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True, unique=True)


class LocationCreate(LocationBase):
    pass


class LocationRead(LocationBase):
    id: UUID


class LocationUpdate(SQLModel):
    reference_id: str | None = None
    name: str | None = None
    type: str | None = None
    mood: str | None = None
    lighting_conditions: dict | None = None
    time_of_day: str | None = None
    weather: str | None = None
    color_palette: dict | None = None
    architecture: dict | None = None
    natural_elements: dict | None = None
    man_made_objects: dict | None = None
    ground_surface: str | None = None
    sky_or_ceiling: str | None = None
    state: dict | None = None
    guidance_level: int | None = None
