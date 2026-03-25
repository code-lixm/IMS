import { existsSync } from "node:fs";
import { join } from "node:path";
import { desc, eq } from "drizzle-orm";
import "./db";
import { route } from "./routes";
import { db } from "./db";
import { remoteUsers } from "./schema";
import { config } from "./config";
import { BaobaoClient, setBaobaoClient } from "./services/baobao-client";
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
if (restoredRemote?.token) {
  setBaobaoClient(new BaobaoClient(restoredRemote.token));
  getDiscovery("Interview-Manager", config.port).setLocalUserInfo(restoredRemote.username, restoredRemote.name);
  await runInitialSync("startup");
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

const shutdown = async () => {
  syncManager.stop();
  server.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Main API: http://${config.host}:${config.port}`);
