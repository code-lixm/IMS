# Embedded OpenCode Service Design

## Architecture

```
Tauri App
├── Bun Main Service (:3000)
│   ├── DB / API / Import / Share / Sync
│   └── OpenCode Process Manager
└── Embedded OpenCode Service (:4096)
    ├── OpenCode backend
    └── OpenCode web UI
```

## Running Structure

opencode-ai is a CLI/service, not a frontend component library.

Embedding approach:
- Bundled as application dependency/resource
- Started as subprocess by Bun.serve
- Interacted via local HTTP API
- WebUI opened inside Tauri client

## Local Directory Structure

```
~/.interview-manager/
├── app.db
├── files/
│   ├── resumes/
│   ├── artifacts/
│   ├── imports/
│   └── exports/
├── opencode/
│   ├── data/
│   ├── sessions/
│   └── logs/
└── logs/
```

Note: OpenCode working directory is under app private path, not polluting user's global OpenCode data.

## Process Manager Responsibilities

The Process Manager in Bun Main Service handles:

- Check if OpenCode is running
- Start OpenCode subprocess
- Health check polling
- Crash detection and restart
- Clean shutdown on app exit
- Candidate ↔ Session mapping management

## Startup Flow

```
Client startup
  → Start Bun Main Service
  → User enters candidate AI workspace
  → Check if OpenCode is started
  → If not started, pull up opencode web
  → Health check passes
  → Create or restore candidate's session
  → Return LUI URL to frontend
```

## Health Check

### Readiness Check

- Check if local port is listening
- Call OpenCode health check API
- If fails, retry until timeout

### Crash Recovery

- If subprocess exits without intentional stop, auto-restart once
- If consecutive restarts fail, mark as degraded
- UI shows LUI service unavailable message

## Port Strategy

| Service | Default Port |
|---------|-------------|
| Main Service | 3000 |
| OpenCode | 4096 |

### Conflict Handling

- Try fixed port first
- If occupied, try next available port
- Final port written to memory state and database config

## Candidate Workspace Design

### Principles

- One independent workspace per candidate
- Same candidate reuses existing session on re-entry
- Don't create new session every open

### Mapping to Preserve

| Field | Description |
|-------|-------------|
| candidateId | Candidate ID |
| opencodeSessionId | OpenCode session ID |
| workspaceStatus | active/degraded/inactive |
| lastAccessedAt | Last access timestamp |
| createdAt | Creation timestamp |

### Creation Timing

- First time entering candidate AI workspace
- If historical session lost or unrecoverable, recreate

## Session Context Injection

When creating workspace, inject candidate context:

- Candidate basic info
- Position and years of experience
- Resume extracted text summary
- Structured skill tags
- Past interview record summary
- Existing AI artifact summary

Goal: Each workspace has independent, complete context.

## Security Constraints

- Only listen on 127.0.0.1
- Don't expose company token to OpenCode page
- Candidate raw data controlled by Bun service side, not direct database access from OpenCode

## Frontend Integration

When main UI opens candidate workspace:

1. Call local API to request workspace
2. Local service creates or restores session
3. Return LUI URL
4. Tauri opens internal WebView or routes to internal page

## Observability

Log:
- OpenCode startup duration
- Health check failure count
- Session creation failure count
- Candidate workspace reuse rate
- Subprocess abnormal exit events

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Subprocess abnormal exit | Auto-restart with backoff |
| Port conflict | Port fallback mechanism |
| Cross-platform path differences | Abstract resource paths with resolver |
| OpenCode upgrade session interface change | Version check + API encapsulation layer |

## Implementation Location

```
packages/server/src/services/
├── opencode-manager.ts   # Process lifecycle management
└── workspace-service.ts   # Candidate workspace operations
```
