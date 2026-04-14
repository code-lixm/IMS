import { chromium } from "@playwright/test";

const remoteDebugUrl = process.env.PLAYWRIGHT_REMOTE_DEBUG_URL ?? "http://127.0.0.1:9333";
const targetUrl = process.env.PLAYWRIGHT_REMOTE_TARGET_URL ?? process.argv[2] ?? "http://localhost:9091/candidates";
const waitForSelector = process.env.PLAYWRIGHT_REMOTE_WAIT_FOR ?? "text=张三";
const screenshotPath = process.env.PLAYWRIGHT_REMOTE_SCREENSHOT ?? "test-results/remote-browser-candidates.png";
const expectedUrl = process.env.PLAYWRIGHT_REMOTE_EXPECT_URL;
const assertExpressions = (process.env.PLAYWRIGHT_REMOTE_ASSERTS ?? "")
  .split(";;")
  .map((item) => item.trim())
  .filter(Boolean);

async function assertVisible(page, expression) {
  await page.locator(expression).first().waitFor({ state: "visible", timeout: 15000 });
  console.log(`Assertion passed: ${expression}`);
}

async function resolveWsEndpoint(url) {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return url;
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/json/version`);
  if (!response.ok) {
    throw new Error(`无法获取远程浏览器调试信息: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.webSocketDebuggerUrl) {
    throw new Error("远程浏览器未返回 webSocketDebuggerUrl");
  }

  return data.webSocketDebuggerUrl;
}

const wsEndpoint = await resolveWsEndpoint(remoteDebugUrl);
const browser = await chromium.connectOverCDP(wsEndpoint);

try {
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("未找到可复用的远程浏览器上下文，请确认 Chrome 已使用 9333 端口启动");
  }

  const page = await context.newPage();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  if (expectedUrl && !page.url().startsWith(expectedUrl)) {
    throw new Error(`页面地址校验失败：期望前缀 ${expectedUrl}，实际为 ${page.url()}`);
  }

  if (waitForSelector) {
    await assertVisible(page, waitForSelector);
  }

  for (const expression of assertExpressions) {
    await assertVisible(page, expression);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`Remote browser connected: ${wsEndpoint}`);
  console.log(`Current URL: ${page.url()}`);
  console.log(`Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
