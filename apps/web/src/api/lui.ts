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
  AgentData,
  CreateAgentInput,
  UpdateAgentInput,
  LuiCredentialStatusData,
  SetLuiCredentialInput,
  LuiSettingsData,
  UpdateLuiSettingsInput,
  LuiPresetProviderListData,
} from "@ims/shared";

export interface LuiAgentLifecycleFields {
  agentId: string;
  displayName: string;
  sourceType: "builtin" | "custom" | "imported";
  isBuiltin: boolean;
  isMutable: boolean;
  sceneAffinity: "general" | "interview";
}

export type LuiAgentData = AgentData & LuiAgentLifecycleFields;
export type LuiCreateAgentInput = CreateAgentInput & {
  name?: string;
  displayName?: string;
};
export type LuiUpdateAgentInput = UpdateAgentInput & {
  name?: string;
  displayName?: string;
};
export interface LuiAgentListData {
  items: LuiAgentData[];
}

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

  deleteFile(id: string) {
    return api<{ id: string }>(`/api/lui/files/${id}`, {
      method: "DELETE",
    });
  },

  // Agents
  listAgents() {
    return api<LuiAgentListData>("/api/lui/agents");
  },

  getAgent(id: string) {
    return api<LuiAgentData>(`/api/lui/agents/${id}`);
  },

  createAgent(input: LuiCreateAgentInput) {
    return api<LuiAgentData>("/api/lui/agents", {
      method: "POST",
      json: input,
    });
  },

  updateAgent(id: string, input: LuiUpdateAgentInput) {
    return api<LuiAgentData>(`/api/lui/agents/${id}`, {
      method: "PUT",
      json: input,
    });
  },

  deleteAgent(id: string) {
    return api<{ id: string }>(`/api/lui/agents/${id}`, {
      method: "DELETE",
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
