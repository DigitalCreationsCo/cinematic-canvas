#!/usr/bin/env tsx
// scripts/migrate-canvas-tables.ts
// One-time migration to add canvas node layout and world access grant tables.
// Run: npx tsx scripts/migrate-canvas-tables.ts

import { db } from '../src/shared/db/index.js';
import { sql } from 'drizzle-orm';

async function runMigration() {
  console.log('🚀 Running canvas tables migration...');

  // 1. Add SAC columns to worlds
  await db.execute(sql`
    ALTER TABLE worlds
    ADD COLUMN IF NOT EXISTS sac_repo_id TEXT,
    ADD COLUMN IF NOT EXISTS sac_repo_url TEXT;
  `);
  console.log('✅ worlds: sac_repo_id, sac_repo_url added');

  // 2. Add SAC fork columns to projects
  await db.execute(sql`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS sac_fork_repo_id TEXT,
    ADD COLUMN IF NOT EXISTS sac_fork_repo_url TEXT;
  `);
  console.log('✅ projects: sac_fork_repo_id, sac_fork_repo_url added');

  // 3. Create canvas_node_layouts table (OCC-guarded React Flow layout persistence)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS canvas_node_layouts (
      id_layout       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      id_context      UUID NOT NULL,
      context_type    TEXT NOT NULL,
      id_entity       UUID NOT NULL,
      node_type       TEXT NOT NULL,
      val_pos_x       REAL NOT NULL,
      val_pos_y       REAL NOT NULL,
      val_width       REAL,
      val_height      REAL,
      json_ui_metadata JSONB DEFAULT '{}'::JSONB,
      idx_version     INTEGER NOT NULL DEFAULT 1,
      ts_updated      TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT unq_context_entity UNIQUE (id_context, id_entity)
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_layouts_context ON canvas_node_layouts (id_context);
  `);
  console.log('✅ canvas_node_layouts table created');

  // 4. Create world_access_grants table (RBAC world entity access)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS world_access_grants (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      world_id     UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      user_id      UUID NOT NULL,
      role         TEXT NOT NULL,
      license_type TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT unq_world_user UNIQUE (world_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_world_access_grants_world ON world_access_grants (world_id);
  `);
  console.log('✅ world_access_grants table created');

  // 5. Enable Supabase Realtime for canvas_node_layouts
  await db.execute(sql`
    ALTER PUBLICATION supabase_realtime ADD TABLE canvas_node_layouts;
  `).catch((err: any) => {
    // Ignore error if publication doesn't exist (not using Supabase)
    if (!err.message?.includes('publication') && !err.message?.includes('does not exist')) {
      console.warn('⚠️ Could not add canvas_node_layouts to supabase_realtime publication:', err.message);
    } else {
      console.log('ℹ️  supabase_realtime publication not configured (not using Supabase)');
    }
  });
  console.log('✅ canvas_node_layouts added to supabase_realtime (if applicable)');

  console.log('🎉 Migration complete!');
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
