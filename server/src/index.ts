import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";
import "./db";
import { route } from "./routes";
import { OpenCodeManager } from "./services/opencode-manager";

const opencode = new OpenCodeManager();

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return route(request, opencode);
    }

    const htmlPath = join(process.cwd(), "web", "public", "index.html");
    if (existsSync(htmlPath)) {
      return new Response(Bun.file(htmlPath), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    return new Response("Interview Manager is running", {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
});

const shutdown = async () => {
  server.stop();
  await opencode.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Main API: http://${config.host}:${config.port}`);
