import { and, desc, eq, like, isNull } from "drizzle-orm";
import { syncManager } from "./services/sync-manager";
import { processFile } from "./services/import/pipeline";
import { exportCandidate } from "./services/imr/exporter";
import { importIpmr } from "./services/imr/importer";
import { getDiscovery } from "./services/share/discovery";
import { sendToDevice } from "./services/share/transfer";
import { BaobaoClient, setBaobaoClient, getBaobaoClient } from "./services/baobao-client";
import { config } from "./config";
import { db } from "./db";
import { ok, fail } from "./utils/http";
import {
  users, candidates, resumes, interviews, artifacts, artifactVersions,
  candidateWorkspaces, importBatches, importFileTasks, shareRecords, notifications,
  remoteUsers,
} from "./schema";
import type { OpenCodeManager } from "./services/opencode-manager";

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

async function candidateOrFail(id: string) {
  const row = await db.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.id, id), isNull(candidates.deletedAt))).limit(1);
  if (!row.length) return null;
  return row[0];
}

export async function route(request: Request, opencode: OpenCodeManager): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // Health
  if (path === "/api/health" && request.method === "GET") return ok({ service: "interview-manager", status: "ok" });

  // Auth
  if (path === "/api/auth/status" && request.method === "GET") {
    const row = await db.select().from(users).limit(1);
    if (!row.length) return ok({ status: "unauthenticated" as const, user: null, lastValidatedAt: null });
    const u = row[0];
    return ok({ status: u.tokenStatus as "valid" | "expired" | "unauthenticated", user: { id: u.id, name: u.name, email: u.email }, lastValidatedAt: u.lastSyncAt });
  }

  if (path === "/api/auth/start" && request.method === "POST") {
    const requestId = `req_${crypto.randomUUID()}`;
    return ok({ loginUrl: `https://internal.company.com/auth?requestId=${requestId}`, requestId });
  }

  if (path === "/api/auth/complete" && request.method === "POST") {
    const body = await parseJson<{ token: string; expiresAt: number; name?: string; email?: string }>(request);
    if (!body.token) return fail("VALIDATION_ERROR", "token is required", 422);
    const id = `user_${crypto.randomUUID()}`;
    await db.insert(users).values({ id, name: body.name ?? "User", email: body.email ?? null, tokenStatus: "valid", lastSyncAt: Date.now() }).onConflictDoNothing();
    return ok({ status: "valid" as const, user: { id, name: body.name ?? "User", email: body.email ?? null } });
  }

  if (path === "/api/auth/relogin" && request.method === "POST") {
    const requestId = `req_${crypto.randomUUID()}`;
    return ok({ loginUrl: `https://internal.company.com/auth?requestId=${requestId}`, requestId });
  }

  if (path === "/api/auth/logout" && request.method === "POST") {
    await db.update(users).set({ tokenStatus: "unauthenticated" });
    return ok({ status: "logged_out" });
  }

  // Baobao Auth
  if (path === "/api/auth/baobao/status" && request.method === "GET") {
    const row = await db.select().from(remoteUsers).where(eq(remoteUsers.provider, "baobao")).limit(1);
    if (!row.length) return ok({ connected: false as const, user: null });
    const remote = row[0];
    const isExpired = remote.tokenExpAt ? Date.now() > remote.tokenExpAt : true;
    const userData = remote.userDataJson ? JSON.parse(remote.userDataJson) : null;
    return ok({
      connected: !isExpired,
      user: { id: remote.id, name: remote.name, username: remote.username, email: remote.email, userData: userData },
      tokenExpAt: remote.tokenExpAt,
    });
  }

  if (path === "/api/auth/baobao/connect" && request.method === "POST") {
    const body = await parseJson<{ token: string }>(request);
    if (!body.token) return fail("VALIDATION_ERROR", "token is required", 422);

    // Validate token by calling Baobao API
    const client = new BaobaoClient(body.token);
    try {
      const response = await client.getCurrentUser();
      if (response.errno !== 0 || !response.data?.data) {
        return fail("AUTH_INVALID", "Invalid baobao token", 401);
      }

      const baobaoUser = response.data.data;
      const payload = BaobaoClient.parseJwtPayload(body.token);
      const tokenExpAt = payload?.exp ? payload.exp * 1000 : null;

      // Upsert remote user
      const existing = await db.select().from(remoteUsers).where(eq(remoteUsers.provider, "baobao")).limit(1);
      const now = Date.now();

      if (existing.length) {
        await db.update(remoteUsers)
          .set({ token: body.token, tokenExpAt, userDataJson: JSON.stringify(baobaoUser), updatedAt: now })
          .where(eq(remoteUsers.provider, "baobao"));
      } else {
        await db.insert(remoteUsers).values({
          id: `remote_${crypto.randomUUID()}`,
          provider: "baobao",
          name: baobaoUser.name,
          username: baobaoUser.username,
          email: baobaoUser.email,
          remoteId: baobaoUser.id,
          token: body.token,
          tokenExpAt,
          userDataJson: JSON.stringify(baobaoUser),
          createdAt: now,
          updatedAt: now,
        });
      }

      // Set global client instance
      setBaobaoClient(client);

      // Update discovery service with user info for LAN sharing
      const discovery = getDiscovery("Interview-Manager", config.port);
      discovery.setLocalUserInfo(baobaoUser.username, baobaoUser.name);

      return ok({
        status: "valid" as const,
        user: { id: baobaoUser.id, name: baobaoUser.name, username: baobaoUser.username, email: baobaoUser.email },
        tokenExpAt,
      });
    } catch (err) {
      return fail("AUTH_INVALID", `Failed to validate token: ${(err as Error).message}`, 401);
    }
  }

  if (path === "/api/auth/baobao/disconnect" && request.method === "POST") {
    await db.delete(remoteUsers).where(eq(remoteUsers.provider, "baobao"));
    setBaobaoClient(null);
    return ok({ status: "disconnected" });
  }

  // Me
  if (path === "/api/me" && request.method === "GET") {
    const row = await db.select().from(users).limit(1);
    const u = row[0];
    return ok({ user: u ? { id: u.id, name: u.name, email: u.email, tokenStatus: u.tokenStatus, lastSyncAt: u.lastSyncAt, settings: u.settingsJson ? JSON.parse(u.settingsJson) : {} } : null, syncEnabled: false, opencodeReady: opencode.status().running, opencodeVersion: null });
  }

  // Sync
  if (path === "/api/sync/toggle" && request.method === "POST") {
    const body = await parseJson<{ enabled: boolean }>(request) ?? { enabled: false };
    if (body.enabled) syncManager.start(5000); else syncManager.stop();
    const s = syncManager.status();
    return ok({ enabled: s.enabled, intervalMs: s.intervalMs });
  }

  if (path === "/api/sync/status" && request.method === "GET") return ok(syncManager.status());

  if (path === "/api/sync/run" && request.method === "POST") {
    try { const result = await syncManager.runOnce(); return ok({ ...result, syncAt: syncManager.getLastSyncAt() ?? Date.now() }); }
    catch (err) { return fail("REMOTE_SYNC_FAILED", (err as Error).message, 502); }
  }

  // Candidates
  if (path === "/api/candidates" && request.method === "GET") {
    const search = url.searchParams.get("search")?.trim();
    const source = url.searchParams.get("source")?.trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const offset = (page - 1) * pageSize;
    const filters = [isNull(candidates.deletedAt)];
    if (search) filters.push(like(candidates.name, `%${search}%`) as any);
    if (source) filters.push(eq(candidates.source, source) as any);
    const items = await db.select().from(candidates).where(and(...filters)).orderBy(desc(candidates.updatedAt)).limit(pageSize).offset(offset);
    return ok({ items: items.map(c => ({ ...c, tags: c.tagsJson ? JSON.parse(c.tagsJson) : [] })), total: items.length, page, pageSize });
  }

  if (path === "/api/candidates" && request.method === "POST") {
    const body = await parseJson<{ name: string; phone?: string; email?: string; position?: string; yearsOfExperience?: number; source?: "local" | "remote" | "hybrid"; tags?: string[] }>(request);
    if (!body.name?.trim()) return fail("VALIDATION_ERROR", "name is required", 422);
    const id = `cand_${crypto.randomUUID()}`;
    const ts = Date.now();
    await db.insert(candidates).values({ id, source: body.source ?? "local", remoteId: null, name: body.name.trim(), phone: body.phone?.trim() ?? null, email: body.email?.trim() ?? null, position: body.position?.trim() ?? null, yearsOfExperience: body.yearsOfExperience ?? null, tagsJson: JSON.stringify(body.tags ?? []), createdAt: ts, updatedAt: ts });
    return ok({ id, source: body.source ?? "local", name: body.name.trim() }, { status: 201 });
  }

  // GET/PUT/DELETE /api/candidates/:id
  const candMatch = path.match(/^\/api\/candidates\/([^/]+)$/);
  if (candMatch && request.method === "GET") {
    const id = candMatch[1];
    if (!(await candidateOrFail(id))) return fail("NOT_FOUND", "candidate not found", 404);
    const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
    const resumeRows = await db.select().from(resumes).where(eq(resumes.candidateId, id));
    const interviewRows = await db.select().from(interviews).where(eq(interviews.candidateId, id)).orderBy(desc(interviews.scheduledAt));
    const artifactRows = await db.select().from(artifacts).where(eq(artifacts.candidateId, id)).orderBy(desc(artifacts.updatedAt));
    const [ws] = await db.select().from(candidateWorkspaces).where(eq(candidateWorkspaces.candidateId, id)).limit(1);
    return ok({ candidate: { ...row, tags: row.tagsJson ? JSON.parse(row.tagsJson) : [] }, resumes: resumeRows.map(r => ({ ...r, parsedData: r.parsedDataJson ? JSON.parse(r.parsedDataJson) : null })), interviews: interviewRows.map(i => ({ ...i, interviewerIds: i.interviewerIdsJson ? JSON.parse(i.interviewerIdsJson) : [], manualEvaluation: i.manualEvaluationJson ? JSON.parse(i.manualEvaluationJson) : null })), artifactsSummary: artifactRows, workspace: ws ? { id: ws.id, status: ws.workspaceStatus, lastAccessedAt: ws.lastAccessedAt } : null });
  }

  if (candMatch && request.method === "PUT") {
    const id = candMatch[1];
    if (!(await candidateOrFail(id))) return fail("NOT_FOUND", "candidate not found", 404);
    const body = await parseJson<Record<string, unknown>>(request);
    const allowed = ["position", "yearsOfExperience", "tags", "source"];
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const key of allowed) {
      if (key in body) updates[key === "tags" ? "tagsJson" : key] = key === "tags" ? JSON.stringify(body[key]) : body[key];
    }
    await db.update(candidates).set(updates as any).where(eq(candidates.id, id));
    const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
    return ok({ ...row, tags: row.tagsJson ? JSON.parse(row.tagsJson) : [] });
  }

  if (candMatch && request.method === "DELETE") {
    const id = candMatch[1];
    if (!(await candidateOrFail(id))) return fail("NOT_FOUND", "candidate not found", 404);
    await db.update(candidates).set({ deletedAt: Date.now() }).where(eq(candidates.id, id));
    return ok({ id, deletedAt: Date.now() });
  }

  // Resumes
  const resumeCandMatch = path.match(/^\/api\/candidates\/([^/]+)\/resumes$/);
  if (resumeCandMatch && request.method === "GET") {
    const cid = resumeCandMatch[1];
    if (!(await candidateOrFail(cid))) return fail("NOT_FOUND", "candidate not found", 404);
    const rows = await db.select().from(resumes).where(eq(resumes.candidateId, cid));
    return ok({ items: rows.map(r => ({ ...r, parsedData: r.parsedDataJson ? JSON.parse(r.parsedDataJson) : null })) });
  }

  const resumeMatch = path.match(/^\/api\/resumes\/([^/]+)$/);
  if (resumeMatch && request.method === "GET") {
    const id = resumeMatch[1];
    const [row] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "resume not found", 404);
    return ok({ ...row, parsedData: row.parsedDataJson ? JSON.parse(row.parsedDataJson) : null });
  }

  const resumeDownloadMatch = path.match(/^\/api\/resumes\/([^/]+)\/download$/);
  if (resumeDownloadMatch && request.method === "GET") {
    const id = resumeDownloadMatch[1];
    const [row] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "resume not found", 404);
    const { statSync, existsSync } = await import("node:fs");
    if (!existsSync(row.filePath)) return fail("NOT_FOUND", "file not found on disk", 404);
    const stat = statSync(row.filePath);
    const file = Bun.file(row.filePath);
    return new Response(file, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(row.fileName ?? "resume")}"`,
        "Content-Length": String(stat.size),
      },
    });
  }

  // Interviews
  const intCandMatch = path.match(/^\/api\/candidates\/([^/]+)\/interviews$/);
  if (intCandMatch && request.method === "GET") {
    const cid = intCandMatch[1];
    if (!(await candidateOrFail(cid))) return fail("NOT_FOUND", "candidate not found", 404);
    const rows = await db.select().from(interviews).where(eq(interviews.candidateId, cid)).orderBy(desc(interviews.scheduledAt));
    return ok({ items: rows.map(i => ({ ...i, interviewerIds: i.interviewerIdsJson ? JSON.parse(i.interviewerIdsJson) : [], manualEvaluation: i.manualEvaluationJson ? JSON.parse(i.manualEvaluationJson) : null })) });
  }

  if (intCandMatch && request.method === "POST") {
    const cid = intCandMatch[1];
    if (!(await candidateOrFail(cid))) return fail("NOT_FOUND", "candidate not found", 404);
    const body = await parseJson<{ round?: number; scheduledAt?: number; meetingLink?: string; interviewerIds?: string[] }>(request);
    const id = `int_${crypto.randomUUID()}`;
    const ts = Date.now();
    await db.insert(interviews).values({ id, candidateId: cid, remoteId: null, round: body.round ?? 1, status: "scheduled", scheduledAt: body.scheduledAt ?? null, meetingLink: body.meetingLink ?? null, interviewerIdsJson: JSON.stringify(body.interviewerIds ?? []), manualEvaluationJson: null, createdAt: ts, updatedAt: ts });
    return ok({ id, candidateId: cid }, { status: 201 });
  }

  const intMatch = path.match(/^\/api\/interviews\/([^/]+)$/);
  if (intMatch && request.method === "GET") {
    const [row] = await db.select().from(interviews).where(eq(interviews.id, intMatch[1])).limit(1);
    if (!row) return fail("NOT_FOUND", "interview not found", 404);
    return ok({ ...row, interviewerIds: row.interviewerIdsJson ? JSON.parse(row.interviewerIdsJson) : [], manualEvaluation: row.manualEvaluationJson ? JSON.parse(row.manualEvaluationJson) : null });
  }

  if (intMatch && request.method === "PUT") {
    const [existing] = await db.select().from(interviews).where(eq(interviews.id, intMatch[1])).limit(1);
    if (!existing) return fail("NOT_FOUND", "interview not found", 404);
    const body = await parseJson<Record<string, unknown>>(request);
    const allowed = ["status", "scheduledAt", "meetingLink", "manualEvaluation"];
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const key of allowed) {
      if (key in body) updates[key === "manualEvaluation" ? "manualEvaluationJson" : key] = key === "manualEvaluation" ? JSON.stringify(body[key]) : body[key];
    }
    await db.update(interviews).set(updates as any).where(eq(interviews.id, intMatch[1]));
    const [row] = await db.select().from(interviews).where(eq(interviews.id, intMatch[1])).limit(1);
    return ok({ ...row, interviewerIds: row.interviewerIdsJson ? JSON.parse(row.interviewerIdsJson) : [], manualEvaluation: row.manualEvaluationJson ? JSON.parse(row.manualEvaluationJson) : null });
  }

  // Workspace
  const wsMatch = path.match(/^\/api\/candidates\/([^/]+)\/workspace$/);
  if (wsMatch && (request.method === "POST" || request.method === "GET")) {
    const cid = wsMatch[1];
    if (!(await candidateOrFail(cid))) return fail("NOT_FOUND", "candidate not found", 404);
    try { const workspace = await opencode.ensureWorkspace(cid); return ok({ candidateId: cid, ...workspace }); }
    catch (err) { return fail("WORKSPACE_CREATE_FAILED", (err as Error).message, 503); }
  }

  // Artifacts
  const artCandMatch = path.match(/^\/api\/candidates\/([^/]+)\/artifacts$/);
  if (artCandMatch && request.method === "GET") {
    const cid = artCandMatch[1];
    if (!(await candidateOrFail(cid))) return fail("NOT_FOUND", "candidate not found", 404);
    const rows = await db.select().from(artifacts).where(eq(artifacts.candidateId, cid)).orderBy(desc(artifacts.updatedAt));
    const items = await Promise.all(rows.map(async (a) => {
      const [latestVer] = await db.select().from(artifactVersions).where(eq(artifactVersions.artifactId, a.id)).orderBy(desc(artifactVersions.version)).limit(1);
      return { ...a, latestVersion: latestVer ? { version: latestVer.version, feedbackText: latestVer.feedbackText, createdAt: latestVer.createdAt } : null };
    }));
    return ok({ items });
  }

  const artMatch = path.match(/^\/api\/artifacts\/([^/]+)$/);
  if (artMatch && request.method === "GET") {
    const [row] = await db.select().from(artifacts).where(eq(artifacts.id, artMatch[1])).limit(1);
    if (!row) return fail("NOT_FOUND", "artifact not found", 404);
    const versions = await db.select().from(artifactVersions).where(eq(artifactVersions.artifactId, row.id)).orderBy(desc(artifactVersions.version));
    return ok({ artifact: row, versions });
  }

  if (artMatch && request.method === "POST") {
    const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, artMatch[1])).limit(1);
    if (!artifact) return fail("NOT_FOUND", "artifact not found", 404);
    const body = await parseJson<{ feedback: string }>(request);
    const newVersion = artifact.currentVersion + 1;
    const [latestVer] = await db.select().from(artifactVersions).where(eq(artifactVersions.artifactId, artifact.id)).orderBy(desc(artifactVersions.version)).limit(1);
    await db.insert(artifactVersions).values({ id: `ver_${crypto.randomUUID()}`, artifactId: artifact.id, version: newVersion, promptSnapshot: latestVer?.promptSnapshot ?? null, feedbackText: body.feedback, createdAt: Date.now() });
    await db.update(artifacts).set({ currentVersion: newVersion, updatedAt: Date.now() }).where(eq(artifacts.id, artifact.id));
    return ok({ artifactId: artifact.id, newVersion, status: "generating" }, { status: 202 });
  }

  // Import batches
  if (path === "/api/import/batches" && request.method === "GET") {
    const rows = await db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(50);
    return ok({ items: rows.map(b => ({ ...b, autoScreen: b.autoScreen ?? false })) });
  }

  if (path === "/api/import/batches" && request.method === "POST") {
    const body = await parseJson<{ paths: string[]; autoScreen?: boolean }>(request);
    if (!body.paths?.length) return fail("VALIDATION_ERROR", "paths is required and non-empty", 422);
    const id = `batch_${crypto.randomUUID()}`;
    const ts = Date.now();
    await db.insert(importBatches).values({ id, status: "processing", sourceType: null, currentStage: "processing", totalFiles: body.paths.length, processedFiles: 0, successFiles: 0, failedFiles: 0, autoScreen: body.autoScreen ?? false, createdAt: ts, startedAt: ts });
    for (const filePath of body.paths) {
      const taskId = `task_${crypto.randomUUID()}`;
      const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
      const fileType = ["pdf", "png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "unknown";
      await db.insert(importFileTasks).values({ id: taskId, batchId: id, originalPath: filePath, normalizedPath: null, fileType, status: "queued", stage: null, errorCode: null, errorMessage: null, candidateId: null, resultJson: null, retryCount: 0, createdAt: ts, updatedAt: ts });
      void processFile(taskId, filePath, fileType as any).catch(err => console.error(`[import] file processing error: ${err.message}`));
    }
    return ok({ id, status: "processing", totalFiles: body.paths.length, autoScreen: body.autoScreen ?? false, createdAt: ts }, { status: 201 });
  }

  const batchMatch = path.match(/^\/api\/import\/batches\/([^/]+)$/);
  if (batchMatch && request.method === "GET") {
    const [row] = await db.select().from(importBatches).where(eq(importBatches.id, batchMatch[1])).limit(1);
    if (!row) return fail("NOT_FOUND", "batch not found", 404);
    return ok({ ...row, autoScreen: row.autoScreen ?? false });
  }

  const batchFilesMatch = path.match(/^\/api\/import\/batches\/([^/]+)\/files$/);
  if (batchFilesMatch && request.method === "GET") {
    const rows = await db.select().from(importFileTasks).where(eq(importFileTasks.batchId, batchFilesMatch[1])).orderBy(desc(importFileTasks.createdAt));
    return ok({ items: rows });
  }

  if (batchMatch && request.method === "POST") {
    const id = batchMatch[1];
    if (path.endsWith("/cancel")) {
      await db.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, id));
      return ok({ id, status: "cancelled" });
    }
    if (path.endsWith("/retry-failed")) return ok({ retriedCount: 0 });
    return fail("NOT_FOUND", "route not found", 404);
  }

  // Share
  if (path === "/api/share/devices" && request.method === "GET") {
    const discovery = getDiscovery("Interview-Manager", config.port);
    const online = discovery.getDevices();
    return ok({ recentContacts: [], onlineDevices: online.map(d => ({ id: d.deviceId, name: d.deviceName, userName: d.deviceUserName, userDisplayName: d.deviceUserDisplayName, ip: d.ip, port: d.apiPort })) });
  }

  if (path === "/api/share/set-user-info" && request.method === "POST") {
    const body = await parseJson<{ userName?: string; displayName?: string }>(request);
    const discovery = getDiscovery("Interview-Manager", config.port);
    discovery.setLocalUserInfo(body.userName || "", body.displayName || body.userName || "");
    return ok({ status: "updated" });
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
      const { statSync, existsSync } = await import("node:fs");
      const filePath = await exportCandidate(body.candidateId);
      return ok({ filePath, fileSize: statSync(filePath).size });
    } catch (err) { return fail("SHARE_EXPORT_FAILED", (err as Error).message, 500); }
  }

  if (path === "/api/share/send" && request.method === "POST") {
    const body = await parseJson<{ candidateId: string; target: { ip: string; port: number; deviceId?: string; name: string } }>(request);
    if (!body.candidateId || !body.target) return fail("VALIDATION_ERROR", "candidateId and target are required", 422);
    if (!(await candidateOrFail(body.candidateId))) return fail("NOT_FOUND", "candidate not found", 404);
    try {
      const imrPath = await exportCandidate(body.candidateId);
      const result = await sendToDevice(body.candidateId, body.target as any, imrPath);
      return ok({ recordId: result.recordId, status: result.success ? "success" : "failed", error: result.error, transferredAt: result.success ? Date.now() : null });
    } catch (err) { return fail("SHARE_DEVICE_OFFLINE", (err as Error).message, 503); }
  }

  if (path === "/api/share/import" && request.method === "POST") {
    const body = await parseJson<{ filePath: string }>(request);
    if (!body.filePath) return fail("VALIDATION_ERROR", "filePath is required", 422);
    const result = await importIpmr(body.filePath);
    if (result.result === "failed") return fail("SHARE_IMPORT_FAILED", result.error!, 422);
    return ok(result);
  }

  if (path === "/api/share/records" && request.method === "GET") {
    const rows = await db.select().from(shareRecords).orderBy(desc(shareRecords.createdAt)).limit(50);
    return ok({ items: rows.map(r => ({ ...r, targetDevice: r.targetDeviceJson ? JSON.parse(r.targetDeviceJson) : null })) });
  }

  // Notifications
  if (path === "/api/notifications" && request.method === "GET") {
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const filters = unreadOnly ? [isNull(notifications.readAt)] : [];
    const rows = await db.select().from(notifications).where(filters.length ? and(...filters) : undefined).orderBy(desc(notifications.createdAt)).limit(50);
    const unreadCount = (await db.select().from(notifications).where(isNull(notifications.readAt))).length;
    return ok({ items: rows, unreadCount });
  }

  const notifMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (notifMatch && request.method === "POST") {
    await db.update(notifications).set({ readAt: Date.now() }).where(eq(notifications.id, notifMatch[1]));
    return ok({ id: notifMatch[1], readAt: Date.now() });
  }

  if (path === "/api/notifications/read-all" && request.method === "POST") {
    await db.update(notifications).set({ readAt: Date.now() }).where(isNull(notifications.readAt));
    return ok({ status: "ok" });
  }

  if (path === "/api/indicator" && request.method === "GET") {
    const opencodeRunning = opencode.status().running;
    return ok({ status: opencodeRunning ? "green" : "gray", reasons: opencodeRunning ? ["opencode_ready"] : ["idle"] });
  }

  // OpenCode System
  if (path === "/api/system/opencode/status" && request.method === "GET") return ok(opencode.status());
  if (path === "/api/system/opencode/start" && request.method === "POST") {
    try { await opencode.start(); return ok(opencode.status()); }
    catch (error) { return fail("SYSTEM_OPENCODE_NOT_READY", (error as Error).message, 503); }
  }
  if (path === "/api/system/opencode/restart" && request.method === "POST") {
    try { await opencode.stop(); await opencode.start(); return ok(opencode.status()); }
    catch (error) { return fail("SYSTEM_OPENCODE_NOT_READY", (error as Error).message, 503); }
  }
  if (path === "/api/system/opencode/stop" && request.method === "POST") { await opencode.stop(); return ok({ running: false }); }

  return fail("NOT_FOUND", "route not found", 404);
}
