import { api } from "./client";
import type {
  ConversationListData,
  ConversationDetailData,
  CreateConversationInput,
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
      body: JSON.stringify(input ?? {}),
    });
  },

  delete(id: string) {
    return api<{ id: string }>(`/api/lui/conversations/${id}`, {
      method: "DELETE",
    });
  },

  // Messages
  sendMessage(conversationId: string, input: SendMessageInput) {
    return api<MessageData>(`/api/lui/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
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
    return api<UploadFileData>("/api/lui/files", {
      method: "POST",
      body: formData as unknown as string,
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
      body: JSON.stringify(input),
    });
  },

  updateAgent(id: string, input: UpdateAgentInput) {
    return api<{ id: string }>(`/api/lui/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  deleteAgent(id: string) {
    return api<{ id: string }>(`/api/lui/agents/${id}`, {
      method: "DELETE",
    });
  },
};
