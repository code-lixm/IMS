import { api } from "./client";
import type { ImportBatchListData, CreateImportBatchData, ImportFileListData } from "@ims/shared";

export const importApi = {
  list() { return api<ImportBatchListData>("/api/import/batches"); },
  get(id: string) { return api(`/api/import/batches/${id}`); },
  create(paths: string[], autoScreen = false) {
    return api<CreateImportBatchData>("/api/import/batches", {
      method: "POST",
      body: JSON.stringify({ paths, autoScreen }),
    });
  },
  files(batchId: string) { return api<ImportFileListData>(`/api/import/batches/${batchId}/files`); },
  cancel(id: string) { return api(`/api/import/batches/${id}/cancel`, { method: "POST" }); },
};
