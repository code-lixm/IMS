# Codebase Concerns

**Analysis Date:** 2026-05-23

## Tech Debt

**Server route monolith:**
- Issue: `packages/server/src/routes.ts` is a 4,156-line route dispatcher that mixes health checks, authentication, sync, candidate CRUD, imports, LUI chat, workflow APIs, model discovery, sharing, and system endpoints in one file.
- Files: `packages/server/src/routes.ts`
- Impact: Small endpoint changes carry high regression risk because imports, helpers, endpoint parsing, serialization, and side effects share one module scope. Merge conflicts and accidental coupling are likely.
- Fix approach: Continue extracting endpoints into domain route modules under `packages/server/src/routes/`, following existing split files such as `packages/server/src/routes/messages.ts`, `packages/server/src/routes/memory.ts`, `packages/server/src/routes/session-memory.ts`, `packages/server/src/routes/file-resources.ts`, `packages/server/src/routes/email.ts`, `packages/server/src/routes/interview-assessment.ts`, `packages/server/src/routes/interview-import.ts`, `packages/server/src/routes/screening-templates.ts`, and `packages/server/src/routes/recorder.ts`.

**Import pipeline monolith:**
- Issue: `packages/server/src/services/import/pipeline.ts` is a 2,267-line orchestration module covering task preparation, ZIP handling, extraction, parsing, candidate resolution, persistence, AI screening, score feedback, export, cancellation, retry, and batch progress.
- Files: `packages/server/src/services/import/pipeline.ts`
- Impact: Import behavior changes are hard to isolate. State transitions and DB writes are distributed across one large module, increasing the risk of partial updates when adding new stages or retry behavior.
- Fix approach: Split by responsibility into stage modules such as task planning, archive expansion, candidate persistence, screening execution, feedback persistence, and export. Keep `processFile()` as a thin coordinator in `packages/server/src/services/import/pipeline.ts`.

**LUI tool and workflow hotspots:**
- Issue: LUI tool execution and workflow state are implemented in large modules with mixed concerns: `packages/server/src/services/lui-tools.ts` is 1,043 lines and `packages/server/src/services/lui-workflow.ts` is a large workflow state module.
- Files: `packages/server/src/services/lui-tools.ts`, `packages/server/src/services/lui-workflow.ts`, `packages/server/src/services/deepagents-runtime.ts`, `packages/server/src/services/lui-workflow-runtime.ts`
- Impact: Agent/tool changes can break unrelated workflow stages. Tool input validation, DB reads, prompt assembly, and file writes are difficult to test independently.
- Fix approach: Keep the public tool registry in `packages/server/src/services/lui-tools.ts`, but move each tool implementation into `packages/server/src/services/lui-tools/*.ts` and keep workflow transition logic separate from serialization and agent execution.

**Frontend giant view:**
- Issue: `apps/web/src/views/LUIView.vue` is a 2,378-line component containing layout, conversation selection, model controls, workflow artifacts, streaming UI, event handling, and scoped CSS.
- Files: `apps/web/src/views/LUIView.vue`, `apps/web/src/components/lui/conversation-list.vue`, `apps/web/src/components/lui/workflow-artifacts.vue`, `apps/web/src/components/lui/model-selector.vue`, `apps/web/src/stores/lui.ts`
- Impact: UI changes are fragile because template, state wiring, and interaction handlers live together. Component-level regression testing is limited, so visual and streaming behavior can break unnoticed.
- Fix approach: Treat `apps/web/src/views/LUIView.vue` as a shell. Move toolbar, split-panel layout, stream composer, message list, workflow side panel, and dialogs into dedicated components under `apps/web/src/components/lui/`.

**Desktop shell monolith:**
- Issue: `apps/desktop/src/lib.rs` is a 1,338-line Tauri runtime module that combines logging, server lifecycle, tray behavior, updater commands, deep-link handling, file manager commands, and window controls.
- Files: `apps/desktop/src/lib.rs`, `apps/desktop/src/main.rs`, `apps/desktop/src/recorder.rs`
- Impact: Desktop behavior is hard to change safely. Server restart logic, UI window handling, and updater state can interact through shared module-level state such as `QUITTING` and `ServerProcess`.
- Fix approach: Split `apps/desktop/src/lib.rs` into `server.rs`, `logger.rs`, `tray.rs`, `updater.rs`, `deep_link.rs`, and `window.rs`, leaving `run()` as the Tauri builder composition point.

**Generated type suppressions:**
- Issue: Generated declaration files suppress linting and TypeScript checks with `/* eslint-disable */` and `// @ts-ignore`.
- Files: `apps/web/src/auto-imports.d.ts`
- Impact: Generated global declarations can hide invalid imports or stale component/composable references. Type failures may surface far from the actual generated declaration.
- Fix approach: Regenerate declarations from the current Vite auto-import/component configuration and avoid hand-editing `apps/web/src/auto-imports.d.ts`. If the generator still emits suppressions, keep the file generated-only and validate consumers through `apps/web/src/**/*.ts` and `apps/web/src/**/*.vue` typechecks.

**Dual schema maintenance:**
- Issue: Runtime schema is defined in SQL bootstrap and Drizzle schema, while shared API/db typing exists separately.
- Files: `packages/server/src/db.ts`, `packages/server/src/schema.ts`, `packages/shared/src/db-schema.ts`, `packages/shared/src/api-types.ts`
- Impact: Columns and JSON payload shapes can drift between server persistence and frontend/shared types. New fields require synchronized edits in multiple files.
- Fix approach: Make `packages/server/src/schema.ts` the source of truth for persistence types and document every manual `CREATE TABLE` / `ensureColumn()` change in `packages/server/src/db.ts`. Add companion shared type updates in `packages/shared/src/db-schema.ts` in the same change.

**Startup migrations embedded in application boot:**
- Issue: Database schema creation and compatibility migrations run directly during module load.
- Files: `packages/server/src/db.ts`
- Impact: Application startup mutates the DB without a versioned migration history. Migration failures can occur before the server exposes health diagnostics, and rollback paths are unclear.
- Fix approach: Introduce versioned migrations under `packages/server/src/migrations/` or a Drizzle migration workflow. Keep `packages/server/src/db.ts` responsible only for connection, pragmas, and invoking migrations.

**Magic constants spread across runtime code:**
- Issue: Operational values are hardcoded in implementation files instead of configuration.
- Files: `packages/server/src/routes.ts`, `packages/server/src/services/import/pipeline.ts`, `packages/server/src/services/import/ai-screening.ts`, `packages/server/src/services/sync-manager.ts`, `packages/server/src/services/share/discovery.ts`, `apps/desktop/src/lib.rs`
- Impact: Timeouts, retry counts, polling intervals, model max token values, UDP ports, and desktop port ranges require code changes and can diverge by feature.
- Fix approach: Move operational defaults to `packages/server/src/config.ts` and desktop constants to a dedicated `apps/desktop/src/config.rs`. Keep feature-specific constants named and exported for tests.

## Known Bugs

**Image resume import is disabled but UI code still contains image paths:**
- Symptoms: PNG/JPG/JPEG/WebP resume imports fail with a user-facing unsupported OCR message.
- Files: `packages/server/src/services/import/extractor.ts`, `packages/server/src/services/import/pipeline.ts`, `apps/web/src/composables/import/use-interview-import-form.ts`
- Trigger: Upload an image resume through the import workflow when the file is classified as `png`, `jpg`, `jpeg`, or `webp`.
- Workaround: Convert image resumes to searchable PDF before import.

**AI screening is globally serialized:**
- Symptoms: Batch imports with many files complete AI screening one file at a time even when external model capacity is available.
- Files: `packages/server/src/services/import/ai-screening.ts`, `packages/server/src/services/import/pipeline.ts`
- Trigger: Run import with auto screening enabled for multiple resumes; `runScreeningSerially()` chains every screening request behind `screeningQueue`.
- Workaround: Keep batch sizes small or disable auto screening and rerun screening selectively.

**Sync polling stops after transient remote failures:**
- Symptoms: Remote sync silently stops after three consecutive API or network errors until the user manually re-enables it.
- Files: `packages/server/src/services/sync-manager.ts`, `packages/server/src/routes.ts`, `apps/web/src/stores/sync.ts`
- Trigger: Any sequence of three `Baobao` client errors during `SyncManager.runOnce()`.
- Workaround: Reconnect authentication or toggle sync again from the UI after network/auth recovery.

**Test reset query can clear real web state:**
- Symptoms: Visiting the app with `?ims-reset-state=1` clears IMS-related localStorage keys and all sessionStorage.
- Files: `apps/web/src/main.ts`
- Trigger: Open any route with the `ims-reset-state=1` query parameter.
- Workaround: Use the reset query only in test/debug URLs. Keep production links and deep links free of this query parameter.

**Desktop standalone depends on embedded server readiness:**
- Symptoms: Desktop app opens to an unusable state if the embedded server fails to start, binds a different port unexpectedly, or does not become ready within the timeout.
- Files: `apps/desktop/src/lib.rs`, `apps/desktop/tauri.conf.json`, `packages/server/src/config.ts`
- Trigger: Port conflict around `127.0.0.1:9092`, stale server process, missing bundled server resource, or server startup taking longer than `SERVER_READY_TIMEOUT_MS`.
- Workaround: Open logs from the tray, stop stale IMS server processes, and restart the app.

## Security Considerations

**Remote auth tokens and cookies are stored in SQLite:**
- Risk: `Baobao` `ghr-token` values and persisted cookies are stored in the local database without an application-level encryption layer.
- Files: `packages/server/src/db.ts`, `packages/server/src/schema.ts`, `packages/server/src/services/baobao-login.ts`, `packages/server/src/services/baobao-http-login.ts`
- Current mitigation: Runtime data is located under `runtime/` by default in `packages/server/src/config.ts`; `runtime/`, `*.db`, `*.db-shm`, and `*.db-wal` are ignored by `.gitignore`. Structured logger redacts field keys matching token/cookie patterns in `packages/server/src/utils/logger.ts`.
- Recommendations: Store sensitive auth material in OS keychain or encrypt `remote_users.token` and `remote_users.cookie_json` before persistence. Keep logs free of token/cookie values and avoid adding raw DB dumps to bug reports.

**Provider API keys and SMTP passwords are persisted locally:**
- Risk: AI provider credentials and SMTP passwords can be extracted from the local SQLite DB by any process with filesystem access.
- Files: `packages/server/src/db.ts`, `packages/server/src/schema.ts`, `packages/server/src/services/import/ai-screening.ts`, `packages/server/src/routes.ts`, `packages/server/src/routes/email.ts`
- Current mitigation: `.gitignore` excludes runtime DB files, and `packages/server/src/utils/logger.ts` redacts key names containing `api-key`, `token`, `secret`, and `smtp-pass`.
- Recommendations: Encrypt `provider_credentials.api_key` and `email_configs.smtp_pass` at rest. Add a credentials rotation UI and a diagnostics export path that never includes raw credential fields.

**LAN sharing has no transport authentication:**
- Risk: Device discovery accepts UDP announcements and file transfer posts raw IMR bytes over plain HTTP to discovered IP/port combinations.
- Files: `packages/server/src/services/share/discovery.ts`, `packages/server/src/services/share/transfer.ts`, `packages/server/src/routes.ts`
- Current mitigation: Discovery uses LAN broadcast only, devices expire after `DEVICE_TTL_MS`, and transfers time out after 30 seconds.
- Recommendations: Add a pairing token or signed challenge to `packages/server/src/services/share/discovery.ts` and require it in `packages/server/src/services/share/transfer.ts` plus the receiving `/api/share/import` endpoint. Reject transfers from unpaired devices.

**Desktop CSP allows broad outbound HTTPS:**
- Risk: The desktop shell allows `connect-src` to `https://*`, so any frontend code path that is compromised can initiate requests to arbitrary HTTPS hosts.
- Files: `apps/desktop/tauri.conf.json`, `apps/web/src/api/client.ts`, `apps/web/src/api/lui.ts`
- Current mitigation: Script sources are limited to self plus inline scripts, and local API calls are scoped to loopback.
- Recommendations: Narrow `connect-src` to known AI/provider/update domains where possible. If custom endpoints are required, gate them through explicit settings validation and keep the broad allowance documented.

**Log export may include sensitive operational context:**
- Risk: Desktop log bundles collect application logs and write export directories without content redaction at export time.
- Files: `apps/desktop/src/lib.rs`, `packages/server/src/utils/logger.ts`
- Current mitigation: Server structured logs redact sensitive field names and path-like strings before writing. Desktop logger flattens messages and rotates files.
- Recommendations: Add an export-time redaction pass in `apps/desktop/src/lib.rs` before copying log files. Redact bearer tokens, cookies, API keys, email addresses, phone numbers, and local paths in exported bundles.

## Performance Bottlenecks

**AI screening serial queue:**
- Problem: Import AI screening throughput is limited to one request at a time for the whole server process.
- Files: `packages/server/src/services/import/ai-screening.ts`
- Cause: Module-level `screeningQueue` and `runScreeningSerially()` await the previous job before starting the next.
- Improvement path: Replace global serialization with a bounded concurrency queue keyed by provider/model or batch. Expose concurrency in `packages/server/src/config.ts` and default conservatively.

**Full remote sync polling scans paginated remote data every interval:**
- Problem: Sync can repeatedly fetch all remote interview pages every 5 seconds while enabled.
- Files: `packages/server/src/services/sync-manager.ts`, `packages/server/src/services/baobao-client.ts`
- Cause: `SyncManager.doSync()` starts from page 1 and continues until a short page, then fetches interview count, without incremental cursors.
- Improvement path: Persist remote sync cursors or updated-at watermarks in `packages/server/src/db.ts` / `packages/server/src/schema.ts` and request deltas where the remote API supports them. Increase default polling interval in `packages/server/src/config.ts`.

**SQLite synchronous FULL and boot-time schema work:**
- Problem: Local writes prioritize durability but can be slower during import, sync, and message streaming workloads.
- Files: `packages/server/src/db.ts`, `packages/server/src/services/import/pipeline.ts`, `packages/server/src/services/message.ts`
- Cause: SQLite uses `PRAGMA synchronous = FULL` and startup executes schema creation/compatibility checks in the application process.
- Improvement path: Benchmark `NORMAL` synchronous mode for desktop-local data, group batch imports into transactions, and move schema checks to versioned migrations.

**Large JSON columns are parsed on hot paths:**
- Problem: Several flows store structured state as JSON strings and parse it repeatedly.
- Files: `packages/server/src/routes.ts`, `packages/server/src/services/lui-tools.ts`, `packages/server/src/services/lui-workflow.ts`, `packages/server/src/services/import/pipeline.ts`, `packages/shared/src/api-types.ts`
- Cause: Fields such as `result_json`, `payload_json`, `documents_json`, `tags_json`, and `manual_evaluation_json` are JSON blobs in SQLite.
- Improvement path: Normalize frequently queried fields into columns and reserve JSON blobs for snapshots. Add parse guards that log corrupt data with record IDs.

**Desktop log writes flush per line:**
- Problem: Desktop logging performs file open/write/flush operations on every log line.
- Files: `apps/desktop/src/lib.rs`
- Cause: `AppLogger.write_line()` opens the current file and flushes synchronously for each message.
- Improvement path: Buffer writes or keep an append handle open behind `Mutex<AppLogger>`. Keep explicit flush for error and shutdown paths only.

## Fragile Areas

**Import state machine and batch progress:**
- Files: `packages/server/src/services/import/pipeline.ts`, `packages/server/src/routes/interview-import.ts`, `packages/shared/src/interview-import.ts`, `apps/web/src/composables/import/use-interview-import-form.ts`
- Why fragile: Many status strings and stages are duplicated across server and shared/frontend code. A new state needs updates in pipeline transitions, route serializers, shared types, and UI formatters.
- Safe modification: Add or rename states through `packages/shared/src/interview-import.ts` first, then update `packages/server/src/services/import/pipeline.ts` and the web import composables in the same change. Preserve backward-compatible handling for existing `result_json` snapshots.
- Test coverage: Unit tests exist for import payloads, formatters, API client, routes, pipeline, workflow advance, round persistence, candidate resolution, and hash reuse. Gaps remain around full DB-backed batch cancellation and mixed PDF/ZIP failure scenarios.

**Authentication recovery flow:**
- Files: `packages/server/src/services/baobao-login.ts`, `packages/server/src/services/baobao-http-login.ts`, `packages/server/src/routes.ts`, `apps/web/src/stores/auth.ts`, `apps/web/src/router/index.ts`
- Why fragile: Login state combines persisted JWT, cookies, QR polling, session restore, local `users.token_status`, and remote `remote_users` rows. Token expiry handling is spread across service and route code.
- Safe modification: Keep token/cookie logging redacted, add focused unit coverage for expired token + valid cookie restore, and verify route responses through `/api/auth/status`, `/api/auth/baobao/qr`, and `/api/auth/baobao/login-status`.
- Test coverage: `packages/server/src/services/baobao-http-login.test.ts` covers part of HTTP login behavior. End-to-end auth recovery and router redirects remain mostly integration/manual concerns.

**LUI streaming and workflow documents:**
- Files: `packages/server/src/routes.ts`, `packages/server/src/services/lui-tools.ts`, `packages/server/src/services/lui-workflow.ts`, `packages/server/src/services/message.ts`, `apps/web/src/views/LUIView.vue`, `apps/web/src/stores/lui.ts`
- Why fragile: Streaming messages, workflow stage updates, file artifacts, and UI rendering cross many modules. `updateWorkflowDocument()` mutates JSON documents and syncs metadata files after DB writes.
- Safe modification: Change one stage/tool at a time. Maintain compatibility for existing `documents_json` shapes in `packages/server/src/services/lui-workflow.ts` and update UI render branches in `apps/web/src/views/LUIView.vue` only after API shape changes are covered.
- Test coverage: Tests exist for LUI agents, agent contract, tools, store types/models, and gateway E2E. Gaps remain around streaming interruption, concurrent tool calls, and corrupt workflow document JSON.

**Desktop server lifecycle:**
- Files: `apps/desktop/src/lib.rs`, `apps/desktop/src/main.rs`, `apps/desktop/tauri.conf.json`, `packages/server/src/index.ts`, `packages/server/src/config.ts`
- Why fragile: The desktop app owns a child server process, port allocation, readiness polling, stale process cleanup, tray exit behavior, and update/restart commands. These paths are timing-sensitive.
- Safe modification: Keep server lifecycle changes isolated in a new `apps/desktop/src/server.rs` module before changing tray/updater/window code. Test port conflicts, slow startup, and quit/restart flows manually after changes.
- Test coverage: No Rust unit tests or desktop integration tests are detected for server lifecycle.

**Recorder implementation:**
- Files: `apps/desktop/src/recorder.rs`, `packages/server/src/services/recorder.ts`, `packages/server/src/routes/recorder.ts`, `apps/web/src/stores/recorder.ts`, `apps/web/src/api/recorder.ts`
- Why fragile: Recording spans native capture, local server persistence, frontend state, and text organization. Platform permissions and native audio behavior are hard to simulate.
- Safe modification: Keep API contracts in `packages/shared/src/recorder.ts` stable and validate native command output before updating web store assumptions.
- Test coverage: Unit tests exist in `packages/server/src/services/recorder.test.ts`, `apps/web/src/api/recorder.test.ts`, `apps/web/src/lib/recorder/organize.test.ts`, `apps/web/src/stores/recorder.test.ts`, `apps/web/src/lib/recorder/fake-adapter.test.ts`, plus `e2e/recorder.spec.ts`. Native Rust recorder paths still require manual or platform-level verification.

**Schema compatibility and JSON corruption handling:**
- Files: `packages/server/src/db.ts`, `packages/server/src/schema.ts`, `packages/shared/src/db-schema.ts`, `packages/server/src/services/lui-tools.ts`, `packages/server/src/routes.ts`
- Why fragile: JSON parse errors are often treated as missing data, and schema upgrades run opportunistically at startup.
- Safe modification: Add record IDs to parse-error logs and keep data migrations idempotent. Prefer read-time tolerance plus write-time normalization when changing JSON payloads.
- Test coverage: Shared API/type tests exist, but no migration harness is detected for upgrading older DB files.

## Scaling Limits

**Single-process local server:**
- Current capacity: One Bun server process, one SQLite DB, one desktop client, and local loopback API by default.
- Limit: CPU-bound PDF parsing, large imports, AI screening, sync, and message streaming share the same event loop and process resources.
- Scaling path: Move long-running import/screening/sync jobs into a worker queue or child process. Keep HTTP routes in `packages/server/src/routes/` responsive and persist job state in SQLite.

**SQLite local DB:**
- Current capacity: Local desktop-scale data with WAL enabled and a 5-second busy timeout.
- Limit: Concurrent long write transactions from import, sync, message streaming, and recorder updates can contend.
- Scaling path: Use explicit transactions for batches, add indexes for high-volume queries, and consider separating large text/blob content into files referenced by DB rows.

**LAN discovery:**
- Current capacity: UDP broadcast on fixed port `34567` and three broadcast addresses.
- Limit: Discovery is subnet-specific and can fail on corporate networks, VPNs, firewalls, or multiple NICs.
- Scaling path: Add manual device URL entry and authenticated pairing as fallback to UDP broadcast.

**AI provider throughput:**
- Current capacity: Import screening is serialized globally and each request has a 45-second timeout.
- Limit: Large batches queue behind one slow provider call.
- Scaling path: Add bounded concurrency, provider-specific rate limits, resumable job state, and partial-batch progress indicators.

## Dependencies at Risk

**Bun compile target support:**
- Risk: Server binary compilation depends on Bun target names and host/target mapping.
- Impact: Desktop builds fail for unsupported target triples, and 32-bit Windows is explicitly unsupported.
- Migration plan: Keep `packages/server/scripts/build-compiled.mjs` as the target mapping source, document supported targets, and verify Tauri target triples before release builds.

**`nodemailer` major version:**
- Risk: `packages/server/package.json` depends on `nodemailer` `^8.0.4`, which may have API or ecosystem changes compared with widely used v6 patterns.
- Impact: Email route behavior can break if transport options or TypeScript types differ from examples and existing assumptions.
- Migration plan: Keep email behavior covered in `packages/server/src/routes/email.ts` tests before changing versions. Pin or adapt SMTP transport creation explicitly.

**AI SDK major versions:**
- Risk: `packages/server/package.json` uses `ai` `^6.0.135` and `@ai-sdk/openai` `^3.0.47`; streaming and provider APIs change across major versions.
- Impact: LUI chat, import screening, model discovery, and OpenAI-compatible providers can fail at runtime after dependency upgrades.
- Migration plan: Upgrade AI SDK packages only with focused compatibility checks in `packages/server/src/routes.ts`, `packages/server/src/services/import/ai-screening.ts`, and `packages/server/src/services/lui-tools.ts`.

**Public GitHub updater endpoint:**
- Risk: Auto-update metadata is fetched from a GitHub Releases URL.
- Impact: Updater availability depends on release asset publishing and public endpoint reachability.
- Migration plan: Keep `apps/desktop/tauri.conf.json` updater endpoint and public key synchronized with release automation and validate with `pnpm desktop:update:verify` before release.

## Missing Critical Features

**No encrypted secrets storage:**
- Problem: Tokens, cookies, provider API keys, and SMTP passwords are persisted in local SQLite rows.
- Blocks: Safe diagnostics export, shared machine usage, and stronger desktop threat model.

**No versioned DB migration history:**
- Problem: Schema changes are embedded in `packages/server/src/db.ts` startup SQL and compatibility logic.
- Blocks: Reliable upgrades from arbitrary old app versions and automated migration rollback testing.

**No authenticated LAN transfer:**
- Problem: Discovery and transfer do not enforce pairing or request signatures.
- Blocks: Safe use of sharing features on untrusted local networks.

**No CI workflow detected:**
- Problem: Tests and checks are defined in `package.json`, but no GitHub Actions/GitLab CI workflow file is detected in the indexed project structure.
- Blocks: Automatic typecheck/test/release validation on pushes and pull requests.

**No Rust desktop tests:**
- Problem: Desktop lifecycle and recorder native code lack automated unit/integration coverage.
- Blocks: Safe refactors of `apps/desktop/src/lib.rs` and `apps/desktop/src/recorder.rs` without manual platform QA.

## Test Coverage Gaps

**Desktop lifecycle and updater:**
- What's not tested: Server child process start/stop, port fallback, stale process cleanup, tray quit behavior, deep-link forwarding, and updater install/restart.
- Files: `apps/desktop/src/lib.rs`, `apps/desktop/src/main.rs`, `apps/desktop/tauri.conf.json`
- Risk: Packaged desktop builds can fail in ways not covered by web/server tests.
- Priority: High

**DB migrations and old runtime data:**
- What's not tested: Upgrade behavior from older SQLite schemas, corrupt JSON fields, missing columns, and partial migration failures.
- Files: `packages/server/src/db.ts`, `packages/server/src/schema.ts`, `packages/shared/src/db-schema.ts`
- Risk: Users can lose access to existing local data after schema changes.
- Priority: High

**Security-sensitive credential storage and redaction:**
- What's not tested: Logs and exported bundles never include `Authorization`, cookies, API keys, SMTP passwords, tokens, or local absolute paths.
- Files: `packages/server/src/utils/logger.ts`, `apps/desktop/src/lib.rs`, `packages/server/src/services/baobao-http-login.ts`, `packages/server/src/routes/email.ts`
- Risk: Credentials can leak through diagnostics, screenshots, or bug reports.
- Priority: High

**LAN sharing trust model:**
- What's not tested: Device spoofing, malicious UDP announcements, failed transfer cleanup, filename/header handling, and unauthenticated import endpoints.
- Files: `packages/server/src/services/share/discovery.ts`, `packages/server/src/services/share/transfer.ts`, `packages/server/src/routes.ts`
- Risk: Local network attackers or accidental wrong-device transfers can import/export candidate packages.
- Priority: High

**LUI streaming interruption and concurrency:**
- What's not tested: Browser refresh during stream, server abort, concurrent conversations, concurrent workflow tool calls, and resume after partial message persistence.
- Files: `packages/server/src/routes.ts`, `packages/server/src/services/message.ts`, `packages/server/src/services/lui-tools.ts`, `apps/web/src/stores/lui.ts`, `apps/web/src/views/LUIView.vue`
- Risk: Conversations and workflow documents can become inconsistent or duplicate messages.
- Priority: Medium

**Import batch edge cases:**
- What's not tested: Very large ZIPs, mixed valid/invalid PDF batches, AI timeout recovery, cancellation during DB writes, corrupted `result_json`, and university API unavailability.
- Files: `packages/server/src/services/import/pipeline.ts`, `packages/server/src/services/import/zip-pdf.ts`, `packages/server/src/services/import/ai-screening.ts`, `packages/server/src/services/university-verification.ts`
- Risk: Batch progress and candidate records can become inaccurate after partial failures.
- Priority: Medium

**Frontend giant view behavior:**
- What's not tested: Split-pane persistence, toolbar actions, workflow artifact rendering, model/provider dialog behavior, and long conversation rendering in `apps/web/src/views/LUIView.vue`.
- Files: `apps/web/src/views/LUIView.vue`, `apps/web/src/components/lui/*`, `apps/web/src/stores/lui.ts`
- Risk: UI regressions can ship because most behavior is concentrated in one component with limited component tests.
- Priority: Medium

---

*Concerns audit: 2026-05-23*
