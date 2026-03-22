import { and, desc, eq, like, ne, or, isNull } from "drizzle-orm";
import { syncManager } from "./services/sync-manager";
import { processFile } from "./services/import/pipeline";
import { exportCandidate } from "./services/imr/exporter";
import { importIpmr } from "./services/imr/importer";
import { getDiscovery } from "./services/share/discovery";
import { sendToDevice } from "./services/share/transfer";
import { config } from "./config";
import {
  type OpenCodeManager,
} from "./services/opencode-manager";
import { db } from "./db";
import { fail, ok } from "./utils/http";
import {
  users,
  candidates,
  resumes,
  interviews,
  artifacts,
  artifactVersions,
  candidateWorkspaces,
  importBatches,
  importFileTasks,
  shareRecords,
  notifications,
} from "./schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

function now(): number {
  return Date.now();
}

// Candidate not found helper
async function candidateOrFail(id: string) {
  const row = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(and(eq(candidates.id, id), isNull(candidates.deletedAt)))
    .limit(1);
  if (!row.length) {
    return null;
  }
  return row[0];
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function route(request: Request, opencode: OpenCodeManager): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------
  if (path === "/api/health" && request.method === "GET") {
    return ok({ service: "interview-manager", status: "ok" });
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  if (path === "/api/auth/status" && request.method === "GET") {
    const row = await db.select().from(users).limit(1);
    if (!row.length) {
      return ok({ status: "unauthenticated" as const, user: null, lastValidatedAt: null });
    }
    const u = row[0];
    return ok({
      status: u.tokenStatus as "valid" | "expired" | "unauthenticated",
      user: { id: u.id, name: u.name, email: u.email },
      lastValidatedAt: u.lastSyncAt,
    });
  }

  if (path === "/api/auth/start" && request.method === "POST") {
    const requestId = `req_${crypto.randomUUID()}`;
    return ok({
      loginUrl: `https://internal.company.com/auth?requestId=${requestId}`,
      requestId,
    });
  }

  if (path === "/api/auth/complete" && request.method === "POST") {
    const body = await parseJson<{ token: string; expiresAt: number; name?: string; email?: string }>(request);
    if (!body.token) {
      return fail("VALIDATION_ERROR", "token is required", 422);
    }
    const id = `user_${crypto.randomUUID()}`;
    await db.insert(users).values({
      id,
      name: body.name ?? "User",
      email: body.email ?? null,
      tokenStatus: "valid",
      lastSyncAt: now(),
    }).onConflictDoNothing();
    return ok({ status: "valid", user: { id, name: body.name ?? "User", email: body.email ?? null } });
  }

  if (path === "/api/auth/relogin" && request.method === "POST") {
    const requestId = `req_${crypto.randomUUID()}`;
    return ok({
      loginUrl: `https://internal.company.com/auth?requestId=${requestId}`,
      requestId,
    });
  }

  if (path === "/api/auth/logout" && request.method === "POST") {
    await db.update(users).set({ tokenStatus: "unauthenticated" });
    return ok({ status: "logged_out" });
  }

  // -------------------------------------------------------------------------
  // User / Me
  // -------------------------------------------------------------------------
  if (path === "/api/me" && request.method === "GET") {
    const row = await db.select().from(users).limit(1);
    const u = row[0];
    return ok({
      user: u
        ? {
            id: u.id,
            name: u.name,
            email: u.email,
            tokenStatus: u.tokenStatus,
            lastSyncAt: u.lastSyncAt,
            settings: u.settingsJson ? JSON.parse(u.settingsJson) : {},
          }
        : null,
      syncEnabled: false,
      opencodeReady: opencode.status().running,
      opencodeVersion: null,
    });
  }

  // -------------------------------------------------------------------------
  // Sync
  // -------------------------------------------------------------------------
  if (path === "/api/sync/toggle" && request.method === "POST") {
    const body = (await parseJson<{ enabled: boolean }>(request)) ?? { enabled: false };
    if (body.enabled) {
      syncManager.start(5000);
    } else {
      syncManager.stop();
    }
    const s = syncManager.status();
    return ok({ enabled: s.enabled, intervalMs: s.intervalMs });
  }

  if (path === "/api/sync/status" && request.method === "GET") {
    return ok(syncManager.status());
  }

  if (path === "/api/sync/run" && request.method === "POST") {
    try {
      const result = await syncManager.runOnce();
      return ok({ ...result, syncAt: syncManager.getLastSyncAt() ?? now() });
    } catch (err) {
      return fail("REMOTE_SYNC_FAILED", (err as Error).message, 502);
    }
  }

  // -------------------------------------------------------------------------
  // Candidates
  // -------------------------------------------------------------------------
  if (path === "/api/candidates" && request.method === "GET") {
    const search = url.searchParams.get("search")?.trim();
    const source = url.searchParams.get("source")?.trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const offset = (page - 1) * pageSize;

    const filters = [isNull(candidates.deletedAt)];
    if (search) {
      filters.push(
        or(
          like(candidates.name, `%${search}%`),
          like(candidates.position, `%${search}%`),
          like(candidates.phone, `%${search}%`),
          like(candidates.email, `%${search}%`)
        )!
      );
    }
    if (source) {
      filters.push(eq(candidates.source, source));
    }

    const items = await db
      .select()
      .from(candidates)
      .where(and(...filters))
      .orderBy(desc(candidates.updatedAt))
      .limit(pageSize)
      .offset(offset);

    const total = items.length; // TODO: real count query

    return ok({
      items: items.map((c) => ({
        ...c,
        tags: c.tagsJson ? JSON.parse(c.tagsJson) : [],
      })),
      total,
      page,
      pageSize,
    });
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

    const id = `cand_${crypto.randomUUID()}`;
    const ts = now();
    const candidate = {
      id,
      source: body.source ?? ("local" as const),
      remoteId: null,
      name: body.name.trim(),
      phone: body.phone?.trim() ?? null,
      email: body.email?.trim() ?? null,
      position: body.position?.trim() ?? null,
      yearsOfExperience: body.yearsOfExperience ?? null,
      tagsJson: JSON.stringify(body.tags ?? []),
      createdAt: ts,
      updatedAt: ts,
    };

    await db.insert(candidates).values(candidate);
    return ok(candidate, { status: 201 });
  }

  // GET /api/candidates/:id
  const getCandidateMatch = path.match(/^\/api\/candidates\/([^/]+)$/);
  if (getCandidateMatch && request.method === "GET") {
    const id = getCandidateMatch[1];
    const cand = await candidateOrFail(id);
    if (!cand) return fail("NOT_FOUND", "candidate not found", 404);

    const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
    const resumeRows = await db.select().from(resumes).where(eq(resumes.candidateId, id));
    const interviewRows = await db
      .select()
      .from(interviews)
      .where(eq(interviews.candidateId, id))
      .orderBy(desc(interviews.scheduledAt));
    const artifactRows = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.candidateId, id))
      .orderBy(desc(artifacts.updatedAt));
    const [ws] = await db
      .select()
      .from(candidateWorkspaces)
      .where(eq(candidateWorkspaces.candidateId, id))
      .limit(1);

    return ok({
      candidate: { ...row, tags: row.tagsJson ? JSON.parse(row.tagsJson) : [] },
      resumes: resumeRows.map((r) => ({
        ...r,
        parsedData: r.parsedDataJson ? JSON.parse(r.parsedDataJson) : null,
      })),
      interviews: interviewRows.map((i) => ({
        ...i,
        interviewerIds: i.interviewerIdsJson ? JSON.parse(i.interviewerIdsJson) : [],
        manualEvaluation: i.manualEvaluationJson ? JSON.parse(i.manualEvaluationJson) : null,
      })),
      artifactsSummary: artifactRows.map((a) => ({
        ...a,
      })),
      workspace: ws
        ? { id: ws.id, status: ws.workspaceStatus, lastAccessedAt: ws.lastAccessedAt }
        : null,
    });
  }

  // PUT /api/candidates/:id
  if (getCandidateMatch && request.method === "PUT") {
    const id = getCandidateMatch[1];
    if (!(await candidateOrFail(id))) return fail("NOT_FOUND", "candidate not found", 404);

    const body = await parseJson<Record<string, unknown>>(request);
    const allowed = ["position", "yearsOfExperience", "tags", "source"];
    const updates: Record<string, unknown> = { updatedAt: now() };
    for (const key of allowed) {
      if (key in body) {
        if (key === "tags") updates.tagsJson = JSON.stringify(body[key]);
        else updates[key] = body[key];
      }
    }

    await db.update(candidates).set(updates as typeof updates).where(eq(candidates.id, id));
    const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
    return ok({ ...row, tags: row.tagsJson ? JSON.parse(row.tagsJson) : [] });
  }

  // DELETE /api/candidates/:id
  if (getCandidateMatch && request.method === "DELETE") {
    const id = getCandidateMatch[1];
    if (!(await candidateOrFail(id))) return fail("NOT_FOUND", "candidate not found", 404);
    await db.update(candidates).set({ deletedAt: now() }).where(eq(candidates.id, id));
    return ok({ id, deletedAt: now() });
  }

  // -------------------------------------------------------------------------
  // Resumes
  // -------------------------------------------------------------------------
  const resumeCandidateMatch = path.match(/^\/api\/candidates\/([^/]+)\/resumes$/);
  if (resumeCandidateMatch && request.method === "GET") {
    const candidateId = resumeCandidateMatch[1];
    if (!(await candidateOrFail(candidateId))) return fail("NOT_FOUND", "candidate not found", 404);
    const rows = await db.select().from(resumes).where(eq(resumes.candidateId, candidateId));
    return ok({
      items: rows.map((r) => ({
        ...r,
        parsedData: r.parsedDataJson ? JSON.parse(r.parsedDataJson) : null,
      })),
    });
  }

  const resumeMatch = path.match(/^\/api\/resumes\/([^/]+)$/);
  if (resumeMatch && request.method === "GET") {
    const id = resumeMatch[1];
    const [row] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "resume not found", 404);
    return ok({
      ...row,
      parsedData: row.parsedDataJson ? JSON.parse(row.parsedDataJson) : null,
    });
  }

  // -------------------------------------------------------------------------
  // Interviews
  // -------------------------------------------------------------------------
  if (resumeCandidateMatch && request.method === "POST") {
    const candidateId = resumeCandidateMatch[1];
    if (!(await candidateOrFail(candidateId))) return fail("NOT_FOUND", "candidate not found", 404);

    const body = await parseJson<{
      round?: number;
      scheduledAt?: number;
      meetingLink?: string;
      interviewerIds?: string[];
    }>(request);

    const id = `int_${crypto.randomUUID()}`;
    const ts = now();
    const interview = {
      id,
      candidateId,
      remoteId: null,
      round: body.round ?? 1,
      status: "scheduled" as const,
      scheduledAt: body.scheduledAt ?? null,
      meetingLink: body.meetingLink ?? null,
      interviewerIdsJson: JSON.stringify(body.interviewerIds ?? []),
      manualEvaluationJson: null,
      createdAt: ts,
      updatedAt: ts,
    };

    await db.insert(interviews).values(interview);
    return ok(interview, { status: 201 });
  }

  const interviewMatch = path.match(/^\/api\/interviews\/([^/]+)$/);
  if (interviewMatch && request.method === "GET") {
    const id = interviewMatch[1];
    const [row] = await db.select().from(interviews).where(eq(interviews.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "interview not found", 404);
    return ok({
      ...row,
      interviewerIds: row.interviewerIdsJson ? JSON.parse(row.interviewerIdsJson) : [],
      manualEvaluation: row.manualEvaluationJson ? JSON.parse(row.manualEvaluationJson) : null,
    });
  }

  if (interviewMatch && request.method === "PUT") {
    const id = interviewMatch[1];
    const [existing] = await db.select().from(interviews).where(eq(interviews.id, id)).limit(1);
    if (!existing) return fail("NOT_FOUND", "interview not found", 404);

    const body = await parseJson<Record<string, unknown>>(request);
    const allowed = ["status", "scheduledAt", "meetingLink", "manualEvaluation"];
    const updates: Record<string, unknown> = { updatedAt: now() };
    for (const key of allowed) {
      if (key in body) {
        if (key === "manualEvaluation") updates.manualEvaluationJson = JSON.stringify(body[key]);
        else updates[key] = body[key];
      }
    }

    await db.update(interviews).set(updates as typeof updates).where(eq(interviews.id, id));
    const [row] = await db.select().from(interviews).where(eq(interviews.id, id)).limit(1);
    return ok({
      ...row,
      interviewerIds: row.interviewerIdsJson ? JSON.parse(row.interviewerIdsJson) : [],
      manualEvaluation: row.manualEvaluationJson ? JSON.parse(row.manualEvaluationJson) : null,
    });
  }

  // GET /api/candidates/:id/interviews
  const candidateInterviewsMatch = path.match(/^\/api\/candidates\/([^/]+)\/interviews$/);
  if (candidateInterviewsMatch && request.method === "GET") {
    const candidateId = candidateInterviewsMatch[1];
    if (!(await candidateOrFail(candidateId))) return fail("NOT_FOUND", "candidate not found", 404);
    const rows = await db
      .select()
      .from(interviews)
      .where(eq(interviews.candidateId, candidateId))
      .orderBy(desc(interviews.scheduledAt));
    return ok({
      items: rows.map((i) => ({
        ...i,
        interviewerIds: i.interviewerIdsJson ? JSON.parse(i.interviewerIdsJson) : [],
        manualEvaluation: i.manualEvaluationJson ? JSON.parse(i.manualEvaluationJson) : null,
      })),
    });
  }

  // -------------------------------------------------------------------------
  // Workspace
  // -------------------------------------------------------------------------
  const workspaceMatch = path.match(/^\/api\/candidates\/([^/]+)\/workspace$/);
  if (workspaceMatch && (request.method === "POST" || request.method === "GET")) {
    const candidateId = workspaceMatch[1];
    if (!(await candidateOrFail(candidateId))) return fail("NOT_FOUND", "candidate not found", 404);

    try {
      const workspace = await opencode.ensureWorkspace(candidateId);
      return ok({ candidateId, ...workspace });
    } catch (err) {
      return fail("WORKSPACE_CREATE_FAILED", (err as Error).message, 503);
    }
  }

  // -------------------------------------------------------------------------
  // Artifacts
  // -------------------------------------------------------------------------
  const candidateArtifactsMatch = path.match(/^\/api\/candidates\/([^/]+)\/artifacts$/);
  if (candidateArtifactsMatch && request.method === "GET") {
    const candidateId = candidateArtifactsMatch[1];
    if (!(await candidateOrFail(candidateId))) return fail("NOT_FOUND", "candidate not found", 404);
    const rows = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.candidateId, candidateId))
      .orderBy(desc(artifacts.updatedAt));

    const items = await Promise.all(
      rows.map(async (a) => {
        const [latestVer] = await db
          .select()
          .from(artifactVersions)
          .where(eq(artifactVersions.artifactId, a.id))
          .orderBy(desc(artifactVersions.version))
          .limit(1);
        return {
          ...a,
          latestVersion: latestVer
            ? {
                version: latestVer.version,
                feedbackText: latestVer.feedbackText,
                createdAt: latestVer.createdAt,
              }
            : null,
        };
      })
    );

    return ok({ items });
  }

  const artifactMatch = path.match(/^\/api\/artifacts\/([^/]+)$/);
  if (artifactMatch && request.method === "GET") {
    const id = artifactMatch[1];
    const [row] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "artifact not found", 404);

    const versions = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, id))
      .orderBy(desc(artifactVersions.version));

    return ok({ artifact: row, versions });
  }

  if (artifactMatch && request.method === "POST") {
    // POST /api/artifacts/:id/feedback
    const id = artifactMatch[1];
    const body = await parseJson<{ feedback: string }>(request);
    const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
    if (!artifact) return fail("NOT_FOUND", "artifact not found", 404);

    const newVersion = artifact.currentVersion + 1;
    const [latestVer] = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, id))
      .orderBy(desc(artifactVersions.version))
      .limit(1);

    const verId = `ver_${crypto.randomUUID()}`;
    await db.insert(artifactVersions).values({
      id: verId,
      artifactId: id,
      version: newVersion,
      promptSnapshot: latestVer?.promptSnapshot ?? null,
      feedbackText: body.feedback,
      createdAt: now(),
    });

    await db
      .update(artifacts)
      .set({ currentVersion: newVersion, updatedAt: now() })
      .where(eq(artifacts.id, id));

    return ok({ artifactId: id, newVersion, status: "generating" }, { status: 202 });
  }

  // -------------------------------------------------------------------------
  // Import Batches
  // -------------------------------------------------------------------------
  if (path === "/api/import/batches" && request.method === "GET") {
    const rows = await db
      .select()
      .from(importBatches)
      .orderBy(desc(importBatches.createdAt))
      .limit(50);
    return ok({
      items: rows.map((b) => ({ ...b, autoScreen: b.autoScreen ?? false })),
    });
  }

  if (path === "/api/import/batches" && request.method === "POST") {
    const body = await parseJson<{ paths: string[]; autoScreen?: boolean }>(request);
    if (!body.paths?.length) {
      return fail("VALIDATION_ERROR", "paths is required and non-empty", 422);
    }

    const id = `batch_${crypto.randomUUID()}`;
    const ts = now();

    // Create batch record
    await db.insert(importBatches).values({
      id,
      status: "processing",
      sourceType: null,
      currentStage: "processing",
      totalFiles: body.paths.length,
      processedFiles: 0,
      successFiles: 0,
      failedFiles: 0,
      autoScreen: body.autoScreen ?? false,
      createdAt: ts,
      startedAt: ts,
    });

    // Create file tasks and kick off background processing
    for (const filePath of body.paths) {
      const taskId = `task_${crypto.randomUUID()}`;
      const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
      const fileType = ["pdf", "png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "unknown";

      await db.insert(importFileTasks).values({
        id: taskId,
        batchId: id,
        originalPath: filePath,
        normalizedPath: null,
        fileType,
        status: "queued",
        stage: null,
        errorCode: null,
        errorMessage: null,
        candidateId: null,
        resultJson: null,
        retryCount: 0,
        createdAt: ts,
        updatedAt: ts,
      });

      // Process in background (fire and forget)
      void processFile(taskId, filePath, fileType as "pdf" | "png" | "jpg" | "jpeg" | "webp" | "unknown").catch(
        (err) => console.error(`[import] file processing error: ${err.message}`)
      );
    }

    return ok({ id, status: "processing", totalFiles: body.paths.length, autoScreen: body.autoScreen ?? false, createdAt: ts }, { status: 201 });
  }

  const batchMatch = path.match(/^\/api\/import\/batches\/([^/]+)$/);
  if (batchMatch && request.method === "GET") {
    const id = batchMatch[1];
    const [row] = await db.select().from(importBatches).where(eq(importBatches.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "batch not found", 404);
    return ok({ ...row, autoScreen: row.autoScreen ?? false });
  }

  const batchFilesMatch = path.match(/^\/api\/import\/batches\/([^/]+)\/files$/);
  if (batchFilesMatch && request.method === "GET") {
    const batchId = batchFilesMatch[1];
    const rows = await db
      .select()
      .from(importFileTasks)
      .where(eq(importFileTasks.batchId, batchId))
      .orderBy(desc(importFileTasks.createdAt));
    return ok({ items: rows });
  }

  if (batchMatch && request.method === "POST") {
    const id = batchMatch[1];
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id)).limit(1);
    if (!batch) return fail("NOT_FOUND", "batch not found", 404);

    // Detect cancel vs retry-failed from URL
    if (path.endsWith("/cancel")) {
      await db.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, id));
      return ok({ id, status: "cancelled" });
    }
    if (path.endsWith("/retry-failed")) {
      // TODO: re-enqueue failed tasks
      return ok({ retriedCount: 0 });
    }
    return fail("NOT_FOUND", "route not found", 404);
  }

  // -------------------------------------------------------------------------
  // Share
  // -------------------------------------------------------------------------
  if (path === "/api/share/devices" && request.method === "GET") {
    const discovery = getDiscovery("Interview-Manager", config.port);
    const online = discovery.getDevices();
    return ok({
      recentContacts: [], // TODO: load from share records
      onlineDevices: online.map((d) => ({
        id: d.deviceId,
        name: d.deviceName,
        ip: d.ip,
        port: d.apiPort,
      })),
    });
  }

  if (path === "/api/share/discover/start" && request.method === "POST") {
    const discovery = getDiscovery("Interview-Manager", config.port);
    await discovery.startDiscovery();
    return ok({ status: "discovering" });
  }

  if (path === "/api/share/discover/stop" && request.method === "POST") {
    const discovery = getDiscovery("Interview-Manager", config.port);
    await discovery.stopDiscovery();
    return ok({ status: "stopped" });
  }

  if (path === "/api/share/export" && request.method === "POST") {
    const body = await parseJson<{ candidateId: string }>(request);
    if (!body.candidateId) return fail("VALIDATION_ERROR", "candidateId is required", 422);
    if (!(await candidateOrFail(body.candidateId))) return fail("NOT_FOUND", "candidate not found", 404);
    try {
      const filePath = await exportCandidate(body.candidateId);
      const { statSync } = await import("node:fs");
      const fileSize = statSync(filePath).size;
      return ok({ filePath, fileSize });
    } catch (err) {
      return fail("SHARE_EXPORT_FAILED", (err as Error).message, 500);
    }
  }

  if (path === "/api/share/send" && request.method === "POST") {
    const body = await parseJson<{
      candidateId: string;
      target: { ip: string; port: number; deviceId?: string; name: string };
    }>(request);
    if (!body.candidateId || !body.target) {
      return fail("VALIDATION_ERROR", "candidateId and target are required", 422);
    }
    if (!(await candidateOrFail(body.candidateId))) {
      return fail("NOT_FOUND", "candidate not found", 404);
    }

    // Generate .imr then transfer
    try {
      const imrPath = await exportCandidate(body.candidateId);
      const result = await sendToDevice(body.candidateId, body.target as any, imrPath);
      return ok({
        recordId: result.recordId,
        status: result.success ? "success" : "failed",
        error: result.error,
        transferredAt: result.success ? Date.now() : null,
      });
    } catch (err) {
      return fail("SHARE_DEVICE_OFFLINE", (err as Error).message, 503);
    }
  }

  if (path === "/api/share/import" && request.method === "POST") {
    const body = await parseJson<{ filePath: string }>(request);
    if (!body.filePath) return fail("VALIDATION_ERROR", "filePath is required", 422);
    const result = await importIpmr(body.filePath);
    if (result.result === "failed") {
      return fail("SHARE_IMPORT_FAILED", result.error, 422);
    }
    return ok(result);
  }

  if (path === "/api/share/records" && request.method === "GET") {
    const rows = await db.select().from(shareRecords).orderBy(desc(shareRecords.createdAt)).limit(50);
    return ok({
      items: rows.map((r) => ({
        ...r,
        targetDevice: r.targetDeviceJson ? JSON.parse(r.targetDeviceJson) : null,
      })),
    });
  }

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------
  if (path === "/api/notifications" && request.method === "GET") {
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const filters = unreadOnly ? [isNull(notifications.readAt)] : [];
    const rows = await db
      .select()
      .from(notifications)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    const unreadCount = (
      await db.select().from(notifications).where(isNull(notifications.readAt))
    ).length;
    return ok({ items: rows, unreadCount });
  }

  const notifMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (notifMatch && request.method === "POST") {
    const id = notifMatch[1];
    await db.update(notifications).set({ readAt: now() }).where(eq(notifications.id, id));
    return ok({ id, readAt: now() });
  }

  if (path === "/api/notifications/read-all" && request.method === "POST") {
    await db.update(notifications).set({ readAt: now() }).where(isNull(notifications.readAt));
    return ok({ status: "ok" });
  }

  if (path === "/api/indicator" && request.method === "GET") {
    const opencodeRunning = opencode.status().running;
    return ok({
      status: opencodeRunning ? "green" : "gray",
      reasons: opencodeRunning ? ["opencode_ready"] : ["idle"],
    });
  }

  // -------------------------------------------------------------------------
  // OpenCode System
  // -------------------------------------------------------------------------
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

  if (path === "/api/system/opencode/restart" && request.method === "POST") {
    try {
      await opencode.stop();
      await opencode.start();
      return ok(opencode.status());
    } catch (error) {
      return fail("SYSTEM_OPENCODE_NOT_READY", (error as Error).message, 503);
    }
  }

  if (path === "/api/system/opencode/stop" && request.method === "POST") {
    await opencode.stop();
    return ok({ running: false });
  }

  // -------------------------------------------------------------------------
  // 404
  // -------------------------------------------------------------------------
  return fail("NOT_FOUND", "route not found", 404);
}
