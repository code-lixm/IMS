import { computed, type ComputedRef, type Ref } from "vue";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import { convertConversation, convertFileResource, convertMessage, type Conversation, type FileResource, type Message } from "./types";

interface LuiConversationModuleOptions {
  conversations: Ref<Conversation[]>;
  selectedId: Ref<string | null>;
  selectedAgentId: Ref<string | null>;
  selectedModelId: Ref<string | null>;
  temperature: Ref<number>;
  messages: Ref<Record<string, Message[]>>;
  fileResources: Ref<Record<string, FileResource[]>>;
  isLoading: Ref<boolean>;
  isLoadingMessages: Ref<boolean>;
  isInitializing: Ref<boolean>;
  isInitialized: Ref<boolean>;
  isBindingCandidate: Ref<boolean>;
  error: Ref<string | null>;
}

export interface LuiConversationModule {
  selectedConversation: ComputedRef<Conversation | undefined>;
  initialize: () => Promise<void>;
  bindConversationCandidate: (conversationId: string, candidateId: string | null) => Promise<void>;
  updateConversationAiConfig: (input: { agentId?: string | null; modelId?: string | null; temperature?: number }) => Promise<void>;
  loadConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  createConversation: (title?: string, candidateId?: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
}

export function createLuiConversationModule(options: LuiConversationModuleOptions): LuiConversationModule {
  const {
    conversations,
    selectedId,
    selectedAgentId,
    selectedModelId,
    temperature,
    messages,
    fileResources,
    isLoading,
    isLoadingMessages,
    isInitializing,
    isInitialized,
    isBindingCandidate,
    error,
  } = options;
  const { notifyError } = useAppNotifications();

  const selectedConversation = computed(() =>
    conversations.value.find((conversation) => conversation.id === selectedId.value)
  );

  function applyConversationConfig(conversation: Conversation | undefined) {
    selectedAgentId.value = conversation?.agentId ?? null;
    selectedModelId.value = conversation?.modelId ?? null;
    temperature.value = conversation?.temperature ?? 0.5;
  }

  async function initialize() {
    if (isInitializing.value || isInitialized.value) {
      return;
    }

    isInitializing.value = true;
    error.value = null;

    try {
      await loadConversations();
      if (!selectedId.value && conversations.value[0]) {
        await selectConversation(conversations.value[0].id);
      }
      isInitialized.value = true;
    } finally {
      isInitializing.value = false;
    }
  }

  async function loadConversations() {
    isLoading.value = true;
    error.value = null;

    try {
      const data = await luiApi.list();
      conversations.value = data.items.map(convertConversation);
      applyConversationConfig(conversations.value.find((conversation) => conversation.id === selectedId.value));
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load conversations";
      notifyError(reportAppError("lui/load-conversations", err, {
        title: "加载会话失败",
        fallbackMessage: "暂时无法获取会话列表",
      }));
    } finally {
      isLoading.value = false;
    }
  }

  async function loadConversation(id: string) {
    isLoadingMessages.value = true;
    error.value = null;

    try {
      const data = await luiApi.get(id);
      const normalizedConversation = convertConversation(data.conversation);
      const existingIndex = conversations.value.findIndex((conversation) => conversation.id === id);
      if (existingIndex >= 0) {
        conversations.value[existingIndex] = normalizedConversation;
      } else {
        conversations.value = [normalizedConversation, ...conversations.value];
      }

      if (selectedId.value === id) {
        applyConversationConfig(normalizedConversation);
      }

      messages.value[id] = data.messages.map(convertMessage);
      fileResources.value[id] = data.files.map(convertFileResource);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load conversation";
      notifyError(reportAppError("lui/load-conversation", err, {
        title: "加载会话详情失败",
        fallbackMessage: "暂时无法获取会话内容",
      }));
    } finally {
      isLoadingMessages.value = false;
    }
  }

  async function selectConversation(id: string) {
    selectedId.value = id;
    applyConversationConfig(conversations.value.find((conversation) => conversation.id === id));
    if (!messages.value[id]) {
      await loadConversation(id);
    }
  }

  async function createConversation(title?: string, candidateId?: string) {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await luiApi.create({
        title,
        candidateId,
        agentId: selectedAgentId.value,
        modelId: selectedModelId.value,
        temperature: temperature.value,
      });
      const conversation = convertConversation(result);

      conversations.value = [conversation, ...conversations.value];
      selectedId.value = conversation.id;
      applyConversationConfig(conversation);
      messages.value[conversation.id] = [];
      fileResources.value[conversation.id] = [];
      return conversation;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to create conversation";
      notifyError(reportAppError("lui/create-conversation", err, {
        title: "创建会话失败",
        fallbackMessage: "暂时无法创建新会话",
      }));
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
      conversations.value = conversations.value.filter((conversation) => conversation.id !== id);
      delete messages.value[id];
      delete fileResources.value[id];
      if (selectedId.value === id) {
        selectedId.value = conversations.value[0]?.id ?? null;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to delete conversation";
      notifyError(reportAppError("lui/delete-conversation", err, {
        title: "删除会话失败",
        fallbackMessage: "暂时无法删除会话",
      }));
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function bindConversationCandidate(conversationId: string, candidateId: string | null) {
    const conversation = conversations.value.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    const previousCandidateId = conversation.candidateId;
    conversation.candidateId = candidateId;
    isBindingCandidate.value = true;
    error.value = null;

    try {
      const updated = await luiApi.update(conversationId, { candidateId });
      const normalized = convertConversation(updated);
      const index = conversations.value.findIndex((item) => item.id === conversationId);
      if (index >= 0) {
        conversations.value[index] = normalized;
      }
      if (selectedId.value === conversationId) {
        applyConversationConfig(normalized);
      }
    } catch (err) {
      conversation.candidateId = previousCandidateId;
      error.value = err instanceof Error ? err.message : "Failed to update conversation";
      notifyError(reportAppError("lui/bind-candidate", err, {
        title: "关联候选人失败",
        fallbackMessage: "暂时无法更新会话关联关系",
      }));
      throw err;
    } finally {
      isBindingCandidate.value = false;
    }
  }

  async function updateConversationAiConfig(input: {
    agentId?: string | null;
    modelId?: string | null;
    temperature?: number;
  }) {
    const conversationId = selectedId.value;
    if (!conversationId) {
      return;
    }

    const index = conversations.value.findIndex((item) => item.id === conversationId);
    if (index < 0) {
      return;
    }

    const current = conversations.value[index];
    const optimistic: Conversation = {
      ...current,
      agentId: input.agentId !== undefined ? input.agentId : current.agentId,
      modelId: input.modelId !== undefined ? input.modelId : current.modelId,
      temperature: input.temperature !== undefined ? input.temperature : current.temperature,
      updatedAt: new Date(),
    };
    conversations.value[index] = optimistic;
    applyConversationConfig(optimistic);

    try {
      const updated = await luiApi.update(conversationId, input);
      const normalized = convertConversation(updated);
      conversations.value[index] = normalized;
      applyConversationConfig(normalized);
    } catch (err) {
      conversations.value[index] = current;
      applyConversationConfig(current);
      error.value = err instanceof Error ? err.message : "Failed to update conversation config";
      notifyError(reportAppError("lui/update-conversation-config", err, {
        title: "更新会话 AI 配置失败",
        fallbackMessage: "暂时无法保存会话 AI 配置",
      }));
      throw err;
    }
  }

  return {
    selectedConversation,
    initialize,
    bindConversationCandidate,
    updateConversationAiConfig,
    loadConversations,
    loadConversation,
    selectConversation,
    createConversation,
    deleteConversation,
  };
}
