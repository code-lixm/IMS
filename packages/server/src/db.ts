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
  remote_resume_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  position TEXT,
  organization_name TEXT,
  org_all_parent_name TEXT,
  recruitment_source_name TEXT,
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
  status_raw TEXT,
  interview_type INTEGER,
  interview_result INTEGER,
  interview_result_string TEXT,
  scheduled_at INTEGER,
  interview_place TEXT,
  meeting_link TEXT,
  docking_hr_name TEXT,
  docking_hrbp_name TEXT,
  check_in_time INTEGER,
  arrival_date TEXT,
  eliminate_reason_string TEXT,
  remark TEXT,
  interviewer_ids_json TEXT,
  manual_evaluation_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS interview_assessments (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  interview_id TEXT NOT NULL REFERENCES interviews(id),
  interviewer_id TEXT NOT NULL,
  technical_score INTEGER NOT NULL,
  communication_score INTEGER NOT NULL,
  culture_fit_score INTEGER NOT NULL,
  overall_score INTEGER NOT NULL,
  technical_evaluation TEXT NOT NULL,
  communication_evaluation TEXT NOT NULL,
  culture_fit_evaluation TEXT NOT NULL,
  overall_evaluation TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  report_markdown TEXT,
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

CREATE TABLE IF NOT EXISTS email_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL,
  smtp_user TEXT NOT NULL,
  smtp_pass TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  variables TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
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

CREATE TABLE IF NOT EXISTS provider_credentials (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  candidate_id TEXT REFERENCES candidates(id),
  agent_id TEXT,
  model_provider TEXT,
  model_id TEXT,
  temperature REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  reasoning TEXT,
  tools_json TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  engine TEXT NOT NULL DEFAULT 'builtin',
  mode TEXT NOT NULL DEFAULT 'chat',
  temperature INTEGER NOT NULL DEFAULT 0,
  system_prompt TEXT,
  tools_json TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lui_workflows (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  conversation_id TEXT REFERENCES conversations(id),
  current_stage TEXT NOT NULL DEFAULT 'S0',
  stage_data_json TEXT,
  documents_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_resources (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  scope TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding TEXT,
  importance INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_memories (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  importance INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
`);

function ensureColumn(table: string, column: string, definition: string) {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  if (rows.length === 0) {
    return;
  }
  const exists = rows.some((row) => row.name === column);
  if (!exists) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

ensureColumn("remote_users", "cookie_json", "TEXT");
ensureColumn("conversations", "agent_id", "TEXT");
ensureColumn("conversations", "model_provider", "TEXT");
ensureColumn("conversations", "model_id", "TEXT");
ensureColumn("conversations", "temperature", "REAL");
ensureColumn("candidates", "remote_resume_id", "TEXT");
ensureColumn("candidates", "organization_name", "TEXT");
ensureColumn("candidates", "org_all_parent_name", "TEXT");
ensureColumn("candidates", "recruitment_source_name", "TEXT");
ensureColumn("interviews", "status_raw", "TEXT");
ensureColumn("interviews", "interview_type", "INTEGER");
ensureColumn("interviews", "interview_result", "INTEGER");
ensureColumn("interviews", "interview_result_string", "TEXT");
ensureColumn("interviews", "interview_place", "TEXT");
ensureColumn("interviews", "docking_hr_name", "TEXT");
ensureColumn("interviews", "docking_hrbp_name", "TEXT");
ensureColumn("interviews", "check_in_time", "INTEGER");
ensureColumn("interviews", "arrival_date", "TEXT");
ensureColumn("interviews", "eliminate_reason_string", "TEXT");
ensureColumn("interviews", "remark", "TEXT");
ensureColumn("interview_assessments", "report_markdown", "TEXT");
ensureColumn("file_resources", "file_path", "TEXT");
ensureColumn("memories", "embedding", "TEXT");
ensureColumn("memories", "importance", "INTEGER NOT NULL DEFAULT 5");
ensureColumn("session_memories", "metadata", "TEXT");
ensureColumn("session_memories", "importance", "INTEGER NOT NULL DEFAULT 5");
ensureColumn("session_memories", "expires_at", "INTEGER");
ensureColumn("agents", "engine", "TEXT NOT NULL DEFAULT 'builtin'");

export const db = drizzle(sqlite);
export const rawDb = sqlite;
