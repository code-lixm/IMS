import { afterEach, describe, expect, test, vi } from "vitest";
import { interviewImportApi } from "./interview-import";
import { api, requestForm } from "./client";

vi.mock("./client", () => ({
  api: vi.fn(),
  requestForm: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedRequestForm = vi.mocked(requestForm);

afterEach(() => {
  mockedApi.mockReset();
  mockedRequestForm.mockReset();
});

// ---------------------------------------------------------------------------
// listBatches
// ---------------------------------------------------------------------------

describe("interviewImportApi.listBatches", () => {
  test("calls GET /api/interview-import/batches with no options", async () => {
    mockedApi.mockResolvedValue({ items: [] });

    const result = await interviewImportApi.listBatches();

    expect(mockedApi).toHaveBeenCalledWith("/api/interview-import/batches");
    expect(result).toEqual({ items: [] });
  });
});

// ---------------------------------------------------------------------------
// createForCandidateDetail — JSON path
// ---------------------------------------------------------------------------

describe("interviewImportApi.createForCandidateDetail", () => {
  test("sends a JSON POST with candidate_detail_append payload", async () => {
    mockedApi.mockResolvedValue({
      batchId: "batch_abc",
      taskId: "task_xyz",
    });

    const payload = {
      mode: "candidate_detail_append" as const,
      candidateId: "cand_1",
      rounds: [{ evaluationText: "表现不错" }],
    };

    await interviewImportApi.createForCandidateDetail(payload);

    expect(mockedApi).toHaveBeenCalledWith("/api/interview-import/batches", {
      method: "POST",
      json: payload,
    });
  });

  test("passes through the server response", async () => {
    const serverResponse = {
      batchId: "batch_1",
      taskId: "task_1",
      batch: { id: "batch_1", displayName: "test", summary: null } as any,
      task: { id: "task_1", batchId: "batch_1" } as any,
    };
    mockedApi.mockResolvedValue(serverResponse);

    const result = await interviewImportApi.createForCandidateDetail({
      mode: "candidate_detail_append",
      candidateId: "cand_1",
      rounds: [{ evaluationText: "ok" }],
    });

    expect(result.batchId).toBe("batch_1");
    expect(result.task.id).toBe("task_1");
  });
});

// ---------------------------------------------------------------------------
// createStandalone — JSON or FormData
// ---------------------------------------------------------------------------

describe("interviewImportApi.createStandalone", () => {
  test("sends plain JSON when no resumePdf is given", async () => {
    mockedApi.mockResolvedValue({ batchId: "b2" });

    const payload = {
      mode: "create_candidate" as const,
      name: "小明",
      position: "工程师",
      rounds: [{ evaluationText: "很好" }],
    };

    await interviewImportApi.createStandalone(payload);

    expect(mockedApi).toHaveBeenCalledWith("/api/interview-import/batches", {
      method: "POST",
      json: payload,
    });
    expect(mockedRequestForm).not.toHaveBeenCalled();
  });

  test("sends FormData with payload JSON and resumePdf file", async () => {
    mockedRequestForm.mockResolvedValue({ batchId: "b3" });

    const payload = {
      mode: "create_candidate" as const,
      name: "小红",
      position: "设计师",
      rounds: [{ evaluationText: "有潜力" }],
    } as any;

    const resumeFile = new File(["dummy"], "resume.pdf", { type: "application/pdf" });

    await interviewImportApi.createStandalone(payload, resumeFile);

    expect(mockedRequestForm).toHaveBeenCalledTimes(1);
    expect(mockedApi).not.toHaveBeenCalled();

    const [, options] = mockedRequestForm.mock.calls[0];
    expect(options.method).toBe("POST");

    const formData = options.formData;
    expect(formData.get("payload")).toBe(JSON.stringify(payload));
    expect(formData.get("resumePdf")).toBe(resumeFile);
  });

  test("falls back to JSON when resumePdf is null", async () => {
    mockedApi.mockResolvedValue({ batchId: "b4" });

    await interviewImportApi.createStandalone(
      { mode: "bind_existing_candidate", candidateId: "cand_2", rounds: [{ evaluationText: "合格" }] },
      null,
    );

    expect(mockedApi).toHaveBeenCalled();
    expect(mockedRequestForm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getBatch
// ---------------------------------------------------------------------------

describe("interviewImportApi.getBatch", () => {
  test("calls GET with the batch id", async () => {
    mockedApi.mockResolvedValue({ batch: null as any, items: [] });

    await interviewImportApi.getBatch("batch_9");

    expect(mockedApi).toHaveBeenCalledWith("/api/interview-import/batches/batch_9");
  });
});

// ---------------------------------------------------------------------------
// files
// ---------------------------------------------------------------------------

describe("interviewImportApi.files", () => {
  test("calls GET with /files suffix", async () => {
    mockedApi.mockResolvedValue({ items: [] });

    await interviewImportApi.files("batch_42");

    expect(mockedApi).toHaveBeenCalledWith("/api/interview-import/batches/batch_42/files");
  });
});

// ---------------------------------------------------------------------------
// cancelBatch
// ---------------------------------------------------------------------------

describe("interviewImportApi.cancelBatch", () => {
  test("calls POST with /cancel suffix", async () => {
    mockedApi.mockResolvedValue({ id: "batch_7", status: "cancelled" });

    const result = await interviewImportApi.cancelBatch("batch_7");

    expect(mockedApi).toHaveBeenCalledWith("/api/interview-import/batches/batch_7/cancel", {
      method: "POST",
    });
    expect(result.status).toBe("cancelled");
  });
});
