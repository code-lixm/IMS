import { api, requestForm } from "./client";
import type {
  InterviewImportPayload,
  InterviewImportBatchSummary,
} from "@ims/shared";

// ---------------------------------------------------------------------------
// Local response shapes (mirrors server's serializeBatch outcome)
// ---------------------------------------------------------------------------

export interface InterviewImportBatchItem {
  id: string;
  displayName: string;
  status: string;
  sourceType: string;
  summaryJson: string | null;
  summary: InterviewImportBatchSummary | null;
  currentStage: string | null;
  totalFiles: number;
  processedFiles: number;
  successFiles: number;
  failedFiles: number;
  createdAt: number;
  startedAt: number;
  completedAt: number | null;
}

export interface InterviewImportTaskItem {
  id: string;
  batchId: string;
  status: string;
  payloadJson: string | null;
  resultJson: string | null;
  createdAt: number;
}

export interface InterviewImportCreateResult {
  batchId: string;
  taskId: string;
  batch: InterviewImportBatchItem;
  task: InterviewImportTaskItem;
}

export interface InterviewImportBatchDetail {
  batch: InterviewImportBatchItem;
  items: InterviewImportTaskItem[];
}

// ---------------------------------------------------------------------------
// Standalone payload (used by create_candidate / bind_existing_candidate)
// ---------------------------------------------------------------------------

export interface InterviewImportStandalonePayload {
  mode: "create_candidate" | "bind_existing_candidate";
  name?: string;
  phone?: string;
  email?: string;
  position?: string;
  candidateId?: string;
  rounds: Array<{
    roundNumber?: number;
    roundName?: string;
    interviewDate?: string;
    interviewerNames?: string[];
    interviewType?: string;
    evaluationText: string;
    resultLabel?: string;
  }>;
  interviewQuestionsText?: string;
  meetingNotesText?: string;
  overallSummaryText?: string;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const interviewImportApi = {
  /**
   * List all interview import batches (newest first, up to 50).
   */
  listBatches() {
    return api<{ items: InterviewImportBatchItem[] }>("/api/interview-import/batches");
  },

  /**
   * Create an interview import batch from the candidate detail page.
   * Falls back to multipart/form-data when a PDF resume is attached.
   */
  createForCandidateDetail(
    payload: InterviewImportPayload,
    resumePdf?: File | null,
  ) {
    if (resumePdf) {
      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      formData.append("resumePdf", resumePdf);

      return requestForm<InterviewImportCreateResult>("/api/interview-import/batches", {
        method: "POST",
        formData,
      });
    }

    return api<InterviewImportCreateResult>("/api/interview-import/batches", {
      method: "POST",
      json: payload,
    });
  },

  /**
   * Create an interview import batch from the simplified interview import entry.
   *
   * When `resumePdf` is provided, the request uses multipart/form-data
   * with the payload serialised as a JSON `payload` field.
   * Otherwise it falls back to a plain JSON POST.
   */
  createStandalone(
    payload: InterviewImportStandalonePayload,
    resumePdf?: File | null,
  ) {
    if (!resumePdf) {
      return api<InterviewImportCreateResult>("/api/interview-import/batches", {
        method: "POST",
        json: payload,
      });
    }

    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    formData.append("resumePdf", resumePdf);

    return requestForm<InterviewImportCreateResult>("/api/interview-import/batches", {
      method: "POST",
      formData,
    });
  },

  /**
   * Confirm a pending low-confidence interview import batch and continue processing.
   */
  confirmBatch(id: string) {
    return api<InterviewImportCreateResult>(`/api/interview-import/batches/${id}/confirm`, {
      method: "POST",
    });
  },

  /**
   * Get a single batch detail (includes per-task items).
   */
  getBatch(id: string) {
    return api<InterviewImportBatchDetail>(`/api/interview-import/batches/${id}`);
  },

  /**
   * Get the file-task list for a given batch.
   */
  files(batchId: string) {
    return api<{ items: InterviewImportTaskItem[] }>(`/api/interview-import/batches/${batchId}/files`);
  },

  /**
   * Cancel a running interview import batch.
   */
  cancelBatch(id: string) {
    return api<{ id: string; status: string }>(`/api/interview-import/batches/${id}/cancel`, {
      method: "POST",
    });
  },
};
