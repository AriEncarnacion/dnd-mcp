Get Started with Drizzle and D1
This guide assumes familiarity with:
dotenv - package for managing environment variables - read here
tsx - package for running TypeScript files - read here
Cloudflare D1 - Serverless SQL database to query from your Workers and Pages projects - read here
wrangler - Cloudflare Developer Platform command-line interface - read here
Basic file structure
This is the basic file structure of the project. In the src/db directory, we have table definition in schema.ts. In drizzle folder there are sql migration file and snapshots.

📦 <project root>
 ├ 📂 drizzle
 ├ 📂 src
 │   ├ 📂 db
 │   │  └ 📜 schema.ts
 │   └ 📜 index.ts
 ├ 📜 .env
 ├ 📜 drizzle.config.ts
 ├ 📜 package.json
 └ 📜 tsconfig.json

Step 1 - Install required packages
npm i drizzle-orm  dotenv
npm i -D drizzle-kit tsx

Step 2 - Setup wrangler.toml
You would need to have a wrangler.toml file for D1 database and will look something like this:

name = "YOUR PROJECT NAME"
main = "src/index.ts"
compatibility_date = "2022-11-07"
node_compat = true
[[ d1_databases ]]
binding = "DB"
database_name = "YOUR DB NAME"
database_id = "YOUR DB ID"
migrations_dir = "drizzle"

Step 3 - Connect Drizzle ORM to the database
import { drizzle } from 'drizzle-orm/d1';
export interface Env {
  <BINDING_NAME>: D1Database;
}
export default {
  async fetch(request: Request, env: Env) {
    const db = drizzle(env.<BINDING_NAME>);
  },
};

Step 4 - Create a table
Create a schema.ts file in the src/db directory and declare your table:

src/db/schema.ts

import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const usersTable = sqliteTable("users_table", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  age: int().notNull(),
  email: text().notNull().unique(),
});
Step 5 - Setup Drizzle config file
Drizzle config - a configuration file that is used by Drizzle Kit and contains all the information about your database connection, migration folder and schema files.

Create a drizzle.config.ts file in the root of your project and add the following content:

drizzle.config.ts

import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
});
tips
You can check our tutorial on how to get env variables from CloudFlare

Step 6 - Applying changes to the database
You can directly apply changes to your database using the drizzle-kit push command. This is a convenient method for quickly testing new schema designs or modifications in a local development environment, allowing for rapid iterations without the need to manage migration files:

npx drizzle-kit push

Read more about the push command in documentation.

Tips
Alternatively, you can generate migrations using the drizzle-kit generate command and then apply them using the drizzle-kit migrate command:

Generate migrations:

npx drizzle-kit generate

Apply migrations:

npx drizzle-kit migrate

Read more about migration process in documentation.

Step 7 - Seed and Query the database
import { drizzle } from 'drizzle-orm/d1';
export interface Env {
  <BINDING_NAME>: D1Database;
}
export default {
  async fetch(request: Request, env: Env) {
    const db = drizzle(env.<BINDING_NAME>);
    const result = await db.select().from(users).all()
    return Response.json(result);
  },
};

Step 8 - Run index.ts file
To run any TypeScript files, you have several options, but let’s stick with one: using tsx

You’ve already installed tsx, so we can run our queries now

Run index.ts script

npx tsx src/index.ts

tips
We suggest using bun to run TypeScript files. With bun, such scripts can be executed without issues or additional settings, regardless of whether your project is configured with CommonJS (CJS), ECMAScript Modules (ESM), or any other module format. To run a script with bun, use the following command:

bun src/index.ts

If you don’t have bun installed, check the Bun installation docs