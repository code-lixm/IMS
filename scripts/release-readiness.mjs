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

  const frameworks = Array.isArray(bundleCfg?.macOS?.frameworks) ? bundleCfg.macOS.frameworks : [];
  if (frameworks.includes("Sparkle.framework")) {
    add(PASS, "Sparkle Framework", "macOS bundle 已包含 Sparkle.framework");
  } else {
    add(FAIL, "Sparkle Framework", "apps/desktop/tauri.conf.json 缺少 macOS.frameworks=Sparkle.framework");
  }
}

function checkSparkleConfig() {
  const infoPlistPath = "apps/desktop/Info.plist";
  if (!fs.existsSync(path.join(cwd, infoPlistPath))) {
    add(FAIL, "Sparkle Info.plist", `缺少 ${infoPlistPath}`);
    return;
  }

  const infoPlist = readText(infoPlistPath);
  const feedUrlMatch = infoPlist.match(/<key>SUFeedURL<\/key>\s*<string>([^<]+)<\/string>/);
  const publicKeyMatch = infoPlist.match(/<key>SUPublicEDKey<\/key>\s*<string>([^<]+)<\/string>/);
  const feedUrl = feedUrlMatch?.[1]?.trim() ?? "";
  const publicKey = publicKeyMatch?.[1]?.trim() ?? "";

  if (!feedUrl || feedUrl.includes("REPLACE_WITH_SPARKLE_APPCAST_URL")) {
    add(FAIL, "Sparkle Feed URL", "SUFeedURL 仍为空或是占位符");
  } else {
    add(PASS, "Sparkle Feed URL", feedUrl);
  }

  if (!publicKey || publicKey.includes("REPLACE_WITH_SPARKLE_PUBLIC_ED_KEY")) {
    add(FAIL, "Sparkle 公钥", "SUPublicEDKey 仍为空或是占位符");
  } else {
    add(PASS, "Sparkle 公钥", `SUPublicEDKey 已配置，长度 ${publicKey.length}`);
  }
}

function checkWorkflow() {
  const workflowPath = ".github/workflows/release-desktop.yml";
  if (!fs.existsSync(path.join(cwd, workflowPath))) {
    add(FAIL, "发布流水线", `缺少 ${workflowPath}`);
    return;
  }

  const content = readText(workflowPath);
  const required = [
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    "SPARKLE_PRIVATE_KEY",
    "tauri-apps/tauri-action",
    "actions/deploy-pages@v4",
    "*_universal.dmg",
    "Sparkle-2.8.1.tar.xz",
    "scripts/generate-sparkle-appcast.mjs",
  ];
  const missing = required.filter((key) => !content.includes(key));
  if (missing.length > 0) {
    add(FAIL, "发布流水线", `workflow 缺少关键项: ${missing.join(", ")}`);
  } else {
    add(PASS, "发布流水线", "workflow 已包含 Windows updater 与 Sparkle appcast 发布步骤");
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
  const required = ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "SPARKLE_PRIVATE_KEY"];
  const missing = required.filter((n) => !names.has(n));
  if (missing.length > 0) {
    add(FAIL, "GitHub Secrets", `缺少: ${missing.join(", ")}`);
  } else {
    add(PASS, "GitHub Secrets", `${repo} 已配置所需 secrets`);
  }
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
  checkUpdaterConfig();
  checkSparkleConfig();
  checkWorkflow();
  checkGitState(rootVersion);
  checkGithubSecrets();
  printSummary();
}

main();
