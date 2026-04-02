import type { LuiGatewayEndpointData } from "@ims/shared";

export type GatewayEndpoint = LuiGatewayEndpointData;

const STORAGE_KEY = "ims:lui:gateway-endpoints";
const DEFAULT_ENDPOINT_STORAGE_KEY = "ims:lui:default-gateway-endpoint";

export const PRESET_PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  minimax: "https://api.minimax.chat/v1",
  moonshot: "https://api.moonshot.cn/v1",
  deepseek: "https://api.deepseek.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  siliconflow: "https://api.siliconflow.cn/v1",
  openrouter: "https://openrouter.ai/api/v1",
  grok: "https://api.x.ai/v1",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEndpoint(value: unknown): GatewayEndpoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const providerId = sanitizeString(value.providerId);
  const apiKey = sanitizeString(value.apiKey);

  // 如果提供了 providerId，使用简化配置模式
  if (providerId) {
    return {
      id: providerId,
      name: providerId,
      baseURL: "",
      provider: providerId,
      providerId,
      ...(apiKey ? { apiKey } : {}),
    };
  }

  // 传统模式：需要手动填写所有字段
  const id = sanitizeString(value.id);
  const name = sanitizeString(value.name);
  const baseURL = sanitizeString(value.baseURL);
  const provider = sanitizeString(value.provider);

  if (!id || !name || !baseURL || !provider) {
    return null;
  }

  return {
    id,
    name,
    baseURL,
    provider,
    ...(apiKey ? { apiKey } : {}),
  };
}

export function loadGatewayEndpointsFromStorage(): GatewayEndpoint[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeEndpoint)
      .filter((endpoint): endpoint is GatewayEndpoint => endpoint !== null);
  } catch {
    return [];
  }
}

export function saveGatewayEndpointsToStorage(endpoints: GatewayEndpoint[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(endpoints));
}

export function loadDefaultGatewayEndpointIdFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(DEFAULT_ENDPOINT_STORAGE_KEY)?.trim();
  return value || null;
}

export function saveDefaultGatewayEndpointIdToStorage(endpointId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!endpointId?.trim()) {
    window.localStorage.removeItem(DEFAULT_ENDPOINT_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(DEFAULT_ENDPOINT_STORAGE_KEY, endpointId.trim());
}

export interface ResolvedGatewayEndpointConfig {
  endpoint: GatewayEndpoint;
  baseURL: string;
  apiKey: string;
}

export function resolveGatewayEndpointConfig(endpoint: GatewayEndpoint): ResolvedGatewayEndpointConfig | null {
  if (endpoint.providerId) {
    const baseURL = PRESET_PROVIDER_BASE_URLS[endpoint.providerId]?.trim();
    if (!baseURL) {
      return null;
    }

    return {
      endpoint,
      baseURL,
      apiKey: endpoint.apiKey?.trim() ?? "",
    };
  }

  const baseURL = endpoint.baseURL.trim();
  if (!baseURL) {
    return null;
  }

  return {
    endpoint,
    baseURL,
    apiKey: endpoint.apiKey?.trim() ?? "",
  };
}

export function getPreferredGatewayEndpointConfig(): ResolvedGatewayEndpointConfig | null {
  const endpoints = loadGatewayEndpointsFromStorage();
  const defaultEndpointId = loadDefaultGatewayEndpointIdFromStorage();

  if (defaultEndpointId) {
    const defaultEndpoint = endpoints.find((endpoint) => endpoint.id === defaultEndpointId);
    if (defaultEndpoint) {
      const resolvedDefaultEndpoint = resolveGatewayEndpointConfig(defaultEndpoint);
      if (resolvedDefaultEndpoint) {
        return resolvedDefaultEndpoint;
      }
    }
  }

  for (const endpoint of endpoints) {
    const resolved = resolveGatewayEndpointConfig(endpoint);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}
