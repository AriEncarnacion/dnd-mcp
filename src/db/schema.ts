import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Users table
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

// Characters table
export const characters = sqliteTable("characters", {
	character_id: integer("character_id").primaryKey({ autoIncrement: true }),
	user_id: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),

	// Basic Info
	character_name: text("character_name").notNull(),
	background: text("background"),
	class: text("class"),
	level: integer("level").default(1),
	species: text("species"),
	subclass: text("subclass"),
	xp: integer("xp").default(0),

	// Combat Stats
	armor_class: integer("armor_class"),
	initiative_modifier: integer("initiative_modifier"),
	speed: integer("speed"),
	character_size: text("character_size"), // Tiny, Small, Medium, Large, Huge, Gargantuan
	passive_perception: integer("passive_perception"),
	proficiency_bonus: integer("proficiency_bonus"),

	// Hit Points
	max_hit_points: integer("max_hit_points"),
	current_hit_points: integer("current_hit_points"),
	temp_hit_points: integer("temp_hit_points").default(0),

	// Death Saves
	death_save_successes: integer("death_save_successes").default(0),
	death_save_failures: integer("death_save_failures").default(0),

	// Heroic Inspiration
	heroic_inspiration: integer("heroic_inspiration").default(0),

	// Ability Scores (modifiers calculated via calculateAbilityModifier)
	strength_score: integer("strength_score"),
	dexterity_score: integer("dexterity_score"),
	constitution_score: integer("constitution_score"),
	intelligence_score: integer("intelligence_score"),
	wisdom_score: integer("wisdom_score"),
	charisma_score: integer("charisma_score"),

	// Saving Throw Proficiencies
	str_save_proficiency: integer("str_save_proficiency").default(0),
	dex_save_proficiency: integer("dex_save_proficiency").default(0),
	con_save_proficiency: integer("con_save_proficiency").default(0),
	int_save_proficiency: integer("int_save_proficiency").default(0),
	wis_save_proficiency: integer("wis_save_proficiency").default(0),
	cha_save_proficiency: integer("cha_save_proficiency").default(0),

	// Skill Proficiencies
	athletics_proficiency: integer("athletics_proficiency").default(0),
	acrobatics_proficiency: integer("acrobatics_proficiency").default(0),
	sleight_of_hand_proficiency: integer("sleight_of_hand_proficiency").default(0),
	stealth_proficiency: integer("stealth_proficiency").default(0),
	arcana_proficiency: integer("arcana_proficiency").default(0),
	history_proficiency: integer("history_proficiency").default(0),
	investigation_proficiency: integer("investigation_proficiency").default(0),
	nature_proficiency: integer("nature_proficiency").default(0),
	religion_proficiency: integer("religion_proficiency").default(0),
	animal_handling_proficiency: integer("animal_handling_proficiency").default(0),
	insight_proficiency: integer("insight_proficiency").default(0),
	medicine_proficiency: integer("medicine_proficiency").default(0),
	perception_proficiency: integer("perception_proficiency").default(0),
	survival_proficiency: integer("survival_proficiency").default(0),
	deception_proficiency: integer("deception_proficiency").default(0),
	intimidation_proficiency: integer("intimidation_proficiency").default(0),
	performance_proficiency: integer("performance_proficiency").default(0),
	persuasion_proficiency: integer("persuasion_proficiency").default(0),

	// Armor Training
	light_armor_training: integer("light_armor_training").default(0),
	medium_armor_training: integer("medium_armor_training").default(0),
	heavy_armor_training: integer("heavy_armor_training").default(0),
	shields_training: integer("shields_training").default(0),

	// Character Features & Traits
	class_features: text("class_features"),
	species_traits: text("species_traits"),
	feats: text("feats"),

	// Spellcasting
	spellcasting_ability: text("spellcasting_ability"),
	spellcasting_modifier: integer("spellcasting_modifier"),
	spell_save_dc: integer("spell_save_dc"),
	spell_attack_bonus: integer("spell_attack_bonus"),

	// Spell Slots
	level_1_slots_total: integer("level_1_slots_total").default(0),
	level_1_slots_expended: integer("level_1_slots_expended").default(0),
	level_2_slots_total: integer("level_2_slots_total").default(0),
	level_2_slots_expended: integer("level_2_slots_expended").default(0),
	level_3_slots_total: integer("level_3_slots_total").default(0),
	level_3_slots_expended: integer("level_3_slots_expended").default(0),
	level_4_slots_total: integer("level_4_slots_total").default(0),
	level_4_slots_expended: integer("level_4_slots_expended").default(0),
	level_5_slots_total: integer("level_5_slots_total").default(0),
	level_5_slots_expended: integer("level_5_slots_expended").default(0),
	level_6_slots_total: integer("level_6_slots_total").default(0),
	level_6_slots_expended: integer("level_6_slots_expended").default(0),
	level_7_slots_total: integer("level_7_slots_total").default(0),
	level_7_slots_expended: integer("level_7_slots_expended").default(0),
	level_8_slots_total: integer("level_8_slots_total").default(0),
	level_8_slots_expended: integer("level_8_slots_expended").default(0),
	level_9_slots_total: integer("level_9_slots_total").default(0),
	level_9_slots_expended: integer("level_9_slots_expended").default(0),

	// Page 2 Info
	alignment: text("alignment"),
	languages: text("languages"),
	appearance: text("appearance"),
	backstory_personality: text("backstory_personality"),

	// Coins
	copper_pieces: integer("copper_pieces").default(0),
	silver_pieces: integer("silver_pieces").default(0),
	electrum_pieces: integer("electrum_pieces").default(0),
	gold_pieces: integer("gold_pieces").default(0),
	platinum_pieces: integer("platinum_pieces").default(0),

	// Metadata
	created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
	updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Weapons table
export const weapons = sqliteTable("weapons", {
	weapon_id: integer("weapon_id").primaryKey({ autoIncrement: true }),
	character_id: integer("character_id")
		.notNull()
		.references(() => characters.character_id, { onDelete: "cascade" }),
	weapon_name: text("weapon_name").notNull(),
	attack_bonus: integer("attack_bonus"),
	damage_dice: text("damage_dice"),
	damage_type: text("damage_type"),
	notes: text("notes"),
	is_equipped: integer("is_equipped").default(0),
	created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
	updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Spells table
export const spells = sqliteTable("spells", {
	spell_id: integer("spell_id").primaryKey({ autoIncrement: true }),
	character_id: integer("character_id")
		.notNull()
		.references(() => characters.character_id, { onDelete: "cascade" }),
	spell_level: integer("spell_level").notNull(), // 0 for cantrips
	spell_name: text("spell_name").notNull(),
	casting_time: text("casting_time"),
	spell_range: text("spell_range"),
	is_concentration: integer("is_concentration").default(0),
	is_ritual: integer("is_ritual").default(0),
	requires_material: integer("requires_material").default(0),
	notes: text("notes"),
	created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
	updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Equipment table
export const equipment = sqliteTable("equipment", {
	equipment_id: integer("equipment_id").primaryKey({ autoIncrement: true }),
	character_id: integer("character_id")
		.notNull()
		.references(() => characters.character_id, { onDelete: "cascade" }),
	item_name: text("item_name").notNull(),
	quantity: integer("quantity").default(1),
	description: text("description"),
	is_equipped: integer("is_equipped").default(0),
	created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
	updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Magic Items table
export const magic_items = sqliteTable("magic_items", {
	magic_item_id: integer("magic_item_id").primaryKey({ autoIncrement: true }),
	character_id: integer("character_id")
		.notNull()
		.references(() => characters.character_id, { onDelete: "cascade" }),
	item_name: text("item_name").notNull(),
	is_attuned: integer("is_attuned").default(0),
	is_equipped: integer("is_equipped").default(0),
	description: text("description"),
	created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
	updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Weapon Proficiencies table
export const weapon_proficiencies = sqliteTable("weapon_proficiencies", {
	proficiency_id: integer("proficiency_id").primaryKey({ autoIncrement: true }),
	character_id: integer("character_id")
		.notNull()
		.references(() => characters.character_id, { onDelete: "cascade" }),
	weapon_name: text("weapon_name").notNull(),
	created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
	updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Tool Proficiencies table
export const tool_proficiencies = sqliteTable("tool_proficiencies", {
	proficiency_id: integer("proficiency_id").primaryKey({ autoIncrement: true }),
	character_id: integer("character_id")
		.notNull()
		.references(() => characters.character_id, { onDelete: "cascade" }),
	tool_name: text("tool_name").notNull(),
	created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
	updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Character = typeof characters.$inferSelect;
export type InsertCharacter = typeof characters.$inferInsert;

export type Weapon = typeof weapons.$inferSelect;
export type InsertWeapon = typeof weapons.$inferInsert;

export type Spell = typeof spells.$inferSelect;
export type InsertSpell = typeof spells.$inferInsert;

export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = typeof equipment.$inferInsert;

export type MagicItem = typeof magic_items.$inferSelect;
export type InsertMagicItem = typeof magic_items.$inferInsert;

export type WeaponProficiency = typeof weapon_proficiencies.$inferSelect;
export type InsertWeaponProficiency = typeof weapon_proficiencies.$inferInsert;

export type ToolProficiency = typeof tool_proficiencies.$inferSelect;
export type InsertToolProficiency = typeof tool_proficiencies.$inferInsert;
