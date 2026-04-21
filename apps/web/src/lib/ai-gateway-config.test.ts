import { afterEach, describe, expect, test } from "vitest";
import {
  getPreferredGatewayEndpointConfig,
  loadDefaultGatewayEndpointIdFromStorage,
  loadGatewayEndpointsFromStorage,
  resolveGatewayEndpointConfig,
  saveDefaultGatewayEndpointIdToStorage,
  saveGatewayEndpointsToStorage,
} from "./ai-gateway-config";

describe("ai gateway config", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  test("normalizes provider presets from storage", () => {
    window.localStorage.setItem("ims:lui:gateway-endpoints", JSON.stringify([
      {
        providerId: "openai",
        apiKey: "  sk-test  ",
        modelId: "gpt-4.1",
      },
      {
        id: "legacy",
        name: "Legacy",
        baseURL: " https://example.com/v1 ",
        provider: "custom",
      },
    ]));

    expect(loadGatewayEndpointsFromStorage()).toEqual([
      {
        id: "openai",
        name: "openai",
        baseURL: "",
        provider: "openai",
        providerId: "openai",
        apiKey: "sk-test",
        modelId: "gpt-4.1",
      },
      {
        id: "legacy",
        name: "Legacy",
        baseURL: "https://example.com/v1",
        provider: "custom",
      },
    ]);
  });

  test("persists preferred endpoint ids with trim and clear behavior", () => {
    saveDefaultGatewayEndpointIdToStorage("  openai  ");
    expect(loadDefaultGatewayEndpointIdFromStorage()).toBe("openai");

    saveDefaultGatewayEndpointIdToStorage("   ");
    expect(loadDefaultGatewayEndpointIdFromStorage()).toBeNull();
  });

  test("prefers a valid default endpoint and falls back when preset is unsupported", () => {
    saveGatewayEndpointsToStorage([
      {
        id: "broken",
        name: "Broken",
        baseURL: "",
        provider: "custom",
        providerId: "unknown-provider",
      },
      {
        id: "openai",
        name: "OpenAI",
        baseURL: "",
        provider: "openai",
        providerId: "openai",
        apiKey: "sk-123",
      },
    ]);
    saveDefaultGatewayEndpointIdToStorage("broken");

    expect(resolveGatewayEndpointConfig({
      id: "openai",
      name: "OpenAI",
      baseURL: "",
      provider: "openai",
      providerId: "openai",
      apiKey: "  sk-123  ",
    })).toEqual({
      endpoint: {
        id: "openai",
        name: "OpenAI",
        baseURL: "",
        provider: "openai",
        providerId: "openai",
        apiKey: "  sk-123  ",
      },
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-123",
    });

    expect(getPreferredGatewayEndpointConfig()).toMatchObject({
      endpoint: expect.objectContaining({ id: "openai" }),
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-123",
    });
  });
});
