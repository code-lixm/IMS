# Testing Patterns

**Analysis Date:** 2026-05-23

## Test Framework

**Runner:**
- Vitest `^3.2.4` for unit tests, configured by root workspace config `vitest.config.ts`.
- Root Vitest projects are `apps/web/vitest.config.ts`, `packages/shared/vitest.config.ts`, and `packages/server/vitest.config.ts`.
- Playwright `^1.59.1` for E2E tests, configured by `playwright.config.ts` with `testDir: "./e2e"`.

**Assertion Library:**
- Vitest `expect` for unit tests, imported from `vitest` in files such as `apps/web/src/api/client.test.ts` and `packages/server/src/routes.import.test.ts`.
- Playwright `expect` for browser tests, imported from `@playwright/test` in `e2e/candidates-route.spec.ts`.

**Run Commands:**
```bash
pnpm test:unit          # Run all Vitest unit tests through root vitest.config.ts
pnpm test:unit:watch    # Run Vitest in watch mode
pnpm test:e2e           # Run Playwright E2E tests
pnpm test:e2e:headed    # Run Playwright headed
pnpm test:e2e:remote    # Run remote-CDP Playwright helper
```

## Test File Organization

**Location:**
- Unit tests are co-located with source under package `src/` folders: `apps/web/src/api/client.test.ts`, `apps/web/src/lib/render/render-safe-markdown.test.ts`, `packages/server/src/services/recorder.test.ts`, and `packages/shared/src/constants.test.ts`.
- E2E tests live under root `e2e/`, with reusable helpers in `e2e/support/` such as `e2e/support/auth.ts`, `e2e/support/candidates.ts`, and `e2e/support/lui-gateway.ts`.
- Script tests live under `scripts/__tests__/`, such as `scripts/__tests__/generate-whats-new.test.ts`.

**Naming:**
- Unit tests use `*.test.ts` and are included by package configs: `apps/web/vitest.config.ts`, `packages/server/vitest.config.ts`, `packages/shared/vitest.config.ts`.
- Playwright tests use `*.spec.ts`, such as `e2e/import-gateway.spec.ts`, `e2e/changelog.spec.ts`, and `e2e/remote-authenticated-pages.spec.ts`.
- Domain-specific names include the feature and behavior: `packages/server/src/services/import/pipeline.hash-reuse.test.ts`, `packages/server/src/services/interview-import/candidate-resolution.test.ts`, `apps/web/src/composables/import/interview-import-payload.test.ts`.

**Structure:**
```
apps/web/src/**/*.test.ts              # Frontend unit tests, happy-dom
packages/server/src/**/*.test.ts       # Server unit tests, node env + setup file
packages/shared/src/**/*.test.ts       # Shared contract/constant tests, node env
scripts/__tests__/*.test.ts            # Node script tests
e2e/*.spec.ts                          # Playwright browser tests
e2e/support/*.ts                       # Playwright route and data helpers
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, test } from "vitest";
import { consumeLuiMessageStream } from "./stream";

describe("consumeLuiMessageStream", () => {
  test("throws when stream event json is invalid", async () => {
    const response = createStreamResponse(["data: {oops}\n\n"]);
    await expect(consumeLuiMessageStream(response)).rejects.toThrow("流式事件 JSON 解析失败");
  });
});
```
- This pattern appears in `apps/web/src/api/core/stream.test.ts`.

**Patterns:**
- Use `describe()` per exported function or feature: `requestJson` and `requestForm` in `apps/web/src/api/client.test.ts`, `consumeLuiMessageStream` in `apps/web/src/api/core/stream.test.ts`.
- Use `test()` rather than `it()` in current unit tests, as shown in `apps/web/src/components/ai-elements/stack-trace/utils.test.ts` and `packages/shared/src/interview-import.test.ts`.
- Use `beforeEach()` to reset mock state before each test, as in `packages/server/src/routes.import.test.ts`.
- Use `afterEach()` for global restoration, as in `apps/web/src/api/client.test.ts` restoring `globalThis.fetch`.
- Prefer deterministic in-memory fixtures over real services; server tests mock DB, config, services, and route modules in `packages/server/src/routes.import.test.ts`.

## Mocking

**Framework:** Vitest `vi` for unit mocks; Playwright `page.route()` for browser network mocks.

**Patterns:**
```typescript
const mocks = vi.hoisted(() => ({
  prepareImportTasksMock: vi.fn(),
  selectQueue: [] as unknown[][],
}));

vi.mock("./services/import/pipeline", () => ({
  prepareImportTasks: mocks.prepareImportTasksMock,
  processFile: vi.fn(),
}));
```
- Use `vi.hoisted()` when mocked modules need shared mutable state before ESM imports, as in `packages/server/src/routes.import.test.ts`.

```typescript
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});
```
- Restore modified globals after tests, as in `apps/web/src/api/client.test.ts`.

```typescript
await page.route("**/api/auth/status", (route) =>
  fulfillJson(route, {
    status: "unauthenticated",
    user: null,
    lastValidatedAt: Date.now(),
  }),
);
```
- Mock browser API calls with route handlers in Playwright support files such as `e2e/support/auth.ts`.

**What to Mock:**
- External network and browser APIs: `globalThis.fetch` in `apps/web/src/api/client.test.ts`, Playwright API endpoints in `e2e/support/auth.ts`.
- Database and Drizzle-like query chains for route tests: `db.select().from().where().limit()` in `packages/server/src/routes.import.test.ts`.
- Server services outside the unit under test: sync manager, import pipeline, IMR importer/exporter, LUI services, logger, and child routes in `packages/server/src/routes.import.test.ts`.
- Filesystem sandbox paths with temporary directories for integration-style service tests, as in `packages/server/src/services/import/pipeline.hash-reuse.test.ts`.

**What NOT to Mock:**
- Pure transformation functions should be tested directly without mocks, such as `parseStackTrace` in `apps/web/src/components/ai-elements/stack-trace/utils.test.ts`, stream parsing in `apps/web/src/api/core/stream.test.ts`, and shared validation helpers in `packages/shared/src/agent-contract.test.ts`.
- Do not hit real Baobao, AI Gateway, SMTP, local desktop services, or real SQLite runtime data from unit tests; current tests isolate these dependencies with mocks or setup env in `packages/server/src/vitest-setup.ts`.

## Fixtures and Factories

**Test Data:**
```typescript
function createStreamResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}
```
- Local test factories live near tests when only one file needs them, as in `apps/web/src/api/core/stream.test.ts`.

```typescript
function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify({ success: true, data: body }),
  });
}
```
- Shared E2E helpers live in `e2e/support/auth.ts` and similar support files.

**Location:**
- Keep fixture helpers inside the test file for unit-local behavior: `mockFetch` in `apps/web/src/api/client.test.ts`, `createStreamResponse` in `apps/web/src/api/core/stream.test.ts`.
- Put cross-spec Playwright fixtures in `e2e/support/`, not inside individual specs.
- Server mock schema/table builders can live inside large integration-style test files, as in `packages/server/src/services/import/pipeline.hash-reuse.test.ts`.

## Coverage

**Requirements:** None enforced in config.
- No coverage threshold is present in `vitest.config.ts`, `apps/web/vitest.config.ts`, `packages/server/vitest.config.ts`, or `packages/shared/vitest.config.ts`.
- Playwright artifacts are configured in `playwright.config.ts`: trace on first retry, screenshots only on failure, video retained on failure.

**View Coverage:**
```bash
pnpm exec vitest --run --coverage  # Ad hoc coverage only; no repo script detected
```

## Test Types

**Unit Tests:**
- Web unit tests run in `happy-dom` via `apps/web/vitest.config.ts`; use this for API clients, composables, stores, render helpers, and pure UI utilities.
- Server unit tests run in Node via `packages/server/vitest.config.ts`; use `packages/server/src/vitest-setup.ts` for env values that must exist before ESM module evaluation.
- Shared unit tests run in Node via `packages/shared/vitest.config.ts`; use this package for API contracts, constants, dictionaries, import-screening rules, and agent-contract validation.

**Integration Tests:**
- Server route/service tests often mock infrastructure but exercise full route or pipeline logic, such as `packages/server/src/routes.import.test.ts` and `packages/server/src/services/import/pipeline.hash-reuse.test.ts`.
- Use in-memory tables and temporary directories for service-level behavior where a pure unit mock is insufficient.

**E2E Tests:**
- Playwright tests live in `e2e/` and run against either webServer-managed dev servers or existing servers when `PLAYWRIGHT_USE_EXISTING_SERVER=1` in `playwright.config.ts`.
- Use role-based locators and URL assertions, as in `e2e/candidates-route.spec.ts`.
- Use `e2e/support/` helpers to mock authentication, candidates, LUI gateway, and remote authenticated states.

## Common Patterns

**Async Testing:**
```typescript
await expect(requestJson("/api/test")).rejects.toBeInstanceOf(ApiError);
```
- Use promise assertions for expected async failures, as in `apps/web/src/api/client.test.ts` and `apps/web/src/api/core/stream.test.ts`.

```typescript
const response = await route(new Request("http://localhost/api/import/batches", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ paths: ["/tmp/resume.pdf"] }),
}));
```
- Test server routes with real `Request`/`Response` objects, as in `packages/server/src/routes.import.test.ts`.

**Error Testing:**
```typescript
await expect(response.json()).resolves.toMatchObject({
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "templateId does not belong to the selected group",
  },
});
```
- Assert both HTTP status and API envelope for server errors, as in `packages/server/src/routes.import.test.ts`.

```typescript
const parsed = parseStackTrace("plain error only");
expect(parsed.errorType).toBeNull();
expect(parsed.frames).toEqual([]);
```
- Include malformed or minimal inputs for parser utilities, as in `apps/web/src/components/ai-elements/stack-trace/utils.test.ts`.

---

*Testing analysis: 2026-05-23*
