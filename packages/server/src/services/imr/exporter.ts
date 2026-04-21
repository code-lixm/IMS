import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import JSZip from "jszip";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  artifactVersions,
  artifacts,
  candidateWorkspaces,
  candidates,
  conversations,
  fileResources,
  interviewAssessments,
  interviews,
  luiWorkflows,
  messages,
  resumes,
  sessionMemories,
} from "../../schema";
import type {
  IMRArtifactRecord,
  IMRArtifactVersionRecord,
  IMRCandidate,
  IMRCandidateWorkspaceRecord,
  IMRChecksums,
  IMRConversationRecord,
  IMRFileResourceRecord,
  IMRInterviewAssessmentRecord,
  IMRInterviewRecord,
  IMRLuiWorkflowRecord,
  IMRManifest,
  IMRMessageRecord,
  IMRPackageData,
  IMRResumeRecord,
  IMRSessionMemoryRecord,
} from "./types";

function sanitizeFileNamePart(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized) return fallback;

  return normalized
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function formatExperienceForFileName(years: number | null | undefined): string {
  if (years === null || years === undefined) {
    return "经验未填写";
  }
  return `${years}年经验`;
}

function jsonHash(obj: unknown): string {
  let hash = 0;
  for (const byte of new TextEncoder().encode(JSON.stringify(obj))) {
    hash = (hash * 31 + byte) >>> 0;
  }
  return `sha256:${hash.toString(16)}`;
}

function sha256Bytes(data: Uint8Array): string {
  const hashHex = createHash("sha256").update(data).digest("hex");
  return `sha256:${hashHex}`;
}

function toTimestamp(value: number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : value.getTime();
}

function normalizeJsonString(value: string | null | undefined): string | null {
  return value ?? null;
}

function candidateToImr(candidate: typeof candidates.$inferSelect): IMRCandidate {
  return {
    id: candidate.id,
    source: candidate.source as IMRCandidate["source"],
    remoteId: candidate.remoteId,
    remoteResumeId: candidate.remoteResumeId,
    name: candidate.name,
    phone: candidate.phone,
    email: candidate.email,
    position: candidate.position,
    organizationName: candidate.organizationName,
    orgAllParentName: candidate.orgAllParentName,
    recruitmentSourceName: candidate.recruitmentSourceName,
    yearsOfExperience: candidate.yearsOfExperience,
    tags: candidate.tagsJson ? JSON.parse(candidate.tagsJson) : [],
    deletedAt: candidate.deletedAt,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

export async function exportCandidate(candidateId: string): Promise<{ buffer: Buffer; filename: string }> {
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
  if (!candidate) {
    throw new Error(`candidate ${candidateId} not found`);
  }

  const [
    resumeRows,
    interviewRows,
    assessmentRows,
    artifactRows,
    workspaceRows,
    conversationRows,
    workflowRows,
  ] = await Promise.all([
    db.select().from(resumes).where(eq(resumes.candidateId, candidateId)),
    db.select().from(interviews).where(eq(interviews.candidateId, candidateId)).orderBy(desc(interviews.round)),
    db.select().from(interviewAssessments).where(eq(interviewAssessments.candidateId, candidateId)),
    db.select().from(artifacts).where(eq(artifacts.candidateId, candidateId)).orderBy(desc(artifacts.updatedAt)),
    db.select().from(candidateWorkspaces).where(eq(candidateWorkspaces.candidateId, candidateId)),
    db.select().from(conversations).where(eq(conversations.candidateId, candidateId)).orderBy(desc(conversations.updatedAt)),
    db.select().from(luiWorkflows).where(eq(luiWorkflows.candidateId, candidateId)).orderBy(desc(luiWorkflows.updatedAt)),
  ]);

  const artifactIds = artifactRows.map((row) => row.id);
  const conversationIds = conversationRows.map((row) => row.id);

  const [artifactVersionRows, messageRows, fileResourceRows, sessionMemoryRows] = await Promise.all([
    artifactIds.length > 0
      ? db.select().from(artifactVersions).where(inArray(artifactVersions.artifactId, artifactIds)).orderBy(desc(artifactVersions.version))
      : Promise.resolve([] as Array<typeof artifactVersions.$inferSelect>),
    conversationIds.length > 0
      ? db.select().from(messages).where(inArray(messages.conversationId, conversationIds)).orderBy(messages.createdAt)
      : Promise.resolve([] as Array<typeof messages.$inferSelect>),
    conversationIds.length > 0
      ? db.select().from(fileResources).where(inArray(fileResources.conversationId, conversationIds)).orderBy(desc(fileResources.createdAt))
      : Promise.resolve([] as Array<typeof fileResources.$inferSelect>),
    conversationIds.length > 0
      ? db.select().from(sessionMemories).where(inArray(sessionMemories.conversationId, conversationIds)).orderBy(sessionMemories.createdAt)
      : Promise.resolve([] as Array<typeof sessionMemories.$inferSelect>),
  ]);

  const zip = new JSZip();
  const namePart = sanitizeFileNamePart(candidate.name, "未命名候选人");
  const positionPart = sanitizeFileNamePart(candidate.position, "职位未填写");
  const experiencePart = formatExperienceForFileName(candidate.yearsOfExperience);
  const exportFileName = `${namePart}-${positionPart}-${experiencePart}.imr`;
  const base = `${namePart}-${positionPart}-${experiencePart}`;

  let attachmentCount = 0;
  const checksums: IMRChecksums = {};
  const candidateData = candidateToImr(candidate);

  const imrResumes: IMRResumeRecord[] = [];
  for (const resume of resumeRows) {
    let attachmentPath = resume.filePath;
    if (existsSync(resume.filePath)) {
      const zipPath = `${base}/attachments/resumes/${resume.id}-${sanitizeFileNamePart(resume.fileName, basename(resume.filePath))}`;
      const bytes = readFileSync(resume.filePath);
      zip.file(zipPath, bytes);
      checksums[zipPath] = await sha256Bytes(bytes);
      attachmentCount += 1;
      attachmentPath = zipPath.replace(`${base}/`, "");
    }

    imrResumes.push({
      id: resume.id,
      candidateId: resume.candidateId,
      fileName: resume.fileName,
      fileType: resume.fileType,
      fileSize: resume.fileSize,
      filePath: attachmentPath,
      extractedText: resume.extractedText,
      parsedDataJson: normalizeJsonString(resume.parsedDataJson),
      ocrConfidence: resume.ocrConfidence,
      createdAt: resume.createdAt,
    });
  }

  const imrInterviews: IMRInterviewRecord[] = interviewRows.map((row) => ({
    id: row.id,
    candidateId: row.candidateId,
    remoteId: row.remoteId,
    round: row.round,
    status: row.status,
    statusRaw: row.statusRaw,
    interviewType: row.interviewType,
    interviewResult: row.interviewResult,
    interviewResultString: row.interviewResultString,
    scheduledAt: row.scheduledAt,
    interviewPlace: row.interviewPlace,
    meetingLink: row.meetingLink,
    dockingHrName: row.dockingHrName,
    dockingHrbpName: row.dockingHrbpName,
    checkInTime: row.checkInTime,
    arrivalDate: row.arrivalDate,
    eliminateReasonString: row.eliminateReasonString,
    remark: row.remark,
    interviewerIdsJson: normalizeJsonString(row.interviewerIdsJson),
    manualEvaluationJson: normalizeJsonString(row.manualEvaluationJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const imrAssessments: IMRInterviewAssessmentRecord[] = assessmentRows.map((row) => ({
    id: row.id,
    candidateId: row.candidateId,
    interviewId: row.interviewId,
    interviewerId: row.interviewerId,
    technicalScore: row.technicalScore,
    communicationScore: row.communicationScore,
    cultureFitScore: row.cultureFitScore,
    overallScore: row.overallScore,
    technicalEvaluation: row.technicalEvaluation,
    communicationEvaluation: row.communicationEvaluation,
    cultureFitEvaluation: row.cultureFitEvaluation,
    overallEvaluation: row.overallEvaluation,
    recommendation: row.recommendation as IMRInterviewAssessmentRecord["recommendation"],
    reportMarkdown: row.reportMarkdown,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const imrArtifacts: IMRArtifactRecord[] = artifactRows.map((row) => ({
    id: row.id,
    candidateId: row.candidateId,
    interviewId: row.interviewId,
    type: row.type,
    roundNumber: row.roundNumber,
    currentVersion: row.currentVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const imrArtifactVersions: IMRArtifactVersionRecord[] = [];
  for (const version of artifactVersionRows) {
    let markdownPath = version.markdownPath;
    if (version.markdownPath && existsSync(version.markdownPath)) {
      const zipPath = `${base}/attachments/artifacts/${version.artifactId}/v${version.version}.md`;
      const bytes = readFileSync(version.markdownPath);
      zip.file(zipPath, bytes);
      checksums[zipPath] = await sha256Bytes(bytes);
      attachmentCount += 1;
      markdownPath = zipPath.replace(`${base}/`, "");
    }

    let pdfPath = version.pdfPath;
    if (version.pdfPath && existsSync(version.pdfPath)) {
      const zipPath = `${base}/attachments/artifacts/${version.artifactId}/v${version.version}.pdf`;
      const bytes = readFileSync(version.pdfPath);
      zip.file(zipPath, bytes);
      checksums[zipPath] = await sha256Bytes(bytes);
      attachmentCount += 1;
      pdfPath = zipPath.replace(`${base}/`, "");
    }

    imrArtifactVersions.push({
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

  const imrWorkspaces: IMRCandidateWorkspaceRecord[] = workspaceRows.map((row) => ({
    id: row.id,
    candidateId: row.candidateId,
    workspaceStatus: row.workspaceStatus,
    lastAccessedAt: row.lastAccessedAt,
    createdAt: row.createdAt,
  }));

  const imrConversations: IMRConversationRecord[] = conversationRows.map((row) => ({
    id: row.id,
    title: row.title,
    candidateId: row.candidateId,
    agentId: row.agentId,
    modelProvider: row.modelProvider,
    modelId: row.modelId,
    temperature: row.temperature,
    createdAt: toTimestamp(row.createdAt) ?? Date.now(),
    updatedAt: toTimestamp(row.updatedAt) ?? Date.now(),
  }));

  const imrMessages: IMRMessageRecord[] = messageRows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning,
    toolsJson: normalizeJsonString(row.toolsJson),
    status: row.status,
    createdAt: toTimestamp(row.createdAt) ?? Date.now(),
  }));

  const imrFileResources: IMRFileResourceRecord[] = [];
  for (const resource of fileResourceRows) {
    let filePath = resource.filePath;
    if (resource.filePath && existsSync(resource.filePath)) {
      const zipPath = `${base}/attachments/file-resources/${resource.id}-${sanitizeFileNamePart(resource.name, basename(resource.filePath))}`;
      const bytes = readFileSync(resource.filePath);
      zip.file(zipPath, bytes);
      checksums[zipPath] = await sha256Bytes(bytes);
      attachmentCount += 1;
      filePath = zipPath.replace(`${base}/`, "");
    }

    imrFileResources.push({
      id: resource.id,
      conversationId: resource.conversationId,
      name: resource.name,
      type: resource.type,
      content: resource.content,
      filePath,
      language: resource.language,
      size: resource.size,
      createdAt: toTimestamp(resource.createdAt) ?? Date.now(),
    });
  }

  const imrWorkflows: IMRLuiWorkflowRecord[] = workflowRows.map((row) => ({
    id: row.id,
    candidateId: row.candidateId,
    conversationId: row.conversationId,
    currentStage: row.currentStage as IMRLuiWorkflowRecord["currentStage"],
    stageDataJson: normalizeJsonString(row.stageDataJson),
    documentsJson: normalizeJsonString(row.documentsJson),
    status: row.status as IMRLuiWorkflowRecord["status"],
    createdAt: toTimestamp(row.createdAt) ?? Date.now(),
    updatedAt: toTimestamp(row.updatedAt) ?? Date.now(),
  }));

  const imrSessionMemories: IMRSessionMemoryRecord[] = sessionMemoryRows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    type: row.type,
    content: row.content,
    metadata: row.metadata,
    importance: row.importance,
    createdAt: toTimestamp(row.createdAt) ?? Date.now(),
    expiresAt: toTimestamp(row.expiresAt),
  }));

  const packageData: IMRPackageData = {
    candidate: candidateData,
    resumes: imrResumes,
    interviews: imrInterviews,
    interviewAssessments: imrAssessments,
    artifacts: imrArtifacts,
    artifactVersions: imrArtifactVersions,
    candidateWorkspaces: imrWorkspaces,
    conversations: imrConversations,
    messages: imrMessages,
    fileResources: imrFileResources,
    workflows: imrWorkflows,
    sessionMemories: imrSessionMemories,
  };

  const manifest: IMRManifest = {
    format: "imr",
    version: "1.1.0",
    exportedAt: new Date().toISOString(),
    sourceApp: "interview-manager",
    sourceVersion: "0.1.0",
    candidateId: candidate.id,
    candidateIdentity: {
      name: candidate.name,
      phone: candidate.phone,
      email: candidate.email,
      remoteId: candidate.remoteId,
    },
    contains: {
      resumes: imrResumes.length,
      interviews: imrInterviews.length,
      interviewAssessments: imrAssessments.length,
      artifacts: imrArtifacts.length,
      artifactVersions: imrArtifactVersions.length,
      candidateWorkspaces: imrWorkspaces.length,
      conversations: imrConversations.length,
      messages: imrMessages.length,
      fileResources: imrFileResources.length,
      workflows: imrWorkflows.length,
      sessionMemories: imrSessionMemories.length,
      attachments: attachmentCount,
    },
    hashAlgorithm: "sha256",
    encryption: { enabled: false, method: null },
  };

  const candidateJsonPath = `${base}/candidate.json`;
  const packageJsonPath = `${base}/package-data.json`;
  const manifestPath = `${base}/manifest.json`;
  const checksumsPath = `${base}/checksums.json`;

  zip.file(candidateJsonPath, JSON.stringify(candidateData, null, 2));
  zip.file(packageJsonPath, JSON.stringify(packageData, null, 2));
  zip.file(manifestPath, JSON.stringify(manifest, null, 2));

  checksums[candidateJsonPath] = jsonHash(candidateData);
  checksums[packageJsonPath] = jsonHash(packageData);
  checksums[manifestPath] = jsonHash(manifest);

  zip.file(checksumsPath, JSON.stringify(checksums, null, 2));
  checksums[checksumsPath] = jsonHash(checksums);

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { buffer, filename: exportFileName };
}
