import { api, requestForm, requestStream } from "./client";
import type {
  ImportBatchListData,
  CreateImportBatchData,
  ImportFileListData,
  ImportScreeningExportMode,
  ImportScreeningExportRequest,
} from "@ims/shared";

export interface ExportedScreeningFile {
  blob: Blob;
  fileName: string;
  contentType: string | null;
  textContent?: string;
}

export const IMPORT_SCREENING_EXPORT_LABELS: Record<ImportScreeningExportMode, string> = {
  custom_bundle: "自定义报告包",
  wechat_text: "微信文案",
};

export const importApi = {
  list() { return api<ImportBatchListData>("/api/import/batches"); },
  get(id: string) { return api(`/api/import/batches/${id}`); },
  create(paths: string[], autoScreen = false, templateId?: string | null) {
    return api<CreateImportBatchData>("/api/import/batches", {
      method: "POST",
      json: { paths, autoScreen, ...(templateId ? { templateId } : {}) },
    });
  },
  upload(files: File[], autoScreen = false, templateId?: string | null) {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }
    formData.append("autoScreen", String(autoScreen));
    if (templateId) {
      formData.append("templateId", templateId);
    }
    return requestForm<CreateImportBatchData>("/api/import/batches", {
      method: "POST",
      formData,
    });
  },
  files(batchId: string) { return api<ImportFileListData>(`/api/import/batches/${batchId}/files`); },
  retryFailed(id: string) { return api<{ retriedCount: number }>(`/api/import/batches/${id}/retry-failed`, { method: "POST" }); },
  rerunScreening(id: string, templateId?: string) { return api<{ id: string; retriedCount: number; status: string }>(`/api/import/batches/${id}/rerun-screening`, { method: "POST", json: templateId ? { templateId } : undefined }); },
  rerunFileScreening(taskId: string, templateId?: string) { return api<{ taskId: string; retried: boolean; screeningStatus: string }>(`/api/import/file-tasks/${taskId}/rerun-screening`, { method: "POST", timeoutMs: 10_000, json: templateId ? { templateId } : undefined }); },
  async exportResults(payload: ImportScreeningExportRequest): Promise<ExportedScreeningFile> {
    const response = await requestStream("/api/screening/export", {
      method: "POST",
      json: payload,
    });
    const blob = await response.blob();
    const contentType = response.headers.get("content-type");
    const cd = response.headers.get("content-disposition");
    let fileName = `导出-${IMPORT_SCREENING_EXPORT_LABELS[payload.mode]}`;
    if (cd) {
      const encodedMatch = cd.match(/filename\*=UTF-8''([^;]+)/i);
      const plainMatch = cd.match(/filename=["']?([^;"']+)/i);
      const rawName = encodedMatch?.[1] ?? plainMatch?.[1];
      if (rawName) fileName = decodeURIComponent(rawName);
    }

    return {
      blob,
      fileName,
      contentType,
      textContent: contentType?.startsWith("text/plain") ? await blob.text() : undefined,
    };
  },
  cancel(id: string) { return api(`/api/import/batches/${id}/cancel`, { method: "POST" }); },
  remove(id: string) { return api<{ id: string; deleted: boolean }>(`/api/import/batches/${id}`, { method: "DELETE" }); },
};
