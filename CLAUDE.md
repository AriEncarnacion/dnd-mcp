# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a D&D-themed MCP (Model Context Protocol) server deployed on Cloudflare Workers. It provides remote MCP functionality with GitHub OAuth authentication built-in. The server acts as both an OAuth server to MCP clients and an OAuth client to GitHub.

## Common Commands

### Development
- `npm run dev` - Start local development server on http://localhost:8788
- `npm run start` - Alias for `npm run dev`
- `wrangler dev` - Alternative way to start local development

### Deployment
- `npm run deploy` - Deploy the MCP server to Cloudflare Workers
- `wrangler deploy` - Alternative way to deploy

### Type Checking
- `npm run type-check` - Run TypeScript type checking without emitting files
- `npm run cf-typegen` - Generate TypeScript types for Cloudflare Workers

### Testing the MCP Server
- `npx @modelcontextprotocol/inspector@latest` - Open MCP Inspector to test server tools
  - For production: Use `https://dnd-mcp.ari-encarnacion-95.workers.dev/mcp`
  - For local: Use `http://localhost:8788/mcp`

### D1 Database Management (Drizzle ORM)
- `npx drizzle-kit generate` - Generate migration from schema changes
- `npx drizzle-kit push` - Push schema changes directly (dev only)
- `wrangler d1 migrations apply dnd-mcp --local` - Apply migrations locally
- `wrangler d1 migrations apply dnd-mcp --remote` - Apply migrations to production
- `wrangler d1 execute dnd-mcp --local --command="SELECT * FROM users"` - Query local database
- `wrangler d1 execute dnd-mcp --remote --command="SELECT * FROM users"` - Query production database

### Drizzle Configuration
- `drizzle.config.ts` - Drizzle Kit configuration
- `src/db/schema.ts` - Database schema definitions
- Migrations stored in `drizzle/migrations/`
- Schema changes: Update `src/db/schema.ts`, run `npx drizzle-kit generate`, then apply migrations

## Architecture

### Core Components

**src/index.ts** - Main entry point that defines the MCP server
- Exports `MyMCP` class extending `McpAgent` from `agents/mcp`
- Defines MCP tools via `this.server.tool()` in the `init()` method
- Tools have access to GitHub user info via `this.props` (contains user data from OAuth)
- Can conditionally expose tools based on user identity (see `ALLOWED_USERNAMES`)
- Exports `OAuthProvider` as default with routing configuration

**src/github-handler.ts** - OAuth flow implementation
- Hono app handling GitHub OAuth endpoints:
  - `GET /authorize` - Initial authorization (shows approval dialog if not cached)
  - `POST /authorize` - Form submission after user approves
  - `GET /callback` - GitHub OAuth callback that exchanges code for access token
- Stores user metadata (id, login, name, email, avatar_url, bio, accessToken) in `props`
- Uses signed cookies to cache client approvals

**src/utils.ts** - OAuth utility functions
- `getUpstreamAuthorizeUrl()` - Constructs GitHub authorization URLs
- `fetchUpstreamAuthToken()` - Exchanges OAuth code for access token
- Defines `Props` type for user context available in MCP tools

**src/workers-oauth-utils.ts** - Cookie management and approval UI
- `clientIdAlreadyApproved()` - Checks if client was previously approved via signed cookie
- `renderApprovalDialog()` - Generates HTML approval UI showing client info
- `parseRedirectApproval()` - Processes approval form and sets signed cookies
- Uses HMAC-SHA256 for cookie signing/verification

**src/db/** - D1 database layer using Drizzle ORM
- `src/db/schema.ts` - Drizzle schema definitions for all 8 tables (users + 7 character tables). Ability modifiers are NOT stored in the database (calculated on-the-fly from scores).
- `src/db/index.ts` - Database operations:
  - Utility functions:
    - `calculateAbilityModifier(score)` - Converts ability score to modifier using formula `floor((score - 10) / 2)`
    - `calculateProficiencyBonus(level)` - Calculates proficiency bonus from level: `floor((level - 1) / 4) + 2`
    - `calculateSkillModifier(character, skillName, isProficient, hasExpertise)` - Calculates single skill modifier
    - `calculateAllSkills(character, proficiencies?)` - Calculates all 18 skill modifiers with details
    - `SKILL_ABILITY_MAP` - Maps 18 D&D skills to their associated ability scores
  - User management: `upsertUser()`, `getUserByGithubId()`, `getUserById()`, `updateUserInfo()`
  - Character management: `createCharacter()` (uses `CharacterCreationParams` interface, auto-calculates modifiers), `getCharacterById()`, `getCharactersByUserId()`, `updateCharacter()`, `deleteCharacter()`
  - Weapon management: `addWeapon()`, `getCharacterWeapons()`, `updateWeaponEquipped()`, `deleteWeapon()`
  - Spell management: `addSpell()`, `getCharacterSpells()`, `deleteSpell()`
  - Equipment management: `addEquipment()`, `getCharacterEquipment()`, `updateEquipmentEquipped()`, `deleteEquipment()`
  - Magic item management: `addMagicItem()`, `getCharacterMagicItems()`, `updateMagicItemEquipped()`, `updateMagicItemAttuned()`, `deleteMagicItem()`
  - Exports TypeScript types: `User`, `Character`, `Weapon`, `Spell`, `Equipment`, `MagicItem`, `CharacterCreationParams`, `SkillDetails`

**src/api/** - D&D 5e SRD API integration
- `src/api/dnd5e-client.ts` - API client for fetching D&D reference data from https://www.dnd5eapi.co/api/
  - Implements in-memory caching (24hr TTL) for all API requests
  - Graceful degradation: returns stale cache if API is down
  - Methods: `getRaces()`, `getRace()`, `getClasses()`, `getClass()`, `getClassLevel()`, `getSkills()`, `getSpells()`, `getEquipment()`, etc.
  - Exports TypeScript interfaces: `Race`, `Subrace`, `Class`, `Subclass`, `ClassLevel`, `Skill`, `Spell`, `Equipment`, etc.
  - Singleton instance exported as `dnd5eApi`

### Key Technologies

- **Cloudflare Workers** - Serverless runtime
- **Durable Objects** - Persistent MCP state (`MyMCP` extends `McpAgent`)
- **D1 Database** - SQL database for user management (binding: `DND-MCP-DB-BINDING`)
- **Drizzle ORM** - Type-safe ORM for D1 database operations
- **KV Storage** - OAuth token storage (binding: `OAUTH_KV`)
- **Workers AI** - Image generation (`@cf/black-forest-labs/flux-1-schnell`)
- **Hono** - HTTP router framework
- **Octokit** - GitHub API client
- **Zod** - Schema validation for tool inputs

### MCP Protocol

**IMPORTANT**: This server uses the Streamable HTTP protocol at `/mcp`. The SSE protocol is completely deprecated and should NEVER be used.

### Authentication Flow

1. MCP client connects to `/mcp` endpoint
2. OAuth provider redirects to `/authorize`
3. If client not approved, show approval dialog (POST to `/authorize`)
4. Redirect to GitHub OAuth (`https://github.com/login/oauth/authorize`)
5. GitHub redirects to `/callback` with code
6. Exchange code for access token via GitHub API
7. Fetch user info from GitHub using Octokit
8. Upsert user to D1 database with GitHub data
9. Complete authorization, storing user data (including `dbUserId`) in `props`
10. MCP tools access user context via `this.props` and GitHub token via `this.props.accessToken`

### Configuration

**Production URL**: `https://dnd-mcp.ari-encarnacion-95.workers.dev`

**MCP Client Connection**: Use `https://dnd-mcp.ari-encarnacion-95.workers.dev/mcp` with Streamable HTTP protocol

**Environment Variables** (set via `wrangler secret put` for production, `.dev.vars` for local):
- `GITHUB_CLIENT_ID` - GitHub OAuth App client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth App client secret
- `COOKIE_ENCRYPTION_KEY` - Secret key for signing approval cookies

**Bindings** (defined in wrangler.jsonc):
- `DND-MCP-DB-BINDING` - D1 database binding for user management (database: `dnd-mcp`, UUID: `caa47f26-538d-4b57-8916-8c4e20d7d19d`)
- `OAUTH_KV` - KV namespace for OAuth state storage
- `AI` - Workers AI binding for image generation
- `MCP_OBJECT` - Durable Object binding for MyMCP class

### Available MCP Tools

**User Management:**
- `userInfo` - Get GitHub OAuth props (for debugging)
- `userInfoOctokit` - Get fresh GitHub user data via Octokit API
- `userGet` - Get authenticated user's D1 database record
- `userUpdateInfo` - Update user's name, username, or email in D1

**Character Management:**
- `charCreate` - Create a new D&D 2014 (5e) character with comprehensive starting information (requires 14 params: name, class, species, 6 ability scores, max HP, AC, speed, size, proficiency bonus). Ability modifiers are calculated automatically using `calculateAbilityModifier()`
- `charList` - List all characters for the authenticated user (returns basic info: id, name, class, species, level)
- `charGet` - Get complete details for a specific character by ID (includes all 97 fields)
- `charUpdate` - Update commonly changed character fields (HP, XP, level, currency, death saves, spell slots)
- `charDelete` - Delete a character and all associated items (cascades to weapons, spells, equipment, magic items)
- `charAddWeapon` - Add a weapon to a character's inventory (name, attack bonus, damage dice, damage type, notes, is_equipped)
- `charAddSpell` - Add a spell to a character's spell list (level, name, casting time, range, concentration, ritual, materials, notes)

**Utilities:**
- `add` - Add two numbers (demo tool)

**Restricted Tools** (requires username in `ALLOWED_USERNAMES`):
- `generateImage` - Generate image using Cloudflare Workers AI (flux-1-schnell)

**Future Character Tools (not yet implemented):**
- Equipment/magic item management tools (charAddEquipment, charAddMagicItem)
- Item listing tools (charListWeapons, charListSpells, charListEquipment, charListMagicItems)
- Item update/delete tools (charUpdateWeapon, charDeleteWeapon, etc.)
- D&D rules validation and calculations

### Database Schema

The database consists of 8 tables managing users and D&D characters with full 2014 (5e) character sheet support.

**Relationships:**
```
users (1) ──→ (many) characters
characters (1) ──→ (many) weapons
characters (1) ──→ (many) spells
characters (1) ──→ (many) equipment
characters (1) ──→ (many) magic_items
characters (1) ──→ (many) weapon_proficiencies
characters (1) ──→ (many) tool_proficiencies
```

**users table:**
- `id` - TEXT PRIMARY KEY (UUID)
- `github_id` - INTEGER UNIQUE NOT NULL (GitHub user ID)
- `github_login` - TEXT NOT NULL (GitHub username)
- `name` - TEXT (user's display name)
- `email` - TEXT (user's email)
- `avatar_url` - TEXT (GitHub avatar URL)
- `bio` - TEXT (GitHub bio)
- `username` - TEXT UNIQUE (custom username, distinct from github_login)
- `created_at` - DATETIME (auto-set on insert)
- `updated_at` - DATETIME (auto-updated on change)

**characters table:** (D&D 2014 (5e) character sheet)
- `character_id` - INTEGER PRIMARY KEY AUTOINCREMENT
- `user_id` - TEXT NOT NULL FK → users.id (CASCADE)
- `character_name` - TEXT NOT NULL
- Basic info: `background`, `class`, `level`, `species`, `subclass`, `xp`
- Combat stats: `armor_class`, `initiative_modifier`, `speed`, `character_size`, `passive_perception`, `proficiency_bonus`
- Hit points: `max_hit_points`, `current_hit_points`, `temp_hit_points`
- Death saves: `death_save_successes`, `death_save_failures` (0-3)
- `heroic_inspiration` - BOOLEAN
- Ability scores: `strength_score`, `dexterity_score`, `constitution_score`, `intelligence_score`, `wisdom_score`, `charisma_score` (modifiers calculated via `calculateAbilityModifier()`)
- Saving throw proficiencies: `str_save_proficiency`, `dex_save_proficiency`, etc.
- Skill proficiencies: `athletics_proficiency`, `acrobatics_proficiency`, etc. (all 18 skills)
- Armor training: `light_armor_training`, `medium_armor_training`, `heavy_armor_training`, `shields_training`
- Features: `class_features`, `species_traits`, `feats` (TEXT)
- Spellcasting: `spellcasting_ability`, `spellcasting_modifier`, `spell_save_dc`, `spell_attack_bonus`
- Spell slots: `level_1_slots_total`, `level_1_slots_expended` (through level 9)
- Page 2: `alignment`, `languages`, `appearance`, `backstory_personality`
- Currency: `copper_pieces`, `silver_pieces`, `electrum_pieces`, `gold_pieces`, `platinum_pieces`
- `created_at`, `updated_at`

**weapons table:**
- `weapon_id` - INTEGER PRIMARY KEY AUTOINCREMENT
- `character_id` - INTEGER NOT NULL FK → characters.character_id (CASCADE)
- `weapon_name` - TEXT NOT NULL
- `attack_bonus` - INTEGER
- `damage_dice` - TEXT (e.g., "2d6")
- `damage_type` - TEXT (e.g., "slashing")
- `notes` - TEXT
- `is_equipped` - INTEGER (0=unequipped, 1=equipped)
- `created_at`, `updated_at`

**spells table:**
- `spell_id` - INTEGER PRIMARY KEY AUTOINCREMENT
- `character_id` - INTEGER NOT NULL FK → characters.character_id (CASCADE)
- `spell_level` - INTEGER NOT NULL (0 for cantrips)
- `spell_name` - TEXT NOT NULL
- `casting_time` - TEXT
- `spell_range` - TEXT
- `is_concentration` - INTEGER (BOOLEAN)
- `is_ritual` - INTEGER (BOOLEAN)
- `requires_material` - INTEGER (BOOLEAN)
- `notes` - TEXT
- `created_at`, `updated_at`

**equipment table:**
- `equipment_id` - INTEGER PRIMARY KEY AUTOINCREMENT
- `character_id` - INTEGER NOT NULL FK → characters.character_id (CASCADE)
- `item_name` - TEXT NOT NULL
- `quantity` - INTEGER DEFAULT 1
- `description` - TEXT
- `is_equipped` - INTEGER (0=unequipped, 1=equipped)
- `created_at`, `updated_at`

**magic_items table:**
- `magic_item_id` - INTEGER PRIMARY KEY AUTOINCREMENT
- `character_id` - INTEGER NOT NULL FK → characters.character_id (CASCADE)
- `item_name` - TEXT NOT NULL
- `is_attuned` - INTEGER (0=not attuned, 1=attuned)
- `is_equipped` - INTEGER (0=unequipped, 1=equipped)
- `description` - TEXT
- `created_at`, `updated_at`

**weapon_proficiencies table:**
- `proficiency_id` - INTEGER PRIMARY KEY AUTOINCREMENT
- `character_id` - INTEGER NOT NULL FK → characters.character_id (CASCADE)
- `weapon_name` - TEXT NOT NULL
- `created_at`, `updated_at`

**tool_proficiencies table:**
- `proficiency_id` - INTEGER PRIMARY KEY AUTOINCREMENT
- `character_id` - INTEGER NOT NULL FK → characters.character_id (CASCADE)
- `tool_name` - TEXT NOT NULL
- `created_at`, `updated_at`

### Character Creation

The `createCharacter()` function uses the `CharacterCreationParams` interface which intelligently combines:

**Required fields (must provide):**
- Basic identity: `character_name`, `class`, `species`
- All 6 ability scores: `strength_score`, `dexterity_score`, `constitution_score`, `intelligence_score`, `wisdom_score`, `charisma_score` (modifiers calculated automatically)
- Core combat stats: `max_hit_points`, `armor_class`, `speed`, `character_size`, `proficiency_bonus`

**Optional fields (automatically available from schema):**
- All proficiencies (skills, saves, armor, weapons, tools)
- Spellcasting details and spell slots
- Personality, appearance, backstory
- Currency, equipment, features, etc.

**Automatic calculations:**
- Ability modifiers calculated using `calculateAbilityModifier(score)` formula: `floor((score - 10) / 2)`
- `current_hit_points` defaults to `max_hit_points`
- `initiative_modifier` defaults to calculated dexterity modifier
- `passive_perception` calculated as `10 + wisdom_modifier + perception_proficiency`

This design uses TypeScript's `Partial<Omit<>>` pattern to make the interface maintainable while keeping full type safety. Schema changes automatically propagate to available optional fields. Ability modifiers are never stored in the database (database normalization).

### D&D 5e API Integration

The application leverages the community-maintained **D&D 5e SRD API** (https://www.dnd5eapi.co) to fetch reference data instead of storing it locally.

**Architecture Pattern: Instance Data + Reference API**
- **Store in D1**: Character-specific data (ability scores, level, current HP, proficiencies chosen)
- **Fetch from API**: Race templates, class features, spell descriptions, equipment stats
- **Calculate on-the-fly**: Skill modifiers, proficiency bonus, passive perception

**Benefits:**
- ✅ No need to maintain D&D reference data ourselves
- ✅ Always up-to-date with official content
- ✅ Smaller database schema (no need to store race/class templates)
- ✅ Richer features (can query "available spells for Wizard level 5")

**Caching Strategy:**
- In-memory cache with 24hr TTL
- Graceful fallback to stale cache if API unavailable
- Reference data rarely changes, so aggressive caching is safe

**API Coverage:**
- Races & Subraces - ✅ Full support
- Classes & Subclasses - ✅ Full support
- Skills & Proficiencies - ✅ Full support
- Spells - ✅ Full support
- Equipment & Magic Items - ✅ Full support
- Backgrounds - ⚠️ Limited (only Acolyte in SRD), store others in code

### Skill Calculation System

Skills are calculated dynamically instead of being stored:

**Formula:** `Skill Modifier = Ability Modifier + (Proficiency Bonus if proficient) + (Proficiency Bonus if expertise)`

**Example:** Level 5 Wizard with INT 16, proficient in Arcana
- Intelligence modifier: `floor((16 - 10) / 2)` = +3
- Proficiency bonus (level 5): `floor((5 - 1) / 4) + 2` = +3
- Arcana total: `3 + 3` = **+6**

**Implementation:**
```typescript
// Calculate single skill
const perception = calculateSkillModifier(character, 'perception', true);

// Calculate all skills
const allSkills = calculateAllSkills(character);
// Returns: { perception: {modifier: +5, proficient: true, ability: 'wisdom', ...}, ... }
```

**18 Skills and Their Abilities:**
- Strength: Athletics
- Dexterity: Acrobatics, Sleight of Hand, Stealth
- Intelligence: Arcana, History, Investigation, Nature, Religion
- Wisdom: Animal Handling, Insight, Medicine, Perception, Survival
- Charisma: Deception, Intimidation, Performance, Persuasion

### Development Notes

- Local dev requires separate GitHub OAuth App with `http://localhost:8788` URLs
- Production requires GitHub OAuth App with `https://dnd-mcp.ari-encarnacion-95.workers.dev` URLs
- Use `ALLOWED_USERNAMES` set in src/index.ts to restrict access to specific tools
- Tools defined with Zod schemas for input validation
- Access user's GitHub token via `this.props.accessToken` for GitHub API calls
- **Important**: Use exact version `@modelcontextprotocol/sdk@1.18.2` and `zod@^3.25.76` for MCP compatibility
