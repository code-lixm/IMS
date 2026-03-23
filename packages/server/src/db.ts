import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { config } from "./config";

const sqlite = new Database(config.dbPath, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  token_status TEXT NOT NULL DEFAULT 'unauthenticated',
  last_sync_at INTEGER,
  settings_json TEXT
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'local',
  remote_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  position TEXT,
  years_of_experience INTEGER,
  tags_json TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  extracted_text TEXT,
  parsed_data_json TEXT,
  ocr_confidence INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  remote_id TEXT,
  "round" INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at INTEGER,
  meeting_link TEXT,
  interviewer_ids_json TEXT,
  manual_evaluation_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  interview_id TEXT REFERENCES interviews(id),
  type TEXT NOT NULL,
  round_number INTEGER,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artifact_versions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  version INTEGER NOT NULL,
  prompt_snapshot TEXT,
  feedback_text TEXT,
  structured_data_json TEXT,
  markdown_path TEXT,
  pdf_path TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_workspaces (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  opencode_session_id TEXT NOT NULL UNIQUE,
  workspace_status TEXT NOT NULL DEFAULT 'active',
  last_accessed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  source_type TEXT,
  current_stage TEXT,
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  success_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  auto_screen INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS import_file_tasks (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  original_path TEXT NOT NULL,
  normalized_path TEXT,
  file_type TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT,
  error_code TEXT,
  error_message TEXT,
  candidate_id TEXT REFERENCES candidates(id),
  result_json TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS share_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  target_device_json TEXT,
  export_file_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS remote_users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'baobao',
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT,
  remote_id TEXT,
  token TEXT NOT NULL,
  cookie_json TEXT,
  token_exp_at INTEGER,
  user_data_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

function ensureColumn(table: string, column: string, definition: string) {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  const exists = rows.some((row) => row.name === column);
  if (!exists) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

ensureColumn("remote_users", "cookie_json", "TEXT");

export const db = drizzle(sqlite);
export const rawDb = sqlite;
