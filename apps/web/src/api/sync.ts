import { api } from "./client";
import type { SyncStatusData, SyncToggleData, SyncRunData, SyncResetRunData } from "@ims/shared";

export const syncApi = {
  status() { return api<SyncStatusData>("/api/sync/status"); },
  toggle(enabled: boolean) {
    return api<SyncToggleData>("/api/sync/toggle", {
      method: "POST",
      json: { enabled },
    });
  },
  run() { return api<SyncRunData>("/api/sync/run", { method: "POST" }); },
  resetAndRun() { return api<SyncResetRunData>("/api/sync/reset-run", { method: "POST" }); },
};
