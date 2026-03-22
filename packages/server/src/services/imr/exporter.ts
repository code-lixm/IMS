import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import JSZip from "jszip";
import { db } from "../../db";
import { candidates, resumes, interviews, artifacts, artifactVersions } from "../../schema";
import { eq, desc } from "drizzle-orm";
import type { IMRManifest, IMRChecksums, IMRCandidate } from "./types";
import { config } from "../../config";

function jsonHash(obj: unknown): string {
  let hash = 0;
  for (const byte of new TextEncoder().encode(JSON.stringify(obj))) {
    hash = (hash * 31 + byte) >>> 0;
  }
  return `sha256:${hash.toString(16)}`;
}

async function sha256(filePath: string): Promise<string> {
  const buf = readFileSync(filePath);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hashHex}`;
}

export async function exportCandidate(candidateId: string): Promise<string> {
  const [cand] = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
  if (!cand) throw new Error(`candidate ${candidateId} not found`);

  const resumeRows = await db.select().from(resumes).where(eq(resumes.candidateId, candidateId));
  const interviewRows = await db.select().from(interviews).where(eq(interviews.candidateId, candidateId)).orderBy(desc(interviews.round));
  const artifactRows = await db.select().from(artifacts).where(eq(artifacts.candidateId, candidateId)).orderBy(desc(artifacts.updatedAt));

  const zip = new JSZip();
  const ts = Date.now();
  const safeName = cand.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff\-_]/g, "_");
  const base = `candidate-${safeName}-${ts}`;

  const candidateData: IMRCandidate = {
    id: cand.id, source: cand.source as "local" | "remote" | "hybrid", remoteId: cand.remoteId,
    name: cand.name, phone: cand.phone, email: cand.email, position: cand.position,
    yearsOfExperience: cand.yearsOfExperience,
    tags: cand.tagsJson ? JSON.parse(cand.tagsJson) : [],
    createdAt: cand.createdAt, updatedAt: cand.updatedAt,
  };
  zip.file(`${base}/candidate.json`, JSON.stringify(candidateData, null, 2));

  const checksums: IMRChecksums = {};
  checksums[`${base}/candidate.json`] = jsonHash(candidateData);

  for (const resume of resumeRows) {
    const ext = (resume.fileName ?? "").includes(".") ? `.${(resume.fileName ?? "").split(".").pop()}` : "";
    const destName = `${base}/resumes/${resume.id}${ext}`;
    if (existsSync(resume.filePath)) { zip.file(destName, readFileSync(resume.filePath)); checksums[destName] = await sha256(resume.filePath); }
    if (resume.extractedText) { const p = `${base}/parsed/${resume.id}.extracted.txt`; zip.file(p, resume.extractedText); checksums[p] = jsonHash(resume.extractedText); }
    if (resume.parsedDataJson) { const p = `${base}/parsed/${resume.id}.parsed.json`; zip.file(p, resume.parsedDataJson); checksums[p] = jsonHash(JSON.parse(resume.parsedDataJson)); }
  }

  for (const interview of interviewRows) {
    const intData = { ...interview, interviewerIds: interview.interviewerIdsJson ? JSON.parse(interview.interviewerIdsJson) : [], manualEvaluation: interview.manualEvaluationJson ? JSON.parse(interview.manualEvaluationJson) : null };
    const p = `${base}/interviews/interview-round-${interview.round}.json`;
    zip.file(p, JSON.stringify(intData, null, 2));
    checksums[p] = jsonHash(intData);
  }

  for (const artifact of artifactRows) {
    const artFolder = `${base}/artifacts/${artifact.type}`;
    zip.file(`${artFolder}/artifact.json`, JSON.stringify({ ...artifact }, null, 2));
    const versions = await db.select().from(artifactVersions).where(eq(artifactVersions.artifactId, artifact.id)).orderBy(desc(artifactVersions.version));
    for (const ver of versions) {
      const vp = `${artFolder}/v${ver.version}.json`;
      zip.file(vp, JSON.stringify({ ...ver }, null, 2));
      checksums[vp] = jsonHash(ver);
      if (ver.markdownPath && existsSync(ver.markdownPath)) { const mp = `${artFolder}/v${ver.version}.md`; zip.file(mp, readFileSync(ver.markdownPath)); checksums[mp] = await sha256(ver.markdownPath); }
    }
  }

  const manifest: IMRManifest = {
    format: "imr", version: "1.0.0", exportedAt: new Date().toISOString(),
    sourceApp: "interview-manager", sourceVersion: "0.1.0", candidateId: cand.id,
    candidateIdentity: { name: cand.name, phone: cand.phone, email: cand.email },
    contains: { resumes: resumeRows.length, interviews: interviewRows.length, artifacts: artifactRows.length, attachments: 0 },
    hashAlgorithm: "sha256", encryption: { enabled: false, method: null },
  };

  zip.file(`${base}/manifest.json`, JSON.stringify(manifest, null, 2));
  zip.file(`${base}/checksums.json`, JSON.stringify(checksums, null, 2));

  const exportDir = join(config.filesDir, "exports");
  mkdirSync(exportDir, { recursive: true });
  const filePath = join(exportDir, `${base}.imr`);
  writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }));
  return filePath;
}
