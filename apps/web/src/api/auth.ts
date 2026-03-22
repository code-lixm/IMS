import { api } from "./client";
import type { AuthStatusData } from "@ims/shared";

export const authApi = {
  status() { return api<AuthStatusData>("/api/auth/status"); },
  start() { return api<{ loginUrl: string; requestId: string }>("/api/auth/start", { method: "POST" }); },
  complete(token: string, expiresAt: number, name?: string, email?: string) {
    return api("/api/auth/complete", {
      method: "POST",
      body: JSON.stringify({ token, expiresAt, name, email }),
    });
  },
  logout() { return api("/api/auth/logout", { method: "POST" }); },
};
