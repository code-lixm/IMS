import { and, desc, eq, like, or } from "drizzle-orm";
import { candidates } from "./schema";
import { db } from "./db";
import { fail, ok, options } from "./utils/http";
import type { OpenCodeManager } from "./services/opencode-manager";

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

export async function route(request: Request, opencode: OpenCodeManager): Promise<Response> {
  if (request.method === "OPTIONS") {
    return options();
  }

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/health" && request.method === "GET") {
    return ok({ service: "interview-manager", status: "ok" });
  }

  if (path === "/api/system/opencode/status" && request.method === "GET") {
    return ok(opencode.status());
  }

  if (path === "/api/system/opencode/start" && request.method === "POST") {
    try {
      await opencode.start();
      return ok(opencode.status());
    } catch (error) {
      return fail("SYSTEM_OPENCODE_NOT_READY", (error as Error).message, 503);
    }
  }

  if (path === "/api/system/opencode/stop" && request.method === "POST") {
    await opencode.stop();
    return ok(opencode.status());
  }

  if (path === "/api/candidates" && request.method === "GET") {
    const search = url.searchParams.get("search")?.trim();
    const source = url.searchParams.get("source")?.trim();

    const filters = [];
    if (search) {
      filters.push(
        or(
          like(candidates.name, `%${search}%`),
          like(candidates.position, `%${search}%`),
          like(candidates.phone, `%${search}%`),
          like(candidates.email, `%${search}%`)
        )
      );
    }
    if (source) {
      filters.push(eq(candidates.source, source));
    }

    const rows = filters.length
      ? await db
          .select()
          .from(candidates)
          .where(and(...filters))
          .orderBy(desc(candidates.updatedAt))
      : await db.select().from(candidates).orderBy(desc(candidates.updatedAt));

    return ok(rows);
  }

  if (path === "/api/candidates" && request.method === "POST") {
    type CreateCandidateInput = {
      name: string;
      phone?: string;
      email?: string;
      position?: string;
      yearsOfExperience?: number;
      source?: "local" | "remote" | "hybrid";
      tags?: string[];
    };

    const body = await parseJson<CreateCandidateInput>(request);
    if (!body.name?.trim()) {
      return fail("VALIDATION_ERROR", "name is required", 422);
    }

    const now = Date.now();
    const candidate = {
      id: `cand_${crypto.randomUUID()}`,
      source: body.source ?? "local",
      remoteId: null,
      name: body.name.trim(),
      phone: body.phone?.trim() ?? null,
      email: body.email?.trim() ?? null,
      position: body.position?.trim() ?? null,
      yearsOfExperience: body.yearsOfExperience ?? null,
      tagsJson: JSON.stringify(body.tags ?? []),
      createdAt: now,
      updatedAt: now
    };

    await db.insert(candidates).values(candidate);
    return ok(candidate, { status: 201 });
  }

  const workspaceMatch = path.match(/^\/api\/candidates\/([^/]+)\/workspace$/);
  if (workspaceMatch && (request.method === "POST" || request.method === "GET")) {
    const candidateId = workspaceMatch[1];
    const target = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.id, candidateId)).limit(1);
    if (!target.length) {
      return fail("NOT_FOUND", "candidate not found", 404);
    }

    try {
      const workspace = await opencode.ensureWorkspace(candidateId);
      return ok({ candidateId, ...workspace });
    } catch (error) {
      return fail("WORKSPACE_CREATE_FAILED", (error as Error).message, 503);
    }
  }

  if (path === "/api/sync/toggle" && request.method === "POST") {
    const body = (await parseJson<{ enabled: boolean }>(request)) ?? { enabled: false };
    return ok({ enabled: Boolean(body.enabled), intervalMs: 5000 });
  }

  if (path === "/api/auth/status" && request.method === "GET") {
    return ok({ status: "unauthenticated" as const });
  }

  return fail("NOT_FOUND", "route not found", 404);
}
