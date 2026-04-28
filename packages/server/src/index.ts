import { existsSync } from "node:fs";
import { join } from "node:path";
import { desc, eq } from "drizzle-orm";
import "./db";
import { route } from "./routes";
import { closeDatabase, db } from "./db";
import { remoteUsers } from "./schema";
import { config } from "./config";
import { BaobaoClient, setBaobaoClient } from "./services/baobao-client";
import { restorePersistedHttpAuth } from "./services/baobao-http-login";
import { getDiscovery } from "./services/share/discovery";
import { syncManager } from "./services/sync-manager";
import { logError, logInfo, logWarn } from "./utils/logger";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildCookieHeader(cookieJson: string | null): string | null {
  if (!cookieJson?.trim()) return null;

  try {
    const parsed = JSON.parse(cookieJson) as unknown;
    if (!Array.isArray(parsed)) return null;

    const cookies: string[] = [];
    for (const item of parsed) {
      if (!isRecord(item)) continue;
      const name = readString(item.name);
      const value = readString(item.value);
      if (name && value) {
        cookies.push(`${name}=${value}`);
      }
    }

    return cookies.length ? cookies.join("; ") : null;
  } catch (error) {
    logWarn("auth.cookie.parse_failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

logInfo("server.starting", { host: config.host, port: config.port });

const persistedRemote = await db
  .select()
  .from(remoteUsers)
  .where(eq(remoteUsers.provider, "baobao"))
  .orderBy(desc(remoteUsers.updatedAt))
  .limit(1);

const restoredRemote = persistedRemote[0];
const canRestoreClient = Boolean(
  restoredRemote?.token
  && restoredRemote.tokenExpAt
  && Date.now() <= restoredRemote.tokenExpAt,
);

console.log("[auth:start] remote auth snapshot", {
  found: Boolean(restoredRemote),
  username: restoredRemote?.username ?? null,
  hasToken: Boolean(restoredRemote?.token),
  tokenExpAt: restoredRemote?.tokenExpAt ?? null,
  tokenExpired: restoredRemote?.tokenExpAt ? Date.now() > restoredRemote.tokenExpAt : null,
  hasCookies: Boolean(restoredRemote?.cookieJson),
  canRestoreClient,
});
logInfo("auth.start.snapshot", {
  found: Boolean(restoredRemote),
  hasUsername: Boolean(restoredRemote?.username),
  hasToken: Boolean(restoredRemote?.token),
  tokenExpAt: restoredRemote?.tokenExpAt ?? null,
  tokenExpired: restoredRemote?.tokenExpAt ? Date.now() > restoredRemote.tokenExpAt : null,
  hasCookies: Boolean(restoredRemote?.cookieJson),
  canRestoreClient,
});

let startupRecoveredAuth: {
  token: string;
  tokenExpAt: number | null;
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  };
  cookies: Array<{ name: string; value: string }>;
} | null = null;

if (canRestoreClient && restoredRemote?.token) {
  setBaobaoClient(new BaobaoClient(restoredRemote.token, { cookieHeader: buildCookieHeader(restoredRemote.cookieJson) }));
  getDiscovery("Interview-Manager", config.port).setLocalUserInfo(restoredRemote.username, restoredRemote.name);
  console.log("[auth:start] restored BaobaoClient from persisted token", {
    username: restoredRemote.username,
    tokenExpAt: restoredRemote.tokenExpAt,
  });
} else {
  startupRecoveredAuth = await restorePersistedHttpAuth();
  if (startupRecoveredAuth?.token) {
    const recoveredCookieHeader = startupRecoveredAuth.cookies
      .filter((cookie) => cookie.name && cookie.value)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    setBaobaoClient(new BaobaoClient(startupRecoveredAuth.token, { cookieHeader: recoveredCookieHeader || null }));
    getDiscovery("Interview-Manager", config.port).setLocalUserInfo(
      startupRecoveredAuth.user.username,
      startupRecoveredAuth.user.name,
    );
    console.log("[auth:start] restored BaobaoClient from persisted cookies", {
      username: startupRecoveredAuth.user.username,
      tokenExpAt: startupRecoveredAuth.tokenExpAt,
    });
  } else {
    console.log("[auth:start] no recoverable persisted auth for BaobaoClient");
    logWarn("auth.start.restore_failed", { reason: "no_recoverable_persisted_auth" });
  }
}

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return route(request);
    }
    const htmlPath = join(process.cwd(), "web", "public", "index.html");
    if (existsSync(htmlPath)) {
      return new Response(Bun.file(htmlPath), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response("Interview Manager is running", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  },
});

// Startup only restores Baobao auth state. Remote Baobao business API sync is
// intentionally left to explicit user-triggered sync endpoints.

const shutdown = async () => {
  logInfo("server.shutdown.start");
  try {
    syncManager.stop();
    server.stop();
    closeDatabase();
    logInfo("server.shutdown.finish");
    process.exit(0);
  } catch (error) {
    logError("server.shutdown.error", error);
    process.exit(1);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Main API: http://${config.host}:${config.port}`);
logInfo("server.started", { url: `http://${config.host}:${config.port}` });
