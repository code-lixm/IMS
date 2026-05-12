import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectQueue: [] as Array<Array<{ id: string }>>,
  insertedCandidates: [] as Array<Record<string, unknown>>,
  importResumeForCandidate: vi.fn(),
}));

vi.mock("../../config", () => ({
  config: {
    dataDir: "/tmp/ims-interview-import-test",
  },
}));

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.selectQueue.shift() ?? []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        mocks.insertedCandidates.push(value);
      }),
    })),
  },
}));

vi.mock("../../schema", () => ({
  candidates: {
    id: "candidates.id",
    deletedAt: "candidates.deleted_at",
  },
}));

vi.mock("../import/pipeline", () => ({
  importResumeForCandidate: mocks.importResumeForCandidate,
}));

import { resolveInterviewImportCandidate, InterviewImportCandidateResolutionError } from "./candidate-resolution";

describe("resolveInterviewImportCandidate", () => {
  beforeEach(() => {
    mocks.selectQueue.splice(0, mocks.selectQueue.length);
    mocks.insertedCandidates.splice(0, mocks.insertedCandidates.length);
    mocks.importResumeForCandidate.mockReset();
  });

  afterEach(async () => {
    await rm("/tmp/ims-interview-import-test", { recursive: true, force: true });
  });

  test("creates candidate and imports resume for create_candidate mode", async () => {
    mocks.importResumeForCandidate.mockResolvedValue({
      resumeId: "res_123",
      parsed: { name: "张三" },
    });

    const result = await resolveInterviewImportCandidate(
      {
        mode: "create_candidate",
        name: " 张三 ",
        position: " 前端工程师 ",
        email: " zhangsan@example.com ",
        rounds: [{ evaluationText: "技术扎实" }],
      },
      {
        batchId: "batch_1",
        resumePdf: new File([Buffer.from("%PDF-1.4 mock")], "resume.pdf", { type: "application/pdf" }),
        now: 1_746_662_400_000,
      },
    );

    expect(result).toMatchObject({
      mode: "create_candidate",
      createdCandidate: true,
      resumeId: "res_123",
    });
    expect(result.candidateId).toMatch(/^cand_/);
    expect(mocks.insertedCandidates).toHaveLength(1);
    expect(mocks.insertedCandidates[0]).toMatchObject({
      source: "local",
      name: "张三",
      email: "zhangsan@example.com",
      position: "前端工程师",
      tagsJson: "[]",
      createdAt: 1_746_662_400_000,
      updatedAt: 1_746_662_400_000,
    });

    expect(mocks.importResumeForCandidate).toHaveBeenCalledTimes(1);
    const [candidateId, stagedPath, options] = mocks.importResumeForCandidate.mock.calls[0];
    expect(candidateId).toBe(result.candidateId);
    expect(stagedPath).toContain("/tmp/ims-interview-import-test/import-uploads/batch_1/resume.pdf");
    expect(options).toMatchObject({ originalFileName: "resume.pdf" });
  });

  test("rejects missing candidateId for candidate_detail_append mode", async () => {
    await expect(
      resolveInterviewImportCandidate({
        mode: "candidate_detail_append",
        candidateId: "   ",
        rounds: [{ evaluationText: "补录" }],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 422,
      field: "candidateId",
    } satisfies Partial<InterviewImportCandidateResolutionError>);
  });

  test("returns structured resumeError instead of failing whole resolution", async () => {
    mocks.importResumeForCandidate.mockRejectedValue(new Error("pdf parse failed"));

    const result = await resolveInterviewImportCandidate(
      {
        mode: "create_candidate",
        name: "李四",
        position: "后端工程师",
        phone: "13800138000",
        rounds: [{ evaluationText: "面评正常" }],
      },
      {
        batchId: "batch_2",
        resumePdf: new File([Buffer.from("broken")], "resume.pdf", { type: "application/pdf" }),
      },
    );

    expect(result.createdCandidate).toBe(true);
    expect(result.resumeId).toBeUndefined();
    expect(result.resumeError).toEqual({
      code: "RESUME_IMPORT_FAILED",
      message: "pdf parse failed",
    });
  });
});
