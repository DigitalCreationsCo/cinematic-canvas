from uuid import UUID

from sqlalchemy import PrimaryKeyConstraint
from sqlmodel import Field, SQLModel


class SceneToCharacterLink(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "scenes_to_characters"
    __mapper_args__ = {"confirm_deleted_rows": False}
    __table_args__ = (PrimaryKeyConstraint("scene_id", "character_id"),)

    scene_id: UUID | None = Field(default=None, foreign_key="scenes.id", nullable=True)
    character_id: UUID | None = Field(default=None, foreign_key="characters.id", nullable=True)
