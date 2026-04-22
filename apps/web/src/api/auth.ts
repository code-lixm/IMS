import { api } from "./client";
import type { AuthStatusData } from "@ims/shared";
import type { JsonRequestOptions } from "./client";

export interface BaobaoLoginQrData {
  provider: "baobao";
  imageSrc: string;
  qrText: string | null;
  source: "background-image" | "element-screenshot" | "qr-text";
  refreshed: boolean;
  fetchedAt: number;
  authenticated?: boolean;
  user?: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  } | null;
}

export interface BaobaoLoginSessionStatusData {
  provider: "baobao";
  status: "pending" | "authenticated" | "error";
  currentUrl: string;
  lastCheckedAt: number;
  error: string | null;
  authenticated: boolean;
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  } | null;
}

export const authApi = {
  status() { return api<AuthStatusData>("/api/auth/status"); },
  start() { return api<{ loginUrl: string; requestId: string }>("/api/auth/start", { method: "POST" }); },
  complete(token: string, expiresAt: number, name?: string, email?: string) {
    return api("/api/auth/complete", {
      method: "POST",
      json: { token, expiresAt, name, email },
    });
  },
  baobaoQr(options?: JsonRequestOptions) { return api<BaobaoLoginQrData>("/api/auth/baobao/qr", options ?? {}); },
  baobaoLoginStatus(options?: JsonRequestOptions) { return api<BaobaoLoginSessionStatusData>("/api/auth/baobao/login-status", options ?? {}); },
  logout() { return api("/api/auth/logout", { method: "POST" }); },
};
