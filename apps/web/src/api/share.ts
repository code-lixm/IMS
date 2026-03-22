import { api } from "./client";
import type { ShareDevicesData, ShareExportData, ShareRecordListData } from "@ims/shared";

export const shareApi = {
  devices() { return api<ShareDevicesData>("/api/share/devices"); },
  discoverStart() { return api("/api/share/discover/start", { method: "POST" }); },
  discoverStop() { return api("/api/share/discover/stop", { method: "POST" }); },
  export(candidateId: string) {
    return api<ShareExportData>("/api/share/export", {
      method: "POST",
      body: JSON.stringify({ candidateId }),
    });
  },
  send(candidateId: string, target: { ip: string; port: number; deviceId?: string; name: string }) {
    return api("/api/share/send", {
      method: "POST",
      body: JSON.stringify({ candidateId, target }),
    });
  },
  import(filePath: string) {
    return api("/api/share/import", {
      method: "POST",
      body: JSON.stringify({ filePath }),
    });
  },
  records() { return api<ShareRecordListData>("/api/share/records"); },
};
