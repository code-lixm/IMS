import { api, requestForm, requestStream } from "./client";
import type { ImportBatchListData, CreateImportBatchData, ImportFileListData } from "@ims/shared";

export interface ExportedScreeningFile {
  blob: Blob;
  fileName: string;
}

export const importApi = {
  list() { return api<ImportBatchListData>("/api/import/batches"); },
  get(id: string) { return api(`/api/import/batches/${id}`); },
  create(paths: string[], autoScreen = false) {
    return api<CreateImportBatchData>("/api/import/batches", {
      method: "POST",
      json: { paths, autoScreen },
    });
  },
  upload(files: File[], autoScreen = false) {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }
    formData.append("autoScreen", String(autoScreen));
    return requestForm<CreateImportBatchData>("/api/import/batches", {
      method: "POST",
      formData,
    });
  },
  files(batchId: string) { return api<ImportFileListData>(`/api/import/batches/${batchId}/files`); },
  retryFailed(id: string) { return api<{ retriedCount: number }>(`/api/import/batches/${id}/retry-failed`, { method: "POST" }); },
  rerunScreening(id: string) { return api<{ id: string; retriedCount: number; status: string }>(`/api/import/batches/${id}/rerun-screening`, { method: "POST" }); },
  rerunFileScreening(taskId: string) { return api<{ taskId: string; retried: boolean; screeningStatus: string }>(`/api/import/file-tasks/${taskId}/rerun-screening`, { method: "POST" }); },
  async exportResults(batchId?: string): Promise<ExportedScreeningFile> {
    const sp = batchId ? `?batchId=${batchId}` : "";
    const response = await requestStream(`/api/screening/export${sp}`);
    const blob = await response.blob();
    const cd = response.headers.get("content-disposition");
    let fileName = "AI初筛结果.xlsx";
    if (cd) {
      const m = cd.match(/filename\*?=["']?(?:UTF-8'')?([^;"']+)/i);
      if (m?.[1]) fileName = decodeURIComponent(m[1]);
    }
    return { blob, fileName };
  },
  cancel(id: string) { return api(`/api/import/batches/${id}/cancel`, { method: "POST" }); },
  remove(id: string) { return api<{ id: string; deleted: boolean }>(`/api/import/batches/${id}`, { method: "DELETE" }); },
};
