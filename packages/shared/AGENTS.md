# @ims/shared — Shared Types & Constants

**Scope:** `packages/shared/src/`
**Purpose:** Cross-package TypeScript types, API contracts, constants, and dictionaries. TS `composite` project emitting `.d.ts` only.

---

## OVERVIEW

跨包共享类型、常量和字典。Web 和 Server 都通过 workspace 引用此包。**不含任何运行时代码**，只有类型声明和常量值。

---

## STRUCTURE

```
src/
├── index.ts              # Barrel export
├── constants.ts          # 共享常量（端口、文件扩展名、APP_ID）
├── db-schema.ts          # DB Schema TypeScript 类型 (~402 行)
├── api-types.ts          # API 请求/响应类型 (~845 行)
├── baobao-types.ts       # 远程系统（getui）API 类型 (~214 行)
├── agent-contract.ts     # Agent 工作流契约定义 + 验证函数 (~303 行)
├── workspace-agent.ts    # Workspace-native agent 定义类型 (~93 行)
└── dictionaries/
    └── baobao.ts         # 码表常量（应聘状态、面试形式等 ~301 行）
```

---

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| DB entity types | `db-schema.ts` | Plain TS types mirroring server schema |
| API contract | `api-types.ts` | Request/response shapes shared by web and server |
| Constants | `constants.ts` | Ports, file extensions, APP_ID, round role labels |
| Baobao API types | `baobao-types.ts` | Remote system HAR capture types |
| Agent workflow contract | `agent-contract.ts` | Stage/intent definitions + validation |
| Workspace agent schema | `workspace-agent.ts` | Agent config document types |
| Dictionary/lookup tables | `dictionaries/baobao.ts` | Numeric code → Chinese label maps |

---

## DUAL SCHEMA SYSTEM (CRITICAL)

Two schema definitions must be kept in sync:

| Package | File | Type | Purpose |
|---------|------|------|---------|
| `@ims/server` | `packages/server/src/schema.ts` | Drizzle ORM schema | Runtime DB operations (imports `drizzle-orm/sqlite-core`) |
| `@ims/shared` | `packages/shared/src/db-schema.ts` | Plain TypeScript interfaces | Compile-time types for web and server API responses |

**The rule:** When adding a column, add it to **both** files. The TS types in `db-schema.ts` are the source of truth for the API contract; the Drizzle schema in `server/schema.ts` is the runtime DB definition.

---

## TYPES

### DB Entity Types (`db-schema.ts`)

**Enums:**
- `TokenStatus` — `"valid" | "expired" | "unauthenticated"`
- `CandidateSource` — `"local" | "remote" | "hybrid"`
- `InterviewStatus` — `"scheduled" | "completed" | "cancelled" | "no_show"`
- `InterviewAssessmentRecommendation` — `"pass" | "hold" | "reject"`
- `ArtifactType` — `"screening" | "questions" | "evaluation" | "summary"`
- `WorkspaceStatus` — `"active" | "degraded" | "closed"`
- `BatchStatus` — Import batch lifecycle states
- `FileTaskStatus` — Per-file import task states
- `ShareType / ShareStatus` — Share record types
- `AgentSourceType` — `"builtin" | "custom" | "imported" | "workspace"`
- `AgentSceneAffinity` — `"general" | "interview"`
- `MessageRole` — `"user" | "assistant" | "system"`
- `MessageStatus` — `"streaming" | "error" | "complete"`
- `AgentMode` — `"all" | "chat" | "ask" | "workflow"`
- `MemoryType / MemoryScope` — Agent memory types
- `SessionMemoryType` — `"context" | "summary" | "decision" | "action_item"`

**Entities:**
`User`, `Candidate`, `Resume`, `Interview`, `InterviewAssessment`, `Artifact`, `ArtifactVersion`, `CandidateWorkspace`, `ImportBatch`, `ImportFileTask`, `ShareRecord`, `Notification`, `Conversation`, `Message`, `FileResource`, `Agent`, `AgentMemory`, `SessionMemory`, `ProviderCredential`, `EmailConfig`, `EmailTemplate`, `ParsedResume`, `Device`

### API Types (`api-types.ts`)

**Transport wrapper:**
```typescript
interface ApiSuccess<T> { success: true; data: T; error: null; meta: ApiMeta }
interface ApiError { success: false; data: null; error: { code: string; message: string }; meta: ApiMeta }
type ApiResponse<T> = ApiSuccess<T> | ApiError
```

**Error codes:** `ErrorCodes` object with ~23 named codes (AUTH_REQUIRED, NOT_FOUND, IMPORT_*, WORKSPACE_*, SHARE_*, SYSTEM_OPENCODE_*, INTERNAL_ERROR)

**Domain API types:**
- Auth: `AuthStatusData`, `AuthStartData`, `AuthCompleteData`, `BaobaoLoginQrData`, `BaobaoLoginSessionStatusData`
- Candidates: `CandidateListItemSummary`, `CandidateListData`, `CandidateDetailData`, `CreateCandidateInput`, `UpdateCandidateInput`
- Interviews: `InterviewListData`, `CreateInterviewInput`, `UpdateInterviewInput`
- Workspace: `WorkspaceData`
- Artifacts: `ArtifactListData`, `ArtifactDetailData`, `ArtifactFeedbackInput`
- Import: `ImportBatchListData`, `CreateImportBatchInput`, `ImportScreeningConclusion`, `ImportTaskResultData`
- Share: `ShareDevicesData`, `ShareExportData`, `ShareSendData`, `ShareImportResult`
- LUI: `ConversationData`, `ConversationListData`, `ConversationDetailData`, `MessageData`, `LuiWorkflowData`, `LuiStructuredInterviewAssessmentData`, `SendMessageInput`
- LUI Agent: `AgentData`, `AgentListData`, `CreateAgentInput`, `UpdateAgentInput`, `AgentLifecycleData`

### Baobao Types (`baobao-types.ts`)

Remote system API types from HAR capture (base URL: `https://baobao.getui.com`, auth: `x-token` JWT header):
`BaobaoTokenPayload`, `BaobaoUser`, `BaobaoLoginResponse`, `BaobaoApplicant`, `BaobaoApplicantListResponse`, `BaobaoInterviewInfo`, `BaobaoInterviewRecord`, `BaobaoInterviewCount`, `BaobaoOrganization`, `BaobaoJobPosition`, `BaobaoPositionRank`, `BaobaoDictItem`, `BaobaoRequestOptions`, `BaobaoPaginationParams`

### Agent Contract (`agent-contract.ts`)

**Workflow stages:** `AgentWorkflowStage` — `"S0" | "S1" | "S2" | "completed"`
**Intents:** `AgentIntent` — `"screening" | "questioning" | "assessment" | "clarify_round" | "general_followup" | "offtopic"`
**Core types:** `AgentContractDocument`, `AgentContractPatch`, `AgentContractHardRules`, `AgentContractStageRule`
**Validation:** `validateAgentContractDocument()`, `validateAgentContractPatch()` — return `AgentContractValidationResult<T>`

### Workspace Agent (`workspace-agent.ts`)

`WorkspaceAgentRuntimeConfig`, `WorkspaceAgentConfigDocument`, `WorkspaceAgentDefinition`, `WorkspaceAgentLoadResult`, `WorkspaceAgentCatalogResult`, `WorkspaceAgentLoadErrorCode` (~11 error codes)

---

## CONSTANTS

### Network (`constants.ts`)

```typescript
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 9092
SERVER_BASE_URL = "http://127.0.0.1:9092"

OPENCODE_DEFAULT_PORT = 4096
OPENCODE_BASE_URL = "http://127.0.0.1:4096"

DISCOVERY_PORT = 34567
DEVICE_TTL_MS = 30_000
BROADCAST_INTERVAL_MS = 10_000
```

### App Identity

```typescript
APP_NAME = "IMS"
APP_ID = "com.company.interview-manager"
APP_VERSION = "0.1.0"
```

### IMR File

```typescript
IMR_FILE_EXT = ".imr"
IMR_MIME_TYPE = "application/x-imr"
```

### Interview Round Labels

```typescript
INTERVIEW_ROUND_ROLE_LABELS: Record<number, string> = {
  1: "技术专家",
  2: "主管",
  3: "总监",
  4: "HR",
}

getInterviewRoundRoleLabel(round): string | null
formatInterviewRoundLabel(round): string
```

### Dictionary Constants (`dictionaries/baobao.ts`)

| Table | Type | Range |
|-------|------|-------|
| `APPLICATION_STATUS_LABELS` | `Record<number, string>` | -10 to 6 |
| `APPLICATION_STATUS_BG_CLASS` | `Record<number, string>` | Tailwind bg-* classes |
| `APPLICATION_STATUS_TEXT_CLASS` | `Record<number, string>` | Tailwind text-* classes |
| `INTERVIEW_TYPE_LABELS` | `Record<number, string>` | 0=电话, 1=现场, 2=视频 |
| `EMPLOYMENT_TYPE_LABELS` | `Record<number, string>` | 0-6 |
| `GENDER_LABELS` | `Record<number, string>` | 0=男, 1=女 |
| `WEEKDAY_LABELS` | `Record<number, string>` | 0=周日, 1=周一 |
| `PASS_STATUS_LABELS` | `Record<number, string>` | -1=不通过, 1=通过 |
| `MARITAL_STATUS_LABELS` | `Record<number, string>` | 0-3 |
| `TRAVEL_WILLINGNESS_LABELS` | `Record<number, string>` | 0-2 |
| `INTERVIEW_ROUND_LABELS` | `Record<number, string>` | 0-9 |

**Helper functions:**
```typescript
applicationStatusClasses(code): string[]      // returns [bgClass, textClass]
interviewTypeClasses(code): string[]
interviewRoundClasses(code): string[]
lookupLabel<T>(table, code): string | undefined
lookupLabelOrDefault<T>(table, code): string  // falls back to `未知(${code})`
resolveApplicationStatusCode(raw): number | null  // handles string or number
```

---

## USAGE

```typescript
// Import types
import { type Candidate, type Interview } from "@ims/shared";

// Import constants
import { SERVER_BASE_URL, IMR_FILE_EXT, APP_ID } from "@ims/shared";

// Import dictionaries
import { APPLICATION_STATUS_LABELS, applicationStatusClasses } from "@ims/shared";

// Agent contract validation
import { validateAgentContractDocument } from "@ims/shared";

// Workspace agent types
import { type WorkspaceAgentDefinition } from "@ims/shared";
```

---

## SYNC GUIDELINES

When modifying the DB schema:

1. **Add column to `server/src/schema.ts`** (Drizzle) first
2. **Add field to corresponding interface in `shared/src/db-schema.ts`**
3. **Update API response types** in `shared/src/api-types.ts` if the change affects the API contract
4. **Add dictionary entries** in `dictionaries/baobao.ts` for any new numeric code tables from the remote system
5. **Run `pnpm typecheck`** to catch any inconsistencies

When adding a new entity:
1. Add Drizzle table in `server/schema.ts`
2. Add TypeScript interface in `shared/db-schema.ts`
3. Add to barrel export in `shared/index.ts`
4. Add any relevant API types in `shared/api-types.ts`

---

## NOTES

- Web and server both reference this package via `references` in their `tsconfig.json`
- The `tsconfig.json` for this package uses `composite: true` and `emitDeclarationOnly: true`
- Runtime data directory (`runtime/`) is created by server on startup, not part of this package
- `agent-contract.ts` and `workspace-agent.ts` contain **runnable validation/loading logic** (not just types) because they are needed by both server and web
