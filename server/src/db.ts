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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_workspaces (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  opencode_session_id TEXT NOT NULL UNIQUE,
  workspace_status TEXT NOT NULL DEFAULT 'active',
  last_accessed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  current_stage TEXT,
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  success_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
`);

export const db = drizzle(sqlite);
export const rawDb = sqlite;
