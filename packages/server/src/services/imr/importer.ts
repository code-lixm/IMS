import { readFileSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import JSZip from "jszip";
import { db } from "../../db";
import { candidates, resumes, interviews, artifacts, artifactVersions, shareRecords } from "../../schema";
import { eq } from "drizzle-orm";
import type { IMRManifest, IMRCandidate, ImportResult, ConflictInfo } from "./types";
import { config } from "../../config";
import { classifyFileType, type FileType } from "../import/types";

async function validatePackage(zip: JSZip): Promise<{ manifest: IMRManifest }> {
  const manifestFile = Object.keys(zip.files).find(n => n.endsWith("manifest.json"));
  if (!manifestFile) throw new Error("invalid IMR: manifest.json not found");
  const manifest: IMRManifest = JSON.parse(await zip.file(manifestFile)!.async("string"));
  if (manifest.format !== "imr" || !manifest.version.startsWith("1.")) throw new Error(`unsupported IMR: ${manifest.format} v${manifest.version}`);
  return { manifest };
}

export async function importIpmr(filePath: string): Promise<ImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(readFileSync(filePath));
  } catch {
    return { result: "failed", error: "failed to read or parse zip archive" };
  }

  let manifest: IMRManifest;
  try {
    ({ manifest } = await validatePackage(zip));
  } catch (err) {
    return { result: "failed", error: (err as Error).message };
  }

  const baseFolder = Object.keys(zip.files).find(n => n.includes("manifest.json"))!.replace("/manifest.json", "");
  const candData: IMRCandidate = JSON.parse(await zip.file(`${baseFolder}/candidate.json`)!.async("string"));

  const resolveResult = await resolveCandidate(manifest.candidateIdentity, candData.source, candData.createdAt, candData.updatedAt, candData);

  // If conflict, return early for user decision
  if (resolveResult.status === "conflict") {
    return {
      result: "conflict",
      candidateId: resolveResult.candidateId!,
      candidateName: candData.name,
      phone: candData.phone,
      email: candData.email,
      conflicts: resolveResult.conflicts!,
    };
  }

  // Proceed with import
  const candidateId = resolveResult.candidateId!;
  const isNew = resolveResult.status === "new";
  const mergedFields: string[] = [];

  if (!isNew) {
    await db.update(candidates).set({ name: candData.name, position: candData.position ?? undefined, yearsOfExperience: candData.yearsOfExperience ?? undefined, tagsJson: JSON.stringify(candData.tags), updatedAt: Date.now() }).where(eq(candidates.id, candidateId));
    mergedFields.push("basic_info");
  }

  // Resumes
  const resumeFolder = `${baseFolder}/resumes`;
  const resumeFiles = Object.keys(zip.files).filter(n => n.startsWith(resumeFolder) && !n.includes("parsed"));
  const destResumeDir = join(config.filesDir, "resumes");
  mkdirSync(destResumeDir, { recursive: true });

  for (const relPath of resumeFiles) {
    const entry = zip.file(relPath)!;
    const originalName = basename(relPath);
    const resumeId = `res_${crypto.randomUUID()}`;
    const destPath = join(destResumeDir, `${resumeId}-${originalName}`);
    writeFileSync(destPath, await entry.async("nodebuffer"));
    const fileType: FileType = classifyFileType(originalName);
    await db.insert(resumes).values({ id: resumeId, candidateId, fileName: originalName, fileType: fileType === "unknown" ? "pdf" : fileType, fileSize: (await entry.async("nodebuffer")).byteLength, filePath: destPath, extractedText: null, parsedDataJson: null, ocrConfidence: null, createdAt: Date.now() });
  }
  if (resumeFiles.length > 0) mergedFields.push("resumes");

  // Interviews
  const intFolder = `${baseFolder}/interviews`;
  const intFiles = Object.keys(zip.files).filter(n => n.startsWith(intFolder) && n.endsWith(".json"));
  for (const relPath of intFiles) {
    const intData = JSON.parse(await zip.file(relPath)!.async("string"));
    const [existing] = await db.select({ id: interviews.id }).from(interviews).where(eq(interviews.candidateId, candidateId)).limit(1);
    if (!existing) {
      await db.insert(interviews).values({ id: `int_${crypto.randomUUID()}`, candidateId, remoteId: intData.remoteId ?? null, round: intData.round ?? 1, status: intData.status ?? "scheduled", scheduledAt: intData.scheduledAt ?? null, meetingLink: intData.meetingLink ?? null, interviewerIdsJson: JSON.stringify(intData.interviewerIds ?? []), manualEvaluationJson: intData.manualEvaluation ? JSON.stringify(intData.manualEvaluation) : null, createdAt: intData.createdAt ?? Date.now(), updatedAt: intData.updatedAt ?? Date.now() });
    }
  }
  if (intFiles.length > 0) mergedFields.push("interviews");

  // Parsed resumes (extracted text and structured data)
  const parsedFolder = `${baseFolder}/parsed`;
  const parsedFiles = Object.keys(zip.files).filter(n => n.startsWith(parsedFolder) && (n.endsWith(".extracted.txt") || n.endsWith(".parsed.json")));
  for (const relPath of parsedFiles) {
    const entry = zip.file(relPath)!;
    const fileName = basename(relPath);
    const match = fileName.match(/^(.+)\.(extracted\.txt|parsed\.json)$/);
    if (!match) continue;
    const resumeId = match[1];
    // Find the resume we just inserted
    const [resume] = await db.select({ id: resumes.id }).from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    if (!resume) continue;
    if (relPath.endsWith(".extracted.txt")) {
      const extractedText = await entry.async("string");
      await db.update(resumes).set({ extractedText, ocrConfidence: null }).where(eq(resumes.id, resumeId));
    } else if (relPath.endsWith(".parsed.json")) {
      const parsedData = await entry.async("string");
      await db.update(resumes).set({ parsedDataJson: parsedData }).where(eq(resumes.id, resumeId));
    }
  }
  if (parsedFiles.length > 0) mergedFields.push("parsed_resumes");

  // Artifacts and artifact versions
  const artFolder = `${baseFolder}/artifacts`;
  const artFiles = Object.keys(zip.files).filter(n => n.startsWith(artFolder) && n.endsWith("artifact.json"));
  for (const relPath of artFiles) {
    const artData = JSON.parse(await zip.file(relPath)!.async("string"));
    const artFolderPath = dirname(relPath);
    const artId = artData.id || `art_${crypto.randomUUID()}`;
    // Determine interviewId if present
    let interviewId = null;
    if (artData.interviewId) {
      const [intRow] = await db.select({ id: interviews.id }).from(interviews).where(eq(interviews.id, artData.interviewId)).limit(1);
      if (intRow) interviewId = intRow.id;
    }
    await db.insert(artifacts).values({
      id: artId,
      candidateId,
      interviewId,
      type: artData.type,
      roundNumber: artData.roundNumber ?? null,
      currentVersion: artData.currentVersion ?? 1,
      createdAt: artData.createdAt ?? Date.now(),
      updatedAt: artData.updatedAt ?? Date.now(),
    }).onConflictDoNothing();
    // Find all version files in this artifact folder
    const vFiles = Object.keys(zip.files).filter(n => n.startsWith(artFolderPath + "/v") && n.endsWith(".json") && !n.endsWith(".md"));
    for (const vPath of vFiles) {
      const verData = JSON.parse(await zip.file(vPath)!.async("string"));
      const verId = verData.id || `ver_${crypto.randomUUID()}`;
      // Copy markdown file if exists
      let markdownPath = null;
      const mdPath = vPath.replace(/\.json$/, ".md");
      if (zip.files[mdPath]) {
        const mdContent = await zip.file(mdPath)!.async("nodebuffer");
        const mdDir = join(config.filesDir, "artifacts", artId);
        mkdirSync(mdDir, { recursive: true });
        markdownPath = join(mdDir, `v${verData.version}.md`);
        writeFileSync(markdownPath, mdContent);
      }
      await db.insert(artifactVersions).values({
        id: verId,
        artifactId: artId,
        version: verData.version,
        promptSnapshot: verData.promptSnapshot ?? null,
        feedbackText: verData.feedbackText ?? null,
        structuredDataJson: verData.structuredDataJson ?? null,
        markdownPath,
        pdfPath: verData.pdfPath ?? null,
        createdAt: verData.createdAt ?? Date.now(),
      }).onConflictDoNothing();
    }
  }
  if (artFiles.length > 0) mergedFields.push("artifacts");

  // Share record
  await db.insert(shareRecords).values({ id: `share_${crypto.randomUUID()}`, type: "receive", candidateId, targetDeviceJson: null, exportFilePath: filePath, status: "success", resultJson: JSON.stringify({ mergedFields, isNew }), createdAt: Date.now(), completedAt: Date.now() });

  return { result: isNew ? "created" : "merged", candidateId, mergedFields };
}

interface ConflictCheckResult {
  status: "new" | "existing_no_conflict" | "conflict";
  candidateId?: string;
  conflicts?: ConflictInfo[];
}

async function resolveCandidate(identity: IMRManifest["candidateIdentity"], source: IMRCandidate["source"], createdAt: number, updatedAt: number, candData: IMRCandidate): Promise<ConflictCheckResult> {
  let existingId: string | null = null;

  if (identity.phone) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.phone, identity.phone)).limit(1);
    if (existing) existingId = existing.id;
  }
  if (!existingId && identity.email) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.email, identity.email)).limit(1);
    if (existing) existingId = existing.id;
  }

  if (existingId) {
    // Check for conflicts
    const [existing] = await db.select().from(candidates).where(eq(candidates.id, existingId)).limit(1);
    if (existing) {
      const conflicts: ConflictInfo[] = [];
      if (existing.name !== candData.name) conflicts.push({ name: "name", label: "姓名", localValue: existing.name, importValue: candData.name });
      if (existing.position !== candData.position) conflicts.push({ name: "position", label: "职位", localValue: existing.position, importValue: candData.position });
      if (existing.yearsOfExperience !== candData.yearsOfExperience) conflicts.push({ name: "yearsOfExperience", label: "工作年限", localValue: existing.yearsOfExperience, importValue: candData.yearsOfExperience });
      const localTags = existing.tagsJson ? JSON.parse(existing.tagsJson) : [];
      if (JSON.stringify(localTags) !== JSON.stringify(candData.tags)) conflicts.push({ name: "tags", label: "标签", localValue: localTags.length ? localTags.join(", ") : null, importValue: candData.tags.length ? candData.tags.join(", ") : null });

      if (conflicts.length > 0) {
        return { status: "conflict", candidateId: existingId, conflicts };
      }
      return { status: "existing_no_conflict", candidateId: existingId };
    }
  }

  const id = `cand_${crypto.randomUUID()}`;
  await db.insert(candidates).values({ id, source, remoteId: null, name: identity.name, phone: identity.phone ?? null, email: identity.email ?? null, position: null, yearsOfExperience: null, tagsJson: "[]", createdAt, updatedAt });
  return { status: "new", candidateId: id };
}
