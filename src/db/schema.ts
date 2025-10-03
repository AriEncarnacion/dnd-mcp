import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
	id: text("id")
		.primaryKey()
		.default(sql`(lower(hex(randomblob(16))))`),
	github_id: integer("github_id").notNull().unique(),
	github_login: text("github_login").notNull(),
	name: text("name"),
	email: text("email"),
	avatar_url: text("avatar_url"),
	bio: text("bio"),
	username: text("username").unique(),
	created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
	updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
