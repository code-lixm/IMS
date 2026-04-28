import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { config } from "./config";

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
  current_stage TEXT,
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  success_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  auto_screen INTEGER DEFAULT 0,
  template_id TEXT,
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

CREATE TABLE IF NOT EXISTS screening_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
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
export const db = drizzle(sqlite);

export const rawDb = sqlite;

// Seed default screening template if none exists
(function seedDefaultScreeningTemplate() {
  try {
    const existing = rawDb.prepare(
      "SELECT COUNT(*) as cnt FROM screening_templates WHERE is_default = 1"
    ).get() as { cnt: number } | undefined;
    if (existing && existing.cnt > 0) {
      return;
    }

    const now = Date.now();
    const id = `scrntpl_${crypto.randomUUID()}`;
    const defaultPrompt = [
      "你是一位资深的互联网行业技术面试官，请根据候选人的简历信息进行初筛评估。",
      "",
      "## 评估维度",
      "1. 工作年限与岗位匹配度（初级1-3年、中级3-5年、高级5-10年、资深10年+）",
      "2. 技术栈与项目经验的深度和广度",
      "3. 教育背景和学历水平",
      "4. 跳槽频率和职业发展路径",
      "5. 知名公司/项目经验加分",
      "",
      "## 输出要求",
      "- 给出通过/待定/淘汰的结论",
      "- 简要说明评估依据（不超过100字）",
      "- 列出关键风险点或亮点",
    ].join("\n");

    rawDb.prepare(
      "INSERT INTO screening_templates (id, name, description, prompt, is_default, is_active, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1, ?, ?)"
    ).run(id, "默认初筛模板", "系统提供的通用候选人初筛评估模板，适用于多数互联网技术岗位", defaultPrompt, now, now);
  } catch (error) {
    console.error("[db] Failed to seed default screening template:", error);
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
