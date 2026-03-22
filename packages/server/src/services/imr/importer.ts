import { readFileSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import JSZip from "jszip";
import { db } from "../../db";
import { candidates, resumes, interviews, artifacts, artifactVersions, shareRecords } from "../../schema";
import { eq } from "drizzle-orm";
import type { IMRManifest, IMRCandidate, ImportResult } from "./types";
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

  const { candidateId, isNew } = await resolveCandidate(manifest.candidateIdentity, candData.source, candData.createdAt, candData.updatedAt);
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

  // Share record
  await db.insert(shareRecords).values({ id: `share_${crypto.randomUUID()}`, type: "receive", candidateId, targetDeviceJson: null, exportFilePath: filePath, status: "success", resultJson: JSON.stringify({ mergedFields, isNew }), createdAt: Date.now(), completedAt: Date.now() });

  return { result: isNew ? "created" : "merged", candidateId, mergedFields };
}

async function resolveCandidate(identity: IMRManifest["candidateIdentity"], source: IMRCandidate["source"], createdAt: number, updatedAt: number): Promise<{ candidateId: string; isNew: boolean }> {
  if (identity.phone) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.phone, identity.phone)).limit(1);
    if (existing) return { candidateId: existing.id, isNew: false };
  }
  if (identity.email) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.email, identity.email)).limit(1);
    if (existing) return { candidateId: existing.id, isNew: false };
  }
  const id = `cand_${crypto.randomUUID()}`;
  await db.insert(candidates).values({ id, source, remoteId: null, name: identity.name, phone: identity.phone ?? null, email: identity.email ?? null, position: null, yearsOfExperience: null, tagsJson: "[]", createdAt, updatedAt });
  return { candidateId: id, isNew: true };
}
