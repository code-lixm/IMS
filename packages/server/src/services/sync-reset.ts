import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { inArray, isNotNull } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
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
} from "../schema";

function isManagedRuntimePath(filePath: string): boolean {
  const runtimeDir = resolve(config.runtimeDir);
  const resolvedPath = resolve(filePath);
  return resolvedPath === runtimeDir || resolvedPath.startsWith(`${runtimeDir}${sep}`);
}

async function deleteManagedFiles(paths: Iterable<string>): Promise<void> {
  const uniquePaths = Array.from(new Set(Array.from(paths).filter(Boolean)));

  await Promise.all(
    uniquePaths.map(async (filePath) => {
      if (!isManagedRuntimePath(filePath) || !existsSync(filePath)) {
        return;
      }

      try {
        await unlink(filePath);
      } catch (error) {
        console.warn("[sync-reset] failed to remove file", filePath, error);
      }
    }),
  );
}

export interface ResetCandidateRecordsResult {
  clearedCandidates: number;
}

export async function resetCandidateRecords(): Promise<ResetCandidateRecordsResult> {
  const now = Date.now();
  const candidateRows = await db.select({ id: candidates.id }).from(candidates);
  const conversationRows = await db
    .select({ id: conversations.id })
    .from(conversations);
  const resumeRows = await db
    .select({ filePath: resumes.filePath })
    .from(resumes);
  const artifactVersionRows = await db
    .select({ markdownPath: artifactVersions.markdownPath, pdfPath: artifactVersions.pdfPath })
    .from(artifactVersions);

  const conversationIds = conversationRows.map((row) => row.id);

  await db.transaction(async (tx) => {
    await tx
      .update(importFileTasks)
      .set({ candidateId: null, updatedAt: now })
      .where(isNotNull(importFileTasks.candidateId));

    if (conversationIds.length > 0) {
      await tx.delete(messages).where(inArray(messages.conversationId, conversationIds));
      await tx.delete(fileResources).where(inArray(fileResources.conversationId, conversationIds));
      await tx.delete(sessionMemories).where(inArray(sessionMemories.conversationId, conversationIds));
    }

    await tx.delete(luiWorkflows);
    if (conversationIds.length > 0) {
      await tx.delete(conversations).where(inArray(conversations.id, conversationIds));
    }
    await tx.delete(artifactVersions);
    await tx.delete(artifacts);
    await tx.delete(interviewAssessments);
    await tx.delete(shareRecords);
    await tx.delete(candidateWorkspaces);
    await tx.delete(resumes);
    await tx.delete(interviews);
    await tx.delete(candidates);
  });

  await deleteManagedFiles([
    ...resumeRows.map((row) => row.filePath),
    ...artifactVersionRows.flatMap((row) => [row.markdownPath, row.pdfPath].filter((path): path is string => Boolean(path))),
  ]);

  return {
    clearedCandidates: candidateRows.length,
  };
}
