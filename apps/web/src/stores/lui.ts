import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { createLuiAgentModule } from "./lui/agents";
import { createLuiConversationModule } from "./lui/conversations";
import { createLuiCredentialModule } from "./lui/credentials";
import { createLuiFileModule } from "./lui/files";
import { createLuiMessageModule } from "./lui/messages";
import { createLuiModelModule } from "./lui/models";
import { createLuiTaskQueueModule } from "./lui/task-queue";
import type {
  Conversation,
  Credential,
  FileResource,
  Message,
  ModelProvider,
  Task,
} from "./lui/types";

export type {
  Agent,
  Conversation,
  Credential,
  FileResource,
  Message,
  ModelConfig,
  ModelProvider,
  Task,
} from "./lui/types";

export const useLuiStore = defineStore("lui", () => {
  // Core state
  const conversations = ref<Conversation[]>([]);
  const selectedId = ref<string | null>(null);
  const messages = ref<Record<string, Message[]>>({});
  const fileResources = ref<Record<string, FileResource[]>>({});
  const isLoading = ref(false);
  const isLoadingMessages = ref(false);
  const isInitializing = ref(false);
  const isInitialized = ref(false);
  const isBindingCandidate = ref(false);
  const error = ref<string | null>(null);

  // AI Gateway state
  const agents = ref<import("./lui/types").Agent[]>([]);
  const selectedAgentId = ref<string | null>(null);
  const providers = ref<ModelProvider[]>([]);
  const selectedModelId = ref<string | null>(null);
  const credentials = ref<Record<string, Credential>>({});
  const tasks = ref<Task[]>([]);
  const isProcessing = ref(false);
  const isCredentialLoading = ref(false);
  const temperature = ref(0.5);

  // Chat config computed
  const chatConfig = computed(() => ({
    agentId: selectedAgentId.value,
    modelId: selectedModelId.value,
    temperature: temperature.value,
  }));

  // Modules
  const conversationModule = createLuiConversationModule({
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
  });

  const messageModule = createLuiMessageModule({
    selectedId,
    messages,
    selectedAgentId,
    selectedModelId,
    temperature,
  });

  const fileModule = createLuiFileModule({
    selectedId,
    fileResources,
    error,
  });

  const agentModule = createLuiAgentModule({
    agents,
    selectedId: selectedAgentId,
    isLoading,
    error,
  });

  const modelModule = createLuiModelModule({
    providers,
    selectedId: selectedModelId,
    isLoading,
  });

  const credentialModule = createLuiCredentialModule({
    credentials,
    isLoading: isCredentialLoading,
  });

  const taskQueueModule = createLuiTaskQueueModule({
    tasks,
    isProcessing,
  });

  async function initialize() {
    if (isInitializing.value || isInitialized.value) {
      return;
    }

    isInitializing.value = true;
    error.value = null;

    try {
      await modelModule.loadModels();
      await Promise.all(providers.value.map((provider) =>
        credentialModule.checkAuthStatus(provider.id).catch(() => false)
      ));
      await agentModule.loadAgents();
      await conversationModule.loadConversations();

      if (!selectedId.value && conversations.value[0]) {
        await conversationModule.selectConversation(conversations.value[0].id);
      }

      isInitialized.value = true;
    } finally {
      isInitializing.value = false;
    }
  }

  return {
    // Core state
    conversations,
    selectedId,
    messages,
    fileResources,
    isLoading,
    isLoadingMessages,
    isInitializing,
    isInitialized,
    isBindingCandidate,
    error,
    // AI Gateway state
    agents,
    selectedAgentId,
    providers,
    selectedModelId,
    credentials,
    tasks,
    isProcessing,
    temperature,
    chatConfig,
    // Modules
    ...conversationModule,
    ...messageModule,
    ...fileModule,
    ...agentModule,
    ...modelModule,
    ...credentialModule,
    ...taskQueueModule,
    initialize,
  };
});
