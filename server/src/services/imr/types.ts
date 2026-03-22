/**
 * IMR (Interview Manager Resume) package format.
 *
 * File extension: .imr
 * Container: ZIP archive
 *
 * Directory structure inside the zip:
 *   candidate-{id}-{timestamp}.imr/
 *   ├── manifest.json
 *   ├── checksums.json
 *   ├── candidate.json
 *   ├── resumes/
 *   ├── parsed/
 *   ├── interviews/
 *   ├── artifacts/
 *   └── attachments/
 */

import { join } from "node:path";

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export interface IMRManifest {
  format: "imr";
  version: "1.0.0";
  exportedAt: string;       // ISO 8601
  sourceApp: "interview-manager";
  sourceVersion: string;
  candidateId: string;
  candidateIdentity: {
    name: string;
    phone: string | null;
    email: string | null;
  };
  contains: {
    resumes: number;
    interviews: number;
    artifacts: number;
    attachments: number;
  };
  hashAlgorithm: "sha256";
  encryption: {
    enabled: false;
    method: null;
  };
}

// ---------------------------------------------------------------------------
// Checksums
// ---------------------------------------------------------------------------

export type IMRChecksums = Record<string, string>; // relative path → "sha256:..."

// ---------------------------------------------------------------------------
// Candidate data
// ---------------------------------------------------------------------------

export interface IMRCandidate {
  id: string;
  source: "local" | "remote" | "hybrid";
  remoteId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  yearsOfExperience: number | null;
  tags: string[];
  createdAt: number;   // unix ms
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Import result
// ---------------------------------------------------------------------------

export type ImportResult =
  | { result: "created"; candidateId: string }
  | { result: "merged"; candidateId: string; mergedFields: string[] }
  | { result: "conflict"; candidateId: string; conflicts: string[] }
  | { result: "failed"; error: string };
