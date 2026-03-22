export interface IMRManifest {
  format: "imr";
  version: "1.0.0";
  exportedAt: string;
  sourceApp: "interview-manager";
  sourceVersion: string;
  candidateId: string;
  candidateIdentity: { name: string; phone: string | null; email: string | null };
  contains: { resumes: number; interviews: number; artifacts: number; attachments: number };
  hashAlgorithm: "sha256";
  encryption: { enabled: false; method: null };
}

export type IMRChecksums = Record<string, string>;

export interface IMRCandidate {
  id: string; source: "local" | "remote" | "hybrid"; remoteId: string | null;
  name: string; phone: string | null; email: string | null; position: string | null;
  yearsOfExperience: number | null; tags: string[]; createdAt: number; updatedAt: number;
}

export type ImportResult =
  | { result: "created"; candidateId: string }
  | { result: "merged"; candidateId: string; mergedFields: string[] }
  | { result: "conflict"; candidateId: string; conflicts: string[] }
  | { result: "failed"; error: string };
