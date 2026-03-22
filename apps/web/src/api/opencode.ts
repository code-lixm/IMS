import { api } from "./client";
import type { OpenCodeStatusData, WorkspaceData } from "@ims/shared";

export const opencodeApi = {
  status() { return api<OpenCodeStatusData>("/api/system/opencode/status"); },
  start() { return api<OpenCodeStatusData>("/api/system/opencode/start", { method: "POST" }); },
  stop() { return api("/api/system/opencode/stop", { method: "POST" }); },
  workspace(candidateId: string) {
    return api<WorkspaceData>(`/api/candidates/${candidateId}/workspace`, { method: "POST" });
  },
};
