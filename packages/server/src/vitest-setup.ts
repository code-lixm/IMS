// Vitest setup file — runs before modules are loaded (via setupFiles in vitest.config.ts)
// This is the ONLY place where process.env can be set before ESM module evaluation.
process.env.CUSTOM_API_KEY = "test-key";
process.env.CUSTOM_BASE_URL = "https://ai-gateway.test/v1";