import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { config } from "./config";

mkdirSync(join(config.runtimeDir, "recordings"), { recursive: true });

const sqlite = new Database(config.dbPath, { create: true });
sqlite.exec("PRAGMA busy_timeout = 5000;");
sqlite.exec("PRAGMA mmap_size = 0;");
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA synchronous = FULL;");
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
  file_hash TEXT,
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
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  source_type TEXT,
  summary_json TEXT,
  current_stage TEXT,
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  success_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  auto_screen INTEGER DEFAULT 0,
  group_id TEXT,
  template_id TEXT,
  pass_threshold INTEGER,
  review_threshold INTEGER,
  learning_enabled INTEGER,
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
  matched_template_id TEXT,
  payload_json TEXT,
  result_json TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  file_hash TEXT,
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

CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle',
  file_path TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  live_transcript_text TEXT,
  final_transcript_text TEXT,
  transcript_json TEXT,
  organised_text TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
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

CREATE TABLE IF NOT EXISTS screening_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'custom',
  is_readonly INTEGER NOT NULL DEFAULT 0,
  match_hints_json TEXT,
  keywords_json TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS screening_template_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  pass_threshold INTEGER NOT NULL DEFAULT 80,
  review_threshold INTEGER NOT NULL DEFAULT 70,
  learning_enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS screening_template_group_templates (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS screening_score_feedbacks (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  file_task_id TEXT NOT NULL REFERENCES import_file_tasks(id),
  candidate_id TEXT REFERENCES candidates(id),
  group_id TEXT REFERENCES screening_template_groups(id),
  template_id TEXT,
  matched_template_id TEXT,
  original_score INTEGER NOT NULL,
  overridden_score INTEGER NOT NULL,
  reason TEXT,
  learning_enabled_snapshot INTEGER NOT NULL DEFAULT 0,
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
  source_type TEXT NOT NULL DEFAULT 'custom',
  is_mutable INTEGER NOT NULL DEFAULT 1,
  scene_affinity TEXT NOT NULL DEFAULT 'general',
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

CREATE TABLE IF NOT EXISTS university_cache (
  id TEXT PRIMARY KEY,
  school_name TEXT NOT NULL UNIQUE,
  response_json TEXT NOT NULL,
  is985 INTEGER NOT NULL DEFAULT 0,
  is211 INTEGER NOT NULL DEFAULT 0,
  is_double_first_class INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  found INTEGER NOT NULL DEFAULT 1,
  verdict TEXT NOT NULL DEFAULT 'verified',
  queried_at INTEGER NOT NULL
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

function renameColumnIfNeeded(table: string, from: string, to: string) {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  if (rows.length === 0) {
    return;
  }
  const hasFrom = rows.some((row) => row.name === from);
  const hasTo = rows.some((row) => row.name === to);
  if (hasFrom && !hasTo) {
    sqlite.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to};`);
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
ensureColumn("import_batches", "display_name", "TEXT");
ensureColumn("import_batches", "summary_json", "TEXT");
ensureColumn("import_batches", "group_id", "TEXT");
ensureColumn("import_batches", "pass_threshold", "INTEGER");
ensureColumn("import_batches", "review_threshold", "INTEGER");
ensureColumn("import_batches", "learning_enabled", "INTEGER");
ensureColumn("agents", "source_type", "TEXT NOT NULL DEFAULT 'custom'");
ensureColumn("agents", "is_mutable", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("agents", "scene_affinity", "TEXT NOT NULL DEFAULT 'general'");
ensureColumn("agents", "engine", "TEXT NOT NULL DEFAULT 'builtin'");

ensureColumn("university_cache", "verdict", "TEXT");
sqlite.exec(`
UPDATE university_cache
SET verdict = CASE
  WHEN found = 1 THEN 'verified'
  WHEN detail = 'Empty data' THEN 'not_found'
  ELSE 'api_failed'
END
WHERE verdict IS NULL OR (verdict = 'verified' AND found = 0);
`);
ensureColumn("import_batches", "template_id", "TEXT");
ensureColumn("resumes", "file_hash", "TEXT");
ensureColumn("import_file_tasks", "file_hash", "TEXT");
ensureColumn("import_file_tasks", "matched_template_id", "TEXT");
ensureColumn("import_file_tasks", "payload_json", "TEXT");
ensureColumn("recordings", "status", "TEXT NOT NULL DEFAULT 'idle'");
ensureColumn("recordings", "file_path", "TEXT NOT NULL DEFAULT ''");
ensureColumn("recordings", "duration_ms", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("recordings", "file_size_bytes", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("recordings", "language", "TEXT");
ensureColumn("recordings", "live_transcript_text", "TEXT");
ensureColumn("recordings", "final_transcript_text", "TEXT");
ensureColumn("recordings", "transcript_json", "TEXT");
ensureColumn("recordings", "organised_text", "TEXT");
ensureColumn("recordings", "created_at", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("recordings", "updated_at", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("screening_templates", "source_type", "TEXT NOT NULL DEFAULT 'custom'");
ensureColumn("screening_templates", "is_readonly", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("screening_templates", "match_hints_json", "TEXT");
ensureColumn("screening_templates", "keywords_json", "TEXT");
renameColumnIfNeeded("screening_score_feedbacks", "previous_score", "original_score");
renameColumnIfNeeded("screening_score_feedbacks", "current_score", "overridden_score");
ensureColumn("screening_score_feedbacks", "learning_enabled_snapshot", "INTEGER NOT NULL DEFAULT 0");
export const db = drizzle(sqlite);

export const rawDb = sqlite;

void (async function materializeBuiltinScreeningTemplates() {
  try {
    const { BUILT_IN_SCREENING_TEMPLATES } = await import("./services/screening-templates");
    const existingDefault = rawDb.prepare(
      "SELECT COUNT(*) as cnt FROM screening_templates WHERE is_default = 1"
    ).get() as { cnt: number } | undefined;
    const hasDefault = Boolean(existingDefault && existingDefault.cnt > 0);

    const stmt = rawDb.prepare(
      "INSERT OR IGNORE INTO screening_templates (id, name, description, prompt, source_type, is_readonly, match_hints_json, keywords_json, is_default, is_active, version, created_at, updated_at) VALUES (?, ?, ?, ?, 'builtin', 1, ?, ?, ?, ?, ?, ?, ?)"
    );

    for (const template of BUILT_IN_SCREENING_TEMPLATES) {
      const hintTemplate = template as { matchHintsJson?: string | null; keywordsJson?: string | null };
      stmt.run(
        template.id,
        template.name,
        template.description,
        template.prompt,
        hintTemplate.matchHintsJson ?? null,
        hintTemplate.keywordsJson ?? null,
        hasDefault ? 0 : (template.isDefault ? 1 : 0),
        template.isActive ? 1 : 0,
        template.version,
        template.createdAt,
        template.updatedAt,
      );
    }
  } catch (error) {
    console.error("[db] Failed to materialize builtin screening templates:", error);
  }
})();

let databaseClosed = false;

export function closeDatabase() {
  if (databaseClosed) {
    return;
  }
  databaseClosed = true;

  try {
    sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch (error) {
    console.error("[db] WAL checkpoint before close failed", error);
  }

  try {
    sqlite.close();
  } catch (error) {
    console.error("[db] close failed", error);
  }
}
