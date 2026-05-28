# External Integrations

**Analysis Date:** 2026-05-23

## APIs & External Services

**AI model providers:**
- Vercel AI Gateway / OpenAI-compatible API - default LUI model gateway and runtime model calls.
  - SDK/Client: `ai`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` in `packages/server/package.json`; provider setup in `packages/server/src/routes.ts`.
  - Auth: `CUSTOM_API_KEY` or `VERCEL_AI_GATEWAY_TOKEN`; base URL override via `CUSTOM_BASE_URL` in `packages/server/src/routes.ts`.
- OpenAI - preset provider for chat/model endpoints.
  - SDK/Client: Vercel AI SDK via `@ai-sdk/openai`; preset base URL `https://api.openai.com/v1` in `packages/server/src/routes.ts` and `apps/web/src/lib/ai-gateway-config.ts`.
  - Auth: user-provided endpoint API key in LUI settings (`LuiGatewayEndpoint`) or default gateway env vars in `packages/server/src/routes.ts`.
- Anthropic, MiniMax, Moonshot, DeepSeek, Google Gemini, SiliconFlow, OpenRouter, and xAI/Grok - preset OpenAI-compatible or provider endpoints for LUI.
  - SDK/Client: provider list and `/models` fetching logic in `packages/server/src/routes.ts`; frontend preset base URLs in `apps/web/src/lib/ai-gateway-config.ts`.
  - Auth: user-provided API key stored in LUI endpoint settings (`apps/web/src/lib/ai-gateway-config.ts`) and passed to server routes in `packages/server/src/routes.ts`.

**Baobao / getui remote interview system:**
- `https://baobao.getui.com` - remote candidate/interview/auth system.
  - SDK/Client: custom `fetch` client in `packages/server/src/services/baobao-client.ts`.
  - Auth: `x-token` JWT header and persisted cookies; stored in `remote_users` table via `packages/server/src/db.ts` / `packages/server/src/schema.ts`.
  - Login: pure HTTP QR login flow in `packages/server/src/services/baobao-http-login.ts`, surfaced through login helpers in `packages/server/src/services/baobao-login.ts` and routes in `packages/server/src/routes.ts`.
  - Sync: polling/import flow in `packages/server/src/services/sync-manager.ts`.
  - Resume sync: `packages/server/src/services/baobao-resume.ts`.

**OpenCode local service:**
- Local OpenCode service - workspace/agent subprocess integration for LUI workflows.
  - SDK/Client: server routes under `/api/system/opencode` in `packages/server/src/routes.ts`; bundled resources under `resources/interview-opencode/`.
  - Auth: Not detected; local process/service integration uses localhost defaults from `packages/shared/src/constants.ts` (`OPENCODE_DEFAULT_PORT = 4096`).

**Desktop / native OS services:**
- Tauri native APIs - desktop window, tray, updater, deep-link, shell, clipboard, single-instance, and recorder bridge.
  - SDK/Client: Rust plugins in `apps/desktop/Cargo.toml`; frontend imports in `apps/web/src/lib/clipboard.ts` and `apps/web/src/lib/recorder/adapter.ts`.
  - Auth: Not applicable.
- GitHub Releases updater - desktop auto-update feed.
  - SDK/Client: `tauri-plugin-updater` in `apps/desktop/Cargo.toml` and endpoint in `apps/desktop/tauri.conf.json`.
  - Auth: Public update endpoint; public minisign key in `apps/desktop/tauri.conf.json`.

**LAN sharing:**
- Local network device discovery and IMR file transfer - peer IMS instances discover each other and send candidate packages.
  - SDK/Client: UDP broadcast via Node `dgram` in `packages/server/src/services/share/discovery.ts`; HTTP transfer to peer `/api/share/import` in `packages/server/src/services/share/transfer.ts`.
  - Auth: Not detected; identity is local device/user metadata from `DiscoveryService`.

**SMTP email:**
- User-configured SMTP servers - send interview-related emails from stored email configs/templates.
  - SDK/Client: `nodemailer` dynamically imported in `packages/server/src/services/email.ts`.
  - Auth: SMTP host/port/user/password stored in `email_configs` table (`packages/server/src/db.ts`, `packages/server/src/schema.ts`).

**External chat/developer tools links:**
- Scira, ChatGPT, Claude, T3 Chat, v0, and Cursor - frontend “open in chat” prompt links.
  - SDK/Client: URL generation in `apps/web/src/components/ai-elements/open-in-chat/providers/index.ts`.
  - Auth: Handled by each external site in the user browser; no server-side auth detected.

## Data Storage

**Databases:**
- SQLite local database.
  - Connection: `IMS_DB_PATH` env var or default `runtime/interview.db` from `packages/server/src/config.ts`.
  - Client: `bun:sqlite` `Database` plus Drizzle `drizzle-orm/bun-sqlite` in `packages/server/src/db.ts`.
  - Bootstrap: `CREATE TABLE IF NOT EXISTS` and compatibility `ensureColumn()` calls in `packages/server/src/db.ts`; Drizzle schema in `packages/server/src/schema.ts`.
  - Tables include `users`, `candidates`, `resumes`, `interviews`, `interview_assessments`, `artifacts`, `import_batches`, `import_file_tasks`, `share_records`, `recordings`, `email_configs`, `email_templates`, `conversations`, `messages`, `agents`, `memories`, `session_memories`, `remote_users`, `provider_credentials`, and workflow tables in `packages/server/src/db.ts`.

**File Storage:**
- Local filesystem only.
  - Runtime root: `IMS_RUNTIME_DIR` or `runtime/` in `packages/server/src/config.ts`.
  - Data/files directories: `IMS_DATA_DIR`, `IMS_FILES_DIR`, and `IMS_AGENT_WORKSPACES_DIR` in `packages/server/src/config.ts`.
  - Recordings directory: `runtime/recordings` created in `packages/server/src/db.ts`.
  - IMR ZIP packages use local paths via services under `packages/server/src/services/imr/`.
  - Desktop logs use native filesystem rotation/export in `apps/desktop/src/lib.rs`.

**Caching:**
- No external cache service detected.
- In-process caches/timers include SMTP transporter cache in `packages/server/src/services/email.ts`, Baobao client singleton in `packages/server/src/services/baobao-client.ts`, discovery device map in `packages/server/src/services/share/discovery.ts`, sync interval state in `packages/server/src/services/sync-manager.ts`, and frontend localStorage caches in `apps/web/src/api/client.ts` and `apps/web/src/lib/ai-gateway-config.ts`.

## Authentication & Identity

**Auth Provider:**
- Baobao remote identity.
  - Implementation: QR login and token restoration via `packages/server/src/services/baobao-http-login.ts`, `packages/server/src/services/baobao-login.ts`, startup restoration in `packages/server/src/index.ts`, and auth routes in `packages/server/src/routes.ts`.
  - Token/cookie persistence: `remote_users` table in `packages/server/src/db.ts` and `packages/server/src/schema.ts`.
  - Request auth: `x-token` header in `packages/server/src/services/baobao-client.ts`.

**Local app identity:**
- Local user/session state is stored in SQLite `users` and `remote_users` tables in `packages/server/src/db.ts`.
- Frontend route guard checks server auth status through API clients and Pinia stores under `apps/web/src/stores/` and routes in `apps/web/src/router/index.ts`.
- Device identity for LAN discovery is generated/persisted in `~/.interview-manager/device-id.txt` by `packages/server/src/services/share/discovery.ts`.

**AI provider credentials:**
- User-supplied LUI gateway endpoint API keys are represented as `LuiGatewayEndpoint` values and localStorage-backed frontend settings in `apps/web/src/lib/ai-gateway-config.ts`.
- Server default AI credentials come from `CUSTOM_API_KEY` / `VERCEL_AI_GATEWAY_TOKEN` in `packages/server/src/routes.ts`.
- `provider_credentials` table exists in `packages/server/src/db.ts` / `packages/server/src/schema.ts`, but core LUI gateway resolution is implemented in `packages/server/src/routes.ts`.

## Monitoring & Observability

**Error Tracking:**
- No external error tracking service detected.

**Logs:**
- Server structured JSON logs use `logInfo`, `logWarn`, and `logError` in `packages/server/src/utils/logger.ts`; sensitive keys matching token/password/api-key patterns are redacted.
- Server still uses direct `console.*` in files such as `packages/server/src/index.ts`, `packages/server/src/services/sync-manager.ts`, and `packages/server/src/services/share/discovery.ts`.
- Desktop native logs rotate in `apps/desktop/src/lib.rs` with 20 MB file limit and 5 rotated files; export keeps up to 10 bundles.
- Playwright HTML report output is configured as `playwright-report` in `playwright.config.ts`.

## CI/CD & Deployment

**Hosting:**
- Primary distribution is Tauri desktop bundles configured in `apps/desktop/tauri.conf.json`.
- Web UI is bundled into `apps/web/dist` and loaded by desktop via `frontendDist` in `apps/desktop/tauri.conf.json`.
- Server is compiled into `packages/server/dist/server` (or `server.exe`) by `packages/server/scripts/build-compiled.mjs` and embedded as a Tauri resource in `apps/desktop/tauri.conf.json`.

**CI Pipeline:**
- No GitHub Actions, GitLab CI, or other CI workflow detected in the analyzed repository files.
- Release/readiness and changelog automation are local scripts in `package.json` (`release:check`, `changelog:draft`, `changelog:build`).
- Desktop updater endpoint points to GitHub Releases: `https://github.com/code-lixm/IMS/releases/latest/download/latest.json` in `apps/desktop/tauri.conf.json`.

## Environment Configuration

**Required env vars:**
- Not strictly required for local defaults: server defaults to `127.0.0.1:9092` and `runtime/interview.db` via `packages/server/src/config.ts`.
- AI gateway production/default calls require one of `CUSTOM_API_KEY` or `VERCEL_AI_GATEWAY_TOKEN` when using the default OpenAI-compatible gateway in `packages/server/src/routes.ts`.
- Optional AI base URL override: `CUSTOM_BASE_URL` in `packages/server/src/routes.ts`.
- Optional runtime path overrides: `IMS_ROOT_DIR`, `IMS_RUNTIME_DIR`, `IMS_DATA_DIR`, `IMS_FILES_DIR`, `IMS_AGENT_WORKSPACES_DIR`, `IMS_DB_PATH`, and `IMS_BUNDLED_INTERVIEW_OPENCODE_DIR` in `packages/server/src/config.ts`.
- Optional server binding: `IMS_HOST` and `IMS_PORT` in `packages/server/src/config.ts`.
- Optional Baobao diagnostics/session override: `IMS_DEBUG_BAOBAO`, `IMS_DEBUG_BAOBAO_HTTP`, and `IMS_BAOBAO_SESSION_COOKIE` in `packages/server/src/services/baobao-login.ts` and `packages/server/src/services/baobao-http-login.ts`.
- Optional logging detail: `IMS_LOG_STACK` in `packages/server/src/utils/logger.ts`.
- Optional web dev config: `VITE_MOCK`, `VITE_DEV_HOST`, and `IMS_PORT` in `apps/web/vite.config.ts`.
- Optional Playwright config: `PLAYWRIGHT_WEB_PORT`, `PLAYWRIGHT_API_PORT`, `PLAYWRIGHT_HOST`, `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_API_HEALTH_URL`, `PLAYWRIGHT_USE_EXISTING_SERVER`, `PLAYWRIGHT_BROWSER`, and `PLAYWRIGHT_BROWSER_CHANNEL` in `playwright.config.ts`.

**Secrets location:**
- No `.env` files detected in the repository scan.
- `.gitignore` excludes `runtime/`, `*.db`, `*.db-shm`, `*.db-wal`, `*.log`, and `apps/desktop/sparkle_private_key.txt`.
- Baobao tokens/cookies persist in local SQLite `remote_users` (`packages/server/src/db.ts`).
- SMTP credentials persist in local SQLite `email_configs` (`packages/server/src/db.ts`, `packages/server/src/services/email.ts`).
- User AI gateway endpoint API keys are handled by LUI settings/localStorage in `apps/web/src/lib/ai-gateway-config.ts` and request payloads in `packages/server/src/routes.ts`.
- Tauri updater public key is committed in `apps/desktop/tauri.conf.json`; private signing key path is ignored by `.gitignore`.

## Webhooks & Callbacks

**Incoming:**
- Local REST API routes are served by `Bun.serve` in `packages/server/src/index.ts` and routed through `packages/server/src/routes.ts` plus subroutes in `packages/server/src/routes/`.
- LAN peer import callback: `/api/share/import` receives IMR file transfers; sender implementation is in `packages/server/src/services/share/transfer.ts`.
- Tauri deep-link callback scheme `imr://` is configured in `apps/desktop/tauri.conf.json` and handled by desktop code in `apps/desktop/src/lib.rs`.
- File association for `.imr` opens candidate packages through Tauri config in `apps/desktop/tauri.conf.json`.
- Baobao QR login is polled through local endpoints backed by `packages/server/src/services/baobao-login.ts` and `packages/server/src/services/baobao-http-login.ts`; no externally hosted webhook endpoint detected.

**Outgoing:**
- Baobao API requests go to `https://baobao.getui.com/api` and `https://baobao.getui.com/prod-api` from `packages/server/src/services/baobao-http-login.ts` and `packages/server/src/services/baobao-client.ts`.
- AI model and model-list requests go to preset provider base URLs in `packages/server/src/routes.ts` and frontend presets in `apps/web/src/lib/ai-gateway-config.ts`.
- SMTP sends through user-configured mail servers using `nodemailer` in `packages/server/src/services/email.ts`.
- LAN file transfer sends POST requests to peer `http://{ip}:{apiPort}/api/share/import` in `packages/server/src/services/share/transfer.ts`.
- UDP discovery broadcasts to `255.255.255.255`, `192.168.1.255`, and `192.168.0.255` on port `34567` in `packages/server/src/services/share/discovery.ts`.
- Tauri auto-update checks GitHub Releases endpoint from `apps/desktop/tauri.conf.json`.
- Frontend “open in chat” providers navigate to third-party URLs generated in `apps/web/src/components/ai-elements/open-in-chat/providers/index.ts`.

---

*Integration audit: 2026-05-23*
