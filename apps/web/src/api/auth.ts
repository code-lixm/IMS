import { api } from "./client";
import type { AuthStatusData, BaobaoLoginQrData, BaobaoLoginSessionStatusData } from "@ims/shared";
import type { JsonRequestOptions } from "./client";

export type { BaobaoLoginQrData, BaobaoLoginSessionStatusData };

export interface BaobaoQrRequestOptions extends JsonRequestOptions {
  forceRefresh?: boolean;
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
  baobaoQr(options?: BaobaoQrRequestOptions) {
    const { forceRefresh, ...requestOptions } = options ?? {};
    const query = forceRefresh ? "?forceRefresh=1" : "";
    return api<BaobaoLoginQrData>(`/api/auth/baobao/qr${query}`, requestOptions);
  },
  baobaoLoginStatus(options?: JsonRequestOptions) { return api<BaobaoLoginSessionStatusData>("/api/auth/baobao/login-status", options ?? {}); },
  logout() { return api("/api/auth/logout", { method: "POST" }); },
};
