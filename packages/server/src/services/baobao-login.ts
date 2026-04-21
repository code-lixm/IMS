import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { remoteUsers } from "../schema";
import {
  checkHttpLoginStatus,
  clearQrSession,
  getQrCodeText,
  getQrSession,
  isGhrTokenExpired,
  parseJwtPayload,
  restorePersistedHttpAuth,
  startHttpQrLogin,
} from "./baobao-http-login";

const LOGIN_URL = "https://baobao.getui.com/#/login";
const DEBUG_BAOBAO = process.env.IMS_DEBUG_BAOBAO === "1";

function logBaobaoLogin(stage: string, details?: Record<string, unknown>, important = false) {
  if (!important && !DEBUG_BAOBAO) return;
  console.log("[baobao-login]", stage, details ?? {});
}

type LoginPhase = "pending" | "authenticated" | "error";
type ExtractionSource = "background-image" | "element-screenshot" | "qr-text";

type PersistedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

interface AuthenticatedSession {
  token: string;
  cookies: PersistedCookie[];
  tokenExpAt: number | null;
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  };
  currentUrl: string;
}

export interface BaobaoLoginSessionSnapshot {
  status: LoginPhase;
  imageSrc: string;
  qrText: string | null;
  source: ExtractionSource | null;
  fetchedAt: number | null;
  refreshed: boolean;
  currentUrl: string;
  lastCheckedAt: number;
  error: string | null;
  authenticated: AuthenticatedSession | null;
}

function sanitizeCookies(cookies: PersistedCookie[]) {
  return cookies.filter((cookie) => cookie.name && cookie.value && cookie.domain && cookie.path);
}

function mergePersistedCookies(
  persistedCookies: PersistedCookie[],
  runtimeCookies: Record<string, string> | null | undefined,
) {
  const merged = new Map<string, PersistedCookie>();

  for (const cookie of persistedCookies) {
    merged.set(cookie.name, cookie);
  }

  for (const [name, value] of Object.entries(runtimeCookies ?? {})) {
    if (!name || !value) continue;
    merged.set(name, {
      name,
      value,
      domain: ".getui.com",
      path: "/",
      expires: 0,
      httpOnly: false,
      secure: true,
      sameSite: "None",
    });
  }

  return sanitizeCookies(Array.from(merged.values()));
}

async function loadPersistedRemoteAuth() {
  const rows = await db
    .select()
    .from(remoteUsers)
    .where(eq(remoteUsers.provider, "baobao"))
    .orderBy(desc(remoteUsers.updatedAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  let parsedCookies: PersistedCookie[] = [];
  if (row.cookieJson) {
    try {
      parsedCookies = sanitizeCookies(JSON.parse(row.cookieJson) as PersistedCookie[]);
    } catch {
      parsedCookies = [];
    }
  }

  return {
    token: row.token,
    cookies: parsedCookies,
  };
}

function buildQrImageSource(_uuid: string, portrait: string | null) {
  if (!portrait) return "";
  const normalized = portrait.trim();
  if (!normalized) return "";

  if (normalized.startsWith("data:image/")) {
    return normalized;
  }

  const compact = normalized.replace(/\s+/g, "");
  const maybeBase64 = compact.length > 128 && /^[A-Za-z0-9+/=]+$/.test(compact);
  if (maybeBase64) {
    return `data:image/png;base64,${compact}`;
  }

  // Remote image URLs are often blocked by desktop CSP. Let frontend render by qrText.
  return "";
}

function buildQrText(uuid: string) {
  return getQrCodeText(uuid);
}

function toAuthenticatedSnapshot(
  token: string,
  cookies: PersistedCookie[],
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  },
): BaobaoLoginSessionSnapshot {
  const payload = parseJwtPayload(token);
  return {
    status: "authenticated",
    imageSrc: "",
    qrText: null,
    source: null,
    fetchedAt: null,
    refreshed: false,
    currentUrl: LOGIN_URL,
    lastCheckedAt: Date.now(),
    error: null,
    authenticated: {
      token,
      cookies,
      tokenExpAt: payload?.exp ? payload.exp * 1000 : null,
      user,
      currentUrl: LOGIN_URL,
    },
  };
}

export async function fetchBaobaoLoginQrCode(): Promise<BaobaoLoginSessionSnapshot> {
  const persistedAuth = await loadPersistedRemoteAuth();
  if (persistedAuth?.token && !isGhrTokenExpired(persistedAuth.token)) {
    const payload = parseJwtPayload(persistedAuth.token);
    return toAuthenticatedSnapshot(
      persistedAuth.token,
      persistedAuth.cookies,
      {
        id: payload?.username ?? "",
        name: payload?.username ?? "",
        username: payload?.username ?? "",
        email: null,
      },
    );
  }

  const restoredSession = await restorePersistedHttpAuth();
  if (restoredSession) {
    return toAuthenticatedSnapshot(
      restoredSession.token,
      restoredSession.cookies,
      restoredSession.user,
    );
  }

  const existingSession = getQrSession();
  if (existingSession && !existingSession.ghrToken) {
    const aliveWindowMs = 5 * 60 * 1000;
    const notExpired = Date.now() - existingSession.createdAt < aliveWindowMs;
    if (existingSession.status !== "invalid_uuid" && notExpired) {
      logBaobaoLogin("qr:reuse-session", {
        uuid: existingSession.uuid,
        status: existingSession.status,
        ageMs: Date.now() - existingSession.createdAt,
      }, true);
      const imageSrc = buildQrImageSource(existingSession.uuid, existingSession.portrait);
      return {
        status: "pending",
        imageSrc,
        qrText: buildQrText(existingSession.uuid),
        source: imageSrc ? "background-image" : "qr-text",
        fetchedAt: Date.now(),
        refreshed: false,
        currentUrl: LOGIN_URL,
        lastCheckedAt: Date.now(),
        error: null,
        authenticated: null,
      };
    }
  }

  try {
    const qr = await startHttpQrLogin();
    logBaobaoLogin("qr:new-session", { uuid: qr.uuid }, true);
    const imageSrc = buildQrImageSource(qr.uuid, qr.portrait);
    return {
      status: "pending",
      imageSrc,
      qrText: buildQrText(qr.uuid),
      source: imageSrc ? "background-image" : "qr-text",
      fetchedAt: Date.now(),
      refreshed: false,
      currentUrl: LOGIN_URL,
      lastCheckedAt: Date.now(),
      error: null,
      authenticated: null,
    };
  } catch (err) {
    logBaobaoLogin("qr:new-session:error", {
      error: err instanceof Error ? err.message : String(err),
    }, true);
    return {
      status: "error",
      imageSrc: "",
      qrText: null,
      source: null,
      fetchedAt: null,
      refreshed: false,
      currentUrl: LOGIN_URL,
      lastCheckedAt: Date.now(),
      error: err instanceof Error ? err.message : String(err),
      authenticated: null,
    };
  }
}

export async function getBaobaoLoginSessionStatus(): Promise<BaobaoLoginSessionSnapshot> {
  const persistedAuth = await loadPersistedRemoteAuth();
  if (persistedAuth?.token && !isGhrTokenExpired(persistedAuth.token)) {
    logBaobaoLogin("status:persisted-auth", { hasToken: true }, true);
    const payload = parseJwtPayload(persistedAuth.token);
    return toAuthenticatedSnapshot(
      persistedAuth.token,
      persistedAuth.cookies,
      {
        id: payload?.username ?? "",
        name: payload?.username ?? "",
        username: payload?.username ?? "",
        email: null,
      },
    );
  }

  const restoredSession = await restorePersistedHttpAuth();
  if (restoredSession) {
    logBaobaoLogin("status:persisted-cookies-restored", { hasToken: true }, true);
    return toAuthenticatedSnapshot(
      restoredSession.token,
      restoredSession.cookies,
      restoredSession.user,
    );
  }

  try {
    const result = await checkHttpLoginStatus();
    logBaobaoLogin("status:http-check", {
      status: result.status,
      authenticated: result.authenticated,
      error: result.error,
      hasPortrait: Boolean(result.portrait),
    }, true);

    if (result.authenticated && result.ghrToken) {
      const payload = parseJwtPayload(result.ghrToken);
      const runtimeSession = getQrSession();
      const cookies = mergePersistedCookies(
        persistedAuth?.cookies ?? [],
        runtimeSession?.cookies,
      );
      return toAuthenticatedSnapshot(
        result.ghrToken,
        cookies,
        result.user ?? {
          id: payload?.username ?? "",
          name: payload?.username ?? "",
          username: payload?.username ?? "",
          email: null,
        },
      );
    }

    const session = getQrSession();
    const imageSrc = session ? buildQrImageSource(session.uuid, result.portrait) : "";
    return {
      status: result.error ? "error" : "pending",
      imageSrc,
      qrText: session ? buildQrText(session.uuid) : null,
      source: session ? (imageSrc ? "background-image" : "qr-text") : null,
      fetchedAt: null,
      refreshed: false,
      currentUrl: LOGIN_URL,
      lastCheckedAt: Date.now(),
      error: result.error,
      authenticated: null,
    };
  } catch (err) {
    logBaobaoLogin("status:http-check:error", {
      error: err instanceof Error ? err.message : String(err),
    }, true);
    const session = getQrSession();
    const imageSrc = session ? buildQrImageSource(session.uuid, session.portrait) : "";
    return {
      status: "error",
      imageSrc,
      qrText: session ? buildQrText(session.uuid) : null,
      source: session ? (imageSrc ? "background-image" : "qr-text") : null,
      fetchedAt: null,
      refreshed: false,
      currentUrl: LOGIN_URL,
      lastCheckedAt: Date.now(),
      error: err instanceof Error ? err.message : String(err),
      authenticated: null,
    };
  }
}

export async function clearBaobaoLoginSession() {
  clearQrSession();
}
