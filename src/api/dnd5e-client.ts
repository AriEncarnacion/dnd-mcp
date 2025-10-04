/**
 * D&D 5e SRD API Client
 *
 * Fetches reference data from the community-maintained D&D 5e API
 * https://5e-bits.github.io/docs/introduction
 *
 * Implements caching to minimize API calls and improve performance.
 */

const BASE_URL = "https://www.dnd5eapi.co/api";

interface CacheEntry<T> {
	data: T;
	expires: number;
}

export class DnD5eAPIClient {
	private cache = new Map<string, CacheEntry<any>>();
	private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

	/**
	 * Fetch with caching
	 */
	private async fetchWithCache<T>(endpoint: string): Promise<T> {
		const cacheKey = endpoint;
		const now = Date.now();

		// Check in-memory cache
		const cached = this.cache.get(cacheKey);
		if (cached && cached.expires > now) {
			return cached.data as T;
		}

		// Fetch from API
		try {
			const response = await fetch(`${BASE_URL}${endpoint}`);
			if (!response.ok) {
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			const data = await response.json();

			// Store in cache
			this.cache.set(cacheKey, {
				data,
				expires: now + this.cacheTTL,
			});

			return data as T;
		} catch (error) {
			// If fetch fails but we have stale cache, return it
			if (cached) {
				console.warn(`API fetch failed, returning stale cache for ${endpoint}`, error);
				return cached.data as T;
			}
			throw error;
		}
	}

	// ============================================================================
	// Races
	// ============================================================================

	async getRaces(): Promise<{ count: number; results: Array<{ index: string; name: string; url: string }> }> {
		return this.fetchWithCache("/races");
	}

	async getRace(index: string): Promise<Race> {
		return this.fetchWithCache(`/races/${index}`);
	}

	async getSubraces(raceIndex: string): Promise<{ count: number; results: Array<{ index: string; name: string }> }> {
		const race = await this.getRace(raceIndex);
		return { count: race.subraces.length, results: race.subraces };
	}

	async getSubrace(index: string): Promise<Subrace> {
		return this.fetchWithCache(`/subraces/${index}`);
	}

	// ============================================================================
	// Classes
	// ============================================================================

	async getClasses(): Promise<{ count: number; results: Array<{ index: string; name: string; url: string }> }> {
		return this.fetchWithCache("/classes");
	}

	async getClass(index: string): Promise<Class> {
		return this.fetchWithCache(`/classes/${index}`);
	}

	async getClassLevel(classIndex: string, level: number): Promise<ClassLevel> {
		return this.fetchWithCache(`/classes/${classIndex}/levels/${level}`);
	}

	async getSubclasses(classIndex: string): Promise<{
		count: number;
		results: Array<{ index: string; name: string }>;
	}> {
		const classData = await this.getClass(classIndex);
		return { count: classData.subclasses.length, results: classData.subclasses };
	}

	async getSubclass(index: string): Promise<Subclass> {
		return this.fetchWithCache(`/subclasses/${index}`);
	}

	// ============================================================================
	// Skills & Proficiencies
	// ============================================================================

	async getSkills(): Promise<{ count: number; results: Array<{ index: string; name: string; url: string }> }> {
		return this.fetchWithCache("/skills");
	}

	async getSkill(index: string): Promise<Skill> {
		return this.fetchWithCache(`/skills/${index}`);
	}

	async getProficiency(index: string): Promise<Proficiency> {
		return this.fetchWithCache(`/proficiencies/${index}`);
	}

	// ============================================================================
	// Spells
	// ============================================================================

	async getSpells(): Promise<{ count: number; results: Array<{ index: string; name: string; url: string }> }> {
		return this.fetchWithCache("/spells");
	}

	async getSpell(index: string): Promise<Spell> {
		return this.fetchWithCache(`/spells/${index}`);
	}

	// ============================================================================
	// Equipment
	// ============================================================================

	async getEquipment(): Promise<{ count: number; results: Array<{ index: string; name: string; url: string }> }> {
		return this.fetchWithCache("/equipment");
	}

	async getEquipmentItem(index: string): Promise<Equipment> {
		return this.fetchWithCache(`/equipment/${index}`);
	}

	async getMagicItems(): Promise<{ count: number; results: Array<{ index: string; name: string; url: string }> }> {
		return this.fetchWithCache("/magic-items");
	}

	async getMagicItem(index: string): Promise<MagicItem> {
		return this.fetchWithCache(`/magic-items/${index}`);
	}

	// ============================================================================
	// Features & Traits
	// ============================================================================

	async getFeature(index: string): Promise<Feature> {
		return this.fetchWithCache(`/features/${index}`);
	}

	async getTrait(index: string): Promise<Trait> {
		return this.fetchWithCache(`/traits/${index}`);
	}

	// ============================================================================
	// Utility Methods
	// ============================================================================

	/**
	 * Clear the cache (useful for testing or forcing refresh)
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { size: number; keys: string[] } {
		return {
			size: this.cache.size,
			keys: Array.from(this.cache.keys()),
		};
	}
}

// ============================================================================
// TypeScript Interfaces for API Responses
// ============================================================================

export interface Race {
	index: string;
	name: string;
	speed: number;
	size: string;
	size_description: string;
	ability_bonuses: Array<{
		ability_score: { index: string; name: string };
		bonus: number;
	}>;
	age: string;
	alignment: string;
	language_desc: string;
	languages: Array<{ index: string; name: string }>;
	language_options?: {
		choose: number;
		from: { option_set_type: string; options: Array<{ item: { index: string; name: string } }> };
	};
	traits: Array<{ index: string; name: string }>;
	subraces: Array<{ index: string; name: string }>;
	starting_proficiencies: Array<{ index: string; name: string }>;
	starting_proficiency_options?: {
		choose: number;
		from: { option_set_type: string; options: Array<{ item: { index: string; name: string } }> };
	};
}

export interface Subrace {
	index: string;
	name: string;
	race: { index: string; name: string };
	desc: string;
	ability_bonuses: Array<{
		ability_score: { index: string; name: string };
		bonus: number;
	}>;
	starting_proficiencies: Array<{ index: string; name: string }>;
	languages: Array<{ index: string; name: string }>;
	racial_traits: Array<{ index: string; name: string }>;
}

export interface Class {
	index: string;
	name: string;
	hit_die: number;
	proficiency_choices: Array<{
		choose: number;
		from: { option_set_type: string; options: Array<{ item: { index: string; name: string } }> };
	}>;
	proficiencies: Array<{ index: string; name: string }>;
	saving_throws: Array<{ index: string; name: string }>;
	starting_equipment: Array<{
		equipment: { index: string; name: string };
		quantity: number;
	}>;
	starting_equipment_options: any[];
	class_levels: string;
	multi_classing: {
		prerequisites: any[];
		proficiencies: Array<{ index: string; name: string }>;
	};
	subclasses: Array<{ index: string; name: string }>;
	spellcasting?: {
		level: number;
		spellcasting_ability: { index: string; name: string };
		info: Array<{ name: string; desc: string[] }>;
	};
}

export interface ClassLevel {
	level: number;
	ability_score_bonuses: number;
	prof_bonus: number;
	features: Array<{ index: string; name: string }>;
	spellcasting?: {
		cantrips_known?: number;
		spells_known?: number;
		spell_slots_level_1?: number;
		spell_slots_level_2?: number;
		spell_slots_level_3?: number;
		spell_slots_level_4?: number;
		spell_slots_level_5?: number;
		spell_slots_level_6?: number;
		spell_slots_level_7?: number;
		spell_slots_level_8?: number;
		spell_slots_level_9?: number;
	};
	class_specific?: any;
}

export interface Subclass {
	index: string;
	name: string;
	class: { index: string; name: string };
	subclass_flavor: string;
	desc: string[];
	subclass_levels: string;
	spells?: Array<{
		prerequisites: any[];
		spell: { index: string; name: string };
	}>;
}

export interface Skill {
	index: string;
	name: string;
	desc: string[];
	ability_score: { index: string; name: string };
}

export interface Proficiency {
	index: string;
	name: string;
	type: string;
	classes: Array<{ index: string; name: string }>;
	races: Array<{ index: string; name: string }>;
	reference?: { index: string; name: string };
}

export interface Spell {
	index: string;
	name: string;
	level: number;
	school: { index: string; name: string };
	casting_time: string;
	range: string;
	components: string[];
	material?: string;
	duration: string;
	concentration: boolean;
	ritual: boolean;
	attack_type?: string;
	damage?: {
		damage_type: { index: string; name: string };
		damage_at_slot_level?: Record<string, string>;
		damage_at_character_level?: Record<string, string>;
	};
	dc?: {
		dc_type: { index: string; name: string };
		dc_success: string;
	};
	area_of_effect?: {
		type: string;
		size: number;
	};
	classes: Array<{ index: string; name: string }>;
	subclasses: Array<{ index: string; name: string }>;
	desc: string[];
	higher_level?: string[];
}

export interface Equipment {
	index: string;
	name: string;
	equipment_category: { index: string; name: string };
	weapon_category?: string;
	weapon_range?: string;
	category_range?: string;
	cost?: {
		quantity: number;
		unit: string;
	};
	damage?: {
		damage_dice: string;
		damage_type: { index: string; name: string };
	};
	range?: {
		normal: number;
		long?: number;
	};
	weight?: number;
	properties?: Array<{ index: string; name: string }>;
	armor_category?: string;
	armor_class?: {
		base: number;
		dex_bonus: boolean;
		max_bonus?: number;
	};
	str_minimum?: number;
	stealth_disadvantage?: boolean;
	desc?: string[];
}

export interface MagicItem {
	index: string;
	name: string;
	equipment_category: { index: string; name: string };
	rarity: { name: string };
	variants: any[];
	variant: boolean;
	desc: string[];
}

export interface Feature {
	index: string;
	name: string;
	level: number;
	class: { index: string; name: string };
	subclass?: { index: string; name: string };
	desc: string[];
	prerequisites?: any[];
}

export interface Trait {
	index: string;
	name: string;
	races: Array<{ index: string; name: string }>;
	subraces: Array<{ index: string; name: string }>;
	desc: string[];
	proficiencies?: Array<{ index: string; name: string }>;
	proficiency_choices?: {
		choose: number;
		from: { option_set_type: string; options: Array<{ item: { index: string; name: string } }> };
	};
}

// Export singleton instance
export const dnd5eApi = new DnD5eAPIClient();
