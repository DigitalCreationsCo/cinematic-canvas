import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export const db = drizzle({ client: pool });

async function dropAllTables() {
    console.log("⏳ Resetting public schema...");

    try {
        await db.execute(sql`
            -- Drop the entire schema. CASCADE handles all tables, views, and types.
            DROP SCHEMA IF EXISTS public CASCADE;
            
            -- Recreate the schema so your app/Drizzle can use it again.
            CREATE SCHEMA public;
            
            -- Restore default permissions (required for some cloud providers)
            GRANT ALL ON SCHEMA public TO public;
            GRANT ALL ON SCHEMA public TO current_user;
        `);

        console.log("✅ Database reset successfully.");
    } catch (error) {
        console.error("❌ Failed to reset database:", error);
    } finally {
        await pool.end(); // Always close the pool properly
    }
}


dropAllTables();
