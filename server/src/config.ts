import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIR = process.cwd();
const RUNTIME_DIR = join(ROOT_DIR, "runtime");
const DATA_DIR = join(RUNTIME_DIR, "data");
const FILES_DIR = join(RUNTIME_DIR, "files");
const DB_PATH = join(RUNTIME_DIR, "interview.db");

mkdirSync(RUNTIME_DIR, { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(FILES_DIR, { recursive: true });

export const config = {
  host: "127.0.0.1",
  port: 3000,
  opencodePort: 4096,
  runtimeDir: RUNTIME_DIR,
  dataDir: DATA_DIR,
  filesDir: FILES_DIR,
  dbPath: DB_PATH
};
