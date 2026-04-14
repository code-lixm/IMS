import { chromium, expect, type Locator, type Page } from "@playwright/test";

const remoteDebugUrl = process.env.PLAYWRIGHT_REMOTE_DEBUG_URL ?? "http://127.0.0.1:9333";
const baseUrl = process.env.PLAYWRIGHT_REMOTE_BASE_URL ?? "http://localhost:9091";

async function resolveEndpoint(url: string) {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return url;
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/json/version`);
  if (!response.ok) {
    throw new Error(`无法读取远程浏览器调试信息：${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (!payload.webSocketDebuggerUrl) {
    throw new Error("远程浏览器缺少 webSocketDebuggerUrl");
  }

  return payload.webSocketDebuggerUrl as string;
}

export async function withRemotePage<T>(callback: (page: Page) => Promise<T>): Promise<T> {
  const endpoint = await resolveEndpoint(remoteDebugUrl);
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();

  try {
    await page.setViewportSize({ width: 1440, height: 1024 });
    return await callback(page);
  } finally {
    await page.close();
  }
}

export function authenticatedUrl(path: string) {
  return new URL(path, baseUrl).toString();
}

export async function gotoAuthenticated(page: Page, path: string) {
  await page.goto(authenticatedUrl(path), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
}

export async function expectHeading(page: Page, text: string) {
  await expect(page.getByText(text).first()).toBeVisible();
}

export async function closeDialogByEscape(page: Page) {
  await page.keyboard.press("Escape");
}

export async function clickIfVisible(locator: Locator) {
  if (await locator.count()) {
    await locator.first().click();
    return true;
  }
  return false;
}

export async function gotoFirstCandidateDetail(page: Page) {
  await gotoAuthenticated(page, "/candidates");
  const firstCandidate = await page.evaluate(async () => {
    const response = await fetch("/api/candidates?page=1&pageSize=1", {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`加载候选人列表失败: ${response.status}`);
    }

    const payload = await response.json();
    const first = payload?.data?.items?.[0];
    if (!first?.id) {
      throw new Error("当前系统没有可用于详情页测试的候选人");
    }

    return {
      id: String(first.id),
      name: String(first.name ?? "候选人详情"),
    };
  });

  await gotoAuthenticated(page, `/candidates/${firstCandidate.id}`);
  await expect(page).toHaveURL(new RegExp(`/candidates/${firstCandidate.id}$`));
  return firstCandidate.name;
}
