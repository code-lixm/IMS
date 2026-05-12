import type { CandidateDetailAppendPayload } from "@ims/shared";

export interface CandidateInterviewImportRoundFormValue {
  roundNumber: string;
  roundName: string;
  interviewDate: string;
  interviewerNamesText: string;
  interviewType: string;
  evaluationText: string;
  resultLabel: string;
}

export interface CandidateInterviewImportFormValue {
  candidateId: string;
  resumePdf: File | null;
  interviewQuestionsText: string;
  meetingNotesText: string;
  overallSummaryText: string;
  rounds: CandidateInterviewImportRoundFormValue[];
}

export function createInterviewImportRoundDefault(roundNumber?: number): CandidateInterviewImportRoundFormValue {
  return {
    roundNumber: Number.isFinite(roundNumber) && (roundNumber ?? 0) > 0
      ? String(Math.trunc(roundNumber as number))
      : "",
    roundName: "",
    interviewDate: "",
    interviewerNamesText: "",
    interviewType: "",
    evaluationText: "",
    resultLabel: "",
  };
}

export function buildInterviewImportDefaults(
  candidateId: CandidateDetailAppendPayload["candidateId"],
  nextRoundNumber: number = 1,
): CandidateInterviewImportFormValue {
  return {
    candidateId,
    resumePdf: null,
    interviewQuestionsText: "",
    meetingNotesText: "",
    overallSummaryText: "",
    rounds: [createInterviewImportRoundDefault(nextRoundNumber)],
  };
}
