import { sql } from "drizzle-orm";
import { db } from "../src/shared/db";

async function dropAllTables() {
    console.log("⏳ Dropping all tables...");

    try {
        await db.execute(sql`
      DO $$ 
      DECLARE
          r RECORD;
      BEGIN
          -- Loop through all tables in the 'public' schema
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
              EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
      END $$;
    `);

        console.log("✅ All tables dropped successfully.");
    } catch (error) {
        console.error("❌ Failed to drop tables:", error);
    } finally {
        process.exit(0);
    }
}

dropAllTables();