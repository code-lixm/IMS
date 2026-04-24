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

async function runInitialSync(reason: string) {
  try {
    const result = await syncManager.runOnce();
    console.log(`[sync] initial sync (${reason}) done, syncedCandidates=${result.syncedCandidates} syncedInterviews=${result.syncedInterviews}`);
  } catch (error) {
    console.error(`[sync] initial sync (${reason}) failed: ${(error as Error).message}`);
  }
}

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

let startupRecoveredAuth: {
  token: string;
  tokenExpAt: number | null;
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  };
} | null = null;

if (canRestoreClient && restoredRemote?.token) {
  setBaobaoClient(new BaobaoClient(restoredRemote.token));
  getDiscovery("Interview-Manager", config.port).setLocalUserInfo(restoredRemote.username, restoredRemote.name);
  console.log("[auth:start] restored BaobaoClient from persisted token", {
    username: restoredRemote.username,
    tokenExpAt: restoredRemote.tokenExpAt,
  });
} else {
  startupRecoveredAuth = await restorePersistedHttpAuth();
  if (startupRecoveredAuth?.token) {
    setBaobaoClient(new BaobaoClient(startupRecoveredAuth.token));
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

if ((canRestoreClient && restoredRemote?.token) || startupRecoveredAuth?.token) {
  // Keep health endpoint responsive on startup; remote sync runs in background.
  queueMicrotask(() => {
    void runInitialSync("startup");
  });
}

const shutdown = async () => {
  syncManager.stop();
  server.stop();
  closeDatabase();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Main API: http://${config.host}:${config.port}`);
