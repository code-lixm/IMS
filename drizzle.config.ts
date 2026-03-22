import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./server/src/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: "./runtime/interview.db"
  }
});
