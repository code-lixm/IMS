import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type InterviewImportAIDraft,
  type CreateCandidatePayload,
  type InterviewImportMode,
  type InterviewImportPayload,
  type InterviewImportSystemContext,
  validateInterviewImportPayload,
} from "@ims/shared";
import { and, eq, isNull } from "drizzle-orm";
import { config } from "../../config";
import { db } from "../../db";
import { candidates } from "../../schema";
import { importResumeForCandidate } from "../import/pipeline";

export class InterviewImportCandidateResolutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 422,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "InterviewImportCandidateResolutionError";
  }
}

export interface ResolveInterviewImportCandidateOptions {
  batchId?: string;
  resumePdf?: File | null;
  systemContext?: InterviewImportSystemContext | null;
  aiDraft?: InterviewImportAIDraft | null;
  now?: number;
}

export interface InterviewImportResumeResolutionError {
  code: "RESUME_IMPORT_FAILED";
  message: string;
}

export interface InterviewImportCandidateResolutionResult {
  mode: InterviewImportMode;
  candidateId: string;
  createdCandidate: boolean;
  resumeId?: string;
  resumeError?: InterviewImportResumeResolutionError;
}

export async function resolveInterviewImportCandidate(
  payload: InterviewImportPayload,
  options: ResolveInterviewImportCandidateOptions = {},
): Promise<InterviewImportCandidateResolutionResult> {
  validatePayload(payload);

  if (payload.mode === "create_candidate") {
    const candidateId = await createCandidateRecord(payload, options, options.now ?? Date.now());
    const resumeResult = await resolveCandidateResume(candidateId, payload, options);

    return {
      mode: payload.mode,
      candidateId,
      createdCandidate: true,
      ...resumeResult,
    };
  }

  const candidateId = await resolveOrCreateCandidateId(payload, options);
  const resumeResult = await resolveCandidateResume(candidateId, payload, options);

  return {
    mode: payload.mode,
    candidateId,
    createdCandidate: false,
    ...resumeResult,
  };
}

function validatePayload(payload: InterviewImportPayload) {
  const errors = validateInterviewImportPayload(payload);
  if (payload.mode === "create_candidate") {
    const name = payload.name.trim();
    const position = payload.position?.trim() ?? "";
    const hasPhone = Boolean(payload.phone?.trim());
    const hasEmail = Boolean(payload.email?.trim());

    if (!name) {
      errors.push({ field: "name", message: "候选人姓名为必填项" });
    }

    if (!position) {
      errors.push({ field: "position", message: "候选人岗位为必填项" });
    }

    if (!hasPhone && !hasEmail) {
      errors.push({ field: "phone", message: "手机号或邮箱至少填写一项" });
    }
  }

  if (errors.length > 0) {
    const [first] = errors;
    throw new InterviewImportCandidateResolutionError(
      "VALIDATION_ERROR",
      first?.message ?? "面试导入参数校验失败",
      422,
      first?.field,
    );
  }
}

async function resolveOrCreateCandidateId(
  payload: InterviewImportPayload,
  options: ResolveInterviewImportCandidateOptions,
) {
  const resolvedCandidateId = normalizeCandidateId(
    options.systemContext?.candidateId
      ?? options.aiDraft?.candidateOptions.find((option) => option.candidateId)?.candidateId
      ?? ("candidateId" in payload ? payload.candidateId : undefined),
  );

  if (resolvedCandidateId) {
    await ensureCandidateExists(resolvedCandidateId);
    return resolvedCandidateId;
  }

  return createCandidateFromSuggestion(options, options.now ?? Date.now());
}

async function createCandidateRecord(
  payload: CreateCandidatePayload,
  options: ResolveInterviewImportCandidateOptions,
  now: number,
) {
  const candidateId = `cand_${crypto.randomUUID()}`;
  const candidateName = normalizeCandidateName(
    options.systemContext?.candidateName ?? options.aiDraft?.candidateOptions[0]?.candidateName ?? payload.name,
  );

  await db.insert(candidates).values({
    id: candidateId,
    source: payload.source ?? "local",
    remoteId: null,
    name: candidateName,
    phone: normalizeOptionalText(payload.phone),
    email: normalizeOptionalText(payload.email),
    position: normalizeOptionalText(payload.position),
    organizationName: null,
    orgAllParentName: null,
    recruitmentSourceName: null,
    yearsOfExperience: payload.yearsOfExperience ?? null,
    tagsJson: JSON.stringify(payload.tags ?? []),
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return candidateId;
}

async function createCandidateFromSuggestion(
  options: ResolveInterviewImportCandidateOptions,
  now: number,
) {
  const candidateId = `cand_${crypto.randomUUID()}`;
  const candidateName = normalizeCandidateName(
    options.systemContext?.candidateName
      ?? options.aiDraft?.candidateOptions[0]?.candidateName,
  );

  await db.insert(candidates).values({
    id: candidateId,
    source: "local",
    remoteId: null,
    name: candidateName,
    phone: null,
    email: null,
    position: null,
    organizationName: null,
    orgAllParentName: null,
    recruitmentSourceName: null,
    yearsOfExperience: null,
    tagsJson: JSON.stringify([]),
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return candidateId;
}

async function ensureCandidateExists(candidateId: string) {
  const [candidate] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(and(eq(candidates.id, candidateId), isNull(candidates.deletedAt)))
    .limit(1);

  if (!candidate) {
    throw new InterviewImportCandidateResolutionError(
      "CANDIDATE_NOT_FOUND",
      `candidate not found: ${candidateId}`,
      404,
      "candidateId",
    );
  }
}

function normalizeCandidateId(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeCandidateName(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : "未命名候选人";
}

async function resolveCandidateResume(
  candidateId: string,
  payload: InterviewImportPayload,
  options: ResolveInterviewImportCandidateOptions,
): Promise<Pick<InterviewImportCandidateResolutionResult, "resumeId" | "resumeError">> {
  const upload = options.resumePdf;
  const pdfPath = payload.resume?.pdfPath?.trim();

  if (!upload && !pdfPath) {
    return {};
  }

  try {
    const sourcePath = upload
      ? await saveInterviewImportUploadToLocal(options.batchId ?? candidateId, upload)
      : pdfPath!;
    const imported = await importResumeForCandidate(candidateId, sourcePath, {
      originalFileName: upload?.name ?? basename(sourcePath),
    });

    return { resumeId: imported.resumeId };
  } catch (error) {
    return {
      resumeError: {
        code: "RESUME_IMPORT_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function saveInterviewImportUploadToLocal(batchId: string, file: File): Promise<string> {
  const dirPath = join(config.dataDir, "import-uploads", batchId);
  await mkdir(dirPath, { recursive: true });

  const sanitizedName = file.name.replace(/[\\/]/g, "_");
  const filePath = join(dirPath, sanitizedName);
  const buffer = new Uint8Array(await file.arrayBuffer());
  await writeFile(filePath, buffer);
  return filePath;
}

function normalizeOptionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
