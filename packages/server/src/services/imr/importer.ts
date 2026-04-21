import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import JSZip from "jszip";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  artifactVersions,
  artifacts,
  candidateWorkspaces,
  candidates,
  conversations,
  fileResources,
  importFileTasks,
  interviewAssessments,
  interviews,
  luiWorkflows,
  messages,
  resumes,
  sessionMemories,
  shareRecords,
} from "../../schema";
import type { IMRCandidate, IMRManifest, IMRPackageData, ImportResult } from "./types";
import { config } from "../../config";
import { classifyFileType, type FileType } from "../import/types";

async function validatePackage(zip: JSZip): Promise<{ manifest: IMRManifest; baseFolder: string }> {
  const manifestFile = Object.keys(zip.files).find((name) => name.endsWith("manifest.json"));
  if (!manifestFile) {
    throw new Error("invalid IMR: manifest.json not found");
  }

  const manifest: IMRManifest = JSON.parse(await zip.file(manifestFile)!.async("string"));
  if (manifest.format !== "imr" || !manifest.version.startsWith("1.")) {
    throw new Error(`unsupported IMR: ${manifest.format} v${manifest.version}`);
  }

  return {
    manifest,
    baseFolder: manifestFile.replace(/\/manifest\.json$/, ""),
  };
}

function toDate(value: number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}

function normalizeJsonString(value: string | null | undefined): string | null {
  return value ?? null;
}

function isRelativePackagePath(filePath: string | null | undefined): filePath is string {
  if (!filePath) return false;
  return !filePath.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(filePath);
}

async function readZipEntryBytes(zip: JSZip, fullPath: string): Promise<Uint8Array | null> {
  const entry = zip.file(fullPath);
  if (!entry) return null;
  return new Uint8Array(await entry.async("uint8array"));
}

async function readAttachmentToRuntime(
  zip: JSZip,
  baseFolder: string,
  relativePath: string | null | undefined,
  outputPath: string,
): Promise<string | null> {
  if (!isRelativePackagePath(relativePath)) {
    return null;
  }

  const entryBytes = await readZipEntryBytes(zip, `${baseFolder}/${relativePath}`);
  if (!entryBytes) {
    return null;
  }

  mkdirSync(join(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, entryBytes);
  return outputPath;
}

interface ExistingCandidateBundle {
  conversationIds: string[];
  artifactIds: string[];
  resumeFilePaths: string[];
  artifactFilePaths: string[];
  fileResourcePaths: string[];
}

async function collectExistingCandidateBundle(candidateId: string): Promise<ExistingCandidateBundle> {
  const [conversationRows, artifactRows, resumeRows, artifactVersionRows, fileResourceRows] = await Promise.all([
    db.select({ id: conversations.id }).from(conversations).where(eq(conversations.candidateId, candidateId)),
    db.select({ id: artifacts.id }).from(artifacts).where(eq(artifacts.candidateId, candidateId)),
    db.select({ filePath: resumes.filePath }).from(resumes).where(eq(resumes.candidateId, candidateId)),
    db.select({ markdownPath: artifactVersions.markdownPath, pdfPath: artifactVersions.pdfPath })
      .from(artifactVersions)
      .where(inArray(
        artifactVersions.artifactId,
        (await db.select({ id: artifacts.id }).from(artifacts).where(eq(artifacts.candidateId, candidateId))).map((row) => row.id),
      )),
    db.select({ filePath: fileResources.filePath })
      .from(fileResources)
      .where(inArray(
        fileResources.conversationId,
        (await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.candidateId, candidateId))).map((row) => row.id),
      )),
  ]);

  return {
    conversationIds: conversationRows.map((row) => row.id),
    artifactIds: artifactRows.map((row) => row.id),
    resumeFilePaths: resumeRows.map((row) => row.filePath),
    artifactFilePaths: artifactVersionRows.flatMap((row) => [row.markdownPath, row.pdfPath].filter((path): path is string => Boolean(path))),
    fileResourcePaths: fileResourceRows.map((row) => row.filePath).filter((path): path is string => Boolean(path)),
  };
}

async function removeManagedFiles(paths: string[]): Promise<void> {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  for (const filePath of uniquePaths) {
    if (!existsSync(filePath)) continue;
    try {
      await Bun.file(filePath).delete();
    } catch {
      // ignore cleanup failure to avoid breaking import success path
    }
  }
}

async function resolveCandidate(candData: IMRCandidate): Promise<{ targetCandidateId: string; isNew: boolean }> {
  let existingId: string | null = null;

  if (candData.remoteId) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.remoteId, candData.remoteId)).limit(1);
    if (existing) existingId = existing.id;
  }
  if (!existingId && candData.phone) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.phone, candData.phone)).limit(1);
    if (existing) existingId = existing.id;
  }
  if (!existingId && candData.email) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.email, candData.email)).limit(1);
    if (existing) existingId = existing.id;
  }

  if (existingId) {
    return { targetCandidateId: existingId, isNew: false };
  }

  const [sameId] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.id, candData.id)).limit(1);
  return {
    targetCandidateId: sameId ? `cand_${crypto.randomUUID()}` : candData.id,
    isNew: true,
  };
}

export async function importIpmr(filePath: string): Promise<ImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(readFileSync(filePath));
  } catch {
    return { result: "failed", error: "压缩包解析失败" };
  }

  let manifest: IMRManifest;
  let baseFolder: string;
  try {
    ({ manifest, baseFolder } = await validatePackage(zip));
  } catch (error) {
    return { result: "failed", error: (error as Error).message };
  }

  try {
    const candidateFile = zip.file(`${baseFolder}/candidate.json`);
    const packageFile = zip.file(`${baseFolder}/package-data.json`);
    if (!candidateFile || !packageFile) {
      return { result: "failed", error: "legacy IMR package is not supported, please re-export from the latest version" };
    }

    const candData = JSON.parse(await candidateFile.async("string")) as IMRCandidate;
    const packageData = JSON.parse(await packageFile.async("string")) as IMRPackageData;
    const { targetCandidateId, isNew } = await resolveCandidate(candData);
    const mergedFields: string[] = [];
    const cleanup = isNew ? null : await collectExistingCandidateBundle(targetCandidateId);

    await db.transaction(async (tx) => {
      if (cleanup) {
        await tx.update(importFileTasks).set({ candidateId: null, updatedAt: Date.now() }).where(eq(importFileTasks.candidateId, targetCandidateId));

        await tx.delete(luiWorkflows).where(eq(luiWorkflows.candidateId, targetCandidateId));
        await tx.delete(interviewAssessments).where(eq(interviewAssessments.candidateId, targetCandidateId));
        await tx.delete(candidateWorkspaces).where(eq(candidateWorkspaces.candidateId, targetCandidateId));

        if (cleanup.conversationIds.length > 0) {
          await tx.delete(messages).where(inArray(messages.conversationId, cleanup.conversationIds));
          await tx.delete(fileResources).where(inArray(fileResources.conversationId, cleanup.conversationIds));
          await tx.delete(sessionMemories).where(inArray(sessionMemories.conversationId, cleanup.conversationIds));
          await tx.delete(conversations).where(inArray(conversations.id, cleanup.conversationIds));
        }

        if (cleanup.artifactIds.length > 0) {
          await tx.delete(artifactVersions).where(inArray(artifactVersions.artifactId, cleanup.artifactIds));
        }
        await tx.delete(artifacts).where(eq(artifacts.candidateId, targetCandidateId));
        await tx.delete(resumes).where(eq(resumes.candidateId, targetCandidateId));
        await tx.delete(interviews).where(eq(interviews.candidateId, targetCandidateId));
      }

      const candidateValues = {
        id: targetCandidateId,
        source: candData.source,
        remoteId: candData.remoteId,
        remoteResumeId: candData.remoteResumeId,
        name: candData.name,
        phone: candData.phone,
        email: candData.email,
        position: candData.position,
        organizationName: candData.organizationName,
        orgAllParentName: candData.orgAllParentName,
        recruitmentSourceName: candData.recruitmentSourceName,
        yearsOfExperience: candData.yearsOfExperience,
        tagsJson: JSON.stringify(candData.tags ?? []),
        deletedAt: candData.deletedAt,
        createdAt: candData.createdAt,
        updatedAt: Date.now(),
      };

      if (isNew) {
        await tx.insert(candidates).values(candidateValues);
      } else {
        await tx.update(candidates).set(candidateValues).where(eq(candidates.id, targetCandidateId));
      }
      mergedFields.push("candidate");

      for (const resume of packageData.resumes) {
        const outputPath = join(config.filesDir, "resumes", `${resume.id}-${sanitizeFileName(resume.fileName)}`);
        const restoredPath = await readAttachmentToRuntime(zip, baseFolder, resume.filePath, outputPath);
        const normalizedType = classifyFileType(resume.fileName) === "unknown" ? resume.fileType : classifyFileType(resume.fileName);

        await tx.insert(resumes).values({
          id: resume.id,
          candidateId: targetCandidateId,
          fileName: resume.fileName,
          fileType: (normalizedType === "unknown" ? resume.fileType : normalizedType) as FileType,
          fileSize: resume.fileSize,
          filePath: restoredPath ?? outputPath,
          extractedText: resume.extractedText,
          parsedDataJson: normalizeJsonString(resume.parsedDataJson),
          ocrConfidence: resume.ocrConfidence,
          createdAt: resume.createdAt,
        });
      }
      if (packageData.resumes.length > 0) mergedFields.push("resumes");

      for (const interview of packageData.interviews) {
        await tx.insert(interviews).values({
          id: interview.id,
          candidateId: targetCandidateId,
          remoteId: interview.remoteId,
          round: interview.round,
          status: interview.status,
          statusRaw: interview.statusRaw,
          interviewType: interview.interviewType,
          interviewResult: interview.interviewResult,
          interviewResultString: interview.interviewResultString,
          scheduledAt: interview.scheduledAt,
          interviewPlace: interview.interviewPlace,
          meetingLink: interview.meetingLink,
          dockingHrName: interview.dockingHrName,
          dockingHrbpName: interview.dockingHrbpName,
          checkInTime: interview.checkInTime,
          arrivalDate: interview.arrivalDate,
          eliminateReasonString: interview.eliminateReasonString,
          remark: interview.remark,
          interviewerIdsJson: normalizeJsonString(interview.interviewerIdsJson),
          manualEvaluationJson: normalizeJsonString(interview.manualEvaluationJson),
          createdAt: interview.createdAt,
          updatedAt: interview.updatedAt,
        });
      }
      if (packageData.interviews.length > 0) mergedFields.push("interviews");

      for (const assessment of packageData.interviewAssessments) {
        await tx.insert(interviewAssessments).values({
          id: assessment.id,
          candidateId: targetCandidateId,
          interviewId: assessment.interviewId,
          interviewerId: assessment.interviewerId,
          technicalScore: assessment.technicalScore,
          communicationScore: assessment.communicationScore,
          cultureFitScore: assessment.cultureFitScore,
          overallScore: assessment.overallScore,
          technicalEvaluation: assessment.technicalEvaluation,
          communicationEvaluation: assessment.communicationEvaluation,
          cultureFitEvaluation: assessment.cultureFitEvaluation,
          overallEvaluation: assessment.overallEvaluation,
          recommendation: assessment.recommendation,
          reportMarkdown: assessment.reportMarkdown,
          createdAt: assessment.createdAt,
          updatedAt: assessment.updatedAt,
        });
      }
      if (packageData.interviewAssessments.length > 0) mergedFields.push("interview_assessments");

      for (const artifact of packageData.artifacts) {
        await tx.insert(artifacts).values({
          id: artifact.id,
          candidateId: targetCandidateId,
          interviewId: artifact.interviewId,
          type: artifact.type,
          roundNumber: artifact.roundNumber,
          currentVersion: artifact.currentVersion,
          createdAt: artifact.createdAt,
          updatedAt: artifact.updatedAt,
        });
      }
      for (const version of packageData.artifactVersions) {
        const artifactDir = join(config.filesDir, "artifacts", version.artifactId);
        const markdownOutput = join(artifactDir, basename(version.markdownPath ?? `v${version.version}.md`));
        const pdfOutput = join(artifactDir, basename(version.pdfPath ?? `v${version.version}.pdf`));
        const markdownPath = await readAttachmentToRuntime(zip, baseFolder, version.markdownPath, markdownOutput);
        const pdfPath = await readAttachmentToRuntime(zip, baseFolder, version.pdfPath, pdfOutput);

        await tx.insert(artifactVersions).values({
          id: version.id,
          artifactId: version.artifactId,
          version: version.version,
          promptSnapshot: version.promptSnapshot,
          feedbackText: version.feedbackText,
          structuredDataJson: normalizeJsonString(version.structuredDataJson),
          markdownPath,
          pdfPath,
          createdAt: version.createdAt,
        });
      }
      if (packageData.artifacts.length > 0 || packageData.artifactVersions.length > 0) mergedFields.push("artifacts");

      for (const workspace of packageData.candidateWorkspaces) {
        await tx.insert(candidateWorkspaces).values({
          id: workspace.id,
          candidateId: targetCandidateId,
          workspaceStatus: workspace.workspaceStatus,
          lastAccessedAt: workspace.lastAccessedAt,
          createdAt: workspace.createdAt,
        });
      }
      if (packageData.candidateWorkspaces.length > 0) mergedFields.push("candidate_workspaces");

      for (const conversation of packageData.conversations) {
        await tx.insert(conversations).values({
          id: conversation.id,
          title: conversation.title,
          candidateId: conversation.candidateId ? targetCandidateId : null,
          agentId: conversation.agentId,
          modelProvider: conversation.modelProvider,
          modelId: conversation.modelId,
          temperature: conversation.temperature,
          createdAt: toDate(conversation.createdAt) ?? new Date(),
          updatedAt: toDate(conversation.updatedAt) ?? new Date(),
        });
      }
      for (const message of packageData.messages) {
        await tx.insert(messages).values({
          id: message.id,
          conversationId: message.conversationId,
          role: message.role,
          content: message.content,
          reasoning: message.reasoning,
          toolsJson: normalizeJsonString(message.toolsJson),
          status: message.status,
          createdAt: toDate(message.createdAt) ?? new Date(),
        });
      }
      for (const resource of packageData.fileResources) {
        const resourceDir = join(config.filesDir, "file-resources", resource.conversationId);
        const restoredFilePath = await readAttachmentToRuntime(
          zip,
          baseFolder,
          resource.filePath,
          join(resourceDir, basename(resource.filePath ?? `${resource.id}-${sanitizeFileName(resource.name)}`)),
        );
        await tx.insert(fileResources).values({
          id: resource.id,
          conversationId: resource.conversationId,
          name: resource.name,
          type: resource.type,
          content: resource.content,
          filePath: restoredFilePath,
          language: resource.language,
          size: resource.size,
          createdAt: toDate(resource.createdAt) ?? new Date(),
        });
      }
      for (const workflow of packageData.workflows) {
        await tx.insert(luiWorkflows).values({
          id: workflow.id,
          candidateId: targetCandidateId,
          conversationId: workflow.conversationId,
          currentStage: workflow.currentStage,
          stageDataJson: normalizeJsonString(workflow.stageDataJson),
          documentsJson: normalizeJsonString(workflow.documentsJson),
          status: workflow.status,
          createdAt: toDate(workflow.createdAt) ?? new Date(),
          updatedAt: toDate(workflow.updatedAt) ?? new Date(),
        });
      }
      for (const memory of packageData.sessionMemories) {
        await tx.insert(sessionMemories).values({
          id: memory.id,
          conversationId: memory.conversationId,
          type: memory.type,
          content: memory.content,
          metadata: memory.metadata,
          importance: memory.importance,
          createdAt: toDate(memory.createdAt) ?? new Date(),
          expiresAt: toDate(memory.expiresAt),
        });
      }
      if (
        packageData.conversations.length > 0 ||
        packageData.messages.length > 0 ||
        packageData.fileResources.length > 0 ||
        packageData.workflows.length > 0 ||
        packageData.sessionMemories.length > 0
      ) {
        mergedFields.push("lui_data");
      }

      await tx.insert(shareRecords).values({
        id: `share_${crypto.randomUUID()}`,
        type: "receive",
        candidateId: targetCandidateId,
        targetDeviceJson: null,
        exportFilePath: filePath,
        status: "success",
        resultJson: JSON.stringify({ mergedFields, importedManifest: manifest.version, isNew }),
        createdAt: Date.now(),
        completedAt: Date.now(),
      });
    });

    if (cleanup) {
      await removeManagedFiles([
        ...cleanup.resumeFilePaths,
        ...cleanup.artifactFilePaths,
        ...cleanup.fileResourcePaths,
      ]);
    }

    return isNew
      ? { result: "created", candidateId: targetCandidateId }
      : { result: "merged", candidateId: targetCandidateId, mergedFields };
  } catch (error) {
    return { result: "failed", error: (error as Error).message };
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "file";
}
