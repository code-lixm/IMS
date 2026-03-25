import { computed, type ComputedRef, type Ref } from "vue";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import {
  loadGatewayEndpointsFromStorage,
  saveGatewayEndpointsToStorage,
  type GatewayEndpoint,
} from "@/lib/ai-gateway-config";
import type { ModelConfig, ModelProvider } from "./types";

interface LuiModelModuleOptions {
  providers: Ref<ModelProvider[]>;
  customEndpoints: Ref<GatewayEndpoint[]>;
  selectedId: Ref<string | null>;
  isLoading: Ref<boolean>;
}

export interface LuiModelModule {
  customEndpoints: Ref<GatewayEndpoint[]>;
  models: ComputedRef<ModelConfig[]>;
  selectedModel: ComputedRef<ModelConfig | undefined>;
  getModelById: (id: string) => ModelConfig | undefined;
  loadModels: () => Promise<void>;
  registerCustomEndpoint: (endpoint: GatewayEndpoint) => void;
  removeCustomEndpoint: (endpointId: string) => void;
  selectModel: (id: string | null) => void;
}

// 预置模型配置
const DEFAULT_PROVIDERS: ModelProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "OpenAI",
    models: [
      {
        id: "gpt-4o",
        provider: "openai",
        name: "gpt-4o",
        displayName: "GPT-4o",
        maxTokens: 128000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
      },
      {
        id: "gpt-4o-mini",
        provider: "openai",
        name: "gpt-4o-mini",
        displayName: "GPT-4o Mini",
        maxTokens: 128000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
      },
      {
        id: "gpt-4-turbo",
        provider: "openai",
        name: "gpt-4-turbo",
        displayName: "GPT-4 Turbo",
        maxTokens: 128000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "Anthropic",
    models: [
      {
        id: "claude-3-5-sonnet",
        provider: "anthropic",
        name: "claude-3-5-sonnet-20241022",
        displayName: "Claude 3.5 Sonnet",
        maxTokens: 200000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
      },
      {
        id: "claude-3-opus",
        provider: "anthropic",
        name: "claude-3-opus-20240229",
        displayName: "Claude 3 Opus",
        maxTokens: 200000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
      },
    ],
  },
  {
    id: "google",
    name: "Google",
    icon: "Google",
    models: [
      {
        id: "gemini-1.5-pro",
        provider: "google",
        name: "gemini-1.5-pro",
        displayName: "Gemini 1.5 Pro",
        maxTokens: 2000000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
      },
      {
        id: "gemini-1.5-flash",
        provider: "google",
        name: "gemini-1.5-flash",
        displayName: "Gemini 1.5 Flash",
        maxTokens: 1000000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
      },
    ],
  },
];

export function createLuiModelModule(options: LuiModelModuleOptions): LuiModelModule {
  const { providers, customEndpoints, selectedId, isLoading } = options;
  const { notifyError } = useAppNotifications();
  let baseProviders: ModelProvider[] = DEFAULT_PROVIDERS;

  function toCustomProviderId(endpointId: string): string {
    return `gateway:${endpointId}`;
  }

  function toCustomModel(endpoint: GatewayEndpoint): ModelConfig {
    const customModelId = toCustomProviderId(endpoint.id);
    return {
      id: customModelId,
      provider: endpoint.provider,
      name: endpoint.id,
      displayName: endpoint.name,
      maxTokens: 128000,
      supportsStreaming: true,
      supportsTools: true,
      requiresAuth: !endpoint.apiKey,
    };
  }

  function toCustomProvider(endpoint: GatewayEndpoint): ModelProvider {
    return {
      id: toCustomProviderId(endpoint.id),
      name: `${endpoint.name} (Gateway)`,
      icon: "Gateway",
      models: [toCustomModel(endpoint)],
    };
  }

  function syncProviders() {
    const customProviders = customEndpoints.value.map(toCustomProvider);
    providers.value = [...baseProviders, ...customProviders];
  }

  function registerCustomEndpoint(endpoint: GatewayEndpoint) {
    const normalized: GatewayEndpoint = {
      id: endpoint.id.trim(),
      name: endpoint.name.trim(),
      baseURL: endpoint.baseURL.trim(),
      provider: endpoint.provider.trim(),
      ...(endpoint.apiKey?.trim() ? { apiKey: endpoint.apiKey.trim() } : {}),
    };

    if (!normalized.id || !normalized.name || !normalized.baseURL || !normalized.provider) {
      return;
    }

    const index = customEndpoints.value.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      customEndpoints.value[index] = normalized;
    } else {
      customEndpoints.value.push(normalized);
    }

    saveGatewayEndpointsToStorage(customEndpoints.value);
    syncProviders();
  }

  function removeCustomEndpoint(endpointId: string) {
    const normalizedEndpointId = endpointId.trim();
    if (!normalizedEndpointId) {
      return;
    }

    const nextEndpoints = customEndpoints.value.filter((item) => item.id !== normalizedEndpointId);
    if (nextEndpoints.length === customEndpoints.value.length) {
      return;
    }

    customEndpoints.value = nextEndpoints;
    saveGatewayEndpointsToStorage(customEndpoints.value);
    syncProviders();
  }

  customEndpoints.value = loadGatewayEndpointsFromStorage();
  syncProviders();

  const models = computed(() =>
    providers.value.flatMap((provider) => provider.models)
  );

  const selectedModel = computed(() =>
    models.value.find((model) => model.id === selectedId.value)
  );

  function getModelById(id: string): ModelConfig | undefined {
    return models.value.find((model) => model.id === id);
  }

  async function loadModels() {
    isLoading.value = true;

    try {
      const data = await luiApi.listModels();
      baseProviders = data.providers;
    } catch (err) {
      notifyError(reportAppError("lui/load-models", err, {
        title: "加载模型列表失败",
        fallbackMessage: "暂时无法获取模型列表，已使用本地默认模型",
      }));
      baseProviders = DEFAULT_PROVIDERS;
    } finally {
      syncProviders();
    }

    try {
      if (!selectedId.value && models.value[0]) {
        selectedId.value = models.value[0].id;
      }
    } finally {
      isLoading.value = false;
    }
  }

  function selectModel(id: string | null) {
    selectedId.value = id;
  }

  return {
    customEndpoints,
    models,
    selectedModel,
    getModelById,
    loadModels,
    registerCustomEndpoint,
    removeCustomEndpoint,
    selectModel,
  };
}
