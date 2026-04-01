import { api, requestRaw } from "./client";
import type { ShareDevicesData, ShareRecordListData, ShareImportResult } from "@ims/shared";

export const shareApi = {
  devices() { return api<ShareDevicesData>("/api/share/devices"); },
  discoverStart() { return api("/api/share/discover/start", { method: "POST" }); },
  discoverStop() { return api("/api/share/discover/stop", { method: "POST" }); },
  async export(candidateId: string): Promise<{ blob: Blob; filename: string }> {
    const response = await requestRaw("/api/share/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });
    const contentDisposition = response.headers.get("content-disposition");
    const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch?.[1] ?? `candidate-${candidateId}.imr`;
    const blob = await response.blob();
    return { blob, filename };
  },
  send(candidateId: string, target: { ip: string; port: number; deviceId?: string; name: string }) {
    return api("/api/share/send", {
      method: "POST",
      json: { candidateId, target },
    });
  },
  batchSend(candidateIds: string[], target: { ip: string; port: number; deviceId?: string; name: string }) {
    return api("/api/share/batch-send", {
      method: "POST",
      json: { candidateIds, target },
    });
  },
  import(filePath: string) {
    return api<ShareImportResult>("/api/share/import", {
      method: "POST",
      json: { filePath },
    });
  },
  resolve(candidateId: string, strategy: "local" | "import") {
    return api("/api/share/resolve", {
      method: "POST",
      json: { candidateId, strategy },
    });
  },
  records() { return api<ShareRecordListData>("/api/share/records"); },
};
