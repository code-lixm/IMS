import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ref } from "vue";
import type { GatewayEndpoint } from "@/lib/ai-gateway-config";
import { createLuiModelModule } from "./models";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listModels: vi.fn(),
  updateSettings: vi.fn(),
  notifyError: vi.fn(),
  reportAppError: vi.fn((scope: string, error: unknown, options?: { title?: string; fallbackMessage?: string }) => ({
    title: options?.title ?? scope,
    message: options?.fallbackMessage ?? (error instanceof Error ? error.message : String(error)),
  })),
}));

vi.mock("@/api/lui", () => ({
  luiApi: {
    getSettings: mocks.getSettings,
    listModels: mocks.listModels,
    updateSettings: mocks.updateSettings,
  },
}));

vi.mock("@/composables/use-app-notifications", () => ({
  useAppNotifications: () => ({
    notifyError: mocks.notifyError,
  }),
}));

vi.mock("@/lib/errors/normalize", () => ({
  reportAppError: mocks.reportAppError,
}));

function makeEndpoint(overrides: Partial<GatewayEndpoint> = {}): GatewayEndpoint {
  return {
    id: "legacy",
    name: "Legacy",
    baseURL: "https://gateway.example.com/v1",
    provider: "custom",
    ...overrides,
  };
}

function makeProvider(id: string, modelIds: string[]) {
  return {
    id,
    name: id,
    icon: id,
    models: modelIds.map((modelId) => ({
      id: modelId,
      provider: id,
      name: modelId,
      displayName: modelId,
      maxTokens: 128000,
      supportsStreaming: true,
      supportsTools: true,
      requiresAuth: false,
    })),
  };
}

function createModuleState(options?: {
  selectedId?: string | null;
  selectedProviderId?: string | null;
}) {
  const providers = ref([]);
  const customEndpoints = ref<GatewayEndpoint[]>([]);
  const defaultEndpointId = ref<string | null>(null);
  const selectedId = ref<string | null>(options?.selectedId ?? null);
  const selectedProviderId = ref<string | null>(options?.selectedProviderId ?? null);
  const isLoading = ref(false);

  return {
    providers,
    customEndpoints,
    defaultEndpointId,
    selectedId,
    selectedProviderId,
    isLoading,
    module: createLuiModelModule({
      providers,
      customEndpoints,
      defaultEndpointId,
      selectedId,
      selectedProviderId,
      isLoading,
    }),
  };
}

describe("createLuiModelModule", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.getSettings.mockReset();
    mocks.listModels.mockReset();
    mocks.updateSettings.mockReset();
    mocks.notifyError.mockReset();
    mocks.reportAppError.mockClear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  test("registers first provider endpoint as default and prefers its configured model", async () => {
    const savedEndpoint = makeEndpoint({
      id: "openai",
      name: "openai",
      baseURL: "",
      provider: "openai",
      providerId: "openai",
      apiKey: "sk-test",
      modelId: "gpt-4.1",
    });

    mocks.updateSettings.mockResolvedValue({
      customEndpoints: [savedEndpoint],
      defaultEndpointId: "openai",
    });
    mocks.getSettings.mockResolvedValue({
      customEndpoints: [savedEndpoint],
      defaultEndpointId: "openai",
    });
    mocks.listModels.mockResolvedValue({
      providers: [makeProvider("openai", ["gpt-4.1", "gpt-4o-mini"])],
    });

    const state = createModuleState();

    await state.module.registerCustomEndpoint({
      id: "ignored",
      name: "ignored",
      baseURL: "ignored",
      provider: "ignored",
      providerId: " openai ",
      apiKey: " sk-test ",
      modelId: " gpt-4.1 ",
    });

    expect(mocks.updateSettings).toHaveBeenCalledWith({
      customEndpoints: [savedEndpoint],
      defaultEndpointId: "openai",
    });
    expect(mocks.listModels).toHaveBeenCalledWith({
      providerId: "openai",
      apiKey: "sk-test",
    });
    expect(state.defaultEndpointId.value).toBe("openai");
    expect(state.customEndpoints.value).toEqual([savedEndpoint]);
    expect(state.selectedId.value).toBe("gpt-4.1");
    expect(state.selectedProviderId.value).toBe("openai");
    expect(window.localStorage.getItem("ims:lui:default-gateway-endpoint")).toBe("openai");
  });

  test("falls back to cached gateway settings when server settings request fails", async () => {
    const cachedEndpoint = makeEndpoint({
      id: "openai",
      name: "openai",
      baseURL: "",
      provider: "openai",
      providerId: "openai",
      apiKey: "sk-local",
      modelId: "gpt-4o-mini",
    });
    window.localStorage.setItem("ims:lui:gateway-endpoints", JSON.stringify([cachedEndpoint]));
    window.localStorage.setItem("ims:lui:default-gateway-endpoint", "openai");

    mocks.getSettings.mockRejectedValue(new Error("server unavailable"));
    mocks.listModels.mockResolvedValue({
      providers: [makeProvider("openai", ["gpt-4.1", "gpt-4o-mini"])],
    });

    const state = createModuleState();

    await state.module.loadModels();

    expect(mocks.listModels).toHaveBeenCalledWith({
      providerId: "openai",
      apiKey: "sk-local",
    });
    expect(state.customEndpoints.value).toEqual([cachedEndpoint]);
    expect(state.defaultEndpointId.value).toBe("openai");
    expect(state.selectedId.value).toBe("gpt-4o-mini");
    expect(state.selectedProviderId.value).toBe("openai");
  });

  test("removing endpoint rolls back state and storage when persistence fails", async () => {
    const keptEndpoint = makeEndpoint({ id: "kept", name: "Kept", provider: "kept" });
    const removedEndpoint = makeEndpoint({
      id: "remove-me",
      name: "Remove Me",
      provider: "remove-me",
      providerId: "remove-me",
      baseURL: "",
    });
    const normalizedRemovedEndpoint = {
      ...removedEndpoint,
      name: "remove-me",
    };

    window.localStorage.setItem("ims:lui:gateway-endpoints", JSON.stringify([removedEndpoint, keptEndpoint]));
    window.localStorage.setItem("ims:lui:default-gateway-endpoint", "remove-me");

    mocks.updateSettings.mockRejectedValue(new Error("save failed"));

    const state = createModuleState({
      selectedId: "model_1",
      selectedProviderId: "gateway:remove-me",
    });

    await expect(state.module.removeCustomEndpoint("remove-me")).rejects.toThrow("save failed");

    expect(state.customEndpoints.value).toEqual([normalizedRemovedEndpoint, keptEndpoint]);
    expect(state.defaultEndpointId.value).toBe("remove-me");
    expect(state.selectedId.value).toBe("model_1");
    expect(state.selectedProviderId.value).toBe("gateway:remove-me");
    expect(JSON.parse(window.localStorage.getItem("ims:lui:gateway-endpoints") ?? "[]")).toEqual([
      normalizedRemovedEndpoint,
      keptEndpoint,
    ]);
    expect(window.localStorage.getItem("ims:lui:default-gateway-endpoint")).toBe("remove-me");
    expect(mocks.notifyError).toHaveBeenCalledTimes(1);
  });
});
