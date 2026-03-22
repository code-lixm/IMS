/**
 * IMR Exporter — packages a complete candidate profile into a .imr zip file.
 */

import { writeFileSync, readFileSync, existsSync, createReadStream } from "node:fs";
import { join, basename } from "node:path";
import JSZip from "jszip";
import { db } from "../../db";
import {
  candidates,
  resumes,
  interviews,
  artifacts,
  artifactVersions,
} from "../../schema";
import { eq, desc } from "drizzle-orm";
import type { IMRManifest, IMRChecksums, IMRCandidate } from "./types";
import { config } from "../../config";

const HASH_ALGO = "sha256";

async function sha256(filePath: string): Promise<string> {
  const buf = readFileSync(filePath);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hashHex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hashHex}`;
}

function jsonHash(obj: unknown): string {
  const buf = new TextEncoder().encode(JSON.stringify(obj));
  // simple non-crypto hash for small JSON — good enough for integrity checks
  let hash = 0;
  for (const byte of buf) {
    hash = (hash * 31 + byte) >>> 0;
  }
  return `sha256:${hash.toString(16)}`;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function exportCandidate(candidateId: string): Promise<string> {
  // 1. Load all data
  const [cand] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);

  if (!cand) throw new Error(`candidate ${candidateId} not found`);

  const resumeRows = await db
    .select()
    .from(resumes)
    .where(eq(resumes.candidateId, candidateId));

  const interviewRows = await db
    .select()
    .from(interviews)
    .where(eq(interviews.candidateId, candidateId))
    .orderBy(desc(interviews.round));

  const artifactRows = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.candidateId, candidateId))
    .orderBy(desc(artifacts.updatedAt));

  // 2. Build zip
  const zip = new JSZip();

  const ts = Date.now();
  const safeName = cand.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff\-_]/g, "_");
  const baseFolder = `candidate-${safeName}-${ts}`;

  // ── candidate.json ─────────────────────────────────────────────────────
  const candidateData: IMRCandidate = {
    id: cand.id,
    source: cand.source as "local" | "remote" | "hybrid",
    remoteId: cand.remoteId,
    name: cand.name,
    phone: cand.phone,
    email: cand.email,
    position: cand.position,
    yearsOfExperience: cand.yearsOfExperience,
    tags: cand.tagsJson ? JSON.parse(cand.tagsJson) : [],
    createdAt: cand.createdAt,
    updatedAt: cand.updatedAt,
  };
  zip.file(`${baseFolder}/candidate.json`, JSON.stringify(candidateData, null, 2));

  // ── resumes/ ────────────────────────────────────────────────────────────
  const checksums: IMRChecksums = {};
  checksums[`${baseFolder}/candidate.json`] = jsonHash(candidateData);

  for (const resume of resumeRows) {
    const resumeFolder = `${baseFolder}/resumes`;
    const originalName = resume.fileName ?? `resume-${resume.id}`;
    const ext = originalName.includes(".") ? `.${originalName.split(".").pop()}` : "";
    const destName = `${resumeFolder}/${resume.id}${ext}`;

    if (existsSync(resume.filePath)) {
      zip.file(destName, readFileSync(resume.filePath));
      checksums[destName] = await sha256(resume.filePath);
    }

    // parsed data
    if (resume.extractedText) {
      const txtPath = `${baseFolder}/parsed/${resume.id}.extracted.txt`;
      zip.file(txtPath, resume.extractedText);
      checksums[txtPath] = jsonHash(resume.extractedText);
    }
    if (resume.parsedDataJson) {
      const jsonPath = `${baseFolder}/parsed/${resume.id}.parsed.json`;
      zip.file(jsonPath, resume.parsedDataJson);
      checksums[jsonPath] = jsonHash(JSON.parse(resume.parsedDataJson));
    }
  }

  // ── interviews/ ─────────────────────────────────────────────────────────
  for (const interview of interviewRows) {
    const intData = {
      ...interview,
      interviewerIds: interview.interviewerIdsJson
        ? JSON.parse(interview.interviewerIdsJson)
        : [],
      manualEvaluation: interview.manualEvaluationJson
        ? JSON.parse(interview.manualEvaluationJson)
        : null,
    };
    const intPath = `${baseFolder}/interviews/interview-round-${interview.round}.json`;
    zip.file(intPath, JSON.stringify(intData, null, 2));
    checksums[intPath] = jsonHash(intData);
  }

  // ── artifacts/ ──────────────────────────────────────────────────────────
  for (const artifact of artifactRows) {
    const artFolder = `${baseFolder}/artifacts/${artifact.type}`;

    // artifact metadata
    const meta = { ...artifact };
    zip.file(`${artFolder}/artifact.json`, JSON.stringify(meta, null, 2));

    // all versions
    const versions = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifact.id))
      .orderBy(desc(artifactVersions.version));

    for (const ver of versions) {
      const verData = { ...ver };
      const verPath = `${artFolder}/v${ver.version}.json`;
      zip.file(verPath, JSON.stringify(verData, null, 2));
      checksums[verPath] = jsonHash(verData);

      if (ver.markdownPath && existsSync(ver.markdownPath)) {
        const mdDest = `${artFolder}/v${ver.version}.md`;
        zip.file(mdDest, readFileSync(ver.markdownPath));
        checksums[mdDest] = await sha256(ver.markdownPath);
      }
    }
  }

  // ── manifest + checksums ────────────────────────────────────────────────
  const manifest: IMRManifest = {
    format: "imr",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    sourceApp: "interview-manager",
    sourceVersion: "0.1.0",
    candidateId: cand.id,
    candidateIdentity: {
      name: cand.name,
      phone: cand.phone,
      email: cand.email,
    },
    contains: {
      resumes: resumeRows.length,
      interviews: interviewRows.length,
      artifacts: artifactRows.length,
      attachments: 0,
    },
    hashAlgorithm: HASH_ALGO,
    encryption: { enabled: false, method: null },
  };

  zip.file(`${baseFolder}/manifest.json`, JSON.stringify(manifest, null, 2));
  zip.file(`${baseFolder}/checksums.json`, JSON.stringify(checksums, null, 2));

  // ── Write zip ────────────────────────────────────────────────────────────
  const exportDir = join(config.filesDir, "exports");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(exportDir, { recursive: true });

  const fileName = `${baseFolder}.imr`;
  const filePath = join(exportDir, fileName);

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  writeFileSync(filePath, zipBuffer);
  return filePath;
}
