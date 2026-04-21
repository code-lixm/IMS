import type { Page, Route } from "@playwright/test";

const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
};

interface MockModelConfig {
  id: string;
  provider: string;
  name: string;
  displayName: string;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  requiresAuth: boolean;
}

interface MockModelProvider {
  id: string;
  name: string;
  icon: string;
  models: MockModelConfig[];
}

interface MockPresetProvider {
  id: string;
  name: string;
  icon: string;
}

interface MockGatewayEndpoint {
  id: string;
  name: string;
  baseURL: string;
  provider: string;
  apiKey?: string;
  providerId?: string;
  modelId?: string;
  modelDisplayName?: string;
}

interface MockConversation {
  id: string;
  title: string;
  candidateId: string | null;
  agentId: string | null;
  agentResolution?: {
    requestedAgentId: string | null;
    resolvedAgentId: string | null;
    fallbackAgentId: string | null;
    fallbackAgentName: string | null;
    missing: boolean;
    message: string | null;
  };
  modelProvider: string | null;
  modelId: string | null;
  temperature: number;
  createdAt: number;
  updatedAt: number;
}

interface MockConversationDetail {
  conversation: MockConversation;
  messages: Array<Record<string, unknown>>;
  files: Array<Record<string, unknown>>;
  workflow: Record<string, unknown> | null;
}

interface MockAgent {
  id: string;
  agentId: string;
  name: string;
  displayName: string;
  description: string | null;
  engine: "builtin" | "deepagents";
  mode: "all" | "chat" | "ask" | "workflow";
  temperature: number;
  systemPrompt: string | null;
  tools: string[];
  sourceType: "builtin" | "custom" | "imported";
  isBuiltin: boolean;
  isMutable: boolean;
  isDefault: boolean;
  sceneAffinity: "general" | "interview";
  createdAt: number;
  updatedAt: number;
}

interface MockLuiGatewayOptions {
  settings?: {
    customEndpoints: MockGatewayEndpoint[];
    defaultEndpointId: string | null;
  };
  presetProviders?: MockPresetProvider[];
  modelProviders?: MockModelProvider[];
  emptyModelProviderIds?: string[];
  agents?: MockAgent[];
  conversations?: MockConversation[];
  conversationDetails?: Record<string, MockConversationDetail>;
  importBatches?: { items: Array<Record<string, unknown>> };
}

export interface LuiGatewayMockState {
  settingsUpdates: Array<Record<string, unknown>>;
  modelRequests: Array<Record<string, unknown>>;
  createdConversations: Array<Record<string, unknown>>;
  sentMessages: Array<Record<string, unknown>>;
  exportRequests: Array<Record<string, unknown>>;
}

const now = Date.now();

const defaultPresetProviders: MockPresetProvider[] = [
  { id: "openai", name: "OpenAI", icon: "openai" },
  { id: "anthropic", name: "Anthropic", icon: "anthropic" },
  { id: "minimax", name: "MiniMax", icon: "sparkles" },
  { id: "moonshot", name: "Moonshot", icon: "moon" },
  { id: "deepseek", name: "DeepSeek", icon: "bot" },
  { id: "gemini", name: "Gemini", icon: "gem" },
  { id: "siliconflow", name: "SiliconFlow", icon: "cpu" },
  { id: "openrouter", name: "OpenRouter", icon: "router" },
  { id: "grok", name: "Grok", icon: "brain" },
];

const defaultModelProviders: MockModelProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "openai",
    models: [
      {
        id: "gpt-4.1-mini",
        provider: "openai",
        name: "gpt-4.1-mini",
        displayName: "GPT-4.1 Mini",
        maxTokens: 128000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
      },
      {
        id: "gpt-4.1",
        provider: "openai",
        name: "gpt-4.1",
        displayName: "GPT-4.1",
        maxTokens: 128000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
      },
    ],
  },
];

const defaultAgents: MockAgent[] = [
  {
    id: "agent-default",
    agentId: "agent-default",
    name: "default-agent",
    displayName: "默认助手",
    description: "默认测试智能体",
    engine: "builtin",
    mode: "chat",
    temperature: 0.5,
    systemPrompt: "You are a helpful assistant.",
    tools: [],
    sourceType: "builtin",
    isBuiltin: true,
    isMutable: false,
    isDefault: true,
    sceneAffinity: "general",
    createdAt: now,
    updatedAt: now,
  },
];

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      success: true,
      data: body,
    }),
  });
}

function buildConversation(id: string): MockConversation {
  return {
    id,
    title: "新会话",
    candidateId: null,
    agentId: "agent-default",
    agentResolution: {
      requestedAgentId: "agent-default",
      resolvedAgentId: "agent-default",
      fallbackAgentId: null,
      fallbackAgentName: null,
      missing: false,
      message: null,
    },
    modelProvider: "openai",
    modelId: "gpt-4.1-mini",
    temperature: 0.5,
    createdAt: now,
    updatedAt: now,
  };
}

export async function mockLuiGatewayApp(page: Page, options: MockLuiGatewayOptions = {}): Promise<LuiGatewayMockState> {
  const state: LuiGatewayMockState = {
    settingsUpdates: [],
    modelRequests: [],
    createdConversations: [],
    sentMessages: [],
    exportRequests: [],
  };

  let currentSettings = options.settings ?? {
    customEndpoints: [],
    defaultEndpointId: null,
  };

  const presetProviders = options.presetProviders ?? defaultPresetProviders;
  const modelProviders = options.modelProviders ?? defaultModelProviders;
  const emptyModelProviderIds = new Set(options.emptyModelProviderIds ?? []);
  const agents = options.agents ?? defaultAgents;
  const conversations = options.conversations ?? [];
  const conversationDetails = options.conversationDetails ?? {};
  const importBatches = options.importBatches ?? { items: [] };

  await page.route("**/api/auth/status", (route) =>
    fulfillJson(route, {
      status: "valid",
      user: {
        id: "user-1",
        name: "测试用户",
        email: "tester@example.com",
      },
      lastValidatedAt: Date.now(),
    }),
  );

  await page.route("**/api/sync/status", (route) =>
    fulfillJson(route, {
      enabled: false,
      intervalMs: 5000,
      lastSyncAt: null,
      lastError: null,
    }),
  );

  await page.route("**/api/import/batches", (route) => fulfillJson(route, importBatches));

  await page.route("**/api/screening/export", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    state.exportRequests.push(payload);
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/octet-stream",
        "content-disposition": "attachment; filename*=UTF-8''mock-export.txt",
      },
      body: "mock export content",
    });
  });

  await page.route("**/api/lui/providers", (route) =>
    fulfillJson(route, {
      providers: presetProviders,
    }),
  );

  await page.route("**/api/lui/agents", (route) =>
    fulfillJson(route, {
      items: agents,
    }),
  );

  await page.route(/\/api\/lui\/credentials\/[^/]+\/status(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      provider: route.request().url().split("/").slice(-2)[0] ?? "unknown",
      isAuthorized: true,
    }),
  );

  await page.route("**/api/lui/settings", async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      state.settingsUpdates.push(payload);
      currentSettings = {
        customEndpoints: Array.isArray(payload.customEndpoints)
          ? (payload.customEndpoints as MockGatewayEndpoint[])
          : [],
        defaultEndpointId:
          typeof payload.defaultEndpointId === "string" || payload.defaultEndpointId === null
            ? (payload.defaultEndpointId as string | null)
            : null,
      };
      await fulfillJson(route, currentSettings);
      return;
    }

    await fulfillJson(route, currentSettings);
  });

  await page.route("**/api/lui/models", async (route) => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      state.modelRequests.push(payload);

      const requestedProviderId =
        typeof payload.providerId === "string"
          ? payload.providerId
          : typeof payload.provider === "string"
            ? payload.provider
            : null;

      if (requestedProviderId && emptyModelProviderIds.has(requestedProviderId)) {
        await fulfillJson(route, { providers: [] });
        return;
      }

      const matchedProviders = requestedProviderId
        ? modelProviders.filter((provider) => provider.id === requestedProviderId)
        : modelProviders;

      await fulfillJson(route, {
        providers: matchedProviders,
      });
      return;
    }

    await fulfillJson(route, {
      providers: modelProviders,
    });
  });

  await page.route(/\/api\/lui\/conversations\/[^/]+\/messages(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const payload = route.request().postDataJSON() as Record<string, unknown>;
    state.sentMessages.push(payload);

    const conversationId = route.request().url().split("/").slice(-2)[0] ?? "conversation-1";
    await fulfillJson(route, {
      id: `message-${state.sentMessages.length}`,
      conversationId,
      role: "assistant",
      content: "测试回复",
      reasoning: null,
      workflowAction: null,
      tools: [],
      status: "complete",
      createdAt: Date.now(),
    });
  });

  await page.route(/\/api\/lui\/conversations\/[^/]+(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    const conversationId = route.request().url().split("/").pop()?.split("?")[0] ?? "conversation-1";
    const detail = conversationDetails[conversationId] ?? {
      conversation: buildConversation(conversationId),
      messages: [],
      files: [],
      workflow: null,
    };

    await fulfillJson(route, detail);
  });

  await page.route("**/api/lui/conversations", async (route) => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      state.createdConversations.push(payload);
      await fulfillJson(route, buildConversation(`conversation-${state.createdConversations.length}`));
      return;
    }

    await fulfillJson(route, {
      items: conversations,
    });
  });

  return state;
}
