import "dotenv/config";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  try {
    const migrationPath = path.join(
      "migrations",
      "create_push_subscriptions.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    console.log("Running migration: create_push_subscriptions.sql");
    await pool.query(sql);
    console.log("✅ Migration completed successfully!");

    // Verify the table was created
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'push_subscriptions'
    `);

    if (result.rows.length > 0) {
      console.log("✅ push_subscriptions table confirmed in database");
    } else {
      console.log("⚠️ Table may not have been created");
    }
  } catch (error) {
    console.error("❌ Migration error:", error.message);
  } finally {
    await pool.end();
  }
}

runMigration();
