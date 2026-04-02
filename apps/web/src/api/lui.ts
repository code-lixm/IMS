import { api, requestForm, requestStream } from "./client";
import {
  consumeLuiMessageStream,
  type LuiStreamCallbacks,
  type LuiStreamMessageState,
} from "./core/stream";
import type {
  ConversationListData,
  ConversationDetailData,
  ConversationData,
  CreateConversationInput,
  UpdateConversationInput,
  MessageData,
  SendMessageInput,
  FileResourceListData,
  UploadFileData,
  AgentListData,
  CreateAgentInput,
  UpdateAgentInput,
  LuiCredentialStatusData,
  SetLuiCredentialInput,
  LuiSettingsData,
  UpdateLuiSettingsInput,
  LuiPresetProviderListData,
} from "@ims/shared";

interface LuiModelData {
  id: string;
  provider: string;
  name: string;
  displayName: string;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  requiresAuth: boolean;
}

interface LuiModelProviderData {
  id: string;
  name: string;
  icon: string;
  models: LuiModelData[];
}

interface LuiModelProviderListData {
  providers: LuiModelProviderData[];
}

interface LuiTranscriptionData {
  sessionId: string;
  transcript: string;
  final: boolean;
}

type LuiSendMessageInput = SendMessageInput & {
  agentId?: string;
  modelProvider?: string;
  modelId?: string;
  customModelName?: string;
  endpointBaseURL?: string;
  endpointApiKey?: string;
  temperature?: number;
};

export const luiApi = {
  // Conversations
  list() {
    return api<ConversationListData>("/api/lui/conversations");
  },

  get(id: string) {
    return api<ConversationDetailData>(`/api/lui/conversations/${id}`);
  },

  create(input?: CreateConversationInput) {
    return api<ConversationData>("/api/lui/conversations", {
      method: "POST",
      json: input ?? {},
    });
  },

  delete(id: string) {
    return api<{ id: string }>(`/api/lui/conversations/${id}`, {
      method: "DELETE",
    });
  },

  update(id: string, input: UpdateConversationInput) {
    return api<ConversationData>(`/api/lui/conversations/${id}`, {
      method: "PUT",
      json: input,
    });
  },

  // Messages
  sendMessage(conversationId: string, input: LuiSendMessageInput) {
    return api<MessageData>(`/api/lui/conversations/${conversationId}/messages`, {
      method: "POST",
      json: input,
    });
  },

  async streamMessage(
    conversationId: string,
    input: LuiSendMessageInput,
    options: LuiStreamCallbacks & { signal?: AbortSignal } = {}
  ): Promise<LuiStreamMessageState> {
    const response = await requestStream(`/api/lui/conversations/${conversationId}/messages`, {
      method: "POST",
      json: input,
      signal: options.signal,
    });

    return consumeLuiMessageStream(response, options);
  },

  // Models
  listModels(config?: { providerId?: string; baseURL?: string; apiKey?: string; provider?: string; strict?: boolean }) {
    // Send config to backend if providerId or baseURL is provided
    if (config?.providerId || config?.baseURL) {
      return api<LuiModelProviderListData>("/api/lui/models", {
        method: "POST",
        json: config,
      });
    }
    return api<LuiModelProviderListData>("/api/lui/models");
  },

  // Preset Providers
  listPresetProviders() {
    return api<LuiPresetProviderListData>("/api/lui/providers");
  },

  // Settings
  getSettings() {
    return api<LuiSettingsData>("/api/lui/settings");
  },

  updateSettings(input: UpdateLuiSettingsInput) {
    return api<LuiSettingsData>("/api/lui/settings", {
      method: "PUT",
      json: input,
    });
  },

  // Credentials
  getCredentialStatus(provider: string) {
    return api<LuiCredentialStatusData>(`/api/lui/credentials/${provider}/status`);
  },

  setCredential(provider: string, input: SetLuiCredentialInput) {
    return api<LuiCredentialStatusData>(`/api/lui/credentials/${provider}`, {
      method: "PUT",
      json: input,
    });
  },

  deleteCredential(provider: string) {
    return api<LuiCredentialStatusData>(`/api/lui/credentials/${provider}`, {
      method: "DELETE",
    });
  },

  // Files
  listFiles() {
    return api<FileResourceListData>("/api/lui/files");
  },

  getFile(id: string) {
    return api<{ content: string; name: string; type: string }>(`/api/lui/files/${id}`);
  },

  uploadFile(conversationId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("conversationId", conversationId);
    return requestForm<UploadFileData>("/api/lui/files", {
      method: "POST",
      formData,
    });
  },

  transcribeListenerAudio(input: {
    sessionId: string;
    audioFile?: Blob;
    isFinal?: boolean;
    sampleRate?: number;
  }) {
    const formData = new FormData();
    formData.append("sessionId", input.sessionId);
    formData.append("isFinal", input.isFinal ? "true" : "false");
    formData.append("sampleRate", String(input.sampleRate ?? 16000));
    if (input.audioFile) {
      formData.append(
        "file",
        input.audioFile,
        input.isFinal ? "listener-final.wav" : "listener-chunk.wav",
      );
    }

    return requestForm<LuiTranscriptionData>("/api/lui/transcribe", {
      method: "POST",
      formData,
      timeoutMs: 120_000,
    });
  },

  deleteFile(id: string) {
    return api<{ id: string }>(`/api/lui/files/${id}`, {
      method: "DELETE",
    });
  },

  // Agents
  listAgents() {
    return api<AgentListData>("/api/lui/agents");
  },

  getAgent(id: string) {
    return api<{ id: string; name: string; description: string | null; engine: "builtin" | "deepagents"; mode: string; temperature: number; systemPrompt: string | null; tools: string[]; isDefault: boolean }>(`/api/lui/agents/${id}`);
  },

  createAgent(input: CreateAgentInput) {
    return api<{ id: string }>("/api/lui/agents", {
      method: "POST",
      json: input,
    });
  },

  updateAgent(id: string, input: UpdateAgentInput) {
    return api<{ id: string }>(`/api/lui/agents/${id}`, {
      method: "PUT",
      json: input,
    });
  },

  deleteAgent(id: string) {
    return api<{ id: string }>(`/api/lui/agents/${id}`, {
      method: "DELETE",
    });
  },

  // Workflows
  listWorkflows(candidateId?: string) {
    const url = candidateId
      ? `/api/lui/workflows?candidateId=${encodeURIComponent(candidateId)}`
      : "/api/lui/workflows";
    return api<{ items: WorkflowState[] }>(url);
  },

  getWorkflow(id: string) {
    return api<WorkflowState>(`/api/lui/workflows/${id}`);
  },

  updateWorkflow(id: string, input: { currentStage?: WorkflowState["currentStage"]; status?: WorkflowState["status"] }) {
    return api<WorkflowState>(`/api/lui/workflows/${id}`, {
      method: "PUT",
      json: input,
    });
  },

  getWorkflowByCandidate(candidateId: string) {
    return api<WorkflowState>(`/api/lui/workflows/by-candidate/${candidateId}`);
  },

  createWorkflow(input: { candidateId: string; conversationId: string }) {
    return api<WorkflowState>("/api/lui/workflows", {
      method: "POST",
      json: input,
    });
  },

  advanceWorkflow(id: string) {
    return api<{ stage: string }>(`/api/lui/workflows/${id}/advance`, {
      method: "POST",
    });
  },

  resetWorkflow(id: string) {
    return api<{ success: boolean }>(`/api/lui/workflows/${id}/reset`, {
      method: "POST",
    });
  },

  // Generate conversation title based on message content
  generateTitle(content: string, modelId?: string, modelProvider?: string) {
    return api<{ title: string }>("/api/lui/generate-title", {
      method: "POST",
      json: {
        content,
        modelId,
        modelProvider,
      },
    });
  },
};

// Workflow types
export interface WorkflowState {
  id: string;
  candidateId: string;
  conversationId: string | null;
  currentStage: "S0" | "S1" | "S2" | "completed";
  stageData: Record<string, unknown>;
  documents: {
    S0?: StageDocument;
    S1?: StageDocument & { roundFiles?: Record<number, string> };
    S2?: StageDocument;
  };
  status: "active" | "paused" | "completed" | "error";
  createdAt: string;
  updatedAt: string;
}

export interface StageDocument {
  filePath?: string;
  content?: string;
  round?: number;
  summary?: string;
  generatedAt: string;
}
