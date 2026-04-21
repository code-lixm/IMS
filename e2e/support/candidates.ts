import type { Page, Route } from "@playwright/test";

const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
};

function fulfill(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      success: true,
      data,
    }),
  });
}

export async function mockAuthenticatedCandidatesPage(page: Page) {
  await page.route("**/api/auth/status", (route) =>
    fulfill(route, {
      status: "valid",
      user: {
        id: "user-1",
        name: "测试用户",
        email: "tester@example.com",
      },
      lastValidatedAt: Date.now(),
    }),
  );

  await page.route(/\/api\/candidates(?:\?.*)?$/, (route) =>
    fulfill(route, {
      items: [
        {
          id: "candidate-1",
          name: "张三",
          email: "zhangsan@example.com",
          phone: "13800000000",
          currentCompany: "示例科技",
          position: "前端工程师",
          applyPositionName: "前端工程师",
          organizationName: "产品研发部",
          orgAllParentName: "总部-技术中心-产品研发部",
          yearsOfExperience: 5,
          interviewTime: null,
          interviewPlace: null,
          interviewUrl: null,
          status: "new",
          source: "local",
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          latestResume: null,
          latestInterview: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
  );

  await page.route("**/api/import/batches", (route) => fulfill(route, { items: [] }));
  await page.route("**/api/sync/status", (route) =>
    fulfill(route, {
      enabled: false,
      intervalMs: 5000,
      lastSyncAt: Date.now(),
      lastError: null,
    }),
  );
}
