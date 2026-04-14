/**
 * Baobao HTTP Login Service — Pure HTTP implementation
 * 
 * Replaces Playwright-based login by directly calling baobao QR code APIs.
 * 
 * Flow:
 *  1. POST /api/mainpart/qr_code/getUuid         → { uuid: "login_xxx" }
 *  2. POST /api/mainpart/qr_code/getQrCodeStatus → { status, portrait (base64 QR image), m_token (response header) }
 *  3. When status=confirm_logined, m_token appears in response header
 *  4. Exchange m_token → ghr-token via ghr/authentication
 *  5. delUuid to clean up
 * 
 * The ghr-token (JWT) is used as x-token header for all subsequent API calls.
 * 
 * IMPORTANT: m_token may be set by gateway/session layer. We try multiple
 * exchange strategies to keep this flow purely HTTP.
 */

import { desc, eq } from "drizzle-orm";
import type { BaobaoLoginResponse } from "../baobao-types";
import { db } from "../db";
import { remoteUsers } from "../schema";

const BASE_URL = "https://baobao.getui.com";
const API_BASE = `${BASE_URL}/api`;
const PROD_API_BASE = `${BASE_URL}/prod-api`;
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

const DEBUG_BAOBAO_HTTP = process.env.IMS_DEBUG_BAOBAO_HTTP === "1";
const FORCED_SESSION_COOKIE_VALUE = normalizeSessionCookieValue(
  (process.env.IMS_BAOBAO_SESSION_COOKIE ?? "").trim(),
);

function log(...args: unknown[]) {
  if (DEBUG_BAOBAO_HTTP) {
    console.log("[baobao-http-login]", ...args);
  }
}

function logImportant(stage: string, details?: Record<string, unknown>) {
  console.log("[baobao-http-login]", stage, details ?? {});
}

type CookieJar = Record<string, string>;

function normalizeSessionCookieValue(raw: string): string {
  if (!raw) return "";
  if (!raw.includes("=")) return raw;
  const jar = parseCookieHeaderToJar(raw);
  if (jar.session) return jar.session;
  return raw;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QrStatus = "no_scanned" | "is_scanned" | "confirm_logined" | "invalid_uuid" | string;

export interface QrCodeResult {
  uuid: string;
  status: QrStatus;
  portrait: string | null; // data:image/png;base64,...
  mToken: string | null;   // from response header (only when status=confirm_logined)
  scannedAt: number | null;
  confirmedAt: number | null;
}

export interface HttpLoginResult {
  success: boolean;
  token: string | null;      // ghr-token JWT
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  } | null;
  mToken: string | null;     // the m_token from response header
  portrait: string | null;   // QR code image (base64)
  error: string | null;
  via: "http";
}

interface BaobaoQrStatusResponse {
  errcode: string;
  errmsg: string;
  errno: number;
  data: {
    status: QrStatus;
    portrait: string | null;
    oauth2Info: unknown | null;
  };
}

interface BaobaoUuidResponse {
  errcode: string;
  errmsg: string;
  errno: number;
  data: {
    uuid: string;
  };
}

interface BaobaoGhrAuthResponse {
  errno: number;
  errcode: string;
  errmsg: string;
  data: string; // JWT token
}

interface BaobaoLoginInfoResponse {
  errno: number;
  errcode: string;
  errmsg: string;
  data: {
    result: number;
    data: {
      id: string;
      name: string;
      username: string;
      email: string | null;
      empno: string;
      department: {
        id: string;
        name: string;
        reporterId: string | null;
      };
    };
  };
}

interface BaobaoDelUuidResponse {
  errcode: string;
  errmsg: string;
  errno: number;
  data: boolean;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function httpPost<T>(
  path: string,
  body: Record<string, unknown> | null,
  options: {
    base?: "api" | "prod-api";
    headers?: Record<string, string>;
    cookieJar?: CookieJar | null;
    autoAttachCookie?: boolean;
    fetchOptions?: RequestInit;
  } = {},
): Promise<{ data: T; mToken: string | null }> {
  const {
    base = "api",
    headers = {},
    cookieJar = null,
    autoAttachCookie = true,
    fetchOptions = {},
  } = options;
  const baseUrl = base === "prod-api" ? PROD_API_BASE : API_BASE;
  const t = Date.now();

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json;charset=UTF-8",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Origin": BASE_URL,
    "Referer": `${BASE_URL}/`,
    "sec-ch-ua": "\"Google Chrome\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"macOS\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "priority": "u=1, i",
    "User-Agent": BROWSER_UA,
    ...headers,
  };

  if (autoAttachCookie && cookieJar && !requestHeaders.Cookie && !requestHeaders.cookie) {
    const runtimeCookieHeader = buildCookieHeaderFromJar(cookieJar);
    if (runtimeCookieHeader) {
      requestHeaders.Cookie = runtimeCookieHeader;
    }
  }

  const url = `${baseUrl}${path}${path.includes("?") ? "&" : "?"}t=${t}`;

  log(`POST ${url}`);
  if (body) log(`  body:`, JSON.stringify(body));

  const response = await fetch(url, {
    method: "POST",
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
    ...fetchOptions,
  });

  const mToken = response.headers.get("m_token");
  if (cookieJar) {
    mergeSetCookieIntoJar(response, cookieJar);
  }
  const responseText = await response.text();

  log(`  status: ${response.status}, m_token: ${mToken ? "present" : "absent"}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 200)}`);
  }

  try {
    const data = JSON.parse(responseText) as T;
    return { data, mToken };
  } catch {
    throw new Error(`Invalid JSON response: ${responseText.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Token persistence (reuse existing DB schema)
// ---------------------------------------------------------------------------

interface PersistedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

async function loadPersistedAuth(): Promise<{
  token: string | null;
  cookies: PersistedCookie[];
} | null> {
  const rows = await db
    .select()
    .from(remoteUsers)
    .where(eq(remoteUsers.provider, "baobao"))
    .orderBy(desc(remoteUsers.updatedAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  let cookies: PersistedCookie[] = [];
  if (row.cookieJson) {
    try {
      cookies = JSON.parse(row.cookieJson) as PersistedCookie[];
    } catch {
      cookies = [];
    }
  }

  return { token: row.token ?? null, cookies };
}

function buildCookieHeader(cookies: PersistedCookie[]): string {
  return cookies
    .filter((c) => c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function buildCookieHeaderFromJar(cookieJar: CookieJar): string {
  return Object.entries(cookieJar)
    .filter(([name, value]) => name && value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function parseCookieHeaderToJar(cookieHeader: string): CookieJar {
  const jar: CookieJar = {};
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const name = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (name && value) {
      jar[name] = value;
    }
  }
  return jar;
}

function mergeCookieHeaders(...headers: string[]): string {
  const merged: CookieJar = {};
  for (const header of headers) {
    if (!header) continue;
    const jar = parseCookieHeaderToJar(header);
    Object.assign(merged, jar);
  }
  return buildCookieHeaderFromJar(merged);
}

function mergeSetCookieIntoJar(response: Response, cookieJar: CookieJar): void {
  const cookieLines = getSetCookieLines(response);
  if (cookieLines.length === 0) return;

  const names: string[] = [];
  for (const line of cookieLines) {
    const firstPart = line.split(";")[0]?.trim();
    if (!firstPart) continue;
    const idx = firstPart.indexOf("=");
    if (idx <= 0) continue;
    const name = firstPart.slice(0, idx).trim();
    const value = firstPart.slice(idx + 1).trim();
    if (!name || !value) continue;
    cookieJar[name] = value;
    names.push(name);
  }

  if (names.length > 0) {
    logImportant("cookie-jar:update", {
      cookies: names,
      size: Object.keys(cookieJar).length,
    });
  }
}

function getSetCookieLines(response: Response): string[] {
  const headersEx = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headersEx.getSetCookie === "function") {
    return headersEx.getSetCookie();
  }

  const single = response.headers.get("set-cookie");
  if (!single) return [];
  return [single];
}

function sanitizeCookies(cookies: PersistedCookie[]): PersistedCookie[] {
  return cookies.filter((c) => c.name && c.value && c.domain && c.path);
}

// ---------------------------------------------------------------------------
// Core login flow
// ---------------------------------------------------------------------------

/**
 * Step 1: Get a new QR code UUID
 */
export async function fetchQrUuid(): Promise<string> {
  const { data } = await httpPost<BaobaoUuidResponse>(
    "/mainpart/qr_code/getUuid",
    {},
  );

  if (data.errno !== 0 || !data.data?.uuid) {
    throw new Error(`Failed to get QR UUID: ${data.errmsg}`);
  }

  const uuid = data.data.uuid;
  log(`Got UUID: ${uuid}`);
  return uuid;
}

/**
 * Step 2: Poll QR code status
 * @param uuid - The UUID from fetchQrUuid
 * @param timeoutMs - Max time to wait (default 5 min)
 * @param onProgress - Called on each poll with current status
 */
export async function pollQrStatus(
  uuid: string,
  timeoutMs = 300_000,
  onProgress?: (result: QrCodeResult) => void,
): Promise<QrCodeResult> {
  const startTime = Date.now();
  let result: QrCodeResult = {
    uuid,
    status: "no_scanned",
    portrait: null,
    mToken: null,
    scannedAt: null,
    confirmedAt: null,
  };

  while (Date.now() - startTime < timeoutMs) {
    try {
      const { data, mToken } = await httpPost<BaobaoQrStatusResponse>(
        "/mainpart/qr_code/getQrCodeStatus",
        { uuid },
      );

      if (data.errno !== 0) {
        log(`Poll error: ${data.errmsg}`);
        await sleep(3000);
        continue;
      }

      const status = data.data.status;

      result = {
        uuid,
        status,
        portrait: data.data.portrait ?? null,
        mToken: mToken ?? result.mToken,
        scannedAt: status === "is_scanned" && result.scannedAt === null
          ? Date.now()
          : result.scannedAt,
        confirmedAt: status === "confirm_logined" && result.confirmedAt === null
          ? Date.now()
          : result.confirmedAt,
      };

      onProgress?.(result);

      if (status === "confirm_logined") {
        log(`QR confirmed! m_token: ${mToken ? "present" : "absent"}`);
        return result;
      }

      if (status === "invalid_uuid") {
        throw new Error("QR code has expired, please request a new one");
      }

    } catch (err) {
      log(`Poll error:`, err);
    }

    // Adaptive polling: faster when closer to confirmation
    await sleep(2000);
  }

  throw new Error("QR code scan timeout");
}

/**
 * Step 3: Exchange m_token for ghr-token via ghr/authentication
 * 
 * This is the hardest step. The HAR shows ghr/authentication accepts an empty
 * body {} and returns a JWT. However, Bun's fetch does NOT receive/send
 * HTTP-only cookies that Kong sets (m_token).
 * 
 * We try multiple auth mechanisms:
 *  1. m_token as Cookie header (may not work if HTTP-only)
 *  2. Existing JSESSIONID from persisted cookies
 *  3. m_token as Authorization: Bearer header
 */
async function exchangeMTokenForGhrToken(
  mToken: string | null,
  cookies: PersistedCookie[],
  runtimeCookieJar: CookieJar,
): Promise<string | null> {
  const cookieHeader = buildCookieHeader(cookies);
  const runtimeCookieHeader = buildCookieHeaderFromJar(runtimeCookieJar);
  const combinedCookieHeader = mergeCookieHeaders(
    runtimeCookieHeader,
    cookieHeader,
    FORCED_SESSION_COOKIE_VALUE ? `session=${FORCED_SESSION_COOKIE_VALUE}` : "",
    mToken ? `session=${mToken}` : "",
  );
  const attempts: string[] = [];

  const tryStrategy = async (
    strategy: "no-auth" | "header:m_token" | "cookie:session" | "cookie:m_token" | "cookie:persisted" | "authorization:bearer-m_token",
    headers?: Record<string, string>,
  ): Promise<string | null> => {
    attempts.push(strategy);
    try {
      const { data } = await httpPost<BaobaoGhrAuthResponse>(
        "/usercenter/ghr/authentication",
        {},
        { headers: headers ?? {}, cookieJar: runtimeCookieJar },
      );
      if (data.errno === 0 && data.data) {
        logImportant("token-exchange:success", { strategy });
        return data.data;
      }
      logImportant("token-exchange:attempt-rejected", {
        strategy,
        errno: data.errno,
        errcode: data.errcode,
        errmsg: data.errmsg,
      });
      return null;
    } catch (err) {
      logImportant("token-exchange:attempt-failed", {
        strategy,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };

  // HAR shows this strategy is successful path after confirm_logined.
  const noAuthToken = await tryStrategy("no-auth");
  if (noAuthToken) return noAuthToken;

  if (mToken) {
    const mTokenHeaderToken = await tryStrategy("header:m_token", { "m_token": mToken });
    if (mTokenHeaderToken) return mTokenHeaderToken;
  }

  if (mToken) {
    const sessionCookieToken = await tryStrategy("cookie:session", { "Cookie": `session=${mToken}` });
    if (sessionCookieToken) return sessionCookieToken;
  }

  if (mToken) {
    const mTokenCookieToken = await tryStrategy("cookie:m_token", { "Cookie": `m_token=${mToken}` });
    if (mTokenCookieToken) return mTokenCookieToken;
  }

  if (combinedCookieHeader) {
    const persistedCookieToken = await tryStrategy("cookie:persisted", { "Cookie": combinedCookieHeader });
    if (persistedCookieToken) return persistedCookieToken;
  }

  if (mToken) {
    const bearerToken = await tryStrategy("authorization:bearer-m_token", { "Authorization": `Bearer ${mToken}` });
    if (bearerToken) return bearerToken;
  }

  logImportant("token-exchange:failed", {
    hasMToken: Boolean(mToken),
    hasPersistedCookies: Boolean(cookieHeader),
    hasRuntimeCookies: Boolean(runtimeCookieHeader),
    attempts,
  });
  return null;
}

/**
 * Step 4: Verify login with getLoginInfo
 */
async function verifyLoginWithGetLoginInfo(
  cookies: PersistedCookie[],
  runtimeCookieJar: CookieJar,
  mToken?: string | null,
): Promise<BaobaoLoginInfoResponse["data"]["data"] | null> {
  const cookieHeader = buildCookieHeader(cookies);
  const runtimeCookieHeader = buildCookieHeaderFromJar(runtimeCookieJar);
  const combinedCookieHeader = mergeCookieHeaders(
    runtimeCookieHeader,
    cookieHeader,
    FORCED_SESSION_COOKIE_VALUE ? `session=${FORCED_SESSION_COOKIE_VALUE}` : "",
    mToken ? `session=${mToken}` : "",
  );

  try {
    const { data } = await httpPost<BaobaoLoginInfoResponse>(
      "/usercenter/user/getLoginInfo",
      null,
      {
        headers: {
          ...(combinedCookieHeader ? { "Cookie": combinedCookieHeader } : {}),
          ...(mToken ? { "m_token": mToken } : {}),
        },
        cookieJar: runtimeCookieJar,
      },
    );

    if (data.errno === 0 && data.data?.data) {
      return data.data.data;
    }
  } catch (err) {
    log(`getLoginInfo failed:`, err);
  }

  return null;
}

/**
 * Step 5: Clean up QR code
 */
export async function cleanupQrCode(uuid: string): Promise<void> {
  try {
    await httpPost<BaobaoDelUuidResponse>(
      "/mainpart/qr_code/delUuid",
      { uuid },
    );
    log(`Cleaned up QR code: ${uuid}`);
  } catch (err) {
    log(`Failed to cleanup QR code:`, err);
  }
}

// ---------------------------------------------------------------------------
// QR Session state (module-level for polling between two phases)
// ---------------------------------------------------------------------------

interface QrSession {
  uuid: string;
  portrait: string | null;
  mToken: string | null;
  status: QrStatus;
  createdAt: number;
  confirmedAt: number | null;
  ghrToken: string | null;
  userInfo: BaobaoLoginInfoResponse["data"]["data"] | null;
  cookies: CookieJar;
  tokenExchangeAttempts: number;
  tokenExchangeLastAttemptAt: number | null;
  lastError: string | null;
}

let qrSession: QrSession | null = null;

function setQrSession(session: QrSession): void {
  qrSession = session;
}

export function getQrSession(): QrSession | null {
  return qrSession;
}

export function clearQrSession(): void {
  if (qrSession) {
    logImportant("qr-session:clear", {
      uuid: qrSession.uuid,
      status: qrSession.status,
      hasToken: Boolean(qrSession.ghrToken),
    });
  }
  qrSession = null;
}

// ---------------------------------------------------------------------------
// Phase 1: Start QR login (non-blocking, returns immediately)
// ---------------------------------------------------------------------------

/**
 * Start HTTP QR login - returns QR code immediately without waiting for scan.
 * Call checkHttpLoginStatus() periodically to detect scan confirmation.
 */
export async function startHttpQrLogin(): Promise<{
  uuid: string;
  portrait: string | null;
  status: QrStatus;
}> {
  const uuid = await fetchQrUuid();

  setQrSession({
    uuid,
    portrait: null,
    mToken: null,
    status: "no_scanned",
    createdAt: Date.now(),
    confirmedAt: null,
    ghrToken: null,
    userInfo: null,
    cookies: FORCED_SESSION_COOKIE_VALUE ? { session: FORCED_SESSION_COOKIE_VALUE } : {},
    tokenExchangeAttempts: 0,
    tokenExchangeLastAttemptAt: null,
    lastError: null,
  });

  log(`Started HTTP QR login: ${uuid}`);
  logImportant("qr-session:created", {
    uuid,
    hasForcedSessionCookie: Boolean(FORCED_SESSION_COOKIE_VALUE),
  });
  return { uuid, portrait: null, status: "no_scanned" };
}

// ---------------------------------------------------------------------------
// Phase 2: Check login status (non-blocking, polls once)
// ---------------------------------------------------------------------------

/**
 * Check current QR login status. Call periodically after startHttpQrLogin().
 * Returns updated status. When status=confirm_logined, attempts token exchange.
 */
export async function checkHttpLoginStatus(): Promise<{
  status: QrStatus;
  portrait: string | null;
  authenticated: boolean;
  ghrToken: string | null;
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  } | null;
  error: string | null;
}> {
  if (!qrSession) {
    logImportant("qr-status:no-session");
    return {
      status: "no_scanned",
      portrait: null,
      authenticated: false,
      ghrToken: null,
      user: null,
      error: "No QR session active",
    };
  }

  const { uuid } = qrSession;
  const prevStatus = qrSession.status;

  if (qrSession.ghrToken) {
    logImportant("qr-status:already-authenticated", {
      uuid,
      status: qrSession.status,
    });
    return {
      status: "confirm_logined",
      portrait: qrSession.portrait,
      authenticated: true,
      ghrToken: qrSession.ghrToken,
      user: qrSession.userInfo
        ? {
            id: qrSession.userInfo.id,
            name: qrSession.userInfo.name,
            username: qrSession.userInfo.username,
            email: qrSession.userInfo.email,
          }
        : null,
      error: null,
    };
  }

  const persistedAuth = await loadPersistedAuth();

  try {
    const { data, mToken } = await httpPost<BaobaoQrStatusResponse>(
      "/mainpart/qr_code/getQrCodeStatus",
      { uuid },
      { cookieJar: qrSession.cookies },
    );

    if (data.errno !== 0) {
      return {
        status: qrSession.status,
        portrait: qrSession.portrait,
        authenticated: false,
        ghrToken: null,
        user: null,
        error: data.errmsg,
      };
    }

    const newStatus = data.data.status;
    const newPortrait = data.data.portrait ?? qrSession.portrait;
    const newMToken = mToken ?? qrSession.mToken;

    if (FORCED_SESSION_COOKIE_VALUE) {
      qrSession.cookies.session = FORCED_SESSION_COOKIE_VALUE;
    } else if (newMToken) {
      qrSession.cookies.session = newMToken;
    }

    qrSession = {
      ...qrSession,
      status: newStatus,
      portrait: newPortrait,
      mToken: newMToken,
      confirmedAt: newStatus === "confirm_logined" && !qrSession.confirmedAt
        ? Date.now()
        : qrSession.confirmedAt,
    };

    if (newStatus !== prevStatus || newStatus === "confirm_logined") {
      logImportant("qr-status:update", {
        uuid,
        from: prevStatus,
        to: newStatus,
        hasPortrait: Boolean(newPortrait),
        hasMToken: Boolean(newMToken),
      });
    }

    if (newStatus === "confirm_logined" && !qrSession.ghrToken) {
      const retryIntervalMs = 8000;
      if (
        qrSession.tokenExchangeLastAttemptAt
        && Date.now() - qrSession.tokenExchangeLastAttemptAt < retryIntervalMs
      ) {
        return {
          status: qrSession.status,
          portrait: qrSession.portrait,
          authenticated: false,
          ghrToken: null,
          user: null,
          error: qrSession.lastError,
        };
      }

      log(`QR confirmed, attempting token exchange with m_token...`);
      logImportant("token-exchange:start", {
        uuid,
        hasMToken: Boolean(newMToken),
        hasForcedSessionCookie: Boolean(FORCED_SESSION_COOKIE_VALUE),
        hasPersistedCookies: Boolean((persistedAuth?.cookies ?? []).length),
        runtimeCookieCount: Object.keys(qrSession.cookies).length,
      });
      qrSession.tokenExchangeLastAttemptAt = Date.now();
      qrSession.tokenExchangeAttempts += 1;
      const preflightUser = await verifyLoginWithGetLoginInfo(
        persistedAuth?.cookies ?? [],
        qrSession.cookies,
        newMToken,
      );
      logImportant("token-exchange:preflight-login-info", {
        uuid,
        success: Boolean(preflightUser),
      });

      let exchangedToken: string | null = null;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        exchangedToken = await exchangeMTokenForGhrToken(
          newMToken,
          persistedAuth?.cookies ?? [],
          qrSession.cookies,
        );
        logImportant("token-exchange:round", {
          uuid,
          attempt,
          success: Boolean(exchangedToken),
        });
        if (exchangedToken) break;
        if (attempt < maxAttempts) {
          await sleep(250 * attempt);
        }
      }

      if (!exchangedToken) {
        const errorMessage = "扫码已确认，但令牌交换失败（未拿到 ghr-token）";
        qrSession.lastError = errorMessage;
        logImportant("token-exchange:final-failed", {
          uuid,
          hasMToken: Boolean(newMToken),
          message: errorMessage,
          exchangeAttempts: qrSession.tokenExchangeAttempts,
          runtimeCookieCount: Object.keys(qrSession.cookies).length,
        });
        log(`Token exchange FAILED - m_token may be HTTP-only cookie`);
        return {
          status: qrSession.status,
          portrait: qrSession.portrait,
          authenticated: false,
          ghrToken: null,
          user: null,
          error: errorMessage,
        };
      }

      const userInfo = preflightUser ?? await verifyLoginWithGetLoginInfo(
        persistedAuth?.cookies ?? [],
        qrSession.cookies,
        newMToken,
      );

      qrSession = {
        ...qrSession,
        ghrToken: exchangedToken,
        userInfo,
        lastError: null,
      };

      await cleanupQrCode(uuid);
      log(`Token exchange SUCCESS: ${exchangedToken.slice(0, 20)}...`);
    }

    if (qrSession.ghrToken) {
      return {
        status: "confirm_logined",
        portrait: qrSession.portrait,
        authenticated: true,
        ghrToken: qrSession.ghrToken,
        user: qrSession.userInfo
          ? {
              id: qrSession.userInfo.id,
              name: qrSession.userInfo.name,
              username: qrSession.userInfo.username,
              email: qrSession.userInfo.email,
            }
          : null,
        error: null,
      };
    }

    return {
      status: qrSession.status,
      portrait: qrSession.portrait,
      authenticated: false,
      ghrToken: null,
      user: null,
      error: null,
    };
  } catch (err) {
    return {
      status: qrSession.status,
      portrait: qrSession.portrait,
      authenticated: false,
      ghrToken: null,
      user: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate QR code text from UUID.
 * The QR code "text" shown to users (and encoded in the UUID) is the UUID itself.
 * For display purposes, we show: "getui_{uuid}" (e.g., "getui_login_xxx")
 */
export function getQrCodeText(uuid: string): string {
  // The actual QR code content: "getui_{uuid}"
  // e.g., "getui_login_f8ef42a4efd2405fa097f0ed1072e1eb"
  return `getui_${uuid}`;
}

// ---------------------------------------------------------------------------
// Integration helpers
// ---------------------------------------------------------------------------

/**
 * Parse JWT payload (same logic as BaobaoClient)
 */
export function parseJwtPayload(token: string): {
  exp: number;
  username: string;
  [key: string]: unknown;
} | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload as { exp: number; username: string; [key: string]: unknown };
  } catch {
    return null;
  }
}

/**
 * Check if ghr-token is expired
 */
export function isGhrTokenExpired(token: string): boolean {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 > payload.exp;
}
