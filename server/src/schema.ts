import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  tokenStatus: text("token_status").notNull().default("unauthenticated"),
  lastSyncAt: integer("last_sync_at"),
  settingsJson: text("settings_json")
});

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
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const candidateWorkspaces = sqliteTable("candidate_workspaces", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  opencodeSessionId: text("opencode_session_id").notNull().unique(),
  workspaceStatus: text("workspace_status").notNull().default("active"),
  lastAccessedAt: integer("last_accessed_at").notNull(),
  createdAt: integer("created_at").notNull()
});

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  currentStage: text("current_stage"),
  totalFiles: integer("total_files").notNull().default(0),
  processedFiles: integer("processed_files").notNull().default(0),
  successFiles: integer("success_files").notNull().default(0),
  failedFiles: integer("failed_files").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at")
});
