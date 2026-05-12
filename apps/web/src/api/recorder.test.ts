import { afterEach, describe, expect, test, vi } from "vitest";
import { recorderApi } from "./recorder";
import { api } from "./client";

vi.mock("./client", () => ({
  api: vi.fn(),
}));

const mockedApi = vi.mocked(api);

afterEach(() => {
  mockedApi.mockReset();
});

describe("recorderApi.list", () => {
  test("calls GET /api/recordings with no options", async () => {
    mockedApi.mockResolvedValue({ items: [], total: 0 });

    const result = await recorderApi.list();

    expect(mockedApi).toHaveBeenCalledWith("/api/recordings", {
      signal: undefined,
    });
    expect(result).toEqual({ items: [], total: 0 });
  });

  test("appends limit and offset query params", async () => {
    mockedApi.mockResolvedValue({ items: [], total: 0 });

    await recorderApi.list({ limit: 10, offset: 20 });

    expect(mockedApi).toHaveBeenCalledWith(
      "/api/recordings?limit=10&offset=20",
      { signal: undefined },
    );
  });

  test("forwards abort signal", async () => {
    const controller = new AbortController();
    mockedApi.mockResolvedValue({ items: [], total: 0 });

    await recorderApi.list(undefined, { signal: controller.signal });

    expect(mockedApi).toHaveBeenCalledWith("/api/recordings", {
      signal: controller.signal,
    });
  });
});

describe("recorderApi.get", () => {
  test("calls GET /api/recordings/:id", async () => {
    mockedApi.mockResolvedValue({
      recording: { id: "rec-1", finalTranscriptText: "hello" },
    });

    const result = await recorderApi.get("rec-1");

    expect(mockedApi).toHaveBeenCalledWith("/api/recordings/rec-1", {
      signal: undefined,
    });
    expect(result.recording.id).toBe("rec-1");
  });
});

describe("recorderApi.saveOrganisedText", () => {
  test("calls PUT /api/recordings/:id/organised-text with payload", async () => {
    mockedApi.mockResolvedValue({
      recording: { id: "rec-1", organisedText: "organized" },
    });

    const result = await recorderApi.saveOrganisedText("rec-1", {
      organisedText: "organized",
    });

    expect(mockedApi).toHaveBeenCalledWith(
      "/api/recordings/rec-1/organised-text",
      { method: "PUT", json: { organisedText: "organized" } },
    );
    expect(result.recording.organisedText).toBe("organized");
  });
});

describe("recorderApi.remove", () => {
  test("calls DELETE /api/recordings/:id", async () => {
    mockedApi.mockResolvedValue({ success: true, deletedId: "rec-1" });

    const result = await recorderApi.remove("rec-1");

    expect(mockedApi).toHaveBeenCalledWith("/api/recordings/rec-1", {
      method: "DELETE",
    });
    expect(result).toEqual({ success: true, deletedId: "rec-1" });
  });
});
