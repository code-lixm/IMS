import { api } from "./client";
import type { ImportBatchListData, CreateImportBatchData, ImportFileListData } from "@ims/shared";

export const importApi = {
  list() { return api<ImportBatchListData>("/api/import/batches"); },
  get(id: string) { return api(`/api/import/batches/${id}`); },
  create(paths: string[], autoScreen = false) {
    return api<CreateImportBatchData>("/api/import/batches", {
      method: "POST",
      json: { paths, autoScreen },
    });
  },
  files(batchId: string) { return api<ImportFileListData>(`/api/import/batches/${batchId}/files`); },
  retryFailed(id: string) { return api<{ retriedCount: number }>(`/api/import/batches/${id}/retry-failed`, { method: "POST" }); },
  cancel(id: string) { return api(`/api/import/batches/${id}/cancel`, { method: "POST" }); },
};
