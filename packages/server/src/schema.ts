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
  settingsJson: text("settings_json"),
});

// ---------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------
export const candidates = sqliteTable("candidates", {
  id: text("id").primaryKey(),
  source: text("source").notNull().default("local"),
  remoteId: text("remote_id"),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  position: text("position"),
  yearsOfExperience: integer("years_of_experience"),
  tagsJson: text("tags_json"),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------
export const resumes = sqliteTable("resumes", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  filePath: text("file_path").notNull(),
  extractedText: text("extracted_text"),
  parsedDataJson: text("parsed_data_json"),
  ocrConfidence: integer("ocr_confidence"),
  createdAt: integer("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// Interview
// ---------------------------------------------------------------------------
export const interviews = sqliteTable("interviews", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  remoteId: text("remote_id"),
  round: integer("round").notNull().default(1),
  status: text("status").notNull().default("scheduled"),
  scheduledAt: integer("scheduled_at"),
  meetingLink: text("meeting_link"),
  interviewerIdsJson: text("interviewer_ids_json"),
  manualEvaluationJson: text("manual_evaluation_json"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// Artifact
// ---------------------------------------------------------------------------
export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  interviewId: text("interview_id").references(() => interviews.id),
  type: text("type").notNull(),
  roundNumber: integer("round_number"),
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
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
  createdAt: integer("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// CandidateWorkspace
// ---------------------------------------------------------------------------
export const candidateWorkspaces = sqliteTable("candidate_workspaces", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  opencodeSessionId: text("opencode_session_id").notNull().unique(),
  workspaceStatus: text("workspace_status").notNull().default("active"),
  lastAccessedAt: integer("last_accessed_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// ImportBatch
// ---------------------------------------------------------------------------
export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("queued"),
  sourceType: text("source_type"),
  currentStage: text("current_stage"),
  totalFiles: integer("total_files").notNull().default(0),
  processedFiles: integer("processed_files").notNull().default(0),
  successFiles: integer("success_files").notNull().default(0),
  failedFiles: integer("failed_files").notNull().default(0),
  autoScreen: integer("auto_screen", { mode: "boolean" }).default(false),
  createdAt: integer("created_at").notNull(),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
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
  status: text("status").notNull().default("queued"),
  stage: text("stage"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  candidateId: text("candidate_id").references(() => candidates.id),
  resultJson: text("result_json"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// ShareRecord
// ---------------------------------------------------------------------------
export const shareRecords = sqliteTable("share_records", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  targetDeviceJson: text("target_device_json"),
  exportFilePath: text("export_file_path"),
  status: text("status").notNull().default("pending"),
  resultJson: text("result_json"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// LUI - Conversation
// ---------------------------------------------------------------------------
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  candidateId: text("candidate_id").references(() => candidates.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// LUI - Message
// ---------------------------------------------------------------------------
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  reasoning: text("reasoning"),
  toolsJson: text("tools_json"),
  status: text("status", { enum: ["streaming", "error", "complete"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// LUI - FileResource
// ---------------------------------------------------------------------------
export const fileResources = sqliteTable("file_resources", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  name: text("name").notNull(),
  type: text("type", { enum: ["code", "document", "image"] }).notNull(),
  content: text("content").notNull(),
  language: text("language"),
  size: integer("size").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// LUI - Agent
// ---------------------------------------------------------------------------
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  mode: text("mode", { enum: ["all", "chat", "ask"] }).notNull().default("chat"),
  temperature: integer("temperature").notNull().default(0),
  systemPrompt: text("system_prompt"),
  toolsJson: text("tools_json"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// Remote User (Baobao)
// ---------------------------------------------------------------------------
export const remoteUsers = sqliteTable("remote_users", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().default("baobao"),
  name: text("name").notNull(),
  username: text("username").notNull(),
  email: text("email"),
  remoteId: text("remote_id"),
  token: text("token").notNull(),
  cookieJson: text("cookie_json"),
  tokenExpAt: integer("token_exp_at"),
  userDataJson: text("user_data_json"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
