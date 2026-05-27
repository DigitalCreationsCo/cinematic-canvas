"""Add canvas tables: characters, scenes, locations, props, blocks, lore,
tag_registry, scenes_to_characters, media_objects, asset_entries,
asset_versions; extend folder with project columns.

Revision ID: 0020_add_canvas_tables
Revises: 4a21b9d4334b
Create Date: 2025-01-01 00:00:00.000000

Phase: EXPAND
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0020_add_canvas_tables"
down_revision: str | None = "4a21b9d4334b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    conn = op.get_bind()
    inspector = sa.inspect(conn)
    folder_columns = {column["name"] for column in inspector.get_columns("folder")}

    if "storyboard" not in folder_columns:
        op.add_column(
            "folder",
            sa.Column(
                "storyboard",
                postgresql.JSONB(),
                nullable=True,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )
    if "metadata" not in folder_columns:
        op.add_column(
            "folder",
            sa.Column(
                "metadata",
                postgresql.JSONB(),
                nullable=True,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )
    if "audio_analysis" not in folder_columns:
        op.add_column("folder", sa.Column("audio_analysis", postgresql.JSONB(), nullable=True))
    if "status" not in folder_columns:
        op.add_column(
            "folder",
            sa.Column("status", sa.Text(), nullable=True, server_default=sa.text("'pending'")),
        )
    if "current_scene_index" not in folder_columns:
        op.add_column(
            "folder",
            sa.Column(
                "current_scene_index",
                sa.Integer(),
                nullable=True,
                server_default=sa.text("0"),
            ),
        )
    if "force_regenerate_scene_ids" not in folder_columns:
        op.add_column(
            "folder",
            sa.Column(
                "force_regenerate_scene_ids",
                postgresql.ARRAY(sa.String()),
                nullable=True,
                server_default=sa.text("'{}'::text[]"),
            ),
        )
    if "generation_rules" not in folder_columns:
        op.add_column(
            "folder",
            sa.Column(
                "generation_rules",
                postgresql.ARRAY(sa.String()),
                nullable=True,
                server_default=sa.text("'{}'::text[]"),
            ),
        )
    if "generation_rules_history" not in folder_columns:
        op.add_column(
            "folder",
            sa.Column(
                "generation_rules_history",
                postgresql.JSONB(),
                nullable=True,
                server_default=sa.text("'[]'::jsonb"),
            ),
        )
    if "guidance_level" not in folder_columns:
        op.add_column(
            "folder",
            sa.Column("guidance_level", sa.Integer(), nullable=True, server_default=sa.text("2")),
        )
    if "style_references" not in folder_columns:
        op.add_column(
            "folder",
            sa.Column(
                "style_references",
                postgresql.ARRAY(sa.String()),
                nullable=True,
                server_default=sa.text("'{}'::text[]"),
            ),
        )

    op.execute("ALTER TABLE folder ALTER COLUMN storyboard SET NOT NULL")
    op.execute('ALTER TABLE folder ALTER COLUMN "metadata" SET NOT NULL')
    op.execute("ALTER TABLE folder ALTER COLUMN status SET NOT NULL")
    op.execute("ALTER TABLE folder ALTER COLUMN current_scene_index SET NOT NULL")
    op.execute("ALTER TABLE folder ALTER COLUMN force_regenerate_scene_ids SET NOT NULL")
    op.execute("ALTER TABLE folder ALTER COLUMN generation_rules SET NOT NULL")
    op.execute("ALTER TABLE folder ALTER COLUMN generation_rules_history SET NOT NULL")
    op.execute("ALTER TABLE folder ALTER COLUMN guidance_level SET NOT NULL")
    op.execute("ALTER TABLE folder ALTER COLUMN style_references SET NOT NULL")

    op.create_table(
        "characters",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reference_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "aliases",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("physical_traits", postgresql.JSONB(), nullable=False),
        sa.Column("state", postgresql.JSONB(), nullable=False),
        sa.Column("guidance_level", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["folder.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_characters_name", "characters", ["name"], unique=False)
    op.create_index("characters_guidance_idx", "characters", ["guidance_level"], unique=False)

    op.create_table(
        "locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reference_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("mood", sa.Text(), nullable=False),
        sa.Column("lighting_conditions", postgresql.JSONB(), nullable=False),
        sa.Column("time_of_day", sa.Text(), nullable=False),
        sa.Column("weather", sa.Text(), nullable=False),
        sa.Column("color_palette", postgresql.JSONB(), nullable=False),
        sa.Column("architecture", postgresql.JSONB(), nullable=False),
        sa.Column("natural_elements", postgresql.JSONB(), nullable=False),
        sa.Column("man_made_objects", postgresql.JSONB(), nullable=False),
        sa.Column("ground_surface", sa.Text(), nullable=False),
        sa.Column("sky_or_ceiling", sa.Text(), nullable=False),
        sa.Column("state", postgresql.JSONB(), nullable=False),
        sa.Column("guidance_level", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["folder.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("locations_guidance_idx", "locations", ["guidance_level"], unique=False)

    op.create_table(
        "props",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reference_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("guidance_level", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["project_id"], ["folder.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "scenes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scene_index", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("start_time", sa.Float(), nullable=False),
        sa.Column("end_time", sa.Float(), nullable=False),
        sa.Column("duration", sa.Float(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("lyrics", sa.Text(), nullable=True),
        sa.Column("musical_description", sa.Text(), nullable=True),
        sa.Column("music_change", sa.Text(), nullable=True),
        sa.Column("intensity", sa.Text(), nullable=True),
        sa.Column("mood", sa.Text(), nullable=False),
        sa.Column("tempo", sa.Text(), nullable=False),
        sa.Column("audio_evidence", sa.Text(), nullable=False),
        sa.Column("transient_impact", sa.Text(), nullable=False),
        sa.Column("audio_sync", sa.Text(), nullable=False),
        sa.Column("transition_type", sa.Text(), nullable=False),
        sa.Column("shot_type", sa.Text(), nullable=False),
        sa.Column("camera_angle", sa.Text(), nullable=False),
        sa.Column("camera_movement", sa.Text(), nullable=False),
        sa.Column("composition", postgresql.JSONB(), nullable=False),
        sa.Column("lighting", postgresql.JSONB(), nullable=False),
        sa.Column(
            "continuity_notes",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column(
            "character_reference_ids",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("location_reference_id", sa.Text(), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("progress_message", sa.Text(), nullable=True),
        sa.Column("guidance_level", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["folder.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("scenes_guidance_idx", "scenes", ["guidance_level"], unique=False)

    op.create_table(
        "scenes_to_characters",
        sa.Column("scene_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["scene_id"], ["scenes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("scene_id", "character_id"),
    )

    op.create_table(
        "tag_registry",
        sa.Column("handle", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("prop_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="NO ACTION"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="NO ACTION"),
        sa.ForeignKeyConstraint(["prop_id"], ["props.id"], ondelete="NO ACTION"),
        sa.ForeignKeyConstraint(["project_id"], ["folder.id"]),
        sa.PrimaryKeyConstraint("handle"),
    )
    op.create_index("idx_tag_scope", "tag_registry", ["project_id"], unique=False)
    op.create_index(
        "idx_tag_handle_fuzzy",
        "tag_registry",
        ["handle"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"handle": "gin_trgm_ops"},
    )

    op.create_table(
        "media_objects",
        sa.Column("data", sa.Text(), nullable=False),
        sa.Column("ref_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "last_referenced_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("data"),
    )

    op.create_table(
        "asset_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scene_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("prop_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("asset_key", sa.Text(), nullable=False),
        sa.Column("head", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("best", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "best_locked_by_feedback",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["project_id"], ["folder.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scene_id"], ["scenes.id"], ondelete="NO ACTION"),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="NO ACTION"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="NO ACTION"),
        sa.ForeignKeyConstraint(["prop_id"], ["props.id"], ondelete="NO ACTION"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_unq_project_asset",
        "asset_entries",
        ["project_id", "asset_key"],
        unique=True,
        postgresql_where=sa.text(
            "scene_id IS NULL AND character_id IS NULL AND location_id IS NULL AND file_id IS NULL"
        ),
    )
    op.create_index("idx_unq_scene_asset", "asset_entries", ["scene_id", "asset_key"], unique=True)
    op.create_index(
        "idx_unq_char_asset",
        "asset_entries",
        ["character_id", "asset_key"],
        unique=True,
    )
    op.create_index("idx_unq_loc_asset", "asset_entries", ["location_id", "asset_key"], unique=True)
    op.create_index("idx_unq_file_asset", "asset_entries", ["file_id", "asset_key"], unique=True)
    op.create_index("idx_asset_entries_project", "asset_entries", ["project_id"], unique=False)
    op.create_index("idx_asset_entries_scene", "asset_entries", ["scene_id"], unique=False)
    op.create_index("idx_asset_entries_character", "asset_entries", ["character_id"], unique=False)
    op.create_index("idx_asset_entries_location", "asset_entries", ["location_id"], unique=False)
    op.create_index("idx_asset_entries_file", "asset_entries", ["file_id"], unique=False)

    op.create_table(
        "asset_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_entry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("data", sa.Text(), nullable=False),
        sa.Column("media_id", sa.Text(), nullable=True),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(),
            nullable=True,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("user_feedback", postgresql.JSONB(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["asset_entry_id"], ["asset_entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["media_id"], ["media_objects.data"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_unq_asset_version_seq",
        "asset_versions",
        ["asset_entry_id", "version"],
        unique=True,
    )
    op.create_index(
        "idx_asset_history_lookup",
        "asset_versions",
        ["asset_entry_id", "version"],
        unique=False,
    )
    op.create_index(
        "idx_entry_version",
        "asset_versions",
        ["asset_entry_id", "version"],
        unique=False,
    )

    op.create_table(
        "blocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("index", sa.Integer(), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("dialogue", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('english', content)", persisted=True),
            nullable=True,
        ),
        sa.Column("is_notable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.text("now()"),
        ),
        sa.Column("happened_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["folder.id"], onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_blocks_project_id", "blocks", ["project_id"], unique=False)
    op.create_index(
        "idx_blocks_search",
        "blocks",
        ["search_vector"],
        unique=False,
        postgresql_using="gin",
    )

    op.create_table(
        "lore",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.text("now()"),
        ),
        sa.Column("happened_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["folder.id"], onupdate="CASCADE", ondelete="NO ACTION"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_index("idx_blocks_search", table_name="blocks")
    op.drop_index("idx_blocks_project_id", table_name="blocks")
    op.drop_index("idx_entry_version", table_name="asset_versions")
    op.drop_index("idx_asset_history_lookup", table_name="asset_versions")
    op.drop_index("idx_unq_asset_version_seq", table_name="asset_versions")
    op.drop_index("idx_asset_entries_file", table_name="asset_entries")
    op.drop_index("idx_asset_entries_location", table_name="asset_entries")
    op.drop_index("idx_asset_entries_character", table_name="asset_entries")
    op.drop_index("idx_asset_entries_scene", table_name="asset_entries")
    op.drop_index("idx_asset_entries_project", table_name="asset_entries")
    op.drop_index("idx_unq_file_asset", table_name="asset_entries")
    op.drop_index("idx_unq_loc_asset", table_name="asset_entries")
    op.drop_index("idx_unq_char_asset", table_name="asset_entries")
    op.drop_index("idx_unq_scene_asset", table_name="asset_entries")
    op.drop_index("idx_unq_project_asset", table_name="asset_entries")
    op.drop_index("idx_tag_handle_fuzzy", table_name="tag_registry")
    op.drop_index("idx_tag_scope", table_name="tag_registry")
    op.drop_index("scenes_guidance_idx", table_name="scenes")
    op.drop_index("locations_guidance_idx", table_name="locations")
    op.drop_index("characters_guidance_idx", table_name="characters")
    op.drop_index("ix_characters_name", table_name="characters")

    op.drop_table("lore")
    op.drop_table("blocks")
    op.drop_table("asset_versions")
    op.drop_table("asset_entries")
    op.drop_table("media_objects")
    op.drop_table("tag_registry")
    op.drop_table("scenes_to_characters")
    op.drop_table("scenes")
    op.drop_table("props")
    op.drop_table("locations")
    op.drop_table("characters")

    op.drop_column("folder", "style_references")
    op.drop_column("folder", "guidance_level")
    op.drop_column("folder", "generation_rules_history")
    op.drop_column("folder", "generation_rules")
    op.drop_column("folder", "force_regenerate_scene_ids")
    op.drop_column("folder", "current_scene_index")
    op.drop_column("folder", "status")
    op.drop_column("folder", "audio_analysis")
    op.drop_column("folder", "metadata")
    op.drop_column("folder", "storyboard")
