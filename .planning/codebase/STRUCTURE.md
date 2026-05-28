# Codebase Structure

**Analysis Date:** 2026-05-23

## Directory Layout

```text
IMS/
├── apps/                         # User-facing applications
│   ├── web/                      # Vue 3 + Vite SPA (`@ims/web`)
│   │   ├── src/
│   │   │   ├── api/              # Typed HTTP clients over `api/client.ts`
│   │   │   ├── components/       # App, UI, LUI, changelog, onboarding components
│   │   │   ├── composables/      # Reusable Vue composition functions
│   │   │   ├── lib/              # Browser utilities and error helpers
│   │   │   ├── router/           # Vue Router setup and auth guard
│   │   │   ├── stores/           # Pinia setup stores
│   │   │   ├── views/            # Page-level Vue SFCs
│   │   │   ├── App.vue           # Root web shell
│   │   │   └── main.ts           # SPA bootstrap
│   │   ├── mock/                 # Vite mock server data/handlers
│   │   ├── vite.config.ts        # Vite plugins, alias, dev proxy
│   │   └── vitest.config.ts      # Web unit test config
│   └── desktop/                  # Tauri v2 native shell (`@ims/desktop`)
│       ├── src/
│       │   ├── main.rs           # Thin Rust executable entry
│       │   ├── lib.rs            # Tauri builder, server, tray, updater, commands
│       │   └── recorder.rs       # Native recorder manager and commands
│       ├── tauri.conf.json       # Tauri build/window/bundle/plugin config
│       └── build.rs              # Rust build script
├── packages/                     # Shared workspace packages
│   ├── server/                   # Bun HTTP API + SQLite (`@ims/server`)
│   │   ├── src/
│   │   │   ├── data/             # Local seed/static server data
│   │   │   ├── routes/           # Split HTTP route modules
│   │   │   ├── services/         # Business logic and integrations
│   │   │   ├── utils/            # HTTP/logging helpers
│   │   │   ├── config.ts         # Runtime path/port config
│   │   │   ├── db.ts             # SQLite open/bootstrap/migrations
│   │   │   ├── index.ts          # Bun.serve entry
│   │   │   ├── routes.ts         # Main route dispatcher
│   │   │   └── schema.ts         # Drizzle runtime schema
│   │   └── vitest.config.ts      # Server unit test config
│   └── shared/                   # Cross-package contracts (`@ims/shared`)
│       ├── src/
│       │   ├── dictionaries/     # Baobao numeric code dictionaries
│       │   ├── api-types.ts      # API request/response contracts
│       │   ├── db-schema.ts      # Plain TS DB interfaces
│       │   ├── constants.ts      # Shared ports, file types, app constants
│       │   ├── agent-contract.ts # Agent workflow contract validation
│       │   ├── workspace-agent.ts# Workspace agent definition types
│       │   └── index.ts          # Barrel export
│       └── vitest.config.ts      # Shared unit test config
├── e2e/                          # Playwright E2E specs and support helpers
├── resources/                    # Bundled runtime resources
│   └── interview-opencode/       # Embedded OpenCode skills/tools resource
├── scripts/                      # Release, changelog, dev startup and utility scripts
├── runtime/                      # Local SQLite/files/log runtime data
├── .agents/skills/               # Repository-local agent skills index
├── .planning/codebase/           # GSD codebase maps
├── package.json                  # Root scripts and package manager pin
├── pnpm-workspace.yaml           # Workspace package globs
├── turbo.json                    # Turbo task graph
├── vitest.config.ts              # Root Vitest workspace config
└── playwright.config.ts          # Playwright E2E config
```

## Directory Purposes

**`apps/web/`:**
- Purpose: Browser/Tauri WebView application for the candidate management UI.
- Contains: Vue 3 SFCs, Pinia stores, API clients, Vite/Tailwind setup, generated auto-import typings.
- Key files: `apps/web/src/main.ts`, `apps/web/src/App.vue`, `apps/web/src/router/index.ts`, `apps/web/vite.config.ts`, `apps/web/package.json`.

**`apps/web/src/api/`:**
- Purpose: One module per backend domain, all using the shared client wrapper.
- Contains: `client.ts`, `auth.ts`, `candidates.ts`, LUI/import/sync/interview/message/email clients.
- Key files: `apps/web/src/api/client.ts`, `apps/web/src/api/candidates.ts`.

**`apps/web/src/components/`:**
- Purpose: Reusable visual and interaction components.
- Contains: shadcn-vue style `ui/`, LUI-specific `lui/`, onboarding/changelog/app components.
- Key files: `apps/web/src/components/ui/`, `apps/web/src/components/lui/`, `apps/web/src/components/app-notification-center.vue`.

**`apps/web/src/views/`:**
- Purpose: Route-level screens. Keep them as presentation/orchestration shells.
- Contains: Candidate, import, settings, LUI, screening template, error and login views.
- Key files: `apps/web/src/views/CandidatesView.vue`, `apps/web/src/views/LUIView.vue`, `apps/web/src/views/ImportView.vue`.

**`apps/web/src/stores/`:**
- Purpose: Pinia state management and UI-domain actions.
- Contains: Auth, candidates, LUI, sync, onboarding and store bootstrap.
- Key files: `apps/web/src/stores/index.ts`, `apps/web/src/stores/auth.ts`, `apps/web/src/stores/candidates.ts`.

**`apps/web/src/composables/`:**
- Purpose: Shared Vue composition functions.
- Contains: Theme, notifications, changelog/onboarding and view logic helpers.
- Key files: `apps/web/src/composables/use-theme.ts`, `apps/web/src/composables/use-whats-new.ts`.

**`apps/web/src/router/`:**
- Purpose: Single route table and auth navigation guard.
- Contains: `index.ts` only.
- Key files: `apps/web/src/router/index.ts`.

**`apps/desktop/`:**
- Purpose: Native desktop shell and packaging layer.
- Contains: Tauri configuration, Rust app code, recorder/native commands, icons/capabilities/resources config.
- Key files: `apps/desktop/src/main.rs`, `apps/desktop/src/lib.rs`, `apps/desktop/src/recorder.rs`, `apps/desktop/tauri.conf.json`, `apps/desktop/package.json`.

**`packages/server/`:**
- Purpose: Local HTTP API, persistence, integrations, AI workflows and file processing.
- Contains: Bun entrypoint, route dispatcher, split routes, Drizzle schema, SQLite bootstrap, business services.
- Key files: `packages/server/src/index.ts`, `packages/server/src/routes.ts`, `packages/server/src/db.ts`, `packages/server/src/schema.ts`, `packages/server/src/config.ts`.

**`packages/server/src/routes/`:**
- Purpose: Modular route handlers split out of the main dispatcher.
- Contains: Message, memory, session memory, file resources, email, interview assessment, interview import, screening templates, recorder routes.
- Key files: `packages/server/src/routes/messages.ts`, `packages/server/src/routes/interview-import.ts`, `packages/server/src/routes/recorder.ts`.

**`packages/server/src/services/`:**
- Purpose: Server-side business logic and external integrations.
- Contains: LUI workflow/tools/agents/runtime, import pipeline, IMR import/export, Baobao login/sync/resume, message/memory/file/email services.
- Key files: `packages/server/src/services/import/pipeline.ts`, `packages/server/src/services/lui-workflow.ts`, `packages/server/src/services/lui-tools.ts`, `packages/server/src/services/message.ts`, `packages/server/src/services/sync-manager.ts`.

**`packages/server/src/services/import/`:**
- Purpose: Resume import lifecycle.
- Contains: Pipeline orchestration, text extractor, parser, AI screening, hash reuse, ZIP/PDF handling, types.
- Key files: `packages/server/src/services/import/pipeline.ts`, `packages/server/src/services/import/extractor.ts`, `packages/server/src/services/import/parser.ts`, `packages/server/src/services/import/ai-screening.ts`.

**`packages/server/src/services/imr/`:**
- Purpose: IMR candidate archive import/export.
- Contains: Importer, exporter, package types.
- Key files: `packages/server/src/services/imr/importer.ts`, `packages/server/src/services/imr/exporter.ts`, `packages/server/src/services/imr/types.ts`.

**`packages/server/src/services/share/`:**
- Purpose: LAN device discovery and transfer.
- Contains: UDP discovery and transfer logic.
- Key files: `packages/server/src/services/share/discovery.ts`, `packages/server/src/services/share/transfer.ts`.

**`packages/server/src/utils/`:**
- Purpose: Shared server utility helpers.
- Contains: HTTP envelope helpers and structured logger helpers.
- Key files: `packages/server/src/utils/http.ts`, `packages/server/src/utils/logger.ts`.

**`packages/shared/`:**
- Purpose: Shared contracts consumed by web and server.
- Contains: TypeScript interfaces/types, constants, dictionaries, contract validation helpers.
- Key files: `packages/shared/src/index.ts`, `packages/shared/src/api-types.ts`, `packages/shared/src/db-schema.ts`, `packages/shared/src/constants.ts`.

**`e2e/`:**
- Purpose: Playwright end-to-end scenarios and test support.
- Contains: Route specs and helper modules.
- Key files: `e2e/candidates-route.spec.ts`, `e2e/import-screening-flow.spec.ts`, `e2e/lui-gateway.spec.ts`, `e2e/support/auth.ts`.

**`resources/interview-opencode/`:**
- Purpose: Bundled resource directory for workspace-native/embedded OpenCode capabilities.
- Contains: Skills and tools resources loaded by server/desktop packaging flows.
- Key files: `resources/interview-opencode/skills/`, `resources/interview-opencode/tools/`.

**`scripts/`:**
- Purpose: Development startup, release readiness, changelog generation, desktop verification and utility scripts.
- Contains: Shell and Node scripts.
- Key files: `scripts/start-web-dev.sh`, `scripts/start-desktop-dev.sh`, `scripts/release-readiness.mjs`, `scripts/generate-whats-new.mjs`.

**`runtime/`:**
- Purpose: Local generated runtime data for SQLite, files, imports, recordings, logs and agent workspaces.
- Contains: Data created by `packages/server/src/config.ts` and `packages/server/src/db.ts`.
- Key files: `runtime/interview.db`, `runtime/data/`, `runtime/files/`, `runtime/recordings/` when present.

**`.agents/skills/`:**
- Purpose: Repository-local agent skills.
- Contains: `humanizer-zh` text editing skill.
- Key files: `.agents/skills/humanizer-zh/SKILL.md`.

## Key File Locations

**Entry Points:**
- `apps/web/src/main.ts`: Vue SPA bootstrap.
- `apps/web/src/App.vue`: Root web shell and global hosts.
- `apps/web/src/router/index.ts`: Route table and auth guard.
- `packages/server/src/index.ts`: Bun server bootstrap and request entry.
- `packages/server/src/routes.ts`: Main API dispatcher.
- `apps/desktop/src/main.rs`: Rust executable entry.
- `apps/desktop/src/lib.rs`: Tauri app runner.
- `packages/shared/src/index.ts`: Shared package barrel.

**Configuration:**
- `package.json`: Root scripts, Node/pnpm engines and workspace dev commands.
- `pnpm-workspace.yaml`: Workspace membership for `packages/*` and `apps/*`.
- `turbo.json`: Build/typecheck/test task graph.
- `apps/web/vite.config.ts`: Vite plugins, `@` alias, dev port `9091`, `/api` proxy to server.
- `apps/desktop/tauri.conf.json`: Tauri window, bundle, updater, deep-link and file association config.
- `packages/server/src/config.ts`: Server host, port and runtime directory env handling.
- `vitest.config.ts`: Root Vitest workspace.
- `playwright.config.ts`: E2E browser test config.

**Core Logic:**
- `packages/server/src/services/import/pipeline.ts`: Import batch/task orchestration.
- `packages/server/src/services/lui-workflow.ts`: LUI workflow state machine and stage execution.
- `packages/server/src/services/lui-tools.ts`: LUI tools and AI/tool execution helpers.
- `packages/server/src/services/deepagents-runtime.ts`: Deep Agent runtime integration.
- `packages/server/src/services/message.ts`: Conversation message lifecycle.
- `packages/server/src/services/sync-manager.ts`: Remote sync lifecycle.
- `packages/server/src/services/baobao-client.ts`: Baobao remote API client.
- `packages/server/src/services/imr/importer.ts`: IMR archive import.
- `packages/server/src/services/imr/exporter.ts`: IMR archive export.

**Persistence:**
- `packages/server/src/db.ts`: SQLite connection, PRAGMAs, table creation and startup migrations.
- `packages/server/src/schema.ts`: Drizzle schema for runtime DB operations.
- `packages/shared/src/db-schema.ts`: Plain TypeScript entity contracts.
- `runtime/`: Local generated application data.

**API Contracts:**
- `packages/shared/src/api-types.ts`: API envelope and request/response types.
- `packages/shared/src/constants.ts`: Shared network/app constants.
- `packages/shared/src/dictionaries/baobao.ts`: Remote numeric code dictionaries.
- `packages/shared/src/agent-contract.ts`: Agent workflow stage/intent contract.
- `packages/shared/src/workspace-agent.ts`: Workspace agent config types.

**Testing:**
- `e2e/*.spec.ts`: Playwright E2E specs.
- `e2e/support/*.ts`: Playwright helpers.
- `packages/server/src/*.test.ts`: Server Vitest tests.
- `packages/shared/src/*.test.ts`: Shared package Vitest tests.
- `scripts/__tests__/generate-whats-new.test.ts`: Script-level Vitest test.
- `apps/web/vitest.config.ts`, `packages/server/vitest.config.ts`, `packages/shared/vitest.config.ts`: Package test configs.

## Naming Conventions

**Files:**
- Vue page components use PascalCase with `View` suffix: `apps/web/src/views/CandidatesView.vue`, `apps/web/src/views/LUIView.vue`.
- Vue reusable components use kebab-case in component folders: `apps/web/src/components/app-notification-center.vue`, `apps/web/src/components/lui/workflow-action-card.vue`.
- UI primitives live under kebab-case directories and filenames: `apps/web/src/components/ui/scroll-area/`, `apps/web/src/components/ui/dropdown-menu/`.
- TypeScript API/store/service files use kebab-case or domain nouns: `apps/web/src/api/screening-templates.ts`, `packages/server/src/services/session-memory.ts`.
- Tests use `.test.ts` or `.spec.ts`: `packages/shared/src/constants.test.ts`, `e2e/changelog.spec.ts`.
- Rust files use snake_case where split: `apps/desktop/src/recorder.rs`.

**Directories:**
- Workspace apps/packages are plural containers: `apps/`, `packages/`.
- Web source directories are layer/domain names: `api/`, `components/`, `composables/`, `router/`, `stores/`, `views/`.
- Server source directories separate delivery and domain: `routes/`, `services/`, `utils/`, `data/`.
- Service subdomains use nouns: `import/`, `imr/`, `share/`.

## Where to Add New Code

**New Web Page:**
- Primary code: `apps/web/src/views/<Feature>View.vue`.
- Route: Add to `apps/web/src/router/index.ts` with `meta.requiresAuth` when protected.
- State: Add or extend a store in `apps/web/src/stores/`.
- API calls: Add `apps/web/src/api/<feature>.ts`; use `apps/web/src/api/client.ts` helpers.

**New Web Component:**
- App-specific component: `apps/web/src/components/<feature-name>.vue` or `apps/web/src/components/<domain>/<component-name>.vue`.
- Generic design-system primitive: `apps/web/src/components/ui/<component-name>/`.
- LUI-only component: `apps/web/src/components/lui/<component-name>.vue`.

**New API Endpoint:**
- Prefer split route module: `packages/server/src/routes/<feature>.ts`.
- Delegate from `packages/server/src/routes.ts` near the existing split route calls at the end of `routeInternal()`.
- Shared request/response types: `packages/shared/src/api-types.ts`.
- Client wrapper: `apps/web/src/api/<feature>.ts`.

**New Server Business Feature:**
- Primary code: `packages/server/src/services/<feature>.ts` or `packages/server/src/services/<feature>/` for multi-file domains.
- Database tables: `packages/server/src/schema.ts` and `packages/server/src/db.ts` for runtime creation/compatibility.
- Shared entity/API types: `packages/shared/src/db-schema.ts` and `packages/shared/src/api-types.ts`.
- Route exposure: `packages/server/src/routes/<feature>.ts`.

**New Database Entity or Column:**
- Runtime Drizzle table/column: `packages/server/src/schema.ts`.
- Startup DDL/migration compatibility: `packages/server/src/db.ts`.
- Shared TS contract: `packages/shared/src/db-schema.ts`.
- API response contract if exposed: `packages/shared/src/api-types.ts`.

**New Import Pipeline Step:**
- Pipeline orchestration: `packages/server/src/services/import/pipeline.ts`.
- Dedicated helpers: `packages/server/src/services/import/<step-name>.ts`.
- Task/batch contract: `packages/shared/src/api-types.ts` and `packages/shared/src/import-screening.ts` if exposed to web.

**New LUI Workflow Capability:**
- Workflow state/transition: `packages/server/src/services/lui-workflow.ts` or `packages/server/src/services/lui-workflow-runtime.ts`.
- Tool: `packages/server/src/services/lui-tools.ts` or split helper under `packages/server/src/services/`.
- Agent contract changes: `packages/shared/src/agent-contract.ts`.
- UI: `apps/web/src/components/lui/` and `apps/web/src/views/LUIView.vue`.

**New Desktop Native Command:**
- Command implementation: `apps/desktop/src/lib.rs` or a split Rust module such as `apps/desktop/src/<feature>.rs`.
- Register command: `tauri::generate_handler![]` in `apps/desktop/src/lib.rs`.
- Frontend use: web code should call Tauri API from `apps/web/src/` only when `__TAURI_INTERNALS__` is present.

**Utilities:**
- Web-only browser/UI helper: `apps/web/src/lib/` or `apps/web/src/composables/`.
- Server-only helper: `packages/server/src/utils/`.
- Cross-package type/constant/helper: `packages/shared/src/`.
- Script/release helper: `scripts/`.

## Special Directories

**`runtime/`:**
- Purpose: Local mutable application data.
- Generated: Yes.
- Committed: Should be treated as runtime output, not source.

**`apps/web/src/auto-imports.d.ts` and `apps/web/src/components.d.ts`:**
- Purpose: Generated declarations from Vite auto-import/component plugins.
- Generated: Yes.
- Committed: Present in repo; update through tooling when plugin config changes.

**`packages/server/dist/`:**
- Purpose: Compiled server bundle used by Tauri bundle resources.
- Generated: Yes.
- Committed: Build output when present; source of truth remains `packages/server/src/`.

**`apps/web/dist/`:**
- Purpose: Built frontend used by Tauri `frontendDist`.
- Generated: Yes.
- Committed: Build output when present; source of truth remains `apps/web/src/`.

**`resources/interview-opencode/`:**
- Purpose: Bundled skills/tools resource loaded from `config.bundledInterviewOpencodeDir` in `packages/server/src/config.ts`.
- Generated: No.
- Committed: Yes.

**`.planning/codebase/`:**
- Purpose: GSD-generated architecture, stack, conventions, testing and concerns maps.
- Generated: Yes.
- Committed: Intended project planning documentation.

**`.agents/skills/`:**
- Purpose: Repository-local agent skill definitions.
- Generated: No.
- Committed: Yes when project-specific skills are needed.

---

*Structure analysis: 2026-05-23*
