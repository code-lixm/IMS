import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
import { candidates, fileResources, interviews, resumes } from "../schema";
import { getBaobaoClient } from "./baobao-client";
import { importResumeForCandidate } from "./import/pipeline";
import { classifyFileType, type FileType } from "./import/types";

export type EnsureCandidateResumeResult = {
  status:
    | "already-present"
    | "imported"
    | "missing-remote-resume-id"
    | "baobao-unavailable"
    | "candidate-not-found"
    | "import-failed";
  candidateId: string;
  resumeId?: string;
  remoteResumeId?: string;
  note?: string;
};

export async function ensureCandidateResumeAvailable(candidateId: string): Promise<EnsureCandidateResumeResult> {
  const [candidate] = await db
    .select({
      id: candidates.id,
      name: candidates.name,
      remoteResumeId: candidates.remoteResumeId,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);

  if (!candidate) {
    return { status: "candidate-not-found", candidateId, note: "candidate not found" };
  }

  const existingResumes = await db
    .select({
      id: resumes.id,
      fileName: resumes.fileName,
      filePath: resumes.filePath,
      extractedText: resumes.extractedText,
    })
    .from(resumes)
    .where(and(eq(resumes.candidateId, candidateId), isNotNull(resumes.extractedText)))
    .orderBy(desc(resumes.createdAt));

  const validResume = existingResumes.find((resume) => !isInvalidResumeImport(resume.fileName, resume.extractedText));

  if (validResume) {
    return {
      status: "already-present",
      candidateId,
      resumeId: validResume.id,
      remoteResumeId: candidate.remoteResumeId ?? undefined,
    };
  }

  for (const resume of existingResumes) {
    if (!isInvalidResumeImport(resume.fileName, resume.extractedText)) {
      continue;
    }

    await db.delete(resumes).where(eq(resumes.id, resume.id));
    if (resume.filePath?.trim()) {
      await unlink(resume.filePath).catch(() => undefined);
    }
  }

  const client = getBaobaoClient();
  if (!client) {
    return {
      status: "baobao-unavailable",
      candidateId,
      remoteResumeId: candidate.remoteResumeId ?? undefined,
      note: "Baobao client not initialized",
    };
  }

  const remoteResumeId = candidate.remoteResumeId ?? await resolveRemoteResumeId(candidateId);
  if (!remoteResumeId) {
    return {
      status: "missing-remote-resume-id",
      candidateId,
      note: "No remote resume id available for this candidate",
    };
  }

  try {
    const download = await client.downloadResumeFile(remoteResumeId);
    const extension = resolveResumeExtension(download.fileName, download.contentType);
    const fileType = resolveResumeFileType(extension);
    const tempDir = join(config.filesDir, "remote-resume-cache");
    await mkdir(tempDir, { recursive: true });
    const tempPath = join(tempDir, `${candidateId}-${Date.now()}${extension}`);

    await writeFile(tempPath, Buffer.from(download.buffer));

    try {
      const imported = await importResumeForCandidate(candidateId, tempPath, {
        fileTypeHint: fileType,
        originalFileName: download.fileName ?? `${candidate.name}-resume${extension}`,
      });

      await db
        .update(candidates)
        .set({ remoteResumeId, updatedAt: Date.now() })
        .where(eq(candidates.id, candidateId));

      return {
        status: "imported",
        candidateId,
        resumeId: imported.resumeId,
        remoteResumeId,
        note: `Imported remote resume ${download.fileName ?? remoteResumeId}`,
      };
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }
  } catch (error) {
    return {
      status: "import-failed",
      candidateId,
      remoteResumeId,
      note: (error as Error).message,
    };
  }
}

export async function syncCandidateResumesToConversation(conversationId: string, candidateId: string): Promise<number> {
  void conversationId;
  void candidateId;
  return 0;
}

async function resolveRemoteResumeId(candidateId: string): Promise<string | null> {
  const [candidate] = await db
    .select({ remoteResumeId: candidates.remoteResumeId, remoteId: candidates.remoteId })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);

  if (candidate?.remoteResumeId) {
    return candidate.remoteResumeId;
  }

  const client = getBaobaoClient();
  if (!client) {
    return null;
  }

  const interviewRows = await db
    .select({ remoteId: interviews.remoteId })
    .from(interviews)
    .where(eq(interviews.candidateId, candidateId))
    .orderBy(desc(interviews.scheduledAt));

   const remoteInterviewIds = interviewRows
     .map((interview) => interview.remoteId?.trim())
     .filter((value): value is string => Boolean(value));

  for (const interview of interviewRows) {
    if (!interview.remoteId) {
      continue;
    }

    try {
      const response = await client.getInterviewInfo(interview.remoteId);
      const remoteResumeId = extractRemoteResumeId(response.data?.resumeUrl);
      if (remoteResumeId) {
        await db
          .update(candidates)
          .set({ remoteResumeId, updatedAt: Date.now() })
          .where(eq(candidates.id, candidateId));
        return remoteResumeId;
      }
    } catch {
      continue;
    }
  }

  const remoteCandidateId = candidate?.remoteId?.trim() || null;
  let pageNum = 1;
  const pageSize = 100;

  while (pageNum <= 20) {
    try {
      const response = await client.getApplicantInterviewAll({ pageNum, pageSize });
      const list = response.data?.list ?? [];

      const matchedApplicant = list.find((applicant) => {
        const applicantId = applicant.id != null ? String(applicant.id) : null;
        const applicantInterviewId = applicant.interviewId != null ? String(applicant.interviewId) : null;
        return (remoteCandidateId && applicantId === remoteCandidateId)
          || (applicantInterviewId && remoteInterviewIds.includes(applicantInterviewId));
      });

      const remoteResumeId = matchedApplicant?.resumeId?.trim();
      if (remoteResumeId) {
        await db
          .update(candidates)
          .set({ remoteResumeId, updatedAt: Date.now() })
          .where(eq(candidates.id, candidateId));
        return remoteResumeId;
      }

      if (list.length < pageSize) {
        break;
      }

      pageNum += 1;
    } catch {
      break;
    }
  }

  return null;
}

function extractRemoteResumeId(resumeUrl: string | null | undefined): string | null {
  if (!resumeUrl?.trim()) {
    return null;
  }

  const directMatch = resumeUrl.match(/getInterviewerFile\/([^/]+)\//);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  const segmentMatch = resumeUrl.match(/\b([a-f0-9]{32})\b/i);
  return segmentMatch?.[1] ?? null;
}

function resolveResumeExtension(fileName: string | null, contentType: string | null): string {
  const fileExtension = extname(fileName ?? "").toLowerCase();
  if (fileExtension) {
    return fileExtension;
  }

  if (contentType?.includes("pdf")) {
    return ".pdf";
  }
  if (contentType?.includes("png")) {
    return ".png";
  }
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) {
    return ".jpg";
  }
  if (contentType?.includes("webp")) {
    return ".webp";
  }

  return ".pdf";
}

function resolveResumeFileType(extension: string): FileType {
  const fileType = classifyFileType(extension);
  return fileType === "unknown" || fileType === "zip" ? "pdf" : fileType;
}

function isInvalidResumeImport(fileName: string | null, extractedText: string | null): boolean {
  const normalizedText = (extractedText ?? "").trim();
  const normalizedFileName = (fileName ?? "").trim().toLowerCase();

  if (!normalizedText) {
    return false;
  }

  if (normalizedFileName === "f.txt") {
    return true;
  }

  if (!(normalizedText.startsWith("{") && normalizedText.endsWith("}"))) {
    return false;
  }

  try {
    const payload = JSON.parse(normalizedText) as { errno?: number | string; errmsg?: string; data?: unknown };
    return Boolean(payload.errno) && typeof payload.errmsg === "string";
  } catch {
    return false;
  }
}
