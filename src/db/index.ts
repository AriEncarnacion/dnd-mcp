import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import {
	users,
	characters,
	weapons,
	spells,
	equipment,
	magic_items,
	weapon_proficiencies,
	tool_proficiencies,
	type User,
	type Character,
	type InsertCharacter,
	type Weapon,
	type InsertWeapon,
	type Spell,
	type Equipment,
	type MagicItem,
} from "./schema";

export type { User, Character, Weapon, Spell, Equipment, MagicItem } from "./schema";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate D&D ability modifier from ability score
 * Formula: floor((score - 10) / 2)
 *
 * Examples:
 * - Score 1: -5 modifier
 * - Score 8: -1 modifier
 * - Score 10: 0 modifier
 * - Score 16: +3 modifier
 * - Score 20: +5 modifier
 * - Score 30: +10 modifier
 */
export function calculateAbilityModifier(score: number): number {
	return Math.floor((score - 10) / 2);
}

/**
 * Mapping of D&D skills to their associated ability scores
 * Used to calculate skill modifiers: ability_modifier + (proficiency_bonus if proficient)
 */
export const SKILL_ABILITY_MAP: Record<string, "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"> = {
	// Strength
	athletics: "strength",

	// Dexterity
	acrobatics: "dexterity",
	sleight_of_hand: "dexterity",
	stealth: "dexterity",

	// Intelligence
	arcana: "intelligence",
	history: "intelligence",
	investigation: "intelligence",
	nature: "intelligence",
	religion: "intelligence",

	// Wisdom
	animal_handling: "wisdom",
	insight: "wisdom",
	medicine: "wisdom",
	perception: "wisdom",
	survival: "wisdom",

	// Charisma
	deception: "charisma",
	intimidation: "charisma",
	performance: "charisma",
	persuasion: "charisma",
};

/**
 * Calculate proficiency bonus from character level
 * Formula: floor((level - 1) / 4) + 2
 *
 * @param level Character level (1-20)
 * @returns Proficiency bonus (+2 to +6)
 */
export function calculateProficiencyBonus(level: number): number {
	return Math.floor((level - 1) / 4) + 2;
}

/**
 * Calculate skill modifier for a specific skill
 *
 * @param character Character data
 * @param skillName Name of the skill (e.g., "perception", "arcana")
 * @param isProficient Whether the character is proficient in this skill
 * @param hasExpertise Whether the character has expertise (double proficiency)
 * @returns Skill modifier (ability modifier + proficiency if applicable)
 */
export function calculateSkillModifier(
	character: Pick<Character, "strength_score" | "dexterity_score" | "constitution_score" | "intelligence_score" | "wisdom_score" | "charisma_score" | "level">,
	skillName: string,
	isProficient: boolean = false,
	hasExpertise: boolean = false,
): number {
	const abilityName = SKILL_ABILITY_MAP[skillName];
	if (!abilityName) {
		throw new Error(`Invalid skill name: ${skillName}`);
	}

	// Get ability score from character
	const abilityScore = character[`${abilityName}_score`];
	if (abilityScore === null || abilityScore === undefined) {
		throw new Error(`Missing ability score for ${abilityName}`);
	}

	// Calculate components
	const abilityModifier = calculateAbilityModifier(abilityScore);
	const proficiencyBonus = calculateProficiencyBonus(character.level ?? 1);
	const proficiencyMultiplier = hasExpertise ? 2 : isProficient ? 1 : 0;

	return abilityModifier + proficiencyBonus * proficiencyMultiplier;
}

export interface SkillDetails {
	modifier: number;
	proficient: boolean;
	expertise: boolean;
	ability: string;
	abilityModifier: number;
	proficiencyBonus: number;
}

/**
 * Calculate all 18 skill modifiers for a character
 *
 * @param character Character data
 * @param proficiencies Array of proficiency objects (optional, defaults to checking character proficiency columns)
 * @returns Object with all skill modifiers and details
 */
export function calculateAllSkills(
	character: Character,
	proficiencies?: Array<{ type: string; index: string; expertise?: boolean }>,
): Record<string, SkillDetails> {
	const skills: Record<string, SkillDetails> = {};
	const proficiencyBonus = calculateProficiencyBonus(character.level ?? 1);

	for (const [skillName, abilityName] of Object.entries(SKILL_ABILITY_MAP)) {
		// Check proficiency - either from proficiencies array or character columns
		let isProficient = false;
		let hasExpertise = false;

		if (proficiencies) {
			// Check proficiencies array (future JSON format)
			const prof = proficiencies.find((p) => p.type === "skill" && p.index === skillName);
			isProficient = !!prof;
			hasExpertise = prof?.expertise ?? false;
		} else {
			// Check character columns (current format)
			const profColumnName = `${skillName}_proficiency` as keyof Character;
			isProficient = !!character[profColumnName];
		}

		const abilityScore = character[`${abilityName}_score`];
		const abilityModifier = calculateAbilityModifier(abilityScore ?? 10);
		const proficiencyMultiplier = hasExpertise ? 2 : isProficient ? 1 : 0;

		skills[skillName] = {
			modifier: abilityModifier + proficiencyBonus * proficiencyMultiplier,
			proficient: isProficient,
			expertise: hasExpertise,
			ability: abilityName,
			abilityModifier,
			proficiencyBonus,
		};
	}

	return skills;
}

// ============================================================================
// User Management Functions
// ============================================================================

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

// ============================================================================
// Character Management Functions
// ============================================================================

/**
 * Required fields for creating a new D&D character
 * All other fields from the schema are optional and can be provided
 * Note: Ability modifiers are calculated automatically from scores
 */
export interface CharacterCreationRequired {
	// Basic Identity
	character_name: string;
	class: string;
	species: string;

	// Ability Scores (modifiers calculated automatically)
	strength_score: number;
	dexterity_score: number;
	constitution_score: number;
	intelligence_score: number;
	wisdom_score: number;
	charisma_score: number;

	// Core Combat Stats
	max_hit_points: number;
	armor_class: number;
	speed: number;
	character_size: string; // Tiny, Small, Medium, Large, Huge, Gargantuan
	proficiency_bonus: number;
}

/**
 * Character creation parameters
 * Combines required fields with any optional fields from the character schema
 */
export type CharacterCreationParams = CharacterCreationRequired &
	Partial<
		Omit<
			InsertCharacter,
			| "user_id"
			| "character_id"
			| "character_name"
			| "class"
			| "species"
			| "strength_score"
			| "dexterity_score"
			| "constitution_score"
			| "intelligence_score"
			| "wisdom_score"
			| "charisma_score"
			| "max_hit_points"
			| "armor_class"
			| "speed"
			| "character_size"
			| "proficiency_bonus"
			| "created_at"
			| "updated_at"
		>
	>;

/**
 * Creates a new D&D character with comprehensive starting information
 * Automatically calculates ability modifiers from ability scores
 */
export async function createCharacter(
	db: D1Database,
	userId: string,
	characterData: CharacterCreationParams,
): Promise<Character> {
	const drizzleDb = drizzle(db);

	// Calculate ability modifiers from scores
	const dexterity_modifier = calculateAbilityModifier(characterData.dexterity_score);
	const wisdom_modifier = calculateAbilityModifier(characterData.wisdom_score);

	// Set sensible defaults for optional fields
	const current_hit_points = characterData.current_hit_points ?? characterData.max_hit_points;
	const initiative_modifier = characterData.initiative_modifier ?? dexterity_modifier;
	const passive_perception =
		characterData.passive_perception ?? 10 + wisdom_modifier + (characterData.perception_proficiency ?? 0);

	const result = await drizzleDb
		.insert(characters)
		.values({
			user_id: userId,
			...characterData,
			current_hit_points,
			initiative_modifier,
			passive_perception,
		})
		.returning()
		.get();

	if (!result) {
		throw new Error("Failed to create character");
	}

	return result;
}

/**
 * Retrieves a character by ID
 */
export async function getCharacterById(db: D1Database, characterId: number): Promise<Character | null> {
	const drizzleDb = drizzle(db);
	const result = await drizzleDb
		.select()
		.from(characters)
		.where(eq(characters.character_id, characterId))
		.get();
	return result ?? null;
}

/**
 * Retrieves all characters for a specific user
 */
export async function getCharactersByUserId(db: D1Database, userId: string): Promise<Character[]> {
	const drizzleDb = drizzle(db);
	const result = await drizzleDb.select().from(characters).where(eq(characters.user_id, userId)).all();
	return result;
}

/**
 * Updates a character's data
 */
export async function updateCharacter(
	db: D1Database,
	characterId: number,
	updates: Partial<InsertCharacter>,
): Promise<Character> {
	const drizzleDb = drizzle(db);

	await drizzleDb
		.update(characters)
		.set({
			...updates,
			updated_at: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(characters.character_id, characterId))
		.run();

	const character = await getCharacterById(db, characterId);
	if (!character) {
		throw new Error("Character not found after update");
	}

	return character;
}

/**
 * Deletes a character (cascades to all related items)
 */
export async function deleteCharacter(db: D1Database, characterId: number): Promise<void> {
	const drizzleDb = drizzle(db);
	await drizzleDb.delete(characters).where(eq(characters.character_id, characterId)).run();
}

// ============================================================================
// Weapon Management Functions
// ============================================================================

/**
 * Adds a weapon to a character
 */
export async function addWeapon(
	db: D1Database,
	characterId: number,
	weaponData: Omit<InsertWeapon, "character_id">,
): Promise<Weapon> {
	const drizzleDb = drizzle(db);

	const result = await drizzleDb
		.insert(weapons)
		.values({
			character_id: characterId,
			...weaponData,
		})
		.returning()
		.get();

	if (!result) {
		throw new Error("Failed to add weapon");
	}

	return result;
}

/**
 * Gets all weapons for a character
 */
export async function getCharacterWeapons(db: D1Database, characterId: number): Promise<Weapon[]> {
	const drizzleDb = drizzle(db);
	return await drizzleDb.select().from(weapons).where(eq(weapons.character_id, characterId)).all();
}

/**
 * Updates weapon equipped status
 */
export async function updateWeaponEquipped(
	db: D1Database,
	weaponId: number,
	isEquipped: boolean,
): Promise<void> {
	const drizzleDb = drizzle(db);
	await drizzleDb
		.update(weapons)
		.set({
			is_equipped: isEquipped ? 1 : 0,
			updated_at: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(weapons.weapon_id, weaponId))
		.run();
}

/**
 * Deletes a weapon
 */
export async function deleteWeapon(db: D1Database, weaponId: number): Promise<void> {
	const drizzleDb = drizzle(db);
	await drizzleDb.delete(weapons).where(eq(weapons.weapon_id, weaponId)).run();
}

// ============================================================================
// Spell Management Functions
// ============================================================================

/**
 * Adds a spell to a character
 */
export async function addSpell(
	db: D1Database,
	characterId: number,
	spellData: Omit<typeof spells.$inferInsert, "character_id">,
): Promise<Spell> {
	const drizzleDb = drizzle(db);

	const result = await drizzleDb
		.insert(spells)
		.values({
			character_id: characterId,
			...spellData,
		})
		.returning()
		.get();

	if (!result) {
		throw new Error("Failed to add spell");
	}

	return result;
}

/**
 * Gets all spells for a character
 */
export async function getCharacterSpells(db: D1Database, characterId: number): Promise<Spell[]> {
	const drizzleDb = drizzle(db);
	return await drizzleDb.select().from(spells).where(eq(spells.character_id, characterId)).all();
}

/**
 * Deletes a spell
 */
export async function deleteSpell(db: D1Database, spellId: number): Promise<void> {
	const drizzleDb = drizzle(db);
	await drizzleDb.delete(spells).where(eq(spells.spell_id, spellId)).run();
}

// ============================================================================
// Equipment Management Functions
// ============================================================================

/**
 * Adds equipment to a character
 */
export async function addEquipment(
	db: D1Database,
	characterId: number,
	equipmentData: Omit<typeof equipment.$inferInsert, "character_id">,
): Promise<Equipment> {
	const drizzleDb = drizzle(db);

	const result = await drizzleDb
		.insert(equipment)
		.values({
			character_id: characterId,
			...equipmentData,
		})
		.returning()
		.get();

	if (!result) {
		throw new Error("Failed to add equipment");
	}

	return result;
}

/**
 * Gets all equipment for a character
 */
export async function getCharacterEquipment(db: D1Database, characterId: number): Promise<Equipment[]> {
	const drizzleDb = drizzle(db);
	return await drizzleDb.select().from(equipment).where(eq(equipment.character_id, characterId)).all();
}

/**
 * Updates equipment equipped status
 */
export async function updateEquipmentEquipped(
	db: D1Database,
	equipmentId: number,
	isEquipped: boolean,
): Promise<void> {
	const drizzleDb = drizzle(db);
	await drizzleDb
		.update(equipment)
		.set({
			is_equipped: isEquipped ? 1 : 0,
			updated_at: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(equipment.equipment_id, equipmentId))
		.run();
}

/**
 * Deletes equipment
 */
export async function deleteEquipment(db: D1Database, equipmentId: number): Promise<void> {
	const drizzleDb = drizzle(db);
	await drizzleDb.delete(equipment).where(eq(equipment.equipment_id, equipmentId)).run();
}

// ============================================================================
// Magic Item Management Functions
// ============================================================================

/**
 * Adds a magic item to a character
 */
export async function addMagicItem(
	db: D1Database,
	characterId: number,
	itemData: Omit<typeof magic_items.$inferInsert, "character_id">,
): Promise<MagicItem> {
	const drizzleDb = drizzle(db);

	const result = await drizzleDb
		.insert(magic_items)
		.values({
			character_id: characterId,
			...itemData,
		})
		.returning()
		.get();

	if (!result) {
		throw new Error("Failed to add magic item");
	}

	return result;
}

/**
 * Gets all magic items for a character
 */
export async function getCharacterMagicItems(db: D1Database, characterId: number): Promise<MagicItem[]> {
	const drizzleDb = drizzle(db);
	return await drizzleDb.select().from(magic_items).where(eq(magic_items.character_id, characterId)).all();
}

/**
 * Updates magic item equipped status
 */
export async function updateMagicItemEquipped(
	db: D1Database,
	magicItemId: number,
	isEquipped: boolean,
): Promise<void> {
	const drizzleDb = drizzle(db);
	await drizzleDb
		.update(magic_items)
		.set({
			is_equipped: isEquipped ? 1 : 0,
			updated_at: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(magic_items.magic_item_id, magicItemId))
		.run();
}

/**
 * Updates magic item attunement status
 */
export async function updateMagicItemAttuned(
	db: D1Database,
	magicItemId: number,
	isAttuned: boolean,
): Promise<void> {
	const drizzleDb = drizzle(db);
	await drizzleDb
		.update(magic_items)
		.set({
			is_attuned: isAttuned ? 1 : 0,
			updated_at: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(magic_items.magic_item_id, magicItemId))
		.run();
}

/**
 * Deletes a magic item
 */
export async function deleteMagicItem(db: D1Database, magicItemId: number): Promise<void> {
	const drizzleDb = drizzle(db);
	await drizzleDb.delete(magic_items).where(eq(magic_items.magic_item_id, magicItemId)).run();
}
