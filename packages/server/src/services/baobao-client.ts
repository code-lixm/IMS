/**
 * Baobao API Client — HTTP client for baobao.getui.com
 *
 * Base URL: https://baobao.getui.com
 * Auth: x-token header with JWT token, or browser session cookie for login info
 *
 * Usage:
 *   const client = new BaobaoClient(token);
 *   const interviews = await client.getApplicantInterviewAll({ pageNum: 1, pageSize: 10 });
 */

import type {
  BaobaoLoginResponse,
  BaobaoInterviewCountResponse,
  BaobaoApplicantListResponse,
  BaobaoInterviewInfoResponse,
  BaobaoOrganizationResponse,
  BaobaoJobPositionResponse,
  BaobaoPositionRankResponse,
  BaobaoDictResponse,
  BaobaoPaginationParams,
  BaobaoTokenPayload,
} from "../baobao-types";

const BASE_URL = "https://baobao.getui.com";
const PROD_API_BASE = `${BASE_URL}/prod-api`;

export class BaobaoClient {
  private token: string;
  private cookieHeader: string | null;
  private _currentUser: BaobaoLoginResponse["data"]["data"] | null = null;

  constructor(token: string, options?: { cookieHeader?: string | null }) {
    this.token = token;
    this.cookieHeader = options?.cookieHeader ?? null;
  }

  /**
   * Parse JWT payload (base64 decode middle part)
   */
  static parseJwtPayload(token: string): BaobaoTokenPayload | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload as BaobaoTokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(token: string): boolean {
    const payload = BaobaoClient.parseJwtPayload(token);
    if (!payload) return true;
    return Date.now() / 1000 > payload.exp;
  }

  /**
   * Get current token
   */
  getToken(): string {
    return this.token;
  }

  /**
   * Update token (e.g., after refresh from response header)
   */
  setToken(token: string): void {
    this.token = token;
  }

  setCookieHeader(cookieHeader: string | null): void {
    this.cookieHeader = cookieHeader;
  }

  /**
   * Get cached current user info (from previous API call)
   */
  getCachedCurrentUser(): BaobaoLoginResponse["data"]["data"] | null {
    return this._currentUser;
  }

  /**
   * Make authenticated request to Baobao API
   */
  private async request<T>(path: string, options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown> | null;
    base?: "prod-api" | "api";
    headers?: Record<string, string>;
    omitTokenHeader?: boolean;
  } = {}): Promise<T> {
    const { method = "GET", body = null, base = "prod-api", headers: extraHeaders = {}, omitTokenHeader = false } = options;
    const baseUrl = base === "api" ? `${BASE_URL}/api` : PROD_API_BASE;
    const url = `${baseUrl}${path}`;

    const headers: Record<string, string> = {
      "accept": "application/json, text/plain, */*",
      "content-type": "application/json;charset=UTF-8",
      "origin": BASE_URL,
      "referer": `${BASE_URL}/ghr/`,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "x-token": this.token,
      ...extraHeaders,
    };

    if (!body) {
      delete headers["content-type"];
    }

    if (omitTokenHeader || !this.token) {
      delete headers["x-token"];
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Update token from response header if present
    const newToken = response.headers.get("x-token");
    if (newToken && newToken !== this.token) {
      this.token = newToken;
    }

    if (!response.ok) {
      throw new Error(`Baobao API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Interview APIs
  // -------------------------------------------------------------------------

  /**
   * Get interview count summary (today, future, past)
   */
  async getInterviewCount(): Promise<BaobaoInterviewCountResponse> {
    return this.request<BaobaoInterviewCountResponse>("/interviewer/getInterviewCount", {
      method: "POST",
      body: {},
    });
  }

  /**
   * Get all applicant interviews with pagination
   */
  async getApplicantInterviewAll(params: BaobaoPaginationParams = {}): Promise<BaobaoApplicantListResponse> {
    return this.request<BaobaoApplicantListResponse>("/interviewer/getApplicantInterview/all", {
      method: "POST",
      body: {
        name: params.name ?? null,
        organizationId: params.organizationId ?? null,
        applyPosition: params.applyPosition ?? null,
        startTime: params.startTime ?? null,
        status: params.status ?? null,
        pageNum: params.pageNum ?? 1,
        pageSize: params.pageSize ?? 10,
      },
    });
  }

  /**
   * Get today's interviews
   */
  async getApplicantInterviewToday(params: BaobaoPaginationParams = {}): Promise<BaobaoApplicantListResponse> {
    return this.request<BaobaoApplicantListResponse>("/interviewer/getApplicantInterview/today", {
      method: "POST",
      body: {
        name: params.name ?? null,
        organizationId: params.organizationId ?? null,
        applyPosition: params.applyPosition ?? null,
        startTime: params.startTime ?? null,
        status: params.status ?? null,
        pageNum: params.pageNum ?? 1,
        pageSize: params.pageSize ?? 10,
      },
    });
  }

  /**
   * Get future interviews
   */
  async getApplicantInterviewFuture(params: BaobaoPaginationParams = {}): Promise<BaobaoApplicantListResponse> {
    return this.request<BaobaoApplicantListResponse>("/interviewer/getApplicantInterview/future", {
      method: "POST",
      body: {
        name: params.name ?? null,
        organizationId: params.organizationId ?? null,
        applyPosition: params.applyPosition ?? null,
        startTime: params.startTime ?? null,
        status: params.status ?? null,
        pageNum: params.pageNum ?? 1,
        pageSize: params.pageSize ?? 10,
      },
    });
  }

  /**
   * Get past interviews
   */
  async getApplicantInterviewPastTimes(params: BaobaoPaginationParams = {}): Promise<BaobaoApplicantListResponse> {
    return this.request<BaobaoApplicantListResponse>("/interviewer/getApplicantInterview/pastTimes", {
      method: "POST",
      body: {
        name: params.name ?? null,
        organizationId: params.organizationId ?? null,
        applyPosition: params.applyPosition ?? null,
        startTime: params.startTime ?? null,
        status: params.status ?? null,
        pageNum: params.pageNum ?? 1,
        pageSize: params.pageSize ?? 10,
      },
    });
  }

  /**
   * Get interview details
   */
  async getInterviewInfo(interviewId: string): Promise<BaobaoInterviewInfoResponse> {
    return this.request<BaobaoInterviewInfoResponse>("/interviewer/getInterviewInfo", {
      method: "POST",
      body: { id: interviewId },
    });
  }

  /**
   * Get interview relevant candidates (search)
   */
  async getInterviewRelevant(params: BaobaoPaginationParams = {}): Promise<BaobaoApplicantListResponse> {
    return this.request<BaobaoApplicantListResponse>("/interviewer/getInterviewRelevant", {
      method: "POST",
      body: {
        name: params.name ?? null,
        organizationId: params.organizationId ?? null,
        applyPosition: params.applyPosition ?? null,
        startTime: params.startTime ?? null,
        interviewerName: params.status ?? null, // reusing status field for interviewerName
        status: null,
        pageNum: params.pageNum ?? 1,
        pageSize: params.pageSize ?? 10,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Common APIs
  // -------------------------------------------------------------------------

  /**
   * Get all organization structure
   */
  async getAllOrganizationStruct(): Promise<BaobaoOrganizationResponse> {
    return this.request<BaobaoOrganizationResponse>("/interviewer/common/getAllOrganizationStruct");
  }

  /**
   * Get all job positions
   */
  async getJobPosition(): Promise<BaobaoJobPositionResponse> {
    return this.request<BaobaoJobPositionResponse>("/interviewer/common/getJobPosition");
  }

  /**
   * Get all position ranks
   */
  async getAllPositionRank(): Promise<BaobaoPositionRankResponse> {
    return this.request<BaobaoPositionRankResponse>("/interviewer/common/getAllPositionRank");
  }

  /**
   * Get dict by type
   */
  async getDictByType(dictType: string): Promise<BaobaoDictResponse> {
    return this.request<BaobaoDictResponse>("/interviewer/common/getDictByType", {
      method: "GET",
    });
  }

  // -------------------------------------------------------------------------
  // User APIs
  // -------------------------------------------------------------------------

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<BaobaoLoginResponse> {
    const requestTime = Date.now();
    const response = this.cookieHeader
      ? await this.request<BaobaoLoginResponse>(`/usercenter/user/getLoginInfo?t=${requestTime}`, {
          method: "POST",
          base: "api",
          omitTokenHeader: true,
          headers: {
            cookie: this.cookieHeader,
            referer: `${BASE_URL}/`,
          },
        })
      : await this.request<BaobaoLoginResponse>("/usercenter/user/getLoginInfo");
    if (response.data?.data) {
      this._currentUser = response.data.data;
    }
    return response;
  }

  // -------------------------------------------------------------------------
  // Auth APIs
  // -------------------------------------------------------------------------

  /**
   * Logout from baobao server
   */
  async logout(): Promise<void> {
    const requestTime = Date.now();
    await this.request<{
      errno: number;
      errmsg: string;
      data?: unknown;
    }>(`/auth/user/logout?t=${requestTime}`, {
      method: "POST",
      base: "api",
    });
    // Note: baobao logout API returns errno 0 on success
    // We don't need to check the response as the server-side session is cleared
  }

  // -------------------------------------------------------------------------
  // File APIs
  // -------------------------------------------------------------------------

  /**
   * Download resume file
   * Token is embedded in URL path (not header)
   */
  getResumeDownloadUrl(fileId: string): string {
    return `${PROD_API_BASE}/file/getInterviewerFile/${fileId}/${this.token}`;
  }

  /**
   * Download resume binary data
   */
  async downloadResumeFile(fileId: string): Promise<{
    buffer: ArrayBuffer;
    fileName: string | null;
    contentType: string | null;
  }> {
    const url = this.getResumeDownloadUrl(fileId);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "accept": "*/*",
        "referer": `${BASE_URL}/ghr/`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download resume: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const contentDisposition = response.headers.get("content-disposition");
    const fileName = parseFileNameFromContentDisposition(contentDisposition);
    const contentType = response.headers.get("content-type");

    const fileError = detectBaobaoFileError(buffer, contentType, fileName);
    if (fileError) {
      throw new Error(fileError);
    }

    return {
      buffer,
      fileName,
      contentType,
    };
  }

  async downloadResume(fileId: string): Promise<ArrayBuffer> {
    const result = await this.downloadResumeFile(fileId);
    return result.buffer;
  }
}

function parseFileNameFromContentDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

function detectBaobaoFileError(
  buffer: ArrayBuffer,
  contentType: string | null,
  fileName: string | null,
): string | null {
  const text = Buffer.from(buffer).toString("utf-8").trim();
  const looksLikeText = (contentType?.includes("json") || contentType?.includes("text") || fileName?.endsWith(".txt"))
    && text.startsWith("{")
    && text.endsWith("}");

  if (!looksLikeText) {
    return null;
  }

  try {
    const payload = JSON.parse(text) as { errno?: number | string; errmsg?: string; message?: string };
    const code = payload.errno ?? "unknown";
    const message = payload.errmsg?.trim() || payload.message?.trim();
    if (!message) {
      return null;
    }
    return `Baobao file download failed (${code}): ${message}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance for sync manager
// ---------------------------------------------------------------------------

let baobaoClientInstance: BaobaoClient | null = null;

export function getBaobaoClient(): BaobaoClient | null {
  return baobaoClientInstance;
}

export function setBaobaoClient(client: BaobaoClient | null): void {
  baobaoClientInstance = client;
}
