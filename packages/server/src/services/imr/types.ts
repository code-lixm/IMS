export interface IMRManifest {
  format: "imr";
  version: "1.1.0";
  exportedAt: string;
  sourceApp: "interview-manager";
  sourceVersion: string;
  candidateId: string;
  candidateIdentity: { name: string; phone: string | null; email: string | null; remoteId: string | null };
  contains: {
    resumes: number;
    interviews: number;
    interviewAssessments: number;
    artifacts: number;
    artifactVersions: number;
    candidateWorkspaces: number;
    conversations: number;
    messages: number;
    fileResources: number;
    workflows: number;
    sessionMemories: number;
    attachments: number;
  };
  hashAlgorithm: "sha256";
  encryption: { enabled: false; method: null };
}

export type IMRChecksums = Record<string, string>;

export interface IMRCandidate {
  id: string;
  source: "local" | "remote" | "hybrid";
  remoteId: string | null;
  remoteResumeId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  organizationName: string | null;
  orgAllParentName: string | null;
  recruitmentSourceName: string | null;
  yearsOfExperience: number | null;
  tags: string[];
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface IMRResumeRecord {
  id: string;
  candidateId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  extractedText: string | null;
  parsedDataJson: string | null;
  ocrConfidence: number | null;
  createdAt: number;
}

export interface IMRInterviewRecord {
  id: string;
  candidateId: string;
  remoteId: string | null;
  round: number;
  status: string;
  statusRaw: string | null;
  interviewType: number | null;
  interviewResult: number | null;
  interviewResultString: string | null;
  scheduledAt: number | null;
  interviewPlace: string | null;
  meetingLink: string | null;
  dockingHrName: string | null;
  dockingHrbpName: string | null;
  checkInTime: number | null;
  arrivalDate: string | null;
  eliminateReasonString: string | null;
  remark: string | null;
  interviewerIdsJson: string | null;
  manualEvaluationJson: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface IMRInterviewAssessmentRecord {
  id: string;
  candidateId: string;
  interviewId: string;
  interviewerId: string;
  technicalScore: number;
  communicationScore: number;
  cultureFitScore: number;
  overallScore: number;
  technicalEvaluation: string;
  communicationEvaluation: string;
  cultureFitEvaluation: string;
  overallEvaluation: string;
  recommendation: "pass" | "hold" | "reject";
  reportMarkdown: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface IMRArtifactRecord {
  id: string;
  candidateId: string;
  interviewId: string | null;
  type: string;
  roundNumber: number | null;
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface IMRArtifactVersionRecord {
  id: string;
  artifactId: string;
  version: number;
  promptSnapshot: string | null;
  feedbackText: string | null;
  structuredDataJson: string | null;
  markdownPath: string | null;
  pdfPath: string | null;
  createdAt: number;
}

export interface IMRCandidateWorkspaceRecord {
  id: string;
  candidateId: string;
  workspaceStatus: string;
  lastAccessedAt: number;
  createdAt: number;
}

export interface IMRConversationRecord {
  id: string;
  title: string;
  candidateId: string | null;
  agentId: string | null;
  modelProvider: string | null;
  modelId: string | null;
  temperature: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface IMRMessageRecord {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning: string | null;
  toolsJson: string | null;
  status: "streaming" | "error" | "complete";
  createdAt: number;
}

export interface IMRFileResourceRecord {
  id: string;
  conversationId: string;
  name: string;
  type: "code" | "document" | "image";
  content: string;
  filePath: string | null;
  language: string | null;
  size: number;
  createdAt: number;
}

export interface IMRLuiWorkflowRecord {
  id: string;
  candidateId: string;
  conversationId: string | null;
  currentStage: "S0" | "S1" | "S2" | "completed";
  stageDataJson: string | null;
  documentsJson: string | null;
  status: "active" | "paused" | "completed" | "error";
  createdAt: number;
  updatedAt: number;
}

export interface IMRSessionMemoryRecord {
  id: string;
  conversationId: string;
  type: "context" | "summary" | "decision" | "action_item";
  content: string;
  metadata: string | null;
  importance: number;
  createdAt: number;
  expiresAt: number | null;
}

export interface IMRPackageData {
  candidate: IMRCandidate;
  resumes: IMRResumeRecord[];
  interviews: IMRInterviewRecord[];
  interviewAssessments: IMRInterviewAssessmentRecord[];
  artifacts: IMRArtifactRecord[];
  artifactVersions: IMRArtifactVersionRecord[];
  candidateWorkspaces: IMRCandidateWorkspaceRecord[];
  conversations: IMRConversationRecord[];
  messages: IMRMessageRecord[];
  fileResources: IMRFileResourceRecord[];
  workflows: IMRLuiWorkflowRecord[];
  sessionMemories: IMRSessionMemoryRecord[];
}

export type ImportResult =
  | { result: "created"; candidateId: string }
  | { result: "merged"; candidateId: string; mergedFields: string[] }
  | { result: "failed"; error: string };
