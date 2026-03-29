import type { LuiGatewayEndpointData } from "@ims/shared";

export type GatewayEndpoint = LuiGatewayEndpointData;

const STORAGE_KEY = "ims:lui:gateway-endpoints";

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
