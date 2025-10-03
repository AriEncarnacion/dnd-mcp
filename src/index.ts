import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Octokit } from "octokit";
import { z } from "zod";
import { GitHubHandler } from "./github-handler";
import { Props } from "./utils";
import { getUserById, updateUserInfo } from "./db";

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
