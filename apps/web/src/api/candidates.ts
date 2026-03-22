import { api } from "./client";
import type {
  CandidateListData,
  CandidateDetailData,
  CreateCandidateInput,
  UpdateCandidateInput,
} from "@ims/shared";

export const candidatesApi = {
  list(params?: { search?: string; source?: string; page?: number; pageSize?: number }) {
    const sp = new URLSearchParams();
    if (params?.search) sp.set("search", params.search);
    if (params?.source) sp.set("source", params.source);
    if (params?.page) sp.set("page", String(params.page));
    if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
    return api<CandidateListData>(`/api/candidates?${sp}`);
  },

  get(id: string) {
    return api<CandidateDetailData>(`/api/candidates/${id}`);
  },

  create(input: CreateCandidateInput) {
    return api<{ id: string }>("/api/candidates", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  update(id: string, input: UpdateCandidateInput) {
    return api(`/api/candidates/${id}`, { method: "PUT", body: JSON.stringify(input) });
  },

  delete(id: string) {
    return api(`/api/candidates/${id}`, { method: "DELETE" });
  },
};
