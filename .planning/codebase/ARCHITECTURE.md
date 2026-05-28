# Architecture

**Analysis Date:** 2026-05-23

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Desktop Shell                       │
│     `apps/desktop/src/main.rs` → `apps/desktop/src/lib.rs`   │
├─────────────────────────────────────────────────────────────┤
│  window/tray/deep-link/updater/recorder/server supervision   │
└───────────────────────────┬─────────────────────────────────┘
                            │ loads Web UI + starts local API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       Vue 3 Web SPA                          │
├──────────────────┬──────────────────┬───────────────────────┤
│ Views/Routes     │ Pinia Stores     │ API Clients           │
│ `apps/web/src/`  │ `apps/web/src/`  │ `apps/web/src/api/`   │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                    │ HTTP `/api/*`
         ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Bun HTTP API Server                       │
│         `packages/server/src/index.ts`                       │
├─────────────────────────────────────────────────────────────┤
│ Route dispatcher `packages/server/src/routes.ts` + `routes/` │
└────────┬─────────────────────┬──────────────────────────────┘
         │                     │
         ▼                     ▼
┌───────────────────────┐  ┌──────────────────────────────────┐
│ Domain Services       │  │ Shared Contracts                  │
│ `packages/server/src/ │  │ `packages/shared/src/index.ts`    │
│  services/`           │  │                                  │
└──────────┬────────────┘  └──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ SQLite + Runtime Files                                      │
│ `packages/server/src/db.ts`, `runtime/`, `config.dataDir`    │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Desktop executable entry | Reads `.imr` CLI arguments and delegates to the Tauri library runner. | `apps/desktop/src/main.rs` |
| Tauri app runner | Registers plugins, starts backend server, waits for health, manages tray/window/deep-link/updater/recorder commands. | `apps/desktop/src/lib.rs` |
| Web app bootstrap | Creates Vue app, installs Pinia/router, initializes theme, handles web reset query for initialization tests. | `apps/web/src/main.ts` |
| Root web shell | Hosts `router-view`, onboarding host, notification center, auth loading overlay, desktop launch changelog sequence. | `apps/web/src/App.vue` |
| Router | Defines authenticated pages and guest route; guards routes with `authStore.ensureStatus()`. | `apps/web/src/router/index.ts` |
| API client layer | Wraps `fetch`, normalizes API responses, applies timeouts, discovers desktop server port in production. | `apps/web/src/api/client.ts` |
| Web state stores | Own view state and API orchestration, e.g. candidate list pagination and current candidate. | `apps/web/src/stores/candidates.ts` |
| Bun server entry | Restores persisted auth, creates `Bun.serve`, routes `/api/*`, serves packaged `index.html`, handles shutdown. | `packages/server/src/index.ts` |
| Route dispatcher | Main HTTP router, request logging, error wrapping, feature routing, fallback to split route modules. | `packages/server/src/routes.ts` |
| Split route modules | Feature-specific route handlers returning `Response | null` for delegated route ownership. | `packages/server/src/routes/` |
| Domain services | Business logic for import, IMR, LUI workflow, Baobao sync/login, messages, memory, file resources, email. | `packages/server/src/services/` |
| Database bootstrap | Opens SQLite, sets PRAGMAs, creates tables, performs startup-compatible schema evolution. | `packages/server/src/db.ts` |
| Drizzle schema | Runtime table definitions for DB operations. Keep in sync with shared DB interfaces. | `packages/server/src/schema.ts` |
| Shared contracts | Cross-package DB/API/domain types, constants, dictionaries, agent contracts. | `packages/shared/src/index.ts` |

## Pattern Overview

**Overall:** Local-first desktop/web monorepo with a Vue SPA client, Bun REST API, SQLite persistence, and a Tauri desktop supervisor.

**Key Characteristics:**
- Use `pnpm` workspaces for package boundaries: `apps/web`, `apps/desktop`, `packages/server`, `packages/shared` in `pnpm-workspace.yaml`.
- Web never owns persistence directly; it calls `/api/*` through clients in `apps/web/src/api/`.
- Server owns database and runtime files through `packages/server/src/db.ts`, `packages/server/src/config.ts`, and services under `packages/server/src/services/`.
- Shared package defines contracts imported by both web and server via `@ims/shared`.
- Desktop is a native shell and process supervisor, not a second business backend.

## Layers

**Desktop Shell:**
- Purpose: Native app lifecycle, window/tray integration, `.imr` file association, `imr://` deep links, updater, recorder commands, embedded server supervision.
- Location: `apps/desktop/src/`
- Contains: Rust Tauri entrypoints, command handlers, logger, server process management, tray setup, recorder module.
- Depends on: Tauri plugins, bundled server resource `packages/server/dist`, web dist from `apps/web/dist`.
- Used by: End users launching the packaged desktop app.

**Web Presentation:**
- Purpose: Candidate management, import UI, settings, LUI AI workspace, screening template views, onboarding and changelog UI.
- Location: `apps/web/src/views/`, `apps/web/src/components/`
- Contains: Vue SFC views, shadcn-vue style `components/ui/`, LUI components, app-level hosts.
- Depends on: Pinia stores, composables, API clients, `@ims/shared` types.
- Used by: Browser/Tauri WebView.

**Web State and API Boundary:**
- Purpose: Keep stateful UI orchestration outside components and centralize HTTP behavior.
- Location: `apps/web/src/stores/`, `apps/web/src/api/`
- Contains: Pinia stores such as `apps/web/src/stores/auth.ts` and `apps/web/src/stores/candidates.ts`; API modules such as `apps/web/src/api/client.ts` and `apps/web/src/api/candidates.ts`.
- Depends on: `fetch`, Vue/Pinia, `@ims/shared` API types.
- Used by: Views and components. Add new HTTP calls here before using them in UI.

**HTTP Routing:**
- Purpose: Accept all `/api/*` requests, apply request logging, normalize success/error responses, dispatch by path and method.
- Location: `packages/server/src/routes.ts`, `packages/server/src/routes/`
- Contains: Main route dispatcher plus split feature routers (`messages.ts`, `memory.ts`, `session-memory.ts`, `file-resources.ts`, `email.ts`, `interview-assessment.ts`, `interview-import.ts`, `screening-templates.ts`, `recorder.ts`).
- Depends on: Domain services, Drizzle tables, shared constants/types.
- Used by: `packages/server/src/index.ts` inside `Bun.serve`.

**Business Services:**
- Purpose: Implement domain workflows independent of HTTP parsing.
- Location: `packages/server/src/services/`
- Contains: Import pipeline, IMR import/export, Baobao integration, LUI agents/tools/workflow, Deep Agents runtime, message/memory/session/file/email services.
- Depends on: `packages/server/src/db.ts`, `packages/server/src/schema.ts`, `@ims/shared`, AI SDKs, filesystem.
- Used by: Route handlers and startup code.

**Persistence and Runtime Storage:**
- Purpose: Local SQLite persistence plus runtime file storage for imports, recordings, agent workspaces, files, logs.
- Location: `packages/server/src/db.ts`, `packages/server/src/schema.ts`, `packages/server/src/config.ts`, `runtime/`
- Contains: SQLite connection, table creation, Drizzle schema, path configuration.
- Depends on: `bun:sqlite`, Drizzle ORM, process env path overrides.
- Used by: All server services and routes.

**Shared Contracts:**
- Purpose: Compile-time API, DB, dictionary, recorder, changelog, agent, workspace-agent and import types shared by web/server.
- Location: `packages/shared/src/`
- Contains: `api-types.ts`, `db-schema.ts`, `constants.ts`, `agent-contract.ts`, `workspace-agent.ts`, `dictionaries/baobao.ts`.
- Depends on: TypeScript only plus small shared runtime helpers/constants.
- Used by: `apps/web/src/**` and `packages/server/src/**` via `@ims/shared`.

## Data Flow

### Primary Request Path

1. Vue app boots and installs Pinia/router in `apps/web/src/main.ts:58`.
2. Router guard checks auth through `useAuthStore(pinia).ensureStatus()` in `apps/web/src/router/index.ts:35`.
3. A view/store calls a typed API module, e.g. `candidatesApi.list()` in `apps/web/src/api/candidates.ts:60`.
4. `api()` in `apps/web/src/api/client.ts` resolves dev relative paths or production desktop base URL discovery.
5. Vite dev proxy forwards `/api` to `127.0.0.1:${IMS_PORT || 9092}` from `apps/web/vite.config.ts:47`.
6. `Bun.serve` receives the request in `packages/server/src/index.ts:123` and sends `/api/*` to `route(request)` in `packages/server/src/index.ts:128`.
7. `route()` logs request metadata, delegates to `routeInternal()`, adds `x-request-id`, and catches unhandled errors in `packages/server/src/routes.ts:4105`.
8. Route logic queries Drizzle tables and services imported in `packages/server/src/routes.ts:17` through `packages/server/src/routes.ts:72`.
9. `db` persists data through `packages/server/src/db.ts:9` and table definitions from `packages/server/src/schema.ts`.
10. Response is wrapped by `ok()`/`fail()` from `packages/server/src/utils/http.ts` and decoded by `apps/web/src/api/client.ts`.

### Desktop Launch Path

1. `apps/desktop/src/main.rs:5` scans CLI args for `.imr` files and calls `interview_manager_lib::run()`.
2. `apps/desktop/src/lib.rs:1183` builds the Tauri app and installs shell, clipboard, updater, deep-link, and single-instance plugins.
3. `apps/desktop/src/lib.rs:1202` creates app log and recorder runtime state.
4. `apps/desktop/src/lib.rs:1224` starts the backend through `start_server()` and stores `ServerProcess` in managed state.
5. `apps/desktop/src/lib.rs:1246` waits for server readiness before showing the main window.
6. `apps/desktop/src/lib.rs:1260` injects the actual server base URL into the frontend.
7. `apps/desktop/src/lib.rs:1276` listens for `deep-link://new-url` and forwards `.imr` opens to the frontend event pipeline.

### Import Pipeline Flow

1. UI submits import requests through clients under `apps/web/src/api/`.
2. `packages/server/src/routes.ts` handles import endpoints and calls pipeline functions imported from `packages/server/src/services/import/pipeline.ts:19`.
3. `prepareImportTasks()` creates batch and task rows in `import_batches` / `import_file_tasks` defined in `packages/server/src/schema.ts:144`.
4. `processFile()` coordinates extraction, parsing, candidate matching, saving, university verification, and AI screening in `packages/server/src/services/import/pipeline.ts`.
5. Files are copied into runtime paths under `config.dataDir` or `config.filesDir` from `packages/server/src/config.ts:6`.
6. Progress is refreshed through `refreshBatchProgress()` and read back by import views.

### LUI Workflow Flow

1. LUI views under `apps/web/src/views/LUIView.vue` call LUI API modules in `apps/web/src/api/`.
2. `packages/server/src/routes.ts` handles `/api/lui/*` and imports workflow functions from `packages/server/src/services/lui-workflow.ts:40`.
3. `getOrCreateWorkflow()` and `updateWorkflow()` persist state in `lui_workflows` through `packages/server/src/schema.ts`.
4. `composeWorkflowSystemPrompt()` and tools from `packages/server/src/services/lui-tools.ts` assemble runtime prompt/tool state.
5. `streamText()` from the AI SDK streams model output and tool calls back to the client.
6. Workflow artifacts are stored as file resources through `packages/server/src/services/file-resource.ts` and metadata helpers such as `packages/server/src/services/workflow-artifacts.ts`.

**State Management:**
- UI state is Pinia-based in `apps/web/src/stores/`.
- Server process state is module/global or singleton-like: `syncManager` in `packages/server/src/services/sync-manager.ts`, database singleton in `packages/server/src/db.ts`, Baobao client setter/getter in `packages/server/src/services/baobao-client.ts`.
- Desktop native state is Tauri managed state: `Mutex<AppLogger>`, `RecorderManager`, `Mutex<ServerProcess>` in `apps/desktop/src/lib.rs:1210` through `apps/desktop/src/lib.rs:1227`.
- Durable application state is SQLite plus runtime files under `runtime/`.

## Key Abstractions

**API Response Envelope:**
- Purpose: All web/server JSON responses share `ApiSuccess<T> | ApiError`.
- Examples: `packages/shared/src/api-types.ts`, `apps/web/src/api/client.ts`, `packages/server/src/utils/http.ts`.
- Pattern: Server returns `ok()`/`fail()`, client throws `ApiError` for non-success envelopes.

**Shared DB Contract vs Runtime Schema:**
- Purpose: Web-facing TS interfaces and server Drizzle tables model the same entities.
- Examples: `packages/shared/src/db-schema.ts`, `packages/server/src/schema.ts`.
- Pattern: Add fields in both places; server schema is runtime, shared schema is API contract.

**Route Module Return Contract:**
- Purpose: Split route handlers decide whether they own a request.
- Examples: `packages/server/src/routes/messages.ts`, `packages/server/src/routes/memory.ts`, `packages/server/src/routes/interview-import.ts`, `packages/server/src/routes/recorder.ts`.
- Pattern: `export async function featureRoute(request): Promise<Response | null>`; return `null` when path is not handled.

**Pinia Setup Stores:**
- Purpose: Compose reactive state and async actions per domain.
- Examples: `apps/web/src/stores/auth.ts`, `apps/web/src/stores/candidates.ts`.
- Pattern: `defineStore("name", () => { const state = ref(...); async function action() {}; return ... })`.

**Import Batch/Task Pipeline:**
- Purpose: Track multi-file import lifecycle through durable batch/task rows.
- Examples: `packages/server/src/services/import/pipeline.ts`, `packages/server/src/schema.ts` tables `importBatches`, `importFileTasks`.
- Pattern: Status transitions use task rows; batch progress is derived by `refreshBatchProgress()`.

**LUI Workflow State Machine:**
- Purpose: Manage multi-stage interview workflow `S0` → `S1` → `S2` → `completed`.
- Examples: `packages/server/src/services/lui-workflow.ts`, `packages/shared/src/agent-contract.ts`.
- Pattern: Workflow state persists in SQLite; stage documents and artifacts are stored separately.

**Desktop ServerProcess:**
- Purpose: Track embedded server child process and selected port.
- Examples: `apps/desktop/src/lib.rs:31`, `apps/desktop/src/lib.rs:1227`.
- Pattern: Tauri managed state with `Mutex<ServerProcess>`; stopped on app exit.

## Entry Points

**Web SPA:**
- Location: `apps/web/src/main.ts`
- Triggers: Vite dev server, packaged Tauri WebView.
- Responsibilities: Initialize theme, reset persisted state when instructed, install Pinia/router, mount `App.vue`.

**Web Router:**
- Location: `apps/web/src/router/index.ts`
- Triggers: Vue Router navigation.
- Responsibilities: Define page map, enforce auth/guest-only rules, redirect unauthenticated users to `/login`.

**Server:**
- Location: `packages/server/src/index.ts`
- Triggers: `pnpm --filter @ims/server dev`, compiled server resource launched by desktop.
- Responsibilities: Restore Baobao auth, start Bun server, serve `/api/*`, serve packaged web fallback, shutdown cleanly.

**Server Route Dispatcher:**
- Location: `packages/server/src/routes.ts`
- Triggers: Every `/api/*` request from `packages/server/src/index.ts`.
- Responsibilities: Apply CORS/options handling, request logging, path dispatch, response normalization, error shielding.

**Desktop Native App:**
- Location: `apps/desktop/src/main.rs`, `apps/desktop/src/lib.rs`
- Triggers: OS app launch, file association launch, deep link, single-instance callback.
- Responsibilities: Build Tauri app, supervise backend server, control window/tray/update/recording native APIs.

**Shared Package:**
- Location: `packages/shared/src/index.ts`
- Triggers: Workspace imports from web/server.
- Responsibilities: Barrel-export cross-package types, constants, dictionaries, validation helpers.

## Architectural Constraints

- **Threading:** Web and server TypeScript run on event loops. Import and AI workflows are async; long-running steps should use explicit status rows and avoid blocking the Bun request loop.
- **Global state:** Database is a module singleton in `packages/server/src/db.ts`; `databaseShutdownScheduled` is module state in `packages/server/src/routes.ts:75`; desktop has `static QUITTING` in `apps/desktop/src/lib.rs:18`; Baobao client and `syncManager` are singleton-like service state.
- **Circular imports:** Not detected during this mapping. Preserve the current direction: web → shared, server → shared, routes → services → db/schema; do not import web code into server/shared.
- **Runtime storage:** Server creates runtime directories at import time in `packages/server/src/config.ts:13`; avoid importing `config.ts` in scripts that should not mutate the filesystem.
- **Desktop/server port coupling:** Default API port is `9092` in `packages/server/src/config.ts:20`, `apps/web/vite.config.ts:13`, `apps/desktop/src/lib.rs:24`, and `packages/shared/src/constants.ts`; keep these aligned.
- **Schema duality:** Runtime schema and shared TS schema must be updated together: `packages/server/src/schema.ts` and `packages/shared/src/db-schema.ts`.

## Anti-Patterns

### Direct Component Fetching

**What happens:** Components or views bypass `apps/web/src/api/` and call `fetch` directly.
**Why it's wrong:** It skips timeout handling, desktop server discovery, API envelope decoding, and shared `ApiError` behavior from `apps/web/src/api/client.ts`.
**Do this instead:** Add a typed method in `apps/web/src/api/<domain>.ts`, then call it from a Pinia store or view.

### Expanding `routes.ts` for Every New Endpoint

**What happens:** New endpoints are added directly to the 4k+ line `packages/server/src/routes.ts`.
**Why it's wrong:** The main dispatcher already delegates to route modules at `packages/server/src/routes.ts:4072`; adding more inline route code increases merge conflicts and makes ownership unclear.
**Do this instead:** Create a feature route in `packages/server/src/routes/<feature>.ts` with the `Response | null` pattern and delegate near the existing split route calls.

### Business Logic in Web Views

**What happens:** Views accumulate persistence, parsing, import, workflow, or API orchestration logic.
**Why it's wrong:** Views should be replaceable presentation; business behavior belongs in stores/API clients or server services.
**Do this instead:** Put UI state in `apps/web/src/stores/`, HTTP calls in `apps/web/src/api/`, and durable workflow logic in `packages/server/src/services/`.

### Server Logic in Desktop Shell

**What happens:** Desktop commands duplicate server domain logic.
**Why it's wrong:** Desktop exists to supervise and integrate native capabilities; duplicating server rules creates divergent desktop/web behavior.
**Do this instead:** Keep business logic in `packages/server/src/services/`; expose through `/api/*` and call it from web.

## Error Handling

**Strategy:** Server wraps HTTP responses in a shared API envelope and catches unhandled route errors; web translates failed envelopes into `ApiError`; desktop logs native/server lifecycle issues to local log files.

**Patterns:**
- Server request wrapper catches unknown route exceptions in `packages/server/src/routes.ts:4144` and returns `fail("INTERNAL_ERROR", ...)`.
- Server feature errors should use `fail(code, message, status)` from `packages/server/src/utils/http.ts`.
- Web stores catch and report user-visible errors through helpers such as `reportAppError()` in `apps/web/src/stores/auth.ts:40`.
- Desktop command handlers should call `log_event()` in `apps/desktop/src/lib.rs:176` for native errors.

## Cross-Cutting Concerns

**Logging:** Server uses `logInfo`, `logWarn`, `logError`, and some remaining `console.*` in `packages/server/src/index.ts` and `packages/server/src/routes.ts`. Desktop writes rotating logs via `AppLogger` in `apps/desktop/src/lib.rs`.

**Validation:** API shape validation is mixed. Shared validation exists for agent contracts in `packages/shared/src/agent-contract.ts`; route/service-level validation is implemented manually in `packages/server/src/routes.ts` and domain services.

**Authentication:** Web route guard depends on `authStore.ensureStatus()` in `apps/web/src/router/index.ts`; server restores Baobao auth in `packages/server/src/index.ts` using persisted `remoteUsers` and login services; skipped Baobao login is handled by `apps/web/src/lib/baobao-login-skip.ts`.

**Configuration:** Server paths and ports come from `IMS_*` environment variables in `packages/server/src/config.ts`. Web dev proxy reads `IMS_PORT` in `apps/web/vite.config.ts`. Desktop config is in `apps/desktop/tauri.conf.json`.

**Project skills:** Repository-local skill index contains `.agents/skills/humanizer-zh/SKILL.md`; it is text-editing guidance only and does not define application architecture constraints.

---

*Architecture analysis: 2026-05-23*
