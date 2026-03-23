/**
 * LUI Context Service
 * 
 * Builds candidate context for AI conversations.
 * Injects candidate info, resume text, interview history, and artifact summaries.
 */

import { db } from "../db";
import { candidates, resumes, interviews, artifacts, artifactVersions } from "../schema";
import { eq, desc, isNotNull } from "drizzle-orm";

export interface CandidateContext {
  candidateId: string;
  candidateName: string;
  position: string | null;
  yearsOfExperience: number | null;
  tags: string[];
  resumes: Array<{
    fileName: string;
    extractedText: string | null;
  }>;
  interviews: Array<{
    round: number;
    status: string;
    scheduledAt: number | null;
    feedback: string | null;
  }>;
  artifacts: Array<{
    type: string;
    roundNumber: number | null;
    currentVersion: number;
    latestFeedback: string | null;
  }>;
}

/**
 * Build candidate context for AI conversations.
 * Retrieves candidate info, resume text, interview history, and artifact summaries.
 */
export async function buildCandidateContext(candidateId: string): Promise<CandidateContext | null> {
  // Get candidate
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);

  if (!candidate) {
    return null;
  }

  // Get resumes
  const resumeRows = await db
    .select({
      fileName: resumes.fileName,
      extractedText: resumes.extractedText,
    })
    .from(resumes)
    .where(eq(resumes.candidateId, candidateId));

  // Get interviews
  const interviewRows = await db
    .select({
      round: interviews.round,
      status: interviews.status,
      scheduledAt: interviews.scheduledAt,
      manualEvaluationJson: interviews.manualEvaluationJson,
    })
    .from(interviews)
    .where(eq(interviews.candidateId, candidateId))
    .orderBy(desc(interviews.round));

  // Get artifacts with latest version
  const artifactRows = await db
    .select({
      id: artifacts.id,
      type: artifacts.type,
      roundNumber: artifacts.roundNumber,
      currentVersion: artifacts.currentVersion,
    })
    .from(artifacts)
    .where(eq(artifacts.candidateId, candidateId));

  // Get latest feedback for each artifact
  const artifactsWithFeedback = await Promise.all(
    artifactRows.map(async (artifact) => {
      const [latestVersion] = await db
        .select({ feedbackText: artifactVersions.feedbackText })
        .from(artifactVersions)
        .where(eq(artifactVersions.artifactId, artifact.id))
        .orderBy(desc(artifactVersions.version))
        .limit(1);

      return {
        type: artifact.type,
        roundNumber: artifact.roundNumber,
        currentVersion: artifact.currentVersion,
        latestFeedback: latestVersion?.feedbackText ?? null,
      };
    })
  );

  // Parse tags
  const tags = candidate.tagsJson ? JSON.parse(candidate.tagsJson) : [];

  // Parse interview feedback
  const interviewsWithFeedback = interviewRows.map((interview) => {
    let feedback: string | null = null;
    if (interview.manualEvaluationJson) {
      try {
        const eval_ = JSON.parse(interview.manualEvaluationJson);
        if (eval_.comments) {
          feedback = `${eval_.decision || 'No decision'}: ${eval_.comments}`;
        }
      } catch {
        // ignore parse errors
      }
    }
    return {
      round: interview.round,
      status: interview.status,
      scheduledAt: interview.scheduledAt ?? null,
      feedback,
    };
  });

  return {
    candidateId: candidate.id,
    candidateName: candidate.name,
    position: candidate.position ?? null,
    yearsOfExperience: candidate.yearsOfExperience ?? null,
    tags,
    resumes: resumeRows.map((r) => ({
      fileName: r.fileName,
      extractedText: r.extractedText ?? null,
    })),
    interviews: interviewsWithFeedback,
    artifacts: artifactsWithFeedback,
  };
}

/**
 * Format candidate context as a string for system prompt injection.
 */
export function formatCandidateContextForPrompt(context: CandidateContext): string {
  const parts: string[] = [];

  parts.push(`## Candidate Information`);
  parts.push(`Name: ${context.candidateName}`);
  if (context.position) {
    parts.push(`Position: ${context.position}`);
  }
  if (context.yearsOfExperience !== null) {
    parts.push(`Years of Experience: ${context.yearsOfExperience}`);
  }
  if (context.tags.length > 0) {
    parts.push(`Tags: ${context.tags.join(", ")}`);
  }

  // Resumes
  if (context.resumes.length > 0) {
    parts.push(`\n## Resumes (${context.resumes.length} files)`);
    for (const resume of context.resumes) {
      parts.push(`- ${resume.fileName}`);
      if (resume.extractedText) {
        // Truncate long resume text
        const text = resume.extractedText.length > 2000
          ? resume.extractedText.slice(0, 2000) + "..."
          : resume.extractedText;
        parts.push(`  Content:\n${text.split("\n").join("\n")}`);
      }
    }
  }

  // Interviews
  if (context.interviews.length > 0) {
    parts.push(`\n## Interview History (${context.interviews.length} rounds)`);
    for (const interview of context.interviews) {
      parts.push(`- Round ${interview.round}: ${interview.status}`);
      if (interview.scheduledAt) {
        parts.push(`  Scheduled: ${new Date(interview.scheduledAt).toLocaleString()}`);
      }
      if (interview.feedback) {
        parts.push(`  Feedback: ${interview.feedback}`);
      }
    }
  }

  // Artifacts
  if (context.artifacts.length > 0) {
    parts.push(`\n## AI-Generated Artifacts (${context.artifacts.length})`);
    for (const artifact of context.artifacts) {
      parts.push(`- ${artifact.type} (Round ${artifact.roundNumber ?? "N/A"}, v${artifact.currentVersion})`);
      if (artifact.latestFeedback) {
        parts.push(`  Latest Feedback: ${artifact.latestFeedback.slice(0, 500)}`);
      }
    }
  }

  return parts.join("\n");
}
