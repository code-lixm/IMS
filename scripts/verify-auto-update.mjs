#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const PASS = "PASS";
const WARN = "WARN";
const FAIL = "FAIL";

/** @type {{ level: "PASS" | "WARN" | "FAIL"; name: string; detail: string }[]} */
const results = [];

function add(level, name, detail) {
  results.push({ level, name, detail });
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(cwd, relPath), "utf8"));
}

function readText(relPath) {
  return fs.readFileSync(path.join(cwd, relPath), "utf8");
}

function checkUpdaterConfig() {
  const tauriConfig = readJson("apps/desktop/tauri.conf.json");
  const updater = tauriConfig?.plugins?.updater;
  if (!updater) {
    add(FAIL, "生产 updater 配置", "apps/desktop/tauri.conf.json 缺少 plugins.updater");
    return null;
  }

  if (tauriConfig?.bundle?.createUpdaterArtifacts === true) {
    add(PASS, "生产 updater 产物", "createUpdaterArtifacts=true");
  } else {
    add(FAIL, "生产 updater 产物", "createUpdaterArtifacts 不是 true");
  }

  const endpoints = Array.isArray(updater.endpoints) ? updater.endpoints : [];
  if (endpoints.length === 0) {
    add(FAIL, "更新源 endpoint", "未配置 updater endpoint");
  } else {
    add(PASS, "更新源 endpoint", endpoints.join(", "));
  }

  const pubkey = String(updater.pubkey ?? "").trim();
  if (!pubkey) {
    add(FAIL, "Updater 公钥", "pubkey 为空");
  } else {
    add(PASS, "Updater 公钥", `已配置，长度 ${pubkey.length}`);
  }

  return { endpoint: endpoints[0] ?? null };
}

function checkSparkleConfig() {
  const infoPlist = readText("apps/desktop/Info.plist");
  const feedUrlMatch = infoPlist.match(/<key>SUFeedURL<\/key>\s*<string>([^<]+)<\/string>/);
  const publicKeyMatch = infoPlist.match(/<key>SUPublicEDKey<\/key>\s*<string>([^<]+)<\/string>/);
  const feedUrl = feedUrlMatch?.[1]?.trim() ?? "";
  const publicKey = publicKeyMatch?.[1]?.trim() ?? "";

  if (!feedUrl || feedUrl.includes("REPLACE_WITH_SPARKLE_APPCAST_URL")) {
    add(FAIL, "Sparkle Feed URL", "Info.plist 的 SUFeedURL 未配置完成");
  } else {
    add(PASS, "Sparkle Feed URL", feedUrl);
  }

  if (!publicKey || publicKey.includes("REPLACE_WITH_SPARKLE_PUBLIC_ED_KEY")) {
    add(FAIL, "Sparkle 公钥", "Info.plist 的 SUPublicEDKey 未配置完成");
  } else {
    add(PASS, "Sparkle 公钥", `已配置，长度 ${publicKey.length}`);
  }
}

function checkCapabilities() {
  const capability = readJson("apps/desktop/capabilities/default.json");
  const permissions = Array.isArray(capability.permissions) ? capability.permissions : [];
  if (permissions.includes("updater:default")) {
    add(PASS, "桌面权限", "capabilities/default.json 已包含 updater:default");
  } else {
    add(FAIL, "桌面权限", "缺少 updater:default，前端调用可能被权限模型拒绝");
  }
}

function checkCommandsWired() {
  const libRs = readText("apps/desktop/src/lib.rs");
  const required = [
    'tauri_plugin_sparkle_updater::init()',
    "tauri_plugin_updater::Builder::new().build()",
    "check_for_app_update",
    "install_app_update",
    "restart_desktop_app",
  ];
  const missing = required.filter((token) => !libRs.includes(token));
  if (missing.length > 0) {
    add(FAIL, "Rust 命令接线", `缺少: ${missing.join(", ")}`);
  } else {
    add(PASS, "Rust 命令接线", "updater 插件与 3 个 invoke 命令已接线");
  }
}

function checkFrontendTrigger() {
  const settingsView = readText("apps/web/src/views/SettingsView.vue");
  const required = [
    'checkForSparkleUpdateInformation()',
    'openSparkleUpdater()',
    'invoke<DesktopUpdateStatus>("check_for_app_update")',
    'invoke<DesktopUpdateStatus>("install_app_update")',
    'invoke("restart_desktop_app")',
  ];
  const missing = required.filter((token) => !settingsView.includes(token));
  if (missing.length > 0) {
    add(FAIL, "设置页触发器", `缺少: ${missing.join(", ")}`);
  } else {
    add(PASS, "设置页触发器", "设置页已接入检查 / 安装 / 重启流程");
  }
}

function checkLocalBuildMode() {
  const localConfig = readJson("apps/desktop/tauri.local.conf.json");
  const frameworks = Array.isArray(localConfig?.bundle?.macOS?.frameworks) ? localConfig.bundle.macOS.frameworks : [];
  if (frameworks.includes("Sparkle.framework")) {
    add(PASS, "本地 Sparkle Framework", "tauri.local.conf.json 已包含 Sparkle.framework");
  } else {
    add(FAIL, "本地 Sparkle Framework", "tauri.local.conf.json 缺少 Sparkle.framework");
  }

  if (localConfig?.bundle?.createUpdaterArtifacts === false) {
    add(WARN, "本地 build 配置", "tauri.local.conf.json 禁用了 updater artifacts；本地验证升级要用正式 tauri.conf.json 或自定义验证配置");
  } else {
    add(PASS, "本地 build 配置", "本地配置也会生成 updater artifacts");
  }
}

function checkWorkflowForSparkle() {
  const workflow = readText(".github/workflows/release-desktop.yml");
  const required = [
    "publish-sparkle-appcast",
    "actions/deploy-pages@v4",
    "SPARKLE_PRIVATE_KEY",
    "*_universal.dmg",
    "generate-sparkle-appcast.mjs",
  ];
  const missing = required.filter((token) => !workflow.includes(token));
  if (missing.length > 0) {
    add(FAIL, "Sparkle 发布流水线", `缺少: ${missing.join(", ")}`);
  } else {
    add(PASS, "Sparkle 发布流水线", "已配置 GitHub Pages appcast 发布链路");
  }
}

async function checkEndpoint(endpoint) {
  if (!endpoint) {
    return;
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        "User-Agent": "IMS-auto-update-verifier",
      },
    });
    if (!response.ok) {
      add(WARN, "远端 latest.json", `请求返回 ${response.status} ${response.statusText}`);
      return;
    }

    const manifest = await response.json();
    const version = manifest?.version ?? "<unknown>";
    const platforms = Object.keys(manifest?.platforms ?? {});
    add(PASS, "远端 latest.json", `version=${version}，platforms=${platforms.join(", ") || "<none>"}`);
  } catch (error) {
    add(WARN, "远端 latest.json", error instanceof Error ? error.message : "请求失败");
  }
}

async function checkSparkleFeed(feedUrl) {
  if (!feedUrl || feedUrl.includes("REPLACE_WITH_SPARKLE_APPCAST_URL")) {
    return;
  }

  try {
    const response = await fetch(feedUrl, {
      headers: {
        "User-Agent": "IMS-auto-update-verifier",
      },
    });
    if (!response.ok) {
      add(WARN, "远端 appcast.xml", `请求返回 ${response.status} ${response.statusText}`);
      return;
    }

    const content = await response.text();
    const hasEnclosure = content.includes("<enclosure ");
    const hasSignature = content.includes("sparkle:edSignature=");
    if (hasEnclosure && hasSignature) {
      add(PASS, "远端 appcast.xml", feedUrl);
    } else {
      add(WARN, "远端 appcast.xml", "已返回内容，但缺少 enclosure 或 sparkle:edSignature");
    }
  } catch (error) {
    add(WARN, "远端 appcast.xml", error instanceof Error ? error.message : "请求失败");
  }
}

function printChecklist() {
  console.log("\n=== 可执行验证清单 ===");
  console.log("1. 运行 pnpm desktop:update:verify，先确认配置、权限、endpoint 都通过。");
  console.log("2. 旧版本安装验证：使用当前版本安装包安装到 /Applications。");
  console.log("3. 提升版本号（package.json / apps/desktop/Cargo.toml / tauri.conf.json 保持一致）。");
  console.log("4. 用正式配置构建：pnpm build:desktop。");
  console.log("5. 打 tag 并触发 GitHub Release：git tag vX.Y.Z && git push origin vX.Y.Z。");
  console.log("6. 在旧版本应用里打开 设置 → 检查更新，确认出现新版本。");
  console.log("7. 点击安装更新，安装后点击立即重启，确认 About/设置里版本号已变更。");

  console.log("\n=== 本地升级演练建议 ===");
  console.log("A. 先保留一个旧版本 app 在 /Applications/IMS.app。");
  console.log("B. 新版本不要用 tauri.local.conf.json 构建；它不会生成 updater artifacts。");
  console.log("C. 如果不想污染正式 release，可建立 staging tag / staging release 仓库，复用同一套 latest.json 机制。");
  console.log("D. 如果只做本机链路排查，可先用新包覆盖安装，确认 Settings 页的 3 个按钮都能正常返回。");
}

function printSummary() {
  for (const row of results) {
    console.log(`[${row.level}] ${row.name}: ${row.detail}`);
  }

  const failCount = results.filter((item) => item.level === FAIL).length;
  const warnCount = results.filter((item) => item.level === WARN).length;
  const passCount = results.filter((item) => item.level === PASS).length;
  console.log(`\nSummary: PASS=${passCount} WARN=${warnCount} FAIL=${failCount}`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const config = checkUpdaterConfig();
  checkSparkleConfig();
  checkCapabilities();
  checkCommandsWired();
  checkFrontendTrigger();
  checkLocalBuildMode();
  checkWorkflowForSparkle();
  await checkEndpoint(config?.endpoint ?? null);
  const infoPlist = readText("apps/desktop/Info.plist");
  const feedUrlMatch = infoPlist.match(/<key>SUFeedURL<\/key>\s*<string>([^<]+)<\/string>/);
  await checkSparkleFeed(feedUrlMatch?.[1]?.trim() ?? null);
  printSummary();
  printChecklist();
}

await main();
