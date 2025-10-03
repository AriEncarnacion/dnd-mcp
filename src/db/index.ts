import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { users, type User, type InsertUser } from "./schema";

export type { User } from "./schema";

export interface UpsertUserParams {
	github_id: number;
	github_login: string;
	name?: string | null;
	email?: string | null;
	avatar_url?: string | null;
	bio?: string | null;
}

export interface UpdateUserInfoParams {
	name?: string | null;
	username?: string | null;
	email?: string | null;
}

/**
 * Inserts a new user or updates an existing user based on github_id
 */
export async function upsertUser(db: D1Database, params: UpsertUserParams): Promise<User> {
	const drizzleDb = drizzle(db);
	const { github_id, github_login, name, email, avatar_url, bio } = params;

	// Drizzle doesn't have native upsert support for SQLite yet, so we use raw SQL
	const result = await drizzleDb
		.run(
			sql`
			INSERT INTO users (github_id, github_login, name, email, avatar_url, bio)
			VALUES (${github_id}, ${github_login}, ${name}, ${email}, ${avatar_url}, ${bio})
			ON CONFLICT(github_id) DO UPDATE SET
				github_login = excluded.github_login,
				name = excluded.name,
				email = excluded.email,
				avatar_url = excluded.avatar_url,
				bio = excluded.bio,
				updated_at = CURRENT_TIMESTAMP
		`,
		);

	// Fetch the inserted/updated user
	const user = await getUserByGithubId(db, github_id);
	if (!user) {
		throw new Error("Failed to upsert user");
	}

	return user;
}

/**
 * Retrieves a user by their GitHub ID
 */
export async function getUserByGithubId(db: D1Database, github_id: number): Promise<User | null> {
	const drizzleDb = drizzle(db);
	const result = await drizzleDb.select().from(users).where(eq(users.github_id, github_id)).get();
	return result ?? null;
}

/**
 * Retrieves a user by their internal database ID
 */
export async function getUserById(db: D1Database, id: string): Promise<User | null> {
	const drizzleDb = drizzle(db);
	const result = await drizzleDb.select().from(users).where(eq(users.id, id)).get();
	return result ?? null;
}

/**
 * Updates user information (name, username, email)
 */
export async function updateUserInfo(
	db: D1Database,
	userId: string,
	params: UpdateUserInfoParams,
): Promise<User> {
	const drizzleDb = drizzle(db);

	// Build update object with only provided fields
	const updateData: Partial<typeof users.$inferInsert> = {};
	if (params.name !== undefined) updateData.name = params.name;
	if (params.username !== undefined) updateData.username = params.username;
	if (params.email !== undefined) updateData.email = params.email;

	// Always update the updated_at timestamp
	await drizzleDb
		.update(users)
		.set({
			...updateData,
			updated_at: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(users.id, userId))
		.run();

	// Fetch and return the updated user
	const user = await getUserById(db, userId);
	if (!user) {
		throw new Error("User not found after update");
	}

	return user;
}
