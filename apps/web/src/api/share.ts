import { api } from "./client";
import type { ShareDevicesData, ShareExportData, ShareRecordListData, ShareImportResult } from "@ims/shared";

export const shareApi = {
  devices() { return api<ShareDevicesData>("/api/share/devices"); },
  discoverStart() { return api("/api/share/discover/start", { method: "POST" }); },
  discoverStop() { return api("/api/share/discover/stop", { method: "POST" }); },
  export(candidateId: string) {
    return api<ShareExportData>("/api/share/export", {
      method: "POST",
      json: { candidateId },
    });
  },
  send(candidateId: string, target: { ip: string; port: number; deviceId?: string; name: string }) {
    return api("/api/share/send", {
      method: "POST",
      json: { candidateId, target },
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
