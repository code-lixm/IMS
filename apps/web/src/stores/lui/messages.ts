import { computed, type ComputedRef, type Ref } from "vue";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import { type GatewayEndpoint } from "@/lib/ai-gateway-config";
import { convertFileResource, type FileResource, type Message } from "./types";

interface LuiMessageModuleOptions {
  selectedId: Ref<string | null>;
  messages: Ref<Record<string, Message[]>>;
  fileResources: Ref<Record<string, FileResource[]>>;
  selectedAgentId: Ref<string | null>;
  selectedModelId: Ref<string | null>;
  selectedModelProvider: Ref<string | null>;
  temperature: Ref<number>;
  customEndpoints: Ref<GatewayEndpoint[]>;
  customModelName: Ref<string>;
}

export interface LuiMessageModule {
  currentMessages: ComputedRef<Message[]>;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
}

export function createLuiMessageModule(options: LuiMessageModuleOptions): LuiMessageModule {
  const {
    selectedId,
    messages,
    fileResources,
    selectedAgentId,
    selectedModelId,
    selectedModelProvider,
    temperature,
    customEndpoints,
    customModelName,
  } = options;
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
    const selectedModelIdValue = selectedModelId.value;
    const selectedModelProviderValue = selectedModelProvider.value;

    if (!selectedModelIdValue || !selectedModelProviderValue) {
      throw new Error("请先选择模型后再发送消息");
    }

    const manualModelSelected = selectedModelIdValue.endsWith("::__manual__");
    if (manualModelSelected && !customModelName.value.trim()) {
      throw new Error("请输入手动模型名称后再发送消息");
    }

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
      const requestPayload = {
        content,
        agentId: selectedAgentId.value ?? undefined,
        modelProvider: selectedModelProviderValue,
        modelId: selectedModelIdValue,
        customModelName: customModelName.value || undefined,
        endpointBaseURL: (() => {
          if (!selectedModelProviderValue.startsWith("gateway:")) {
            return undefined;
          }
          const endpointId = selectedModelProviderValue.slice("gateway:".length);
          return customEndpoints.value.find((item) => item.id === endpointId)?.baseURL;
        })(),
        endpointApiKey: (() => {
          if (!selectedModelProviderValue.startsWith("gateway:")) {
            return undefined;
          }
          const endpointId = selectedModelProviderValue.slice("gateway:".length);
          return customEndpoints.value.find((item) => item.id === endpointId)?.apiKey;
        })(),
        temperature: temperature.value,
      };

      const applyAssistantState = (state: {
        content: string;
        reasoning: string | null;
        tools: unknown[] | null;
        status: "streaming" | "complete";
      }) => {
        updateMessage(conversationId, assistantMessage.id, {
          content: state.content,
          reasoning: state.reasoning,
          tools: state.tools,
          status: state.status,
        });
      };

      await luiApi.streamMessage(conversationId, requestPayload, {
        onUpdate(state) {
          applyAssistantState(state);
        },
        onComplete(state) {
          applyAssistantState(state);
        },
        onError(err) {
          updateMessage(conversationId, assistantMessage.id, {
            content: err.message || "消息发送失败",
            status: "error",
          });
        },
      });

      const conversationDetail = await luiApi.get(conversationId);
      fileResources.value[conversationId] = conversationDetail.files.map(convertFileResource);
    } catch (err) {
      notifyError(reportAppError("lui/send-message", err, {
        title: "发送消息失败",
        fallbackMessage: "消息发送失败，请稍后重试",
      }));
      updateMessage(conversationId, assistantMessage.id, {
        status: "error",
        content: "消息发送失败，请重试",
      });
    }
  }

  return {
    currentMessages,
    addMessage,
    updateMessage,
    sendMessage,
  };
}