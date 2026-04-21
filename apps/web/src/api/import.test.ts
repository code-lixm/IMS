import { afterEach, describe, expect, test, vi } from "vitest";
import { importApi, IMPORT_SCREENING_EXPORT_LABELS } from "./import";
import { requestStream } from "./client";

vi.mock("./client", () => ({
  api: vi.fn(),
  requestForm: vi.fn(),
  requestStream: vi.fn(),
}));

const mockedRequestStream = vi.mocked(requestStream);

describe("importApi.exportResults", () => {
  afterEach(() => {
    mockedRequestStream.mockReset();
  });

  test("posts export payload and decodes utf-8 filename from content-disposition", async () => {
    mockedRequestStream.mockResolvedValue(
      new Response(new Blob(["bundle"], { type: "application/zip" }), {
        status: 200,
        headers: {
          "content-disposition": "attachment; filename*=UTF-8''%E7%AD%9B%E9%80%89%E7%BB%93%E6%9E%9C.zip",
        },
      }),
    );

    const payload = {
      mode: "custom_bundle" as const,
      batchIds: ["batch_1", "batch_2"],
      selectedTaskIds: ["task_1"],
      scoreMin: 70,
      scoreMax: 90,
      includeReports: true,
    };

    const result = await importApi.exportResults(payload);

    expect(mockedRequestStream).toHaveBeenCalledWith("/api/screening/export", {
      method: "POST",
      json: payload,
    });
    expect(result.fileName).toBe("筛选结果.zip");
    expect(await result.blob.text()).toBe("bundle");
  });

  test("falls back to mode label when response has no filename header", async () => {
    mockedRequestStream.mockResolvedValue(
      new Response(new Blob(["bundle"], { type: "application/zip" }), {
        status: 200,
      }),
    );

    const result = await importApi.exportResults({
      mode: "custom_bundle",
      batchIds: ["batch_9"],
    });

    expect(result.fileName).toBe(`导出-${IMPORT_SCREENING_EXPORT_LABELS.custom_bundle}`);
    expect(await result.blob.text()).toBe("bundle");
  });
});
