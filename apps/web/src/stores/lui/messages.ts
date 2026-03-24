import { computed, type ComputedRef, type Ref } from "vue";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import type { Message } from "./types";

interface LuiMessageModuleOptions {
  selectedId: Ref<string | null>;
  messages: Ref<Record<string, Message[]>>;
  selectedAgentId: Ref<string | null>;
  selectedModelId: Ref<string | null>;
  temperature: Ref<number>;
}

export interface LuiMessageModule {
  currentMessages: ComputedRef<Message[]>;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
}

export function createLuiMessageModule(options: LuiMessageModuleOptions): LuiMessageModule {
  const { selectedId, messages, selectedAgentId, selectedModelId, temperature } = options;
  const { notifyError } = useAppNotifications();

  const currentMessages = computed(() =>
    selectedId.value ? messages.value[selectedId.value] ?? [] : []
  );

  function addMessage(conversationId: string, message: Message) {
    if (!messages.value[conversationId]) {
      messages.value[conversationId] = [];
    }

    messages.value[conversationId] = [...messages.value[conversationId], message];
  }

  function updateMessage(conversationId: string, messageId: string, updates: Partial<Message>) {
    const conversationMessages = messages.value[conversationId];
    if (!conversationMessages) {
      return;
    }

    const messageIndex = conversationMessages.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) {
      return;
    }

    messages.value[conversationId] = [
      ...conversationMessages.slice(0, messageIndex),
      { ...conversationMessages[messageIndex], ...updates },
      ...conversationMessages.slice(messageIndex + 1),
    ];
  }

  async function sendMessage(conversationId: string, content: string) {
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      conversationId,
      role: "user",
      content,
      status: "complete",
      createdAt: new Date(),
    };
    addMessage(conversationId, userMessage);

    const assistantMessage: Message = {
      id: `msg_${Date.now() + 1}`,
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date(),
    };
    addMessage(conversationId, assistantMessage);

    try {
      await luiApi.streamMessage(conversationId, {
        content,
        agentId: selectedAgentId.value ?? undefined,
        modelId: selectedModelId.value ?? undefined,
        temperature: temperature.value,
      }, {
        onUpdate(state) {
          assistantMessage.content = state.content;
          assistantMessage.reasoning = state.reasoning;
          assistantMessage.tools = state.tools;
          assistantMessage.status = state.status;
          messages.value = { ...messages.value };
        },
        onComplete(state) {
          assistantMessage.content = state.content;
          assistantMessage.reasoning = state.reasoning;
          assistantMessage.tools = state.tools;
          assistantMessage.status = state.status;
          messages.value = { ...messages.value };
        },
      });
    } catch (err) {
      notifyError(reportAppError("lui/send-message", err, {
        title: "发送消息失败",
        fallbackMessage: "消息发送失败，请稍后重试",
      }));
      assistantMessage.status = "error";
      assistantMessage.content = "消息发送失败，请重试";
      messages.value = { ...messages.value };
    }
  }

  return {
    currentMessages,
    addMessage,
    updateMessage,
    sendMessage,
  };
}
