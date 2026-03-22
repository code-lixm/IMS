import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  tokenStatus: text("token_status").notNull().default("unauthenticated"),
  lastSyncAt: integer("last_sync_at"),
  settingsJson: text("settings_json")
});

// ---------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------
export const candidates = sqliteTable("candidates", {
  id: text("id").primaryKey(),
  source: text("source").notNull().default("local"), // 'local' | 'remote' | 'hybrid'
  remoteId: text("remote_id"),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  position: text("position"),
  yearsOfExperience: integer("years_of_experience"),
  tagsJson: text("tags_json"), // JSON string array
  deletedAt: integer("deleted_at"), // soft delete
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------
export const resumes = sqliteTable("resumes", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp'
  fileSize: integer("file_size").notNull(),
  filePath: text("file_path").notNull(),
  extractedText: text("extracted_text"), // raw OCR / text extract result
  parsedDataJson: text("parsed_data_json"), // structured parse result
  ocrConfidence: integer("ocr_confidence"), // 0-100
  createdAt: integer("created_at").notNull()
});

// ---------------------------------------------------------------------------
// Interview
// ---------------------------------------------------------------------------
export const interviews = sqliteTable("interviews", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  remoteId: text("remote_id"),
  round: integer("round").notNull().default(1),
  status: text("status").notNull().default("scheduled"), // 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  scheduledAt: integer("scheduled_at"),
  meetingLink: text("meeting_link"),
  interviewerIdsJson: text("interviewer_ids_json"), // JSON string array
  manualEvaluationJson: text("manual_evaluation_json"), // { rating, decision, comments }
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

// ---------------------------------------------------------------------------
// Artifact
// ---------------------------------------------------------------------------
export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  interviewId: text("interview_id").references(() => interviews.id), // nullable
  type: text("type").notNull(), // 'screening' | 'questions' | 'evaluation' | 'summary'
  roundNumber: integer("round_number"), // nullable, e.g. which interview round this belongs to
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

// ---------------------------------------------------------------------------
// ArtifactVersion
// ---------------------------------------------------------------------------
export const artifactVersions = sqliteTable("artifact_versions", {
  id: text("id").primaryKey(),
  artifactId: text("artifact_id").notNull().references(() => artifacts.id),
  version: integer("version").notNull(),
  promptSnapshot: text("prompt_snapshot"),
  feedbackText: text("feedback_text"),
  structuredDataJson: text("structured_data_json"),
  markdownPath: text("markdown_path"),
  pdfPath: text("pdf_path"),
  createdAt: integer("created_at").notNull()
});

// ---------------------------------------------------------------------------
// CandidateWorkspace
// ---------------------------------------------------------------------------
export const candidateWorkspaces = sqliteTable("candidate_workspaces", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  opencodeSessionId: text("opencode_session_id").notNull().unique(),
  workspaceStatus: text("workspace_status").notNull().default("active"), // 'active' | 'degraded' | 'closed'
  lastAccessedAt: integer("last_accessed_at").notNull(),
  createdAt: integer("created_at").notNull()
});

// ---------------------------------------------------------------------------
// ImportBatch
// ---------------------------------------------------------------------------
export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("queued"), // 'queued' | 'preparing' | 'extracting' | 'classifying' | 'processing' | 'indexing' | 'completed' | 'partial_success' | 'failed' | 'cancelled'
  sourceType: text("source_type"), // 'zip' | 'file'
  currentStage: text("current_stage"),
  totalFiles: integer("total_files").notNull().default(0),
  processedFiles: integer("processed_files").notNull().default(0),
  successFiles: integer("success_files").notNull().default(0),
  failedFiles: integer("failed_files").notNull().default(0),
  autoScreen: integer("auto_screen", { mode: "boolean" }).default(false),
  createdAt: integer("created_at").notNull(),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at")
});

// ---------------------------------------------------------------------------
// ImportFileTask
// ---------------------------------------------------------------------------
export const importFileTasks = sqliteTable("import_file_tasks", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull().references(() => importBatches.id),
  originalPath: text("original_path").notNull(),
  normalizedPath: text("normalized_path"),
  fileType: text("file_type"),
  status: text("status").notNull().default("queued"), // 'queued' | 'extracting' | 'text_extracting' | 'ocr_running' | 'parsing' | 'matching_candidate' | 'saving' | 'done' | 'failed' | 'skipped'
  stage: text("stage"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  candidateId: text("candidate_id").references(() => candidates.id),
  resultJson: text("result_json"), // parsed structured data
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

// ---------------------------------------------------------------------------
// ShareRecord
// ---------------------------------------------------------------------------
export const shareRecords = sqliteTable("share_records", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // 'send' | 'receive'
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  targetDeviceJson: text("target_device_json"), // { ip, port, name }
  exportFilePath: text("export_file_path"),
  status: text("status").notNull().default("pending"), // 'pending' | 'success' | 'failed' | 'conflict'
  resultJson: text("result_json"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at")
});

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id"), // nullable for system-level notifications
  type: text("type").notNull(), // 'sync_error' | 'import_complete' | 'share_received' | 'token_expired' | 'system'
  title: text("title").notNull(),
  body: text("body"),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull()
});
