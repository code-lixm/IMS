import { and, desc, eq, isNull } from "drizzle-orm";
import {
  APPLICATION_STATUS_LABELS,
  INTERVIEW_TYPE_LABELS,
  lookupLabelOrDefault,
  resolveApplicationStatusCode,
} from "@ims/shared";
import { syncManager } from "./services/sync-manager";
import { processFile } from "./services/import/pipeline";
import { exportCandidate } from "./services/imr/exporter";
import { importIpmr } from "./services/imr/importer";
import { getDiscovery } from "./services/share/discovery";
import { sendToDevice } from "./services/share/transfer";
import { BaobaoClient, setBaobaoClient, getBaobaoClient } from "./services/baobao-client";
import { clearBaobaoLoginSession, fetchBaobaoLoginQrCode, getBaobaoLoginSessionStatus } from "./services/baobao-login";
import { config } from "./config";
import { db, rawDb } from "./db";
import { corsHeaders, ok, fail } from "./utils/http";
import {
  users, candidates, resumes, interviews, artifacts, artifactVersions,
  candidateWorkspaces, importBatches, importFileTasks, shareRecords, notifications,
  remoteUsers, conversations, messages, fileResources, agents, providerCredentials,
} from "./schema";
import { streamText } from "ai";
import { buildCandidateContext, formatCandidateContextForPrompt } from "./services/lui-context";

const DEBUG_BAOBAO = process.env.IMS_DEBUG_BAOBAO === "1";

function logBaobaoAuth(stage: string, details?: Record<string, unknown>, important = false) {
  if (!important && !DEBUG_BAOBAO) return;
  console.log("[baobao-auth]", stage, details ?? {});
}

type LuiSupportedModel = {
  id: string;
  provider: string;
  name: string;
  displayName: string;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  requiresAuth: boolean;
  runtimeModel: string;
};

const LUI_MODEL_PROVIDERS: Array<{ id: string; name: string; icon: string; models: LuiSupportedModel[] }> = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "OpenAI",
    models: [
      {
        id: "gpt-4o",
        provider: "openai",
        name: "gpt-4o",
        displayName: "GPT-4o",
        maxTokens: 128000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
        runtimeModel: "openai/gpt-4o",
      },
      {
        id: "gpt-4o-mini",
        provider: "openai",
        name: "gpt-4o-mini",
        displayName: "GPT-4o Mini",
        maxTokens: 128000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
        runtimeModel: "openai/gpt-4o-mini",
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "Anthropic",
    models: [
      {
        id: "claude-3-5-sonnet",
        provider: "anthropic",
        name: "claude-3-5-sonnet-20241022",
        displayName: "Claude 3.5 Sonnet",
        maxTokens: 200000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
        runtimeModel: "anthropic/claude-3-5-sonnet-20241022",
      },
    ],
  },
];

const LUI_MODEL_RUNTIME_BY_ID = new Map(
  LUI_MODEL_PROVIDERS.flatMap((provider) => provider.models.map((model) => [model.id, model.runtimeModel] as const)),
);

const LUI_MODEL_PROVIDERS_RESPONSE = LUI_MODEL_PROVIDERS.map((provider) => ({
  ...provider,
  models: provider.models.map(({ runtimeModel: _runtimeModel, ...model }) => model),
}));

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

async function candidateOrFail(id: string) {
  const row = await db.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.id, id), isNull(candidates.deletedAt))).limit(1);
  if (!row.length) return null;
  return row[0];
}

async function upsertLocalUser(user: { name: string; email: string | null }) {
  const existing = await db.select().from(users).limit(1);
  const now = Date.now();

  if (existing.length) {
    await db.update(users)
      .set({ name: user.name, email: user.email, tokenStatus: "valid", lastSyncAt: now })
      .where(eq(users.id, existing[0].id));
    return existing[0].id;
  }

  const id = `user_${crypto.randomUUID()}`;
  await db.insert(users).values({
    id,
    name: user.name,
    email: user.email,
    tokenStatus: "valid",
    lastSyncAt: now,
  });
  return id;
}

async function persistBaobaoAuth(
  token: string,
  baobaoUser: { id: string; name: string; username: string; email: string | null },
  tokenExpAt: number | null,
  cookieJson: string | null,
) {
  logBaobaoAuth("persist:start", {
    userId: baobaoUser.id,
    username: baobaoUser.username,
    tokenExpAt,
    hasCookies: Boolean(cookieJson),
  }, true);
  const existing = await db.select().from(remoteUsers).where(eq(remoteUsers.provider, "baobao")).limit(1);
  const now = Date.now();

  if (existing.length) {
    await db.update(remoteUsers)
      .set({
        name: baobaoUser.name,
        username: baobaoUser.username,
        email: baobaoUser.email,
        remoteId: baobaoUser.id,
        token,
        cookieJson,
        tokenExpAt,
        userDataJson: JSON.stringify(baobaoUser),
        updatedAt: now,
      })
      .where(eq(remoteUsers.provider, "baobao"));
  } else {
    await db.insert(remoteUsers).values({
      id: `remote_${crypto.randomUUID()}`,
      provider: "baobao",
      name: baobaoUser.name,
      username: baobaoUser.username,
        email: baobaoUser.email,
        remoteId: baobaoUser.id,
        token,
        cookieJson,
        tokenExpAt,
        userDataJson: JSON.stringify(baobaoUser),
        createdAt: now,
      updatedAt: now,
    });
  }

  await upsertLocalUser({ name: baobaoUser.name, email: baobaoUser.email });
  setBaobaoClient(new BaobaoClient(token));

  const discovery = getDiscovery("Interview-Manager", config.port);
  discovery.setLocalUserInfo(baobaoUser.username, baobaoUser.name);
  logBaobaoAuth("persist:done", {
    userId: baobaoUser.id,
    username: baobaoUser.username,
    hasExisting: existing.length > 0,
  }, true);
}

function triggerInitialSync(reason: string) {
  void syncManager.runOnce()
    .then((result) => {
      console.log(`[sync] initial sync (${reason}) done, syncedCandidates=${result.syncedCandidates} syncedInterviews=${result.syncedInterviews}`);
    })
    .catch((error) => {
      if (isBaobaoAuthExpiredError(error)) {
        void markBaobaoAuthExpired();
      }
      console.error(`[sync] initial sync (${reason}) failed: ${(error as Error).message}`);
    });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function isBaobaoAuthExpiredError(error: unknown) {
  const message = getErrorMessage(error);
  return message.includes("请重新刷新页面")
    || message.includes("Invalid baobao token")
    || message.includes("token expired")
    || message.includes("401 Unauthorized");
}

async function markBaobaoAuthExpired() {
  const now = Date.now();
  await db.update(users).set({ tokenStatus: "expired", lastSyncAt: now });
  await db.update(remoteUsers)
    .set({ tokenExpAt: now, updatedAt: now })
    .where(eq(remoteUsers.provider, "baobao"));
  setBaobaoClient(null);
  await clearBaobaoLoginSession();
}

async function resolveBaobaoAuthStatus() {
  const remote = await db.select().from(remoteUsers).where(eq(remoteUsers.provider, "baobao")).limit(1);
  const row = await db.select().from(users).limit(1);
  const localUser = row[0] ?? null;

  if (!remote.length) {
    if (localUser && localUser.tokenStatus !== "unauthenticated") {
      return {
        status: localUser.tokenStatus as "valid" | "expired" | "unauthenticated",
        user: { id: localUser.id, name: localUser.name, email: localUser.email },
        lastValidatedAt: localUser.lastSyncAt,
      };
    }

    return { status: "unauthenticated" as const, user: null, lastValidatedAt: null };
  }

  const item = remote[0];
  const expired = item.tokenExpAt ? Date.now() > item.tokenExpAt : true;

  if (expired) {
    const session = await getBaobaoLoginSessionStatus();

    if (session.authenticated) {
      await persistBaobaoAuth(
        session.authenticated.token,
        session.authenticated.user,
        session.authenticated.tokenExpAt,
        JSON.stringify(session.authenticated.cookies),
      );

      return {
        status: "valid" as const,
        user: {
          id: session.authenticated.user.id,
          name: session.authenticated.user.name,
          email: session.authenticated.user.email,
          phone: (session.authenticated.user as { phone?: string; phoneNumber?: string }).phone ?? (session.authenticated.user as { phone?: string; phoneNumber?: string }).phoneNumber ?? null,
        },
        lastValidatedAt: Date.now(),
      };
    }
  }

  const nextStatus = expired ? "expired" : "valid";

  if (localUser && localUser.tokenStatus !== nextStatus) {
    await db.update(users)
      .set({ tokenStatus: nextStatus, lastSyncAt: Date.now() })
      .where(eq(users.id, localUser.id));
  }

  return {
    status: nextStatus as "valid" | "expired",
    user: { id: item.remoteId ?? item.id, name: item.name, email: item.email, phone: (() => { const ud = item.userDataJson ? JSON.parse(item.userDataJson) : null; return ud?.phone ?? ud?.phoneNumber ?? null; })() },
    lastValidatedAt: item.updatedAt,
  };
}

type CandidateListRow = {
  id: string;
  source: string;
  remoteId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  organizationName: string | null;
  orgAllParentName: string | null;
  recruitmentSourceName: string | null;
  yearsOfExperience: number | null;
  tagsJson: string | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type CandidateListCountRow = {
  total: number;
};

type CandidateLatestResumeRow = {
  candidateId: string;
  parsedDataJson: string | null;
  createdAt: number;
};

type CandidateLatestInterviewRow = {
  candidateId: string;
  status: string;
  statusRaw: string | null;
  interviewType: number | null;
  interviewResult: number | null;
  interviewResultString: string | null;
  scheduledAt: number | null;
  interviewPlace: string | null;
  meetingLink: string | null;
  dockingHrName: string | null;
  dockingHrbpName: string | null;
  checkInTime: number | null;
  createdAt: number;
  updatedAt: number;
};

type CandidateLatestImportTaskRow = {
  candidateId: string;
  status: string;
  updatedAt: number;
};

function buildCandidateListWhereClause(search?: string, source?: string) {
  const clauses = ["deleted_at IS NULL"];
  const params: Array<string | number> = [];

  if (search) {
    clauses.push("name LIKE ?");
    params.push(`%${search}%`);
  }

  if (source) {
    clauses.push("source = ?");
    params.push(source);
  }

  return {
    whereClause: clauses.join(" AND "),
    params,
  };
}

function makeInClauseParams(ids: string[]) {
  return ids.map(() => "?").join(", ");
}

function parseCandidateTags(tagsJson: string | null) {
  if (!tagsJson) return [] as string[];

  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch (error) {
    console.warn("[candidates] failed to parse tags_json", error);
    return [];
  }
}

function deriveResumeStatus(resume?: CandidateLatestResumeRow, importTask?: CandidateLatestImportTaskRow) {
  if (importTask?.status === "failed") return "failed" as const;
  if (!resume) return "missing" as const;
  return resume.parsedDataJson ? "parsed" as const : "uploaded" as const;
}

function deriveInterviewState(interview?: CandidateLatestInterviewRow) {
  if (!interview) return "none" as const;
  if (interview.status === "completed") return "completed" as const;
  if (interview.status === "cancelled" || interview.status === "no_show") return "cancelled" as const;
  return "scheduled" as const;
}

function derivePipelineStage(
  resumeStatus: ReturnType<typeof deriveResumeStatus>,
  interview?: CandidateLatestInterviewRow,
) {
  if (interview) return "interview" as const;
  if (resumeStatus !== "missing") return "screening" as const;
  return "new" as const;
}

function deriveLastActivityAt(
  candidate: CandidateListRow,
  resume?: CandidateLatestResumeRow,
  interview?: CandidateLatestInterviewRow,
  importTask?: CandidateLatestImportTaskRow,
) {
  return Math.max(
    candidate.updatedAt,
    resume?.createdAt ?? 0,
    interview?.updatedAt ?? interview?.createdAt ?? 0,
    importTask?.updatedAt ?? 0,
  );
}

function deriveInterviewTypeLabel(interviewType?: number | null): string | null {
  if (interviewType === null || interviewType === undefined) return null;
  return lookupLabelOrDefault(INTERVIEW_TYPE_LABELS, interviewType);
}

function deriveInterviewOwnerName(interview?: CandidateLatestInterviewRow) {
  return interview?.dockingHrName ?? interview?.dockingHrbpName ?? null;
}

function deriveApplicationStatusText(interview?: CandidateLatestInterviewRow): string | null {
  if (!interview) return null;

  const rawStatus = interview.statusRaw;

  // 中文标签直接返回（已是可读文案）
  if (typeof rawStatus === "string" && rawStatus.trim()) {
    const trimmed = rawStatus.trim();
    if (/[\u4e00-\u9fff]/.test(trimmed)) {
      return trimmed;
    }
    // 纯数字字符串，尝试用字典解析
    const numericCode = Number(trimmed);
    if (Number.isFinite(numericCode)) {
      const label = lookupLabelOrDefault(APPLICATION_STATUS_LABELS, numericCode);
      if (!label.startsWith("未知(")) {
        return label;
      }
    }
    // 解析不了，加前缀保留原始值
    return `状态 ${trimmed}`;
  }

  // 兜底到面试进度状态
  if (interview.status === "completed") return "已面试";
  if (interview.status === "cancelled" || interview.status === "no_show") return "已取消";
  if (interview.status === "scheduled") return "待面试";

  return null;
}

function pickLatestByCandidate<T extends { candidateId: string }>(rows: T[]) {
  const latestByCandidate = new Map<string, T>();

  for (const row of rows) {
    if (!latestByCandidate.has(row.candidateId)) {
      latestByCandidate.set(row.candidateId, row);
    }
  }

  return latestByCandidate;
}

export async function route(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // Health
  if (path === "/api/health" && request.method === "GET") return ok({ service: "interview-manager", status: "ok" });

  // Auth
  if (path === "/api/auth/status" && request.method === "GET") {
    return ok(await resolveBaobaoAuthStatus());
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
    await db.delete(remoteUsers).where(eq(remoteUsers.provider, "baobao"));
    setBaobaoClient(null);
    await clearBaobaoLoginSession();
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

      await persistBaobaoAuth(body.token, baobaoUser, tokenExpAt, null);
      setBaobaoClient(client);
      triggerInitialSync("auth-connect");

      return ok({
        status: "valid" as const,
        user: { id: baobaoUser.id, name: baobaoUser.name, username: baobaoUser.username, email: baobaoUser.email },
        tokenExpAt,
      });
    } catch (err) {
      return fail("AUTH_INVALID", `Failed to validate token: ${(err as Error).message}`, 401);
    }
  }

  if (path === "/api/auth/baobao/qr" && request.method === "GET") {
    try {
      logBaobaoAuth("route:qr:start");
      const qrCode = await fetchBaobaoLoginQrCode();
      if (qrCode.authenticated) {
        logBaobaoAuth("route:qr:authenticated", {
          userId: qrCode.authenticated.user.id,
          currentUrl: qrCode.currentUrl,
        }, true);
        await persistBaobaoAuth(
          qrCode.authenticated.token,
          qrCode.authenticated.user,
          qrCode.authenticated.tokenExpAt,
          JSON.stringify(qrCode.authenticated.cookies),
        );
        triggerInitialSync("auth-qr");
      }
      logBaobaoAuth("route:qr:done", {
        currentUrl: qrCode.currentUrl,
        source: qrCode.source,
        refreshed: qrCode.refreshed,
        status: qrCode.status,
      });
      return ok({
        provider: "baobao" as const,
        imageSrc: qrCode.imageSrc,
        source: qrCode.source,
        refreshed: qrCode.refreshed,
        fetchedAt: Date.now(),
      });
    } catch (err) {
      console.error("[baobao-auth] route:qr:error", err);
      return fail("REMOTE_SYNC_FAILED", `Failed to load baobao QR code: ${(err as Error).message}`, 502);
    }
  }

  if (path === "/api/auth/baobao/login-status" && request.method === "GET") {
    logBaobaoAuth("route:login-status:start");
    const session = await getBaobaoLoginSessionStatus();

    if (session.authenticated) {
      logBaobaoAuth("route:login-status:authenticated", {
        userId: session.authenticated.user.id,
        currentUrl: session.currentUrl,
      }, true);
      await persistBaobaoAuth(
        session.authenticated.token,
        session.authenticated.user,
        session.authenticated.tokenExpAt,
        JSON.stringify(session.authenticated.cookies),
      );
      triggerInitialSync("auth-login-status");
    }

    logBaobaoAuth("route:login-status:done", {
      status: session.status,
      currentUrl: session.currentUrl,
      authenticated: Boolean(session.authenticated),
      error: session.error,
    });

    return ok({
      provider: "baobao" as const,
      status: session.status,
      currentUrl: session.currentUrl,
      lastCheckedAt: session.lastCheckedAt,
      error: session.error,
      authenticated: Boolean(session.authenticated),
      user: session.authenticated?.user ?? null,
    });
  }

  if (path === "/api/auth/baobao/disconnect" && request.method === "POST") {
    await db.delete(remoteUsers).where(eq(remoteUsers.provider, "baobao"));
    setBaobaoClient(null);
    await clearBaobaoLoginSession();
    return ok({ status: "disconnected" });
  }

  // Me
  if (path === "/api/me" && request.method === "GET") {
    const row = await db.select().from(users).limit(1);
    const u = row[0];
    return ok({ user: u ? { id: u.id, name: u.name, email: u.email, tokenStatus: u.tokenStatus, lastSyncAt: u.lastSyncAt, settings: u.settingsJson ? JSON.parse(u.settingsJson) : {} } : null, syncEnabled: false, opencodeReady: false, opencodeVersion: null });
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
    catch (err) {
      if (isBaobaoAuthExpiredError(err)) {
        await markBaobaoAuthExpired();
        return fail("AUTH_EXPIRED", getErrorMessage(err), 401);
      }
      return fail("REMOTE_SYNC_FAILED", getErrorMessage(err), 502);
    }
  }

  // Candidates
  if (path === "/api/candidates" && request.method === "GET") {
    const search = url.searchParams.get("search")?.trim();
    const source = url.searchParams.get("source")?.trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const offset = (page - 1) * pageSize;
    const { whereClause, params } = buildCandidateListWhereClause(search, source);
    const [countRow] = rawDb.query(`SELECT COUNT(*) as total FROM candidates WHERE ${whereClause}`).all(...params) as CandidateListCountRow[];
    // Order by interview scheduled time (Baobao default order), fall back to candidate updated_at
    const items = rawDb.query(`
      SELECT
        c.id,
        c.source,
        c.remote_id as remoteId,
        c.name,
        c.phone,
        c.email,
        c.position,
        c.organization_name as organizationName,
        c.org_all_parent_name as orgAllParentName,
        c.recruitment_source_name as recruitmentSourceName,
        c.years_of_experience as yearsOfExperience,
        c.tags_json as tagsJson,
        c.deleted_at as deletedAt,
        c.created_at as createdAt,
        c.updated_at as updatedAt,
        (
          SELECT MAX(i.scheduled_at) FROM interviews i WHERE i.candidate_id = c.id
        ) as lastActivityAt
      FROM candidates c
      WHERE ${whereClause}
      ORDER BY lastActivityAt DESC NULLS LAST, c.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as (CandidateListRow & { lastActivityAt: number })[];

    if (!items.length) {
      return ok({ items: [], total: countRow?.total ?? 0, page, pageSize });
    }

    const candidateIds = items.map((candidate) => candidate.id);
    const inClause = makeInClauseParams(candidateIds);
    const resumeRows = rawDb.query(`
      SELECT
        candidate_id as candidateId,
        parsed_data_json as parsedDataJson,
        created_at as createdAt
      FROM resumes
      WHERE candidate_id IN (${inClause})
      ORDER BY candidate_id ASC, created_at DESC
    `).all(...candidateIds) as CandidateLatestResumeRow[];
    const interviewRows = rawDb.query(`
      SELECT
        candidate_id as candidateId,
        status,
        status_raw as statusRaw,
        interview_type as interviewType,
        interview_result as interviewResult,
        interview_result_string as interviewResultString,
        scheduled_at as scheduledAt,
        interview_place as interviewPlace,
        meeting_link as meetingLink,
        docking_hr_name as dockingHrName,
        docking_hrbp_name as dockingHrbpName,
        check_in_time as checkInTime,
        created_at as createdAt,
        updated_at as updatedAt
      FROM interviews
      WHERE candidate_id IN (${inClause})
      ORDER BY candidate_id ASC, scheduled_at DESC, updated_at DESC, created_at DESC
    `).all(...candidateIds) as CandidateLatestInterviewRow[];
    const importTaskRows = rawDb.query(`
      SELECT
        candidate_id as candidateId,
        status,
        updated_at as updatedAt
      FROM import_file_tasks
      WHERE candidate_id IN (${inClause})
      ORDER BY candidate_id ASC, updated_at DESC
    `).all(...candidateIds) as CandidateLatestImportTaskRow[];

    const latestResumeByCandidate = pickLatestByCandidate(resumeRows);
    const latestInterviewByCandidate = pickLatestByCandidate(interviewRows);
    const latestImportTaskByCandidate = pickLatestByCandidate(importTaskRows);

    // SQL already sorted by lastActivityAt DESC, no in-memory resort needed

    return ok({
      items: items.map((candidate) => {
        const latestResume = latestResumeByCandidate.get(candidate.id);
        const latestInterview = latestInterviewByCandidate.get(candidate.id);
        const latestImportTask = latestImportTaskByCandidate.get(candidate.id);
        const resumeStatus = deriveResumeStatus(latestResume, latestImportTask);
        const interviewState = deriveInterviewState(latestInterview);
        const pipelineStage = derivePipelineStage(resumeStatus, latestInterview);

        return {
          ...candidate,
          tags: parseCandidateTags(candidate.tagsJson),
          applyPositionName: candidate.position,
          organizationName: candidate.organizationName,
          orgAllParentName: candidate.orgAllParentName,
          interviewTime: latestInterview?.scheduledAt ?? null,
          interviewType: latestInterview?.interviewType ?? null,
          interviewTypeLabel: deriveInterviewTypeLabel(latestInterview?.interviewType ?? null),
          interviewResult: latestInterview?.interviewResult ?? null,
          interviewResultString: latestInterview?.interviewResultString ?? null,
          interviewPlace: latestInterview?.interviewPlace ?? null,
          interviewUrl: latestInterview?.meetingLink ?? null,
          recruitmentSourceName: candidate.recruitmentSourceName,
          dockingHrName: latestInterview?.dockingHrName ?? null,
          dockingHrbpName: latestInterview?.dockingHrbpName ?? null,
          interviewOwnerName: deriveInterviewOwnerName(latestInterview),
      applicationStatusText: deriveApplicationStatusText(latestInterview),
          applicationStatus: resolveApplicationStatusCode(latestInterview?.statusRaw),
          checkInTime: latestInterview?.checkInTime ?? null,
          resumeStatus,
          interviewState,
          pipelineStage,
          lastActivityAt: deriveLastActivityAt(candidate, latestResume, latestInterview, latestImportTask),
        };
      }),
      total: countRow?.total ?? 0,
      page,
      pageSize,
    });
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
    const now = Date.now();
    const [existing] = await db.select().from(candidateWorkspaces).where(eq(candidateWorkspaces.candidateId, cid)).limit(1);

    if (existing) {
      await db.update(candidateWorkspaces)
        .set({ lastAccessedAt: now })
        .where(eq(candidateWorkspaces.id, existing.id));
      return ok({
        candidateId: cid,
        sessionId: existing.id,
        url: "",
        status: existing.workspaceStatus,
      });
    }

    const id = `ws_${crypto.randomUUID()}`;
    await db.insert(candidateWorkspaces).values({
      id,
      candidateId: cid,
      workspaceStatus: "inactive",
      lastAccessedAt: now,
      createdAt: now,
    });

    return ok({
      candidateId: cid,
      sessionId: id,
      url: "",
      status: "inactive",
    });
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

  if (path === "/api/share/resolve" && request.method === "POST") {
    const body = await parseJson<{ candidateId: string; strategy: "local" | "import" }>(request);
    if (!body.candidateId || !body.strategy) return fail("VALIDATION_ERROR", "candidateId and strategy are required", 422);
    // TODO: Apply strategy and complete the import
    return ok({ status: "resolved", candidateId: body.candidateId, strategy: body.strategy });
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
    return ok({ status: "gray", reasons: ["idle"] });
  }

  // AI Chat (LUI)
  if (path === "/api/chat" && request.method === "POST") {
    try {
      const body = await parseJson<{ messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> }>(request);
      
      const result = streamText({
        model: 'openai/gpt-4o',
        messages: body.messages,
        system: `You are a helpful AI assistant for an Interview Management System. 
You help recruiters manage candidates, schedule interviews, and analyze candidate information.
When appropriate, you can help with:
- Searching and filtering candidates
- Creating interview schedules
- Analyzing candidate resumes
- Generating candidate evaluation reports
Always be concise and helpful in your responses.`,
      });

      return result.toUIMessageStreamResponse();
    } catch (err) {
      return fail("AI_CHAT_ERROR", `Chat error: ${(err as Error).message}`, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // LUI - Conversations
  // ---------------------------------------------------------------------------

  // GET /api/lui/conversations - List conversations
  if (path === "/api/lui/conversations" && request.method === "GET") {
    const rows = await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
    return ok({ items: rows });
  }

  // POST /api/lui/conversations - Create conversation
  if (path === "/api/lui/conversations" && request.method === "POST") {
    const body = await parseJson<{
      title?: string;
      candidateId?: string;
      agentId?: string | null;
      modelId?: string | null;
      temperature?: number | null;
    }>(request);
    const now = new Date();
    const id = `conv_${crypto.randomUUID()}`;
    const normalizedTitle = body.title?.trim();
    const title = normalizedTitle || `新会话 ${Date.now()}`;
    const agentId = body.agentId?.trim() || null;
    const modelId = body.modelId?.trim() || null;
    const temperature = typeof body.temperature === "number" ? body.temperature : null;
    await db.insert(conversations).values({
      id,
      title: normalizedTitle || "新会话",
      candidateId: body.candidateId || null,
      agentId,
      modelId,
      temperature,
      createdAt: now,
      updatedAt: now,
    });
    return ok({
      id,
      title,
      candidateId: body.candidateId || null,
      agentId,
      modelId,
      temperature,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    }, { status: 201 });
  }

  // GET /api/lui/conversations/:id - Get conversation with messages and files
  const convMatch = path.match(/^\/api\/lui\/conversations\/([^/]+)$/);
  if (convMatch && request.method === "GET") {
    const id = convMatch[1];
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) return fail("NOT_FOUND", "conversation not found", 404);

    // Get candidate info if associated
    let candidateInfo: { id: string; name: string; position: string | null } | null = null;
    if (conv.candidateId) {
      const [cand] = await db
        .select({ id: candidates.id, name: candidates.name, position: candidates.position })
        .from(candidates)
        .where(eq(candidates.id, conv.candidateId))
        .limit(1);
      if (cand) {
        candidateInfo = { id: cand.id, name: cand.name, position: cand.position ?? null };
      }
    }

    const messageRows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
    const fileRows = await db.select().from(fileResources).where(eq(fileResources.conversationId, id)).orderBy(desc(fileResources.createdAt));

    return ok({
      conversation: conv,
      candidate: candidateInfo,
      messages: messageRows.map(m => ({
        ...m,
        tools: m.toolsJson ? JSON.parse(m.toolsJson) : null,
      })),
      files: fileRows,
    });
  }

  // DELETE /api/lui/conversations/:id - Delete conversation
  if (convMatch && request.method === "DELETE") {
    const id = convMatch[1];
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) return fail("NOT_FOUND", "conversation not found", 404);

    // Delete associated messages and files first
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(fileResources).where(eq(fileResources.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));

    return ok({ id });
  }

  // PUT /api/lui/conversations/:id - Update conversation metadata
  if (convMatch && request.method === "PUT") {
    const id = convMatch[1];
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) return fail("NOT_FOUND", "conversation not found", 404);

    const body = await parseJson<{
      title?: string;
      candidateId?: string | null;
      agentId?: string | null;
      modelId?: string | null;
      temperature?: number | null;
    }>(request);
    if (body.candidateId) {
      const [candidate] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.id, body.candidateId)).limit(1);
      if (!candidate) return fail("NOT_FOUND", "candidate not found", 404);
    }

    const nextUpdatedAt = new Date();
    const updates: Partial<typeof conversations.$inferInsert> = {
      updatedAt: nextUpdatedAt,
    };

    if (body.title !== undefined) {
      updates.title = body.title.trim() || conv.title;
    }
    if (body.candidateId !== undefined) {
      updates.candidateId = body.candidateId || null;
    }
    if (body.agentId !== undefined) {
      updates.agentId = body.agentId?.trim() || null;
    }
    if (body.modelId !== undefined) {
      updates.modelId = body.modelId?.trim() || null;
    }
    if (body.temperature !== undefined) {
      updates.temperature = typeof body.temperature === "number" ? body.temperature : null;
    }

    await db.update(conversations).set(updates).where(eq(conversations.id, id));

    const [updated] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!updated) return fail("NOT_FOUND", "conversation not found", 404);

    return ok(updated);
  }

  // ---------------------------------------------------------------------------
  // LUI - Messages (Streaming)
  // ---------------------------------------------------------------------------

  // POST /api/lui/conversations/:id/messages - Send message with streaming response
  const msgMatch = path.match(/^\/api\/lui\/conversations\/([^/]+)\/messages$/);
  if (msgMatch && request.method === "POST") {
    const convId = msgMatch[1];
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1);
    if (!conv) return fail("NOT_FOUND", "conversation not found", 404);

    const body = await parseJson<{
      content: string;
      fileIds?: string[];
      agentId?: string;
      modelId?: string;
      temperature?: number;
    }>(request);
    if (!body.content?.trim()) return fail("VALIDATION_ERROR", "content is required", 422);

    const convConfigUpdates: Partial<typeof conversations.$inferInsert> = {};
    if (body.agentId !== undefined) {
      convConfigUpdates.agentId = body.agentId?.trim() || null;
    }
    if (body.modelId !== undefined) {
      convConfigUpdates.modelId = body.modelId?.trim() || null;
    }
    if (body.temperature !== undefined) {
      convConfigUpdates.temperature = body.temperature;
    }
    if (Object.keys(convConfigUpdates).length > 0) {
      await db
        .update(conversations)
        .set({ ...convConfigUpdates, updatedAt: new Date() })
        .where(eq(conversations.id, convId));
    }

    // Save user message
    const now = new Date();
    const msgId = `msg_${crypto.randomUUID()}`;
    await db.insert(messages).values({
      id: msgId,
      conversationId: convId,
      role: "user",
      content: body.content.trim(),
      status: "complete",
      createdAt: now,
    });

    // Update conversation timestamp
    await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, convId));

    // Build AI response using streamText
    const historyRows = await db.select().from(messages).where(eq(messages.conversationId, convId)).orderBy(messages.createdAt);

    // Get agent configuration if specified
    let systemPrompt = `You are a helpful AI assistant for an Interview Management System.
You help recruiters manage candidates, schedule interviews, and analyze candidate information.
When appropriate, you can help with:
- Searching and filtering candidates
- Creating interview schedules
- Analyzing candidate resumes
- Generating candidate evaluation reports
Always be concise and helpful in your responses.`;
    let temperature = body.temperature ?? conv.temperature ?? 0.5;

    if (body.agentId) {
      const [agent] = await db.select().from(agents).where(eq(agents.id, body.agentId)).limit(1);
      if (agent?.systemPrompt) {
        systemPrompt = agent.systemPrompt;
      }
      if (agent?.temperature !== undefined && agent.temperature !== null) {
        temperature = agent.temperature;
      }
    }

    if (conv.candidateId) {
      const candidateContext = await buildCandidateContext(conv.candidateId);
      if (candidateContext) {
        const contextPrompt = `\n\n## Candidate Context\nYou are currently helping with candidate: ${candidateContext.candidateName}.\n${formatCandidateContextForPrompt(candidateContext)}`;
        systemPrompt = `${systemPrompt}\n${contextPrompt}\n\nWhen answering questions about this candidate, use the context above. Be specific and reference the candidate's information in your responses.`;
      }
    }

    const historyMessages = historyRows.map(m => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    const modelId = body.modelId?.trim() || conv.modelId || "gpt-4o";
    const model = LUI_MODEL_RUNTIME_BY_ID.get(modelId);
    if (!model) {
      return fail("VALIDATION_ERROR", `unsupported modelId: ${modelId}`, 422);
    }

    // Note: Tool calling will be enabled in a future iteration
    // For now, store tool execution results manually when AI calls tools
    const result = streamText({
      model,
      messages: historyMessages,
      system: systemPrompt,
      temperature,
    });

    // Note: In a production app, you'd want to save the AI response to DB after streaming completes
    return result.toUIMessageStreamResponse();
  }

  // ---------------------------------------------------------------------------
  // LUI - Agents
  // ---------------------------------------------------------------------------

  // GET /api/lui/agents - List all agents
  if (path === "/api/lui/agents" && request.method === "GET") {
    const rows = await db.select().from(agents).orderBy(desc(agents.createdAt));
    return ok({ items: rows });
  }

  // POST /api/lui/agents - Create agent
  if (path === "/api/lui/agents" && request.method === "POST") {
    const body = await parseJson<{
      name: string;
      description?: string;
      mode?: string;
      temperature?: number;
      systemPrompt?: string;
      tools?: string[];
      isDefault?: boolean;
    }>(request);

    if (!body.name?.trim()) return fail("VALIDATION_ERROR", "name is required", 422);

    const now = new Date();
    const id = `agent_${crypto.randomUUID()}`;

    // If setting as default, unset other defaults first
    if (body.isDefault) {
      await db.update(agents).set({ isDefault: false }).where(eq(agents.isDefault, true));
    }

    await db.insert(agents).values({
      id,
      name: body.name.trim(),
      description: body.description || null,
      mode: (body.mode as "all" | "chat" | "ask") || "chat",
      temperature: body.temperature ?? 0,
      systemPrompt: body.systemPrompt || null,
      toolsJson: body.tools ? JSON.stringify(body.tools) : null,
      isDefault: body.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    });

    return ok({
      id,
      name: body.name.trim(),
      description: body.description || null,
      mode: (body.mode as "all" | "chat" | "ask") || "chat",
      temperature: body.temperature ?? 0,
      systemPrompt: body.systemPrompt || null,
      tools: body.tools || [],
      isDefault: body.isDefault ?? false,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    }, { status: 201 });
  }

  // GET /api/lui/agents/:id - Get agent
  const agentMatch = path.match(/^\/api\/lui\/agents\/([^/]+)$/);
  if (agentMatch && request.method === "GET") {
    const id = agentMatch[1];
    const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "agent not found", 404);
    return ok({
      ...row,
      tools: row.toolsJson ? JSON.parse(row.toolsJson) : [],
    });
  }

  // PUT /api/lui/agents/:id - Update agent
  if (agentMatch && request.method === "PUT") {
    const id = agentMatch[1];
    const [existing] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (!existing) return fail("NOT_FOUND", "agent not found", 404);

    const body = await parseJson<{
      description?: string;
      mode?: string;
      temperature?: number;
      systemPrompt?: string;
      tools?: string[];
      isDefault?: boolean;
    }>(request);

    const now = new Date();

    // If setting as default, unset other defaults first
    if (body.isDefault) {
      await db.update(agents).set({ isDefault: false }).where(eq(agents.isDefault, true));
    }

    const updates: Record<string, unknown> = { updatedAt: now };
    if (body.description !== undefined) updates.description = body.description;
    if (body.mode !== undefined) updates.mode = body.mode;
    if (body.temperature !== undefined) updates.temperature = body.temperature;
    if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
    if (body.tools !== undefined) updates.toolsJson = JSON.stringify(body.tools);
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault;

    await db.update(agents).set(updates).where(eq(agents.id, id));

    const [updated] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    return ok({
      ...updated,
      tools: updated.toolsJson ? JSON.parse(updated.toolsJson) : [],
    });
  }

  // DELETE /api/lui/agents/:id - Delete agent
  if (agentMatch && request.method === "DELETE") {
    const id = agentMatch[1];
    const [existing] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (!existing) return fail("NOT_FOUND", "agent not found", 404);

    await db.delete(agents).where(eq(agents.id, id));
    return ok({ id });
  }

  // GET /api/lui/models - List available AI models
  if (path === "/api/lui/models" && request.method === "GET") {
    return ok({ providers: LUI_MODEL_PROVIDERS_RESPONSE });
  }

  // ---------------------------------------------------------------------------
  // LUI - Provider Credentials
  // ---------------------------------------------------------------------------

  const credentialStatusMatch = path.match(/^\/api\/lui\/credentials\/([^/]+)\/status$/);
  if (credentialStatusMatch && request.method === "GET") {
    const provider = credentialStatusMatch[1].trim();
    if (!provider) return fail("VALIDATION_ERROR", "provider is required", 422);

    const row = await db
      .select({ id: providerCredentials.id })
      .from(providerCredentials)
      .where(eq(providerCredentials.provider, provider))
      .limit(1);

    return ok({ provider, isAuthorized: row.length > 0 });
  }

  const credentialMatch = path.match(/^\/api\/lui\/credentials\/([^/]+)$/);
  if (credentialMatch && request.method === "PUT") {
    const provider = credentialMatch[1].trim();
    if (!provider) return fail("VALIDATION_ERROR", "provider is required", 422);

    const body = await parseJson<{ apiKey: string }>(request);
    const apiKey = body.apiKey?.trim();
    if (!apiKey || apiKey.length < 10) {
      return fail("VALIDATION_ERROR", "apiKey is invalid", 422);
    }

    const now = Date.now();
    await db
      .insert(providerCredentials)
      .values({
        id: `cred_${crypto.randomUUID()}`,
        provider,
        apiKey,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: providerCredentials.provider,
        set: {
          apiKey,
          updatedAt: now,
        },
      });

    return ok({ provider, isAuthorized: true });
  }

  if (credentialMatch && request.method === "DELETE") {
    const provider = credentialMatch[1].trim();
    if (!provider) return fail("VALIDATION_ERROR", "provider is required", 422);

    await db.delete(providerCredentials).where(eq(providerCredentials.provider, provider));
    return ok({ provider, isAuthorized: false });
  }

  // ---------------------------------------------------------------------------
  // LUI - Files
  // ---------------------------------------------------------------------------

  // GET /api/lui/files - List all files
  if (path === "/api/lui/files" && request.method === "GET") {
    const conversationId = url.searchParams.get("conversationId");
    const filters = conversationId ? [eq(fileResources.conversationId, conversationId)] : [];
    const rows = await db.select().from(fileResources).where(filters.length ? and(...filters) : undefined).orderBy(desc(fileResources.createdAt));
    return ok({ items: rows });
  }

  // POST /api/lui/files - Upload file
  if (path === "/api/lui/files" && request.method === "POST") {
    try {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const conversationId = formData.get("conversationId") as string | null;

      if (!file) return fail("VALIDATION_ERROR", "file is required", 422);
      if (!conversationId) return fail("VALIDATION_ERROR", "conversationId is required", 422);

      const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
      if (!conv) return fail("NOT_FOUND", "conversation not found", 404);

      const content = await file.text();
      const fileType = file.name.match(/\.(ts|js|tsx|jsx|py|go|java|cpp|c|h)$/) ? "code" :
                       file.name.match(/\.(png|jpg|jpeg|gif|webp|svg)$/) ? "image" : "document";
      const language = fileType === "code" ? file.name.split(".").pop() || "text" : null;

      const now = new Date();
      const id = `file_${crypto.randomUUID()}`;
      await db.insert(fileResources).values({
        id,
        conversationId,
        name: file.name,
        type: fileType,
        content,
        language,
        size: file.size,
        createdAt: now,
      });

      return ok({ id, name: file.name, type: fileType, size: file.size, content }, { status: 201 });
    } catch (err) {
      return fail("INTERNAL_ERROR", `File upload error: ${(err as Error).message}`, 500);
    }
  }

  // GET /api/lui/files/:id - Get file content
  const fileMatch = path.match(/^\/api\/lui\/files\/([^/]+)$/);
  if (fileMatch && request.method === "GET") {
    const id = fileMatch[1];
    const [row] = await db.select().from(fileResources).where(eq(fileResources.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "file not found", 404);
    return ok({ content: row.content, name: row.name, type: row.type });
  }

  // DELETE /api/lui/files/:id - Delete file
  if (fileMatch && request.method === "DELETE") {
    const id = fileMatch[1];
    const [row] = await db.select().from(fileResources).where(eq(fileResources.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "file not found", 404);
    await db.delete(fileResources).where(eq(fileResources.id, id));
    return ok({ id });
  }

  return fail("NOT_FOUND", "route not found", 404);
}
