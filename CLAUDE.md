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
- `src/db/schema.ts` - Drizzle schema definition for users table
- `src/db/index.ts` - Database operations:
  - `upsertUser()` - Insert or update user in D1 database
  - `getUserByGithubId()` - Fetch user by GitHub ID
  - `getUserById()` - Fetch user by internal database ID
  - `updateUserInfo()` - Update user's name, username, or email
  - Exports `User` type from schema

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

**Utilities:**
- `add` - Add two numbers (demo tool)

**Restricted Tools** (requires username in `ALLOWED_USERNAMES`):
- `generateImage` - Generate image using Cloudflare Workers AI (flux-1-schnell)

### Database Schema

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

### Development Notes

- Local dev requires separate GitHub OAuth App with `http://localhost:8788` URLs
- Production requires GitHub OAuth App with `https://dnd-mcp.ari-encarnacion-95.workers.dev` URLs
- Use `ALLOWED_USERNAMES` set in src/index.ts to restrict access to specific tools
- Tools defined with Zod schemas for input validation
- Access user's GitHub token via `this.props.accessToken` for GitHub API calls
- **Important**: Use exact version `@modelcontextprotocol/sdk@1.18.2` and `zod@^3.25.76` for MCP compatibility
