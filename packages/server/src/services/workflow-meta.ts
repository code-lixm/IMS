import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
import { candidates, luiWorkflows } from "../schema";

interface PersistedWorkflowDocument {
  filePath?: string;
  content?: string;
  summary?: string;
  generatedAt?: string;
  round?: number;
  latestRound?: number;
  latestFile?: string;
  roundFiles?: Record<number, string>;
}

interface PersistedWorkflowState {
  id: string;
  candidateId: string;
  conversationId: string | null;
  currentStage: string;
  stageData: Record<string, unknown>;
  documents: {
    S0?: PersistedWorkflowDocument;
    S1?: PersistedWorkflowDocument;
    S2?: PersistedWorkflowDocument;
  };
  status: string;
  updatedAt: Date;
}

function buildDocumentsSection(workflow: PersistedWorkflowState) {
  const documents: Record<string, unknown> = {};

  if (workflow.documents.S0?.filePath) {
    documents.S0 = workflow.documents.S0.filePath.split("/").pop();
  }

  if (workflow.documents.S1) {
    const roundFiles = workflow.documents.S1.roundFiles
      ? Object.fromEntries(
          Object.entries(workflow.documents.S1.roundFiles).map(([round, filePath]) => [round, filePath.split("/").pop()]),
        )
      : {};

    documents.S1 = {
      latest_round: workflow.documents.S1.latestRound ?? workflow.documents.S1.round ?? null,
      latest_file: workflow.documents.S1.latestFile?.split("/").pop() ?? workflow.documents.S1.filePath?.split("/").pop() ?? null,
      round_files: roundFiles,
    };
  }

  if (workflow.documents.S2?.filePath) {
    documents.S2 = workflow.documents.S2.filePath.split("/").pop();
  }

  return documents;
}

export function buildWorkflowMetaPayload(input: {
  workflow: PersistedWorkflowState;
  candidateName: string;
  position: string | null;
}) {
  return {
    candidate: {
      id: input.workflow.candidateId,
      name: input.candidateName,
      position: input.position ?? null,
    },
    workflow: {
      id: input.workflow.id,
      current_stage: input.workflow.currentStage,
      status: input.workflow.status,
      conversation_id: input.workflow.conversationId,
      updated_at: input.workflow.updatedAt.toISOString(),
    },
    documents: buildDocumentsSection(input.workflow),
    s2_feedback_loop: input.workflow.stageData.s2_feedback_loop ?? null,
    stage_data: input.workflow.stageData,
  };
}

export async function syncWorkflowMetaFile(workflowId: string): Promise<void> {
  const [row] = await db
    .select({
      id: luiWorkflows.id,
      candidateId: luiWorkflows.candidateId,
      conversationId: luiWorkflows.conversationId,
      currentStage: luiWorkflows.currentStage,
      stageDataJson: luiWorkflows.stageDataJson,
      documentsJson: luiWorkflows.documentsJson,
      status: luiWorkflows.status,
      updatedAt: luiWorkflows.updatedAt,
    })
    .from(luiWorkflows)
    .where(eq(luiWorkflows.id, workflowId))
    .limit(1);

  if (!row) {
    return;
  }

  const [candidate] = await db
    .select({ name: candidates.name, position: candidates.position })
    .from(candidates)
    .where(eq(candidates.id, row.candidateId))
    .limit(1);

  const workflow: PersistedWorkflowState = {
    id: row.id,
    candidateId: row.candidateId,
    conversationId: row.conversationId,
    currentStage: row.currentStage,
    stageData: row.stageDataJson ? JSON.parse(row.stageDataJson) : {},
    documents: row.documentsJson ? JSON.parse(row.documentsJson) : {},
    status: row.status,
    updatedAt: row.updatedAt,
  };

  const meta = buildWorkflowMetaPayload({
    workflow,
    candidateName: candidate?.name ?? workflow.candidateId,
    position: candidate?.position ?? null,
  });

  const dirPath = join(config.filesDir, "workflow-documents", workflow.candidateId, workflow.id);
  await mkdir(dirPath, { recursive: true });
  await writeFile(join(dirPath, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
}
