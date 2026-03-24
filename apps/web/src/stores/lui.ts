import { defineStore } from "pinia";
import { ref } from "vue";
import { createLuiConversationModule } from "./lui/conversations";
import { createLuiFileModule } from "./lui/files";
import { createLuiMessageModule } from "./lui/messages";
import type { Conversation, FileResource, Message } from "./lui/types";

export type { Conversation, FileResource, Message } from "./lui/types";

export const useLuiStore = defineStore("lui", () => {
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

  const conversationModule = createLuiConversationModule({
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
  });

  const messageModule = createLuiMessageModule({
    selectedId,
    messages,
  });

  const fileModule = createLuiFileModule({
    selectedId,
    fileResources,
    error,
  });

  return {
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
    ...conversationModule,
    ...messageModule,
    ...fileModule,
  };
});
