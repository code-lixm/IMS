import { api } from "./client"
import type { CandidateDetailData } from "@ims/shared"

export interface BaobaoInterviewResultOption {
  value: number
  label: string
  description: string | null
}

export interface BaobaoPositionRankOption {
  value: string
  label: string
}

export interface BaobaoEliminateReasonOption {
  id: number
  name: string
}

export interface BaobaoInterviewScoreFormData {
  interview: {
    localInterviewId: string
    remoteInterviewId: string
    candidateId: string
    round: number | null
    name: string | null
    organizationName: string | null
    applyPositionName: string | null
    interviewTime: number | null
    interviewType: number | null
    interviewPlace: string | null
    interviewResult: number | null
    interviewResultString: string | null
    positionRank: string | null
    interviewEvaluation: string | null
    eliminateReasonIds: number[]
  }
  interviewResults: BaobaoInterviewResultOption[]
  positionRanks: BaobaoPositionRankOption[]
  eliminateReasons: BaobaoEliminateReasonOption[]
}

export interface UploadBaobaoInterviewScoreInput {
  interviewEvaluation: string
  interviewResult: number
  interviewResultLabel?: string
  positionRank: string
  eliminateReasonIds?: number[]
}

export type CandidateInterviewDetail = CandidateDetailData["interviews"][number]

export const interviewsApi = {
  getBaobaoScoreForm(interviewId: string) {
    return api<BaobaoInterviewScoreFormData>(`/api/interviews/${interviewId}/baobao-score-form`)
  },

  uploadBaobaoScore(interviewId: string, input: UploadBaobaoInterviewScoreInput) {
    return api<CandidateInterviewDetail>(`/api/interviews/${interviewId}/baobao-score-upload`, {
      method: "POST",
      json: input,
    })
  },
}
