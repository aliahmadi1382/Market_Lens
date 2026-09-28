// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const researchRuns = sqliteTable("research_runs", {
  id: text("id").primaryKey(),
  query: text("query").notNull(),
  createdAt: text("created_at").notNull(),
  payload: text("payload").notNull(),
  listingCount: integer("listing_count").notNull(),
});
