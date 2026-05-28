/**
 * @ims/shared — shared types and constants for Interview Manager.
 *
 * Import from this package in both server and web app:
 *   import { type Candidate, SERVER_BASE_URL } from "@ims/shared";
 */

// DB Schema types
export * from "./db-schema";

// API contract types
export * from "./api-types";
export type {
  BaobaoLoginQrData,
  ImportScreeningConclusion,
  ImportScreeningScoreFeedback,
  ImportScreeningVerdict,
  ImportTaskScreeningScoreData,
  ImportTaskResultData,
  ImportScreeningScoreOverride,
  LuiAssessmentBalanceHighlightData,
  LuiAssessmentFeedbackComparisonData,
  LuiAssessmentQuestionScoreData,
  LuiAssessmentWechatSummaryItemData,
  LuiStructuredInterviewAssessmentData,
  UpdateImportTaskScreeningScoreInput,
} from "./api-types";
export {
  getEffectiveScreeningScore,
} from "./api-types";

// Recorder domain types
export * from "./recorder";

// Baobao third-party API types
export * from "./baobao-types";

// Shared constants
export * from "./constants";

// Shared AI provider presets
export * from "./ai-provider-presets";

// Import screening helpers
export * from "./import-screening";

// Agent contract types
export * from "./agent-contract";

// Workspace-native agent definitions
export * from "./workspace-agent";

// Changelog display types
export * from "./changelog";

// Baobao dictionary constants
export * from "./dictionaries/baobao";

// Interview import types & helpers
export * from "./interview-import";
