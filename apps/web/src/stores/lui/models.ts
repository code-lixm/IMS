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
  selectedProviderId: Ref<string | null>;
  isLoading: Ref<boolean>;
}

export interface LuiModelModule {
  customEndpoints: Ref<GatewayEndpoint[]>;
  models: ComputedRef<ModelConfig[]>;
  selectedModel: ComputedRef<ModelConfig | undefined>;
  getModelById: (id: string) => ModelConfig | undefined;
  loadModels: () => Promise<void>;
  registerCustomEndpoint: (endpoint: GatewayEndpoint) => Promise<void>;
  updateCustomEndpoint: (originalId: string, endpoint: GatewayEndpoint) => Promise<void>;
  removeCustomEndpoint: (endpointId: string) => Promise<void>;
  testCustomEndpoint: (endpoint: GatewayEndpoint) => Promise<{ providerCount: number; modelCount: number }>;
  selectModel: (id: string | null) => void;
}

export function createLuiModelModule(options: LuiModelModuleOptions): LuiModelModule {
  const { providers, customEndpoints, selectedId, selectedProviderId, isLoading } = options;
  const { notifyError } = useAppNotifications();
  let baseProviders: ModelProvider[] = [];

  function toCustomProviderId(endpointId: string): string {
    return `gateway:${endpointId}`;
  }

  function syncProviders() {
    providers.value = [...baseProviders];
  }

  function normalizeEndpoint(endpoint: GatewayEndpoint): GatewayEndpoint {
    // 如果提供了 providerId，使用简化配置模式
    if (endpoint.providerId) {
      return {
        id: endpoint.providerId.trim(),
        name: endpoint.providerId.trim(),
        baseURL: "",
        provider: endpoint.providerId.trim(),
        providerId: endpoint.providerId.trim(),
        ...(endpoint.apiKey?.trim() ? { apiKey: endpoint.apiKey.trim() } : {}),
      };
    }

    // 传统模式：需要手动填写所有字段
    return {
      id: endpoint.id.trim(),
      name: endpoint.name.trim(),
      baseURL: endpoint.baseURL.trim(),
      provider: endpoint.provider.trim(),
      ...(endpoint.apiKey?.trim() ? { apiKey: endpoint.apiKey.trim() } : {}),
    };
  }

  async function persistCustomEndpoints(nextEndpoints: GatewayEndpoint[]): Promise<GatewayEndpoint[]> {
    const normalizedEndpoints = nextEndpoints.map(normalizeEndpoint);
    saveGatewayEndpointsToStorage(normalizedEndpoints);

    const response = await luiApi.updateSettings({
      customEndpoints: normalizedEndpoints,
    });

    saveGatewayEndpointsToStorage(response.customEndpoints);
    return response.customEndpoints;
  }

  async function registerCustomEndpoint(endpoint: GatewayEndpoint) {
    const normalized = normalizeEndpoint(endpoint);

    // 简化配置模式：只需要 providerId
    if (normalized.providerId) {
      // 简化模式下验证通过
    } else if (!normalized.id || !normalized.name || !normalized.baseURL || !normalized.provider) {
      return;
    }

    const previousEndpoints = [...customEndpoints.value];
    const nextEndpoints = [...customEndpoints.value];
    const index = nextEndpoints.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      nextEndpoints[index] = normalized;
    } else {
      nextEndpoints.push(normalized);
    }

    customEndpoints.value = nextEndpoints;
    saveGatewayEndpointsToStorage(customEndpoints.value);

    try {
      customEndpoints.value = await persistCustomEndpoints(nextEndpoints);
      await loadModels();
    } catch (err) {
      customEndpoints.value = previousEndpoints;
      saveGatewayEndpointsToStorage(previousEndpoints);
      notifyError(reportAppError("lui/save-custom-endpoints", err, {
        title: "保存 AI Gateway 端点失败",
        fallbackMessage: "自定义端点未能写入本地服务",
      }));
      throw err;
    }
  }

  async function updateCustomEndpoint(originalId: string, endpoint: GatewayEndpoint) {
    const normalizedOriginalId = originalId.trim();
    const normalized = normalizeEndpoint(endpoint);

    // 验证：简化配置模式只需要 providerId，传统模式需要完整字段
    const isValid = normalized.providerId
      ? !!normalizedOriginalId
      : (!!normalizedOriginalId && !!normalized.id && !!normalized.name && !!normalized.baseURL && !!normalized.provider);
    if (!isValid) {
      return;
    }

    const originalIndex = customEndpoints.value.findIndex((item) => item.id === normalizedOriginalId);
    if (originalIndex < 0) {
      throw new Error("要修改的端点不存在");
    }

    const duplicateIndex = customEndpoints.value.findIndex((item) => item.id === normalized.id);
    if (duplicateIndex >= 0 && duplicateIndex !== originalIndex) {
      throw new Error("端点 ID 已存在，请使用其他 ID");
    }

    const previousEndpoints = [...customEndpoints.value];
    const nextEndpoints = [...customEndpoints.value];
    nextEndpoints[originalIndex] = normalized;

    const previousSelectedProviderId = selectedProviderId.value;
    const previousSelectedId = selectedId.value;
    const shouldRewriteSelection = previousSelectedProviderId === toCustomProviderId(normalizedOriginalId);
    if (shouldRewriteSelection) {
      selectedProviderId.value = toCustomProviderId(normalized.id);
      selectedId.value = null;
    }

    customEndpoints.value = nextEndpoints;
    saveGatewayEndpointsToStorage(customEndpoints.value);

    try {
      customEndpoints.value = await persistCustomEndpoints(nextEndpoints);
      await loadModels();
    } catch (err) {
      customEndpoints.value = previousEndpoints;
      saveGatewayEndpointsToStorage(previousEndpoints);
      selectedProviderId.value = previousSelectedProviderId;
      selectedId.value = previousSelectedId;
      notifyError(reportAppError("lui/update-custom-endpoint", err, {
        title: "更新 AI Gateway 端点失败",
        fallbackMessage: "自定义端点未能保存到本地服务",
      }));
      throw err;
    }
  }

  async function removeCustomEndpoint(endpointId: string) {
    const normalizedEndpointId = endpointId.trim();
    if (!normalizedEndpointId) {
      return;
    }

    const nextEndpoints = customEndpoints.value.filter((item) => item.id !== normalizedEndpointId);
    if (nextEndpoints.length === customEndpoints.value.length) {
      return;
    }

    const previousEndpoints = [...customEndpoints.value];
    customEndpoints.value = nextEndpoints;
    saveGatewayEndpointsToStorage(customEndpoints.value);

    const shouldResetSelection = selectedProviderId.value === toCustomProviderId(normalizedEndpointId);
    const previousSelectedProviderId = selectedProviderId.value;
    const previousSelectedId = selectedId.value;
    if (shouldResetSelection) {
      selectedProviderId.value = null;
      selectedId.value = null;
    }

    try {
      customEndpoints.value = await persistCustomEndpoints(nextEndpoints);
      await loadModels();
    } catch (err) {
      customEndpoints.value = previousEndpoints;
      saveGatewayEndpointsToStorage(previousEndpoints);
      selectedProviderId.value = previousSelectedProviderId;
      selectedId.value = previousSelectedId;
      notifyError(reportAppError("lui/remove-custom-endpoint", err, {
        title: "删除 AI Gateway 端点失败",
        fallbackMessage: "自定义端点未能从本地服务删除",
      }));
      throw err;
    }
  }

  async function testCustomEndpoint(endpoint: GatewayEndpoint) {
    const normalized = normalizeEndpoint(endpoint);

    // 简化配置模式：只需要 providerId 和 apiKey
    if (normalized.providerId) {
      const data = await luiApi.listModels({
        providerId: normalized.providerId,
        apiKey: normalized.apiKey,
        strict: true,
      });

      return {
        providerCount: data.providers.length,
        modelCount: data.providers.reduce((count, provider) => count + provider.models.length, 0),
      };
    }

    // 传统模式：需要完整字段
    if (!normalized.id || !normalized.name || !normalized.baseURL || !normalized.provider) {
      throw new Error("请完整填写端点 ID、名称、Provider 和 Base URL");
    }

    const data = await luiApi.listModels({
      baseURL: normalized.baseURL,
      apiKey: normalized.apiKey,
      provider: normalized.provider,
      strict: true,
    });

    return {
      providerCount: data.providers.length,
      modelCount: data.providers.reduce((count, provider) => count + provider.models.length, 0),
    };
  }

  customEndpoints.value = loadGatewayEndpointsFromStorage();
  syncProviders();

  const models = computed(() =>
    providers.value.flatMap((provider) => provider.models)
  );

  const selectedModel = computed(() => {
    if (!selectedId.value) {
      return undefined;
    }
    if (selectedProviderId.value) {
      return models.value.find((model) => model.id === selectedId.value && model.provider === selectedProviderId.value);
    }
    return models.value.find((model) => model.id === selectedId.value);
  });

  function getModelById(id: string): ModelConfig | undefined {
    return models.value.find((model) => model.id === id);
  }

  async function loadModels() {
    isLoading.value = true;

    try {
      try {
        const settings = await luiApi.getSettings();
        if (settings.customEndpoints.length > 0) {
          // 后端有配置，使用后端的配置
          customEndpoints.value = settings.customEndpoints;
          saveGatewayEndpointsToStorage(settings.customEndpoints);
        } else {
          // 后端无配置，回退到 localStorage
          customEndpoints.value = loadGatewayEndpointsFromStorage();
        }
      } catch {
        // 后端请求失败，回退到 localStorage
        customEndpoints.value = loadGatewayEndpointsFromStorage();
      }

      if (customEndpoints.value.length > 0) {
        const allProviders: ModelProvider[] = [];

        for (const endpoint of customEndpoints.value) {
          try {
            // 支持 providerId 简化配置模式
            // 传统端点只发送 baseURL，不要发送 providerId，否则后端会返回所有预设提供商
            const listModelsParams = endpoint.providerId
              ? { providerId: endpoint.providerId, apiKey: endpoint.apiKey }
              : {
                  baseURL: endpoint.baseURL,
                  apiKey: endpoint.apiKey,
                  provider: endpoint.provider,
                };
            const data = await luiApi.listModels(listModelsParams);

            allProviders.push(...data.providers);
          } catch (err) {
            console.error(`[loadModels] Failed to fetch models from ${endpoint.name}:`, err);
          }
        }

        baseProviders = allProviders;
      } else {
        const data = await luiApi.listModels();
        baseProviders = data.providers;
      }
    } catch (err) {
      notifyError(reportAppError("lui/load-models", err, {
        title: "加载模型列表失败",
        fallbackMessage: "暂时无法获取模型列表",
      }));
      baseProviders = [];
    } finally {
      syncProviders();
    }

    try {
      if (!selectedId.value && models.value[0]) {
        selectedId.value = models.value[0].id;
        selectedProviderId.value = models.value[0].provider;
      }
    } finally {
      isLoading.value = false;
    }
  }

  function selectModel(id: string | null) {
    selectedId.value = id;
    const model = id ? getModelById(id) : undefined;
    selectedProviderId.value = model?.provider ?? null;
  }

  return {
    customEndpoints,
    models,
    selectedModel,
    getModelById,
    loadModels,
    registerCustomEndpoint,
    updateCustomEndpoint,
    removeCustomEndpoint,
    testCustomEndpoint,
    selectModel,
  };
}
