# Technology Stack

**Analysis Date:** 2026-05-23

## Languages

**Primary:**
- TypeScript 5.9.2 - Web SPA, server API, shared contracts, tests, and scripts in `apps/web/src/`, `packages/server/src/`, `packages/shared/src/`, `e2e/`, and `scripts/`.
- Rust 2021 edition - Tauri desktop shell and native commands in `apps/desktop/src/lib.rs` and `apps/desktop/src/main.rs`.

**Secondary:**
- JavaScript / Node ESM - build and release helper scripts such as `packages/server/scripts/build-compiled.mjs`, `scripts/generate-whats-new.mjs`, and root scripts in `package.json`.
- SQL - SQLite schema/bootstrap SQL embedded in `packages/server/src/db.ts`, with Drizzle table definitions in `packages/server/src/schema.ts`.

## Runtime

**Environment:**
- Node.js >=20 - required by root `package.json` engines and used by workspace scripts.
- Bun - server runtime via `packages/server/package.json` script `bun run src/index.ts`, Bun HTTP server in `packages/server/src/index.ts`, and SQLite access via `bun:sqlite` in `packages/server/src/db.ts`.
- Tauri v2 / native desktop runtime - configured in `apps/desktop/tauri.conf.json`; Rust crate dependencies live in `apps/desktop/Cargo.toml`.
- Browser / WebView - Vue SPA builds from `apps/web/src/main.ts` and is loaded by Tauri from `apps/web/dist`.

**Package Manager:**
- pnpm 9.15.9 - declared in `package.json` as `packageManager`, with workspace packages from `pnpm-workspace.yaml`.
- Lockfiles: `pnpm-lock.yaml`, `bun.lock`, and `apps/desktop/Cargo.lock` are present.
- Bun is also required for compiling the local server binary in `packages/server/scripts/build-compiled.mjs`.

## Frameworks

**Core:**
- Vue 3.5.13 - SPA UI in `apps/web/src/`; root package `@ims/web` in `apps/web/package.json`.
- Vite 6.3.5 - web dev/build server configured in `apps/web/vite.config.ts`.
- Pinia 3.0.2 - frontend state management under `apps/web/src/stores/`.
- Vue Router 4.5.0 - routing configured in `apps/web/src/router/index.ts`.
- Tauri 2 - desktop shell configured by `apps/desktop/tauri.conf.json` and implemented in `apps/desktop/src/lib.rs`.
- Bun.serve - local HTTP API entry point in `packages/server/src/index.ts`.
- Drizzle ORM 0.44.6 + `bun:sqlite` - database access in `packages/server/src/db.ts` and schema in `packages/server/src/schema.ts`.

**Testing:**
- Vitest 3.2.4 - workspace config in `vitest.config.ts`; package configs in `apps/web/vitest.config.ts`, `packages/server/vitest.config.ts`, and `packages/shared/vitest.config.ts`.
- happy-dom 17.6.3 - web unit-test DOM environment in `apps/web/vitest.config.ts`.
- Playwright 1.59.1 - E2E runner configured in `playwright.config.ts`, specs in `e2e/`.

**Build/Dev:**
- Turbo 2.5.3 - task orchestration in `turbo.json`.
- vue-tsc 2.2.12 - web type checking in `apps/web/package.json`.
- TypeScript project references - `apps/web/tsconfig.json`, `packages/server/tsconfig.json`, and `packages/shared/tsconfig.json` reference `@ims/shared`.
- Tailwind CSS 4.2.2 and `@tailwindcss/vite` - web styling configured in `apps/web/vite.config.ts`.
- unplugin-auto-import and unplugin-vue-components - generated imports/components configured in `apps/web/vite.config.ts`.
- shadcn-vue / radix-vue / reka-ui - UI component foundation declared in `apps/web/package.json`.

## Key Dependencies

**Critical:**
- `@ims/shared` workspace package - shared API types, DB types, constants, and dictionaries exported from `packages/shared/src/index.ts`.
- `ai` 6.0.135 and `@ai-sdk/openai` 3.0.47 - LUI/AI model calls in `packages/server/src/routes.ts` and frontend AI UI support in `apps/web/package.json`.
- `@ai-sdk/openai-compatible` 0.2.0 - OpenAI-compatible providers in `packages/server/package.json`.
- `@deepagents/agent` 0.31.0 - Deep Agent runtime integration in `packages/server/src/services/deepagents-runtime.ts`.
- `drizzle-orm` 0.44.6 - runtime ORM in `packages/server/src/db.ts` and `packages/server/src/schema.ts`.
- `zod` 3.25.76 - validation dependency in web/server packages.
- `@tauri-apps/api`, `@tauri-apps/plugin-clipboard-manager`, and Rust Tauri plugins - desktop/web bridge in `apps/web/src/lib/clipboard.ts`, `apps/web/src/lib/recorder/adapter.ts`, and `apps/desktop/Cargo.toml`.

**Infrastructure:**
- `jszip` - IMR/ZIP processing in server import/export features under `packages/server/src/services/imr/` and `packages/server/src/services/import/`.
- `unpdf` - PDF text extraction for resume import in `packages/server/src/services/import/`.
- `nodemailer` - SMTP email sending loaded dynamically in `packages/server/src/services/email.ts`.
- `qrcode` - frontend QR rendering for login flows in `apps/web/package.json`.
- `dompurify`, `marked`, `shiki`, `vue-stream-markdown`, `ansi-to-vue3` - markdown/code rendering for LUI and rich UI in `apps/web/package.json`.
- `@rive-app/webgl2`, `motion-v`, `embla-carousel-vue`, `media-chrome`, `driver.js` - advanced UI/animation/media/onboarding support in `apps/web/package.json`.
- Rust `cpal`, `hound`, and optional `whisper-rs` - native recording/local transcription support in `apps/desktop/Cargo.toml` and `apps/desktop/src/lib.rs`.
- Rust `reqwest` optional feature - local transcription/download HTTP support in `apps/desktop/Cargo.toml`.

## Configuration

**Environment:**
- Server host/port and runtime paths are configured by `IMS_HOST`, `IMS_PORT`, `IMS_ROOT_DIR`, `IMS_RUNTIME_DIR`, `IMS_DATA_DIR`, `IMS_FILES_DIR`, `IMS_AGENT_WORKSPACES_DIR`, `IMS_DB_PATH`, and `IMS_BUNDLED_INTERVIEW_OPENCODE_DIR` in `packages/server/src/config.ts`.
- AI gateway defaults use `CUSTOM_BASE_URL`, `CUSTOM_API_KEY`, and `VERCEL_AI_GATEWAY_TOKEN` in `packages/server/src/routes.ts`; the default OpenAI-compatible base URL is `https://ai-gateway.vercel.com/v1`.
- Baobao debug/session flags use `IMS_DEBUG_BAOBAO`, `IMS_DEBUG_BAOBAO_HTTP`, and `IMS_BAOBAO_SESSION_COOKIE` in `packages/server/src/services/baobao-login.ts` and `packages/server/src/services/baobao-http-login.ts`.
- Server structured log stack traces are toggled by `IMS_LOG_STACK` in `packages/server/src/utils/logger.ts`.
- Web dev proxy target uses `IMS_PORT`; dev host uses `VITE_DEV_HOST`; mock API mode uses `VITE_MOCK` in `apps/web/vite.config.ts`.
- Playwright uses `PLAYWRIGHT_WEB_PORT`, `PLAYWRIGHT_API_PORT`, `PLAYWRIGHT_HOST`, `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_API_HEALTH_URL`, `PLAYWRIGHT_USE_EXISTING_SERVER`, `PLAYWRIGHT_BROWSER`, and `PLAYWRIGHT_BROWSER_CHANNEL` in `playwright.config.ts`.
- No `.env` files detected in the repository scan.

**Build:**
- Root workspace scripts live in `package.json` and call filtered package scripts.
- Workspace package layout is defined by `pnpm-workspace.yaml` (`packages/*`, `apps/*`).
- Turbo task graph is defined in `turbo.json`.
- Web build/dev config is `apps/web/vite.config.ts`.
- TypeScript configs are `apps/web/tsconfig.json`, `packages/server/tsconfig.json`, and `packages/shared/tsconfig.json`.
- Server compiled binary build is `packages/server/scripts/build-compiled.mjs`, mapping Tauri target triples to Bun compile targets.
- Desktop build, bundle targets, file associations, CSP, resources, updater, and deep-link schemes are in `apps/desktop/tauri.conf.json`.
- Rust package/dependencies/features are in `apps/desktop/Cargo.toml`.
- Test configs are `vitest.config.ts`, `apps/web/vitest.config.ts`, `packages/server/vitest.config.ts`, `packages/shared/vitest.config.ts`, and `playwright.config.ts`.

## Platform Requirements

**Development:**
- Use Node.js >=20 and pnpm >=9 as required by `package.json`.
- Install Bun for `@ims/server` development and server compilation (`packages/server/package.json`, `packages/server/scripts/build-compiled.mjs`).
- Install Rust/Cargo and Tauri CLI for desktop builds (`apps/desktop/package.json`, `apps/desktop/Cargo.toml`).
- Default dev ports: web `127.0.0.1:9091` from `apps/web/vite.config.ts`; server `127.0.0.1:9092` from `packages/server/src/config.ts`; OpenCode default `127.0.0.1:4096` from `packages/shared/src/constants.ts`; LAN discovery UDP `34567` from `packages/server/src/services/share/discovery.ts`.
- Runtime data is created under `runtime/` by `packages/server/src/config.ts` and ignored by `.gitignore`.

**Production:**
- Desktop bundle is the primary target: `apps/desktop/tauri.conf.json` embeds `../../packages/server/dist` as a resource and loads the built frontend from `../web/dist`.
- Tauri bundle targets include `dmg`, `app`, `deb`, `appimage`, and `nsis` in `apps/desktop/tauri.conf.json`.
- Auto-update artifacts are enabled in `apps/desktop/tauri.conf.json`.
- Server binary is compiled by Bun using target triples from `packages/server/scripts/build-compiled.mjs`.
- Local web production client discovers the server across `127.0.0.1:9092` through `127.0.0.1:9112` in `apps/web/src/api/client.ts`.

---

*Stack analysis: 2026-05-23*
