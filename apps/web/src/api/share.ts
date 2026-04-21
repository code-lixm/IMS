import { api, requestRaw } from "./client";
import type { ShareDevicesData, ShareRecordListData, ShareImportResult } from "@ims/shared";

function parseContentDispositionFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] ?? null;
}

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
    const filename = parseContentDispositionFileName(response.headers.get("content-disposition")) ?? `candidate-${candidateId}.imr`;
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
    return api("/api/share/send", {
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
  records() { return api<ShareRecordListData>("/api/share/records"); },
};
