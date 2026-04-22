import { beforeEach, describe, expect, test, vi } from "vitest";

const mockSelectChain = {
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => []),
      })),
    })),
    limit: vi.fn(() => []),
  })),
};

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => mockSelectChain),
  },
}));

vi.mock("../schema", () => ({
  remoteUsers: { provider: "provider", updatedAt: "updatedAt" },
  users: { id: "id", tokenStatus: "tokenStatus", lastSyncAt: "lastSyncAt" },
}));

let parseJwtPayload: (token: string) => { exp: number; username: string } | null;
let isGhrTokenExpired: (token: string) => boolean;

beforeEach(async () => {
  vi.clearAllMocks();
  const module = await import("./baobao-http-login");
  parseJwtPayload = module.parseJwtPayload;
  isGhrTokenExpired = module.isGhrTokenExpired;
});

describe("baobao-http-login utilities", () => {
  test("parseJwtPayload returns null for invalid token", () => {
    expect(parseJwtPayload("invalid")).toBeNull();
    expect(parseJwtPayload("")).toBeNull();
    expect(parseJwtPayload("only.two")).toBeNull();
  });

  test("parseJwtPayload parses valid JWT payload", () => {
    const payload = { exp: 1893456000, username: "test" };
    const base64Payload = btoa(JSON.stringify(payload));
    const token = `header.${base64Payload}.signature`;
    const result = parseJwtPayload(token);
    expect(result).toEqual(expect.objectContaining({ exp: 1893456000, username: "test" }));
  });

  test("isGhrTokenExpired returns true for expired token", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    const payload = { exp: pastExp, username: "test" };
    const base64Payload = btoa(JSON.stringify(payload));
    const token = `header.${base64Payload}.signature`;
    expect(isGhrTokenExpired(token)).toBe(true);
  });

  test("isGhrTokenExpired returns false for valid token", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const payload = { exp: futureExp, username: "test" };
    const base64Payload = btoa(JSON.stringify(payload));
    const token = `header.${base64Payload}.signature`;
    expect(isGhrTokenExpired(token)).toBe(false);
  });

  test("isGhrTokenExpired returns true for malformed token", () => {
    expect(isGhrTokenExpired("invalid")).toBe(true);
    expect(isGhrTokenExpired("")).toBe(true);
  });
});

describe("restorePersistedHttpAuth edge cases", () => {
  test("returns null when persisted token is expired and recovery fails", async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    const payload = { exp: pastExp, username: "test" };
    const expiredToken = `header.${btoa(JSON.stringify(payload))}.signature`;

    const mockLimit = vi.fn(() => [{
      id: "1",
      provider: "baobao",
      token: expiredToken,
      cookieJson: JSON.stringify([{ name: "session", value: "old", domain: ".getui.com", path: "/", expires: 0, httpOnly: false, secure: true, sameSite: "None" }]),
      updatedAt: new Date(),
    }]);

    mockSelectChain.from.mockReturnValueOnce({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: mockLimit,
        })),
      })),
      limit: vi.fn(() => []),
    });

    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ errno: 1, errcode: "FAIL", errmsg: "auth failed", data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;

    vi.stubGlobal("fetch", mockFetch);

    try {
      const module = await import("./baobao-http-login");
      const result = await module.restorePersistedHttpAuth();
      expect(result).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
