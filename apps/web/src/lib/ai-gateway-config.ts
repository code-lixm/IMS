export interface GatewayEndpoint {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
  provider: string;
}

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

  const id = sanitizeString(value.id);
  const name = sanitizeString(value.name);
  const baseURL = sanitizeString(value.baseURL);
  const provider = sanitizeString(value.provider);
  const apiKey = sanitizeString(value.apiKey);

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
