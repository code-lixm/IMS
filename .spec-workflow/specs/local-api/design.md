# Local API Design

## Base URL

All API endpoints are served by Bun.serve at `http://127.0.0.1:3000`

## Response Format

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-03-22T12:00:00Z"
  }
}
```

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_REQUIRED` | 401 | Authentication required |
| `AUTH_EXPIRED` | 401 | Token expired |
| `AUTH_INVALID` | 401 | Token invalid |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 422 | Request validation failed |
| `REMOTE_SYNC_FAILED` | 502 | Remote system sync failed |
| `IMPORT_UNSUPPORTED_FILE` | 422 | Unsupported file type |
| `IMPORT_PARSE_FAILED` | 422 | Resume parsing failed |
| `IMPORT_OCR_FAILED` | 422 | OCR recognition failed |
| `WORKSPACE_CREATE_FAILED` | 503 | Workspace creation failed |
| `SHARE_EXPORT_FAILED` | 500 | IMR export failed |
| `SHARE_DEVICE_OFFLINE` | 503 | Target device offline |
| `SHARE_CONFLICT_DETECTED` | 409 | Share conflict detected |
| `SYSTEM_OPENCODE_NOT_READY` | 503 | OpenCode service not ready |
| `INTERNAL_ERROR` | 500 | Internal error |

## API Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/start` | Start login flow |
| GET | `/api/auth/status` | Check auth status |
| POST | `/api/auth/complete` | Complete login callback |
| POST | `/api/auth/relogin` | Trigger re-authentication |
| POST | `/api/auth/logout` | Clear session |
| POST | `/api/auth/baobao/connect` | Connect 3rd party account |
| GET | `/api/auth/baobao/status` | Query 3rd party account status |
| POST | `/api/auth/baobao/disconnect` | Disconnect 3rd party account |

### User & Sync

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me` | Get current user info |
| POST | `/api/sync/run` | Run sync now |
| POST | `/api/sync/toggle` | Toggle auto sync |
| GET | `/api/sync/status` | Get sync status |

### Candidates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/candidates` | List candidates (with search/filter) |
| POST | `/api/candidates` | Create local candidate |
| GET | `/api/candidates/:id` | Get candidate full profile |
| PUT | `/api/candidates/:id` | Update candidate |
| DELETE | `/api/candidates/:id` | Soft delete candidate |

### Resumes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/candidates/:id/resumes` | List candidate resumes |
| GET | `/api/resumes/:id` | Get resume detail |
| GET | `/api/resumes/:id/download` | Download resume file |

### Interviews

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/candidates/:id/interviews` | List candidate interviews |
| POST | `/api/candidates/:id/interviews` | Create interview |
| GET | `/api/interviews/:id` | Get interview |
| PUT | `/api/interviews/:id` | Update interview |

### Import

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/import/batches` | Create import batch |
| GET | `/api/import/batches` | List all batches |
| GET | `/api/import/batches/:id` | Get batch detail |
| GET | `/api/import/batches/:id/files` | List batch files |
| POST | `/api/import/batches/:id/cancel` | Cancel batch |
| POST | `/api/import/batches/:id/retry-failed` | Retry failed files |
| POST | `/api/import/files/:id/retry` | Retry single file |

### AI Workspace

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/candidates/:id/workspace` | Create/get workspace |
| GET | `/api/candidates/:id/workspace` | Get workspace info |
| GET | `/api/candidates/:id/artifacts` | List artifacts |
| GET | `/api/artifacts/:id` | Get artifact with versions |
| POST | `/api/artifacts/:id/feedback` | Submit feedback |
| GET | `/api/artifacts/:id/download` | Download artifact |

### Share

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/share/discover/start` | Start LAN discovery |
| POST | `/api/share/discover/stop` | Stop discovery |
| GET | `/api/share/devices` | List discovered devices |
| POST | `/api/share/set-user-info` | Set local user identity |
| POST | `/api/share/export` | Export candidate to IMR |
| POST | `/api/share/send` | Send to LAN device |
| POST | `/api/share/import` | Import IMR file |
| GET | `/api/share/records` | List share records |

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | List notifications |
| POST | `/api/notifications/:id/read` | Mark as read |
| POST | `/api/notifications/read-all` | Mark all as read |
| GET | `/api/indicator` | Get status indicator |

### OpenCode Service

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/system/opencode/status` | Get service status |
| POST | `/api/system/opencode/start` | Start service |
| POST | `/api/system/opencode/restart` | Restart service |
| POST | `/api/system/opencode/stop` | Stop service |

## Implementation Location

```
packages/server/src/
├── routes.ts           # Route registration
├── services/
│   ├── auth/
│   ├── sync-manager.ts
│   ├── opencode-manager.ts
│   ├── import/
│   │   ├── types.ts
│   │   ├── extractor.ts
│   │   ├── parser.ts
│   │   └── pipeline.ts
│   ├── imr/
│   │   ├── types.ts
│   │   ├── exporter.ts
│   │   └── importer.ts
│   └── share/
│       ├── discovery.ts
│       └── transfer.ts
└── utils/
    └── http.ts        # Unified response format
```
