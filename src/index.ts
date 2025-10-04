import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Octokit } from "octokit";
import { z } from "zod";
import { GitHubHandler } from "./github-handler";
import { Props } from "./utils";
import {
	getUserById,
	updateUserInfo,
	createCharacter,
	getCharacterById,
	getCharactersByUserId,
	updateCharacter,
	deleteCharacter,
	addWeapon,
	addSpell,
} from "./db";

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props

const ALLOWED_USERNAMES = new Set<string>([
	// Add GitHub usernames of users who should have access to the image generation tool
	// For example: 'yourusername', 'coworkerusername'
]);

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "DnD MCP Server",
		version: "1.0.0",
	});

	async init() {
		// userInfo get user info test
		this.server.tool(
			"userInfo",
			"Get user info from GitHub, via Octokit",
			{},
			async () => {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(this.props, null, 2),
						},
					],
				};
			},
		);
		
		// Hello, world!
		this.server.tool(
			"add",
			"Add two numbers the way only MCP can",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ text: String(a + b), type: "text" }],
			}),
		);

		// Use the upstream access token to facilitate tools
		this.server.tool(
			"userInfoOctokit",
			"Get user info from GitHub, via Octokit",
			{},
			async () => {
				const octokit = new Octokit({ auth: this.props!.accessToken });
				return {
					content: [
						{
							text: JSON.stringify(await octokit.rest.users.getAuthenticated()),
							type: "text",
						},
					],
				};
			},
		);

		// Get user data from D1 database
		this.server.tool(
			"userGet",
			"Get the authenticated user's information from the D1 database (excludes GitHub OAuth data)",
			{},
			async () => {
				const user = await getUserById(this.env["DND-MCP-DB-BINDING"], this.props!.dbUserId);
				if (!user) {
					return {
						content: [
							{
								type: "text",
								text: "User not found in database",
							},
						],
						isError: true,
					};
				}

				// Exclude sensitive fields if needed
				const { id, github_id, github_login, name, email, username, avatar_url, bio, created_at, updated_at } = user;
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ id, github_id, github_login, name, email, username, avatar_url, bio, created_at, updated_at },
								null,
								2,
							),
						},
					],
				};
			},
		);

		// Update user information
		this.server.tool(
			"userUpdateInfo",
			"Update the authenticated user's name, username, or email in the D1 database. Provide only the fields you want to update.",
			{
				name: z.string().describe("The user's display name").default(""),
				username: z.string().describe("The user's unique username").default(""),
				email: z.string().email().describe("The user's email address").default(""),
			},
			async ({ name, username, email }) => {
				try {
					// Only include non-empty fields in the update
					const updateParams: { name?: string; username?: string; email?: string } = {};
					if (name && name.trim()) updateParams.name = name;
					if (username && username.trim()) updateParams.username = username;
					if (email && email.trim()) updateParams.email = email;

					if (Object.keys(updateParams).length === 0) {
						return {
							content: [
								{
									type: "text",
									text: "No fields to update. Please provide at least one field (name, username, or email).",
								},
							],
							isError: true,
						};
					}

					const updatedUser = await updateUserInfo(this.env["DND-MCP-DB-BINDING"], this.props!.dbUserId, updateParams);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(updatedUser, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to update user: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// ============================================================================
		// Character Management Tools
		// ============================================================================

		// Create a new D&D character
		this.server.tool(
			"charCreate",
			"Create a new D&D 2014 character with comprehensive starting information. User should roll dice themselves and provide the numbers. Ability modifiers are calculated automatically.",
			{
				// Basic Identity (required)
				character_name: z.string().describe("The character's name"),
				class: z.string().describe("The character's class (e.g., Fighter, Wizard, Rogue)"),
				species: z.string().describe("The character's species/race (e.g., Human, Elf, Dwarf)"),

				// Ability Scores (required - modifiers calculated automatically)
				strength_score: z.number().describe("Strength ability score (typically 8-20)"),
				dexterity_score: z.number().describe("Dexterity ability score (typically 8-20)"),
				constitution_score: z.number().describe("Constitution ability score (typically 8-20)"),
				intelligence_score: z.number().describe("Intelligence ability score (typically 8-20)"),
				wisdom_score: z.number().describe("Wisdom ability score (typically 8-20)"),
				charisma_score: z.number().describe("Charisma ability score (typically 8-20)"),

				// Core Combat Stats (required)
				max_hit_points: z.number().describe("Maximum hit points"),
				armor_class: z.number().describe("Armor class (AC)"),
				speed: z.number().describe("Movement speed in feet (typically 30)"),
				character_size: z.string().describe("Size category: Tiny, Small, Medium, Large, Huge, or Gargantuan"),
				proficiency_bonus: z.number().describe("Proficiency bonus (typically +2 at level 1)"),

				// Optional Common Fields
				level: z.number().default(1).describe("Character level (default: 1)"),
				background: z.string().default("").describe("Character background (e.g., Soldier, Acolyte)"),
				alignment: z.string().default("").describe("Character alignment (e.g., Lawful Good, Chaotic Neutral)"),
				languages: z.string().default("").describe("Known languages, comma-separated"),
				appearance: z.string().default("").describe("Physical appearance description"),
				backstory_personality: z.string().default("").describe("Backstory and personality traits"),

				// Starting Currency (optional)
				copper_pieces: z.number().default(0).describe("Starting copper pieces"),
				silver_pieces: z.number().default(0).describe("Starting silver pieces"),
				gold_pieces: z.number().default(0).describe("Starting gold pieces"),
				platinum_pieces: z.number().default(0).describe("Starting platinum pieces"),
			},
			async (params) => {
				try {
					const character = await createCharacter(
						this.env["DND-MCP-DB-BINDING"],
						this.props!.dbUserId,
						params,
					);

					return {
						content: [
							{
								type: "text",
								text: `Character created successfully!\n\n${JSON.stringify(
									{
										character_id: character.character_id,
										character_name: character.character_name,
										class: character.class,
										species: character.species,
										level: character.level,
									},
									null,
									2,
								)}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to create character: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// List all user's characters
		this.server.tool(
			"charList",
			"List all D&D characters for the authenticated user",
			{},
			async () => {
				try {
					const characters = await getCharactersByUserId(this.env["DND-MCP-DB-BINDING"], this.props!.dbUserId);

					if (characters.length === 0) {
						return {
							content: [
								{
									type: "text",
									text: "No characters found. Use charCreate to create your first character!",
								},
							],
						};
					}

					// Return basic info for each character
					const characterList = characters.map((char) => ({
						character_id: char.character_id,
						character_name: char.character_name,
						class: char.class,
						species: char.species,
						level: char.level,
					}));

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(characterList, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to list characters: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Get full character details
		this.server.tool(
			"charGet",
			"Get complete details for a specific D&D character by ID",
			{
				character_id: z.number().describe("The character's unique ID"),
			},
			async ({ character_id }) => {
				try {
					const character = await getCharacterById(this.env["DND-MCP-DB-BINDING"], character_id);

					if (!character) {
						return {
							content: [
								{
									type: "text",
									text: `Character with ID ${character_id} not found`,
								},
							],
							isError: true,
						};
					}

					// Verify ownership
					if (character.user_id !== this.props!.dbUserId) {
						return {
							content: [
								{
									type: "text",
									text: "You don't have permission to view this character",
								},
							],
							isError: true,
						};
					}

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(character, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to get character: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Update character (common fields)
		this.server.tool(
			"charUpdate",
			"Update commonly changed character fields (HP, XP, level, currency, death saves, spell slots). Provide only the fields you want to update.",
			{
				character_id: z.number().describe("The character's unique ID"),
				// Hit Points
				current_hit_points: z.number().optional().describe("Current hit points"),
				max_hit_points: z.number().optional().describe("Maximum hit points"),
				temp_hit_points: z.number().optional().describe("Temporary hit points"),
				// Progression
				xp: z.number().optional().describe("Experience points"),
				level: z.number().optional().describe("Character level"),
				// Death Saves
				death_save_successes: z.number().optional().describe("Death save successes (0-3)"),
				death_save_failures: z.number().optional().describe("Death save failures (0-3)"),
				// Currency
				copper_pieces: z.number().optional().describe("Copper pieces"),
				silver_pieces: z.number().optional().describe("Silver pieces"),
				gold_pieces: z.number().optional().describe("Gold pieces"),
				platinum_pieces: z.number().optional().describe("Platinum pieces"),
				// Spell Slots
				level_1_slots_expended: z.number().optional().describe("Level 1 spell slots used"),
				level_2_slots_expended: z.number().optional().describe("Level 2 spell slots used"),
				level_3_slots_expended: z.number().optional().describe("Level 3 spell slots used"),
				level_4_slots_expended: z.number().optional().describe("Level 4 spell slots used"),
				level_5_slots_expended: z.number().optional().describe("Level 5 spell slots used"),
			},
			async (params) => {
				try {
					const { character_id, ...updates } = params;

					// Verify character exists and user owns it
					const character = await getCharacterById(this.env["DND-MCP-DB-BINDING"], character_id);
					if (!character) {
						return {
							content: [
								{
									type: "text",
									text: `Character with ID ${character_id} not found`,
								},
							],
							isError: true,
						};
					}

					if (character.user_id !== this.props!.dbUserId) {
						return {
							content: [
								{
									type: "text",
									text: "You don't have permission to update this character",
								},
							],
							isError: true,
						};
					}

					// Filter out undefined values (only update explicitly provided fields)
					const updateData: Record<string, any> = {};
					for (const [key, value] of Object.entries(updates)) {
						if (value !== undefined) {
							updateData[key] = value;
						}
					}

					if (Object.keys(updateData).length === 0) {
						return {
							content: [
								{
									type: "text",
									text: "No fields to update. Provide at least one field.",
								},
							],
							isError: true,
						};
					}

					const updatedCharacter = await updateCharacter(this.env["DND-MCP-DB-BINDING"], character_id, updateData);

					return {
						content: [
							{
								type: "text",
								text: `Character updated successfully!\n\n${JSON.stringify(
									{
										character_id: updatedCharacter.character_id,
										character_name: updatedCharacter.character_name,
										updated_fields: Object.keys(updateData),
									},
									null,
									2,
								)}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to update character: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Delete character
		this.server.tool(
			"charDelete",
			"Delete a D&D character and all associated items (weapons, spells, equipment). This action cannot be undone.",
			{
				character_id: z.number().describe("The character's unique ID"),
			},
			async ({ character_id }) => {
				try {
					// Verify character exists and user owns it
					const character = await getCharacterById(this.env["DND-MCP-DB-BINDING"], character_id);
					if (!character) {
						return {
							content: [
								{
									type: "text",
									text: `Character with ID ${character_id} not found`,
								},
							],
							isError: true,
						};
					}

					if (character.user_id !== this.props!.dbUserId) {
						return {
							content: [
								{
									type: "text",
									text: "You don't have permission to delete this character",
								},
							],
							isError: true,
						};
					}

					await deleteCharacter(this.env["DND-MCP-DB-BINDING"], character_id);

					return {
						content: [
							{
								type: "text",
								text: `Character "${character.character_name}" (ID: ${character_id}) has been deleted successfully. All associated items have been removed.`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to delete character: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Add weapon to character
		this.server.tool(
			"charAddWeapon",
			"Add a weapon to a D&D character's inventory",
			{
				character_id: z.number().describe("The character's unique ID"),
				weapon_name: z.string().describe("Name of the weapon (e.g., Longsword, Shortbow)"),
				attack_bonus: z.number().default(0).describe("Attack bonus (ability modifier + proficiency if proficient)"),
				damage_dice: z.string().default("").describe("Damage dice (e.g., 1d8, 2d6)"),
				damage_type: z.string().default("").describe("Damage type (e.g., slashing, piercing, bludgeoning)"),
				notes: z.string().default("").describe("Additional notes (e.g., properties, magical effects)"),
				is_equipped: z.number().default(0).describe("Whether weapon is equipped (1) or in inventory (0)"),
			},
			async (params) => {
				try {
					const { character_id, ...weaponData } = params;

					// Verify character exists and user owns it
					const character = await getCharacterById(this.env["DND-MCP-DB-BINDING"], character_id);
					if (!character) {
						return {
							content: [
								{
									type: "text",
									text: `Character with ID ${character_id} not found`,
								},
							],
							isError: true,
						};
					}

					if (character.user_id !== this.props!.dbUserId) {
						return {
							content: [
								{
									type: "text",
									text: "You don't have permission to modify this character",
								},
							],
							isError: true,
						};
					}

					const weapon = await addWeapon(this.env["DND-MCP-DB-BINDING"], character_id, weaponData);

					return {
						content: [
							{
								type: "text",
								text: `Weapon added successfully!\n\n${JSON.stringify(
									{
										weapon_id: weapon.weapon_id,
										weapon_name: weapon.weapon_name,
										attack_bonus: weapon.attack_bonus,
										damage_dice: weapon.damage_dice,
										damage_type: weapon.damage_type,
									},
									null,
									2,
								)}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to add weapon: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Add spell to character
		this.server.tool(
			"charAddSpell",
			"Add a spell to a D&D character's spell list",
			{
				character_id: z.number().describe("The character's unique ID"),
				spell_level: z.number().describe("Spell level (0 for cantrips, 1-9 for leveled spells)"),
				spell_name: z.string().describe("Name of the spell (e.g., Fireball, Cure Wounds)"),
				casting_time: z.string().default("").describe("Casting time (e.g., 1 action, 1 bonus action, 1 minute)"),
				spell_range: z.string().default("").describe("Range (e.g., 60 feet, Self, Touch)"),
				is_concentration: z.number().default(0).describe("Requires concentration (1) or not (0)"),
				is_ritual: z.number().default(0).describe("Can be cast as ritual (1) or not (0)"),
				requires_material: z.number().default(0).describe("Requires material components (1) or not (0)"),
				notes: z.string().default("").describe("Additional notes (e.g., spell description, material components)"),
			},
			async (params) => {
				try {
					const { character_id, ...spellData } = params;

					// Verify character exists and user owns it
					const character = await getCharacterById(this.env["DND-MCP-DB-BINDING"], character_id);
					if (!character) {
						return {
							content: [
								{
									type: "text",
									text: `Character with ID ${character_id} not found`,
								},
							],
							isError: true,
						};
					}

					if (character.user_id !== this.props!.dbUserId) {
						return {
							content: [
								{
									type: "text",
									text: "You don't have permission to modify this character",
								},
							],
							isError: true,
						};
					}

					const spell = await addSpell(this.env["DND-MCP-DB-BINDING"], character_id, spellData);

					return {
						content: [
							{
								type: "text",
								text: `Spell added successfully!\n\n${JSON.stringify(
									{
										spell_id: spell.spell_id,
										spell_name: spell.spell_name,
										spell_level: spell.spell_level,
										casting_time: spell.casting_time,
										spell_range: spell.spell_range,
									},
									null,
									2,
								)}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to add spell: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Dynamically add tools based on the user's login. In this case, I want to limit
		// access to my Image Generation tool to just me
		if (ALLOWED_USERNAMES.has(this.props!.login)) {
			this.server.tool(
				"generateImage",
				"Generate an image using the `flux-1-schnell` model. Works best with 8 steps.",
				{
					prompt: z
						.string()
						.describe("A text description of the image you want to generate."),
					steps: z
						.number()
						.min(4)
						.max(8)
						.default(4)
						.describe(
							"The number of diffusion steps; higher values can improve quality but take longer. Must be between 4 and 8, inclusive.",
						),
				},
				async ({ prompt, steps }) => {
					const response = await this.env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
						prompt,
						steps,
					});

					return {
						content: [{ data: response.image!, mimeType: "image/jpeg", type: "image" }],
					};
				},
			);
		}
	}
}

export default new OAuthProvider({
	apiHandlers: {
		"/mcp": MyMCP.serve("/mcp"), // Streamable-HTTP protocol
	},
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GitHubHandler as any,
	tokenEndpoint: "/token",
});
