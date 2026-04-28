#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const cwd = process.cwd();

const PASS = "PASS";
const WARN = "WARN";
const FAIL = "FAIL";

/** @type {{ level: "PASS" | "WARN" | "FAIL"; name: string; detail: string }[]} */
const results = [];

function add(level, name, detail) {
  results.push({ level, name, detail });
}

function readText(relPath) {
  const absPath = path.join(cwd, relPath);
  return fs.readFileSync(absPath, "utf8");
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryRun(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkVersionConsistency() {
  const rootVersion = readJson("package.json").version;
  const versions = {
    "package.json": rootVersion,
    "apps/web/package.json": readJson("apps/web/package.json").version,
    "apps/desktop/package.json": readJson("apps/desktop/package.json").version,
    "packages/server/package.json": readJson("packages/server/package.json").version,
    "packages/shared/package.json": readJson("packages/shared/package.json").version,
    "apps/desktop/tauri.conf.json": readJson("apps/desktop/tauri.conf.json").version,
  };

  const cargoToml = readText("apps/desktop/Cargo.toml");
  const cargoMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
  versions["apps/desktop/Cargo.toml"] = cargoMatch?.[1] ?? "<missing>";

  const mismatches = Object.entries(versions).filter(([, v]) => v !== rootVersion);
  if (mismatches.length > 0) {
    add(
      FAIL,
      "版本一致性",
      `基准版本 ${rootVersion}，不一致项: ${mismatches.map(([f, v]) => `${f}=${v}`).join(", ")}`,
    );
    return { rootVersion };
  }

  add(PASS, "版本一致性", `所有关键文件版本均为 ${rootVersion}`);
  return { rootVersion };
}

function checkUpdaterConfig() {
  const conf = readJson("apps/desktop/tauri.conf.json");
  const updater = conf?.plugins?.updater;
  if (!updater) {
    add(FAIL, "Updater 配置", "缺少 plugins.updater 配置");
    return;
  }

  const pubkey = String(updater.pubkey ?? "").trim();
  if (!pubkey || pubkey.includes("REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY")) {
    add(FAIL, "Updater 公钥", "pubkey 仍是占位符或为空");
  } else if (pubkey.length < 32) {
    add(WARN, "Updater 公钥", "pubkey 长度异常偏短，请确认是完整公钥");
  } else {
    add(PASS, "Updater 公钥", "pubkey 已配置");
  }

  const endpoints = Array.isArray(updater.endpoints) ? updater.endpoints : [];
  const hasLatestJson = endpoints.some((v) => String(v).includes("/releases/latest/download/latest.json"));
  if (!hasLatestJson) {
    add(WARN, "Updater Endpoint", `当前 endpoints: ${JSON.stringify(endpoints)}`);
  } else {
    add(PASS, "Updater Endpoint", "已指向 GitHub latest.json");
  }

  const bundleCfg = conf?.bundle ?? {};
  if (bundleCfg.createUpdaterArtifacts !== true) {
    add(FAIL, "Updater 产物", "bundle.createUpdaterArtifacts 不是 true");
  } else {
    add(PASS, "Updater 产物", "createUpdaterArtifacts=true");
  }
}

function checkWorkflow() {
  const workflowPath = ".github/workflows/release-desktop.yml";
  if (!fs.existsSync(path.join(cwd, workflowPath))) {
    add(FAIL, "发布流水线", `缺少 ${workflowPath}`);
    return;
  }

  const content = readText(workflowPath);
  const required = ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "tauri-apps/tauri-action"];
  const missing = required.filter((key) => !content.includes(key));
  if (missing.length > 0) {
    add(FAIL, "发布流水线", `workflow 缺少关键项: ${missing.join(", ")}`);
  } else {
    add(PASS, "发布流水线", "workflow 已包含签名与构建步骤");
  }
}

function checkGitState(rootVersion) {
  const expectedTag = `v${rootVersion}`;
  const status = runGit(["status", "--porcelain"]);
  if (status.length > 0) {
    add(WARN, "工作区状态", "存在未提交改动，发布前建议先 commit");
  } else {
    add(PASS, "工作区状态", "工作区干净");
  }

  const localTag = runGit(["tag", "--list", expectedTag]);
  if (localTag === expectedTag) {
    add(WARN, "本地 Tag", `${expectedTag} 已存在，本次发布可能需要升级版本号`);
  } else {
    add(PASS, "本地 Tag", `${expectedTag} 尚未创建`);
  }
}

function checkGithubSecrets() {
  const ghVersion = tryRun("gh", ["--version"]);
  if (!ghVersion) {
    add(WARN, "GitHub Secrets", "未检测到 gh CLI，无法自动校验仓库 secrets");
    return;
  }

  const remoteUrl = tryRun("git", ["remote", "get-url", "origin"]);
  if (!remoteUrl) {
    add(WARN, "GitHub Secrets", "无法读取 origin，跳过 secrets 校验");
    return;
  }

  let repo = null;
  const sshMatch = remoteUrl.match(/github\.com:([^/]+\/[^/.]+)(?:\.git)?$/);
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/);
  repo = sshMatch?.[1] ?? httpsMatch?.[1] ?? null;
  if (!repo) {
    add(WARN, "GitHub Secrets", `无法从 origin 解析仓库: ${remoteUrl}`);
    return;
  }

  const output = tryRun("gh", ["secret", "list", "--repo", repo, "--json", "name"]);
  if (!output) {
    add(WARN, "GitHub Secrets", `无法读取 ${repo} 的 secrets（可能未登录 gh auth）`);
    return;
  }

  /** @type {{name: string}[]} */
  const secrets = JSON.parse(output);
  const names = new Set(secrets.map((s) => s.name));
  const required = ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"];
  const missing = required.filter((n) => !names.has(n));
  if (missing.length > 0) {
    add(FAIL, "GitHub Secrets", `缺少: ${missing.join(", ")}`);
  } else {
    add(PASS, "GitHub Secrets", `${repo} 已配置所需 secrets`);
  }
}

function checkChangelog(rootVersion) {
  const changelogPath = path.join(cwd, "CHANGELOG.md");

  // 1. Check file exists
  if (!fs.existsSync(changelogPath)) {
    add(FAIL, "Changelog 文件", "CHANGELOG.md 不存在");
    return;
  }

  const content = readText("CHANGELOG.md");

  // 2. Check current version has entry with format: ## [VERSION] - YYYY-MM-DD
  const escapedVersion = escapeRegex(rootVersion);
  const entryRegex = new RegExp(`^## \\[${escapedVersion}\\] - (\\d{4}-\\d{2}-\\d{2})$`, "m");
  const match = content.match(entryRegex);

  if (!match) {
    add(FAIL, "Changelog 版本条目", `未找到版本 ${rootVersion} 的 changelog 条目（预期格式: ## [${rootVersion}] - YYYY-MM-DD）`);
    return;
  }

  const entryDate = match[1];

  // 3. Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    add(FAIL, "Changelog 日期格式", `版本 ${rootVersion} 的日期格式无效: ${entryDate}，预期 YYYY-MM-DD`);
    return;
  }

  // 4. Check date is not beyond today
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [ey, em, ed] = entryDate.split("-").map(Number);
  const entryDateObj = new Date(ey, em - 1, ed);

  if (entryDateObj > today) {
    add(FAIL, "Changelog 日期", `版本 ${rootVersion} 的日期 ${entryDate} 超过今天 ${todayStr}，不能使用未来日期`);
    return;
  }

  add(PASS, "Changelog", `版本 ${rootVersion} 条目格式正确（## [${rootVersion}] - ${entryDate}）`);
}

function printSummary() {
  for (const row of results) {
    console.log(`[${row.level}] ${row.name}: ${row.detail}`);
  }

  const failCount = results.filter((r) => r.level === FAIL).length;
  const warnCount = results.filter((r) => r.level === WARN).length;
  const passCount = results.filter((r) => r.level === PASS).length;
  console.log(`\nSummary: PASS=${passCount} WARN=${warnCount} FAIL=${failCount}`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

function main() {
  const { rootVersion } = checkVersionConsistency();
  checkChangelog(rootVersion);
  checkUpdaterConfig();
  checkWorkflow();
  checkGitState(rootVersion);
  checkGithubSecrets();
  printSummary();
}

main();
