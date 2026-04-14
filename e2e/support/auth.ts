import type { Page, Route } from "@playwright/test";

const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
};

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      success: true,
      data: body,
    }),
  });
}

export async function mockUnauthenticatedSession(page: Page) {
  await page.route("**/api/auth/status", (route) =>
    fulfillJson(route, {
      status: "unauthenticated",
      user: null,
      lastValidatedAt: Date.now(),
    }),
  );
}

export async function mockLoginPageApis(page: Page) {
  await mockUnauthenticatedSession(page);

  await page.route("**/api/auth/baobao/qr", (route) =>
    fulfillJson(route, {
      provider: "baobao",
      imageSrc:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'%3E%3Crect width='240' height='240' fill='white'/%3E%3Crect x='24' y='24' width='64' height='64' fill='black'/%3E%3Crect x='152' y='24' width='64' height='64' fill='black'/%3E%3Crect x='24' y='152' width='64' height='64' fill='black'/%3E%3Crect x='108' y='108' width='24' height='24' fill='black'/%3E%3Crect x='144' y='108' width='24' height='24' fill='black'/%3E%3Crect x='108' y='144' width='24' height='24' fill='black'/%3E%3Crect x='144' y='144' width='24' height='24' fill='black'/%3E%3C/svg%3E",
      source: "element-screenshot",
      refreshed: false,
      fetchedAt: Date.now(),
    }),
  );

  await page.route("**/api/auth/baobao/login-status", (route) =>
    fulfillJson(route, {
      provider: "baobao",
      status: "pending",
      currentUrl: "https://example.test/login",
      lastCheckedAt: Date.now(),
      error: null,
      authenticated: false,
      user: null,
    }),
  );
}
