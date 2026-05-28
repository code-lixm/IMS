# Coding Conventions

**Analysis Date:** 2026-05-23

## Naming Patterns

**Files:**
- Use kebab-case for Vue components and feature helpers in `apps/web/src/components/` and `apps/web/src/composables/`, such as `apps/web/src/components/import/interview-import-form.vue` and `apps/web/src/composables/import/use-interview-import-form.ts`.
- Use domain-qualified test names beside implementation files, such as `apps/web/src/api/client.test.ts`, `packages/server/src/routes.import.test.ts`, and `packages/server/src/services/import/pipeline.hash-reuse.test.ts`.
- Use feature folders for large domains: `packages/server/src/services/import/`, `packages/server/src/services/imr/`, `packages/server/src/services/share/`, and `apps/web/src/composables/candidates/`.
- Rust desktop code uses snake_case files in `apps/desktop/src/`, such as `apps/desktop/src/main.rs`, `apps/desktop/src/lib.rs`, and `apps/desktop/src/recorder.rs`.

**Functions:**
- Use camelCase for TypeScript functions: `resolveUrl`, `mergeSignals`, `requestEnvelope` in `apps/web/src/api/client.ts`; `parseJson` and `screeningTemplatesRoute` in `packages/server/src/routes/screening-templates.ts`.
- Vue composables use the `useXxx` naming convention: `useInterviewImportForm` in `apps/web/src/composables/import/use-interview-import-form.ts`, `useCandidatesStore` in `apps/web/src/stores/candidates.ts`.
- Event handlers use `handleXxx`: `handleResumeFileChange` and `handleSubmit` in `apps/web/src/components/import/interview-import-form.vue`.
- Boolean predicates use `isXxx`, `hasXxx`, or `canXxx`: `isApiFailure`, `isNetworkFailure` in `apps/web/src/api/client.ts`; `hasParam` in `apps/web/src/stores/candidates.ts`; computed `canSubmit` and `canConfirm` in `apps/web/src/composables/import/use-interview-import-form.ts`.

**Variables:**
- Use camelCase for mutable and local values: `desktopServerDiscoveryPromise` in `apps/web/src/api/client.ts`, `listRequestId` in `apps/web/src/stores/candidates.ts`, `pollTimer` in `apps/web/src/composables/import/use-interview-import-form.ts`.
- Use UPPER_SNAKE_CASE for module constants: `DEFAULT_TIMEOUT_MS`, `DESKTOP_SERVER_PORTS` in `apps/web/src/api/client.ts`; `POLL_INTERVAL_MS`, `POLL_ATTEMPTS` in `apps/web/src/composables/import/use-interview-import-form.ts`.
- Use `ref` names directly for Vue state, not `xxxRef`: `loading`, `current`, `page`, `pageSize` in `apps/web/src/stores/candidates.ts`.

**Types:**
- Use PascalCase for interfaces and type aliases: `ApiError`, `JsonRequestOptions`, `InterviewImportSubmissionState` in `apps/web/src/api/client.ts` and `apps/web/src/composables/import/use-interview-import-form.ts`.
- Shared contract types live in `packages/shared/src/` and use explicit domain prefixes: `AgentContractDocument`, `AgentContractValidationIssue`, `AgentWorkflowStage` in `packages/shared/src/agent-contract.ts`.
- Prefer `interface` for object shapes that represent API or component contracts, as in `InterviewImportFormProps` in `apps/web/src/components/import/interview-import-form.vue` and `CreateScreeningTemplateGroupInput` in `packages/server/src/routes/screening-templates.ts`.

## Code Style

**Formatting:**
- No Prettier config detected. Follow existing 2-space JSON indentation in `package.json` and semicolon-heavy TypeScript style in `apps/web/src/api/client.ts` and `packages/server/src/utils/http.ts`.
- Use double quotes for strings in TypeScript imports and literals, as shown in `vitest.config.ts`, `apps/web/src/api/client.ts`, and `packages/server/src/routes/screening-templates.ts`.
- Use trailing commas in multi-line function calls and object literals where already present, such as `apps/web/src/stores/candidates.ts` and `apps/web/src/composables/import/use-interview-import-form.ts`.
- Use numeric separators for large timeout and duration values: `30_000`, `5_000`, and `120_000` in `playwright.config.ts`; `30_000` and `1_500` in `apps/web/src/api/client.ts`.

**Linting:**
- No ESLint, Prettier, or Biome config detected at repo root. TypeScript strict mode is the primary quality gate via `tsconfig.json`, `apps/web/tsconfig.json`, `packages/server/tsconfig.json`, and `packages/shared/tsconfig.json`.
- Frontend governance checks are package-local: `apps/web/package.json` defines `check:governance` and `check` with `node ./scripts/check-frontend-governance.mjs`.
- Use `pnpm typecheck` from `package.json` for cross-package type validation; do not rely on lint auto-fixes because none are configured.

## Import Organization

**Order:**
1. Framework, test, or runtime imports first: `vue`, `pinia`, `vitest`, `@playwright/test`, `node:*` as seen in `apps/web/src/components/import/interview-import-form.vue`, `apps/web/src/stores/candidates.ts`, `apps/web/src/api/client.test.ts`, and `packages/server/src/services/import/pipeline.hash-reuse.test.ts`.
2. Shared workspace contracts next: `@ims/shared` imports in `apps/web/src/api/client.ts`, `apps/web/src/stores/candidates.ts`, and `apps/web/src/components/candidates/candidate-list.vue`.
3. App-local aliases or relative imports after shared contracts: `@/api/*`, `@/components/*`, `@/composables/*` in `apps/web/src/components/import/interview-import-form.vue` and `apps/web/src/composables/import/use-interview-import-form.ts`.
4. Server relative imports use explicit nearby paths: `../services/screening-templates`, `../utils/http` in `packages/server/src/routes/screening-templates.ts`.

**Path Aliases:**
- Frontend uses `@/*` for `apps/web/src/*`; examples include `@/api/candidates` in `apps/web/src/stores/candidates.ts` and `@/components/ui/button` in `apps/web/src/components/import/interview-import-form.vue`.
- Workspace package imports use `@ims/shared`; examples include `SERVER_BASE_URL` in `apps/web/src/api/client.ts` and shared response types in `apps/web/src/stores/candidates.ts`.
- Server currently has mixed import styles. Prefer package or local module imports; `packages/server/src/routes/screening-templates.ts` imports shared API types via `../../../shared/src/api-types`, while many app files use `@ims/shared`.

## Error Handling

**Patterns:**
- API responses use a uniform envelope created by `ok()` and `fail()` in `packages/server/src/utils/http.ts`: `{ success, data, error, meta }`.
- Frontend API errors are normalized into `ApiError` with `code`, `message`, `status`, and optional `meta` in `apps/web/src/api/client.ts`.
- Use `try/catch/finally` to preserve UI state and cleanup timers. `fetchOne` in `apps/web/src/stores/candidates.ts` resets `current` and `loading`; `submit` and `pollBatch` in `apps/web/src/composables/import/use-interview-import-form.ts` update submission state and notifications.
- Expected parse failures can return `null`, but keep the catch narrow and intentional. Examples: JSON parsing in `extractSummaryFromTask` in `apps/web/src/composables/import/use-interview-import-form.ts` and invalid API JSON mapping in `readJsonResponse` in `apps/web/src/api/client.ts`.
- Server routes should convert not-found and conflict conditions into `fail()` responses rather than throwing raw errors, as in `packages/server/src/routes/screening-templates.ts`.

## Logging

**Framework:** console / lightweight server logger.

**Patterns:**
- Frontend user-visible errors should go through `reportAppError` and `useAppNotifications`, as in `apps/web/src/composables/import/use-interview-import-form.ts`.
- Server route tests mock `logError`, `logInfo`, `logWarn`, and `resolveRequestId` from `packages/server/src/utils/logger` in `packages/server/src/routes.import.test.ts`, so new server code should prefer that logger where available.
- Avoid adding new raw `console.*` calls in `packages/server/src/`; existing project notes identify non-structured console logging as an anti-pattern.

## Comments

**When to Comment:**
- Use comments for protocol or ordering constraints that are not obvious from code. Examples: API client module header in `apps/web/src/api/client.ts`, Vitest env timing note in `packages/server/src/vitest-setup.ts`, and route matching order comment in `packages/server/src/routes/screening-templates.ts`.
- Avoid comments that restate function names; prefer descriptive names like `resolveSubmissionPhase`, `isTerminalStatus`, and `clearPollTimer` in `apps/web/src/composables/import/use-interview-import-form.ts`.

**JSDoc/TSDoc:**
- JSDoc is light and used mostly for module-level API guidance, such as `apps/web/src/api/client.ts`.
- Public shared contracts in `packages/shared/src/` are mostly self-describing TypeScript types without heavy TSDoc; keep additions consistent unless the type encodes non-obvious business rules.

## Function Design

**Size:**
- Keep helpers small and single-purpose when adding code. Good examples include `resolveSubmissionPhase`, `isTerminalStatus`, `extractSummaryFromTask` in `apps/web/src/composables/import/use-interview-import-form.ts`, and `meta`, `ok`, `fail` in `packages/server/src/utils/http.ts`.
- Larger orchestration functions are accepted for workflows but should delegate validation, formatting, and API calls to helpers or services. `submit` in `apps/web/src/composables/import/use-interview-import-form.ts` delegates payload building to `buildInterviewImportPayload` and polling to `pollBatch`.

**Parameters:**
- Prefer options objects for optional behavior: `BaseRequestOptions` in `apps/web/src/api/client.ts`, `UseInterviewImportFormOptions` in `apps/web/src/composables/import/use-interview-import-form.ts`, and `CandidateListParams` in `apps/web/src/stores/candidates.ts`.
- Pass `AbortSignal` through option objects for cancellable frontend operations, as in `fetchList(params, options)` in `apps/web/src/stores/candidates.ts`.

**Return Values:**
- API client helpers return unwrapped data and throw `ApiError` for failures, as in `requestEnvelope` in `apps/web/src/api/client.ts`.
- Form actions return nullable success payloads when validation or handled errors prevent completion, as in `submit(): Promise<InterviewImportCreateResult | null>` in `apps/web/src/composables/import/use-interview-import-form.ts`.
- Validation helpers return structured results instead of throwing, as in `AgentContractValidationResult<T>` in `packages/shared/src/agent-contract.ts`.

## Module Design

**Exports:**
- Export composables and stores by named export: `useInterviewImportForm` in `apps/web/src/composables/import/use-interview-import-form.ts`, `useCandidatesStore` in `apps/web/src/stores/candidates.ts`.
- Export server route handlers as named functions returning `Promise<Response | null>`, such as `screeningTemplatesRoute` in `packages/server/src/routes/screening-templates.ts`.
- Export shared package contracts and constants from `packages/shared/src/` and consume them through `@ims/shared` from web/server code.

**Barrel Files:**
- Shared package uses a barrel entry at `packages/shared/src/index.ts`; import cross-package types and constants through `@ims/shared` where possible.
- UI component folders use index-style grouped imports in practice, e.g. `@/components/ui/alert`, `@/components/ui/button`, and `@/components/ui/textarea` in `apps/web/src/components/import/interview-import-form.vue`.

---

*Convention analysis: 2026-05-23*
