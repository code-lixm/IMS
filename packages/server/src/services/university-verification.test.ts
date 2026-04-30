import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  insertedRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => undefined,
        }),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        run: () => {
          mocks.insertedRows.push(row);
        },
      }),
    }),
    delete: () => ({
      where: () => ({
        run: () => undefined,
      }),
    }),
  },
}));

import { sanitizeSchoolQueryName, verifyCandidateSchools } from "./university-verification";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function requestSchoolName(input: RequestInfo | URL) {
  return new URL(String(input)).searchParams.get("daxue");
}

describe("university verification", () => {
  beforeEach(() => {
    mocks.fetchMock.mockReset();
    mocks.insertedRows.length = 0;
    vi.stubGlobal("fetch", mocks.fetchMock);
  });

  test("sanitizes punctuation and whitespace before querying external API", () => {
    expect(sanitizeSchoolQueryName("华北电力大学（保定）")).toBe("华北电力大学保定");
    expect(sanitizeSchoolQueryName("华北电力大学(保定)")).toBe("华北电力大学保定");
    expect(sanitizeSchoolQueryName("华北电力大学 - 保定校区")).toBe("华北电力大学保定校区");
    expect(sanitizeSchoolQueryName("北京大学")).toBe("北京大学");
  });

  test("treats school-not-found responses as not_found so location aliases can continue", async () => {
    mocks.fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const schoolName = requestSchoolName(input);
      if (schoolName === "华北电力大学保定校区") {
        return Promise.resolve(jsonResponse({
          code: 200,
          msg: "成功",
          data: {
            intro: "华北电力大学保定校区属于211,双一流学校。",
          },
        }));
      }

      return Promise.resolve(jsonResponse({
        code: 201,
        msg: "失败",
        data: "学校不存在",
      }));
    });

    const [result] = await verifyCandidateSchools(
      ["华北电力大学（保定） 本科 计算机科学与技术"],
      ["华北电力大学（保定）"],
      { forceRefresh: true },
    );

    const queriedNames = mocks.fetchMock.mock.calls.map(([input]) => requestSchoolName(input as RequestInfo | URL));

    expect(queriedNames).toEqual([
      "华北电力大学保定",
      "华北电力大学保定",
      "华北电力大学保定校区",
    ]);
    expect(queriedNames.every((name) => name && !/[\p{P}\p{S}\s]/u.test(name))).toBe(true);
    expect(result).toEqual(expect.objectContaining({
      schoolName: "华北电力大学（保定）",
      found: true,
      is211: true,
      isDoubleFirstClass: true,
      verdict: "verified",
    }));
    expect(mocks.insertedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schoolName: "华北电力大学（保定）",
        verdict: "not_found",
      }),
      expect.objectContaining({
        schoolName: "华北电力大学保定校区",
        verdict: "verified",
      }),
    ]));
  });
});
