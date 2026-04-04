# Interview Runtime Adapter Contract

## Overview

This document defines the **capability contract** for the interview runtime adapter (`RuntimeAdapter`), which sits between the workflow orchestration layer and the underlying AI engine execution layer. The adapter's sole responsibility is to translate a well-defined execution request into engine-specific calls, respecting engine identity while maintaining a stable, engine-neutral surface.

The adapter does **not** own workflow stage state. That remains authoritative within the workflow service.

---

## Design Goals

1. **Engine neutrality**: The workflow service issues the same `RuntimeExecuteRequest` regardless of which engine (`builtin` or `deepagents`) will ultimately handle execution.
2. **Transparent engine routing**: A routing policy selects the engine at runtime based on configuration, not hardcoded logic in the workflow layer.
3. **Capability-based negotiation**: Each engine declares which capabilities it supports; the adapter validates the request against engine capabilities before delegation.
4. **Uniform error semantics**: All engines produce errors in a common format understood by the workflow layer.
5. **Safe fallback**: When the preferred engine is unavailable or incapable, the adapter falls back to the builtin engine with a defined fallback signal.

---

## Current Runtime Split

### Builtin Engine (`builtin`)

- **Entry point**: `executeAgent()` in `packages/server/src/services/lui-agents.ts`
- **Workflow stage handling**: Directly managed within the server runtime; stage state is passed as part of the prompt context.
- **Tools**: Registered via the tool registry within the server process.
- **Memory**: In-process, via skill/middleware loading at request time.
- **Streaming**: Direct SSE streaming to the client.
- **Tool call semantics**: Synchronous resolution within the request context.

### Deepagents Engine (`deepagents`)

- **Entry point**: OpenCode session via MCP protocol or subprocess bridge.
- **Tools**: Passed directly to the engine via session configuration (no shared tool registry).
- **Memory**: Loaded via middleware composition; no native memory interface.
- **Streaming**: Depends on OpenCode session configuration; streaming semantics are **not yet validated in code**.
- **Tool call semantics**: Handled by the OpenCode session; resolution flow is **not yet documented**.
- **Workflow stage concept**: **No native concept**. Stage state must be injected via prompt or middleware.

---

## Adapter Inputs

The workflow service sends a `RuntimeExecuteRequest` to the adapter:

```typescript
interface RuntimeExecuteRequest {
  // Conversation and candidate context
  conversationId: string;
  candidateId: string | null;

  // Workflow orchestration (authoritative state outside the engine)
  workflowStage: WorkflowStage;       // e.g., 'screening' | 'problem-solving' | 'evaluation' | 'completed'
  workflowStageIndex: number;         // Numeric index for engines that need ordering
  stageInstructions: string | null;  // Optional per-stage override text

  // Prompt assets (imported and normalized before reaching the adapter)
  promptAssets: PromptAssets;        // See Prompt Composition Order

  // Execution constraints
  allowedTools: ToolDefinition[];    // Subset of tools available to this conversation
  modelProfile: ModelProfile;        // e.g., model family, temperature, maxTokens

  // Engine routing hint (optional, workflow service may leave unset)
  preferredEngine: 'builtin' | 'deepagents' | null;

  // Session metadata
  userId: string;
  sessionId: string;                 // Durable conversation identity
  messages: Message[];                // Full message history for context window
}
```

### Imported Assets Normalization

Before reaching the adapter, imported assets (resumes, job descriptions, evaluation rubrics) must be normalized into `PromptAssets`:

```typescript
interface PromptAssets {
  candidateSummary: string | null;   // Pre-extracted key facts from resume
  jobDescription: string | null;     // Structured or unstructured JD text
  evaluationCriteria: string | null; // Rubric or scoring guidelines
  customContext: Record<string, string>; // Arbitrary key-value pairs for scene-specific context
}
```

---

## Adapter Outputs

The adapter produces a `RuntimeExecuteResponse` and emits `RuntimeEvent` stream:

```typescript
interface RuntimeExecuteResponse {
  engineUsed: 'builtin' | 'deepagents';
  capabilityProfile: CapabilityProfile;  // What this engine+session actually supports
  finalMessage: Message | null;          // null if streaming or tool calls pending
  sessionTokenUsage?: TokenUsage;        // Aggregated usage stats
}

interface RuntimeEvent {
  type: 'chunk' | 'tool_call' | 'tool_result' | 'stage_hint' | 'error' | 'done';
  data: unknown;
  engineEvent?: string;               // Original engine-specific event name if needed
}
```

---

## Capability Model

Each engine implementation declares a `CapabilityProfile`:

```typescript
interface CapabilityProfile {
  engine: 'builtin' | 'deepagents';
  engineVersion: string;             // For debugging and compatibility checks

  // Core capabilities
  supportsStreaming: boolean;         // SSE or equivalent
  supportsToolCalls: boolean;
  supportsMemoryBinding: boolean;     // Native memory/skill injection
  supportsStageAwareness: boolean;    // Native workflow stage concept

  // Execution constraints
  maxContextTokens: number;
  supportedModels: string[];          // Model family or exact model IDs

  // Quality signals
  responseLatencyMs: number | null;  // Observed median; null if unknown
}
```

### Capability Negotiation

The adapter validates the request against engine capabilities **before** delegation:

```typescript
function validateCapabilities(request: RuntimeExecuteRequest, profile: CapabilityProfile): void {
  if (request.allowedTools.length > 0 && !profile.supportsToolCalls) {
    throw new AdapterCapabilityError('Tool calls required but engine does not support them');
  }
  if (request.messages.length > 0 && !profile.supportsMemoryBinding) {
    // Fall back to injecting history into prompt context; not an error
  }
}
```

---

## Prompt Composition Order

The adapter assembles the prompt using this **global convergence order** (oracle guidance):

```
1. Global base prompt          → System-level instructions, safety guidelines
2. Scene instruction           → LUI Workspace Shell context (generic or interview)
3. Workflow state              → Current stage label, index, per-stage instructions
4. Imported assets             → Normalized candidateSummary, jobDescription, evaluationCriteria
5. Conversation context        → Full message history
```

The adapter does **not** reorder these layers. The ordering is authoritative. Each layer is composed as a separate prompt segment, and the adapter is responsible for assembling them in the correct order before passing to the engine.

**Deepagents-specific note**: Imported assets must be normalized **before** reaching the adapter. Deepagents does not have a native concept of imported assets; they must be passed as part of prompt context or middleware-bound context.

---

## Engine Routing

### Routing Policy

```typescript
type EngineSelector = (request: RuntimeExecuteRequest, availableEngines: CapabilityProfile[]) => EngineChoice;

interface EngineChoice {
  engine: 'builtin' | 'deepagents';
  reason: string;                   // Human-readable routing reason for debugging
  fallback: boolean;                // true if this is a fallback choice
}
```

### Default Selector Logic

1. If `preferredEngine` is set and capable, use it.
2. If `preferredEngine` is set but incapable, emit a `fallback_used` event and fall back to builtin.
3. If no preference, prefer `builtin` (higher capability assurance for interview workload).
4. If `builtin` is unavailable, use `deepagents` with `fallback = true`.

### Engine-Specific Delegation

The adapter delegates to an engine-specific executor that implements `EngineExecutor`:

```typescript
interface EngineExecutor {
  execute(request: RuntimeExecuteRequest, assets: PromptAssets): AsyncGenerator<RuntimeEvent>;
  getCapabilityProfile(): CapabilityProfile;
  healthCheck(): Promise<boolean>;
}
```

- `BuiltinExecutor` wraps `executeAgent()` from `lui-agents.ts`.
- `DeepagentsExecutor` wraps the OpenCode session bridge.

---

## Error Semantics

All engine errors are normalized to `AdapterError`:

```typescript
class AdapterError extends Error {
  constructor(
    message: string,
    public readonly code: AdapterErrorCode,
    public readonly statusCode: number,
    public readonly engine: 'builtin' | 'deepagents',
    public readonly isRetryable: boolean,
  ) { super(message); }
}

type AdapterErrorCode =
  | 'CAPABILITY_MISMATCH'      // Request requires capability engine lacks
  | 'ENGINE_UNAVAILABLE'       // Engine process not running or unreachable
  | 'TIMEOUT'                  // Execution exceeded timeout
  | 'TOOL_RESOLUTION_FAILED'   // Requested tool not found or execution failed
  | 'CONTEXT_OVERFLOW'          // Prompt exceeds engine max context
  | 'UNAUTHORIZED'             // Session auth or permission error
  | 'INTERNAL_ERROR';           // Unexpected engine error
```

### Error Propagation to Workflow Layer

```typescript
try {
  for await (const event of adapter.execute(request)) {
    // events are normalized
  }
} catch (error) {
  if (error instanceof AdapterError) {
    // workflow service decides: retry, fallback, or abort
    if (error.isRetryable) { /* retry logic */ }
    if (error.code === 'CAPABILITY_MISMATCH') { /* fallback logic */ }
  }
  throw error; // Re-throw unknown errors after logging
}
```

---

## Fallback Rules

| Failure Mode | Fallback Action | Signal to Workflow |
|---|---|---|
| Preferred engine unavailable | Switch to builtin | `RuntimeEvent { type: 'error', data: { code: 'ENGINE_UNAVAILABLE', fallback: true } }` |
| Preferred engine lacks capability | Switch to builtin if capable | `RuntimeEvent { type: 'error', data: { code: 'CAPABILITY_MISMATCH', fallback: true } }` |
| Builtin also fails | Surface error, do not retry | `RuntimeEvent { type: 'error', data: { code: 'INTERNAL_ERROR', fallback: false } }` |
| Timeout | Retry same engine once, then fallback | Two attempts before fallback |
| Tool resolution fails (builtin) | Retry with extended tool manifest once | One retry with broader tool set |

Fallback is **always toward builtin**. There is no fallback path beyond builtin because it is the most capable and reliable engine for interview workloads.

---

## Open Questions / Code Validation Checklist

### Code Validation Required Before Implementation

- [ ] **Streaming semantics (deepagents)**: Confirm whether OpenCode session supports SSE streaming and what the event shape looks like. Validate in `apps/desktop/src/lib.rs` or server-side session management.
- [ ] **Tool call resolution (deepagents)**: Document the flow from tool call request to tool execution. Confirm tool parameters are passed correctly through the session bridge.
- [ ] **Memory binding (deepagents)**: Confirm how skills/middleware are loaded per session. Is there a memory interface, or does everything come through the prompt?
- [ ] **Stage awareness (deepagents)**: There is no native workflow stage concept. Validate that stage state can be reliably injected via prompt context without drift.
- [ ] **Response latency**: Measure and record observed latency for both engines under similar load.
- [ ] **Error code mapping**: Confirm that OpenCode session errors map cleanly to `AdapterErrorCode` values.

### Deepagents Specific Cautions

> **CAUTION**: Deepagents tools are passed via direct session configuration, not via a shared tool registry. The adapter must translate `allowedTools` into the session configuration format expected by the OpenCode session bridge. If the session configuration schema changes, the adapter translation layer must be updated.

> **CAUTION**: Deepagents has no native memory interface. Memory and skills are loaded via middleware composition before the session processes a request. The adapter is responsible for ensuring that memory bindings are present and consistent across the session lifetime. If middleware composition fails, there is no fallback memory mechanism.

> **CAUTION**: Streaming behavior is engine-dependent. The builtin engine streams via SSE directly to the client. Deepagents streaming semantics are not yet documented. **Do not assume streaming works** without code-level validation.

---

## Non-Goals

- **The adapter does not own workflow stage state**. Stage transitions are managed by the workflow service and communicated to the adapter as part of `RuntimeExecuteRequest`.
- **The adapter does not implement engine-specific business logic**. It is a translation and delegation layer only.
- **The adapter does not select the default engine**. Engine selection policy is configured externally (environment variable or feature flag) and passed to the adapter constructor.
- **The adapter does not manage session lifetimes**. Session creation and teardown remain the responsibility of the engine executors.
- **The adapter does not provide a chat interface**. It is a batch execution adapter for single-turn or multi-turn workflows, not a general-purpose chat session manager.

---

## Appendix: Engine-Negutral Request/Response Surface

### Request (workflow service → adapter)

```typescript
// packages/shared/src/runtime-adapter-contract.ts

export interface RuntimeExecuteRequest {
  conversationId: string;
  candidateId: string | null;
  workflowStage: WorkflowStage;
  workflowStageIndex: number;
  stageInstructions: string | null;
  promptAssets: PromptAssets;
  allowedTools: ToolDefinition[];
  modelProfile: ModelProfile;
  preferredEngine: 'builtin' | 'deepagents' | null;
  userId: string;
  sessionId: string;
  messages: Message[];
}

export interface PromptAssets {
  candidateSummary: string | null;
  jobDescription: string | null;
  evaluationCriteria: string | null;
  customContext: Record<string, string>;
}

export interface WorkflowStage {
  id: string;
  label: string;
  order: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ModelProfile {
  modelFamily: string;
  temperature: number;
  maxTokens: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}
```

### Response (adapter → workflow service)

```typescript
export interface RuntimeExecuteResponse {
  engineUsed: 'builtin' | 'deepagents';
  capabilityProfile: CapabilityProfile;
  finalMessage: Message | null;
  sessionTokenUsage?: TokenUsage;
}

export interface CapabilityProfile {
  engine: 'builtin' | 'deepagents';
  engineVersion: string;
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsMemoryBinding: boolean;
  supportsStageAwareness: boolean;
  maxContextTokens: number;
  supportedModels: string[];
  responseLatencyMs: number | null;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
```

### Events (streaming)

```typescript
export type RuntimeEvent =
  | { type: 'chunk'; data: { content: string }; engineEvent?: never }
  | { type: 'tool_call'; data: ToolCallRequest; engineEvent?: string }
  | { type: 'tool_result'; data: ToolCallResult; engineEvent?: string }
  | { type: 'stage_hint'; data: { suggestedStage: string }; engineEvent?: never }
  | { type: 'error'; data: AdapterError; engineEvent?: string }
  | { type: 'done'; data: { message: Message }; engineEvent?: never };

export interface ToolCallRequest {
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolName: string;
  result: unknown;
  error?: string;
}
```
