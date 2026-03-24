import { afterEach, describe, expect, test } from "bun:test";
import { useAppNotifications } from "./use-app-notifications";

if (!("window" in globalThis)) {
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
  });
}

const notificationsApi = useAppNotifications();

afterEach(() => {
  notificationsApi.clear();
});

describe("useAppNotifications", () => {
  test("adds and dismisses notifications", () => {
    const id = notificationsApi.notifySuccess("已保存", { title: "成功", durationMs: 50_000 });

    expect(notificationsApi.notifications.value).toHaveLength(1);
    expect(notificationsApi.notifications.value[0]).toMatchObject({
      id,
      tone: "success",
      title: "成功",
      message: "已保存",
    });

    notificationsApi.dismiss(id);
    expect(notificationsApi.notifications.value).toHaveLength(0);
  });

  test("normalizes unknown errors through notifyError", () => {
    const normalized = notificationsApi.notifyError(new Error("failed"), { title: "出错了" });

    expect(normalized.title).toBe("出错了");
    expect(notificationsApi.notifications.value[0]?.tone).toBe("error");
    expect(notificationsApi.notifications.value[0]?.message).toBe("failed");
  });
});
