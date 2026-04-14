import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIR = process.cwd();
const RUNTIME_DIR = join(ROOT_DIR, "runtime");
const DATA_DIR = join(RUNTIME_DIR, "data");
const FILES_DIR = join(RUNTIME_DIR, "files");
const AGENT_WORKSPACES_DIR = join(RUNTIME_DIR, "agent-workspaces");
const DB_PATH = join(RUNTIME_DIR, "interview.db");
const BUNDLED_INTERVIEW_OPENCODE_DIR = join(ROOT_DIR, "resources", "interview-opencode");

mkdirSync(RUNTIME_DIR, { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(FILES_DIR, { recursive: true });
mkdirSync(AGENT_WORKSPACES_DIR, { recursive: true });

export const config = {
  host: process.env.IMS_HOST || "127.0.0.1",
  port: parseInt(process.env.IMS_PORT || "9092", 10),
  runtimeDir: RUNTIME_DIR,
  dataDir: DATA_DIR,
  filesDir: FILES_DIR,
  agentWorkspacesDir: AGENT_WORKSPACES_DIR,
  bundledInterviewOpencodeDir: BUNDLED_INTERVIEW_OPENCODE_DIR,
  dbPath: DB_PATH,
};
