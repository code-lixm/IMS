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
} from "@ims/shared";

export const luiApi = {
  // Conversations
  list() {
    return api<ConversationListData>("/api/lui/conversations");
  },

  get(id: string) {
    return api<ConversationDetailData>(`/api/lui/conversations/${id}`);
  },

  create(input?: CreateConversationInput) {
    return api<{ id: string; title: string; candidateId: string | null }>("/api/lui/conversations", {
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
  sendMessage(conversationId: string, input: SendMessageInput) {
    return api<MessageData>(`/api/lui/conversations/${conversationId}/messages`, {
      method: "POST",
      json: input,
    });
  },

  async streamMessage(
    conversationId: string,
    input: SendMessageInput,
    options: LuiStreamCallbacks & { signal?: AbortSignal } = {}
  ): Promise<LuiStreamMessageState> {
    const response = await requestStream(`/api/lui/conversations/${conversationId}/messages`, {
      method: "POST",
      json: input,
      signal: options.signal,
    });

    return consumeLuiMessageStream(response, options);
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
    return api<AgentListData>("/api/lui/agents");
  },

  getAgent(id: string) {
    return api<{ id: string; name: string; description: string | null; mode: string; temperature: number; systemPrompt: string | null; tools: string[]; isDefault: boolean }>(`/api/lui/agents/${id}`);
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
};
