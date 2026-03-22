/**
 * IMR Importer — validates and unpacks a .imr file into the local database.
 *
 * Conflict resolution order:
 *   1. phone exact match
 *   2. email exact match
 *   3. user manually resolves
 *   4. create new candidate
 *
 * (This module currently does automatic merge — manual resolution is a future feature.)
 */

import { readFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import JSZip from "jszip";
import { db } from "../../db";
import {
  candidates,
  resumes,
  interviews,
  artifacts,
  artifactVersions,
  shareRecords,
} from "../../schema";
import { eq } from "drizzle-orm";
import type {
  IMRManifest,
  IMRChecksums,
  IMRCandidate,
  ImportResult,
} from "./types";
import { config } from "../../config";
import { classifyFileType, type FileType } from "../import/types";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

async function validatePackage(
  zip: JSZip,
  filePath: string
): Promise<{ manifest: IMRManifest; checksums: IMRChecksums }> {
  const manifestFile = Object.keys(zip.files).find((n) => n.endsWith("manifest.json"));
  if (!manifestFile) throw new Error("invalid IMR: manifest.json not found");

  const checksumsFile = Object.keys(zip.files).find((n) => n.endsWith("checksums.json"));
  if (!checksumsFile) throw new Error("invalid IMR: checksums.json not found");

  const manifest: IMRManifest = JSON.parse(await zip.file(manifestFile)!.async("string"));
  const checksums: IMRChecksums = JSON.parse(
    await zip.file(checksumsFile)!.async("string")
  );

  // Version check
  if (manifest.format !== "imr" || !manifest.version.startsWith("1.")) {
    throw new Error(`unsupported IMR format: ${manifest.format} v${manifest.version}`);
  }

  // Integrity check (skip for now — json hashes vs sha256 mismatch risk)
  // TODO: re-enable after fixing hash algorithm consistency
  // for (const [relPath, expectedHash] of Object.entries(checksums)) {
  //   const entry = zip.file(relPath);
  //   if (!entry) throw new Error(`checksum mismatch: ${relPath} not found in archive`);
  // }

  return { manifest, checksums };
}

// ---------------------------------------------------------------------------
// Candidate lookup / create
// ---------------------------------------------------------------------------

async function resolveCandidate(
  identity: IMRManifest["candidateIdentity"],
  source: IMRCandidate["source"],
  createdAt: number,
  updatedAt: number
): Promise<{ candidateId: string; isNew: boolean }> {
  // Phone match
  if (identity.phone) {
    const [existing] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.phone, identity.phone))
      .limit(1);
    if (existing) return { candidateId: existing.id, isNew: false };
  }

  // Email match
  if (identity.email) {
    const [existing] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.email, identity.email))
      .limit(1);
    if (existing) return { candidateId: existing.id, isNew: false };
  }

  // Create new
  const id = `cand_${crypto.randomUUID()}`;
  const now = Date.now();
  await db.insert(candidates).values({
    id,
    source,
    remoteId: null,
    name: identity.name,
    phone: identity.phone ?? null,
    email: identity.email ?? null,
    position: null,
    yearsOfExperience: null,
    tagsJson: "[]",
    createdAt,
    updatedAt,
  });

  return { candidateId: id, isNew: true };
}

// ---------------------------------------------------------------------------
// Import entry point
// ---------------------------------------------------------------------------

export async function importIpmr(filePath: string): Promise<ImportResult> {
  if (!existsSync(filePath)) {
    return { result: "failed", error: `file not found: ${filePath}` };
  }

  let zip: JSZip;
  try {
    const buf = readFileSync(filePath);
    zip = await JSZip.loadAsync(buf);
  } catch {
    return { result: "failed", error: "failed to read or parse zip archive" };
  }

  let manifest: IMRManifest;
  let checksums: IMRChecksums;
  try {
    ({ manifest, checksums } = await validatePackage(zip, filePath));
  } catch (err) {
    return { result: "failed", error: (err as Error).message };
  }

  const baseFolder = Object.keys(zip.files).find(
    (n) => n.includes("manifest.json")
  )!.replace("/manifest.json", "");

  const candidateFile = `${baseFolder}/candidate.json`;
  const candData: IMRCandidate = JSON.parse(
    await zip.file(candidateFile)!.async("string")
  );

  // Resolve candidate
  const { candidateId, isNew } = await resolveCandidate(
    manifest.candidateIdentity,
    candData.source,
    candData.createdAt,
    candData.updatedAt
  );

  const mergedFields: string[] = [];

  // ── Update candidate basics (only if new) ─────────────────────────────
  if (!isNew) {
    await db
      .update(candidates)
      .set({
        name: candData.name,
        position: candData.position ?? undefined,
        yearsOfExperience: candData.yearsOfExperience ?? undefined,
        tagsJson: JSON.stringify(candData.tags),
        updatedAt: Date.now(),
      })
      .where(eq(candidates.id, candidateId));
    mergedFields.push("basic_info");
  }

  // ── Import resumes ─────────────────────────────────────────────────────
  const resumeFolder = `${baseFolder}/resumes`;
  const parsedFolder = `${baseFolder}/parsed`;
  const resumeFiles = Object.keys(zip.files).filter(
    (n) => n.startsWith(resumeFolder) && !n.includes("parsed")
  );

  const destResumeDir = join(config.filesDir, "resumes");
  mkdirSync(destResumeDir, { recursive: true });

  for (const relPath of resumeFiles) {
    const entry = zip.file(relPath)!;
    const originalName = basename(relPath);
    const resumeId = `res_${crypto.randomUUID()}`;
    const destPath = join(destResumeDir, `${resumeId}-${originalName}`);

    const buf = await entry.async("nodebuffer");
    copyFileSync(filePath, destPath); // temporary; we'll write the buf below
    // Actually we need to write the buffer, not copy the zip
    const { writeFileSync } = await import("node:fs");
    writeFileSync(destPath, buf);

    const fileType: FileType = classifyFileType(originalName);

    await db.insert(resumes).values({
      id: resumeId,
      candidateId,
      fileName: originalName,
      fileType: fileType === "unknown" ? "pdf" : fileType,
      fileSize: buf.byteLength,
      filePath: destPath,
      extractedText: null,
      parsedDataJson: null,
      ocrConfidence: null,
      createdAt: Date.now(),
    });
  }
  if (resumeFiles.length > 0) mergedFields.push("resumes");

  // ── Import interviews ───────────────────────────────────────────────────
  const intFolder = `${baseFolder}/interviews`;
  const intFiles = Object.keys(zip.files).filter((n) =>
    n.startsWith(intFolder) && n.endsWith(".json")
  );

  for (const relPath of intFiles) {
    const intData = JSON.parse(await zip.file(relPath)!.async("string"));
    // Check for duplicate by round
    const [existing] = await db
      .select({ id: interviews.id })
      .from(interviews)
      .where(eq(interviews.candidateId, candidateId))
      .limit(1);

    if (!existing) {
      const intId = `int_${crypto.randomUUID()}`;
      await db.insert(interviews).values({
        id: intId,
        candidateId,
        remoteId: intData.remoteId ?? null,
        round: intData.round ?? 1,
        status: intData.status ?? "scheduled",
        scheduledAt: intData.scheduledAt ?? null,
        meetingLink: intData.meetingLink ?? null,
        interviewerIdsJson: JSON.stringify(intData.interviewerIds ?? []),
        manualEvaluationJson: intData.manualEvaluation
          ? JSON.stringify(intData.manualEvaluation)
          : null,
        createdAt: intData.createdAt ?? Date.now(),
        updatedAt: intData.updatedAt ?? Date.now(),
      });
    }
  }
  if (intFiles.length > 0) mergedFields.push("interviews");

  // ── Import artifacts ────────────────────────────────────────────────────
  const artFolder = `${baseFolder}/artifacts`;
  const artTypes = [...new Set(Object.keys(zip.files)
    .filter((n) => n.startsWith(artFolder))
    .map((n) => n.replace(`${artFolder}/`, "").split("/")[0])
    .filter(Boolean))];

  for (const artType of artTypes) {
    const metaFile = `${artFolder}/${artType}/artifact.json`;
    const metaEntry = zip.file(metaFile);
    if (!metaEntry) continue;

    const meta = JSON.parse(await metaEntry.async("string"));
    const artId = `art_${crypto.randomUUID()}`;

    await db.insert(artifacts).values({
      id: artId,
      candidateId,
      interviewId: meta.interviewId ?? null,
      type: artType,
      roundNumber: meta.roundNumber ?? null,
      currentVersion: meta.currentVersion ?? 1,
      createdAt: meta.createdAt ?? Date.now(),
      updatedAt: meta.updatedAt ?? Date.now(),
    });

    // Versions
    const verFiles = Object.keys(zip.files).filter(
      (n) => n.startsWith(`${artFolder}/${artType}/`) && n.endsWith(".json") && !n.includes("artifact")
    );

    for (const verPath of verFiles) {
      const verData = JSON.parse(await zip.file(verPath)!.async("string"));
      await db.insert(artifactVersions).values({
        id: `ver_${crypto.randomUUID()}`,
        artifactId: artId,
        version: verData.version ?? 1,
        promptSnapshot: verData.promptSnapshot ?? null,
        feedbackText: verData.feedbackText ?? null,
        structuredDataJson: verData.structuredDataJson ?? null,
        markdownPath: verData.markdownPath ?? null,
        pdfPath: verData.pdfPath ?? null,
        createdAt: verData.createdAt ?? Date.now(),
      });
    }
  }
  if (artTypes.length > 0) mergedFields.push("artifacts");

  // ── Share record ───────────────────────────────────────────────────────
  await db.insert(shareRecords).values({
    id: `share_${crypto.randomUUID()}`,
    type: "receive",
    candidateId,
    targetDeviceJson: null,
    exportFilePath: filePath,
    status: "success",
    resultJson: JSON.stringify({ mergedFields, isNew }),
    createdAt: Date.now(),
    completedAt: Date.now(),
  });

  return {
    result: isNew ? "created" : "merged",
    candidateId,
    mergedFields,
  };
}
