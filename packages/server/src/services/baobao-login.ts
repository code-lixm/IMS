import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { desc, eq } from "drizzle-orm";
import { BaobaoClient } from "./baobao-client";
import type { BaobaoLoginResponse } from "../baobao-types";
import { db } from "../db";
import { remoteUsers } from "../schema";

const LOGIN_URL = "https://baobao.getui.com/#/login";
const QR_SELECTOR = ".qr-code";
const QR_WAIT_MS = 15000;

type ExtractionSource = "background-image" | "element-screenshot";
type LoginPhase = "pending" | "authenticated" | "error";

interface StorageSnapshot {
  href: string;
  title: string;
  bodyText: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

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
  source: ExtractionSource | null;
  fetchedAt: number | null;
  refreshed: boolean;
  currentUrl: string;
  lastCheckedAt: number;
  error: string | null;
  authenticated: AuthenticatedSession | null;
}

function emptySnapshot(): BaobaoLoginSessionSnapshot {
  return {
    status: "pending",
    imageSrc: "",
    source: null,
    fetchedAt: null,
    refreshed: false,
    currentUrl: LOGIN_URL,
    lastCheckedAt: Date.now(),
    error: null,
  authenticated: null,
  };
}

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

const DEBUG_BAOBAO = process.env.IMS_DEBUG_BAOBAO === "1";
const IMPORTANT_STAGES = new Set([
  "browser:create:success",
  "qr-expired:detected",
  "auth-check:authenticated",
  "auth-check:authenticated-by-url",
  "refresh-qr:error",
  "status-check:error",
  "session:clear:done",
  "session:restore:success",
  "session:restore:failed",
]);

function extractBackgroundUrl(backgroundImage: string | null | undefined) {
  if (!backgroundImage || backgroundImage === "none") return null;
  const match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
  return match?.[2] ?? null;
}

function toDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function logStage(stage: string, details?: Record<string, unknown>) {
  if (!DEBUG_BAOBAO && !IMPORTANT_STAGES.has(stage)) return;
  console.log("[baobao-login]", stage, details ?? {});
}

function maskToken(token: string) {
  if (token.length <= 16) return token;
  return `${token.slice(0, 8)}...${token.slice(-8)}`;
}

function isLoginPage(url: string) {
  return url.includes("#/login");
}

function isPostLoginPage(url: string) {
  return /#\/flow\/dashboard\//.test(url);
}

async function waitForQr(page: Page) {
  logStage("wait-for-qr:start", { url: page.url() });
  const qrLocator = page.locator(QR_SELECTOR);
  await qrLocator.waitFor({ state: "visible", timeout: QR_WAIT_MS });
  await page.waitForTimeout(500);
  logStage("wait-for-qr:success", { url: page.url() });
  return qrLocator;
}

async function hasExpiredText(page: Page) {
  const pageText = await page.locator("body").innerText().catch(() => "");
  return /(二维码已过期|二维码过期|已过期|已失效|刷新二维码)/.test(pageText);
}

function looksLikeJwt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const payload = BaobaoClient.parseJwtPayload(value);
  return Boolean(payload?.exp);
}

function collectTokenCandidates(input: unknown, bucket: Set<string>) {
  if (!input) return;

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (looksLikeJwt(trimmed)) {
      bucket.add(trimmed);
      return;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      collectTokenCandidates(parsed, bucket);
    } catch {
      return;
    }

    return;
  }

  if (Array.isArray(input)) {
    for (const item of input) collectTokenCandidates(item, bucket);
    return;
  }

  if (typeof input === "object") {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (typeof value === "string" && /token|auth|jwt|session/i.test(key)) {
        collectTokenCandidates(value, bucket);
      } else {
        collectTokenCandidates(value, bucket);
      }
    }
  }
}

async function readStorageSnapshot(page: Page): Promise<StorageSnapshot> {
  return page.evaluate(() => ({
    href: window.location.href,
    title: document.title,
    bodyText: document.body.innerText,
    localStorage: Object.fromEntries(
      Array.from({ length: window.localStorage.length }, (_, index) => {
        const key = window.localStorage.key(index) ?? `local-${index}`;
        return [key, window.localStorage.getItem(key) ?? ""];
      }),
    ),
    sessionStorage: Object.fromEntries(
      Array.from({ length: window.sessionStorage.length }, (_, index) => {
        const key = window.sessionStorage.key(index) ?? `session-${index}`;
        return [key, window.sessionStorage.getItem(key) ?? ""];
      }),
    ),
  }));
}

async function findToken(page: Page) {
  const snapshot = await readStorageSnapshot(page);
  const cookies = await page.context().cookies();
  const candidates = new Set<string>();

  const directStorageTokens = [
    snapshot.sessionStorage["ghr-token"],
    snapshot.localStorage["ghr-token"],
    snapshot.sessionStorage.ghrToken,
    snapshot.localStorage.ghrToken,
  ].filter((value): value is string => Boolean(value && value.trim()));

  for (const token of directStorageTokens) {
    candidates.add(token.trim());
  }

  collectTokenCandidates(snapshot.localStorage, candidates);
  collectTokenCandidates(snapshot.sessionStorage, candidates);
  collectTokenCandidates(
    cookies
      .filter((cookie) => /token|auth|jwt|session/i.test(cookie.name))
      .map((cookie) => cookie.value),
    candidates,
  );

  logStage("token-scan:complete", {
    url: snapshot.href,
    localStorageKeys: Object.keys(snapshot.localStorage),
    sessionStorageKeys: Object.keys(snapshot.sessionStorage),
    cookieNames: cookies.map((cookie) => cookie.name),
    directStorageTokenCount: directStorageTokens.length,
    tokenCandidateCount: candidates.size,
  });

  return {
    snapshot,
    tokens: Array.from(candidates),
    cookies,
  };
}

function buildCookieHeader(cookies: { name: string; value: string }[]) {
  return cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function sanitizeCookies(cookies: PersistedCookie[]) {
  return cookies.filter((cookie) => cookie.name && cookie.value && cookie.domain && cookie.path);
}

async function loadPersistedRemoteAuth() {
  const rows = await db.select().from(remoteUsers).where(eq(remoteUsers.provider, "baobao")).orderBy(desc(remoteUsers.updatedAt)).limit(1);
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

function buildHeuristicAuthenticatedSession(snapshot: StorageSnapshot, token: string): AuthenticatedSession | null {
  const payload = BaobaoClient.parseJwtPayload(token);
  if (!payload?.username) return null;

  return {
    token,
    cookies: [],
    tokenExpAt: payload.exp ? payload.exp * 1000 : null,
    user: {
      id: payload.username,
      name: payload.username,
      username: payload.username,
      email: null,
    },
    currentUrl: snapshot.href,
  };
}

async function fetchCurrentUserFromPage(page: Page): Promise<BaobaoLoginResponse | null> {
  return page.evaluate(async () => {
    const response = await fetch(`/api/usercenter/user/getLoginInfo?t=${Date.now()}`, {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
      },
    });

    const text = await response.text();
    try {
      return JSON.parse(text) as BaobaoLoginResponse;
    } catch {
      return null;
    }
  });
}

async function resolveQrImage(page: Page) {
  logStage("qr-resolve:start", { url: page.url() });
  let refreshed = false;
  let qrLocator = await waitForQr(page);

  if (await hasExpiredText(page)) {
    refreshed = true;
    logStage("qr-expired:detected", { url: page.url() });
    await page.reload({ waitUntil: "networkidle", timeout: QR_WAIT_MS });
    qrLocator = await waitForQr(page);
  }

  if (await hasExpiredText(page)) {
    throw new Error("二维码刷新后仍处于过期状态");
  }

  const backgroundUrl = await qrLocator.evaluate((element: Element) => {
    const style = window.getComputedStyle(element);
    return style.backgroundImage;
  });

  const parsedUrl = extractBackgroundUrl(backgroundUrl);
  if (parsedUrl?.startsWith("data:")) {
    logStage("qr-resolve:data-url", { refreshed, url: page.url() });
    return { imageSrc: parsedUrl, source: "background-image" as const, refreshed };
  }

  if (parsedUrl) {
    const absoluteUrl = parsedUrl.startsWith("http")
      ? parsedUrl
      : new URL(parsedUrl, page.url()).toString();
    const response = await fetch(absoluteUrl);
    if (response.ok) {
      logStage("qr-resolve:remote-url", { refreshed, url: page.url(), assetUrl: absoluteUrl });
      const arrayBuffer = await response.arrayBuffer();
      const mimeType = response.headers.get("content-type") ?? "image/png";
      return {
        imageSrc: toDataUrl(Buffer.from(arrayBuffer), mimeType),
        source: "background-image" as const,
        refreshed,
      };
    }
  }

  const screenshot = await qrLocator.screenshot({ type: "png", animations: "disabled" });
  logStage("qr-resolve:screenshot-fallback", { refreshed, url: page.url() });
  return {
    imageSrc: toDataUrl(screenshot, "image/png"),
    source: "element-screenshot" as const,
    refreshed,
  };
}

class BaobaoLoginSessionManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private pending: Promise<void> | null = null;
  private snapshot = emptySnapshot();

  private async ensurePage() {
    if (this.page && !this.page.isClosed()) return this.page;
    if (this.pending) {
      await this.pending;
      if (this.page && !this.page.isClosed()) return this.page;
    }

    this.pending = (async () => {
      logStage("browser:create:start");
      // Add timeout for browser launch to prevent hanging
      const launchTimeout = setTimeout(() => {
        logStage("browser:create:timeout", { timeout: 20000 });
        throw new Error("Browser launch timeout after 20s");
      }, 20000);

      try {
        this.browser = await chromium.launch({ headless: true });
      } finally {
        clearTimeout(launchTimeout);
      }

      this.context = await this.browser.newContext({ viewport: { width: 1440, height: 1024 } });
      const persistedAuth = await loadPersistedRemoteAuth();
      if (persistedAuth?.token) {
        await this.context.addInitScript((token: string) => {
          window.sessionStorage.setItem("ghr-token", token);
        }, persistedAuth.token);
      }
      if (persistedAuth?.cookies.length) {
        try {
          await this.context.addCookies(persistedAuth.cookies);
          logStage("session:restore:success", {
            cookieCount: persistedAuth.cookies.length,
            hasToken: Boolean(persistedAuth.token),
          });
        } catch (error) {
          logStage("session:restore:failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      this.page = await this.context.newPage();
      // Use domcontentloaded instead of networkidle to avoid hanging on persistent network requests
      await this.page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: QR_WAIT_MS });
      // Wait a bit for QR code to render
      await this.page.waitForTimeout(1000);
      logStage("browser:create:success", { url: this.page.url() });
    })();

    try {
      await this.pending;
      if (!this.page) throw new Error("Failed to create baobao login page");
      return this.page;
    } finally {
      this.pending = null;
    }
  }

  private async authenticateIfPossible(page: Page) {
    const { snapshot, tokens, cookies } = await findToken(page);
    const cookieHeader = buildCookieHeader(cookies);

    if (!tokens.length) {
      logStage("auth-check:no-token", {
        url: snapshot.href,
        title: snapshot.title,
        bodyPreview: snapshot.bodyText.slice(0, 120),
      });
      return { snapshot, authenticated: null };
    }

    for (const [index, token] of tokens.entries()) {
      logStage("auth-check:token-found", {
        url: snapshot.href,
        token: maskToken(token),
        candidateIndex: index,
        candidateCount: tokens.length,
      });

      try {
        const browserResponse = await fetchCurrentUserFromPage(page);
        if (!browserResponse || browserResponse.errno !== 0 || !browserResponse.data?.data) {
          const client = new BaobaoClient(token, { cookieHeader });
          const response = await client.getCurrentUser();
          if (response.errno !== 0 || !response.data?.data) {
            logStage("auth-check:token-invalid", {
              url: snapshot.href,
              token: maskToken(token),
              errno: response.errno,
              errmsg: response.errmsg,
              candidateIndex: index,
              via: browserResponse ? "server-fallback" : "server-only",
            });
            continue;
          }

          const payload = BaobaoClient.parseJwtPayload(token);
          logStage("auth-check:authenticated", {
            url: snapshot.href,
            token: maskToken(token),
            userId: response.data.data.id,
            username: response.data.data.username,
            candidateIndex: index,
            via: "server-fallback",
          });
          return {
            snapshot,
            authenticated: {
              token,
              cookies: sanitizeCookies(cookies as PersistedCookie[]),
              tokenExpAt: payload?.exp ? payload.exp * 1000 : null,
              user: {
                id: response.data.data.id,
                name: response.data.data.name,
                username: response.data.data.username,
                email: response.data.data.email,
              },
              currentUrl: snapshot.href,
            } satisfies AuthenticatedSession,
          };
        }

        const payload = BaobaoClient.parseJwtPayload(token);
        logStage("auth-check:authenticated", {
          url: snapshot.href,
          token: maskToken(token),
          userId: browserResponse.data.data.id,
          username: browserResponse.data.data.username,
          candidateIndex: index,
          via: "page-fetch",
        });
        return {
          snapshot,
          authenticated: {
            token,
            cookies: sanitizeCookies(cookies as PersistedCookie[]),
            tokenExpAt: payload?.exp ? payload.exp * 1000 : null,
            user: {
              id: browserResponse.data.data.id,
              name: browserResponse.data.data.name,
              username: browserResponse.data.data.username,
              email: browserResponse.data.data.email,
            },
            currentUrl: snapshot.href,
          } satisfies AuthenticatedSession,
        };
      } catch (error) {
        const heuristicAuth = isPostLoginPage(snapshot.href)
          ? buildHeuristicAuthenticatedSession(snapshot, token)
          : null;

        if (heuristicAuth) {
          logStage("auth-check:authenticated-by-url", {
            url: snapshot.href,
            token: maskToken(token),
            username: heuristicAuth.user.username,
            candidateIndex: index,
          });
          return {
            snapshot,
            authenticated: heuristicAuth,
          };
        }

        logStage("auth-check:token-invalid", {
          url: snapshot.href,
          token: maskToken(token),
          candidateIndex: index,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logStage("auth-check:no-valid-token", {
      url: snapshot.href,
      candidateCount: tokens.length,
    });
    return { snapshot, authenticated: null };
  }

  async refreshQrCode() {
    const page = await this.ensurePage();
    logStage("refresh-qr:start", { currentUrl: page.url() });

    try {
      const authResult = await this.authenticateIfPossible(page);
      if (authResult.authenticated) {
        logStage("refresh-qr:already-authenticated", {
          currentUrl: authResult.snapshot.href,
          userId: authResult.authenticated.user.id,
        });
        this.snapshot = {
          ...this.snapshot,
          status: "authenticated",
          error: null,
          currentUrl: authResult.snapshot.href,
          lastCheckedAt: Date.now(),
          authenticated: authResult.authenticated,
        };
        return this.snapshot;
      }

      if (!isLoginPage(authResult.snapshot.href)) {
        logStage("refresh-qr:skip-non-login-page", {
          currentUrl: authResult.snapshot.href,
          hasExistingImage: Boolean(this.snapshot.imageSrc),
        });
        this.snapshot = {
          ...this.snapshot,
          status: "pending",
          currentUrl: authResult.snapshot.href,
          lastCheckedAt: Date.now(),
          error: null,
          authenticated: null,
        };
        return this.snapshot;
      }

      const qr = await resolveQrImage(page);
      logStage("refresh-qr:pending", {
        currentUrl: authResult.snapshot.href,
        source: qr.source,
        refreshed: qr.refreshed,
      });
      this.snapshot = {
        status: "pending",
        imageSrc: qr.imageSrc,
        source: qr.source,
        fetchedAt: Date.now(),
        refreshed: qr.refreshed,
        currentUrl: authResult.snapshot.href,
        lastCheckedAt: Date.now(),
        error: null,
        authenticated: null,
      };
      return this.snapshot;
    } catch (error) {
      logStage("refresh-qr:error", {
        currentUrl: page.url(),
        error: error instanceof Error ? error.message : String(error),
      });
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        error: error instanceof Error ? error.message : "未知错误",
        lastCheckedAt: Date.now(),
      };
      throw error;
    }
  }

  async getStatus() {
    const page = await this.ensurePage();
    logStage("status-check:start", { currentUrl: page.url() });

    try {
      const authResult = await this.authenticateIfPossible(page);
      if (authResult.authenticated) {
        logStage("status-check:authenticated", {
          currentUrl: authResult.snapshot.href,
          userId: authResult.authenticated.user.id,
        });
        this.snapshot = {
          ...this.snapshot,
          status: "authenticated",
          error: null,
          currentUrl: authResult.snapshot.href,
          lastCheckedAt: Date.now(),
          authenticated: authResult.authenticated,
        };
        return this.snapshot;
      }

      logStage("status-check:pending", {
        currentUrl: authResult.snapshot.href,
        lastError: this.snapshot.error,
      });
      this.snapshot = {
        ...this.snapshot,
        status: this.snapshot.error ? "error" : "pending",
        currentUrl: authResult.snapshot.href,
        lastCheckedAt: Date.now(),
        authenticated: null,
      };
      return this.snapshot;
    } catch (error) {
      logStage("status-check:error", {
        currentUrl: page.url(),
        error: error instanceof Error ? error.message : String(error),
      });
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        error: error instanceof Error ? error.message : "未知错误",
        lastCheckedAt: Date.now(),
      };
      return this.snapshot;
    }
  }

  async clear() {
    logStage("session:clear:start");
    await this.page?.close().catch(() => undefined);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
    this.snapshot = emptySnapshot();
    logStage("session:clear:done");
  }
}

const baobaoLoginSessionManager = new BaobaoLoginSessionManager();

export async function fetchBaobaoLoginQrCode() {
  return baobaoLoginSessionManager.refreshQrCode();
}

export async function getBaobaoLoginSessionStatus() {
  return baobaoLoginSessionManager.getStatus();
}

export async function clearBaobaoLoginSession() {
  await baobaoLoginSessionManager.clear();
}
