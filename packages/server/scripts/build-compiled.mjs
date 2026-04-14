#!/usr/bin/env node

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const entry = join(rootDir, "src", "index.ts");

const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE || process.env.TAURI_TARGET || "";

function detectDefaultTriple() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "darwin" && arch === "x64") return "x86_64-apple-darwin";
  if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
  if (platform === "win32" && arch === "ia32") return "i686-pc-windows-msvc";
  if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-gnu";
  if (platform === "linux" && arch === "arm64") return "aarch64-unknown-linux-gnu";
  throw new Error(`Unsupported host platform/arch: ${platform}/${arch}`);
}

function bunTargetFromTriple(triple) {
  switch (triple) {
    case "aarch64-apple-darwin":
      return "bun-darwin-arm64";
    case "x86_64-apple-darwin":
      return "bun-darwin-x64";
    case "x86_64-pc-windows-msvc":
      return "bun-windows-x64";
    case "i686-pc-windows-msvc":
      throw new Error(
        "Bun compile does not provide a stable i686 Windows target; please build desktop target x86_64-pc-windows-msvc.",
      );
    case "x86_64-unknown-linux-gnu":
      return "bun-linux-x64-modern";
    case "aarch64-unknown-linux-gnu":
      return "bun-linux-arm64";
    default:
      throw new Error(`Unsupported TAURI target triple: ${triple}`);
  }
}

const effectiveTriple = targetTriple || detectDefaultTriple();
const bunTarget = bunTargetFromTriple(effectiveTriple);
const isWindows = bunTarget.startsWith("bun-windows-");
const output = join(rootDir, "dist", isWindows ? "server.exe" : "server");

if (!existsSync(dirname(output))) {
  mkdirSync(dirname(output), { recursive: true });
}

console.log(`[server-build] target triple: ${effectiveTriple}`);
console.log(`[server-build] bun target: ${bunTarget}`);
console.log(`[server-build] output: ${output}`);

execFileSync(
  "bun",
  ["build", "--compile", `--target=${bunTarget}`, "--outfile", output, entry],
  { cwd: rootDir, stdio: "inherit" },
);
