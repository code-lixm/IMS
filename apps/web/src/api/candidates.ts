import { api, requestStream } from "./client";
import type {
  CandidateListData,
  CandidateDetailData,
  CreateCandidateInput,
  UpdateCandidateInput,
  ResumeListData,
} from "@ims/shared";

export interface DownloadedResumeFile {
  blob: Blob;
  contentType: string | null;
  fileName: string | null;
}

export interface ResumePreviewSource extends DownloadedResumeFile {
  objectUrl: string;
}

export function resolveResumePreviewContentType(fileType: string | null | undefined, fileName: string | null | undefined): string | null {
  const normalizedType = fileType?.trim().toLowerCase() ?? "";
  const normalizedName = fileName?.trim().toLowerCase() ?? "";

  if (normalizedType === "pdf" || normalizedName.endsWith(".pdf")) return "application/pdf";
  if (normalizedType === "png" || normalizedName.endsWith(".png")) return "image/png";
  if (["jpg", "jpeg"].includes(normalizedType) || normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalizedType === "webp" || normalizedName.endsWith(".webp")) return "image/webp";

  return null;
}

function parseContentDispositionFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] ?? null;
}

function resolveBinaryResponseContentType(response: Response, blob: Blob): string | null {
  return response.headers.get("content-type")?.split(";")[0]?.trim() || blob.type || null;
}

async function readBinaryResponse(response: Response): Promise<DownloadedResumeFile> {
  const blob = await response.blob();

  return {
    blob,
    contentType: resolveBinaryResponseContentType(response, blob),
    fileName: parseContentDispositionFileName(response.headers.get("content-disposition")),
  };
}

export const candidatesApi = {
  list(
    params?: { search?: string; source?: string; page?: number; pageSize?: number },
    options?: { signal?: AbortSignal },
  ) {
    const sp = new URLSearchParams();
    if (params?.search) sp.set("search", params.search);
    if (params?.source) sp.set("source", params.source);
    if (params?.page) sp.set("page", String(params.page));
    if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
    return api<CandidateListData>(`/api/candidates?${sp}`, { signal: options?.signal });
  },

  get(id: string) {
    return api<CandidateDetailData>(`/api/candidates/${id}`);
  },

  listResumes(candidateId: string) {
    return api<ResumeListData>(`/api/candidates/${candidateId}/resumes`);
  },

  getResumePreviewUrl(id: string) {
    return `/api/resumes/${id}/preview`;
  },

  async loadResumePreviewSource(id: string): Promise<ResumePreviewSource> {
    const response = await requestStream(`/api/resumes/${id}/preview`);
    const file = await readBinaryResponse(response);

    return {
      ...file,
      objectUrl: URL.createObjectURL(file.blob),
    };
  },

  async downloadResume(id: string): Promise<DownloadedResumeFile> {
    const response = await requestStream(`/api/resumes/${id}/download`);
    return readBinaryResponse(response);
  },

  create(input: CreateCandidateInput) {
    return api<{ id: string }>("/api/candidates", {
      method: "POST",
      json: input,
    });
  },

  update(id: string, input: UpdateCandidateInput) {
    return api(`/api/candidates/${id}`, { method: "PUT", json: input });
  },

  delete(id: string) {
    return api(`/api/candidates/${id}`, { method: "DELETE" });
  },
};
