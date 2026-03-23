import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { luiApi } from "@/api/lui";
import type {
  ConversationData as ApiConversation,
  MessageData as ApiMessage,
  FileResourceData as ApiFileResource,
} from "@ims/shared";

export interface Conversation {
  id: string;
  title: string;
  candidateId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string | null;
  tools?: unknown[] | null;
  status: "streaming" | "error" | "complete";
  createdAt: Date;
}

export interface FileResource {
  id: string;
  name: string;
  type: "code" | "document" | "image";
  content: string;
  language?: string | null;
  size?: number;
  createdAt: Date;
}

function convertConversation(c: ApiConversation): Conversation {
  return {
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  };
}

function convertMessage(m: ApiMessage): Message {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    reasoning: m.reasoning ?? undefined,
    tools: m.tools ?? undefined,
    status: m.status,
    createdAt: new Date(m.createdAt),
  };
}

function convertFileResource(f: ApiFileResource): FileResource {
  return {
    ...f,
    createdAt: new Date(f.createdAt),
  };
}

export const useLuiStore = defineStore("lui", () => {
  // State
  const conversations = ref<Conversation[]>([]);
  const selectedId = ref<string | null>(null);
  const messages = ref<Record<string, Message[]>>({});
  const fileResources = ref<Record<string, FileResource[]>>({});
  const isLoading = ref(false);
  const isLoadingMessages = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const selectedConversation = computed(() =>
    conversations.value.find((c) => c.id === selectedId.value)
  );

  const currentMessages = computed(() =>
    selectedId.value ? messages.value[selectedId.value] ?? [] : []
  );

  const currentFiles = computed(() =>
    selectedId.value ? fileResources.value[selectedId.value] ?? [] : []
  );

  // Actions
  async function loadConversations() {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await luiApi.list();
      conversations.value = data.items.map(convertConversation);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load conversations";
      console.error("[lui] loadConversations error:", err);
    } finally {
      isLoading.value = false;
    }
  }

  async function loadConversation(id: string) {
    isLoadingMessages.value = true;
    error.value = null;
    try {
      const data = await luiApi.get(id);
      // Update conversation in list
      const idx = conversations.value.findIndex((c) => c.id === id);
      if (idx >= 0) {
        conversations.value[idx] = convertConversation(data.conversation);
      }
      // Store messages
      messages.value[id] = data.messages.map(convertMessage);
      // Store files
      fileResources.value[id] = data.files.map(convertFileResource);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load conversation";
      console.error("[lui] loadConversation error:", err);
    } finally {
      isLoadingMessages.value = false;
    }
  }

  async function selectConversation(id: string) {
    selectedId.value = id;
    // Load conversation if not already loaded
    if (!messages.value[id]) {
      await loadConversation(id);
    }
  }

  async function createConversation(title?: string, candidateId?: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await luiApi.create({ title, candidateId });
      const now = new Date();
      const newConv: Conversation = {
        id: result.id,
        title: result.title,
        candidateId: candidateId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      conversations.value = [newConv, ...conversations.value];
      selectedId.value = newConv.id;
      messages.value[newConv.id] = [];
      fileResources.value[newConv.id] = [];
      return newConv;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to create conversation";
      console.error("[lui] createConversation error:", err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteConversation(id: string) {
    isLoading.value = true;
    error.value = null;
    try {
      await luiApi.delete(id);
      conversations.value = conversations.value.filter((c) => c.id !== id);
      delete messages.value[id];
      delete fileResources.value[id];
      if (selectedId.value === id) {
        selectedId.value = conversations.value[0]?.id ?? null;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to delete conversation";
      console.error("[lui] deleteConversation error:", err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  function addMessage(conversationId: string, message: Message) {
    if (!messages.value[conversationId]) {
      messages.value[conversationId] = [];
    }
    messages.value[conversationId] = [...messages.value[conversationId], message];
  }

  function updateMessage(conversationId: string, messageId: string, updates: Partial<Message>) {
    const convMessages = messages.value[conversationId];
    if (!convMessages) return;
    const idx = convMessages.findIndex((m) => m.id === messageId);
    if (idx >= 0) {
      messages.value[conversationId] = [
        ...convMessages.slice(0, idx),
        { ...convMessages[idx], ...updates },
        ...convMessages.slice(idx + 1),
      ];
    }
  }

  async function sendMessage(conversationId: string, content: string) {
    // Add user message immediately
    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      conversationId,
      role: "user",
      content,
      status: "complete",
      createdAt: new Date(),
    };
    addMessage(conversationId, userMsg);

    // Add placeholder for assistant
    const assistantMsg: Message = {
      id: `msg_${Date.now() + 1}`,
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date(),
    };
    addMessage(conversationId, assistantMsg);

    try {
      // For streaming, we need to handle the response differently
      // This is a simplified version - real streaming would use SSE
      const response = await fetch("/api/lui/conversations/" + conversationId + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      // Read streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE lines: data: {...}
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "text" && data.content) {
                  assistantMsg.content += data.content;
                  // Trigger reactivity
                  messages.value = { ...messages.value };
                } else if (data.type === "done") {
                  assistantMsg.status = "complete";
                  messages.value = { ...messages.value };
                }
              } catch {
                // Ignore parse errors for partial chunks
              }
            }
          }
        }
      }

      // Mark as complete if not already
      if (assistantMsg.status === "streaming") {
        assistantMsg.status = "complete";
      }
    } catch (err) {
      console.error("[lui] sendMessage error:", err);
      assistantMsg.status = "error";
      assistantMsg.content = "消息发送失败，请重试";
      messages.value = { ...messages.value };
    }
  }

  async function addFileResource(conversationId: string, file: File) {
    try {
      const result = await luiApi.uploadFile(conversationId, file);
      const newFile: FileResource = {
        id: result.id,
        name: result.name,
        type: result.type,
        content: result.content,
        size: result.size,
        createdAt: new Date(),
      };
      if (!fileResources.value[conversationId]) {
        fileResources.value[conversationId] = [];
      }
      fileResources.value[conversationId] = [...fileResources.value[conversationId], newFile];
      return newFile;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to upload file";
      console.error("[lui] addFileResource error:", err);
      throw err;
    }
  }

  async function removeFileResource(conversationId: string, fileId: string) {
    try {
      await luiApi.deleteFile(fileId);
      fileResources.value[conversationId] = fileResources.value[conversationId].filter(
        (f) => f.id !== fileId
      );
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to delete file";
      console.error("[lui] removeFileResource error:", err);
      throw err;
    }
  }

  return {
    // State
    conversations,
    selectedId,
    messages,
    fileResources,
    isLoading,
    isLoadingMessages,
    error,
    // Getters
    selectedConversation,
    currentMessages,
    currentFiles,
    // Actions
    loadConversations,
    loadConversation,
    selectConversation,
    createConversation,
    deleteConversation,
    addMessage,
    updateMessage,
    sendMessage,
    addFileResource,
    removeFileResource,
  };
});
