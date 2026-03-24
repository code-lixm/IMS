import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import type { CandidateListItemSummary } from "@ims/shared";
import { candidatesApi } from "@/api/candidates";
import { useCandidatesStore } from "./candidates";

const originalList = candidatesApi.list;

function makeCandidate(id: string, name: string): CandidateListItemSummary {
  return {
    id,
    source: "remote",
    remoteId: null,
    name,
    phone: null,
    email: null,
    position: null,
    organizationName: null,
    orgAllParentName: null,
    recruitmentSourceName: null,
    yearsOfExperience: null,
    tagsJson: "[]",
    deletedAt: null,
    createdAt: 1,
    updatedAt: 1,
    tags: [],
    resumeStatus: "missing",
    pipelineStage: "new",
    interviewState: "none",
    lastActivityAt: 1,
  };
}

describe("useCandidatesStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    candidatesApi.list = originalList;
  });

  test("stores pagination metadata from fetchList", async () => {
    candidatesApi.list = async () => ({
      items: [makeCandidate("cand_1", "胡佳")],
      total: 25,
      page: 2,
      pageSize: 20,
    });

    const store = useCandidatesStore();
    await store.fetchList({ search: "胡", page: 2, pageSize: 20 });

    expect(store.list).toHaveLength(1);
    expect(store.total).toBe(25);
    expect(store.page).toBe(2);
    expect(store.pageSize).toBe(20);
    expect(store.search).toBe("胡");
  });

  test("setPageSize resets to first page while preserving filters", async () => {
    const calls: Array<{ search?: string; source?: string; page?: number; pageSize?: number }> = [];

    candidatesApi.list = async (params) => {
      calls.push(params ?? {});
      return {
        items: [makeCandidate("cand_1", "胡佳")],
        total: 25,
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 20,
      };
    };

    const store = useCandidatesStore();
    await store.fetchList({ search: "胡", page: 3, pageSize: 20 });
    await store.setPageSize(50);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.search).toBe("胡");
    expect(calls[1]?.page).toBe(1);
    expect(calls[1]?.pageSize).toBe(50);
    expect(store.page).toBe(1);
    expect(store.pageSize).toBe(50);
  });
});
