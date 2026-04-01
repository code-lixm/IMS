# Agent Extension Research Summary

**Date**: 2026-04-01
**Status**: Research Complete

---

## 1. Current Implementation Analysis

### 1.1 Agent Store (`apps/web/src/stores/lui/agents.ts`)

**Data Structure** (`apps/web/src/stores/lui/types.ts`):
```typescript
interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  defaultModel: string;
  defaultTemperature: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Key Functions**:
- `loadAgents()`: Load from `luiApi.listAgents()`, auto-select default
- `selectAgent(id)`: Update `selectedId` (local only, no persistence)
- `createAgent/updateAgent/deleteAgent`: CRUD operations
- `selectedAgent/defaultAgent`: Computed properties

**Issue**: `selectAgent()` only updates memory, not persisted to conversation.

### 1.2 Agent Selector Component (`apps/web/src/components/lui/agent-selector.vue`)

**Props/Emits**:
- `modelValue?: string | null` - Selected Agent ID
- `@update:modelValue(id)` - v-model support
- `@select(agent)` - Full Agent object

**UI Structure**:
- Trigger button with Bot icon + selected Agent name
- Dialog with agent list (name, description, badges)
- Confirm/Cancel actions

**Integration Status**: NOT integrated in LUIView.vue

### 1.3 LUI Main View (`apps/web/src/views/LUIView.vue`)

**Layout**:
- Left: ConversationList + Workbench (Listener/Files)
- Right: Chat area + Workflow bar + Input area

**Current Agent Usage**:
- `activeSuggestionAgent = store.selectedAgent ?? store.defaultAgent`
- `buildAgentSuggestions()` generates starter suggestions based on Agent tools

**Missing**: No Agent Selector UI in toolbar or input area

### 1.4 Conversation Flow

**Agent Selection Flow**:
1. `applyConversationConfig(conversation)` syncs `selectedAgentId` from `conversation.agentId`
2. `createConversation()` uses current `selectedAgentId` as initial config
3. `updateConversationAiConfig({ agentId })` persists to backend
4. `sendMessage()` passes `agentId: selectedAgentId` to backend

**Key Insight**: Conversation is the source of truth for Agent selection, not the Agent Store directly.

---

## 2. Integration Points

### 2.1 Recommended Agent Selector Mount Points

**Option A: Top Toolbar** (Recommended)
- Position: Next to `CandidateSelector`
- Pros: Global scope, clear semantics
- Binding: `v-model="store.selectedAgentId"`

**Option B: Input Footer** (Alternative)
- Position: Next to `ModelSelector`
- Pros: Close to model selection, contextual
- Binding: Same as above

### 2.2 Required Changes

1. **Persist Agent Selection**:
   - Call `store.updateConversationAiConfig({ agentId })` after selection
   - Ensure backend supports `agentId` in conversation AI config

2. **Default Model Strategy**:
   - Current: Hardcoded inference from `mode` field
   - Better: Use backend-provided `defaultModel` or provider mapping

3. **Tools Integration**:
   - `Agent.tools: string[]` is data-only, not rendered
   - Need to display tool capabilities in UI

---

## 3. Architecture Gap Analysis

### 3.1 Current vs Design Document

| Aspect | Current | Design Doc | Gap |
|--------|---------|------------|-----|
| Agent Host | None | `AgentHost` singleton | Not implemented |
| Context Bridge | None | `IMSContext` + `useAgentContext` | Not implemented |
| Swarm/Handoff | None | Multi-agent coordination | Not implemented |
| Agent Execution | Backend | Frontend `AgentHost` | Backend-only |
| Extension System | None | Plugin loader + ACL | Not implemented |

### 3.2 Implementation Path

**Phase 1: MVP Integration** (1-2 days)
- [ ] Integrate `agent-selector.vue` in LUIView toolbar
- [ ] Bind to `store.selectedAgentId`
- [ ] Persist selection via `updateConversationAiConfig`

**Phase 2: AgentHost Foundation** (1 week)
- [ ] Create `apps/web/src/agents/` directory
- [ ] Implement `AgentHost` class
- [ ] Implement `ContextBridge` + `useAgentContext`
- [ ] Migrate existing Agent Store to use AgentHost

**Phase 3: Interview Agents** (1 week)
- [ ] Create `InterviewCoordinator` agent
- [ ] Create `TechInterviewer` agent
- [ ] Create `HRInterviewer` agent
- [ ] Implement Swarm coordination

**Phase 4: Agent Switching** (1 week)
- [ ] Implement mid-conversation agent switching
- [ ] Add Handoff visualization
- [ ] Add Active Agent indicator

---

## 4. Key Files

| File | Role |
|------|------|
| `apps/web/src/stores/lui/agents.ts` | Agent state management |
| `apps/web/src/stores/lui/types.ts` | Agent type definitions |
| `apps/web/src/components/lui/agent-selector.vue` | Agent selection UI |
| `apps/web/src/views/LUIView.vue` | Main LUI view (integration target) |
| `apps/web/src/stores/lui/conversations.ts` | Conversation AI config |
| `apps/web/src/stores/lui/messages.ts` | Message sending with agentId |
| `apps/web/src/api/lui.ts` | LUI API client |
| `docs/Agent-Extension-Architecture.md` | Design specification |

---

## 5. Dependencies to Install

```bash
pnpm add @deepagents/agent ai zod @ai-sdk/openai
```

---

## 6. Next Steps

1. Create feature branch: `feature/agent-extension`
2. Set up worktree for parallel development
3. Start with Phase 1 MVP integration
4. Follow design document for AgentHost implementation