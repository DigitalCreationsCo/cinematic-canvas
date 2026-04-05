-- Migration: Create tag_registry table for Entity Mention System
-- Created: 2026-04-05

-- Create the tag_registry table for @handle management
CREATE TABLE IF NOT EXISTS tag_registry (
    handle TEXT PRIMARY KEY,
    entity_id UUID NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'location', 'prop')),
    world_id UUID,
    project_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by project/world scope
CREATE INDEX IF NOT EXISTS idx_tag_scope ON tag_registry(project_id, world_id);

-- Index for reverse lookup by entity
CREATE INDEX IF NOT EXISTS idx_tag_entity ON tag_registry(entity_id, entity_type);
